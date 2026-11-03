import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

type NextAuthRouteHandler = (
  request: Request,
  context: { params: { nextauth: string[] } },
) => Promise<Response>;

const nextAuthHandler = handler as unknown as NextAuthRouteHandler;

/**
 * NextAuth 는 세션 JWT 쿠키에 항상 `Expires`/`Max-Age`(기본 7일)를 붙인다.
 * 그러면 브라우저를 닫아도 로그인 상태가 남는다.
 *
 * 이 앱은 "브라우저를 닫거나 컴퓨터가 꺼지면 로그아웃"을 원하므로,
 * 세션 토큰 쿠키에서만 만료 속성을 제거해 브라우저 세션 쿠키로 발급한다.
 * (csrf/callback-url 쿠키는 그대로 둔다.)
 */
const SESSION_COOKIE = /^(?:__Secure-)?next-auth\.session-token(?:\.\d+)?=/i;

function stripSessionExpiry(cookie: string) {
  if (!SESSION_COOKIE.test(cookie)) return cookie;
  // Expires 값에는 콤마(Wed, 01 Jan ...)가 들어가므로 세미콜론 기준으로 잘라낸다.
  return cookie
    .replace(/;\s*expires=[^;]*/gi, '')
    .replace(/;\s*max-age=[^;]*/gi, '');
}

function readSetCookies(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === 'function') {
    return withGetSetCookie.getSetCookie();
  }
  // getSetCookie 가 없는 런타임 폴백: Expires 의 콤마를 피해서 분리한다.
  const raw = headers.get('set-cookie');
  return raw ? raw.split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/g) : [];
}

async function handle(request: Request, context: { params: { nextauth: string[] } }) {
  const response = await nextAuthHandler(request, context);
  const cookies = readSetCookies(response.headers);
  if (cookies.length === 0) return response;

  let changed = false;
  const rewritten = cookies.map((cookie) => {
    const next = stripSessionExpiry(cookie);
    if (next !== cookie) changed = true;
    return next;
  });
  if (!changed) return response;

  const headers = new Headers(response.headers);
  headers.delete('set-cookie');
  for (const cookie of rewritten) headers.append('set-cookie', cookie);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export { handle as GET, handle as POST };
