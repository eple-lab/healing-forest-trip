/** 서버 측 입력 정화 · 레이트 리밋 · 오리진 검증 유틸 */

const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g;
const PALETTE = [
  '#d98b6a', '#7fa88a', '#c9a86a', '#8a9fd1',
  '#c98aa6', '#9bb36b', '#c0a3d6', '#6fb3b3',
];

/** 코드포인트 기준으로 안전하게 자른다 (서로게이트 페어 깨짐 방지) */
export function cleanText(input, maxLength) {
  if (typeof input !== 'string') return '';
  const normalized = input
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(normalized).slice(0, maxLength).join('');
}

export function cleanDisplayName(input) {
  const name = cleanText(input, 24);
  return name.length > 0 ? name : '나그네';
}

export function cleanChatBody(input, maxLength) {
  const body = cleanText(input, maxLength);
  if (!body) return '';
  // 링크 도배 방지
  const links = body.match(/https?:\/\//gi);
  if (links && links.length > 2) return '';
  return body;
}

export function safeAvatarUrl(input) {
  if (typeof input !== 'string') return null;
  if (!/^https:\/\/(lh3|[a-z0-9-]+)\.googleusercontent\.com\//i.test(input)) return null;
  return input.slice(0, 512);
}

export function colorFor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(h) % PALETTE.length];
}

/** 토큰 버킷 (용량, 초당 보충량) */
export class TokenBucket {
  constructor(capacity, refillPerSecond) {
    this.capacity = capacity;
    this.refill = refillPerSecond;
    this.tokens = capacity;
    this.updated = Date.now();
  }

  take(amount = 1) {
    const now = Date.now();
    const elapsed = (now - this.updated) / 1000;
    this.updated = now;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refill);
    if (this.tokens < amount) return false;
    this.tokens -= amount;
    return true;
  }
}

/**
 * Cookie 헤더 파서.
 * Socket.IO handshake 의 `socket.request` 에는 Express 미들웨어가 없어
 * `req.cookies` 가 없다. NextAuth getToken 이 세션 쿠키를 읽을 수 있도록
 * 직접 파싱해 넣어 준다.
 */
export function parseCookies(header) {
  const cookies = {};
  if (typeof header !== 'string' || header.length === 0) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    let value = part.slice(index + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

export function clientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim().slice(0, 64) || 'unknown';
  }
  return (request.socket?.remoteAddress ?? 'unknown').slice(0, 64);
}

export function originAllowed(origin, allowedOrigins) {
  // 브라우저가 아닌 클라이언트는 Origin 을 보내지 않는다.
  // 어차피 세션 쿠키 검증을 통과해야 하므로 여기서는 통과시킨다.
  if (!origin) return true;
  try {
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export const POSES = new Set(['idle', 'walk', 'sit', 'lie']);
export const ZONES = new Set(['trail', 'clearing', 'cabin']);

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
