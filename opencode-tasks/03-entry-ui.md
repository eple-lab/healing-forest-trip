# 03 · 입장 화면 묶음 (항목 2, 3)

커밋 하나: `feat(ui): 숲에 들어가기 전 내 모습 확인·변경, 입구 알림판 제목 영역 분리`

## 읽을 파일
- `src/components/ui/CharacterSelect.tsx`
- `src/components/forest/ForestExperience.tsx` 70~125줄
- `src/app/api/profile/character/route.ts`
- `src/lib/characters.ts`, `src/lib/character-ids.ts`
- "숲으로 들어가기" 화면: `src/components/Landing.tsx` 200~240줄 근처(213줄에 제목). 그 외에는 grep `숲으로 들어가기`로 찾는다.
- `src/components/forest/NoticeBoard.tsx` (66줄), `src/lib/notices.ts`
- 참고 화면(eple 캡처): `docs/images/3 - 시작화면 다음 1.png`(들어가기 버튼), `docs/images/6 - 입구.png`(알림판). 이미지를 읽을 수 없으면 건너뛴다.

## 항목 2 · 처음 고른 뒤 캐릭터를 바꿀 수 없음
- 지금 흐름: `characterId`가 없을 때만 `CharacterSelect`를 보여 준다([ForestExperience.tsx:116](../src/components/forest/ForestExperience.tsx)).
- 원하는 흐름: "숲으로 들어가기" 버튼이 나오는 화면에 **지금 내 모습**(캐릭터 그림 또는 아이콘과 이름)과 **[모습 바꾸기]** 버튼을 함께 보여 준다.
  - [모습 바꾸기] → `CharacterSelect`를 다시 연다(지금 고른 것이 선택된 상태) → 고르면 다시 들어가기 화면으로 돌아온다.
  - 저장은 기존 `/api/profile/character`를 그대로 쓴다. 게스트도 바꿀 수 있어야 한다.
- 숲 안에서 바꾸는 기능은 이번 범위가 아니다. (이미 접속한 사람에게 보이는 모습이 바뀌는 처리는 필요 없다.)
- 키보드(Tab, Enter)로도 고를 수 있게 한다.

## 항목 3 · 입구 알림판의 이름과 종이 영역이 섞여 글자가 깨진 것처럼 보임
- 원하는 모양: 알림판 **위쪽에 제목 띠**("소식 · 입구 알림판")가 있고, 그 **아래 빈 판에 종이(공지)**가 붙는다.
- 방향:
  - 제목 띠는 짙은 나무판에 밝은 글씨로, 종이 영역은 연한 판으로 색을 나눈다.
  - 종이는 제목 띠와 겹치지 않게 아래 영역 안에만 배치한다. 종이 사이에 여백을 둔다.
  - 글자가 너무 작아 깨져 보이면 텍스처 해상도나 글자 크기를 키운다.
- 빈터 표지판처럼 다른 표지판에 쓰는 공통 코드가 있으면 알림판만 바꾼다.

## 문서
- `docs/13-testing.md` "A. 랜딩과 인증"에 추가한다.
  - [ ] 들어가기 화면에 내 모습이 보이고, [모습 바꾸기]로 바꾼 뒤 들어가면 바뀐 모습이다.
  - [ ] 새로고침해도 바꾼 모습이 남는다.
- "H. UI/접근성"에 추가한다.
  - [ ] 입구 알림판의 제목과 종이 영역이 나뉘어 보인다.
- `scripts/smoke-character.mjs`가 이 흐름과 관계있으면 읽어 보고 깨지지 않는지만 확인한다(실행 가능하면 실행).

## eple 확인 항목
- [ ] 들어가기 전에 내 모습이 보인다
- [ ] 모습을 바꾸고 들어가면 바뀐 모습이다
- [ ] 알림판 제목과 종이가 나뉘어 보이고 글자가 또렷하다
