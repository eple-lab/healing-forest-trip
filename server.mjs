/**
 * 숲속여행 커스텀 서버
 * ─────────────────────────────────────────────
 * Next.js(렌더링) + Socket.IO(실시간 산책/대화) + Neon Postgres 를
 * 하나의 프로세스에서 운영한다. (Render Web Service 배포 기준)
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import next from 'next';
import { Server } from 'socket.io';
import {
  cleanChatBody,
  cleanDisplayName,
  clamp,
  clientIp,
  colorFor,
  isFiniteNumber,
  originAllowed,
  parseCookies,
  POSES,
  safeAvatarUrl,
  TokenBucket,
} from './server/security.mjs';
import {
  addAudit,
  closePool,
  endVisit,
  getStats,
  getNoticeFingerprint,
  insertChat,
  isDbConfigured,
  loadFire,
  listAnnouncements,
  recentChat,
  saveFire,
  startNoticeListen,
  startVisit,
  upsertUser,
} from './server/db.mjs';

const require = createRequire(import.meta.url);
const WORLD = require('./shared/world.json');
const CHARACTERS = require('./shared/characters.json').characters;
const CHARACTER_IDS = new Set(CHARACTERS.map((c) => c.id));
const nextAuthJwt = require('next-auth/jwt');
const getToken = nextAuthJwt.getToken ?? nextAuthJwt.default?.getToken;

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT ?? 3000);
const hostname = '0.0.0.0';

/* ── 서버 유형(인스턴스)별 동시 접속 정원 ─────────────────
 * SERVER_TIER 로 인스턴스 크기를 지정한다.
 *   small  → 40명  (기본, 공유 CPU / 512MB~1GB)
 *   medium → 120명 (1 vCPU / 2GB 급)
 *   large  → 250명 (2 vCPU / 4GB 급)
 * MAX_PLAYERS 를 지정하면 SERVER_TIER 보다 우선한다.
 * 어떤 값이든 2~500명 범위로 제한한다(단일 인스턴스 보호).
 */
const RAW_TIER = String(process.env.SERVER_TIER ?? '').trim().toLowerCase();
const TIER_DEFAULTS = { small: 40, medium: 120, large: 250 };
const tierFallback = TIER_DEFAULTS[RAW_TIER];
if (RAW_TIER && tierFallback === undefined) {
  console.warn(`[env] SERVER_TIER="${RAW_TIER}" 은 small|medium|large 중 하나여야 합니다. 기본값을 사용합니다.`);
}
const tierDefault = tierFallback ?? WORLD.limits.maxPlayers;

function intFromEnv(name, fallback, { min, max }) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    console.warn(`[env] ${name} 값이 숫자가 아닙니다("${raw}"). 기본값(${fallback})을 사용합니다.`);
    return fallback;
  }
  const clamped = Math.min(max, Math.max(min, Math.floor(value)));
  if (clamped !== Math.floor(value)) {
    console.warn(`[env] ${name}=${value} 은 ${min}~${max} 범위를 벗어나 ${clamped} 로 제한했습니다.`);
  }
  return clamped;
}

const LIMITS = {
  ...WORLD.limits,
  maxPlayers: intFromEnv('MAX_PLAYERS', tierDefault, { min: 2, max: 500 }),
  maxConnectionsPerIp: intFromEnv('MAX_CONNECTIONS_PER_IP', WORLD.limits.maxConnectionsPerIp, {
    min: 1,
    max: 64,
  }),
};

const MOVE_VISIBLE_RANGE = intFromEnv('MOVE_VISIBLE_RANGE', 72, { min: 16, max: 200 });

// Render Web Service 는 외부 URL 을 RENDER_EXTERNAL_URL 로 제공한다.
// NEXTAUTH_URL 이 비어 있으면 그대로 사용해 리다이렉트/쿠키 설정이 어긋나지 않게 한다.
if (!process.env.NEXTAUTH_URL && process.env.RENDER_EXTERNAL_URL) {
  process.env.NEXTAUTH_URL = process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
}


/* ─────────────────────────────────────────────
 * 1. Next.js 준비 (여기서 .env 가 로드된다)
 * ───────────────────────────────────────────── */
const app = next({ dev, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();

validateEnv();

const allowedOrigins = buildAllowedOrigins();
if (allowedOrigins.size === 0) {
  console.warn('[security] 허용 오리진이 없습니다. NEXTAUTH_URL 또는 APP_ORIGIN 을 설정하세요.');
}

/* ─────────────────────────────────────────────
 * 2. 실시간 상태 (서버 권위)
 * ───────────────────────────────────────────── */
const players = new Map(); // socket.id → player
const connectionCountByIp = new Map();
const attemptBucketsByIp = new Map();
let chatHistory = [];
let statsCache = { at: 0, data: null };
let shuttingDown = false;

/* ── 입구 알림판 공지 ─────────────────────
 * Neon 콘솔/SQL 로 관리자가 공지를 바꾸면
 * LISTEN/NOTIFY → 즉시 전체 접속자에게 `notices:changed` 를 보낸다.
 * (pooled 연결이면 30초 폴링으로 대체)
 * 응답은 60초 캐시 + ETag 로 대역폭을 아낀다.
 */
const ANNOUNCEMENTS_TTL_MS = 60_000;
const NOTICE_POLL_MS = 30_000;
const FALLBACK_ANNOUNCEMENTS = [
  {
    id: 'welcome',
    title: '숲속여행에 오신 것을 환영합니다',
    body: '관리자가 공지를 등록하면 이 알림판에 표시됩니다. 브라우저를 닫으면 로그아웃되니 다시 오실 때는 로그인해 주세요.',
    category: 'update',
    pinned: true,
    publishedAt: '2026-11-03T00:00:00.000Z',
  },
];
let noticeSnapshot = {
  at: 0,
  items: FALLBACK_ANNOUNCEMENTS,
  json: '',
  etag: '',
  source: 'fallback',
};
let lastNoticeFp = null;
let noticeListener = null;
let noticePollTimer = null;

/* ── 이동 브로드캐스트 배치 ─────────────────────
 * 접속자가 늘어날수록 "모두에게 매 이동마다 전송"은 O(N²)이 된다.
 * - 100ms 마다 모아 한 번만 전송 (초당 최대 10회)
 * - 수신자와 72m 넘게 떨어진 플레이어는 건너뛴다
 * - volatile: 네트워크가 밀리면 오래된 위치 패킷은 버린다
 */
const MOVE_FLUSH_MS = 100;
const MOVE_VISIBLE_RANGE_SQ = MOVE_VISIBLE_RANGE * MOVE_VISIBLE_RANGE;
const moveQueue = new Set(); // socket.id
let moveTimer = null;

const fire = {
  logs: 2,
  intensity: 0.55,
  updatedAt: Date.now(),
};
let fireSaveTimer = null;

const MINUTE = 60_000;

/* ─────────────────────────────────────────────
 * 3. HTTP 서버 + Socket.IO
 * ───────────────────────────────────────────── */
const server = createServer((req, res) => {
  void handleHttp(req, res);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

const io = new Server(server, {
  path: '/socket.io',
  serveClient: false,
  maxHttpBufferSize: 16 * 1024,
  // 브라우저 강제 종료/전원 차단도 최대 ~20초 안에 감지해 접속자 목록에서 제거한다.
  // (Socket.IO 기본값 25s/20s → 12s/8s)
  pingInterval: 12_000,
  pingTimeout: 8_000,
  connectTimeout: 8_000,
  cors: {
    origin: Array.from(allowedOrigins),
    credentials: true,
    methods: ['GET', 'POST'],
  },
  allowRequest: (req, callback) => {
    const ok = originAllowed(req.headers.origin, allowedOrigins);
    callback(ok ? null : 'forbidden_origin', ok);
  },
});

/* ─────────────────────────────────────────────
 * 4. 소켓 인증 (NextAuth JWT 검증)
 * ───────────────────────────────────────────── */
io.use(async (socket, next) => {
  try {
    const origin = socket.handshake.headers.origin;
    if (!originAllowed(origin, allowedOrigins)) {
      return next(new Error('forbidden_origin'));
    }

    const ip = clientIp(socket.request);
    if (!takeConnectionAttempt(ip)) {
      audit(null, 'connection_rate_limited', { ipHash: hashIp(ip) });
      return next(new Error('rate_limited'));
    }

    if (!getToken) {
      console.error('[auth] next-auth/jwt getToken 을 불러오지 못했습니다.');
      return next(new Error('server_error'));
    }

    // NextAuth getToken 은 req.cookies 를 직접 읽는다.
    // Socket.IO 요청에는 쿠키 파서가 없으므로 여기서 채워 준다.
    socket.request.cookies = parseCookies(socket.handshake.headers.cookie);

    const token = await getToken({
      req: socket.request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token?.sub || typeof token.sub !== 'string') {
      return next(new Error('unauthorized'));
    }

    const activeForIp = connectionCountByIp.get(ip) ?? 0;
    if (activeForIp >= LIMITS.maxConnectionsPerIp) {
      return next(new Error('too_many_connections'));
    }
    if (players.size >= LIMITS.maxPlayers) {
      return next(new Error('room_full'));
    }

    const guest = token.guest === true;
    const displayName = cleanDisplayName(token.name);
    const image = safeAvatarUrl(token.picture);

    socket.data.ip = ip;
    socket.data.userId = token.sub;
    socket.data.player = {
      id: socket.id,
      userId: token.sub,
      name: displayName,
      image,
      guest,
      color: colorFor(token.sub),
      character: null,
      x: WORLD.start.x + (Math.random() * 2 - 1) * 1.4,
      y: 0,
      z: WORLD.start.z + (Math.random() * 2 - 1) * 1.4,
      rot: WORLD.start.yaw,
      pose: 'idle',
      blanket: false,
      zone: 'trail',
      joinedAt: Date.now(),
      distance: 0,
      visitId: null,
      lastMoveAt: 0,
      lastChatAt: 0,
      lastChatBody: '',
      moveBucket: new TokenBucket(45, 30),
      chatBucket: new TokenBucket(3, 0.32),
      fireBucket: new TokenBucket(1, 0.4),
      chatDenied: 0,
    };

    // IP 연결 수는 인증 성공 시점에만 집계
    connectionCountByIp.set(ip, activeForIp + 1);
    socket.data.counted = true;
    next();
  } catch (err) {
    console.warn('[socket] handshake error:', err?.message ?? 'unknown');
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  const player = socket.data.player;
  if (!player) {
    socket.disconnect(true);
    return;
  }
  players.set(socket.id, player);
  applyFireDecay();

  socket.emit('welcome', {
    self: publicPlayer(player),
    players: Array.from(players.values())
      .filter((p) => p.id !== socket.id)
      .map(publicPlayer),
    fire: publicFire(),
    chat: chatHistory.slice(-30),
    presence: presence(),
    now: Date.now(),
    serverId: process.env.RENDER_INSTANCE_ID ?? 'local',
  });
  socket.broadcast.emit('player:join', publicPlayer(player));
  broadcastPresence();

  // DB 저장은 접속을 막지 않는다.
  void persistJoin(socket, player);
  audit(player.userId, 'session_start', { guest: player.guest });

  socket.on('move', (payload) => {
    if (!player.moveBucket.take(1)) return;
    if (!payload || typeof payload !== 'object') return;

    const { x, z, y, rot, pose, blanket } = payload;
    if (!isFiniteNumber(x) || !isFiniteNumber(z) || !isFiniteNumber(y)) return;
    if (!isFiniteNumber(rot)) return;

    const nx = clamp(x, -WORLD.bounds.x, WORLD.bounds.x);
    const nz = clamp(z, WORLD.bounds.zMin, WORLD.bounds.zMax);
    const ny = clamp(y, -2, 12);
    const step = Math.hypot(nx - player.x, nz - player.z);
    if (step < 8) player.distance += step; // 순간이동 치트로 거리 부풀리기 방지

    player.x = nx;
    player.y = ny;
    player.z = nz;
    player.rot = Math.atan2(Math.sin(rot), Math.cos(rot));
    player.pose = POSES.has(pose) ? pose : 'idle';
    player.blanket = blanket === true;
    player.lastMoveAt = Date.now();

    const nextZone = zoneAt(nx, nz);
    if (nextZone !== player.zone) {
      player.zone = nextZone;
      broadcastPresence();
    }

    moveQueue.add(socket.id);
    if (!moveTimer) {
      moveTimer = setTimeout(flushMoves, MOVE_FLUSH_MS);
      moveTimer.unref?.();
    }
  });

  socket.on('profile:set', (payload) => {
    const raw = payload && typeof payload === 'object' ? payload.character : payload;
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!CHARACTER_IDS.has(id)) {
      socket.emit('profile:set:error', { reason: 'invalid_character' });
      return;
    }
    if (player.character === id) return;
    player.character = id;
    socket.emit('profile:set:ok', { character: id });
    socket.broadcast.emit('player:update', publicPlayer(player));
  });

  socket.on('chat:send', (payload) => {
    const text = payload && typeof payload === 'object' ? payload.text : payload;

    if (player.zone !== 'clearing') {
      player.chatDenied += 1;
      socket.emit('chat:denied', { reason: 'clearing_only' });
      if (player.chatDenied > 12) {
        audit(player.userId, 'chat_abuse', { denials: player.chatDenied });
        socket.disconnect(true);
      }
      return;
    }
    if (!player.chatBucket.take(1)) {
      socket.emit('chat:denied', { reason: 'rate_limited' });
      return;
    }
    const now = Date.now();
    if (now - player.lastChatAt < LIMITS.chatCooldownMs) {
      socket.emit('chat:denied', { reason: 'rate_limited' });
      return;
    }

    const body = cleanChatBody(text, LIMITS.chatMaxLength);
    if (!body) {
      socket.emit('chat:denied', { reason: 'invalid' });
      return;
    }
    if (body === player.lastChatBody && now - player.lastChatAt < 15_000) {
      socket.emit('chat:denied', { reason: 'duplicate' });
      return;
    }

    player.lastChatAt = now;
    player.lastChatBody = body;

    const message = {
      id: `live-${socket.id}-${now}`,
      userId: player.userId,
      name: player.name,
      body,
      at: new Date(now).toISOString(),
      guest: player.guest,
    };

    chatHistory.push(message);
    if (chatHistory.length > 60) chatHistory = chatHistory.slice(-60);

    for (const client of io.of('/').sockets.values()) {
      const p = client.data.player;
      if (p && p.zone === 'clearing') client.emit('chat:message', message);
    }

    void insertChat({
      userId: player.userId,
      name: player.name,
      body,
    }).catch((err) => console.warn('[db] chat insert failed:', err.code ?? err.message));
  });

  socket.on('fire:add', () => {
    if (player.zone !== 'cabin') return;
    if (!player.fireBucket.take(1)) return;
    applyFireDecay();
    if (fire.intensity >= 0.995) {
      socket.emit('fire:full');
      return;
    }
    fire.logs = Math.min(9, fire.logs + 1);
    fire.intensity = Math.min(1, fire.intensity + 0.22);
    fire.updatedAt = Date.now();
    io.emit('fire:state', publicFire());
    scheduleFireSave();
  });

  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    players.delete(socket.id);
    moveQueue.delete(socket.id);
    releaseConnectionIp(socket.data.ip, socket.data.counted);
    socket.broadcast.emit('player:leave', { id: socket.id });
    broadcastPresence();
    if (p) {
      void endVisit(p.visitId, p.zone, p.distance).catch((err) =>
        console.warn('[db] endVisit failed:', err.code ?? err.message),
      );
    }
  });
});

/* ─────────────────────────────────────────────
 * 5. HTTP 엔드포인트 (Next 앞단)
 * ───────────────────────────────────────────── */
async function handleHttp(req, res) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/healthz') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(
      JSON.stringify({
        ok: true,
        players: players.size,
        uptime: Math.round(process.uptime()),
        db: isDbConfigured(),
      }),
    );
    if (req.method === 'HEAD') return;
    return;
  }

  // ── 입구 알림판 공지 (ETag + 60초 캐시, If-None-Match 로 304 지원) ──
  if (url.pathname === '/api/announcements' && req.method === 'GET') {
    const snapshot = await getNoticeSnapshot();
    const baseHeaders = {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
      'x-content-type-options': 'nosniff',
      'x-announcements-source': snapshot.source,
    };
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === snapshot.etag) {
      res.writeHead(304, { ...baseHeaders, etag: snapshot.etag });
      res.end();
      return;
    }
    res.writeHead(200, { ...baseHeaders, etag: snapshot.etag });
    res.end(snapshot.json);
    return;
  }

  if (url.pathname === '/api/announcements' && req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET' });
    res.end();
    return;
  }

  if (url.pathname === '/api/stats' && req.method === 'GET') {
    try {
      if (!statsCache.data || Date.now() - statsCache.at > MINUTE) {
        statsCache = { at: Date.now(), data: await getStats() };
      }
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=30, s-maxage=60',
        'x-content-type-options': 'nosniff',
      });
      res.end(JSON.stringify(statsCache.data));
    } catch {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify({ totalVisits: 0, totalTravellers: 0, totalMessages: 0 }));
    }
    return;
  }

  if (isDbConfigured() && url.pathname === '/api/stats' && req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET' });
    res.end();
    return;
  }

  return handle(req, res);
}

/* ─────────────────────────────────────────────
 * 6. 헬퍼
 * ───────────────────────────────────────────── */
function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    image: p.image,
    guest: p.guest,
    color: p.color,
    character: p.character ?? null,
    x: p.x,
    y: p.y,
    z: p.z,
    rot: p.rot,
    pose: p.pose,
    blanket: p.blanket,
    zone: p.zone,
    joinedAt: p.joinedAt,
  };
}

function publicFire() {
  return {
    logs: fire.logs,
    intensity: Number(fire.intensity.toFixed(3)),
  };
}

function applyFireDecay() {
  const now = Date.now();
  const elapsed = (now - fire.updatedAt) / 1000;
  if (elapsed > 0) {
    fire.intensity = Math.max(0, fire.intensity - elapsed * 0.0025);
    if (fire.intensity === 0) fire.logs = 0;
    fire.updatedAt = now;
  }
}

function scheduleFireSave() {
  if (!isDbConfigured()) return;
  if (fireSaveTimer) clearTimeout(fireSaveTimer);
  fireSaveTimer = setTimeout(() => {
    fireSaveTimer = null;
    void saveFire(publicFire()).catch((err) =>
      console.warn('[db] saveFire failed:', err.code ?? err.message),
    );
  }, 4_000);
  fireSaveTimer.unref?.();
}

function presence() {
  let clearing = 0;
  let cabin = 0;
  let trail = 0;
  for (const p of players.values()) {
    if (p.zone === 'clearing') clearing++;
    else if (p.zone === 'cabin') cabin++;
    else trail++;
  }
  return {
    total: players.size,
    clearing,
    cabin,
    trail,
    max: LIMITS.maxPlayers,
  };
}

function broadcastPresence() {
  if (!shuttingDown) io.emit('presence', presence());
}

/**
 * 100ms 동안 모인 이동을 수신자별로 묶어 한 번에 보낸다.
 * 수신자 기준 72m 밖 플레이어는 보내지 않고, volatile 로 backpressure 시 폐기한다.
 */
function flushMoves() {
  moveTimer = null;
  if (moveQueue.size === 0) return;

  const dirty = [];
  for (const id of moveQueue) {
    const p = players.get(id);
    if (p) dirty.push(p);
  }
  moveQueue.clear();
  if (dirty.length === 0) return;

  for (const client of io.of('/').sockets.values()) {
    const me = client.data.player;
    if (!me) continue;

    const batch = [];
    for (const p of dirty) {
      if (p.id === client.id) continue;
      const dx = p.x - me.x;
      const dz = p.z - me.z;
      if (dx * dx + dz * dz > MOVE_VISIBLE_RANGE_SQ) continue;
      batch.push({
        id: p.id,
        x: p.x,
        y: p.y,
        z: p.z,
        rot: p.rot,
        pose: p.pose,
        blanket: p.blanket,
        zone: p.zone,
      });
    }

    if (batch.length > 0) client.volatile.emit('players:move', batch);
  }
}

/** 60초 캐시된 공지 JSON 을 반환한다. 변경 시에는 캐시를 무효화한다. */
async function getNoticeSnapshot() {
  if (noticeSnapshot.at > 0 && Date.now() - noticeSnapshot.at < ANNOUNCEMENTS_TTL_MS) {
    return noticeSnapshot;
  }

  let items, source;
  if (!isDbConfigured()) {
    items = FALLBACK_ANNOUNCEMENTS;
    source = 'fallback';
  } else {
    try {
      items = await listAnnouncements(10);
      source = 'db';
    } catch (err) {
      console.warn('[db] announcements failed:', err.code ?? err.message);
      items = FALLBACK_ANNOUNCEMENTS;
      source = 'fallback';
    }
  }

  const stable = JSON.stringify({ items });
  noticeSnapshot = {
    at: Date.now(),
    items,
    json: JSON.stringify({ items, fetchedAt: Date.now(), source }),
    etag: `"${createHash('sha1').update(stable).digest('hex')}"`,
    source,
  };
  return noticeSnapshot;
}

function invalidateAnnouncements() {
  noticeSnapshot = { ...noticeSnapshot, at: 0 };
}

/** 공지가 바뀌었다고 모든 접속자에게 알린다(내용 없이, 클라이언트가 스스로 다시 조회). */
function broadcastNoticesChanged(reason) {
  invalidateAnnouncements();
  if (!shuttingDown) io.emit('notices:changed', { reason: reason ?? 'changed' });
}

/** 폴링 기반 감지: LISTEN 이 없을 때를 위한 안전망 (30초). */
async function checkNoticeFingerprint() {
  if (!isDbConfigured()) return;
  try {
    const fp = await getNoticeFingerprint();
    const key = `${fp.n}:${fp.v}`;
    if (lastNoticeFp === null) {
      lastNoticeFp = key;
      return;
    }
    if (key !== lastNoticeFp) {
      lastNoticeFp = key;
      broadcastNoticesChanged('poll');
    }
  } catch (err) {
    console.warn('[notices] fingerprint check failed:', err?.code ?? err?.message ?? 'unknown');
  }
}

/** LISTEN(직결)으로 즉시 감지하고, 없으면 폴링만 돌린다. */
async function startNoticeWatch() {
  if (!isDbConfigured()) {
    console.log('[notices] DATABASE_URL 이 없어 기본 안내만 표시합니다.');
    return;
  }

  noticePollTimer = setInterval(() => {
    void checkNoticeFingerprint();
  }, NOTICE_POLL_MS);
  noticePollTimer.unref?.();
  // 폴링이 곧 변경을 감지한다. LISTEN 은 지연 없이 알리기 위한 보조 수단이다.
  await checkNoticeFingerprint();
  noticeListener = await startNoticeListen({
    onChange: () => {
      lastNoticeFp = null;
      broadcastNoticesChanged('notify');
    },
    onError: () => {
      // LISTEN 실패 시 30초 폴링이 대신 감지한다.
    },
  });
}

function zoneAt(x, z) {
  const c = WORLD.cabin;
  if (Math.abs(x - c.x) < c.halfW + 0.6 && Math.abs(z - c.z) < c.halfD + 0.6) return 'cabin';
  const cl = WORLD.clearing;
  if (Math.hypot(x - cl.x, z - cl.z) < cl.radius) return 'clearing';
  return 'trail';
}

function buildAllowedOrigins() {
  const set = new Set();
  const add = (value) => {
    if (!value) return;
    try {
      set.add(new URL(value).origin);
    } catch {
      /* 무시 */
    }
  };
  add(process.env.NEXTAUTH_URL);
  add(process.env.APP_ORIGIN);
  for (const item of (process.env.ALLOWED_ORIGINS ?? '').split(',')) add(item.trim());
  if (dev) {
    add(`http://localhost:${port}`);
    add(`http://127.0.0.1:${port}`);
  }
  return set;
}

async function persistJoin(socket, player) {
  if (!isDbConfigured()) return;
  try {
    const { visitCount } = await upsertUser({
      id: player.userId,
      provider: player.guest ? 'guest' : 'google',
      name: player.name,
      image: player.image,
    });
    player.visitId = await startVisit(player.userId);
    socket.emit('profile', { visitCount });
  } catch (err) {
    console.warn('[db] persistJoin failed:', err.code ?? err.message);
  }
}

function takeConnectionAttempt(ip) {
  let bucket = attemptBucketsByIp.get(ip);
  if (!bucket) {
    bucket = new TokenBucket(10, 0.15); // 분당 약 9회
    attemptBucketsByIp.set(ip, bucket);
  }
  if (attemptBucketsByIp.size > 5_000) attemptBucketsByIp.clear();
  return bucket.take(1);
}

function releaseConnectionIp(ip, counted) {
  if (!counted) return;
  const current = connectionCountByIp.get(ip) ?? 0;
  if (current <= 1) connectionCountByIp.delete(ip);
  else connectionCountByIp.set(ip, current - 1);
}

function hashIp(ip) {
  // 원본 IP 는 저장하지 않고, 운영 로그 상관관계용 짧은 해시만 남긴다.
  let h = 2166136261;
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function audit(actorId, action, detail) {
  if (!isDbConfigured()) return;
  void addAudit(actorId, action, detail).catch(() => {});
}

function validateEnv() {
  if (dev) return;
  const errors = [];
  const secret = process.env.NEXTAUTH_SECRET ?? '';
  if (secret.length < 32) errors.push('NEXTAUTH_SECRET 은 32자 이상이어야 합니다.');
  const authUrl = process.env.NEXTAUTH_URL ?? '';
  if (!authUrl) errors.push('NEXTAUTH_URL 이 필요합니다. (예: https://your-app.onrender.com)');
  else if (!authUrl.startsWith('https://')) errors.push('운영 환경의 NEXTAUTH_URL 은 https 여야 합니다.');
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    if (process.env.ALLOW_GUEST_LOGIN !== 'true') {
      errors.push('GOOGLE_CLIENT_ID/SECRET 이 없으면 ALLOW_GUEST_LOGIN=true 를 명시해야 합니다.');
    }
  }
  if (!isDbConfigured()) {
    console.warn('[env] DATABASE_URL 이 없습니다 → 방문/채팅/장작 상태가 저장되지 않습니다.');
  }
  if (errors.length > 0) {
    console.error('\n[환경 변수 오류] 운영 서버를 시작할 수 없습니다.');
    for (const e of errors) console.error(` - ${e}`);
    console.error('설정 방법은 docs/12-deployment.md 를 참고하세요.\n');
    process.exit(1);
  }
}

/* ─────────────────────────────────────────────
 * 7. 부팅 시 DB 상태 복원 + 주기 작업
 * ───────────────────────────────────────────── */
void (async () => {
  if (!isDbConfigured()) return;
  try {
    const saved = await loadFire();
    if (saved && typeof saved === 'object') {
      const elapsed = (Date.now() - new Date(saved.updatedAt ?? Date.now()).getTime()) / 1000;
      const intensity = Math.max(0, Number(saved.intensity ?? 0) - elapsed * 0.0025);
      fire.intensity = intensity;
      fire.logs = intensity > 0 ? clamp(Number(saved.logs ?? 0), 0, 9) : 0;
      fire.updatedAt = Date.now();
    }
    chatHistory = await recentChat(30);
    console.log(`[db] restored ${chatHistory.length} chat messages`);
  } catch (err) {
    console.warn('[db] restore failed:', err.code ?? err.message);
  }
})();

const presenceTimer = setInterval(broadcastPresence, 5_000);
presenceTimer.unref?.();

void startNoticeWatch().catch((err) =>
  console.warn('[notices] watch failed to start:', err?.message ?? 'unknown'),
);

/* ─────────────────────────────────────────────
 * 8. 시작 / 종료
 * ───────────────────────────────────────────── */
server.listen(port, hostname, () => {
  console.log(`\n🌲 숲속여행 서버가 열렸습니다  http://localhost:${port}`);
  console.log(`   mode=${dev ? 'development' : 'production'}  db=${isDbConfigured() ? 'on' : 'off'}`);
  console.log(`   tier=${RAW_TIER || 'default'}  capacity=${LIMITS.maxPlayers}명  moveVisibleRange=${MOVE_VISIBLE_RANGE}m`);
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[server] ${signal} 수신, 정리 중...`);
  clearInterval(presenceTimer);
  if (noticePollTimer) {
    clearInterval(noticePollTimer);
    noticePollTimer = null;
  }
  if (noticeListener) {
    await noticeListener.close().catch(() => {});
    noticeListener = null;
  }
  if (moveTimer) {
    clearTimeout(moveTimer);
    moveTimer = null;
  }
  if (fireSaveTimer) {
    clearTimeout(fireSaveTimer);
    if (isDbConfigured()) await saveFire(publicFire()).catch(() => {});
  }
  io.close();
  server.close();
  await closePool();
  setTimeout(() => process.exit(0), 300).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  console.error('[server] unhandledRejection:', err?.message ?? err);
});
