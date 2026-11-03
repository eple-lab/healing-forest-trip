'use client';

import { useEffect, useRef, useState } from 'react';
import { inputState } from '@/lib/input';
import { interactionBus } from '@/lib/interaction-bus';
import { useGame } from '@/store/game';

export function MobileControls() {
  const [enabled, setEnabled] = useState(false);
  const [sprint, setSprint] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const joystickRef = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  const lookPointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const interaction = useGame((s) => s.interaction);
  const chatOpen = useGame((s) => s.chatOpen);
  const helpOpen = useGame((s) => s.helpOpen);

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const update = () =>
      setEnabled(media.matches || window.innerWidth < 820);
    update();
    media.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => {
      media.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
      inputState.touchMoveX = 0;
      inputState.touchMoveY = 0;
      inputState.sprint = false;
    };
  }, []);

  useEffect(() => {
    inputState.sprint = sprint;
  }, [sprint]);

  if (!enabled) return null;

  const updateStick = (clientX: number, clientY: number) => {
    const element = joystickRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = rect.width / 2;
    let dx = (clientX - cx) / radius;
    let dy = (clientY - cy) / radius;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) {
      dx /= magnitude;
      dy /= magnitude;
    }
    if (magnitude < 0.14) {
      dx = 0;
      dy = 0;
    }
    setStick({ x: dx, y: dy });
    inputState.touchMoveX = dx;
    inputState.touchMoveY = -dy;
  };

  const resetStick = () => {
    stickPointer.current = null;
    setStick({ x: 0, y: 0 });
    inputState.touchMoveX = 0;
    inputState.touchMoveY = 0;
  };

  return (
    <div className={`mobile-controls ${chatOpen || helpOpen ? 'is-hidden' : ''}`}>
      <div
        className="look-pad"
        aria-hidden="true"
        onPointerDown={(event) => {
          lookPointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const pointer = lookPointer.current;
          if (!pointer || pointer.id !== event.pointerId) return;
          inputState.lookX += event.clientX - pointer.x;
          inputState.lookY += event.clientY - pointer.y;
          pointer.x = event.clientX;
          pointer.y = event.clientY;
        }}
        onPointerUp={() => {
          lookPointer.current = null;
        }}
        onPointerCancel={() => {
          lookPointer.current = null;
        }}
      />

      <div
        className="joystick"
        ref={joystickRef}
        onPointerDown={(event) => {
          stickPointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateStick(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (stickPointer.current !== event.pointerId) return;
          updateStick(event.clientX, event.clientY);
        }}
        onPointerUp={resetStick}
        onPointerCancel={resetStick}
        aria-label="이동 조이스틱"
      >
        <span
          className="joystick-stick"
          style={{ transform: `translate(${stick.x * 34}px, ${stick.y * 34}px)` }}
        />
      </div>

      <div className="mobile-actions">
        <button
          type="button"
          className={`mobile-btn ${sprint ? 'is-on' : ''}`}
          onPointerDown={(event) => {
            event.preventDefault();
            setSprint((value) => !value);
          }}
          aria-pressed={sprint}
        >
          달리기
        </button>
        <button
          type="button"
          className="mobile-btn primary"
          onPointerDown={(event) => {
            event.preventDefault();
            interactionBus.current?.();
          }}
          disabled={!interaction}
          aria-label={interaction?.label ?? '상호작용'}
        >
          <strong>E</strong>
          <span>{interaction ? '상호작용' : '둘러보기'}</span>
        </button>
      </div>
    </div>
  );
}
