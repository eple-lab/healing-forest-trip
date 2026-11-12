'use client';

// [FEAT-07] 오른쪽 위 고정 2D 지도.
// 아래 캔버스: 길·장소(처음 한 번, 흐림 상태가 바뀔 때만) / 위 캔버스: 내 화살표(100ms 마다).
// 지도는 나를 따라 움직이지 않고, 위 = 북쪽(-z) · 오른쪽 = 동쪽(+x) 이다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { playerState } from '@/lib/player-state';
import { CABIN, CLEARING, LOOP, START, TRAILS, type PathSample } from '@/lib/world';
import { headingAngle, isFarOutsideLoop, mapHeight, mapScale, worldToMap } from '@/lib/minimap';

const STORAGE_KEY = 'forest-minimap-open';
const LOOP_SAMPLES = TRAILS.find((trail) => trail.id === 'loop')?.samples ?? [];

function IconMap() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3.5 6.6 9 4.5l6 2.1 5.5-2.1v13l-5.5 2.1-6-2.1-5.5 2.1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 4.5v13M15 6.6v13" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** 캔버스 실제 크기를 devicePixelRatio 만큼 키우고 CSS 좌표계로 그리게 준비한다. */
function prepareCanvas(
  canvas: HTMLCanvasElement | null,
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  samples: PathSample[],
  closed: boolean,
  width: number,
  color: string,
  lineWidth: number,
) {
  if (samples.length === 0) return;
  ctx.beginPath();
  samples.forEach((sample, index) => {
    const { px, py } = worldToMap(sample.x, sample.z, width);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  if (closed) ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawPlaces(ctx: CanvasRenderingContext2D, width: number) {
  const scale = mapScale(width);

  const clearing = worldToMap(CLEARING.x, CLEARING.z, width);
  ctx.beginPath();
  ctx.arc(clearing.px, clearing.py, CLEARING.radius * scale, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(143, 178, 122, 0.36)';
  ctx.fill();

  const cabin = worldToMap(CABIN.x - CABIN.halfW, CABIN.z - CABIN.halfD, width);
  ctx.fillStyle = 'rgba(196, 155, 102, 0.78)';
  ctx.fillRect(cabin.px, cabin.py, CABIN.halfW * 2 * scale, CABIN.halfD * 2 * scale);
  ctx.strokeStyle = 'rgba(30, 24, 16, 0.55)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(cabin.px, cabin.py, CABIN.halfW * 2 * scale, CABIN.halfD * 2 * scale);
}

function drawStart(ctx: CanvasRenderingContext2D, width: number) {
  const start = worldToMap(START.x, START.z, width);
  ctx.beginPath();
  ctx.arc(start.px, start.py, width > 100 ? 2.8 : 2.2, 0, Math.PI * 2);
  ctx.fillStyle = '#f3d3a8';
  ctx.strokeStyle = 'rgba(18, 24, 16, 0.9)';
  ctx.lineWidth = 1;
  ctx.fill();
  ctx.stroke();
}

function drawPlaceNames(ctx: CanvasRenderingContext2D, width: number) {
  const clampX = (x: number, pad: number) => Math.min(width - pad, Math.max(pad, x));
  ctx.save();
  ctx.font = '600 8px "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(242, 246, 235, 0.92)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 3;

  const start = worldToMap(START.x, START.z, width);
  ctx.textBaseline = 'bottom';
  ctx.fillText('산길 초입', clampX(start.px, 24), start.py - 6);

  const clearing = worldToMap(CLEARING.x, CLEARING.z, width);
  ctx.textBaseline = 'middle';
  ctx.fillText('숲의 빈터', clampX(clearing.px, 24), clearing.py);

  const cabin = worldToMap(CABIN.x, CABIN.z, width);
  const cabinBottom = cabin.py + CABIN.halfD * mapScale(width);
  ctx.textBaseline = 'top';
  ctx.fillText('오두막', clampX(cabin.px, 18), cabinBottom + 3);
  ctx.restore();
}

function drawBase(ctx: CanvasRenderingContext2D, width: number, farOutside: boolean) {
  const innerAlpha = farOutside ? 0.25 : 1;

  ctx.save();
  ctx.globalAlpha = innerAlpha;
  drawPlaces(ctx, width);
  for (const trail of TRAILS) {
    if (trail.id === 'loop') continue;
    drawTrail(ctx, trail.samples, trail.closed, width, 'rgba(226, 205, 166, 0.62)', 1.4);
  }
  ctx.restore();

  // 원형 길은 멀어져도 또렷하게 남긴다.
  const loop = TRAILS.find((trail) => trail.id === 'loop');
  if (loop) drawTrail(ctx, loop.samples, true, width, 'rgba(233, 180, 122, 0.92)', 2.2);

  ctx.save();
  ctx.globalAlpha = innerAlpha;
  drawStart(ctx, width);
  if (width > 100) drawPlaceNames(ctx, width);
  ctx.restore();
}

function drawPlayerArrow(ctx: CanvasRenderingContext2D, width: number) {
  const { px, py } = worldToMap(playerState.x, playerState.z, width);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(headingAngle(playerState.yaw));
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4, 4.6);
  ctx.lineTo(0, 2.8);
  ctx.lineTo(-4, 4.6);
  ctx.closePath();
  ctx.fillStyle = '#f6e7b8';
  ctx.strokeStyle = 'rgba(24, 32, 22, 0.92)';
  ctx.lineWidth = 1.2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function MiniMap() {
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(140);
  const [farOutside, setFarOutside] = useState(false);
  const openRef = useRef(true);
  const farRef = useRef(false);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<HTMLCanvasElement | null>(null);
  const height = mapHeight(width);

  const applyOpen = useCallback((next: boolean) => {
    openRef.current = next;
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* 시크릿 모드 등 저장할 수 없어도 지도는 그대로 열고 닫는다. */
    }
  }, []);

  const toggleOpen = useCallback(() => {
    applyOpen(!openRef.current);
  }, [applyOpen]);

  // 처음에는 열린 상태로 두고, 저장된 값이 있으면 한 번만 따라간다.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* 읽지 못하면 처음 상태(열림)를 유지한다. */
    }
    if (saved === '0') {
      openRef.current = false;
      setOpen(false);
    } else if (saved === '1') {
      openRef.current = true;
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const update = () => setWidth(media.matches ? 90 : 140);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      }
      if (event.code === 'KeyN') toggleOpen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleOpen]);

  // 내 화살표와 흐림 판단만 100ms 마다 갱신한다. 길·장소는 아래 캔버스에 그대로 둔다.
  useEffect(() => {
    if (!open) return;
    const canvas = playerRef.current;
    const draw = () => {
      const ctx = prepareCanvas(canvas, width, height);
      if (!ctx) return;
      drawPlayerArrow(ctx, width);
      const far = isFarOutsideLoop(playerState.x, playerState.z, LOOP, LOOP_SAMPLES);
      if (far !== farRef.current) {
        farRef.current = far;
        setFarOutside(far);
      }
    };
    draw();
    const timer = window.setInterval(draw, 100);
    return () => window.clearInterval(timer);
  }, [open, width, height]);

  useEffect(() => {
    if (!open) return;
    const ctx = prepareCanvas(baseRef.current, width, height);
    if (!ctx) return;
    drawBase(ctx, width, farOutside);
  }, [open, width, height, farOutside]);

  return (
    <div className="minimap">
      {open ? (
        <div className="minimap-map glass" style={{ height }}>
          <div
            className="minimap-drawing"
            role="img"
            aria-label="숲 지도: 산길 초입, 숲의 빈터, 오두막과 내 위치"
          >
            <canvas ref={baseRef} className="minimap-canvas" aria-hidden="true" />
            <canvas ref={playerRef} className="minimap-canvas" aria-hidden="true" />
          </div>
          <button
            type="button"
            className="minimap-close"
            onClick={toggleOpen}
            aria-label="지도 닫기"
            title="지도 닫기 (N)"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="icon-btn minimap-open"
          onClick={toggleOpen}
          aria-label="지도 열기"
          title="지도 (N)"
        >
          <IconMap />
        </button>
      )}
    </div>
  );
}
