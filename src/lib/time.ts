/** 한국 시간(Asia/Seoul)과 하늘 상태 계산 */

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul',
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export type KoreaClock = {
  hour: number;
  minute: number;
  second: number;
  label: string;
  period: string;
  /** 0 = 자정, 0.5 = 정오 */
  dayFraction: number;
  secondsOfDay: number;
};

export function koreaClock(epochMs: number): KoreaClock {
  const parts = formatter.formatToParts(new Date(epochMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get('hour') % 24;
  const minute = get('minute');
  const second = get('second');
  const secondsOfDay = hour * 3600 + minute * 60 + second;

  let period = '밤';
  if (hour >= 5 && hour < 8) period = '새벽';
  else if (hour >= 8 && hour < 12) period = '아침';
  else if (hour >= 12 && hour < 17) period = '낮';
  else if (hour >= 17 && hour < 20) period = '저녁';

  return {
    hour,
    minute,
    second,
    label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    period,
    dayFraction: secondsOfDay / 86400,
    secondsOfDay,
  };
}

let cachedClock: KoreaClock | null = null;
let cachedAt = 0;

/** 1초 단위로 캐시해 매 프레임 호출해도 부담이 없게 한다. */
export function currentKoreaClock(now: number): KoreaClock {
  if (!cachedClock || Math.abs(now - cachedAt) >= 1000) {
    cachedClock = koreaClock(now);
    cachedAt = now;
  }
  return cachedClock;
}

export type SunState = {
  /** 정규화된 태양 방향 */
  sun: [number, number, number];
  moon: [number, number, number];
  sunY: number;
  /** 0(밤) ~ 1(낮) */
  day: number;
  /** 해가 지평선 근처일 때 1 */
  twilight: number;
  /** 밤 정도 */
  night: number;
};

export function sunState(clock: KoreaClock): SunState {
  const t = clock.secondsOfDay / 3600;
  const angle = ((t - 6) / 24) * Math.PI * 2;
  const sx = Math.cos(angle);
  const sy = Math.sin(angle);
  const sz = -0.38;
  const len = Math.hypot(sx, sy, sz) || 1;
  const sun: [number, number, number] = [sx / len, sy / len, sz / len];
  const moon: [number, number, number] = [-sun[0], -sun[1], -sun[2]];
  const day = smooth(-0.05, 0.2, sy);
  const twilight = Math.exp(-Math.pow(sy / 0.16, 2)) * (1 - Math.max(0, sy - 0.12) * 4);
  return {
    sun,
    moon,
    sunY: sy,
    day,
    twilight: Math.max(0, Math.min(1, twilight)),
    night: 1 - day,
  };
}

export function smooth(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const DAY_TOP: RGB = [0.27, 0.49, 0.78];
const DAY_HORIZON: RGB = [0.76, 0.87, 0.92];
const NIGHT_TOP: RGB = [0.015, 0.03, 0.075];
const NIGHT_HORIZON: RGB = [0.045, 0.07, 0.13];
const DUSK_HORIZON: RGB = [0.93, 0.47, 0.28];
const DUSK_TOP: RGB = [0.18, 0.22, 0.42];

export type SkyColors = {
  top: RGB;
  horizon: RGB;
  fog: RGB;
  sun: RGB;
  ambient: RGB;
  hemiSky: RGB;
  hemiGround: RGB;
};

export function skyColors(state: SunState): SkyColors {
  const { day, twilight, sunY } = state;
  let top = mix(NIGHT_TOP, DAY_TOP, day);
  let horizon = mix(NIGHT_HORIZON, DAY_HORIZON, day);
  top = mix(top, DUSK_TOP, twilight * 0.55);
  horizon = mix(horizon, DUSK_HORIZON, twilight * 0.9);

  const warm: RGB = [1.0, 0.6, 0.32];
  const white: RGB = [1.0, 0.95, 0.82];
  const sun = mix(warm, white, smooth(0.03, 0.4, sunY));

  return {
    top,
    horizon,
    fog: mix(horizon, [0.07, 0.1, 0.14], 0.15 + 0.35 * state.night),
    sun,
    ambient: mix([0.16, 0.2, 0.32], [0.55, 0.62, 0.66], day),
    hemiSky: mix([0.12, 0.16, 0.28], [0.62, 0.78, 0.92], day),
    hemiGround: mix([0.05, 0.06, 0.06], [0.32, 0.33, 0.22], day),
  };
}

export function timeGreeting(clock: KoreaClock) {
  if (clock.hour < 5) return '고요한 새벽의 숲';
  if (clock.hour < 8) return '해가 뜨는 숲';
  if (clock.hour < 12) return '아침 산책하기 좋은 숲';
  if (clock.hour < 17) return '햇살이 내려앉은 숲';
  if (clock.hour < 20) return '노을이 번지는 숲';
  return '별이 뜨는 숲';
}
