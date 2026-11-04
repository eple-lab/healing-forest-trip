# 12 · 배포 (Render + Neon)

이 문서는 저장소를 **Render Web Service** 에 배포하고 **Neon Postgres** 를 연결하는
전체 절차를 다룹니다. `render.yaml` Blueprint 를 사용하면 대부분 자동으로 설정됩니다.

## 0. 준비물

- GitHub 저장소 (`https://github.com/eple-lab/healing-forest-trip.git`)
- Render 계정
- Neon 계정 (DB 를 쓰는 경우)
- (선택) Google Cloud Console 프로젝트 — Google 로그인용

## 1. Neon 데이터베이스 만들기

1. [Neon Console](https://console.neon.tech) → **New Project**.
2. 리전은 Render 와 가까운 곳(예: Singapore)을 선택한다.
3. **Connection string** 을 복사한다. **Pooled connection** 을 권장한다.
   ```
   postgresql://USER:PASSWORD@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
4. (선택) **Connect** 화면에서 CA 인증서를 내려받아 `DATABASE_SSL_CA` 로 넣으면
   TLS 인증서까지 검증한다. 넣지 않으면 TLS 는 사용하되 인증서 검증은 생략된다.

> Neon 은 TLS 가 필수다. `DATABASE_SSL_CA` 를 설정하지 않으면
> `rejectUnauthorized: false` 로 연결한다. 운영에서는 CA 설정을 권장한다.

## 2. 스키마 적용 (로컬에서 1회)

배포 전에 로컬에서 Neon 에 스키마를 적용한다.

PowerShell:

```powershell
$env:DATABASE_URL = "postgresql://...pooler.../neondb?sslmode=require"
npm.cmd run db:migrate
```

macOS/Linux:

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

성공하면 다음과 같이 테이블 목록이 출력된다.

```
[migrate] 완료. 테이블: app_meta, audit_events, chat_messages, users, visits, world_state
```

`db:migrate` 는 `CREATE TABLE IF NOT EXISTS` 만 사용하므로 여러 번 실행해도 안전하다.

## 3. Google OAuth 설정 (선택)

1. [Google Cloud Console](https://console.cloud.google.com/) → **API 및 서비스**
   → **사용자 인증 정보** → **OAuth 클라이언트 ID 만들기** (웹 애플리케이션).
2. **승인된 리디렉션 URI** 에 두 개를 등록한다.
   ```
   http://localhost:3000/api/auth/callback/google
   https://<운영도메인>/api/auth/callback/google
   ```
3. **승인된 JavaScript 원본** 에도 `http://localhost:3000`, `https://<운영도메인>` 을 넣는다.
4. Client ID / Client Secret 을 복사한다.

`<운영도메인>` 은 Render 가 발급하는 `https://<서비스명>.onrender.com` 또는
직접 연결한 커스텀 도메인이다.

> Google 설정 없이도 게스트 로그인으로 운영할 수 있다.
> 이때 `ALLOW_GUEST_LOGIN=true` 가 **필수**다(서버가 부팅 시 검사).

## 4. Render 배포

### 방법 A — Blueprint (권장)

1. Render Dashboard → **New** → **Blueprint**.
2. 저장소를 선택한다. `render.yaml` 을 자동으로 읽는다.
3. `sync: false` 로 표시된 값을 입력한다.
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (없으면 비워 둠)
   - `DATABASE_URL`
   - `DATABASE_SSL_CA` (선택)
4. **Apply** → 빌드/배포가 시작된다.

`render.yaml` 의 기본값:

| 항목 | 값 |
| --- | --- |
| Runtime | Node |
| Plan | starter |
| Region | singapore |
| Build | `npm ci --include=dev && npm run build && npm prune --omit=dev` |
| Start | `npm start` |
| Health check | `/healthz` |
| Instances | **1** (고정) |
| `NEXTAUTH_SECRET` | `generateValue: true` |
| `NODE_VERSION` | 24.22.1 |
| `ALLOW_GUEST_LOGIN` | `true` |

### 방법 B — 수동 Web Service

1. **New** → **Web Service** → 저장소 선택.
2. Environment: **Node**.
3. Build Command: `npm ci --include=dev && npm run build && npm prune --omit=dev`
   (이유: [14 · 문제 해결](14-troubleshooting.md)의 "`NODE_ENV=production` 빌드에서 `@/` 경로를 못 찾음")
4. Start Command: `npm start`
5. Health Check Path: `/healthz`
6. **Instances: 1** 로 설정한다(소켓 상태가 프로세스 로컬).
7. Environment 에 아래 변수를 넣는다.

## 5. 환경 변수

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `NEXTAUTH_SECRET` | ✅ | 32자 이상. `openssl rand -base64 32` |
| `NEXTAUTH_URL` | 운영 ✅ | `https://<도메인>`. **비우면 `RENDER_EXTERNAL_URL` 자동 사용** |
| `ALLOW_GUEST_LOGIN` | 조건부 | Google 미설정 시 `true` 필수 |
| `GOOGLE_CLIENT_ID` | 선택 | Google 로그인 |
| `GOOGLE_CLIENT_SECRET` | 선택 | Google 로그인 |
| `DATABASE_URL` | 선택 | Neon pooled URL |
| `DATABASE_SSL_CA` | 선택 | Neon CA (권장) |
| `PG_NO_SSL` | 선택 | `true` 면 SSL 미사용(권장 안 함) |
| `PG_POOL_MAX` | 선택 | 기본 5 |
| `APP_ORIGIN` / `ALLOWED_ORIGINS` | 선택 | 추가 허용 오리진 |
| `NODE_ENV` | ✅ | `render.yaml` 에서 `production` 으로 설정. **빌드에도 적용**되므로 Build 명령에 `--include=dev` 가 필요 |
| `NODE_VERSION` | ✅ | 24.22.1 (Node 20 은 2026-04-30 지원 종료) |

### NEXTAUTH_URL 자동 설정

Render 는 `RENDER_EXTERNAL_URL` 을 제공한다. `server.mjs` 는 `NEXTAUTH_URL` 이
비어 있으면 이 값을 사용한다. 커스텀 도메인을 붙였다면 `NEXTAUTH_URL` 을
직접 지정해야 한다(쿠키/콜백 불일치 방지).

### 운영 부팅 검증

`NODE_ENV=production` 이면 서버가 다음을 검사하고, 실패하면 **부팅을 거부**한다.

- `NEXTAUTH_SECRET` 길이 ≥ 32
- `NEXTAUTH_URL` 존재 + `https://` 로 시작
- Google 키가 없으면 `ALLOW_GUEST_LOGIN=true`

```
[환경 변수 오류] 운영 서버를 시작할 수 없습니다.
 - NEXTAUTH_SECRET 은 32자 이상이어야 합니다.
```

로그를 보고 환경 변수를 고친 뒤 **Manual Deploy → Clear build cache & deploy**.

## 6. 배포 후 확인

```bash
curl https://<도메인>/healthz
# {"ok":true,"players":0,"uptime":12,"db":true}
```

체크리스트:

- [ ] `/healthz` 200
- [ ] 랜딩에서 게스트 로그인 → `/forest`
- [ ] Google 로그인(설정한 경우) → 이름/사진 표시
- [ ] 개발자 도구 Console 에 CSP/소켓 오류 없음
- [ ] 두 탭에서 서로의 캐릭터/채팅 확인
- [ ] `db=true` 이고 새로고침 후 채팅/불 복원
- [ ] 모바일에서 조이스틱/E 버튼 동작

## 7. DB 정리 작업

Render Cron Job 을 추가한다.

```
Type:    Cron Job
Schedule: 0 4 * * 1
Command: npm run db:prune
Env:     DATABASE_URL, DATABASE_SSL_CA
```

수동 실행도 가능하다(로컬).

```powershell
$env:DATABASE_URL = "postgresql://..."
npm.cmd run db:prune
```

## 8. 롤백

- Render 대시보드 → **Deploys** → 이전 성공 배포 → **Rollback**.
- DB 스키마는 멱등 추가만 하므로 이전 앱 버전과 대체로 호환된다.
  파괴적 변경(컬럼 삭제)은 별도 마이그레이션으로 분리하고 백업 후 진행한다.

## 9. 체크리스트 (배포 전)

- [ ] `npm.cmd run typecheck` 통과
- [ ] `npm.cmd run build` 통과
- [ ] `.env.local`/비밀값이 git 에 커밋되지 않음
- [ ] `NEXTAUTH_SECRET` 32자 이상, 재사용하지 않음
- [ ] Google 리디렉션 URI 에 운영 도메인 등록
- [ ] Neon pooled URL + CA 설정
- [ ] `db:migrate` 1회 실행
- [ ] Render 인스턴스 수 1
- [ ] `/healthz` 모니터링 등록
- [ ] `db:prune` 스케줄 등록

## 10. 자주 하는 실수

| 실수 | 결과 | 해결 |
| --- | --- | --- |
| `NEXTAUTH_URL` 미설정 + 커스텀 도메인 | 콜백 불일치 | 도메인으로 직접 설정 |
| Google URI 에 `localhost` 만 등록 | 운영 로그인 실패 | 운영 URI 추가 |
| 인스턴스 2개 이상 | 소켓 상태 분리 | 1개로 고정 |
| `DATABASE_URL` 에 `sslmode=require` 누락 | 연결 실패 | Neon URL 그대로 사용 |
| DB 마이그레이션 미실행 | 저장 실패(앱은 동작) | `npm run db:migrate` |
| `ALLOW_GUEST_LOGIN` 미설정 + Google 없음 | 부팅 거부 | `true` 설정 |
