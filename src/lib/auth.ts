import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { randomUUID } from 'node:crypto';

/** Google OAuth 설정이 있으면 구글 로그인을 켠다. */
export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

/**
 * 게스트 로그인은 "구글 설정이 없을 때" 기본으로 열린다.
 * 운영에서 게스트를 허용하려면 ALLOW_GUEST_LOGIN=true 를 명시한다.
 */
export const guestEnabled =
  process.env.ALLOW_GUEST_LOGIN === 'true' || !googleEnabled;

const NAME_MAX = 16;
const NAME_MIN = 2;

/** 닉네임/실명에서 제어문자와 보이지 않는 문자를 제거한다. */
export function sanitizeNickname(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
  if (cleaned.length < NAME_MIN) return null;
  return cleaned;
}

const authSecret = process.env.NEXTAUTH_SECRET;

if (process.env.NODE_ENV === 'production' && (!authSecret || authSecret.length < 32)) {
  // 빌드 타임에는 throw하지 않고, 요청 시 NextAuth가 실패하도록 둔다.
  console.warn(
    '[auth] NEXTAUTH_SECRET 이 없거나 32자 미만입니다. 운영 배포 전에 반드시 설정하세요.',
  );
}

export const authOptions: NextAuthOptions = {
  secret: authSecret,
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 7, // 7일
    updateAge: 60 * 60, // 1시간마다 갱신
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  useSecureCookies: process.env.NEXTAUTH_URL?.startsWith('https://') ?? false,
  providers: [
    ...(googleEnabled
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
              params: {
                prompt: 'select_account',
                access_type: 'online',
                scope: 'openid email profile',
              },
            },
          }),
        ]
      : []),
    ...(guestEnabled
      ? [
          CredentialsProvider({
            id: 'guest',
            name: '게스트',
            credentials: {
              nickname: { label: '닉네임', type: 'text' },
            },
            async authorize(credentials) {
              if (!guestEnabled) return null;
              const nickname = sanitizeNickname(credentials?.nickname);
              if (!nickname) {
                throw new Error('닉네임은 2~16자로 입력해 주세요.');
              }
              // 게스트는 매번 새 익명 id를 받는다 (타인 사칭/추적 방지)
              return {
                id: `guest:${randomUUID()}`,
                name: nickname,
                email: null,
                image: null,
              };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.name = user.name;
        token.picture = user.image ?? null;
        token.guest = user.id.startsWith('guest:');
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = (token.name as string) ?? '나그네';
        session.user.image = (token.picture as string | null) ?? null;
        session.user.id = token.sub ?? '';
        session.user.isGuest = token.guest === true;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // 오픈 리다이렉트 방지: 같은 오리진만 허용
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      try {
        const target = new URL(url);
        if (target.origin === baseUrl) return url;
      } catch {
        /* 무시 */
      }
      return `${baseUrl}/forest`;
    },
  },
  debug: false,
};
