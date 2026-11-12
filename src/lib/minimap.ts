// [FEAT-07] 오른쪽 위 2D 지도의 좌표 계산. 시험하기 쉽게 다른 모듈을 import 하지 않는다.
// 위 = 북쪽(-z), 오른쪽 = 동쪽(+x) 이고 가로·세로 축척은 같다.

/** 지도에 담는 월드 범위(m). x 150m, z 280m */
export const MAP_VIEW = { xMin: -75, xMax: 75, zMin: -195, zMax: 85 };

/** 지도 폭(px) 하나로 쓰는 축척(px/m) */
export function mapScale(width: number): number {
  return width / (MAP_VIEW.xMax - MAP_VIEW.xMin);
}

/** 같은 축척을 지키는 지도 높이(px) */
export function mapHeight(width: number): number {
  return Math.round((MAP_VIEW.zMax - MAP_VIEW.zMin) * mapScale(width));
}

/** 월드 좌표를 지도 위 좌표로 바꾼다. z 가 클수록 남쪽이라 아래로 간다. */
export function worldToMap(x: number, z: number, width: number): { px: number; py: number } {
  const scale = mapScale(width);
  return { px: (x - MAP_VIEW.xMin) * scale, py: (z - MAP_VIEW.zMin) * scale };
}

/**
 * 캔버스 회전각. 위를 가리키는 화살표를 ctx.rotate(angle) 로 돌리면
 * yaw 0 → 위(북쪽), yaw -π/2 → 오른쪽(동쪽), yaw π/2 → 왼쪽(서쪽)이 된다.
 * 플레이어의 앞 방향이 (-sin yaw, -cos yaw) 이므로 부호만 뒤집는다.
 */
export function headingAngle(yaw: number): number {
  return -yaw;
}

type LoopShape = { x: number; z: number; rx: number; rz: number };
type MapPoint = { x: number; z: number };

/**
 * 원형 길 타원 바깥에 있고, 타원 표본까지 가장 가까운 거리가 margin(m) 보다 멀면 true.
 * 지도 안쪽 표시를 흐리게 할지 정할 때 쓴다.
 */
export function isFarOutsideLoop(
  x: number,
  z: number,
  loop: LoopShape,
  loopSamples: MapPoint[],
  margin = 15,
): boolean {
  const nx = (x - loop.x) / loop.rx;
  const nz = (z - loop.z) / loop.rz;
  if (nx * nx + nz * nz <= 1) return false;

  let nearest = Infinity;
  for (const sample of loopSamples) {
    const distance = Math.hypot(x - sample.x, z - sample.z);
    if (distance < nearest) nearest = distance;
  }
  return nearest > margin;
}
