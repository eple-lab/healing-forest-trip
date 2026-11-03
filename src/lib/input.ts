/** 모바일/데스크톱 공통 입력 상태 (매 프레임 읽으므로 리렌더 없이 보관) */
export const inputState = {
  touchMoveX: 0,
  touchMoveY: 0,
  lookX: 0,
  lookY: 0,
  sprint: false,
};

export function consumeLook() {
  const x = inputState.lookX;
  const y = inputState.lookY;
  inputState.lookX = 0;
  inputState.lookY = 0;
  return { x, y };
}

export function clearTouchInput() {
  inputState.touchMoveX = 0;
  inputState.touchMoveY = 0;
  inputState.lookX = 0;
  inputState.lookY = 0;
}
