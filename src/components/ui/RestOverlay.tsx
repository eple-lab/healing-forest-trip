'use client';

import { useClock, useGame } from '@/store/game';
import { currentKoreaClock } from '@/lib/time';

export function RestOverlay() {
  const resting = useGame((s) => s.resting);
  const setResting = useGame((s) => s.setResting);
  const now = useClock((s) => s.now);
  if (!resting) return null;
  const clock = currentKoreaClock(now || Date.now());

  return (
    <div className="rest-overlay" role="dialog" aria-modal="true" aria-label="쉬는 중">
      <div className="rest-inner">
        <div className="rest-breath" aria-hidden="true">
          <span className="rest-ring rest-ring-1" />
          <span className="rest-ring rest-ring-2" />
          <span className="rest-core" />
        </div>
        <p className="rest-eyebrow">한국시간 {clock.label} · {clock.period}</p>
        <h2>잠시, 숨을 고릅니다</h2>
        <p className="rest-copy">
          들이쉬고, 천천히 내쉬어 보세요.
          <br />
          창밖의 숲은 당신이 쉬는 동안에도 조용히 흔들립니다.
        </p>
        <p className="rest-stat">
          지금 숲에 {useGame.getState().presence.total}명이 함께 있습니다.
        </p>
        <button type="button" className="start-btn rest-btn" onClick={() => setResting(false)}>
          <span>일어나기</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
