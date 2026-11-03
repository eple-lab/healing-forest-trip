# 🌲 숲속여행 (Healing Forest Trip)

여러 사람이 같은 숲에 들어와 조용히 걷고, 빈터에서 짧은 이야기를 나누고, 2층 오두막의 벽난로 곁에서 쉬어 가는 **1인칭 멀티플레이어 힐링 웹 앱**입니다.

- 산길 초입 → 숲의 빈터 → 오솔길 → 숲속 오두막으로 이어지는 하나의 길
- WASD/방향키 + 마우스(포인터락) 1인칭 걷기, Shift 달리기
- 잘린 나무 밑동·통나무 벤치·흔들의자·큰 창가·침대에 앉기/눕기
- 빈터에서만 열리는 실시간 대화, 접속자 수/존 표시
- 장작을 주워 벽난로에 넣으면 서버 권위로 불이 커짐
- 흔들의자에서 무릎담요 덮기, 주방의 커피·물 마시기
- 2층 큰 창으로 한국 시간의 해·달·별과 숲을 바라보기
- 외부 음원 없이 Web Audio 로 합성하는 바람·새소리·발소리·장작 소리
- Google 로그인 + 게스트 로그인, 이메일 미수집
- 브라우저를 닫거나 컴퓨터가 꺼지면 세션이 끊어져 접속자 목록에서 즉시 빠짐
- 다중 접속을 위한 이동 배치 전송·원거리 컬링·dpr 상한(기본 크롬 기준)

## 빠른 시작

```bash
# Node.js 20.11 이상
npm install

copy .env.example .env.local   # Windows
# cp .env.example .env.local  # macOS/Linux

npm run dev
# → http://localhost:3000
```

`.env.local` 에 `NEXTAUTH_SECRET`(32자 이상)만 채우면 게스트 로그인으로 바로 들어갈 수 있습니다.
Google 로그인을 쓰려면 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 을 추가하고,
승인된 리디렉션 URI 에 `http://localhost:3000/api/auth/callback/google` 을 등록하세요.

DB 없이도 모든 기능이 동작합니다(방문/채팅/장작 상태만 저장되지 않음).
Neon Postgres 를 연결하려면:

```bash
# .env.local 에 DATABASE_URL 추가 후
npm run db:migrate
```

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 커스텀 서버(Next + Socket.IO) 개발 모드 |
| `npm run build` | Next.js 프로덕션 빌드 |
| `npm start` | 프로덕션 서버 실행 (`node server.mjs`) |
| `npm run typecheck` | TypeScript 검사 |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Neon 스키마 적용 (멱등) |
| `npm run db:prune` | 30일 채팅 / 90일 방문 / 180일 감사 로그 정리 |
| `node scripts/smoke-visual.mjs` | 랜딩~오두막 고급 회귀(스크린샷, 콘솔 오류 수집) |
| `node scripts/smoke-two.mjs` | 2탭 멀티플레이 회귀(동기화·즉시 퇴장 확인) |

## 기술 스택

- **Next.js 14.2** (App Router) · React 18.3 · TypeScript 5.6
- **React Three Fiber 8.17** · drei 9.114 · three 0.169 — 에셋 없이 절차 생성한 숲/오두막
- **Socket.IO 4.8** — 커스텀 서버(`server.mjs`)에서 Next 와 함께 운영
- **NextAuth 4.24** — Google OAuth + 게스트 Credentials, JWT 세션
- **Zustand 4.5** — HUD/게임 상태
- **Neon Postgres + pg 8.13** — 선택적 영속화, 파라미터 바인딩만 사용

## 프로젝트 구조

```
healing-forest-trip/
├─ server.mjs                 # Next + Socket.IO + /healthz + /api/stats
├─ server/
│  ├─ security.mjs            # 입력 정화·토큰 버킷·오리진 검증
│  └─ db.mjs                  # Neon 풀/쿼리/정리
├─ db/schema.sql              # users, visits, chat_messages, world_state, audit_events
├─ shared/world.json          # 클라·서버 공용 좌표/리밋
├─ scripts/migrate.mjs        # 스키마 적용
├─ scripts/prune.mjs          # 보관 기간 정리
├─ src/
│  ├─ app/                    # 랜딩(/) · 숲(/forest) · NextAuth 라우트 · globals.css
│  ├─ middleware.ts           # nonce CSP + 보안 헤더
│  ├─ lib/
│  │  ├─ world.ts             # 지형·충돌·좌표·존의 단일 기준
│  │  ├─ auth.ts              # Google/게스트, 닉네임 정화, 리다이렉트 검증
│  │  ├─ audio.ts             # 절차적 사운드 엔진
│  │  ├─ textures.ts          # 절차적 텍스처
│  │  ├─ time.ts              # 한국 시간 · 태양/달 상태
│  │  ├─ input.ts             # 키/터치 입력 버스
│  │  └─ socket.ts            # 세션 쿠키 기반 소켓
│  ├─ components/forest/      # Sky, Terrain, Forest, Stumps, Clearing, Cabin, Player …
│  ├─ components/ui/          # HUD, Chat, Help, Start, Rest, Toast, MobileControls
│  └─ store/game.ts           # 게임 상태 · useClock
└─ docs/                      # 설계/보안/운영/배포 문서
```

## 문서

| 문서 | 내용 |
| --- | --- |
| [PRD.md](PRD.md) | 제품 요구사항 정의서 |
| [docs/01-overview.md](docs/01-overview.md) | 서비스 개요와 여정 |
| [docs/02-experience.md](docs/02-experience.md) | 공간·상호작용 상세 |
| [docs/03-controls.md](docs/03-controls.md) | 조작법과 접근성 |
| [docs/04-architecture.md](docs/04-architecture.md) | 시스템 구조 |
| [docs/05-multiplayer.md](docs/05-multiplayer.md) | 실시간 프로토콜 |
| [docs/06-world.md](docs/06-world.md) | 월드 좌표/지형/충돌 |
| [docs/07-audio.md](docs/07-audio.md) | 절차적 사운드 |
| [docs/08-security.md](docs/08-security.md) | 보안 모델 |
| [docs/09-privacy.md](docs/09-privacy.md) | 데이터·프라이버시 |
| [docs/10-operations.md](docs/10-operations.md) | 운영/모니터링 |
| [docs/11-performance.md](docs/11-performance.md) | 성능 |
| [docs/12-deployment.md](docs/12-deployment.md) | Render + Neon 배포 |
| [docs/13-testing.md](docs/13-testing.md) | 검증 체크리스트 |
| [docs/14-troubleshooting.md](docs/14-troubleshooting.md) | 문제 해결 |
| [docs/15-contributing.md](docs/15-contributing.md) | 기여 규칙 |

## 보안 요약

- nonce 기반 CSP, HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`
- 소켓 핸드셰이크에서 서버가 NextAuth JWT 를 직접 검증 (클라이언트 이름 불신)
- Origin 검증, IP별 연결 수/시도 제한, 전체 40명 정원, 16KB 소켓 payload 제한
- 세션 토큰 쿠키는 브라우저 세션 쿠키로 발급, 탭 종료 시 소켓 즉시 종료
- 채팅은 서버가 빈터 존을 확인하고 240자·1.5초 쿨다운·중복/도배 제한
- 모든 SQL 파라미터 바인딩, 이메일 미수집, IP 원문 미저장(로그 상관용 해시만)
- 오픈 리다이렉트 방지, 운영 환경 변수 검증(32자 시크릿/HTTPS URL)

자세한 내용은 [docs/08-security.md](docs/08-security.md), 배포 절차는
[docs/12-deployment.md](docs/12-deployment.md)를 참고하세요.

## 라이선스

개인/교육용 프로젝트입니다. 외부 3D/음원 에셋을 사용하지 않고 브라우저에서 절차 생성합니다.
