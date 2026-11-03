/**
 * Neon Postgres 연결 모듈
 * ─────────────────────────────────────────────
 * - DATABASE_URL 이 없으면 DB 없이도 앱이 동작합니다(개발/데모).
 * - 모든 쿼리는 파라미터 바인딩만 사용합니다.
 * - 풀은 globalThis 에 보관해 Next 라우트/소켓 서버가 같은 프로세스에서 공유합니다.
 */
import pg from 'pg';

const { Pool } = pg;
const POOL_KEY = Symbol.for('healing-forest.pg-pool');

export function isDbConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function buildSsl(connectionString) {
  if (!isDbConfigured()) return false;
  if (process.env.PG_NO_SSL === 'true') return false;
  const ca = process.env.DATABASE_SSL_CA;
  if (ca) {
    return { ca: ca.replace(/\\n/g, '\n'), rejectUnauthorized: true };
  }
  // Neon 은 TLS 필수. CA 를 지정하면 인증서까지 검증합니다.
  // (운영에서는 DATABASE_SSL_CA 설정을 강력히 권장)
  return { rejectUnauthorized: false };
}

export function getPool() {
  if (!isDbConfigured()) return null;
  if (!globalThis[POOL_KEY]) {
    globalThis[POOL_KEY] = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: buildSsl(process.env.DATABASE_URL),
      max: Number(process.env.PG_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      statement_timeout: 5_000,
      query_timeout: 6_000,
      application_name: 'healing-forest-trip',
      allowExitOnIdle: false,
    });
    globalThis[POOL_KEY].on('error', (err) => {
      console.error('[db] idle client error:', err.code ?? err.message);
    });
  }
  return globalThis[POOL_KEY];
}

export async function query(text, params = []) {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL_NOT_SET');
  return pool.query(text, params);
}

export async function closePool() {
  const pool = globalThis[POOL_KEY];
  if (pool) {
    globalThis[POOL_KEY] = null;
    await pool.end().catch(() => {});
  }
}

export async function upsertUser({ id, provider, name, image }) {
  const { rows } = await query(
    `INSERT INTO users (id, provider, name, image_url, last_seen_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           image_url = EXCLUDED.image_url,
           last_seen_at = now(),
           visit_count = users.visit_count + 1
     RETURNING visit_count`,
    [id, provider, name, image ?? null],
  );
  return { visitCount: rows[0]?.visit_count ?? 1 };
}

export async function startVisit(userId) {
  const { rows } = await query(
    `INSERT INTO visits (user_id) VALUES ($1) RETURNING id`,
    [userId],
  );
  return rows[0]?.id ?? null;
}

export async function endVisit(visitId, zone, distanceWalked) {
  if (!visitId) return;
  await query(
    `UPDATE visits
       SET left_at = now(), last_zone = $2, distance_walked = $3
     WHERE id = $1 AND left_at IS NULL`,
    [visitId, zone ?? null, Math.max(0, Math.min(100_000, distanceWalked || 0))],
  );
}

export async function insertChat({ userId, name, body }) {
  const { rows } = await query(
    `INSERT INTO chat_messages (user_id, display_name, body)
     VALUES ($1, $2, $3)
     RETURNING id, created_at`,
    [userId, name, body],
  );
  return rows[0] ?? null;
}

export async function recentChat(limit = 30) {
  const safeLimit = Math.max(1, Math.min(50, limit));
  const { rows } = await query(
    `SELECT id, user_id, display_name, body, created_at
       FROM chat_messages
      WHERE created_at > now() - interval '7 days'
      ORDER BY created_at DESC
      LIMIT $1`,
    [safeLimit],
  );
  return rows.reverse().map((r) => ({
    id: `db-${r.id}`,
    userId: r.user_id,
    name: r.display_name,
    body: r.body,
    at: new Date(r.created_at).toISOString(),
  }));
}

/** 입구 알림판 공지 (v1: 운영자가 DB 에 직접 작성, 앱에는 공개 쓰기 없음) */
export async function listAnnouncements(limit = 10) {
  if (!isDbConfigured()) return [];
  const safeLimit = Math.max(1, Math.min(20, limit));
  const { rows } = await query(
    `SELECT id, title, body, category, pinned, published_at
       FROM announcements
      WHERE is_published = TRUE
        AND published_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY pinned DESC, published_at DESC
      LIMIT $1`,
    [safeLimit],
  );
  return rows.map((r) => ({
    id: String(r.id),
    title: r.title,
    body: r.body,
    category: r.category,
    pinned: r.pinned === true,
    publishedAt: new Date(r.published_at).toISOString(),
  }));
}

/**
 * 공지 변경 감지용 지문. count + max(updated_at) 조합으로
 * INSERT/UPDATE/DELETE 를 모두 감지한다. (SELECT 만으로 충분)
 */
export async function getNoticeFingerprint() {
  const { rows } = await query(
    `SELECT count(*)::int AS n,
            COALESCE(EXTRACT(EPOCH FROM max(updated_at))::bigint, 0) AS v
       FROM announcements`,
  );
  return {
    n: rows[0]?.n ?? 0,
    v: Number(rows[0]?.v ?? 0),
  };
}

/**
 * PostgreSQL LISTEN/NOTIFY 로 공지 변경을 즉시 감지한다.
 * - pooled(PgBouncer) 연결은 LISTEN 을 지원하지 않으므로
 *   DATABASE_LISTEN_URL (직결) 을 쓰거나, 없으면 null 을 반환해 폴링으로 대체한다.
 * - 반환값은 listener.close() 함수다.
 */
export async function startNoticeListen({ onChange, onError } = {}) {
  const url = process.env.DATABASE_LISTEN_URL || process.env.DATABASE_URL;
  if (!url) return null;
  if (url.includes('-pooler')) {
    console.warn(
      '[notices] pooled 연결은 LISTEN/NOTIFY 를 지원하지 않습니다. DATABASE_LISTEN_URL(직결) 을 설정하거나 30초 폴링으로 동작합니다.',
    );
    return null;
  }

  const { Client } = pg;
  const client = new Client({
    connectionString: url,
    ssl: buildSsl(url),
    application_name: 'healing-forest-trip-notices',
  });
  client.on('notification', () => {
    try {
      onChange?.();
    } catch (err) {
      console.warn('[notices] onChange handler failed:', err?.message ?? 'unknown');
    }
  });
  client.on('error', (err) => {
    console.warn('[notices] listen connection error:', err.code ?? err.message);
    onError?.(err);
  });

  try {
    await client.connect();
    await client.query('LISTEN announcements_changed');
    console.log('[notices] LISTEN announcements_changed 시작');
    return { close: () => client.end().catch(() => {}) };
  } catch (err) {
    console.warn('[notices] LISTEN 시작 실패, 폴링으로 대체합니다:', err.code ?? err.message);
    onError?.(err);
    return null;
  }
}

/** 선택한 캐릭터(다른 기기/브라우저에서도 유지) */
export async function getCharacter(userId) {
  if (!isDbConfigured() || !userId) return null;
  const { rows } = await query(`SELECT character FROM users WHERE id = $1`, [userId]);
  return rows[0]?.character ?? null;
}

export async function setCharacter({ userId, provider, name, image, character }) {
  if (!isDbConfigured() || !userId) return { saved: false };
  const { rows } = await query(
    `INSERT INTO users (id, provider, name, image_url, character, last_seen_at, visit_count)
     VALUES ($1, $2, $3, $4, $5, now(), 1)
     ON CONFLICT (id) DO UPDATE
       SET character = EXCLUDED.character,
           name = EXCLUDED.name,
           image_url = EXCLUDED.image_url,
           last_seen_at = now()
     RETURNING character`,
    [userId, provider ?? 'guest', name ?? '나그네', image ?? null, character],
  );
  return { saved: Boolean(rows[0]?.character) };
}

export async function loadFire() {
  const { rows } = await query(
    `SELECT value FROM world_state WHERE key = 'cabin_fire'`,
  );
  return rows[0]?.value ?? null;
}

export async function saveFire(value) {
  await query(
    `INSERT INTO world_state (key, value, updated_at)
     VALUES ('cabin_fire', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(value)],
  );
}

export async function getStats() {
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM visits)             AS total_visits,
       (SELECT count(DISTINCT user_id)::int FROM visits) AS total_travellers,
       (SELECT count(*)::int FROM chat_messages)      AS total_messages`,
  );
  const row = rows[0] ?? {};
  return {
    totalVisits: row.total_visits ?? 0,
    totalTravellers: row.total_travellers ?? 0,
    totalMessages: row.total_messages ?? 0,
  };
}

export async function addAudit(actorId, action, detail = null) {
  await query(
    `INSERT INTO audit_events (actor_id, action, detail)
     VALUES ($1, $2, $3::jsonb)`,
    [actorId, action, detail ? JSON.stringify(detail) : null],
  );
}

/** 30일 지난 채팅, 90일 지난 방문 기록 정리 (개인정보 최소 보관) */
export async function pruneOldData() {
  const chat = await query(
    `DELETE FROM chat_messages WHERE created_at < now() - interval '30 days'`,
  );
  const visits = await query(
    `DELETE FROM visits WHERE left_at < now() - interval '90 days'`,
  );
  const audit = await query(
    `DELETE FROM audit_events WHERE created_at < now() - interval '180 days'`,
  );
  return {
    chatDeleted: chat.rowCount ?? 0,
    visitsDeleted: visits.rowCount ?? 0,
    auditDeleted: audit.rowCount ?? 0,
  };
}
