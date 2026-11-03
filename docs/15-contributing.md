# 15 · 기여 규칙

## 시작하기

```powershell
git clone https://github.com/eple-lab/healing-forest-trip.git
cd healing-forest-trip
npm.cmd install
copy .env.example .env.local
npm.cmd run dev
```

`.env.local` 에 `NEXTAUTH_SECRET`(32자 이상)만 채우면 게스트로 바로 들어갈 수 있다.
DB/Google 없이도 개발할 수 있다.

## 브랜치와 커밋

- `main` 은 배포 가능한 상태로 유지한다.
- 작업은 `feat/...`, `fix/...`, `docs/...` 브랜치에서 한다.
- 커밋은 한 가지 목적 단위로 작게 만든다.
- 메시지는 한국어/영어 모두 가능하나 다음 형태를 권장한다.

```
feat: 흔들의자 담요 상호작용 추가
fix: 2층 계단 충돌로 올라가지 못하는 문제
docs: 배포 절차에 Neon CA 설정 보강
```

## 코드 스타일

- TypeScript strict, `any` 최소화.
- 경로 별칭 `@/` 사용.
- 컴포넌트는 함수형 + 훅. 기본 내보내기보다 이름 있는 내보내기를 선호한다.
- 3D 좌표/상수는 `src/lib/world.ts` 에 모은다.
- 서버 검증 로직은 `server.mjs`/`server/*.mjs`, 클라이언트 표시는 컴포넌트에 둔다.
- 주석은 "왜"를 설명한다(좌표/물리 상수는 "무엇"도 허용).
- 새 파일은 기존 폴더 구조를 따른다.

## 변경 시 함께 봐야 하는 파일

| 변경 | 함께 확인 |
| --- | --- |
| 월드 좌표 | `shared/world.json`, `src/lib/world.ts`, `server.mjs`(zone), `Cabin.tsx`/`Clearing.tsx` |
| 새 상호작용 | `InteractionSystem.tsx`, `AudioSystem.tsx`, HUD 프롬프트 |
| 새 소켓 이벤트 | `server.mjs`, `src/types/game.ts`, `MultiplayerBridge.tsx` |
| DB 스키마 | `db/schema.sql`, `server/db.mjs`, `docs/09-privacy.md` |
| 인증/보안 | `src/lib/auth.ts`, `src/middleware.ts`, `server/security.mjs`, `docs/08-security.md` |
| 환경 변수 | `.env.example`, `render.yaml`, `docs/12-deployment.md` |
| 새 문서 | `README.md` 문서 표 |

## PR 체크리스트

- [ ] `npm.cmd run typecheck` 통과
- [ ] `npm.cmd run build` 통과
- [ ] 새 기능을 [docs/13-testing.md](13-testing.md) 기준으로 확인
- [ ] 보안 영향 검토(입력/권한/CSP/SQL)
- [ ] 개인정보 수집 추가 없음(추가 시 문서화 + 보관 기간)
- [ ] 접근성: 키보드/포커스/`aria`
- [ ] 모바일 레이아웃 확인
- [ ] 관련 문서 갱신

## 보안 규칙

- 비밀값을 커밋하지 않는다. `.env.local` 은 `.gitignore` 에 있다.
- 클라이언트 입력을 신뢰하지 않는다. 서버에서 타입/범위/존을 재검증한다.
- SQL 은 반드시 파라미터 바인딩을 쓴다.
- `dangerouslySetInnerHTML` 을 쓰지 않는다(현재 사용 없음).
- 새 외부 도메인은 CSP `connect-src`/`img-src` 에 최소 범위로 추가한다.
- 인증/레이트리밋/정원 로직을 약화하는 변경은 문서와 함께 리뷰한다.
- 외부 3D/음원 에셋은 라이선스를 확인하고, 가능하면 절차 생성으로 대체한다.

## 문서 규칙

- `docs/NN-topic.md` 형식을 유지한다.
- 새 문서는 `README.md` 표와 관련 문서 상호 링크를 추가한다.
- 좌표/리밋/환경 변수는 실제 코드와 일치해야 한다.
- 스크린샷을 넣을 경우 개인정보(이름/사진)를 가린다.

## 성능 규칙

- 프레임마다 `setState` 하지 않는다.
- 무거운 객체는 `useMemo`/모듈 캐시로 재사용한다.
- 새 텍스처는 `src/lib/textures.ts` 캐시에 등록한다.
- 인스턴스 수/그림자/dpr 변경은 모바일에서 확인한다.
- 소켓 이벤트는 스로틀/레이트리밋을 유지한다.

## 라이선스와 출처

- 외부 3D 모델/텍스처/음원을 사용하지 않는 것을 기본 원칙으로 한다.
- 불가피하게 사용할 경우 출처/라이선스를 `docs/` 에 명시하고, 저장소 라이선스와
  호환되는지 확인한다.

## 도움이 필요한 경우

- 구조: [docs/04-architecture.md](04-architecture.md)
- 월드 좌표: [docs/06-world.md](06-world.md)
- 소켓 프로토콜: [docs/05-multiplayer.md](05-multiplayer.md)
- 보안: [docs/08-security.md](08-security.md)
- 배포: [docs/12-deployment.md](12-deployment.md)
- 문제 해결: [docs/14-troubleshooting.md](14-troubleshooting.md)
