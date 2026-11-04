# 14 · 문제 해결

## 빠른 진단 표

| 증상 | 가장 흔한 원인 | 첫 확인 |
| --- | --- | --- |
| 서버가 바로 종료 | 운영 env 검증 실패 | 로그의 `[환경 변수 오류]` |
| 로그인 후 `/` 로 튕김 | 세션 없음/쿠키 문제 | `NEXTAUTH_URL`, https, 쿠키 |
| Google 콜백 오류 | 리디렉션 URI 불일치 | Google Console URI |
| 소켓이 연결되지 않음 | CSP/프록시/Origin | 콘솔, `/healthz` |
| 캐릭터가 안 보임 | 소켓 미연결 또는 다른 방 | HUD 연결 상태 |
| 2층에 못 올라감 | 계단/충돌 좌표 불일치 | `STAIRS`, `groundAt` |
| 앉기가 안 됨 | 대상 거리/시선 조건 | 프롬프트 표시 여부 |
| 채팅 전송 불가 | 빈터 아님/쿨다운/길이 | 거부 토스트 문구 |
| 불이 안 커짐 | 장작 없음/존 아님/최대 | 토스트, 서버 로그 |
| 소리가 안 남 | 제스처 전/음소거/자동재생 | 시작 버튼, `M` |
| DB 저장 안 됨 | `DATABASE_URL` 없음/마이그레이션 | `/healthz` `db`, 로그 |
| 스타일이 깨짐 | CSP 로 인라인 차단 | 콘솔 CSP 위반 |
| 배포 빌드만 `Can't resolve '@/...'` | `NODE_ENV=production` 으로 devDependencies 미설치 | 빌드 로그의 `added N packages` 개수 |

## 1. 서버가 시작되지 않는다

운영(`NODE_ENV=production`)에서는 `server.mjs` 의 `validateEnv()` 가 부팅을 막는다.

```
[환경 변수 오류] 운영 서버를 시작할 수 없습니다.
 - NEXTAUTH_SECRET 은 32자 이상이어야 합니다.
 - 운영 환경의 NEXTAUTH_URL 은 https 여야 합니다.
 - GOOGLE_CLIENT_ID/SECRET 이 없으면 ALLOW_GUEST_LOGIN=true 를 명시해야 합니다.
```

해결:

1. Render → Environment 에서 값을 수정한다.
2. `NEXTAUTH_SECRET` 은 32자 이상(예: `openssl rand -base64 32`).
3. `NEXTAUTH_URL` 은 `https://...` (커스텀 도메인이면 그 도메인).
4. Google 키가 없으면 `ALLOW_GUEST_LOGIN=true`.
5. **Manual Deploy → Clear build cache & deploy**.

로컬 개발에서는 이 검사를 건너뛴다.

## 2. 로그인/세션 문제

### Google 로그인 후 `redirect_uri_mismatch`

- Google Console → OAuth 클라이언트 → **승인된 리디렉션 URI** 에 정확히 추가한다.
  ```
  https://<도메인>/api/auth/callback/google
  ```
- `http`/`https`, 끝 슬래시, 서브도메인까지 일치해야 한다.
- Render 가 발급한 `onrender.com` 도메인과 커스텀 도메인을 **둘 다** 등록한다.

### 로그인은 되는데 `/forest` 에서 다시 `/` 로

- `NEXTAUTH_URL` 이 실제 접속 도메인과 다르면 쿠키 도메인이 어긋난다.
- `NEXTAUTH_SECRET` 이 배포마다 바뀌면 기존 세션이 무효화된다.
  `generateValue` 를 쓰면 Render 가 값을 유지하는지 확인한다.
- 브라우저에서 사이트 쿠키를 삭제하고 다시 시도한다.

### 게스트 로그인 버튼이 없다

- `googleEnabled && !guestEnabled` 이면 게스트 버튼을 숨긴다.
- Google 키가 설정되어 있고 `ALLOW_GUEST_LOGIN` 이 `true` 가 아니면 게스트는 꺼진다.
- 게스트를 열려면 `ALLOW_GUEST_LOGIN=true` 로 설정하고 재배포한다.

## 3. 소켓/멀티플레이어

### 연결 상태가 계속 "연결 중"

1. 브라우저 DevTools → Network → WS 탭에서 `/socket.io/` 요청 확인.
2. 응답 헤더의 CSP `connect-src` 에 현재 오리진의 `wss://` 가 있는지 확인.
3. Render/프록시가 WebSocket 업그레이드를 허용하는지 확인(Render 는 기본 허용).
4. 서버 로그에서 `unauthorized`, `forbidden_origin`, `rate_limited` 확인.
5. `ALLOWED_ORIGINS`/`APP_ORIGIN` 에 도메인이 잘못 들어가 있지 않은지 확인.

### `unauthorized`

- 세션 쿠키가 전송되지 않았거나 JWT 가 만료됐다.
- NextAuth 세션 쿠키는 브라우저 종료 시 사라지는 세션 쿠키다(자동 로그아웃). 컴퓨터를 재부팅한 뒤 재로그인한다.
- `getToken` 은 `NEXTAUTH_SECRET` 으로 서명을 검증한다. 시크릿이 바뀌면 실패한다.
- Socket.IO 요청 헤더의 `Cookie` 가 파싱되는지 확인(서버 `server.mjs` 가 `parseCookies` 로 채운다).
- 페이지를 새로고침해 새 세션으로 재접속한다.

### 여러 사람이 접속했는데 인원이 안 늘어난다

- 이동 패킷은 `players:move` **배열**로 온다(이전 `player:move` 는 삭제됐다). 구버전 클라이언트는 갱신하지 못한다.
- 원격 플레이어는 72m 이내 12명까지만 렌더된다(성능 보호). 멀리 있는 사람은 보이지 않는 것이 정상이다.

### `room_full`

- 40명 정원이다. 잠시 후 다시 시도한다.
- 좀비 연결이 의심되면 Render 에서 인스턴스를 재시작한다(정원/카운트 초기화).

### `too_many_connections`

- 같은 공인 IP 에서 8개를 초과했다(학교/회사 NAT).
- 다른 네트워크로 시도하거나 `shared/world.json` 의 `maxConnectionsPerIp` 를 조정한다.

### 다른 사람이 보이지 않는다

- 두 클라이언트가 **같은 인스턴스**에 붙어야 한다(인스턴스 1개 확인).
- 한쪽이 시작 오버레이에서 멈춰 있으면 이동 패킷을 보내지 않는다.
- HUD 의 접속 인원이 1이면 실제로 혼자다.

## 4. 이동/충돌/2층

### 벽에 끼거나 통과한다

- `BOX_COLLIDERS` 의 AABB 와 메시 위치가 어긋났을 수 있다.
- `Player.tsx` 의 `RADIUS`(0.3), `STEP_UP`(0.62) 확인.
- 좌표를 바꿨다면 `Cabin.tsx` 와 `world.ts` 를 함께 수정했는지 확인.

### 계단으로 2층에 못 올라간다

- `STAIRS`(x 3.34~4.78, z -147.15~-151.7)와 `STAIR_HOLE` 이 겹치지 않는지 확인.
- `groundAt` 의 후보 중 `feetY + 0.62` 보다 높은 것은 제외된다.
  계단 한 단이 0.62m 보다 높으면 오를 수 없다.
- 난간 충돌체가 계단 폭을 막고 있지 않은지 확인.

### 2층에서 바닥으로 떨어진다

- `STAIR_HOLE` 범위가 실제 구멍 메시와 일치하는지 확인.
- 2층 난간 충돌체가 있는지 확인.

### 나무에 끼어 태어난다

- 시작 좌표 `(0, 72)` 주변 6m 는 나무를 비운다.
- `TREE_COLLIDERS` 반경과 스폰 위치를 확인한다.

## 5. 상호작용

### 프롬프트가 뜨지 않는다

- 대상까지의 거리와 시선 방향(dot > -0.25)을 확인한다.
- 채팅/도움말이 열려 있으면 상호작용이 멈춘다.
- `InteractionSystem.tsx` 의 `buildTargets()` 에 대상이 있는지 확인.

### 앉았는데 시점이 이상하다

- `Seat` 의 `eyeY`, `feetY`, `yaw`, `standX/Z` 값을 확인한다.
- 앉은 뒤에도 마우스 시점은 제한적으로 허용된다.

### 장작이 안 들어간다

- 빈터/산길에서는 불을 넣을 수 없다(`cabin` 존만 허용).
- 장작을 먼저 주워야 한다(장작더미 상호작용).
- 불이 최대(0.995 이상)면 `fire:full` 이 온다.

### 담요/음료가 사라진다

- 음료는 4.2초 뒤 자동 종료된다.
- 담요는 "덮기/걷기" 토글 상태이며, 일어나면 자세만 바뀐다.

## 6. 사운드

- 시작 오버레이의 "숲으로 들어가기" 전에는 무음이 정상이다(브라우저 정책).
- `M` 또는 HUD 버튼으로 음소거가 아닌지 확인.
- 탭이 백그라운드면 브라우저가 오디오를 suspend 할 수 있다.
- 오디오 장치/볼륨, OS 의 앱별 볼륨을 확인한다.
- Web Audio 오류는 DevTools Console 에 표시된다.

## 7. DB

### `/healthz` 의 `db: false`

- `DATABASE_URL` 이 설정되지 않았다.
- 환경 변수 이름 오타, Render 재배포 누락.
- 앱은 DB 없이도 동작하지만 저장/복원이 안 된다.

### 연결 오류

| 코드 | 의미 | 조치 |
| --- | --- | --- |
| `28P01` | 인증 실패 | 사용자/비밀번호 확인 |
| `ENOTFOUND` | 호스트 오류 | Neon URL 오타 |
| `ECONNREFUSED` | 포트/네트워크 | pooled URL, 리전 |
| `SELF_SIGNED_CERT_IN_CHAIN` | CA 검증 | `DATABASE_SSL_CA` 설정 또는 `PG_NO_SSL` |
| `too many clients` | 연결 한도 | `PG_POOL_MAX` 감소 |

### 저장이 안 된다

- 스키마 미적용: `npm run db:migrate` 실행.
- 로그의 `[db] ... failed` 메시지 확인.
- `chat_messages` CHECK 제약(길이/존) 위반 여부 확인.

### 복원이 안 된다

- 서버 시작 로그의 `[db] restored N chat messages` 확인.
- 채팅은 최근 30건만 복원된다(의도된 동작).
- 불은 마지막 저장 시각과 경과 시간으로 감쇠해 복원된다.

## 8. 빌드/타입

### `Type error: ... SVGLineElementAttributes`

- R3F 에서 `<line>` 은 SVG 로 추론될 수 있다.
- `THREE.Line` 을 만들어 `<primitive object={...} />` 로 넣는다(현재 `Clearing.tsx` 방식).

### `Module not found`

- `npm ci` 재실행.
- Node 버전 확인(`>=20.11`).
- 경로 별칭 `@/` 는 `tsconfig.json` 의 `paths` 를 따른다.

### `NODE_ENV=production` 빌드에서 `@/` 경로를 못 찾음 (2026-11-04)

증상: 로컬은 되는데 Render 빌드만 `Module not found: Can't resolve '@/lib/auth'`. 로그에 `added 152 packages`(dev 포함이면 약 450개).

원인:
1. `NODE_ENV=production` 은 빌드 단계에도 적용되고, 이때 npm 은 devDependencies 를 설치하지 않는다(npm `omit` 기본값).
2. `typescript` 가 없으면 Next 14 가 `tsconfig.json` 의 `paths` 를 읽지 않아 `@/` 를 풀지 못한다.

해결(현재 `render.yaml`): `npm ci --include=dev && npm run build && npm prune --omit=dev`.
빌드 도구는 빌드에서만 쓰고, 실행 환경에는 운영용 패키지만 남긴다(12-Factor "Build, release, run" 분리).

하지 않은 방법과 이유:
- `typescript` 를 dependencies 로 옮기기: 빌드는 되지만 `@types/*` 가 다른 패키지(drei, fiber, socket.io)를 통해 **우연히** 설치돼서 통과한 것이다. 컴파일러가 운영 패키지로 분류되고, `npm audit --omit=dev` 로 운영 취약점만 보는 기준도 흐려진다.
- `NODE_ENV` 빼기: 빌드는 되지만 실행 환경에 dev 도구가 모두 남는다.

배운 점:
- 로컬에서 같은 조건(`NODE_ENV=production npm ci && npm run build`)으로 **먼저 재현**하면 추측을 줄일 수 있다.
- "되는 이유"까지 확인한다. 간접 의존성 덕분에 되는 것은 언젠가 깨진다. 코드가 직접 쓰는 패키지는 직접 선언한다(그래서 `cross-env` 를 dependencies 로 옮김).
- `render.yaml` 에서 환경변수 줄을 지워도 Render 서비스에 이미 있는 값은 남을 수 있다. Environment 탭을 확인한다.
- 배포 로그의 `Checking out commit` 으로 어느 커밋이 배포됐는지 먼저 확인한다.

### 빌드는 되는데 런타임 오류

- `NEXTAUTH_SECRET` 경고는 로컬에서 정상.
- 서버 컴포넌트에서 브라우저 API(`window`, `document`)를 쓰지 않았는지 확인.

## 9. UI/CSS

- CSP 로 인라인 스타일이 막히면 `style-src 'unsafe-inline'` 이 있는지 확인한다.
- 모바일에서 HUD 가 겹치면 `safe-area-inset` 과 `dvh` 단위를 확인한다.
- 폰트가 깨지면 `font-src` 와 시스템 폰트 폴백을 확인한다.

## 10. 로그를 남길 때

- 비밀값, 세션 쿠키, 이메일, IP 원문을 붙여 넣지 않는다.
- `/healthz` 응답, 브라우저/OS, 재현 절차, 콘솔 오류 메시지를 포함한다.
- 서버 로그는 `[env]`, `[db]`, `[socket]`, `[server]` 접두사로 필터링한다.

## 11. 오류 화면 / 하얀 화면

- React 렌더 오류가 나면 `/app/error.tsx` 가 "화면을 불러오지 못했습니다" 화면을 보여준다. "다시 시도" 버튼이 리셋한다.
- 루트 자체가 실패하면 `/app/global-error.tsx` 화면이 나온다.
- WebGL 컨텍스트가 사라지면(`webglcontextlost`) "그래픽 장치가 재시작되었습니다" 오버레이가 뜬다. 브라우저가 복구하면 자동으로 닫히고, 아니면 "새로고침"을 누른다.
- 하얀 화면만 보이고 아무 반응이 없으면 콘솔 오류(리소스 404, CSP 위반)를 먼저 확인한다.
- Chrome 충돌/강제 종료는 `선택 → 종료`에서도 `pagehide` 로 소켓이 닫혀 접속자 목록에 남지 않는다.
  (close 패킷이 유실되는 전원 차단 상황은 최대 ~20초 안에 ping 타임아웃으로 정리된다.)
