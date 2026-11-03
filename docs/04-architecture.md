# 04 · 시스템 구조

## 한눈에 보기

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser                              │
│                                                              │
│  랜딩(/) ── NextAuth ──▶ /forest                             │
│                            │                                 │
│              ┌─────────────┴─────────────┐                   │
│              │  React Three Fiber Canvas │                   │
│              │  Sky/Terrain/Forest/Cabin │                   │
│              │  Player/Remote/Interaction│                   │
│              └─────────────┬─────────────┘                   │
│                            │ Zustand (HUD/게임 상태)         │
│              HUD/Chat/Help/Start/Rest/Toast                  │
│                            │                                 │
│                  socket.io-client (세션 쿠키)                │
└────────────────────────────┼─────────────────────────────────┘
                             │ wss /ws (path=/socket.io)
┌────────────────────────────┼─────────────────────────────────┐
│                    Node 프로세스 (Render)                    │
│                            │                                 │
│  server.mjs ── Next.js request handler (SSR/API)             │
│       │                                                      │
│       ├─ Socket.IO ── JWT 인증 → 플레이어 Map → 존/채팅/불   │
│       ├─ /healthz     (헬스체크)                             │
│       ├─ /api/stats   (방문/채팅 통계, 60초 캐시)            │
│       └─ server/db.mjs ── pg Pool ── Neon Postgres           │
└──────────────────────────────────────────────────────────────┘
```

## 프로세스 토폴로지

- **단일 Node 프로세스**가 Next.js SSR 과 Socket.IO 를 함께 처리한다.
- 개발: `node server.mjs` (NODE_ENV≠production) → Next dev + 소켓.
- 운영: `NODE_ENV=production node server.mjs` → 빌드된 `.next` + 소켓.
- 정적 자산은 Next 가, WebSocket 업그레이드는 Socket.IO 가 처리한다.
- Render Web Service 1개 + Neon Postgres 1개가 기본 구성이다.
- 수평 확장은 v1 범위 밖이다(플레이어 Map 이 프로세스 로컬).

## 주요 모듈

| 모듈 | 책임 |
| --- | --- |
| `src/app/page.tsx` | 세션/환경을 읽어 랜딩 렌더 |
| `src/app/forest/page.tsx` | 세션 필수, 사용자 정보를 체험에 전달 |
| `src/components/Landing.tsx` | 로그인/게스트/통계/소개 |
| `src/components/forest/ForestExperience.tsx` | Canvas + UI 조립 |
| `src/components/forest/Player.tsx` | 1인칭 이동/충돌/카메라/위치 전송 |
| `src/components/forest/InteractionSystem.tsx` | 좌석/오브젝트/프롬프트 |
| `src/components/forest/MultiplayerBridge.tsx` | 소켓 이벤트 → Zustand |
| `src/components/forest/Cabin.tsx` | 오두막 1·2층, 벽난로, 주방, 침실 |
| `src/lib/world.ts` | 지형 높이·충돌·좌표·존의 단일 기준 |
| `src/store/game.ts` | 게임 상태와 `useClock` |
| `src/lib/audio.ts` | 절차적 사운드 그래프 |
| `src/lib/textures.ts` | Canvas 기반 텍스처 캐시 |
| `server.mjs` | HTTP/소켓/인증/검증/DB 오케스트레이션 |
| `server/security.mjs` | 정화/레이트리밋/오리진 |
| `server/db.mjs` | 풀/쿼리/통계/정리 |

## 데이터 흐름

### 접속

1. `/forest` 서버 컴포넌트가 `getServerSession` 으로 세션 확인.
2. 세션이 없으면 `/` 로 리다이렉트.
3. 클라이언트가 `io()` 연결 → 브라우저가 세션 쿠키 전송.
4. 서버가 `getToken()` 으로 JWT 검증 → 플레이어 생성 → `welcome` 전송.
5. `welcome` 에 기존 플레이어/채팅/불/현재 인원/서버 시각 포함.

### 이동

- `Player` 가 매 프레임 로컬 이동을 계산하고, 90ms 스로틀(변화 없으면 1.2s)로
  `move` 를 전송한다.
- 서버는 좌표 범위·유한값·레이트리밋을 확인하고 다른 클라이언트에 `player:move` 로
  브로드캐스트한다. 서버는 이동 거리를 누적해 방문 기록에 남긴다.
- 원격 클라이언트는 지수 보간으로 위치/회전을 부드럽게 따라간다.

### 채팅

- 클라이언트 `chat:send` → 서버 존 검증(`clearing`) → 레이트/중복/길이 검증
  → 빈터에 있는 클라이언트에게만 `chat:message` → DB 저장(비동기).
- 실패는 `chat:denied` 로 이유만 전달한다.

### 불

- `fire:add` → 서버가 `cabin` 존/레이트/최대 세기 확인 → 세기 증가 →
  모든 클라이언트에 `fire:state` → 4초 디바운스로 DB 저장.
- 시간이 지나면 서버가 초당 0.0025씩 감소시킨다(약 6~7분에 소진).

## 렌더링 전략

- `/` 와 `/forest` 는 `force-dynamic` (세션/환경 의존).
- 3D 캔버스는 클라이언트 컴포넌트, UI 는 DOM 오버레이.
- `Suspense` 로 3D 준비 전 UI 를 먼저 보여 준다.
- 텍스처는 Canvas 로 한 번 생성 후 캐시, 나무/풀은 인스턴싱.
- 그림자 맵 1536, dpr 상한 1.75, 안개로 먼 지형을 흐린다.

## 주요 설계 결정

| 결정 | 이유 | 대안 |
| --- | --- | --- |
| 커스텀 서버 1개 | Render 단일 서비스, 소켓+SSR 단순화 | 별도 소켓 서버(비용/지연) |
| 절차 생성 3D | 에셋 용량/라이선스/로딩 제거 | glTF/스카이박스 |
| 서버 권위 상태 | 치트/스팸/존 위조 방지 | 클라이언트 신뢰 |
| DB 선택적 | 데모/로컬 즉시 실행, 장애 격리 | DB 필수 |
| JWT 세션 | 소켓에서 쿠키 검증 용이 | DB 세션 |
| 게스트 UUID | 익명성, 추적 최소화 | 고정 게스트 계정 |
