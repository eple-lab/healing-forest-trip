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
- 커밋: fix(forest): 앉았다 일어나면 움직일 수 없던 문제 (BUG-01)
- 이슈 번호: #1
- 재발 방지 테스트: `docs/13-testing.md` "C. 앉기/눕기" — 그루터기, 벤치, 흔들의자, 1층 의자, 2층 큰 창가, 침대에서 각각 일어난 뒤 W·A·S·D로 바로 걸을 수 있다.

## BUG-02 1층에서 "큰 창가에 앉기" 알림이 뜸

- 발견: 2026-11-05 수동 테스트
- 이슈:
- 증상: 오두막 1층에 있는데 2층 대상인 "큰 창가에 앉기" 알림이 뜨고, E를 누르면 2층 창가로 순간이동해 앉는다. 반대로 2층에서 바로 아래 1층 가구(무릎담요 테이블, 벽난로 등)의 알림이 뜰 수 있다.
- 원인: 알림 대상을 고르는 거리 계산이 x·z만 봤고(`src/components/forest/InteractionSystem.tsx:516`), `Target` 타입에 높이 정보가 없었다. 1층 바닥 `CABIN.floor1` = 0.32, 2층 바닥 `CABIN.floor2` = 3.42(`shared/world.json:12-13`)로 3.1m 차이를 구분하지 못했다. `playerState.y`는 발 높이다(`Player.tsx:359`에서 `pos.current.y`, 앉으면 `seat.feetY`).
- 수정:
  - `src/components/forest/InteractionSystem.tsx:118-129` — `Target`에 `y?: number`(대상 바닥 높이, 발 기준) 추가. 값이 없으면 높이를 보지 않는다(바깥 대상).
  - `src/components/forest/InteractionSystem.tsx:244-260` — 좌석에 `y: seat.feetY`를 넣는다.
  - `src/components/forest/InteractionSystem.tsx` — 오두막 1층 대상(벽난로, 무릎담요 테이블, 냉장고, 커피, 싱크)에 `y: CABIN.floor1`을 넣는다. 바깥 대상(화덕, 알림판, 표지판, 장작더미)은 넣지 않는다.
  - `src/components/forest/InteractionSystem.tsx:532` — 거리 비교 앞에 `if (target.y !== undefined && Math.abs(playerState.y - target.y) > 1.2) continue;`를 넣어 다른 층 대상을 건너뛴다. 1.2m면 계단 중간(약 1.9m)에서는 양쪽 층 알림이 모두 안 뜨고, 같은 층에서는 뜬다.
- 커밋: fix: 1층에서 2층 창가 알림이 뜨던 문제 (BUG-02)
- 이슈 번호:
- 재발 방지 테스트: `docs/13-testing.md` "C. 앉기/눕기" — 1층에 있을 때 2층 대상(큰 창가, 침대)의 알림이 뜨지 않고, 2층에 올라가면 뜬다. 2층에서 1층 가구 알림이 뜨지 않는다.
