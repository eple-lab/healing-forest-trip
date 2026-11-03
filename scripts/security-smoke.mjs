/**
 * 로컬 시큐리티 스모크 테스트
 * ── 헤더, CSP, 소켓 오리진/쿠키 검증, 세션 만료 힌트, 공지 API 304 ──
 * 실행: node scripts/security-smoke.mjs
 */

import { io } from 'socket.io-client';

const BASE = 'http://localhost:3000';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function splitSetCookies(headers) {
  const getSetCookie = headers.getSetCookie?.bind(headers);
  if (typeof getSetCookie === 'function') return getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? raw.split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/g) : [];
}

async function loginGuest(nickname) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { Origin: BASE } });
  const csrfCookies = splitSetCookies(csrfRes.headers);
  const { csrfToken } = await csrfRes.json();

  const post = await fetch(`${BASE}/api/auth/callback/guest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      Cookie: csrfCookies.map((c) => c.split(';')[0]).join('; '),
      Origin: BASE,
    },
    body: new URLSearchParams({ csrfToken, nickname, callbackUrl: `${BASE}/forest`, json: 'true' }),
    redirect: 'manual',
  });
  const loginCookies = [...csrfCookies, ...splitSetCookies(post.headers)];
  const map = new Map();
  for (const c of loginCookies) map.set(c.split(';')[0].split('=')[0].trim(), c);
  return { status: post.status, cookies: [...map.values()].map((c) => c.split(';')[0]), rawSetCookie: splitSetCookies(post.headers) };
}

const connect = (cookie, origin) =>
  new Promise((resolve) => {
    const socket = io(BASE, {
      path: '/socket.io',
      transports: ['websocket'],
      extraHeaders: { ...(cookie ? { Cookie: cookie } : {}), Origin: origin },
      reconnection: false,
      timeout: 6000,
    });
    const done = (result) => {
      socket.close();
      resolve(result);
    };
    socket.on('connect', () => {
      socket.once('welcome', () => done({ ok: true }));
      setTimeout(() => done({ ok: false, reason: 'no_welcome' }), 3000);
    });
    socket.on('connect_error', (err) => done({ ok: false, reason: err.message }));
    setTimeout(() => done({ ok: false, reason: 'timeout' }), 6500);
  });

console.log('--- HTTP 보안 헤더 (/) ---');
const home = await fetch(BASE, { redirect: 'manual' });
const h = home.headers;
check('CSP 존재', Boolean(h.get('content-security-policy')));
check('default-src self', (h.get('content-security-policy') ?? '').includes("default-src 'self'"));
check('frame-ancestors none', (h.get('content-security-policy') ?? '').includes("frame-ancestors 'none'"));
check('X-Frame-Options DENY', h.get('x-frame-options') === 'DENY');
check('X-Content-Type-Options nosniff', h.get('x-content-type-options') === 'nosniff');
check('Referrer-Policy', (h.get('referrer-policy') ?? '').startsWith('strict-origin-when-cross-origin'));
check('COOP same-origin', h.get('cross-origin-opener-policy') === 'same-origin');
check('CORP same-origin', h.get('cross-origin-resource-policy') === 'same-origin');
check('Origin-Agent-Cluster', h.get('origin-agent-cluster') === '?1');
check('X-Permitted-Cross-Domain-Policies', h.get('x-permitted-cross-domain-policies') === 'none');
check('X-Powered-By 숨김', !h.get('x-powered-by'));

console.log('--- 인증 응답 no-store ---');
const sessionRes = await fetch(`${BASE}/api/auth/session`);
check('session Cache-Control no-store', (sessionRes.headers.get('cache-control') ?? '').includes('no-store'));
check('session Pragma no-cache', (sessionRes.headers.get('pragma') ?? '') === 'no-cache');

console.log('--- 공지 API ---');
const ann1 = await fetch(`${BASE}/api/announcements`);
const etag = ann1.headers.get('etag');
check('announcements 200', ann1.status === 200);
check('ETag 존재', Boolean(etag));
const ann2 = await fetch(`${BASE}/api/announcements`, { headers: { 'if-none-match': etag ?? '' } });
check('if-none-match → 304', ann2.status === 304);

console.log('--- 소켓 인증 ---');
const badOrigin = await connect('next-auth.session-token=invalid', 'https://evil.example.com');
check('악성 Origin 거부 (연결 자체 불가)', !badOrigin.ok, badOrigin.reason ?? '');
const badCookie = await connect('next-auth.session-token=invalid', BASE);
check('잘못된 세션 쿠키 거부', !badCookie.ok && badCookie.reason === 'unauthorized', badCookie.reason ?? '');

console.log('--- 게스트 로그인 + 세션 쿠키 ---');
const guest = await loginGuest('보안테스트');
const sessionCookie = guest.rawSetCookie.find((c) => c.startsWith('next-auth.session-token='));
check('게스트 로그인 200/302', guest.status === 200 || guest.status === 302, String(guest.status));
check('세션 쿠키 발급', Boolean(sessionCookie));
check('세션 쿠키에 Expires 없음', sessionCookie ? !/expires=/i.test(sessionCookie) : false);
const good = await connect(guest.cookies.join('; '), BASE);
check('유효한 세션으로 접속', good.ok === true);

console.log('--- 프로필 API ---');
const anon = await fetch(`${BASE}/api/profile/character`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
check('인증 없이 character 저장 불가', anon.status === 401);
const authed = await fetch(`${BASE}/api/profile/character`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Cookie: guest.cookies.join('; ') },
  body: JSON.stringify({ character: 'dog' }),
});
const authedBody = await authed.json().catch(() => ({}));
check('유효 세션은 200', authed.status === 200, `status=${authed.status} body=${JSON.stringify(authedBody)}`);
const invalidChar = await fetch(`${BASE}/api/profile/character`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Cookie: guest.cookies.join('; ') },
  body: JSON.stringify({ character: '<script>alert(1)</script>' }),
});
check('잘못된 character ID 거부', invalidChar.status === 400);

console.log(`\n실패: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
