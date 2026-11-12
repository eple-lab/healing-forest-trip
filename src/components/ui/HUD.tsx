'use client';

import { useEffect, useState } from 'react';
import { useClock, useGame } from '@/store/game';
import { currentKoreaClock, timeGreeting } from '@/lib/time';
import { interactionBus } from '@/lib/interaction-bus';

const ZONE_LABEL: Record<string, string> = {
  trail: '산길',
  clearing: '숲의 빈터',
  cabin: '오두막',
};

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5h16v10H9.4L5.6 19v-3.5H4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
function IconHelp() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.6 9.4c0-1.4 1.1-2.3 2.5-2.3 1.5 0 2.5.9 2.5 2.2 0 1.1-.6 1.6-1.6 2.2-.8.5-1 .9-1 1.6v.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}
function IconSound({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 9.5h3l4-3.2v11.4l-4-3.2h-3z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      {muted ? (
        <path d="M16 9.8l4 4.4M20 9.8l-4 4.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      ) : (
        <>
          <path d="M15.4 9.2c1.3 1.4 1.3 4.2 0 5.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M17.8 7.2c2.2 2.5 2.2 7.1 0 9.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function HUD() {
  const now = useClock((s) => s.now);
  const zone = useGame((s) => s.zone);
  const presence = useGame((s) => s.presence);
  const connection = useGame((s) => s.connection);
  const muted = useGame((s) => s.muted);
  const interaction = useGame((s) => s.interaction);
  const chatOpen = useGame((s) => s.chatOpen);
  const unreadChat = useGame((s) => s.unreadChat);
  const user = useGame((s) => s.user);
  const visitCount = useGame((s) => s.visitCount);
  const warmFlash = useGame((s) => s.warmFlash);
  const toggleMuted = useGame((s) => s.toggleMuted);
  const setChatOpen = useGame((s) => s.setChatOpen);
  const setHelpOpen = useGame((s) => s.setHelpOpen);
  const [warm, setWarm] = useState(false);

  // now === 0 이면 아직 시각을 받지 않은 상태다. SSR 과 hydration 이 일치하도록
  // Date.now() 로 대체하지 않고 자리표시자를 보여 준다.
  const clock = now ? currentKoreaClock(now) : null;

  useEffect(() => {
    if (!useClock.getState().now) {
      useClock.getState().setNow(Date.now() + useGame.getState().serverOffset);
    }
  }, []);

  useEffect(() => {
    if (!warmFlash) return;
    setWarm(true);
    const timer = window.setTimeout(() => setWarm(false), 1400);
    return () => window.clearTimeout(timer);
  }, [warmFlash]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      }
      if (event.code === 'KeyH') {
        setHelpOpen(!useGame.getState().helpOpen);
      }
      if (event.code === 'KeyM') {
        toggleMuted();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setHelpOpen, toggleMuted]);

  return (
    <div className="hud">
      <div className={`warm-flash ${warm ? 'is-on' : ''}`} aria-hidden="true" />

      <header className="hud-top">
        <div className="hud-brand glass">
          <div className="brand-leaf" aria-hidden="true">
            🌲
          </div>
          <div>
            <strong>숲속여행</strong>
            <span className="brand-sub">
              {clock ? `${timeGreeting(clock)} · 한국시간 ${clock.label}` : '한국시간 확인 중'}
            </span>
          </div>
        </div>

        <div className="hud-actions glass">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setChatOpen(!chatOpen)}
            aria-label="대화 열기"
            title="대화 (Enter)"
          >
            <IconChat />
            {unreadChat > 0 && !chatOpen && (
              <span className="badge">{unreadChat > 9 ? '9+' : unreadChat}</span>
            )}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleMuted}
            aria-label={muted ? '소리 켜기' : '소리 끄기'}
            title="소리 (M)"
          >
            <IconSound muted={muted} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setHelpOpen(true)}
            aria-label="도움말"
            title="도움말 (H)"
          >
            <IconHelp />
          </button>
        </div>
      </header>

      <div className="hud-meta glass">
        <span className={`status-dot status-${connection}`} aria-hidden="true" />
        <span>
          {connection === 'online'
            ? '숲과 연결됨'
            : connection === 'connecting'
              ? '숲으로 연결 중'
              : '연결이 끊겼습니다'}
        </span>
        <span className="meta-divider" />
        <span className="zone-chip">{ZONE_LABEL[zone] ?? '산길'}</span>
        <span className="meta-divider" />
        <span title="지금 숲에 있는 사람">
          지금 {presence.total}명
          <span className="presence-detail">
            {' '}
            (빈터 {presence.clearing} · 오두막 {presence.cabin})
          </span>
        </span>
      </div>

      <div className="hud-user glass">
        <span className="user-name">
          {user?.name ?? '나그네'}
          {user?.isGuest && <span className="guest-chip">게스트</span>}
        </span>
        {typeof visitCount === 'number' && (
          <span className="user-visits">{visitCount}번째 산책</span>
        )}
      </div>

      {interaction && !chatOpen && (
        <div className="interaction-prompt">
          <button
            type="button"
            className="interaction-key"
            onClick={() => interactionBus.current?.()}
            aria-label={interaction.label}
          >
            E
          </button>
          <div className="interaction-text">
            <strong>{interaction.label}</strong>
            {interaction.hint && <span>{interaction.hint}</span>}
          </div>
        </div>
      )}

      <div className="controls-hint">
        <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 걷기
        <span>·</span>
        <kbd>Shift</kbd> 달리기
        <span>·</span>
        마우스·<kbd>←</kbd><kbd>→</kbd> 시점
        <span>·</span>
        <kbd>E</kbd> 상호작용
        <span>·</span>
        <kbd>Enter</kbd> 대화
        <span>·</span>
        <kbd>H</kbd> 도움말
      </div>
    </div>
  );
}
