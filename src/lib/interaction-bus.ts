/** HUD(모바일 버튼)에서 3D 씬의 상호작용 핸들러를 호출하기 위한 버스 */
export const interactionBus: { current: (() => void) | null } = { current: null };
