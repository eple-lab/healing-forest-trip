# 06 · 월드 좌표와 지형

이 문서는 `src/lib/world.ts` 와 `shared/world.json` 의 기준을 설명한다.
3D 오브젝트와 이동/충돌이 같은 값을 참조하므로, 좌표를 바꾸면 화면과 물리가 함께 바뀐다.

## 공유 상수 (`shared/world.json`)

| 키 | 값 | 의미 |
| --- | --- | --- |
| `start` | `(0, 72)`, `yaw=π` | 산길 초입 시작점, 남쪽을 바라봄 |
| `clearing` | `(0, -62)`, `radius=23`, `chatRadius=24` | 빈터 중심/반경 |
| `cabin` | `(0, -152)`, `halfW=5`, `halfD=5` | 오두막 중심/반폭/반깊이 |
| `cabin.frontZ` / `backZ` | `-147` / `-157` | 앞/뒤 벽 |
| `cabin.floor1` / `floor2` | `0.32` / `3.42` | 1층/2층 바닥 높이 |
| `cabin.doorHalf` | `0.78` | 문 반폭 |
| `bounds` | `x=86`, `zMin=-225`, `zMax=105` | 이동 가능 범위 |
| `limits` | 채팅 240자 / 1.5s / 40명 / IP 8 | 서버·클라 공용 리밋 |

## 파생 상수 (`world.ts`)

- `CABIN.wallTop = 6.52`, `ridge = 8.45`, `doorTop = 2.42`, `porchZ = -144.2`
- `WINDOW`: 폭 4.8m, 아래 `floor2+0.62`, 위 `floor2+2.32`, `z = frontZ`
- `STAIRS`: `x 3.34~4.78`, `z -147.15~-151.7`, 11단, `floor1→floor2`
- `STAIR_HOLE`: `x 3.28~4.94`, `z -151.45~-146.75` (2층 바닥 구멍)
- `FURNITURE`: 벽난로/흔들의자/담요 테이블/주방/냉장고/싱크대/커피포트/장작더미/침대/창가/러그

## 지형 높이

`terrainHeight(x, z)` 는 다음을 합성한다.

1. `rawHeight`: 네 개의 사인/코사인 파동(진폭 약 ±1.6m)
2. 산길 평탄화: 가장 가까운 길 샘플까지 거리 2.4~9.5m 구간을 부드럽게 보간
3. 빈터 평탄화: 중심에서 반경 55%~+10m 구간 보간
4. 오두막 주변 평탄화: 벽에서 8~21m 구간 보간, 오두막 높이 0

길 샘플은 Catmull-Rom 으로 13개 제어점을 이어 만들고, 26스텝/구간으로 총 339개다.
`nearestPath` 는 선형 탐색이지만 샘플 수가 작아 프레임당 비용이 작다.

## 바닥 판정 `groundAt(x, z, feetY)`

후보:

- 지형 높이
- 현관 데크(`-3.5~3.5`, `porchZ~frontZ`) → `floor1`
- 1층 내부 → `floor1`
- 계단 → `stairsHeight` 보간값
- 2층(계단 구멍 제외) → `floor2`

`feetY + 0.62` 보다 높은 후보는 제외한다. 그래서 1층에 있을 때 2층 바닥으로
순간이동하지 않고, 계단을 밟아야 올라간다.

## 충돌

- `BOX_COLLIDERS`: 벽, 문 양옆, 2층 창 아래/양옆, 계단 난간, 가구, 2층 난간
- `TREE_COLLIDERS`: 360+20 그루의 나무 중 `|x|<80` 인 것의 원형 충돌
- 플레이어 반경 0.3m, 높이 1.55m 기준으로 AABB/원 충돌
- 이동은 x축과 z축을 따로 시도해 벽을 따라 미끄러진다.

## 존

`zoneAt(x, z)`:

1. 오두막 AABB(±0.6 여유) → `cabin`
2. 빈터 반경 23m → `clearing`
3. 그 외 → `trail`

서버도 같은 규칙을 `server.mjs` 의 `zoneAt` 에서 독립 구현한다. 좌표를 바꿀 때는
반드시 양쪽을 함께 수정한다.

## 숲 생성

- 시드 고정 `mulberry32(20261027)` → 새로고침해도 같은 숲
- 360그루 + 빈터 고리 34그루 + 오두막 주변 20그루
- 길 4.2m, 빈터 +1m, 오두막 +6.5m, 시작점 6m 이내는 비움
- 종류: pine(66%) / oak(34%), 크기 0.75~1.6
- 풀 1100, 덤불 260, 돌 90, 그루터기 7

## 새 오브젝트 추가 절차

1. `FURNITURE` 또는 새 상수에 좌표를 추가한다.
2. `Cabin.tsx`/`Clearing.tsx` 등에 메시를 만든다.
3. 필요하면 `BOX_COLLIDERS` 에 충돌체를 추가한다.
4. `groundAt` 에 바닥 후보가 필요하면 추가한다.
5. `InteractionSystem.tsx` 의 `buildTargets()` 에 상호작용을 추가한다.
6. 서버 검증이 필요한 행동이면 `server.mjs` 에 이벤트/존 검증을 추가한다.
7. `npm run typecheck && npm run build` 로 확인한다.

## 디버그 팁

- 좌표가 어긋나면 `playerState` 를 콘솔에 찍어 실제 발 위치를 확인한다.
- 2층이 안 올라가면 `STAIRS`/`STAIR_HOLE`/`groundAt`/`BOX_COLLIDERS` 의
  x·z·y 범위가 서로 맞는지 본다.
- 나무에 끼면 `TREE_COLLIDERS` 반경과 스폰 위치를 확인한다.
- 충돌이 과하면 `RADIUS`(0.3)와 `STEP_UP`(0.62)을 조정한다.
