# 10 · 운영과 모니터링

## 운영 구성

| 요소 | 선택 | 비고 |
| --- | --- | --- |
| 호스팅 | Render Web Service 1개 | `render.yaml` Blueprint |
| 리전 | Singapore (운영자 선택) | 사용자와 가까운 리전 |
| 프로세스 | `node server.mjs` (단일) | Next + Socket.IO |
| DB | Neon Postgres (pooled) | 선택적, 없으면 인메모리 |
| 정원 | 40명 / IP당 8연결 | `shared/world.json` |
| 헬스체크 | `GET /healthz` | 200 + JSON |
| DB 정리 | `npm run db:prune` 주 1회 | Cron Job 또는 수동 |

단일 인스턴스를 전제로 한다. 플레이어 목록·레이트리밋 버킷·불 상태가 프로세스
로컬이므로 수평 확장은 v2 과제다([docs/05-multiplayer.md](05-multiplayer.md)).

## 엔드포인트

### `GET /healthz`

```json
{ "ok": true, "players": 3, "uptime": 812, "db": true }
```

- Render 헬스체크와 외부 업타임 모니터에 사용한다.
- `players` 는 현재 소켓 접속 수, `uptime` 은 프로세스 초.
- DB 가 없어도 200 을 반환한다(앱은 계속 동작).

### `GET /api/stats`

```json
{ "totalVisits": 1284, "totalTravellers": 412, "totalMessages": 96 }
```

- 랜딩 화면의 통계 카드에 사용한다.
- 60초 서버 캐시, `max-age=30, s-maxage=60`.
- DB 가 없거나 쿼리가 실패하면 0 을 반환한다(랜딩이 깨지지 않음).

## 로그

| 접두사 | 의미 | 예 |
| --- | --- | --- |
| `[env]` | 환경 변수 경고 | DB 없음 경고 |
| `[env]` 오류 | 부팅 거부 | 시크릿/URL/게스트 정책 |
| `[db]` | 복원/저장 실패 | `restore failed: 28P01` |
| `[socket]` | 인증/정원/오류 | `unauthorized`, `room_full` |
| `[server]` | 시작/종료 | 시그널 수신 |

- 비밀값·이메일·IP 원문은 로그에 남기지 않는다.
- 오류는 `err.code ?? err.message` 수준으로만 남긴다.
- Render 로그는 기본 보관 기간이 있으므로, 감사가 필요하면 외부 로그 수집을 붙인다.

## 주기 작업

| 작업 | 주기 | 명령 |
| --- | --- | --- |
| 개인정보 정리 | 주 1회 | `npm run db:prune` |
| 의존성 점검 | 월 1회 | `npm audit`, `npm outdated` |
| 백업 확인 | 월 1회 | Neon 스냅샷/복원 테스트 |
| 인증서/도메인 | 분기 | Render 자동 TLS 확인 |

### Render Cron Job 예시

```
Schedule: 0 4 * * 1        (매주 월요일 04:00 UTC)
Command:  npm run db:prune
Env:      DATABASE_URL, DATABASE_SSL_CA
```

Cron Job 은 웹 서비스와 별도 프로세스이므로 `DATABASE_URL` 을 같은 값으로 넣는다.

## 장애 대응

| 증상 | 확인 | 조치 |
| --- | --- | --- |
| 배포 실패 | 빌드 로그 | `npm ci`/`npm run build` 오류, Node 버전 |
| 부팅 즉시 종료 | `[환경 변수 오류]` | 시크릿 32자, https URL, 게스트 정책 |
| 로그인 후 500 | `NEXTAUTH_URL`, Google URI | 도메인/콜백 재확인 |
| 소켓 연결 실패 | 브라우저 콘솔, CSP | `connect-src`, 프록시 WebSocket |
| 정원 초과 | `/healthz` players | 40명 정원, 재시작 여부 |
| DB 오류 | Render 로그 `[db]` | 연결 문자열/SSL/한도 |
| 통계 0 | `/api/stats` | DB 미설정 또는 쿼리 오류 |
| 메모리 증가 | Render Metrics | 인스턴스 재시작, 텍스처 캐시 확인 |

자세한 절차는 [docs/14-troubleshooting.md](14-troubleshooting.md).

## 배포 후 스모크 테스트 (5분)

1. `GET /healthz` → `ok: true`.
2. 랜딩에서 게스트 로그인 → `/forest` 진입.
3. 30초 걷고 그루터기에 앉기.
4. 빈터에서 채팅 1회 전송(다른 탭에서 수신 확인).
5. 오두막 2층까지 올라가 창밖 보기.
6. 새로고침 후 재접속, 채팅/불 상태 복원 확인(DB 사용 시).
7. 모바일 뷰포트에서 조이스틱/E 버튼 확인.

## 비용과 한도

- Render Starter + Neon Free 조합으로 소규모 운영이 가능하다.
- 무료 플랜은 유휴 시 슬립/콜드 스타트가 있을 수 있다.
- 소켓은 동시 접속 40명 기준 초당 수백 메시지 수준으로 가볍다.
- Neon 은 연결 수 한도가 있으므로 `PG_POOL_MAX` 를 5 내외로 유지한다.

## 변경 관리

1. `main` 에 직접 푸시하지 않고 브랜치에서 작업한다.
2. `npm run typecheck && npm run build` 를 통과해야 한다.
3. 좌표 변경 시 `shared/world.json`, `src/lib/world.ts`, `server.mjs` 의 존 규칙을 함께 본다.
4. DB 스키마 변경은 `db/schema.sql` 에 멱등하게 추가하고 `npm run db:migrate` 로 적용한다.
5. 배포 후 위 스모크 테스트를 수행한다.
