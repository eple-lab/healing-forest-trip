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

/*
 * 숲을 한 바퀴 도는 타원 고리 + 고리에서 빈터·오두막으로 들어가는 갈림길 2개.
 * 고리는 시작 지점(타원의 +z 끝)에서 -x 쪽(시작 지점에서 볼 때 왼쪽)으로 돌아 다시 시작 지점으로 돌아온다.
 * 구불거림은 예전 일자 길과 비슷하게: 약 18m마다 제어점, 좌우로 최대 3.5m.
 */

/** 원형 길(타원)의 중심과 반지름 */
export const LOOP = { x: 0, z: -55, rx: 62, rz: 127 };
const LOOP_POINTS = 34;
const LOOP_WIGGLE = 3.5;
/** 오두막 갈림길이 고리에서 갈라지는 지점 (고리의 +x 쪽) */
const CABIN_JUNCTION: Vec2 = { x: 53, z: -125 };
/** 빈터 갈림길이 끝나는 곳: 빈터 중심에서 이만큼 떨어진 곳(벤치 바깥) */
const CLEARING_SPUR_END = 11;

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

export type TrailId = 'loop' | 'center-south' | 'center-north' | 'clearing' | 'cabin';
export type PathSample = { x: number; z: number; h: number; t: number; trail: TrailId };

function rawHeight(x: number, z: number) {
  return (
    0.85 * Math.sin(x * 0.055 + 1.3) * Math.cos(z * 0.041) +
    0.45 * Math.sin(x * 0.13 + z * 0.07) +
    0.22 * Math.cos(x * 0.21 - z * 0.16) +
    0.1 * Math.sin(x * 0.7) * Math.cos(z * 0.6)
  );
}

const STEPS_PER_SEGMENT = 26;

/** 제어점을 Catmull-Rom 으로 이어 표본을 만든다. closed 면 마지막 표본이 첫 표본과 같다. */
function buildTrail(control: Vec2[], trail: TrailId, closed: boolean): PathSample[] {
  const out: PathSample[] = [];
  const n = control.length;
  const segments = closed ? n : n - 1;
  const at = (i: number) =>
    closed ? control[((i % n) + n) % n] : control[clamp(i, 0, n - 1)];
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < STEPS_PER_SEGMENT; s++) {
      const t = s / STEPS_PER_SEGMENT;
      const x = catmull(p0.x, p1.x, p2.x, p3.x, t);
      const z = catmull(p0.z, p1.z, p2.z, p3.z, t);
      out.push({ x, z, h: rawHeight(x, z), t: (i + t) / segments, trail });
    }
  }
  const last = closed ? control[0] : control[n - 1];
  out.push({ x: last.x, z: last.z, h: rawHeight(last.x, last.z), t: 1, trail });
  return out;
}

/** 타원 둘레를 길이 기준으로 고르게 나눈 제어점 (시작 지점은 흔들지 않는다) */
function loopControl(): Vec2[] {
  const { x: cx, z: cz, rx, rz } = LOOP;
  const fine = 2400;
  const pts: Vec2[] = [];
  const arc: number[] = [0];
  for (let i = 0; i <= fine; i++) {
    const a = (i / fine) * Math.PI * 2;
    pts.push({ x: cx - rx * Math.sin(a), z: cz + rz * Math.cos(a) });
    if (i > 0) arc.push(arc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  }
  const total = arc[fine];
  const rnd = mulberry32(20261111);
  const out: Vec2[] = [];
  let j = 0;
  for (let k = 0; k < LOOP_POINTS; k++) {
    const target = (k / LOOP_POINTS) * total;
    while (arc[j + 1] < target) j++;
    const p = pts[j];
    // 바깥쪽 법선
    let nx = (p.x - cx) / (rx * rx);
    let nz = (p.z - cz) / (rz * rz);
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    const wiggle = k === 0 ? 0 : (rnd() * 2 - 1) * LOOP_WIGGLE;
    out.push({ x: p.x + nx * wiggle, z: p.z + nz * wiggle });
  }
  return out;
}

const LOOP_SAMPLES = buildTrail(loopControl(), 'loop', true);

function nearestIn(samples: PathSample[], x: number, z: number) {
  let best = Infinity;
  let bestSample = samples[0];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
    if (d < best) {
      best = d;
      bestSample = s;
    }
  }
  return { distance: Math.sqrt(best), sample: bestSample };
}

/** 고리 위 점 j 에서 목적지 end 까지, 가운데를 살짝 휘게 한 갈림길 제어점 */
function spurControl(j: Vec2, end: Vec2, bend: number, approach?: Vec2): Vec2[] {
  const tip = approach ?? end;
  const dx = tip.x - j.x;
  const dz = tip.z - j.z;
  const len = Math.hypot(dx, dz) || 1;
  const px = -dz / len;
  const pz = dx / len;
  const mid = (f: number, b: number): Vec2 => ({
    x: j.x + dx * f + px * b,
    z: j.z + dz * f + pz * b,
  });
  const pts = [j, mid(0.36, bend), mid(0.7, -bend * 0.6)];
  if (approach) pts.push(approach);
  pts.push(end);
  return pts;
}

/** 빈터 갈림길: 고리에서 빈터 중심에 가장 가까운 곳에서 빈터 가장자리 안쪽(벤치 바깥)까지 */
const clearingJunction = nearestIn(LOOP_SAMPLES, worldFile.clearing.x, worldFile.clearing.z).sample;
const clearingDir = Math.atan2(
  clearingJunction.z - worldFile.clearing.z,
  clearingJunction.x - worldFile.clearing.x,
);
const CLEARING_SPUR = buildTrail(
  spurControl(
    clearingJunction,
    {
      x: worldFile.clearing.x + Math.cos(clearingDir) * CLEARING_SPUR_END,
      z: worldFile.clearing.z + Math.sin(clearingDir) * CLEARING_SPUR_END,
    },
    1.2,
  ),
  'clearing',
  false,
);

/**
 * 가운데 길: 시작 지점에서 북쪽(-z)으로 빈터를 지나 오두막 앞마당까지 가는 산책길.
 * 빈터 안에는 길을 내지 않고(화덕·벤치), 남쪽(+z) 입구와 북쪽(-z) 입구에서 끊는다.
 * 구불거림은 예전 일자 길처럼 약 18m마다 좌우 최대 4m.
 */
const CENTER_ENTRY = 11; // 빈터 입구: 빈터 중심에서 남북으로 이만큼(벤치 바깥)

/** a 에서 b 로 가는 직선을 같은 간격으로 나눠, offsets(진행 방향의 오른쪽 +) 만큼 옆으로 민 제어점 */
function wigglyLine(a: Vec2, b: Vec2, offsets: number[]): Vec2[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const rx = -dz / len;
  const rz = dx / len;
  const n = offsets.length - 1;
  return offsets.map((o, i) => ({ x: a.x + (dx * i) / n + rx * o, z: a.z + (dz * i) / n + rz * o }));
}

// 처음 12m 는 북쪽(-z)으로 곧게 가서 알림판(x -1.9 까지)과 시작 표지판(x 1.85 부터) 사이 한가운데를 지난다
const CENTER_FIRST: Vec2 = { x: worldFile.start.x, z: worldFile.start.z - 12 };
const CENTER_SOUTH = buildTrail(
  [
    { x: worldFile.start.x, z: worldFile.start.z },
    ...wigglyLine(
      CENTER_FIRST,
      { x: worldFile.clearing.x, z: worldFile.clearing.z + CENTER_ENTRY },
      [0, -2, -3.2, 2.5, 0],
    ),
  ],
  'center-south',
  false,
);

const CENTER_NORTH = buildTrail(
  [
    ...wigglyLine(
      { x: worldFile.clearing.x, z: worldFile.clearing.z - CENTER_ENTRY },
      { x: worldFile.cabin.x, z: worldFile.cabin.z + 16 },
      [0, 3, -2, 2.5, -1, 0],
    ),
    // 오두막 정면(남쪽 +z)으로 곧게 다가가 문 앞 9m 에서 끝난다
    { x: worldFile.cabin.x, z: worldFile.cabin.z + 9 },
  ],
  'center-north',
  false,
);

/** 오두막 갈림길: 고리의 +x 쪽에서 갈라져 앞마당(가운데 길 끝 쪽)에서 가운데 길과 만난다 */
const cabinJunction = nearestIn(LOOP_SAMPLES, CABIN_JUNCTION.x, CABIN_JUNCTION.z).sample;
const CABIN_SPUR = buildTrail(
  spurControl(cabinJunction, { x: worldFile.cabin.x + 1.5, z: worldFile.cabin.z + 15 }, 1.8),
  'cabin',
  false,
);

/** 길 묶음. 길마다 따로 그린다. */
export const TRAILS: { id: TrailId; closed: boolean; samples: PathSample[] }[] = [
  { id: 'loop', closed: true, samples: LOOP_SAMPLES },
  { id: 'center-south', closed: false, samples: CENTER_SOUTH },
  { id: 'center-north', closed: false, samples: CENTER_NORTH },
  { id: 'clearing', closed: false, samples: CLEARING_SPUR },
  { id: 'cabin', closed: false, samples: CABIN_SPUR },
];

/** 모든 길의 표본 (지형 다지기·가장 가까운 길 찾기용) */
export const PATH_SAMPLES: PathSample[] = TRAILS.flatMap((trail) => trail.samples);

/** 갈림길이 고리에서 갈라지는 지점 (이정표 자리) */
export const JUNCTIONS = {
  clearing: { x: clearingJunction.x, z: clearingJunction.z },
  cabin: { x: cabinJunction.x, z: cabinJunction.z },
};

export function nearestPath(x: number, z: number) {
  return nearestIn(PATH_SAMPLES, x, z);
}

/**
 * 고리 위 한 점에서 옆으로 비켜난 자리.
 * t: 고리를 따라 간 비율(0 = 시작 지점, -x 쪽으로 돈다), side: 고리 안쪽(+)·바깥쪽(-)으로 비켜날 거리(m)
 */
/**
 * [FEAT-18] 아무 길(TRAILS) 위 한 점에서 옆으로 비켜난 자리.
 * t: 그 길을 따라 간 비율(0 = 길 처음), side: 진행 방향의 왼쪽(+)·오른쪽(-)으로 비켜날 거리(m)
 */
export function trailSpot(id: TrailId, t: number, side: number): Vec2 {
  const samples = TRAILS.find((trail) => trail.id === id)!.samples;
  const n = samples.length - 1;
  const i = clamp(Math.round(clamp(t, 0, 1) * n), 0, n - 1);
  const s0 = samples[i];
  const s1 = samples[i + 1];
  const len = Math.hypot(s1.x - s0.x, s1.z - s0.z) || 1;
  // 진행 방향 (tx, tz) 의 왼쪽 = (tz, -tx)
  const lx = (s1.z - s0.z) / len;
  const lz = -(s1.x - s0.x) / len;
  return { x: s0.x + lx * side, z: s0.z + lz * side };
}

export function loopSpot(t: number, side: number): Vec2 {
  const n = LOOP_SAMPLES.length - 1;
  const f = loopFrame(clamp(Math.round((((t % 1) + 1) % 1) * n), 0, n - 1));
  return { x: f.x + f.nx * side, z: f.z + f.nz * side };
}

/**
 * 고리 표본 i 의 자리와 방향.
 * (tx, tz): 진행 방향(-x 쪽으로 도는 쪽), (nx, nz): 고리 안쪽을 향하는 수직 방향
 */
function loopFrame(i: number) {
  const s = LOOP_SAMPLES[i];
  const next = LOOP_SAMPLES[i + 1];
  const len = Math.hypot(next.x - s.x, next.z - s.z) || 1;
  const tx = (next.x - s.x) / len;
  const tz = (next.z - s.z) / len;
  let nx = -tz;
  let nz = tx;
  if (nx * (LOOP.x - s.x) + nz * (LOOP.z - s.z) < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { x: s.x, z: s.z, tx, tz, nx, nz };
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
export function cabinToWorld<T extends object>(local: T): T {
  const out = { ...local } as Record<string, unknown>;
  for (const k of X_KEYS) if (typeof out[k] === 'number') out[k] = (out[k] as number) + worldFile.cabin.x;
  for (const k of Z_KEYS) if (typeof out[k] === 'number') out[k] = (out[k] as number) + worldFile.cabin.z;
  return out as T;
}

export const CABIN = cabinToWorld(CABIN_LOCAL);

// [FEAT-12] 오두막 둘레의 빈터(로컬 원). 숲 생성 뒤 이 안의 나무·덤불·바위·풀을 걸러 낸다.
// 다음 이슈(모닥불·해먹)가 원을 더할 수 있게 배열로 둔다.
export const CABIN_YARD_CLEAR_LOCAL = [
  { x: -13, z: 1, r: 6 },
  // [FEAT-10] 오두막 동쪽(+x) 모닥불 자리. 숲 생성 때 이 반경 안의 나무를 치운다.
  { x: 15, z: 2, r: 6 },
  // [FEAT-11] 모닥불 북쪽 해먹 자리. 숲 생성 때 이 반경 안의 나무를 치운다.
  { x: 16.5, z: -5, r: 5 },
];

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

/** [BUG-13] 계단 아래에서 난간을 비워 두는 길이(계단 길이 대비 비율). 서쪽에서 첫 계단으로 오르는 입구 */
export const STAIR_RAIL_OPEN = 0.25;

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
  // [FEAT-08] 현관 데크 흔들의자. facing = π 는 남쪽(+z)을 바라보는 값(docs/21-directions.md).
  porchRocking: { x: 2.4, z: 6.5, facing: Math.PI },
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

/**
 * [FEAT-08] 1층 앞벽 문 양옆 창문. 벽에 구멍은 내지 않고 바깥·안쪽 면에 창틀만 붙인다.
 * y 는 1층 바닥(floor1)에서 0.95m ~ 2.05m.
 */
export const CABIN_WINDOWS_LOCAL = [{ x: -2.6 }, { x: 2.6 }];
export const CABIN_WINDOW = {
  width: 1.3,
  bottom: CABIN_LOCAL.floor1 + 0.95,
  top: CABIN_LOCAL.floor1 + 2.05,
};

/** [FEAT-08] 오두막 둘레 외부등 6개(로컬 좌표). 앞마당 두 곳만 진짜 빛을 쓴다. */
export const CABIN_LAMPS_LOCAL = [
  { x: -3.2, z: 11 },
  { x: 3.2, z: 11 },
  { x: -7.5, z: 3 },
  { x: -7.5, z: -4 },
  { x: 9, z: -3 },
  { x: 9, z: 4.5 },
];
export const CABIN_LAMPS = CABIN_LAMPS_LOCAL.map(cabinToWorld);

// [FEAT-12] 오두막 서쪽(-x) 8인용 통나무 식탁. 월드 좌표는 cabinToWorld 로 바꾼다.
export const PICNIC_LOCAL = {
  table: { x: -13, z: 1, w: 1.2, d: 3.4, h: 0.78 },
  seats: [
    { id: 'picnic-0', side: -1, z: -1.2 },
    { id: 'picnic-1', side: -1, z: -0.4 },
    { id: 'picnic-2', side: -1, z: 0.4 },
    { id: 'picnic-3', side: -1, z: 1.2 },
    { id: 'picnic-4', side: 1, z: -1.2 },
    { id: 'picnic-5', side: 1, z: -0.4 },
    { id: 'picnic-6', side: 1, z: 0.4 },
    { id: 'picnic-7', side: 1, z: 1.2 },
  ],
} as const;

export const PICNIC = {
  table: cabinToWorld(PICNIC_LOCAL.table),
  seats: PICNIC_LOCAL.seats.map((seat) => ({
    id: seat.id,
    // 식탁 양옆(x = -13 ∓ 1.05): side -1 = 서쪽(-14.05), side 1 = 동쪽(-11.95)
    x: CABIN.x + PICNIC_LOCAL.table.x + seat.side * 1.05,
    z: CABIN.z + PICNIC_LOCAL.table.z + seat.z,
  })),
};

// [FEAT-10] 오두막 동쪽(+x, 앞마당에서 볼 때 오른쪽) 모닥불·앉는 밑동·차 탁자(로컬 좌표).
// 밑동 5개는 모닥불 중심에서 반지름 2.6m, 각도는 (cos, sin) = (x, z) 기준이다.
export const CAMPFIRE_LOCAL = {
  fire: { x: 15, z: 2, r: 0.9 },
  seats: [0.6, 1.5, 2.4, 3.6, 5.2].map((angle, i) => ({
    id: `seat-campfire-${i}`,
    angle,
    x: 15 + Math.cos(angle) * 2.6,
    z: 2 + Math.sin(angle) * 2.6,
  })),
  // 차 탁자: 처음 지시(17.9, 3.6)는 0번 밑동과 겹치고 그 밑동에서 일어날 자리가 탁자 상자 안이었다(opencode 보고)
  // → 밑동 사이 가장 넓은 틈(2.4~3.6rad, 오두막 쪽)의 가운데 3.0rad, 반지름 3.4m 로 옮긴다.
  table: { x: 15 + Math.cos(3.0) * 3.4, z: 2 + Math.sin(3.0) * 3.4, r: 0.55, h: 0.55 },
};

export const CAMPFIRE = {
  fire: cabinToWorld(CAMPFIRE_LOCAL.fire),
  seats: CAMPFIRE_LOCAL.seats.map(cabinToWorld),
  table: cabinToWorld(CAMPFIRE_LOCAL.table),
};

// [FEAT-11] 모닥불 북쪽(-z) 해먹과 줄조명(가랜드). 로컬 좌표(원점 = 오두막 중심).
export const HAMMOCK_LOCAL = {
  center: { x: 17, z: -7 },
  // 양 끝 기둥 2개: 동서(x) 방향으로 3.2m, 높이 1.8, 굵기 0.12
  posts: [
    { x: 15.4, z: -7, h: 1.8 },
    { x: 18.6, z: -7, h: 1.8 },
  ],
  // 해먹 서쪽 기둥 꼭대기 → 모닥불 북서쪽 새 기둥
  garlandPost: { x: 12.6, z: -1.2, h: 2.2 },
  cloth: { width: 0.9, sag: 0.35, lowestY: 0.55 },
  strings: [
    // 해먹 두 기둥 꼭대기 사이
    { x0: 15.4, y0: 1.8, z0: -7, x1: 18.6, y1: 1.8, z1: -7, sag: 0.3, count: 10 },
    // 해먹 서쪽 기둥 꼭대기 → 모닥불 북서쪽 새 기둥
    { x0: 15.4, y0: 1.8, z0: -7, x1: 12.6, y1: 2.2, z1: -1.2, sag: 0.5, count: 14 },
  ],
};

export const HAMMOCK = {
  center: cabinToWorld(HAMMOCK_LOCAL.center),
  posts: HAMMOCK_LOCAL.posts.map(cabinToWorld),
  garlandPost: cabinToWorld(HAMMOCK_LOCAL.garlandPost),
  cloth: HAMMOCK_LOCAL.cloth,
  strings: HAMMOCK_LOCAL.strings.map((s) => ({
    x0: CABIN.x + s.x0,
    y0: s.y0,
    z0: CABIN.z + s.z0,
    x1: CABIN.x + s.x1,
    y1: s.y1,
    z1: CABIN.z + s.z1,
    sag: s.sag,
    count: s.count,
  })),
};

/**
 * [FEAT-09] 실내 조명 위치(로컬 좌표).
 *  - pendants: 천장 펜던트 2개. 1층 전구 자리는 기존 기본 빛(pointLight)이 나오는 곳이다.
 *  - floorLamps: 바닥 스탠드 2개. 발광 재질·번짐만 쓰고, 작은 충돌 상자는 CABIN_COLLIDERS_LOCAL 에 둔다.
 *  - strings: 알전구 줄 3개. 양 끝 좌표(x0,z0 → x1,z1)와 높이·가운데 처짐(sag)·전구 개수.
 */
/** 알전구 줄 하나. yEnd 가 있으면 x0,z0 쪽 높이 y 에서 x1,z1 쪽 높이 yEnd 로 기울어진다(계단 줄) */
export type CabinStringLight = { x0: number; z0: number; x1: number; z1: number; y: number; yEnd?: number; sag: number; count: number };

export const CABIN_LIGHTS_LOCAL: { pendants: { x: number; y: number; z: number }[]; floorLamps: { x: number; z: number }[]; strings: CabinStringLight[] } = {
  pendants: [
    { x: 0, y: CABIN_LOCAL.floor2 - 0.15, z: 1 },
    { x: -1, y: CABIN_LOCAL.wallTop - 0.7, z: -1.5 },
  ],
  floorLamps: [
    { x: -4.3, z: 3.8 },
    { x: 4.3, z: -4.2 },
  ],
  strings: [
    {
      x0: -2.2,
      z0: 4.3,
      x1: -2.2,
      z1: -4.3,
      y: CABIN_LOCAL.floor2 - 0.25,
      sag: 0.25,
      count: 12,
    },
    {
      x0: 1.6,
      z0: 4.3,
      x1: 1.6,
      z1: -4.3,
      y: CABIN_LOCAL.floor2 - 0.25,
      sag: 0.25,
      count: 12,
    },
    {
      x0: -3.3,
      z0: CABIN_LOCAL.porchZ - 0.3,
      x1: 3.3,
      z1: CABIN_LOCAL.porchZ - 0.3,
      y: 3.0,
      sag: 0.2,
      count: 12,
    },
    // [FEAT-18] 계단 처음부터 끝까지: 동쪽 벽 안쪽(x 4.7) 계단 위로 비스듬히. 아래(z 4.85)는 1층 바닥+2.0, 위(z 0.3)는 2층 바닥+1.9
    {
      x0: 4.7,
      z0: STAIRS_LOCAL.zBottom,
      x1: 4.7,
      z1: STAIRS_LOCAL.zTop,
      y: CABIN_LOCAL.floor1 + 2.0,
      yEnd: CABIN_LOCAL.floor2 + 1.9,
      sag: 0.15,
      count: 14,
    },
  ],
};

/**
 * [BUG-10] 현관 데크 앞 계단. 데크 바깥쪽(남쪽 +z)으로 run 간격마다 한 칸씩 내려간다.
 * Cabin.tsx(모양)와 groundAt(밟는 높이)이 같은 값을 쓴다.
 */
export const PORCH_STEPS = { count: 2, rise: 0.11, run: 0.34, width: 2.4, depth: 0.4 };
/** i 번째 계단(0 = 데크 바로 앞)의 윗면 높이 */
export const porchStepTop = (i: number) => CABIN_LOCAL.floor1 - 0.055 - i * PORCH_STEPS.rise;

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

  // 현관 데크: 앞벽(frontZ)에서 바깥쪽(남쪽 +z) porchZ 까지
  // [BUG-10] 예전에는 범위가 porchZ ~ frontZ 로 뒤집혀 한 번도 맞지 않았다(발이 데크에 잠김)
  if (inRect(x, z, CABIN.x - 3.5, CABIN.x + 3.5, CABIN.frontZ - 0.02, CABIN.porchZ + 0.05)) {
    candidates.push({ y: CABIN.floor1, surface: 'wood' });
  }
  // 현관 계단
  for (let i = 0; i < PORCH_STEPS.count; i++) {
    const cz = CABIN.porchZ + PORCH_STEPS.run * (i + 1);
    if (
      inRect(
        x,
        z,
        CABIN.x - PORCH_STEPS.width / 2,
        CABIN.x + PORCH_STEPS.width / 2,
        cz - PORCH_STEPS.depth / 2,
        cz + PORCH_STEPS.depth / 2,
      )
    ) {
      candidates.push({ y: porchStepTop(i), surface: 'wood' });
    }
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
  // [BUG-13] 계단 아래쪽은 앞벽(z 4.92) 바로 안이라 앞에서는 못 들어오고, 난간이 끝까지(z 5.0) 막아 서쪽에서도 못 올랐다
  // → 계단 아래 STAIR_RAIL_OPEN(길이 비율)만큼 난간을 비워 서쪽에서 첫 계단에 오르게 한다.
  { x0: 3.22, x1: 3.36, z0: 0.1, z1: STAIRS_LOCAL.zBottom - (STAIRS_LOCAL.zBottom - STAIRS_LOCAL.zTop) * STAIR_RAIL_OPEN, y0: 0.32, y1: 4.4, tag: 'rail' },
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
  // [FEAT-08] 현관 데크 흔들의자(실내 의자와 같은 크기)와 외부등 기둥.
  { x0: 2.0, x1: 2.8, z0: 6.1, z1: 6.9, y0: 0.32, y1: 1.3, tag: 'chair' },
  ...CABIN_LAMPS_LOCAL.map((lamp) => ({
    x0: lamp.x - 0.12,
    x1: lamp.x + 0.12,
    z0: lamp.z - 0.12,
    z1: lamp.z + 0.12,
    y0: 0,
    y1: 1.7,
    tag: 'lamp',
  })),
  // [FEAT-09] 바닥 스탠드 2개. 빛은 없지만 지나갈 수 없게 작은 상자를 둔다(0.36×0.36, 높이 1.5).
  ...CABIN_LIGHTS_LOCAL.floorLamps.map((lamp) => ({
    x0: lamp.x - 0.18,
    x1: lamp.x + 0.18,
    z0: lamp.z - 0.18,
    z1: lamp.z + 0.18,
    y0: CABIN_LOCAL.floor1,
    y1: CABIN_LOCAL.floor1 + 1.5,
    tag: 'lamp',
  })),
  // [FEAT-11] 해먹 기둥 3개. 0.24×0.24, 높이 기둥 높이. 천은 상자 없음.
  ...HAMMOCK_LOCAL.posts.map((post) => ({
    x0: post.x - 0.12,
    x1: post.x + 0.12,
    z0: post.z - 0.12,
    z1: post.z + 0.12,
    y0: 0,
    y1: post.h,
    tag: 'hammock-post',
  })),
  {
    x0: HAMMOCK_LOCAL.garlandPost.x - 0.12,
    x1: HAMMOCK_LOCAL.garlandPost.x + 0.12,
    z0: HAMMOCK_LOCAL.garlandPost.z - 0.12,
    z1: HAMMOCK_LOCAL.garlandPost.z + 0.12,
    y0: 0,
    y1: HAMMOCK_LOCAL.garlandPost.h,
    tag: 'hammock-post',
  },
  // 2층 난간
  { x0: 3.2, x1: 3.32, z0: 0.55, z1: 5.25, y0: 3.42, y1: 4.45, tag: 'rail' },
];

/** 충돌 상자 (월드 좌표). 하나라도 겹치면 막히므로 순서는 상관없다. */
export const BOX_COLLIDERS: BoxCollider[] = [
  ...CABIN_COLLIDERS_LOCAL.map(cabinToWorld),
  // 시작 지점 게시판
  { x0: -3.7, x1: -1.9, z0: 66.05, z1: 66.55, y0: 0, y1: 2.1, tag: 'notice' },
  // [FEAT-12] 오두막 서쪽 통나무 식탁 상판(높이 0~0.8, 의자는 앉기 대상이라 상자 없음)
  {
    x0: CABIN.x + PICNIC_LOCAL.table.x - PICNIC_LOCAL.table.w / 2,
    x1: CABIN.x + PICNIC_LOCAL.table.x + PICNIC_LOCAL.table.w / 2,
    z0: CABIN.z + PICNIC_LOCAL.table.z - PICNIC_LOCAL.table.d / 2,
    z1: CABIN.z + PICNIC_LOCAL.table.z + PICNIC_LOCAL.table.d / 2,
    y0: 0,
    y1: 0.8,
    tag: 'picnic-table',
  },
  // [FEAT-10] 오두막 동쪽 모닥불 돌 테두리(1.8×1.8, 높이 0.6)와 차 탁자 넓은 밑동.
  // 앉는 밑동 5개는 앉기 대상이라 충돌 상자를 두지 않는다.
  {
    x0: CABIN.x + CAMPFIRE_LOCAL.fire.x - CAMPFIRE_LOCAL.fire.r,
    x1: CABIN.x + CAMPFIRE_LOCAL.fire.x + CAMPFIRE_LOCAL.fire.r,
    z0: CABIN.z + CAMPFIRE_LOCAL.fire.z - CAMPFIRE_LOCAL.fire.r,
    z1: CABIN.z + CAMPFIRE_LOCAL.fire.z + CAMPFIRE_LOCAL.fire.r,
    y0: 0,
    y1: 0.6,
    tag: 'campfire',
  },
  {
    x0: CABIN.x + CAMPFIRE_LOCAL.table.x - CAMPFIRE_LOCAL.table.r,
    x1: CABIN.x + CAMPFIRE_LOCAL.table.x + CAMPFIRE_LOCAL.table.r,
    z0: CABIN.z + CAMPFIRE_LOCAL.table.z - CAMPFIRE_LOCAL.table.r,
    z1: CABIN.z + CAMPFIRE_LOCAL.table.z + CAMPFIRE_LOCAL.table.r,
    y0: 0,
    y1: CAMPFIRE_LOCAL.table.h,
    tag: 'campfire-table',
  },
];

// [FEAT-12] 오두막 둘레의 빈터 원(월드 좌표). 숲 생성 뒤 이 안의 배치를 걸러 낸다.
const YARD_CLEARS = CABIN_YARD_CLEAR_LOCAL.map((c) => ({
  x: CABIN.x + c.x,
  z: CABIN.z + c.z,
  r: c.r,
}));

function inCabinYardClear(x: number, z: number) {
  return YARD_CLEARS.some((c) => dist2d(x, z, c.x, c.z) < c.r);
}

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

// [FEAT-12] 생성 순서·난수는 그대로 두고, 오두막 둘레 빈터 원 안의 것만 걸러 낸다.
export const TREES = generateForest().filter((t) => !inCabinYardClear(t.x, t.z));
export const TREE_COLLIDERS: TreeCollider[] = TREES.filter(
  (t) => Math.abs(t.x) < 80,
).map((t) => ({ x: t.x, z: t.z, r: (t.kind === 'pine' ? 0.26 : 0.32) * t.scale }));

function generateBushes(): Bush[] {
  const rnd = mulberry32(77);
  const out: Bush[] = [];
  // 원형 길 바깥(x ±62 너머)까지 덮도록 x ±85, 개수는 예전 밀도(±55에 260개)에 맞춘다
  for (let i = 0; i < 402; i++) {
    const x = (rnd() * 2 - 1) * 85;
    const z = 90 - rnd() * 260;
    if (pointBlocked(x, z)) continue;
    out.push({ x, z, scale: 0.5 + rnd() * 0.75, tint: rnd() });
  }
  return out;
}
export const BUSHES = generateBushes().filter((b) => !inCabinYardClear(b.x, b.z));

function generateRocks(): Rock[] {
  const rnd = mulberry32(991);
  const out: Rock[] = [];
  // 원형 길 바깥까지 x ±85, 개수는 예전 밀도(±60에 90개)에 맞춘다
  for (let i = 0; i < 128; i++) {
    const x = (rnd() * 2 - 1) * 85;
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
export const ROCKS = generateRocks().filter((r) => !inCabinYardClear(r.x, r.z));

function generateTufts(): Tuft[] {
  const rnd = mulberry32(404);
  const out: Tuft[] = [];
  // 원형 길 바깥까지 x ±85, 개수는 예전 밀도(±65에 1100개)에 맞춘다
  for (let i = 0; i < 1438; i++) {
    const x = (rnd() * 2 - 1) * 85;
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
export const TUFTS = generateTufts().filter((t) => !inCabinYardClear(t.x, t.z));

/* ───────────────────────────────────────────────
 * 6. 상호작용 지점
 * ─────────────────────────────────────────────── */

export type Stump = { id: string; x: number; z: number; h: number; facing: number };

/**
 * 앉을 수 있는 그루터기.
 * 길가 그루터기는 원형 길을 따라 간 비율(t)과 길에서 비켜난 거리(side, + 안쪽 / - 바깥쪽)로 놓는다.
 * 갈림길(빈터 t≈0.21, 오두막 t≈0.64) 근처는 피한다.
 */
const TRAIL_STUMPS = [
  { id: 'stump-trail-1', t: 0.06, side: 3, h: 0.5 },
  { id: 'stump-trail-2', t: 0.13, side: -3, h: 0.46 },
  { id: 'stump-trail-3', t: 0.32, side: 3, h: 0.55 },
  { id: 'stump-trail-4', t: 0.45, side: -3, h: 0.44 },
  { id: 'stump-trail-5', t: 0.78, side: 3, h: 0.52 },
  { id: 'stump-trail-6', t: 0.9, side: -3, h: 0.47 },
  // [FEAT-18] 원형 길에 띄엄띄엄 더 (갈림길 t≈0.21·0.64 근처는 피함)
  { id: 'stump-trail-7', t: 0.26, side: 3, h: 0.5 },
  { id: 'stump-trail-8', t: 0.55, side: -3, h: 0.48 },
  { id: 'stump-trail-9', t: 0.71, side: 3, h: 0.45 },
  { id: 'stump-trail-10', t: 0.97, side: -3, h: 0.5 },
];

/** [FEAT-18] 가운데 길 옆 그루터기: 길(center-south·center-north)을 따라 간 비율과 왼쪽(+)/오른쪽(-) 거리 */
const CENTER_STUMPS: { id: string; trail: TrailId; t: number; side: number; h: number }[] = [
  { id: 'stump-center-1', trail: 'center-south', t: 0.32, side: 2.8, h: 0.47 },
  { id: 'stump-center-2', trail: 'center-south', t: 0.7, side: -2.8, h: 0.52 },
  { id: 'stump-center-3', trail: 'center-north', t: 0.25, side: 2.8, h: 0.5 },
  { id: 'stump-center-4', trail: 'center-north', t: 0.5, side: -2.8, h: 0.45 },
  { id: 'stump-center-5', trail: 'center-north', t: 0.76, side: 2.8, h: 0.49 },
];

export const STUMPS: Stump[] = [
  ...TRAIL_STUMPS.map(({ id, t, side, h }) => ({ id, ...loopSpot(t, side), h, facing: 0 })),
  ...CENTER_STUMPS.map(({ id, trail, t, side, h }) => ({ id, ...trailSpot(trail, t, side), h, facing: 0 })),
  // 빈터 그루터기: 빈터 중심에서 동쪽(+x) 6.2m, 북쪽(-z) 7m
  { id: 'stump-clearing', x: CLEARING.x + 6.2, z: CLEARING.z - 7, h: 0.5, facing: 0 },
].map((s) => {
  const near = nearestPath(s.x, s.z);
  return {
    ...s,
    facing: yawToward(s.x, s.z, near.sample.x, near.sample.z),
  };
});

export const CLEARING_PROPS = {
  firePit: { x: CLEARING.x, z: CLEARING.z },
  benchCount: 5,
  lanternRadius: 8.4,
};

/* ───────────────────────────────────────────────
 * 이정표
 * ─────────────────────────────────────────────── */

export type TrailSign = {
  id: string;
  x: number;
  z: number;
  /** 앞면이 바라보는 방향 (rotation-y, 앞면 법선 = (sin, cos)) */
  rotation: number;
  /** 판에 쓰는 글자 (줄마다) */
  lines: string[];
  /** E 로 읽을 때 나오는 문구 */
  text: string;
  /** 읽을 수 있는 거리(m) */
  radius: number;
  /** 뒷면에도 같은 글자를 붙인다 */
  doubleSided: boolean;
  width: number;
  height: number;
};

/** 고리 위에서 시작 지점으로부터 dist(m)만큼 dir(+1 = -x 쪽·시작 지점에서 볼 때 왼쪽, -1 = +x 쪽·오른쪽)으로 간 표본 번호 */
function loopIndexFromStart(dist: number, dir: 1 | -1) {
  const n = LOOP_SAMPLES.length - 1;
  let walked = 0;
  let i = 0;
  while (walked < dist) {
    const j = (i + dir + n) % n;
    walked += Math.hypot(LOOP_SAMPLES[j].x - LOOP_SAMPLES[i].x, LOOP_SAMPLES[j].z - LOOP_SAMPLES[i].z);
    i = j;
  }
  return i;
}

/** 시작 지점 양쪽 길 입구의 화살표 표지판: 고리 안쪽 3m에 세우고 앞면은 시작 지점을 본다 */
function startArrowSign(id: string, dir: 1 | -1, lines: string[], text: string): TrailSign {
  const f = loopFrame(loopIndexFromStart(8, dir));
  const x = f.x + f.nx * 3;
  const z = f.z + f.nz * 3;
  return {
    id,
    x,
    z,
    rotation: Math.atan2(START.x - x, START.z - z),
    lines,
    text,
    radius: 2.4,
    doubleSided: false,
    width: 1.9,
    height: 1.04,
  };
}

/**
 * 갈림길 입구 옆 양면 이정표.
 * 고리 안쪽으로 3m(길 띠 반폭은 최대 1.7m라 판 끝까지 띠 바깥), 진행 방향으로 2.4m(갈림길 띠 옆)에 세우고
 * 판은 원형 길 방향을 보게 해서 양쪽에서 오는 사람이 모두 읽는다.
 * 판 중심이 원형 길 중심선에서 3m 떨어지므로 읽는 거리는 3.5m.
 */
function junctionSign(
  id: string,
  junction: PathSample,
  lines: string[],
  text: string,
  width: number,
  height: number,
): TrailSign {
  const f = loopFrame(LOOP_SAMPLES.indexOf(junction));
  return {
    id,
    x: f.x + f.nx * 3 + f.tx * 2.4,
    z: f.z + f.nz * 3 + f.tz * 2.4,
    rotation: Math.atan2(f.tx, f.tz),
    lines,
    text,
    radius: 3.5,
    doubleSided: true,
    width,
    height,
  };
}

export const TRAIL_SIGNS: TrailSign[] = [
  {
    id: 'sign-start',
    // 가운데 길 띠(반폭 최대 1.7m)에 판이 닿지 않도록 길 동쪽(+x)으로 조금 비켜 둔다
    x: 3.3,
    z: 67,
    rotation: 0.08,
    lines: ['숲속여행', '산길 초입'],
    text: '숲속여행 · 산길 초입. 천천히 걸어가세요.',
    radius: 2.4,
    doubleSided: false,
    width: 1.9,
    height: 1.04,
  },
  startArrowSign('sign-start-left', 1, ['← 숲의 빈터'], '이 길로 돌면 숲의 빈터가 먼저 나와요.'),
  startArrowSign('sign-start-right', -1, ['오두막 →'], '이 길로 돌면 오두막이 먼저 나와요.'),
  junctionSign(
    'sign-clearing',
    clearingJunction,
    ['숲의 빈터', '쉬어가는 곳'],
    '숲의 빈터. 이 길로 들어가면 불을 피우고 이야기를 나누는 곳이 나와요.',
    1.9,
    1.04,
  ),
  junctionSign(
    'sign-cabin',
    cabinJunction,
    ['오두막', '불을 피우고 쉬어가세요'],
    // [BUG-04] 문은 늘 열려 있다 → 문구를 맞춘다.
    '오두막. 이 길로 들어가 안에서 불을 지펴 보세요.',
    2.2,
    1.1,
  ),
];

/**
 * 빈터를 둘러싼 통나무 벤치 (길이 들어오는 방향은 비워 둔다).
 * 각도는 (cos, sin) = (x, z) 기준. 1.0~2.3 틈 = 남쪽(+z) 가운데 길 입구, 3.6~5.8 틈 = 북쪽(-z) 입구,
 * 2.3~3.6 틈 = 서쪽(-x) 갈림길 입구.
 */
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
