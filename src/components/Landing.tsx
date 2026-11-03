'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signIn, signOut } from 'next-auth/react';
import { currentKoreaClock, timeGreeting, type KoreaClock } from '@/lib/time';

type Stats = {
  totalVisits: number;
  totalTravellers: number;
  totalMessages: number;
};

const AUTH_ERRORS: Record<string, string> = {
  OAuthSignin: 'Google 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  OAuthCallback: 'Google 로그인 응답을 확인하지 못했습니다. 다시 시도해 주세요.',
  OAuthCreateAccount: '계정을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.',
  AccessDenied: '로그인이 취소되었습니다.',
  Configuration: '로그인 설정에 문제가 있습니다. 운영자에게 알려 주세요.',
  Verification: '로그인 확인 링크가 만료되었습니다. 다시 시도해 주세요.',
  Default: '로그인 중 문제가 생겼습니다. 다시 시도해 주세요.',
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4.1H24v8.4h12.8c-.3 2.1-1.6 5.2-4.6 7.3l7.6 5.9c4.5-4.2 6.7-10.3 6.7-17.5z" />
      <path fill="#FBBC05" d="M10.3 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.8l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.9l-7.6-5.9c-2 1.4-4.8 2.4-8.2 2.4-6.4 0-11.8-3.7-13.7-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value);
}

export function Landing({
  sessionUser,
  googleEnabled,
  guestEnabled,
  error,
}: {
  sessionUser: { name: string; image: string | null } | null;
  googleEnabled: boolean;
  guestEnabled: boolean;
  error?: string;
}) {
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState<'google' | 'guest' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [clock, setClock] = useState<KoreaClock | null>(null);

  useEffect(() => {
    setClock(currentKoreaClock(Date.now()));
    const timer = window.setInterval(() => setClock(currentKoreaClock(Date.now())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats', { headers: { accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.totalVisits === 'number') setStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    setMessage(AUTH_ERRORS[error] ?? AUTH_ERRORS.Default);
  }, [error]);

  const loginWithGoogle = () => {
    setBusy('google');
    setMessage(null);
    void signIn('google', { callbackUrl: '/forest' });
  };

  const loginAsGuest = async () => {
    const cleaned = nickname.trim();
    if (Array.from(cleaned).length < 2) {
      setMessage('닉네임을 2자 이상 입력해 주세요.');
      return;
    }
    setBusy('guest');
    setMessage(null);
    try {
      const result = await signIn('guest', { nickname: cleaned, redirect: false });
      if (result?.ok) {
        window.location.href = '/forest';
        return;
      }
      setMessage(
        result?.error === 'CredentialsSignin'
          ? '닉네임을 다시 확인해 주세요. (2~16자)'
          : '게스트로 들어가지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    } catch {
      setMessage('게스트로 들어가지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="landing">
      <div className="landing-fx" aria-hidden="true">
        <span className="fx-glow fx-glow-1" />
        <span className="fx-glow fx-glow-2" />
        <span className="fx-glow fx-glow-3" />
        <span className="fx-mist" />
        <span className="fx-tree fx-tree-1" />
        <span className="fx-tree fx-tree-2" />
        <span className="fx-tree fx-tree-3" />
        <span className="fx-firefly fx-firefly-1" />
        <span className="fx-firefly fx-firefly-2" />
        <span className="fx-firefly fx-firefly-3" />
        <span className="fx-firefly fx-firefly-4" />
        <span className="fx-firefly fx-firefly-5" />
      </div>

      <nav className="landing-nav">
        <div className="landing-brand">
          <span className="landing-mark" aria-hidden="true">🌲</span>
          <span>
            <strong>숲속여행</strong>
            <em>healing forest trip</em>
          </span>
        </div>
        <div className="landing-clock">
          <span className="clock-dot" aria-hidden="true" />
          {clock ? (
            <>
              한국시간 {clock.label} · {timeGreeting(clock)}
            </>
          ) : (
            <>한국시간 확인 중</>
          )}
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="hero-eyebrow">여럿이지만, 조용한 숲</p>
          <h1>
            걸어서 만나는
            <br />
            <span>작은 숲과 오두막</span>
          </h1>
          <p className="hero-lead">
            산길 초입에서 시작해 숲의 빈터에서 이야기를 나누고,
            <br className="desktop-break" />
            오솔길 끝 2층 오두막의 벽난로 곁에서 쉬어 가세요.
            <br className="desktop-break" />
            한국 시간의 해와 달이 천천히 당신과 함께 움직입니다.
          </p>

          <div className="hero-badges">
            <span>1인칭 산책</span>
            <span>실시간 멀티플레이어</span>
            <span>외부 음원 없는 숲소리</span>
            <span>Google 로그인</span>
          </div>

          <div className="hero-stats">
            <div>
              <strong>{stats ? formatNumber(stats.totalTravellers) : '—'}</strong>
              <span>함께한 나그네</span>
            </div>
            <div>
              <strong>{stats ? formatNumber(stats.totalVisits) : '—'}</strong>
              <span>숲에 든 발걸음</span>
            </div>
            <div>
              <strong>{stats ? formatNumber(stats.totalMessages) : '—'}</strong>
              <span>빈터의 이야기</span>
            </div>
          </div>
        </div>

        <div className="auth-card glass">
          {sessionUser ? (
            <>
              <p className="auth-eyebrow">다시, 숲으로</p>
              <div className="auth-user">
                {sessionUser.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sessionUser.image} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="auth-avatar">{sessionUser.name.slice(0, 1)}</span>
                )}
                <div>
                  <strong>{sessionUser.name}</strong>
                  <span>오늘도 천천히 걸어 보세요.</span>
                </div>
              </div>
              <Link className="btn-primary" href="/forest">
                산책 이어가기
              </Link>
              <button type="button" className="btn-ghost" onClick={() => signOut({ callbackUrl: '/' })}>
                로그아웃
              </button>
            </>
          ) : (
            <>
              <p className="auth-eyebrow">숲으로 들어가기</p>
              <h2>당신의 산책을 시작하세요</h2>
              <p className="auth-desc">
                로그인하면 같은 시간, 같은 숲에서 다른 나그네와 마주칠 수 있습니다.
              </p>

              {googleEnabled && (
                <button
                  type="button"
                  className="btn-google"
                  onClick={loginWithGoogle}
                  disabled={busy !== null}
                >
                  <GoogleMark />
                  <span>{busy === 'google' ? 'Google로 이동 중…' : 'Google로 시작하기'}</span>
                </button>
              )}

              {googleEnabled && guestEnabled && (
                <div className="auth-divider">
                  <span>또는</span>
                </div>
              )}

              {guestEnabled && (
                <div className="guest-form">
                  <label htmlFor="nickname">게스트 닉네임</label>
                  <div className="guest-row">
                    <input
                      id="nickname"
                      value={nickname}
                      onChange={(event) =>
                        setNickname(Array.from(event.target.value).slice(0, 16).join(''))
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void loginAsGuest();
                      }}
                      placeholder="숲에서 불릴 이름"
                      maxLength={16}
                      autoComplete="off"
                      disabled={busy !== null}
                    />
                    <button
                      type="button"
                      className="btn-primary compact"
                      onClick={() => void loginAsGuest()}
                      disabled={busy !== null || nickname.trim().length < 2}
                    >
                      {busy === 'guest' ? '들어가는 중…' : '들어가기'}
                    </button>
                  </div>
                  <p className="guest-note">
                    게스트는 매번 새 익명 이름으로 참여하며, 이메일을 수집하지 않습니다.
                  </p>
                </div>
              )}

              {!googleEnabled && !guestEnabled && (
                <p className="auth-warning">
                  지금은 로그인을 사용할 수 없습니다. 운영자에게 문의해 주세요.
                </p>
              )}

              {message && (
                <p className="auth-message" role="alert">
                  {message}
                </p>
              )}

              <p className="auth-privacy">
                Google 로그인은 이름과 프로필 사진만 사용합니다. 이메일은 저장하지 않으며,
                채팅 기록은 30일 뒤 자동으로 정리됩니다.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="landing-features" aria-labelledby="features-title">
        <h2 id="features-title">숲에서 만나는 네 가지 순간</h2>
        <div className="feature-grid">
          <article>
            <span className="feature-icon">🌿</span>
            <h3>산길을 걷다</h3>
            <p>
              이끼 낀 나무와 바람 소리 사이를 천천히 걷습니다. 잘린 나무 밑동에 앉아
              숨을 고를 수도 있어요.
            </p>
          </article>
          <article>
            <span className="feature-icon">🔥</span>
            <h3>빈터에서 만나다</h3>
            <p>
              나무로 둘러싸인 넓은 빈터에는 모닥불과 통나무 벤치가 있습니다. 같은 시간
              숲에 있는 사람들과 짧은 이야기를 나눠 보세요.
            </p>
          </article>
          <article>
            <span className="feature-icon">🪵</span>
            <h3>불을 지피다</h3>
            <p>
              오두막 밖 장작더미에서 장작을 주워 벽난로에 넣으면 불꽃이 커집니다. 흔들의자에
              앉아 무릎담요를 덮고 쉬어 가세요.
            </p>
          </article>
          <article>
            <span className="feature-icon">🌙</span>
            <h3>창밖의 시간을 보다</h3>
            <p>
              2층 침대에 눕거나 큰 창가에 앉아 한국 시간의 해와 달, 지나가는 새를 바라봅니다.
              밤에는 반딧불이 숲을 떠다닙니다.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-trail" aria-labelledby="trail-title">
        <h2 id="trail-title">걸어가는 길</h2>
        <ol>
          <li>
            <span className="trail-index">01</span>
            <div>
              <strong>산길 초입</strong>
              <p>표지판을 지나 완만한 흙길을 걷습니다. 새소리와 발소리가 먼저 반겨 줍니다.</p>
            </div>
          </li>
          <li>
            <span className="trail-index">02</span>
            <div>
              <strong>숲의 빈터</strong>
              <p>모닥불과 벤치가 있는 넓은 쉼터. 이곳에서만 대화가 열립니다.</p>
            </div>
          </li>
          <li>
            <span className="trail-index">03</span>
            <div>
              <strong>숲속 오두막</strong>
              <p>오솔길을 지나면 2층 오두막. 주방의 커피와 벽난로, 큰 창의 밤하늘이 기다립니다.</p>
            </div>
          </li>
        </ol>
      </section>

      <footer className="landing-footer">
        <div>
          <strong>숲속여행</strong>
          <span>조용한 멀티플레이어 산책 · 대한민국 어딘가의 숲</span>
        </div>
        <p>
          소리는 브라우저에서 실시간으로 합성되며, 위치·채팅은 서버에서 검증합니다.
          <br />
          광고도, 추적도, 이메일 수집도 없습니다.
        </p>
      </footer>
    </main>
  );
}
