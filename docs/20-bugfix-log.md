# 20 · 버그 수정 이력

## BUG-01 앉았다 일어나면 움직일 수 없음

- 발견: 2026-11-05 수동 테스트
- 이슈: #1
- 증상: 의자에 앉았다가 일어나면 W·A·S·D로 움직일 수 없다. 새로고침해야 빠져나올 수 있다.
  - 오두막 2층 큰 창가
  - 오두막 1층 의자, 흔들의자
- 원인: `Seat`마다 일어날 자리 `standX`/`standZ`가 정의돼 있지만(`src/types/game.ts:26`) 아무 데서도 쓰지 않았다. 일어날 때(`src/components/forest/Player.tsx`) y만 다시 잡고 x와 z는 의자 좌표 그대로 남았고, 그 자리가 의자 자신의 충돌 상자 안이라 `blocked()`가 모든 방향을 막았다. 빈터 벤치는 stand 자리(1.1m)도 벤치 자신의 충돌 상자 안이었다.
- 수정:
  - `src/components/forest/Player.tsx:75` — `lastSeat` ref 추가
  - `src/components/forest/Player.tsx:194` — 앉을 때 현재 Seat을 `lastSeat`에 저장
  - `src/components/forest/Player.tsx:237-269` — 일어날 때 x/z를 `standX`/`standZ`로 옮기고 `groundAt`으로 y를 잡는다. 옮긴 자리가 `blocked()`이면 의자 중심에서 0.3m씩 최대 2m까지 8방향으로 찾아 막히지 않은 첫 자리로 옮긴다
  - `src/components/forest/InteractionSystem.tsx:63-65` — 벤치 stand를 1.1m → 2.0m로 바꿔 벤치 자신의 충돌 상자 바깥으로 옮김
  - 그루터기 stand(0.95m, 8방향 전부), 흔들의자(`-1.9, -152.3`), 2층 큰 창가(`0.15, -149.2`), 침대(`-2.6, -152.9`)는 BOX_COLLIDERS 기준 바깥임을 수치로 확인
- 커밋: `58782a3` fix(forest): 앉았다 일어나면 움직일 수 없던 문제 (BUG-01)
- 이슈 번호: #1
- 재발 방지 테스트: `docs/13-testing.md` "C. 앉기/눕기" — 그루터기, 벤치, 흔들의자, 1층 의자, 2층 큰 창가, 침대에서 각각 일어난 뒤 W·A·S·D로 바로 걸을 수 있다.

## BUG-02 1층에서 "큰 창가에 앉기" 알림이 뜸

- 발견: 2026-11-05 수동 테스트
- 이슈: #2
- 증상: 오두막 1층에 있는데 2층 대상인 "큰 창가에 앉기" 알림이 뜨고, E를 누르면 2층 창가로 순간이동해 앉는다. 반대로 2층에서 바로 아래 1층 가구(무릎담요 테이블, 벽난로 등)의 알림이 뜰 수 있다.
- 원인: 알림 대상을 고르는 거리 계산이 x·z만 봤고(`src/components/forest/InteractionSystem.tsx:516`), `Target` 타입에 높이 정보가 없었다. 1층 바닥 `CABIN.floor1` = 0.32, 2층 바닥 `CABIN.floor2` = 3.42(`shared/world.json:12-13`)로 3.1m 차이를 구분하지 못했다. `playerState.y`는 발 높이다(`Player.tsx:359`에서 `pos.current.y`, 앉으면 `seat.feetY`).
- 수정:
  - `src/components/forest/InteractionSystem.tsx:118-129` — `Target`에 `y?: number`(대상 바닥 높이, 발 기준) 추가. 값이 없으면 높이를 보지 않는다(바깥 대상).
  - `src/components/forest/InteractionSystem.tsx:244-260` — 좌석에 `y: seat.feetY`를 넣는다.
  - `src/components/forest/InteractionSystem.tsx` — 오두막 1층 대상(벽난로, 무릎담요 테이블, 냉장고, 커피, 싱크)에 `y: CABIN.floor1`을 넣는다. 바깥 대상(화덕, 알림판, 표지판, 장작더미)은 넣지 않는다.
  - `src/components/forest/InteractionSystem.tsx:532` — 거리 비교 앞에 `if (target.y !== undefined && Math.abs(playerState.y - target.y) > 1.2) continue;`를 넣어 다른 층 대상을 건너뛴다. 1.2m면 계단 중간(약 1.9m)에서는 양쪽 층 알림이 모두 안 뜨고, 같은 층에서는 뜬다.
- 커밋: `d917b6f` fix: 1층에서 2층 창가 알림이 뜨던 문제 (BUG-02)
- 이슈 번호: #2
- 재발 방지 테스트: `docs/13-testing.md` "C. 앉기/눕기" — 1층에 있을 때 2층 대상(큰 창가, 침대)의 알림이 뜨지 않고, 2층에 올라가면 뜬다. 2층에서 1층 가구 알림이 뜨지 않는다.

## BUG-03 다른 탭에 갔다 오면 반딧불이가 멈춤

- 발견: 2026-11-05 수동 테스트
- 이슈: #3
- 증상: 크롬에서 다른 탭에 갔다 돌아오면 소리와 다른 화면은 다시 움직이는데 반딧불이만 멈춰 있다(밤). 원격 플레이어 목록도 같은 시간 동안 다시 골라지지 않는 것으로 보인다(코드 추정, 화면 확인 안 함).
- 원인: 탭이 숨겨지면 `frameloop`을 `'never'`, 돌아오면 `'always'`로 바꾼다(`src/components/forest/ForestExperience.tsx:102-107`). 설치된 `@react-three/fiber` 8.17.10의 `setFrameloop`은 바꿀 때마다 `clock.elapsedTime = 0`으로 되돌린다(`node_modules/@react-three/fiber/dist/events-321b05fb.esm.js:1379-1391`). 반딧불이는 `state.clock.elapsedTime`을 `lastUpdate`와 비교해 20fps로 갱신하는데(`Fireflies.tsx:84-86`), 돌아온 뒤 `t`는 0부터 다시 시작하고 `lastUpdate`는 이전 큰 값이라, `t`가 그 값을 넘을 때까지(탭을 떠나 있던 시간만큼) 갱신하지 않았다. `RemotePlayers.tsx`의 `lastSelect`도 같은 방식이었다.
- 수정:
  - `src/components/forest/Fireflies.tsx:84-89` — 비교 앞에 `if (t < lastUpdate.current) lastUpdate.current = t - 0.05;`를 넣어 시계가 되돌아간 경우 기준점을 당긴다.
  - `src/components/forest/RemotePlayers.tsx:443-447` — 같은 방식으로 `if (state.clock.elapsedTime < lastSelect.current) lastSelect.current = Number.NEGATIVE_INFINITY;`를 넣는다.
  - `ForestExperience.tsx`의 frameloop 전환은 그대로 둔다(탭 숨김 때 멈추는 건 의도). `Lighting.tsx`, `Sky.tsx`는 `useClock`/`Date.now()` 기반 시계를 써서 영향이 없어 고치지 않았다.
- 커밋: `1428098` fix: 탭 전환 뒤 반딧불이가 멈추던 문제 (BUG-03)
- 이슈 번호: #3
- 재발 방지 테스트: `docs/13-testing.md` "F. 시간과 분위기" — 밤에 다른 탭으로 10초 이상 갔다 돌아오면 반딧불이가 계속 움직인다.

## BUG-04 오두막 문이 열려 있는데 "문을 열고 들어가" 문구

- 발견: 2026-11-05 수동 테스트
- 이슈: #4
- 증상: 오두막 앞 표지판을 읽으면 "문을 열고 들어가 불을 지펴 보세요."가 나오는데, 문은 이미 열려 있다(여는 동작 없음).
- 원인: `src/components/forest/InteractionSystem.tsx:148`(수정 전)의 표지판 문구가 실제 동작과 맞지 않았다. 오두막 문은 늘 열린 상태이고 여는 상호작용이 없다.
- 수정:
  - `src/components/forest/InteractionSystem.tsx:148-149` — 문구를 `'오두막. 안으로 들어가 불을 지펴 보세요.'`로 바꾸고 위에 `// [BUG-04] 문은 늘 열려 있다 → 문구를 맞춘다.` 주석을 넣는다.
- 커밋: `44ecf4d` fix: 오두막 표지판 문구를 열린 문에 맞춤 (BUG-04)
- 이슈 번호: #4
- 재발 방지 테스트: `docs/13-testing.md` "D. 상호작용" — 오두막 앞 표지판 문구가 열린 문과 맞다. (BUG-04)

## BUG-05 걸을 때 "탁탁" 하는 딱딱한 발소리

- 발견: 2026-11-05 수동 테스트
- 이슈: #5 (FEAT-01과 함께 처리)
- 증상: 걸을 때 높고 딱딱한 "탁탁" 소리가 거슬렸다.
- 원인: 걸음마다 `audio.footprint()`와 함께 `audio.rustle()`(`src/lib/audio.ts` `burst(2600, 0.09, 0.5)`)이 울렸다. 2600Hz 대역 잡음을 크기 0.5로 바로 시작해 발소리(최대 약 0.15)보다 훨씬 크고 높았다. `footprint()` 자체도 `bandpass`(풀 1500Hz, 돌 2000Hz)라 높은 소리가 남았다.
- 수정:
  - `src/components/forest/Player.tsx:311` — 걸음마다 부르던 `audio.rustle()`을 지운다. 장작 줍기 등 다른 곳의 `rustle()`은 그대로 둔다.
  - `src/lib/audio.ts` `footprint()` — 필터를 `lowpass`(나무 500Hz, 흙 700Hz, 풀 800Hz, 돌 900Hz)로 바꾸고, 올라감 10ms·사라짐 0.22초, 음 높이 ±6%, 달리기 배율 1.35 → 1.2. 바닥별 크기와 리버브는 그대로.
- 커밋: `ca8b2ae` feat: 발소리를 부드럽게 (FEAT-01)
- 이슈 번호: #5
- 재발 방지 테스트: `docs/13-testing.md` "G. 사운드" — 발소리가 작고 부드럽다. 바람 소리와 새소리는 이전과 같다. (FEAT-01)

## BUG-06 스모크 스크립트에 PC 사용자 폴더 절대 경로

- 발견: 2026-11-06 0번(개인정보) 검사
- 이슈: #9
- 증상: `scripts/smoke-character.mjs`, `scripts/smoke-two.mjs`, `scripts/smoke-visual.mjs`의 스크린숏 저장 경로 `OUT`이 이 PC의 사용자 폴더 아래 임시 폴더 절대 경로였고, 그대로 공개 저장소에 올라갔다. 다른 PC에서는 그 폴더가 없어 스크립트가 실패하고(앞의 두 파일은 폴더를 만들지도 않았다), 사용자 폴더 이름이 드러난다.
- 원인: 스모크 스크립트를 만든 도구(OpenCode)가 자기 임시 폴더를 절대 경로로 적었고, 0번 검사가 세션의 약속일 뿐이라 그 커밋에는 적용되지 않았다.
- 수정:
  - 세 스크립트 — `OUT = fileURLToPath(new URL('../.screenshots', import.meta.url))`로 저장소 기준 `.screenshots/`(`.gitignore`에 있음)에 저장하고, 세 파일 모두 `fs.mkdirSync(OUT, { recursive: true })`로 폴더를 만든다.
  - `.githooks/pre-commit`(0번 검사)과 `.githooks/allow-patterns`를 넣고 `core.hooksPath .githooks`로 켠다. 누가 커밋하든 올릴 내용에 메일, 사용자 폴더 경로, 키·토큰이 있으면 커밋이 멈춘다. `.gitattributes`로 훅 파일 줄바꿈을 LF로 고정한다.
  - `AGENTS.md` — 절대 경로 금지, 훅이 막으면 `--no-verify` 금지, 기록 흐름(이슈 → `Refs` → `status:검증대기` → 확인 뒤 사람이 닫음).
- 남은 것: 이미 push된 기록(2026-11-03 커밋들)에는 경로가 남아 있다. 기록을 다시 쓸지는 eple이 정한다.
- 커밋: `50dc6c3` fix: 스모크 스크립트 저장 경로를 저장소 안으로, 0번 검사 훅 (BUG-06)
- 이슈 번호: #9
- 재발 방지 테스트: `docs/13-testing.md` "자동 검사"(pre-commit 훅)와 "I. 보안" — 저장소 전체 `git grep`에 사용자 폴더 경로가 0건이다. (BUG-06)

## BUG-07 오두막 벽난로가 벽에 박혀 흔들의자에서 보이지 않음

- 발견: 2026-11-05 수동 테스트(처음에는 "벽난로가 없다"로 적음), 2026-11-11 eple 다시 확인("벽에서 나무 하나 정도만 튀어나와 있다")
- 이슈: #11
- 증상: 흔들의자에 앉으면 앞에 벽난로가 있어야 하는데, 벽에서 나무 선반 하나만 튀어나와 보이고 돌 벽난로와 불이 보이지 않았다.
- 원인:
  - 위치: 벽난로 중심 `x -4.9`가 왼쪽 벽 안쪽 면(`x -4.92`) 근처라, 몸체(x -5.385 ~ -4.415)의 절반 넘게가 벽 속에 있었다.
  - 모양: 몸체가 속이 찬 상자 하나라 아궁이 안쪽(어두운 상자), 앞면 아치, 불이 모두 그 상자 안에 갇혀 보이지 않았다. 방에서는 벽과 비슷한 돌 면과 그보다 0.09m 더 나온 나무 선반만 보였다.
  - 굴뚝(z -153.7)이 벽난로 중심(z -152.4)과 1.3m 어긋나 있었다.
- 수정:
  - `src/lib/world.ts` — 벽난로 `x -4.9 → -4.43`(뒷면이 벽 안쪽 면에 붙음), 흔들의자 `x -2.75 → -2.28`(같은 0.47m 뒤로, eple 요청). 두 충돌 상자도 옮김(벽난로 x -4.92 ~ -3.65, 의자 x -2.68 ~ -1.88).
  - `src/components/forest/Cabin.tsx` `Fireplace()` — 몸체를 뒷판·양쪽 기둥·위 가로대·바닥 받침으로 나눠 가운데에 폭 1.6m·높이 1.1m 아궁이를 틈. 그을음 판과 불은 아궁이 안, 선반과 촛불은 가로대 앞면, 장작 바구니는 앞면 기준으로 옮김. 굴뚝 z는 벽난로 중심 z를 따름.
  - 장작 넣기 위치(`fireplace.x + 0.9`)와 벽난로 불빛은 `fireplace.x`를 따라 자동으로 옮겨짐.
- 커밋: `18c90ce` fix: 오두막 벽난로를 방 안으로 옮기고 아궁이를 틈 (BUG-07)
- 이슈 번호: #11
- 재발 방지 테스트: `docs/13-testing.md` "C. 앉기/눕기" — 흔들의자에서 벽난로와 불이 보이고, 벽에 박히지 않고, 사이를 걸을 수 있다. (BUG-07)

## BUG-08 캐릭터 선택 화면을 닫아도 탭 제목이 돌아오지 않음

- 발견: 2026-11-06 FEAT-04(#8) 화면 확인 중 Claude 발견(FEAT-04 이전 코드부터 그랬음)
- 이슈: #12
- 증상: 캐릭터 선택 화면을 한 번 열면 탭 제목이 "숲속여행 · 여행자를 골라 주세요"로 바뀐 채, 숲에 들어가거나 [모습 바꾸기]를 닫아도 그대로 남았다.
- 원인: 화면이 열릴 때 `useEffect`에서 `document.title`을 바꾸기만 하고, 닫힐 때(정리 함수) 원래 값으로 되돌리지 않았다.
- 수정: `src/components/ui/CharacterSelect.tsx` — 열 때 원래 제목을 기억해 두고 정리 함수에서 되돌림. 처음 고르기(`!characterId`일 때만 보이는 화면)와 [모습 바꾸기] 덮개 둘 다 고르거나 닫으면 화면이 사라져서 정리 함수가 돈다.
- 커밋: `43a50ad` fix: 캐릭터 선택 화면을 닫으면 탭 제목을 되돌림 (BUG-08)
- 이슈 번호: #12
- 재발 방지 테스트: `docs/13-testing.md` "A. 랜딩과 인증" — 캐릭터를 고르거나 [모습 바꾸기]를 닫으면 탭 제목이 돌아온다. (BUG-08)
