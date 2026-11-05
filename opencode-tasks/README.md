# opencode 작업 지시서 (MVP 다듬기)

eple이 숲을 걸어 보고 찾은 19개 항목을 **7개 묶음**으로 나눴다.
**묶음 하나 = 새 세션 하나 = 커밋 하나.**

## 세션 시작 문장 (eple이 opencode에 붙여 넣을 것)

```
opencode-tasks/README.md, opencode-tasks/PROGRESS.md, opencode-tasks/0N-*.md 세 파일만 읽고 0N 묶음을 진행해.
```

`0N`만 바꿔서 쓴다. **"이어서 해"는 쓰지 않는다.** 이전 세션 내용은 PROGRESS.md에만 남긴다.

## 진행 순서

| 순서 | 파일 | 담긴 항목 | 크기 |
| --- | --- | --- | --- |
| 1 | [01-bugfix.md](01-bugfix.md) | 16·18 일어나면 못 움직임, 19 층 구분, 15 반딧불이 멈춤, 8 문 문구 | 중 |
| 2 | [02-walk-feel.md](02-walk-feel.md) | 4 달리기 속도, 5 발소리, 1 처음 바라보는 방향 | 소 |
| 3 | [03-entry-ui.md](03-entry-ui.md) | 2 캐릭터 확인·변경, 3 입구 알림판 | 중 |
| 4 | [04-ring-road.md](04-ring-road.md) | 6 원형 길, 빈터·오두막 위치 옮기기, 이정표 | **대** (세션 2개로 나눔) |
| 5 | [05-minimap.md](05-minimap.md) | 7 2D 지도 | 중 |
| 6 | [06-cabin.md](06-cabin.md) | 17 벽난로, 10 창문·외부등·데크, 9 실내 조명 | 대 |
| 7 | [07-yard.md](07-yard.md) | 11 식탁, 12 모닥불·차, 13 해먹·줄조명, 14 반딧불이 | 대 |

순서를 지킨다. 04에서 오두막 위치가 바뀌므로, 05~07은 04가 끝난 뒤의 좌표를 기준으로 한다.

## 공통 규칙 (모든 묶음에 적용)

### 토큰 아끼기 (무료 계정)
- 위의 세 파일과, 묶음 파일의 **"읽을 파일"**에 적힌 것만 읽는다. 저장소 전체를 둘러보지 않는다.
- 300줄이 넘는 파일(`Cabin.tsx` 1021줄, `world.ts` 563줄, `InteractionSystem.tsx` 554줄, `audio.ts` 488줄, `RemotePlayers.tsx` 481줄)은 grep으로 위치를 찾은 뒤 **필요한 줄 범위만** 읽는다.
- `node_modules`, `.next`, `docs/images`, `chat_backup_*.json`은 열지 않는다.
- 검사는 묶음 끝에 한 번만 돌린다: `npm run typecheck` → `npm run lint`. 실패하면 고치고 다시 돌린다.
- 남은 토큰이 걱정되면 **바로 멈추고 PROGRESS.md부터 적는다.**

### 범위
- 묶음 파일에 적힌 항목만 고친다. 다른 묶음의 항목이나 눈에 띈 다른 문제는 고치지 않고 PROGRESS.md의 "발견한 것"에 한 줄로 적는다.
- **바람 소리, 새소리는 건드리지 않는다.** (eple이 "최고"라고 한 부분)
- 새 npm 패키지를 추가하지 않는다.
- `README.md`의 화면 캡처, `PRD.md`, `retrospective.md`는 고치지 않는다. (02 묶음에서 README 안내 문장 한 줄만 예외)

### 주석
- 고친 코드 바로 위에 항목 번호와 이유를 한국어 한두 줄로 적는다.
  ```ts
  // [BUG-01] 일어날 때 의자 충돌 상자 안에 갇혀 못 움직였다 → 앉은 방향의 앞쪽 빈 바닥으로 내려 준다.
  ```
- 기능 추가는 `// [MVP-6]`처럼 eple 항목 번호를 쓴다.

### 커밋
- 묶음 하나에 커밋 하나. 메시지 형식은 기존 저장소를 따른다: `fix(forest): ...`, `feat(forest): ...`, `docs(log): ...`
- 메시지 본문에 담긴 eple 항목 번호를 적는다. 예: `항목: 16, 18, 19, 15, 8`
- **커밋 전에 바뀐 파일 목록과 요약을 eple에게 보여 주고 "형상관리에 올려도 될까요?"라고 물은 뒤 기다린다.**
- push는 하지 않는다.

### 세션 끝
1. PROGRESS.md의 해당 묶음 칸을 채운다(5줄 이내).
2. eple에게 **한 것 / 직접 확인한 것 / 확인 못 한 것**으로 보고한다.
3. 다음 묶음은 이어서 하지 않고 세션을 끝낸다.

### 화면 확인
- opencode는 3D 화면을 직접 볼 수 없다. 그래서 각 묶음의 **"eple 확인 항목"**을 보고에 그대로 옮겨 eple에게 확인을 부탁한다.
- `npm run dev` → http://localhost:3000 → 게스트 입장.

## 좌표 미리 알기 (지금 기준, 04 전)

`shared/world.json`
- 시작점 `x 0, z 72`, 바라보는 방향 `yaw π`
- 빈터 중심 `x 0, z -62`, 반지름 23
- 오두막 중심 `x 0, z -152`, 앞벽 `z -147`, 1층 높이 0.32, 2층 높이 3.42
- 이동 가능 범위 `x ±86`, `z -225 ~ 105`

앞쪽 방향 계산: `forward = (-sin(yaw), -cos(yaw))` ([Player.tsx](../src/components/forest/Player.tsx), [InteractionSystem.tsx:521](../src/components/forest/InteractionSystem.tsx)). `yaw 0`이면 `-z`(빈터 쪽)를 본다.
