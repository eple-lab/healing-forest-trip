/**
 * 숲속여행 월드 정의
 * ─────────────────────────────────────────────
 * 지형, 산길, 나무, 오두막, 상호작용 지점의 좌표를 한 곳에서 관리합니다.
 * 3D 컴포넌트와 충돌/이동 로직이 모두 이 파일을 참조하므로
 * 좌표를 바꾸면 화면과 물리가 함께 움직입니다.
 */

import worldFile from '../../shared/world.json';

export type Vec2 = { x: number; z: number };
export type Surface = 'grass' | 'dirt' | 'wood' | 'stone';
export type Zone = 'trail' | 'clearing' | 'cabin';

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const dist2d = (ax: number, az: number, bx: number, bz: number) =>
  Math.hypot(ax - bx, az - bz);

/** 카메라 yaw: 정면은 (-sin(yaw), 0, -cos(yaw)) */
export const yawToward = (
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
) => Math.atan2(-(toX - fromX), -(toZ - fromZ));

/** 결정적 난수 (새로고침해도 같은 숲이 보이도록) */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────────────────────────────────────────
 * 1. 산길
 * ─────────────────────────────────────────────── */

const PATH_CONTROL: Vec2[] = [
  { x: 0, z: 76 },
  { x: 1.5, z: 58 },
  { x: -2, z: 40 },
  { x: -3.2, z: 24 },
  { x: 0.5, z: 6 },
  { x: 4, z: -12 },
  { x: 1, z: -30 },
  { x: -4, z: -46 },
  { x: 0, z: -62 }, // 숲의 빈터
  { x: 0, z: -80 },
  { x: 3, z: -96 },
  { x: -2, z: -114 },
  { x: -1, z: -130 },
  { x: 0, z: -143 }, // 오두막 앞
];

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export type PathSample = { x: number; z: number; h: number; t: number };

function rawHeight(x: number, z: number) {
  return (
    0.85 * Math.sin(x * 0.055 + 1.3) * Math.cos(z * 0.041) +
    0.45 * Math.sin(x * 0.13 + z * 0.07) +
    0.22 * Math.cos(x * 0.21 - z * 0.16) +
    0.1 * Math.sin(x * 0.7) * Math.cos(z * 0.6)
  );
}

function buildPath(): PathSample[] {
  const out: PathSample[] = [];
  const stepsPerSegment = 26;
  const total = PATH_CONTROL.length - 1;
  for (let i = 0; i < total; i++) {
    const p0 = PATH_CONTROL[Math.max(0, i - 1)];
    const p1 = PATH_CONTROL[i];
    const p2 = PATH_CONTROL[i + 1];
    const p3 = PATH_CONTROL[Math.min(total, i + 2)];
    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      const x = catmull(p0.x, p1.x, p2.x, p3.x, t);
      const z = catmull(p0.z, p1.z, p2.z, p3.z, t);
      out.push({
        x,
        z,
        h: rawHeight(x, z),
        t: (i + t) / total,
      });
    }
  }
  const last = PATH_CONTROL[total];
  out.push({ x: last.x, z: last.z, h: rawHeight(last.x, last.z), t: 1 });
  return out;
}

export const PATH_SAMPLES = buildPath();

export function nearestPath(x: number, z: number) {
  let best = Infinity;
  let bestSample = PATH_SAMPLES[0];
  for (let i = 0; i < PATH_SAMPLES.length; i++) {
    const s = PATH_SAMPLES[i];
    const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
    if (d < best) {
      best = d;
      bestSample = s;
    }
  }
  return { distance: Math.sqrt(best), sample: bestSample };
}

/* ───────────────────────────────────────────────
 * 2. 주요 장소
 * ─────────────────────────────────────────────── */

/** 서버(shared/world.json)와 공유하는 값 */
export const START = {
  x: worldFile.start.x,
  z: worldFile.start.z,
  yaw: worldFile.start.yaw,
};

export const CLEARING = {
  x: worldFile.clearing.x,
  z: worldFile.clearing.z,
  radius: worldFile.clearing.radius,
  chatRadius: worldFile.clearing.chatRadius,
};

/*
 * 오두막 좌표
 * ─────────────────────────────────────────────
 * 오두막 안팎의 값은 오두막 중심(CABIN.x, CABIN.z)을 원점으로 하는 "로컬 좌표"로 적는다.
 * 정면(문·큰 창)은 +z 쪽이다. 오두막을 옮길 때는 shared/world.json 의 cabin.x/z 만 바꾼다.
 *  - *_LOCAL : 로컬 좌표. Cabin.tsx 가 오두막 그룹 안에서 그릴 때 쓴다.
 *  - 이름에 LOCAL 이 없는 값 : 월드 좌표(로컬 + 오두막 중심). 충돌·상호작용·소리가 쓴다.
 */
const CABIN_HALF_D = worldFile.cabin.halfD;

/** 오두막 로컬 기준 값 (원점 = 오두막 중심) */
export const CABIN_LOCAL = {
  x: 0,
  z: 0,
  halfW: worldFile.cabin.halfW,
  halfD: CABIN_HALF_D,
  doorHalf: worldFile.cabin.doorHalf,
  frontZ: CABIN_HALF_D,
  backZ: -CABIN_HALF_D,
  floor1: worldFile.cabin.floor1,
  floor2: worldFile.cabin.floor2,
  wallTop: 6.52,
  ridge: 8.45,
  doorTop: 2.42,
  porchZ: 7.8,
};

/** 로컬 좌표 객체의 x·z 계열 값에 오두막 중심을 더해 월드 좌표로 바꾼다 */
const X_KEYS = ['x', 'x0', 'x1'] as const;
const Z_KEYS = ['z', 'z0', 'z1', 'zBottom', 'zTop', 'frontZ', 'backZ', 'porchZ'] as const;
function cabinToWorld<T extends object>(local: T): T {
  const out = { ...local } as Record<string, unknown>;
  for (const k of X_KEYS) if (typeof out[k] === 'number') out[k] = (out[k] as number) + worldFile.cabin.x;
  for (const k of Z_KEYS) if (typeof out[k] === 'number') out[k] = (out[k] as number) + worldFile.cabin.z;
  return out as T;
}

export const CABIN = cabinToWorld(CABIN_LOCAL);

export const STAIRS_LOCAL = {
  x0: 3.34,
  x1: 4.78,
  zBottom: 4.85,
  zTop: 0.3,
  yBottom: CABIN_LOCAL.floor1,
  yTop: CABIN_LOCAL.floor2,
  steps: 11,
};
export const STAIRS = cabinToWorld(STAIRS_LOCAL);

export const STAIR_HOLE_LOCAL = {
  x0: 3.28,
  x1: 4.94,
  z0: 0.55,
  z1: 5.25,
};
export const STAIR_HOLE = cabinToWorld(STAIR_HOLE_LOCAL);

export const FURNITURE_LOCAL = {
  // [BUG-07] 벽난로 중심이 벽 안쪽 면(x -4.92) 근처라 절반 넘게 벽 속에 있었다 →
  // 뒷면이 벽 안쪽 면에 붙도록 옮기고(뒷면 x -4.915), 흔들의자도 같은 거리(0.47m)만큼 뒤로 민다.
  fireplace: { x: -4.43, z: -0.4, w: 0.85, d: 2.7 },
  rockingChair: { x: -2.28, z: -0.3, facing: Math.PI / 2 },
  blanketTable: { x: -2.5, z: 1.9, w: 0.8, d: 0.55 },
  kitchen: { x0: -3.05, x1: 2.15, z0: -4.85, z1: -4.05, h: 0.92 },
  fridge: { x: -4.15, z: -4.35, w: 1.15, d: 0.75 },
  sink: { x: -1.5, z: -4.3 },
  coffee: { x: 0.55, z: -4.32 },
  woodpile: { x: 6.5, z: 1.4, w: 1.5, d: 1.7 },
  bed: { x: -2.6, z: -2.85, w: 2.05, d: 2.25 },
  windowSeat: { x: 0.2, z: 4.35, w: 2.6, d: 0.7 },
  rug: { x: -2.3, z: 0.6 },
};
export const FURNITURE = Object.fromEntries(
  Object.entries(FURNITURE_LOCAL).map(([k, v]) => [k, cabinToWorld(v)]),
) as typeof FURNITURE_LOCAL;

export const WINDOW_LOCAL = {
  halfW: 2.4,
  bottom: CABIN_LOCAL.floor2 + 0.62,
  top: CABIN_LOCAL.floor2 + 2.32,
  z: CABIN_LOCAL.frontZ,
};
export const WINDOW = cabinToWorld(WINDOW_LOCAL);

/* ───────────────────────────────────────────────
 * 3. 지형 높이
 * ─────────────────────────────────────────────── */

const CLEARING_H = rawHeight(CLEARING.x, CLEARING.z);
const CABIN_H = 0;

export function terrainHeight(x: number, z: number): number {
  let h = rawHeight(x, z);

  // 산길은 평평하게 다져져 있다
  const near = nearestPath(x, z);
  const trailBlend = smoothstep(2.4, 9.5, near.distance);
  h = lerp(near.sample.h, h, trailBlend);

  // 숲의 빈터
  const dc = dist2d(x, z, CLEARING.x, CLEARING.z);
  h = lerp(CLEARING_H, h, smoothstep(CLEARING.radius * 0.55, CLEARING.radius + 10, dc));

  // 오두막 주변은 고르게
  const dCab = Math.max(
    Math.abs(x - CABIN.x) - CABIN.halfW,
    Math.abs(z - CABIN.z) - CABIN.halfD,
  );
  h = lerp(CABIN_H, h, smoothstep(8, 21, dCab));
  return h;
}

const inRect = (x: number, z: number, x0: number, x1: number, z0: number, z1: number) =>
  x >= x0 && x <= x1 && z >= z0 && z <= z1;

export function stairsHeight(x: number, z: number): number | null {
  if (x < STAIRS.x0 || x > STAIRS.x1) return null;
  if (z < STAIRS.zTop || z > STAIRS.zBottom) return null;
  const p = (STAIRS.zBottom - z) / (STAIRS.zBottom - STAIRS.zTop);
  return lerp(STAIRS.yBottom, STAIRS.yTop, clamp(p, 0, 1));
}

/**
 * 발놓을 수 있는 바닥의 높이를 구한다.
 * feetY + stepUp 보다 높은 바닥(2층)은 후보에서 제외해
 * 1층에서 2층 바닥으로 순간이동하지 않게 한다.
 */
export function groundAt(
  x: number,
  z: number,
  feetY: number,
): { y: number; surface: Surface } {
  const stepUp = 0.62;
  const limit = feetY + stepUp;
  const candidates: { y: number; surface: Surface }[] = [
    { y: terrainHeight(x, z), surface: 'grass' },
  ];

  // 마당 / 현관 데크
  if (inRect(x, z, CABIN.x - 3.5, CABIN.x + 3.5, CABIN.porchZ, CABIN.frontZ + 0.02)) {
    candidates.push({ y: CABIN.floor1, surface: 'wood' });
  }
  // 1층
  if (inRect(x, z, CABIN.x - CABIN.halfW, CABIN.x + CABIN.halfW, CABIN.backZ, CABIN.frontZ)) {
    candidates.push({ y: CABIN.floor1, surface: 'wood' });
  }
  // 계단
  const sh = stairsHeight(x, z);
  if (sh !== null) candidates.push({ y: sh, surface: 'wood' });
  // 2층 (계단 구멍 제외)
  if (
    inRect(x, z, CABIN.x - CABIN.halfW, CABIN.x + CABIN.halfW, CABIN.backZ, CABIN.frontZ) &&
    !inRect(x, z, STAIR_HOLE.x0, STAIR_HOLE.x1, STAIR_HOLE.z0, STAIR_HOLE.z1)
  ) {
    candidates.push({ y: CABIN.floor2, surface: 'wood' });
  }

  let best = candidates[0];
  for (const c of candidates) {
    if (c.y <= limit && c.y > best.y) best = c;
  }
  if (best.surface === 'grass') {
    const near = nearestPath(x, z);
    if (near.distance < 1.9) best = { ...best, surface: 'dirt' };
    else if (dist2d(x, z, CLEARING.x, CLEARING.z) < CLEARING.radius * 0.45)
      best = { ...best, surface: 'grass' };
  }
  return best;
}

/* ───────────────────────────────────────────────
 * 4. 충돌체
 * ─────────────────────────────────────────────── */

export type BoxCollider = {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  tag?: string;
};

/** 오두막 충돌 상자 (로컬 좌표) */
const CABIN_COLLIDERS_LOCAL: BoxCollider[] = [
  // 벽
  { x0: -5.12, x1: -4.92, z0: -5, z1: 5, y0: 0, y1: 7, tag: 'wall' },
  { x0: 4.92, x1: 5.12, z0: -5, z1: 5, y0: 0, y1: 7, tag: 'wall' },
  { x0: -5.1, x1: 5.1, z0: -5.12, z1: -4.92, y0: 0, y1: 7, tag: 'wall' },
  // 앞벽 1층 (문 양옆)
  { x0: -5.1, x1: -CABIN_LOCAL.doorHalf, z0: 4.92, z1: 5.08, y0: 0, y1: 3.5, tag: 'wall' },
  { x0: CABIN_LOCAL.doorHalf, x1: 5.1, z0: 4.92, z1: 5.08, y0: 0, y1: 3.5, tag: 'wall' },
  // 앞벽 2층 (큰 창 아래/양옆)
  { x0: -5.1, x1: -WINDOW_LOCAL.halfW, z0: 4.92, z1: 5.08, y0: 3.42, y1: 6.6, tag: 'wall' },
  { x0: WINDOW_LOCAL.halfW, x1: 5.1, z0: 4.92, z1: 5.08, y0: 3.42, y1: 6.6, tag: 'wall' },
  { x0: -WINDOW_LOCAL.halfW, x1: WINDOW_LOCAL.halfW, z0: 4.92, z1: 5.08, y0: 3.42, y1: WINDOW_LOCAL.bottom, tag: 'wall' },
  // 계단 난간
  { x0: 3.22, x1: 3.36, z0: 0.1, z1: 5.0, y0: 0.32, y1: 4.4, tag: 'rail' },
  // 가구
  // [BUG-07] 벽난로·흔들의자를 옮긴 만큼 충돌 상자도 옮긴다(벽난로는 바닥 받침·선반 앞까지).
  { x0: -4.92, x1: -3.65, z0: -1.9, z1: 1.1, y0: 0.32, y1: 2.2, tag: 'fireplace' },
  { x0: -2.68, x1: -1.88, z0: -0.7, z1: 0.1, y0: 0.32, y1: 1.3, tag: 'chair' },
  { x0: -2.9, x1: -2.1, z0: 1.6, z1: 2.2, y0: 0.32, y1: 0.9, tag: 'table' },
  { x0: FURNITURE_LOCAL.kitchen.x0, x1: FURNITURE_LOCAL.kitchen.x1, z0: -4.9, z1: -4.0, y0: 0.32, y1: 1.3, tag: 'counter' },
  { x0: -4.72, x1: -3.58, z0: -4.72, z1: -3.98, y0: 0.32, y1: 2.1, tag: 'fridge' },
  { x0: -3.65, x1: -1.55, z0: -4.0, z1: -1.7, y0: 3.42, y1: 4.3, tag: 'bed' },
  { x0: -1.1, x1: 1.5, z0: 4.0, z1: 4.7, y0: 3.42, y1: 4.0, tag: 'seat' },
  { x0: 5.6, x1: 7.4, z0: 0.5, z1: 2.3, y0: 0, y1: 1.6, tag: 'woodpile' },
  // 2층 난간
  { x0: 3.2, x1: 3.32, z0: 0.55, z1: 5.25, y0: 3.42, y1: 4.45, tag: 'rail' },
];

/** 충돌 상자 (월드 좌표). 하나라도 겹치면 막히므로 순서는 상관없다. */
export const BOX_COLLIDERS: BoxCollider[] = [
  ...CABIN_COLLIDERS_LOCAL.map(cabinToWorld),
  // 시작 지점 게시판
  { x0: -3.7, x1: -1.9, z0: 66.05, z1: 66.55, y0: 0, y1: 2.1, tag: 'notice' },
];

export type TreeCollider = { x: number; z: number; r: number };

/* ───────────────────────────────────────────────
 * 5. 숲
 * ─────────────────────────────────────────────── */

export type Tree = {
  x: number;
  z: number;
  scale: number;
  rot: number;
  kind: 'pine' | 'oak';
  tint: number;
};

export type Bush = { x: number; z: number; scale: number; tint: number };
export type Rock = { x: number; z: number; scale: number; rot: number };
export type Tuft = { x: number; z: number; scale: number; rot: number; tint: number };

function pointBlocked(x: number, z: number) {
  if (nearestPath(x, z).distance < 4.2) return true;
  if (dist2d(x, z, CLEARING.x, CLEARING.z) < CLEARING.radius + 1) return true;
  if (
    Math.abs(x - CABIN.x) < CABIN.halfW + 6.5 &&
    Math.abs(z - CABIN.z) < CABIN.halfD + 6.5
  )
    return true;
  if (dist2d(x, z, START.x, START.z) < 6) return true;
  return false;
}

function generateForest() {
  const rnd = mulberry32(20261027);
  const trees: Tree[] = [];
  let guard = 0;
  while (trees.length < 360 && guard < 8000) {
    guard++;
    const x = (rnd() * 2 - 1) * 96;
    const z = 108 - rnd() * 330;
    if (pointBlocked(x, z)) continue;
    if (Math.abs(x) > 90) continue;
    const kind: Tree['kind'] = rnd() < 0.66 ? 'pine' : 'oak';
    trees.push({
      x,
      z,
      scale: 0.75 + rnd() * 0.85,
      rot: rnd() * Math.PI * 2,
      kind,
      tint: rnd(),
    });
  }

  // 빈터를 감싸는 나무 고리
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + 0.15;
    const r = CLEARING.radius + 2.5 + rnd() * 3.5;
    const x = CLEARING.x + Math.cos(a) * r;
    const z = CLEARING.z + Math.sin(a) * r;
    if (nearestPath(x, z).distance < 2.5) continue;
    trees.push({
      x,
      z,
      scale: 0.95 + rnd() * 0.75,
      rot: rnd() * Math.PI * 2,
      kind: rnd() < 0.7 ? 'pine' : 'oak',
      tint: rnd(),
    });
  }

  // 오두막을 감싸는 나무
  for (let i = 0; i < 20; i++) {
    const x = CABIN.x + (rnd() * 2 - 1) * 30;
    const z = CABIN.z + (rnd() * 2 - 1) * 27;
    if (pointBlocked(x, z)) continue;
    // 오두막 앞마당(정면 9m)은 비운다
    if (Math.hypot(x - CABIN.x, z - (CABIN.z + 9)) < 9) continue;
    trees.push({
      x,
      z,
      scale: 0.9 + rnd() * 0.8,
      rot: rnd() * Math.PI * 2,
      kind: rnd() < 0.6 ? 'pine' : 'oak',
      tint: rnd(),
    });
  }
  return trees;
}

export const TREES = generateForest();
export const TREE_COLLIDERS: TreeCollider[] = TREES.filter(
  (t) => Math.abs(t.x) < 80,
).map((t) => ({ x: t.x, z: t.z, r: (t.kind === 'pine' ? 0.26 : 0.32) * t.scale }));

function generateBushes(): Bush[] {
  const rnd = mulberry32(77);
  const out: Bush[] = [];
  for (let i = 0; i < 260; i++) {
    const x = (rnd() * 2 - 1) * 55;
    const z = 90 - rnd() * 260;
    if (pointBlocked(x, z)) continue;
    out.push({ x, z, scale: 0.5 + rnd() * 0.75, tint: rnd() });
  }
  return out;
}
export const BUSHES = generateBushes();

function generateRocks(): Rock[] {
  const rnd = mulberry32(991);
  const out: Rock[] = [];
  for (let i = 0; i < 90; i++) {
    const x = (rnd() * 2 - 1) * 60;
    const z = 92 - rnd() * 270;
    if (pointBlocked(x, z)) continue;
    out.push({ x, z, scale: 0.22 + rnd() * 0.7, rot: rnd() * Math.PI * 2 });
  }
  // 빈터 가장자리 돌
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    out.push({
      x: CLEARING.x + Math.cos(a) * 7.5,
      z: CLEARING.z + Math.sin(a) * 7.5,
      scale: 0.18 + (i % 3) * 0.06,
      rot: a,
    });
  }
  return out;
}
export const ROCKS = generateRocks();

function generateTufts(): Tuft[] {
  const rnd = mulberry32(404);
  const out: Tuft[] = [];
  for (let i = 0; i < 1100; i++) {
    const x = (rnd() * 2 - 1) * 65;
    const z = 92 - rnd() * 275;
    if (nearestPath(x, z).distance < 1.7) continue;
    if (dist2d(x, z, CLEARING.x, CLEARING.z) < 5) continue;
    if (
      Math.abs(x - CABIN.x) < CABIN.halfW + 1 &&
      Math.abs(z - CABIN.z) < CABIN.halfD + 1
    )
      continue;
    out.push({
      x,
      z,
      scale: 0.5 + rnd() * 1.1,
      rot: rnd() * Math.PI,
      tint: rnd(),
    });
  }
  return out;
}
export const TUFTS = generateTufts();

/* ───────────────────────────────────────────────
 * 6. 상호작용 지점
 * ─────────────────────────────────────────────── */

export type Stump = { id: string; x: number; z: number; h: number; facing: number };

export const STUMPS: Stump[] = [
  { id: 'stump-trail-1', x: 2.9, z: 46, h: 0.5, facing: 0 },
  { id: 'stump-trail-2', x: -3.4, z: 20, h: 0.46, facing: 0 },
  { id: 'stump-trail-3', x: 3.2, z: -6, h: 0.55, facing: 0 },
  { id: 'stump-trail-4', x: -2.8, z: -34, h: 0.44, facing: 0 },
  { id: 'stump-clearing', x: 6.2, z: -69, h: 0.5, facing: 0 },
  { id: 'stump-trail-5', x: -2.4, z: -106, h: 0.52, facing: 0 },
  { id: 'stump-trail-6', x: 2.6, z: -130, h: 0.47, facing: 0 },
].map((s) => {
  const near = nearestPath(s.x, s.z);
  return {
    ...s,
    facing: yawToward(s.x, s.z, near.sample.x, near.sample.z),
  };
});

export const CLEARING_PROPS = {
  firePit: { x: 0, z: -62 },
  sign: { x: 2.6, z: -46 },
  benchCount: 5,
  lanternRadius: 8.4,
};

/** 빈터를 둘러싼 통나무 벤치 (길이 들어오는 방향은 비워 둔다) */
export const CLEARING_BENCHES = [0.1, 1.0, 2.3, 3.6, 5.8].map((angle) => {
  const radius = 9.4;
  return {
    x: CLEARING.x + Math.cos(angle) * radius,
    z: CLEARING.z + Math.sin(angle) * radius,
    angle,
  };
});

BOX_COLLIDERS.push(
  // 빈터 화덕
  {
    x0: CLEARING.x - 1.45,
    x1: CLEARING.x + 1.45,
    z0: CLEARING.z - 1.45,
    z1: CLEARING.z + 1.45,
    y0: 0,
    y1: 1.1,
    tag: 'firepit',
  },
  // 벤치
  ...CLEARING_BENCHES.map((bench) => ({
    x0: bench.x - 1.4,
    x1: bench.x + 1.4,
    z0: bench.z - 0.7,
    z1: bench.z + 0.7,
    y0: 0,
    y1: 0.9,
    tag: 'bench',
  })),
);

export function zoneAt(x: number, z: number): Zone {
  if (Math.abs(x - CABIN.x) < CABIN.halfW + 0.6 && Math.abs(z - CABIN.z) < CABIN.halfD + 0.6)
    return 'cabin';
  if (dist2d(x, z, CLEARING.x, CLEARING.z) < CLEARING.radius) return 'clearing';
  return 'trail';
}

export function inClearing(x: number, z: number) {
  return dist2d(x, z, CLEARING.x, CLEARING.z) <= CLEARING.chatRadius;
}

export const WORLD_BOUNDS = worldFile.bounds;
export const LIMITS = worldFile.limits;

/** 거리 기반 상호작용 가능 여부 (서버 검증에도 사용 가능한 순수 함수) */
export function near(x: number, z: number, tx: number, tz: number, r: number) {
  return dist2d(x, z, tx, tz) <= r;
}
