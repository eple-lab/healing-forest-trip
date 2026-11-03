# 16 · 테스트 계획

대상: Render+Neon 배포 전/후, 로컬/스테이징.
작성일: 2026-11-03 · 기준 커밋: `d6b328c` (feat: 입구 알림판 + 캐릭터 선택)

## 1. 범위

이번 사이클에서 검증할 기능:

- 로그인/로그아웃, 브라우저 세션 쿠키 자동 로그아웃
- 최초 로그인 캐릭터 선택(남자 2·여자 2·강아지·고양이)
- 입구 알림판(`NoticeBoard`)와 `GET /api/announcements` (ETag/304), 관리자 Neon 변경 시 소켓 푸시
- 소켓 멀티플레이(100ms `players:move` 배치, 72m 거리 필터, 40명 정원)
- 배포 보안 헤더/CSP/레이트리밋/캐싱
- 성능(빌드 크기, dpr 1.5, 숨겨진 탭 frameloop 중지, 원격 12명 컬링)

## 2. 전제와 제한

- 검증은 로컬(`db=off`, 인메모리) 기준. Neon 직결(`DATABASE_LISTEN_URL`) LISTEN/NOTIFY 는 별도 스테이징에서 확인한다.
- HSTS/`upgrade-insecure-requests` 는 `NODE_ENV=production` 에서만 발동한다.
- 자동 테스트 스크립트는 로컬 서버(`npm run dev`)가 켜져 있을 때 동작한다.

## 3. 환경

| 구성 | 값 |
| --- | --- |
| OS/브라우저 | Windows 11 · Chrome (기본 사용 기준) |
| Node | 20.11+ |
| 앱 | Next.js 14.2.18, Socket.IO 4.8 |
| DB | 로컬: 없음 · 스테이징: Neon pooled + (선택) 직결 |

## 4. 실행 순서

1. `npm.cmd run typecheck`
2. `npm.cmd run build`
3. `npm.cmd run lint`
4. `npm run dev` 기동
5. `node scripts/smoke-visual.mjs` — 랜딩/걷기/오두막/모바일/콘솔 오류
6. `node scripts/smoke-two.mjs` — 2탭 접속·동기화·퇴장
7. `node scripts/smoke-character.mjs` — 캐릭터 선택/유지/새로고침, 알림판 API
8. `node scripts/security-smoke.mjs` — 헤더/소켓/프로필 API
9. `node scripts/security-ratelimit.mjs` — 로그인 경로 429 검증 (검증 후 서버 재시작)
10. 수동 체크(docs/13) — 계단·벽난로·채팅·앉기
11. 결과 기록(docs/18-test-report.md)

## 5. 테스트 항목

### A. 인증

| ID | 항목 | 기대 |
| --- | --- | --- |
| A-01 | 게스트 닉네임 1자 | 버튼 비활성, 오류 |
| A-02 | 게스트 2~16자 | `/forest` |
| A-03 | 세션 쿠키 | `expires=-1` (브라우저 종료 시 삭제) |
| A-04 | 탭 닫기 | 접속자 수 즉시 감소 |
| A-05 | 전원/네트워크 차단 | ping 12s/8s 로 20초 내 정리 |
| A-06 | 로그아웃 | `/` 이동, 세션 삭제 |
| A-07 | `/api/profile/character` 무인증 | 401 |
| A-08 | `/api/profile/character` 잘못된 id | 400 |
| A-09 | `/api/profile/character` 유효 | 200, `ok:true` |

### B. 캐릭터

| ID | 항목 | 기대 |
| --- | --- | --- |
| B-01 | 첫 로그인 | 캐릭터 선택 화면(6종) |
| B-02 | 선택 후 진입 | 숲 렌더, 원격에도 반영 |
| B-03 | 새로고침 | 선택 유지, 선택 화면 미표시 |
| B-04 | 강아지/고양이 | 네 발 동작·꼬리 흔들림 |
| B-05 | 잘못된 character id | 서버 400 |

### C. 알림판

| ID | 항목 | 기대 |
| --- | --- | --- |
| C-01 | 입구 보드 근접 | HUD `E · 입구 알림판 읽기` |
| C-02 | 읽기 후 닫기 | 읽음 처리, 미읽은 배지 0 |
| C-03 | 캐싱 | 12시간 캐시면 재조회 없음 |
| C-04 | `If-None-Match` | 304 응답 |
| C-05 | DB 변경(관리자) | `notices:changed` 푸시 → 강제 갱신 |
| C-06 | DB 없음 | 기본 안내 1건 표시, 서비스 정상 |

### D. 멀티플레이/성능

| ID | 항목 | 기대 |
| --- | --- | --- |
| D-01 | 2탭 접속 | 서로 보임, HUD 2명 |
| D-02 | 이동 패킷 | `players:move` 배열, `player:move` 미수신 |
| D-03 | 원격 렌더 | 12명·72m 컬링 |
| D-04 | 숨겨진 탭 | frameloop=never |
| D-05 | 40명 정원/IP 8개 | 서버 거부 안내 |

### E. 보안

docs/17-security-test-plan.md 참조.

## 6. 결함 처리

- 재현·로그·스크린샷·/healthz 포함해 이슈 작성.
- 로그인 관련 결함은 실패율 0 요구(A).
- 보안/세션/리디렉트 결함은 릴리스 차단.

## 7. 현재 상태

구현 완료(커밋 `d6b328c`). 결과는 docs/18-test-report.md, 보안은 docs/19-security-report.md 참조.
