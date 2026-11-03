/** 3D 씬과 UI(상호작용/사운드)가 공유하는 플레이어 위치 */
export const playerState = {
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  moving: false,
  running: false,
  surface: 'grass' as 'grass' | 'dirt' | 'wood' | 'stone',
  seated: false,
};

/** 원격 플레이어 목록을 UI에서 참조할 때 쓰는 얇은 스냅샷 */
export const networkState = {
  remoteCount: 0,
};
