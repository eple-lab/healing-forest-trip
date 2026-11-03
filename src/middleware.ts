import { NextResponse, type NextRequest } from 'next/server';

const isDev = process.env.NODE_ENV !== 'production';

/* ── 같은 인스턴스 내 간단한 레이트 리밋 (로그인 시도 남용 방지) ── */
const AUTH_WINDOW_MS = 10 * 60 * 1000; // 10분
const AUTH_LIMIT = 60; // IP 당 로그인/콜백 요청 최대 횟수
const authAttempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return 'unknown';
}

function limited(key: string, limit: number) {
  const now = Date.now();
  if (authAttempts.size > 5_000) {
    for (const [k, bucket] of authAttempts) {
      if (bucket.resetAt <= now) authAttempts.delete(k);
    }
  }
  const bucket = authAttempts.get(key);
  if (!bucket || bucket.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

function tooManyRequests() {
  return new NextResponse('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', {
    status: 429,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'retry-after': '600',
      'cache-control': 'no-store, must-revalidate',
      'x-content-type-options': 'nosniff',
    },
  });
}

/**
 * 요청마다 nonce 를 만들어 CSP 를 적용한다.
 * Next.js 는 요청 헤더의 CSP(nonce 포함)를 읽어 자체 스크립트에 nonce 를 붙인다.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/api/auth/callback') ||
    pathname === '/api/auth/signin'
  ) {
    if (limited(`auth:${clientIp(request)}`, AUTH_LIMIT)) {
      return tooManyRequests();
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const host = (request.headers.get('host') ?? '').replace(/[^a-zA-Z0-9.:-]/g, '');
  const wsOrigin = host ? `wss://${host} ws://${host}` : '';

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    isDev ? "'unsafe-eval'" : '',
  ]
    .filter(Boolean)
    .join(' ');

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://lh3.googleusercontent.com https://*.googleusercontent.com",
    "font-src 'self' data:",
    `connect-src 'self' ${wsOrigin} ${isDev ? 'ws: http://localhost:*' : ''}`.trim(),
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    isDev ? '' : 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set('Origin-Agent-Cluster', '?1');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  if (!isDev) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)',
  ],
};
