'use client';

/**
 * [FEAT-15] 개발 모드 전용 테스트 패널: 순간이동·시간 바꾸기.
 * 배포본(NODE_ENV=production)에서는 아무것도 그리지 않고 주소 옵션도 읽지 않는다.
 */

import { useEffect, useState } from 'react';
import { useClock, useGame } from '@/store/game';
import {
  DEV_TOOLS_ENABLED,
  SPAWN_TARGETS,
  applyDevParams,
  devTimeShiftMs,
  requestTeleport,
  setDevTime,
} from '@/lib/dev-tools';

const TIME_PRESETS: { label: string; value: string | null }[] = [
  { label: '아침', value: '07:30' },
  { label: '낮', value: '13:00' },
  { label: '저녁', value: '18:30' },
  { label: '밤', value: '22:00' },
  { label: '지금', value: null },
];

/** 서버와 맞춘 지금 시각(시간 바꾸기 전) */
const realNow = () => Date.now() + useGame.getState().serverOffset;

function DevPanelInner() {
  const [shifted, setShifted] = useState(false);

  useEffect(() => {
    applyDevParams(window.location.search, realNow());
    useClock.getState().setNow(realNow());
    setShifted(devTimeShiftMs() !== 0);
  }, []);

  const pickTime = (value: string | null) => {
    setDevTime(value, realNow());
    useClock.getState().setNow(realNow());
    setShifted(value !== null);
  };

  return (
    <div className="dev-panel glass" role="group" aria-label="개발 모드 테스트 도구">
      <span className="dev-panel-title">DEV</span>
      {SPAWN_TARGETS.map((t) => (
        <button key={t.id} type="button" onClick={() => requestTeleport(t.id)}>
          {t.label}
        </button>
      ))}
      <span className="dev-panel-sep" aria-hidden="true" />
      {TIME_PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => pickTime(p.value)}
          aria-pressed={p.value === null ? !shifted : undefined}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export function DevPanel() {
  return DEV_TOOLS_ENABLED ? <DevPanelInner /> : null;
}
