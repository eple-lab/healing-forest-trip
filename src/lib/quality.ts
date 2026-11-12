/**
 * [BUG-12] 그래픽 가속이 없는 PC(Chrome 이 CPU 로 3D 를 그리는 상태)를 알아내 가벼운 모드를 켠다.
 * ─────────────────────────────────────────────
 * - 2026-11-12 eple PC: `ANGLE (Microsoft, Microsoft Basic Render Driver …)` → 걷기·시선이 초당 약 3장으로 끊김.
 * - 가벼운 모드: 그림자 끄기, 해상도 배율 0.75, 안티앨리어싱 끄기, 풀 무더기 절반.
 * - 주소 옵션 `?quality=low|high` 로 자동 판정을 덮어쓸 수 있다(배포본에서도 동작, 화질만 바뀐다).
 */

const SOFTWARE_RENDERER = /swiftshader|basic render|llvmpipe|softpipe|software|warp/i;

let cached: { low: boolean; renderer: string } | null = null;

/** WebGL 그래픽 장치 이름. 읽지 못하면 빈 문자열 */
function readRenderer(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(name ?? '');
  } catch {
    return '';
  }
}

/** 소프트웨어 렌더러 이름인지 (시험용으로 내보낸다) */
export function isSoftwareRenderer(name: string): boolean {
  return SOFTWARE_RENDERER.test(name);
}

/** 가벼운 모드를 쓸지. 브라우저에서 처음 부를 때 한 번 정하고 이후에는 같은 값을 돌려준다. */
export function detectQuality(): { low: boolean; renderer: string } {
  if (cached) return cached;
  if (typeof window === 'undefined') return { low: false, renderer: '' };
  const forced = new URLSearchParams(window.location.search).get('quality');
  const renderer = readRenderer();
  const low = forced === 'low' ? true : forced === 'high' ? false : isSoftwareRenderer(renderer);
  cached = { low, renderer };
  return cached;
}

/** 이미 정한 값(정하기 전이면 false). Canvas 안 컴포넌트가 쓴다. */
export function isLowQuality(): boolean {
  return cached?.low ?? false;
}
