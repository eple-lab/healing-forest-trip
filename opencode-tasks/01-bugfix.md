# 01 · 버그 묶음 (항목 16, 18, 19, 15, 8)

커밋 하나: `fix(forest): 앉았다 일어나기, 층 구분 알림, 반딧불이 재개, 오두막 문 문구`

## 읽을 파일
- `src/components/forest/Player.tsx` (371줄, 앉기 185~235줄)
- `src/components/forest/InteractionSystem.tsx` 1~150줄, 500~554줄
- `src/lib/world.ts`: `groundAt`, 충돌 함수, 가구 충돌 상자 부분만 grep으로 찾아 읽기
- `src/components/forest/Fireflies.tsx` (118줄)
- `src/components/forest/ForestExperience.tsx` 75~150줄
- `docs/13-testing.md` 38~47줄, `docs/16-test-plan.md` 97~110줄

## BUG-01 · 앉았다 일어나면 움직이지 못함 (항목 16 큰 창가, 18 오두막 1층 의자 등)
- **증상**: 2층 큰 창가나 오두막 1층 의자에 앉았다 일어나면 걸을 수 없다.
- **추정 원인** (확인 필요): 앉을 때 `pos.current`를 의자 좌표로 옮긴다([Player.tsx:195](../src/components/forest/Player.tsx)). 일어날 때는 y만 다시 잡고([Player.tsx:228](../src/components/forest/Player.tsx)) x, z는 그대로라서, 가구 충돌 상자 안에 갇히는 것 같다.
- **먼저 할 일**: 원인을 코드로 확인한다. 충돌 함수가 "이미 상자 안에 있으면 모든 이동을 막는" 구조인지 본다.
- **고치는 방향**:
  - 각 Seat에 일어날 자리(`standX`, `standZ`)를 두거나, 앉은 방향의 반대(의자 앞)로 0.6~0.8m 떨어진 **충돌 없는 바닥**을 찾아 내려 준다.
  - 그래도 상자 안이면, 상자 안에서 바깥으로 나가는 이동은 허용하는 안전장치를 둔다.
- **모든 의자에 적용**: 그루터기, 통나무 벤치, 흔들의자, 1층 의자, 2층 큰 창가, 침대.

## BUG-02 · 1층에서 "2층 큰 창가에 앉기" 알림이 뜸 (항목 19)
- **원인** (코드로 확인함): [InteractionSystem.tsx:515](../src/components/forest/InteractionSystem.tsx)에서 거리를 `hypot(x, z)`로만 잰다. 그래서 층이 달라도 위치가 겹치면 알림이 뜬다.
- **고치는 방향**: 대상에 높이 정보(`y` 또는 `floor`)를 두고, `|playerState.y - target.y| > 1.2`이면 건너뛴다. 의자(Seat)는 `feetY`를 쓴다. 2층에 있는 것(창가, 침대 등)은 모두 확인한다.

## BUG-03 · 다른 탭에 갔다 오면 반딧불이만 멈춤 (항목 15)
- **증상**: 크롬에서 다른 탭에 갔다 오면 소리와 다른 화면은 다시 움직이는데 반딧불이만 멈춰 있다.
- **관련 코드**: 탭이 숨겨지면 `frameloop`을 `'never'`로 바꾼다([ForestExperience.tsx:102](../src/components/forest/ForestExperience.tsx)). 반딧불이는 `state.clock.elapsedTime`과 `lastUpdate`를 비교해 0.05초마다 갱신한다([Fireflies.tsx:84](../src/components/forest/Fireflies.tsx)).
- **추정**: 다시 켜질 때 시계 값이 이전 `lastUpdate`보다 작아지면(초기화 등) `t - lastUpdate < 0.05` 조건 때문에 오랫동안 갱신하지 않는다. **원인은 확인하지 못했다.** 먼저 확인한다.
- **고치는 방향**: `t < lastUpdate`이면 `lastUpdate`를 `t`로 되돌린다. 또는 `elapsedTime` 대신 `delta`를 더한 자체 누적 시간을 쓴다. 다른 컴포넌트도 같은 방식을 쓰는지 grep으로 `lastUpdate`를 찾아 같이 고친다.

## BUG-04 · 오두막 문이 열려 있는데 "문을 열고 들어가" 문구 (항목 8)
- [InteractionSystem.tsx:145](../src/components/forest/InteractionSystem.tsx) `'오두막. 문을 열고 들어가 불을 지펴 보세요.'`
- 문구를 바꾼다: `'오두막. 안으로 들어가 불을 지펴 보세요.'`
- 같은 뜻의 문구가 다른 곳에도 있는지 grep으로 `문을 열`을 찾는다(알림판 `src/lib/notices.ts` 포함).

## 문서
1. **`docs/20-bugfix-log.md` 새로 만들기**: 버그마다 아래 형식으로 적는다.
   ```
   ## BUG-01 앉았다 일어나면 움직이지 못함
   - 발견: 2026-11-05, eple 수동 테스트 (항목 16, 18)
   - 증상:
   - 원인:
   - 수정: 파일:줄, 방법
   - 커밋: (커밋 후 해시)
   - 재발 방지 테스트: 13-testing C-8, C-9
   ```
2. **`docs/13-testing.md`**: "C. 앉기/눕기"에 추가한다.
   - [ ] 앉을 수 있는 모든 자리(그루터기, 벤치, 흔들의자, 1층 의자, 2층 창가, 침대)에서 일어난 뒤 W·A·S·D로 바로 걸을 수 있다. (BUG-01)
   - [ ] 1층에 있을 때 2층 대상(창가, 침대)의 알림이 뜨지 않는다. 2층에 올라가면 뜬다. (BUG-02)
   
   "F. 시간과 분위기"에 추가한다.
   - [ ] 밤에 다른 탭으로 10초 이상 갔다 돌아오면 반딧불이가 계속 움직인다. (BUG-03)
   
   "D. 상호작용"에 추가한다.
   - [ ] 오두막 앞의 안내 문구가 열린 문과 맞다. (BUG-04)
3. **`docs/16-test-plan.md`** "6. 결함 처리"에 한 줄 추가: `수정한 결함은 docs/20-bugfix-log.md에 기록하고, 재발 방지 항목을 13-testing.md에 추가한다.`
4. 커밋한 뒤 bugfix-log의 커밋 칸에 해시를 적는다. 이 수정은 다음 묶음 커밋에 함께 넣어도 된다고 PROGRESS에 적는다.

## eple 확인 항목 (보고에 그대로 옮길 것)
- [ ] 2층 창가에 앉았다가 E로 일어난 뒤 걸어진다
- [ ] 1층 의자, 흔들의자, 침대도 같다
- [ ] 1층에서 2층 창가 알림이 안 뜬다
- [ ] 밤에 탭을 바꿨다 돌아와도 반딧불이가 움직인다
- [ ] 오두막 앞 문구가 바뀌었다

## 하지 말 것
- 걷기 속도, 발소리, 처음 방향은 02 묶음이다. 여기서 고치지 않는다.
