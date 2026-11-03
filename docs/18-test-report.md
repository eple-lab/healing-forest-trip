# 18 · 테스트 결과 보고

실행일: 2026-11-03 · 환경: Windows 11, Chrome, `db=off` · 기준 커밋: `d6b328c`

## 요약

| 구분 | 결과 |
| --- | --- |
| typecheck / lint / build | **PASS** (`tsc`, `next lint` “No ESLint warnings or errors”, `next build` 통과) |
| 자동 스모크(2탭/캐릭터/보안) | **PASS** |
| 인증·세션 만료 | **PASS** |
| 입구 알림판 + 캐싱 | **PASS** |
| 콘솔 오류 | **없음** (smoke-character, smoke-visual 모두 0건) |
| DB(Neon) 경로 | **미실행** (로컬 `db=off`, 기능은 폴백으로 동작) |
| Google OAuth | **미실행** (로컬에서 Google 키 미설정, 게스트만 검증) |

## 상세 결과

### 빌드·정적 검사

- `npm.cmd run typecheck` → 성공(0 error).
- `npm.cmd run lint` → `.eslintrc.json` 추가 후 **No ESLint warnings or errors**.
- `npm.cmd run build` → 통과. Route: `/` 109 kB, `/forest` 268 kB(First Load 364 kB), 7 pages.
- `/forest` First Load JS < 400 kB 목표 **충족**.

### 보안 스모크 (`node scripts/security-smoke.mjs`)

- 헤더: CSP/frame-ancestors/X-Frame-Options/Referrer-Policy/COOP/CORP/Origin-Agent-Cluster/X-Permitted-Cross-Domain-Policies 모두 정상, **X-Powered-By 없음**.
- 인증 응답: `Cache-Control: no-store`, `Pragma: no-cache` 확인.
- 공지 API: 200, ETag 존재, `If-None-Match` → **304**.
- 소켓: 악성 Origin 연결 불가, invalid cookie → `unauthorized`, valid cookie → `welcome`.
- 게스트 로그인 → 200, 세션 쿠키 **Expires 없음**(브라우저 종료 로그아웃), `/api/profile/character` 무인증 401 / 잘못된 id 400 / 유효 id 200.

### 2탭 멀티플레이 (`node scripts/smoke-two.mjs`)

- A/B 모두 접속, HUD `지금 2명`.
- A가 B의 움직임을 **28개 `players:move` 배치** 수신, 단수 `player:move` 0건.
- A 탭 종료 후 B의 HUD가 `지금 1명`으로 즉시 갱신.

### 탭 퇴장/전원 차단

- 탭 닫기 → **28 ms** 내 접속자 목록에서 제거.
- 네트워크 오프라인(DevTools) 후 **7.6 s** 내 제거 확인(설정: ping 12s/pong 8s).

### 캐릭터 선택 (`node scripts/smoke-character.mjs`)

- 첫 로그인: 선택 화면 표시(6종).
- A/B 두 탭: 강아지/고양이 선택, 상호 HUD `지금 2명`.
- A 새로고침 후 **선택 화면 미표시**, canvas 정상(`0/1`), 콘솔 이슈 0건.
- `/api/announcements`: 200 + ETag, 조건부 GET → 304.

### 자동 회귀(시각) (`node scripts/smoke-visual.mjs`)

- 랜딩 → 로그인 → 오두막 진입까지 스크린샷 생성, **콘솔 오류 없음**, 모바일 뷰포트 통과.

### 429 레이트리밋 (`node scripts/security-ratelimit.mjs`)

- `/api/auth/callback/guest` 70회 호출: `200×57, 429×13`, 첫 429는 **요청 #58**(직전 테스트에서 누적된 시도 포함, 설정 상한 60/10분). 정상 동작. 검증 후 서버 재시작으로 제한 해제.

### 프로덕션 모드 헤더 (임시 production 기동)

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` **존재**
- CSP `upgrade-insecure-requests` 포함, `'unsafe-eval'` 미포함
- `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`

## 미실행/주의

- Neon 실환경에서 `LISTEN announcements_changed` 및 인덱스/트리거 적용은 스테이징에서 1회 확인 필요.
- Google OAuth 실계정 흐름(리디렉션 URI 등록 포함)은 운영 배포 후 확인.
- 부하 테스트(동시 40명)는 수행 전. 단일 인스턴스 기준 서버 로직/프로토콜은 통과.

## 산출물

- 테스트 계획: docs/16-test-plan.md
- 시큐리티 계획: docs/17-security-test-plan.md
- 보안 결과: docs/19-security-report.md
- 자동 스크립트: `scripts/smoke-visual.mjs`, `smoke-two.mjs`, `smoke-character.mjs`, `security-smoke.mjs`, `security-ratelimit.mjs`
