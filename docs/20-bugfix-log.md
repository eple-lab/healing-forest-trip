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
