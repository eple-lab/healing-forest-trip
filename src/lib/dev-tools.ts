/**
 * [FEAT-15] 개발 모드 전용 테스트 도구: 순간이동과 시간 바꾸기.
 * ─────────────────────────────────────────────
 * - 배포본(NODE_ENV=production)에서는 DEV_TOOLS_ENABLED 가 false 라 아무 일도 하지 않는다.
 * - 주소 옵션: /forest?spawn=start|clearing|cabin&time=13:00
 * - 화면 버튼(DevPanel)과 주소 옵션은 같은 함수(requestTeleport, setDevTime)를 쓴다.
 * - 시간 바꾸기는 내 화면에만 적용된다(서버·다른 사람 화면은 그대로).
 */

import { koreaClock } from '@/lib/time';
import { CABIN, CLEARING, START, TRAILS } from '@/lib/world';

export const DEV_TOOLS_ENABLED = process.env.NODE_ENV !== 'production';

export type SpawnTarget = 'start' | 'clearing' | 'cabin';

type SpawnPoint = { x: number; z: number; yaw: number };

/** yaw 가 (x, z) 에서 (tx, tz) 를 바라보게 하는 값 (앞 방향 = (-sin yaw, -cos yaw)) */
const yawLookAt = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));

function spawnPoint(target: SpawnTarget): SpawnPoint {
  if (target === 'clearing') {
    // 빈터 갈림길 끝(빈터 안, 벤치 바깥)에서 화덕을 바라본다
    const spur = TRAILS.find((t) => t.id === 'clearing')!.samples;
    const end = spur[spur.length - 1];
    return { x: end.x, z: end.z, yaw: yawLookAt(end.x, end.z, CLEARING.x, CLEARING.z) };
  }
  if (target === 'cabin') {
    // 오두막 앞마당(중심에서 남쪽 +z 로 16m, 앞벽에서 11m)에서 오두막 전체와 문을 바라본다(북쪽 -z)
    const x = CABIN.x;
    const z = CABIN.z + 16;
    return { x, z, yaw: yawLookAt(x, z, CABIN.x, CABIN.z) };
  }
  return { x: START.x, z: START.z, yaw: START.yaw };
}

export const SPAWN_TARGETS: { id: SpawnTarget; label: string }[] = [
  { id: 'start', label: '시작' },
  { id: 'clearing', label: '빈터' },
  { id: 'cabin', label: '오두막' },
];

let pendingTeleport: SpawnPoint | null = null;

/** 다음 프레임에 Player 가 이 자리로 옮긴다 */
export function requestTeleport(target: SpawnTarget) {
  if (!DEV_TOOLS_ENABLED) return;
  pendingTeleport = spawnPoint(target);
}

/** Player 가 프레임마다 부른다. 요청이 있으면 한 번만 돌려준다. */
export function consumeTeleport(): SpawnPoint | null {
  if (!DEV_TOOLS_ENABLED || !pendingTeleport) return null;
  const p = pendingTeleport;
  pendingTeleport = null;
  return p;
}

let timeShiftMs = 0;

/** 시계에 더할 값(ms). 배포본에서는 늘 0 */
export function devTimeShiftMs() {
  return DEV_TOOLS_ENABLED ? timeShiftMs : 0;
}

/** "HH:MM" 을 하루 중 초로. 잘못된 값이면 null */
export function parseDevTime(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 3600 + min * 60;
}

/**
 * 한국 시간이 지금부터 "HH:MM" 이 되도록 시계를 옮긴다(그다음부터는 평소처럼 흐른다).
 * null 이면 실제 시간으로 돌아간다. baseNow: 서버와 맞춘 지금 시각(ms)
 */
export function setDevTime(value: string | null, baseNow: number) {
  if (!DEV_TOOLS_ENABLED) return;
  const target = parseDevTime(value);
  if (target === null) {
    timeShiftMs = 0;
    return;
  }
  const current = koreaClock(baseNow).secondsOfDay;
  let diff = target - current;
  if (diff > 43200) diff -= 86400;
  if (diff < -43200) diff += 86400;
  timeShiftMs = diff * 1000;
}

/** 주소 옵션(spawn, time)을 읽어 적용한다. 숲 화면이 처음 뜰 때 한 번 부른다. */
export function applyDevParams(search: string, baseNow: number) {
  if (!DEV_TOOLS_ENABLED) return;
  const params = new URLSearchParams(search);
  const spawn = params.get('spawn');
  if (spawn === 'start' || spawn === 'clearing' || spawn === 'cabin') requestTeleport(spawn);
  const time = params.get('time');
  if (time !== null) setDevTime(time, baseNow);
}
