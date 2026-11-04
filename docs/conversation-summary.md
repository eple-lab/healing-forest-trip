# 대화 요약 · Healing Forest Trip

- 작성일: 2026-11-03
- 목적: 긴 대화의 핵심 결정사항·변경사항·검증 결과·남은 할 일을 보관한다.
- 원문 전체(채팅 JSON)는 별도 비공개 보관을 권장한다(내부 명령/로그 포함).

## 1. 프로젝트 한 줄 요약

여러 사람이 같은 숲에 들어와 조용히 걷고, 빈터에서 짧은 이야기를 나누고, 2층 오두막의 벽난로 곁에서 쉬는 **1인칭 멀티플레이어 힐링 웹 앱**을 Next.js + React Three Fiber + Socket.IO 로 만들었다. 외부 3D/음원 에셋 없이 절차 생성한다.

## 2. 최종 스택

- Next.js 14.2.18 (App Router) · React 18.3 · TypeScript · R3F 8.17 · drei · three 0.169
- NextAuth 4.24.15 (Google OAuth + 게스트 Credentials, JWT 세션)
- Socket.IO 4.8 (커스텀 `server.mjs` 단일 프로세스: Next + 소켓 + DB)
- Neon Postgres (선택, 없으면 인메모리) · pg 8.13 (파라미터 바인딩만)
- 배포 목표: Render Web Service (numInstances=1) + `/healthz`

## 3. 이번 대화에서 결정/구현한 것

### 인증과 자동 로그아웃

- 세션 토큰 쿠키에서 `Expires`/`Max-Age`를 제거해 **브라우저 세션 쿠키**로 발급
  (`src/app/api/auth/[...nextauth]/route.ts`).
- `pagehide`에서 소켓 즉시 종료, `pageshow`(bfcache)에서 재연결.
- 서버 ping 12s / pong 8s, close 패킷 유실 시 최대 ~20초 내 정리.
- 측정: 탭 닫기 **28ms**, 네트워크 차단 **7.6s** 내 접속자 목록 제거.

### 입구 알림판(공지)

- Neon `announcements` 테이블(관리자가 SQL로 작성, 앱에 공개 쓰기 없음).
- 트리거가 `pg_notify('announcements_changed')` → 서버 `LISTEN`(직결 `DATABASE_LISTEN_URL`) 또는 **30초 폴링** → 모든 접속자 `notices:changed` 푸시.
- `/api/announcements`: 60초 서버 캐시 + ETag(`if-none-match` → 304).
- 클라이언트: 12시간 localStorage 캐시, 읽으면 재조회 안 함, "새 소식 확인" 수동 갱신.
- 3D 입구 알림판(`NoticeBoard`) → `E · 입구 알림판 읽기` → 패널(고정/최신, 중요 배지).

### 캐릭터 선택(최초 로그인)

- 6종: 남자 2 / 여자 2 / 강아지 / 고양이.
- 저장: localStorage + Neon `users.character`, `POST /api/profile/character`(세션 없으면 401, 화이트리스트 외 400).
- 원격 플레이어는 사람/동물 분기 렌더(걷기·꼬리 흔들림).

### 다중 접속 성능

- 서버: `players:move` **100ms 배치**, 수신자 72m 밖 제외(`volatile`), 40명 정원/IP당 8개.
- 클라이언트: 일괄 `upsertPlayers`, 원격 **12명·72m 컬링**, 25m 밖 그림자 끔, 공유 geometry/material.
- dpr 상한 1.5, 숨겨진 탭 `frameloop='never'`, Sky 250ms·Fireflies 20fps 스로틀.

### 보안

- nonce CSP, `frame-ancestors 'none'`, X-Frame-Options, CORP/COOP/`Origin-Agent-Cluster`, `X-Permitted-Cross-Domain-Policies`, `X-Powered-By` 숨김, `/​_next/image` 404.
- 로그인/콜백 IP당 **60회/10분 → 429** (검증 완료).
- 인증 응답 `Cache-Control: no-store`, `Pragma: no-cache`.
- `next-auth` 4.24.15, `drei` 9.122.0 패치 적용.

### 서버 유형별 정원

- `SERVER_TIER=small|medium|large` → **40 / 120 / 250명**, 또는 `MAX_PLAYERS(2~500)` 직접 지정.
- 응답 `presence.max`가 그대로 HUD에 반영.

## 4. 검증(결과 보고)

- `typecheck` / `lint`(새 `.eslintrc.json`) / `build` **통과**.
- Smoke: `smoke-visual`, `smoke-two`, `smoke-character`, `security-smoke`, `security-ratelimit` 모두 **PASS**.
- 콘솔 오류 **0건**.
- `/api/announcements` 200 + ETag, 304 확인.
- 상세: `docs/18-test-report.md`, 시큐리티: `docs/19-security-report.md`
  - 잔여 위험: `next` critical, `postcss` high (Next 16 필요) → 미적용 명시, 이미지 최적화/Server Actions 미사용으로 완화.

## 5. 문서

- README, PRD, docs 01~19 작성 완료(총 **19종**).
- 주요 파일:
  - `docs/05-multiplayer.md` (접속 종료/배치 프로토콜)
  - `docs/08-security.md` (보안 모델)
  - `docs/11-performance.md` (비용 모델)
  - `docs/12-deployment.md` (Render+Neon 절차서 존재; `SERVER_TIER` 반영)
  - `docs/16-19` (테스트 계획/결과, 보안 보고서)

## 6. 현재 상태

- Git 작업 트리: 이 파일을 추가하기 전까지 **깨끗함** (모두 커밋됨).
- 로컬 서버(`npm run dev`, db=off)에서 모든 흐름 동작 확인.
- 미실행: Neon 실환경 LISTEN 푸시, Google OAuth 실계정, 40명 부하 테스트 → 스테이징 권장.

## 7. 다음 할 일

1. Render + Neon 배포(Blueprint `render.yaml` 사용), `DATABASE_LISTEN_URL`(직결) 설정, `/healthz` 확인.
2. Neon 스테이징에서 `INSERT INTO announcements …` 후 3000/다른 탭에 푸시 반영 확인.
3. Google OAuth 리디렉션 URI 등록 및 실계정 로그인 확인.
4. Next 16 메이저 업그레이드 스프린트(잔여 audit 처리).

## 8. 핵심 명령

```powershell
npm.cmd run dev         # 로컬 서버
npm.cmd run typecheck   # 타입 검사
npm.cmd run build       # 빌드
node scripts/smoke-two.mjs          # 2탭 회귀
node scripts/smoke-character.mjs    # 캐릭터/알림판 API
node scripts/security-smoke.mjs     # 헤더/소켓/세션
node scripts/security-ratelimit.mjs # 로그인 60회/10분 제한 확인
```

## 9. ⭐ 가장 효과적이었던 프롬프트

> **"단계 단계별로 커밋하고 있어?"**

- 그때까지 AI는 코드를 계속 쓰고 있었지만 커밋은 하나도 하지 않은 상태였다. 무엇이 바뀌었는지 사람이 확인할 방법이 없었다.
- 이 질문 다음부터 기능별 커밋(기본 구현 → 자동 로그아웃 → 성능 → 보안 …)으로 나뉘었고, AI의 작업 결과를 하나씩 볼 수 있게 됐다.
- 포인트는 세세한 지시(뒤의 19개 항목 같은)가 아니라, **AI가 놓치고 있던 행동을 짚은 것**이다. (eple)
- 회고: [retrospective.md](../retrospective.md)
