# 05 · 실시간 멀티플레이어 프로토콜

전송: Socket.IO 4.8, path `/socket.io`, WebSocket 우선 후 polling 폴백.
인증: 브라우저 세션 쿠키(httpOnly) → 서버가 `next-auth/jwt` 의 `getToken` 으로 검증.
클라이언트가 보낸 이름/존/불 세기는 신뢰하지 않는다.

## 클라이언트 → 서버

| 이벤트 | payload | 서버 검증 | 결과 |
| --- | --- | --- | --- |
| `move` | `{ x, y, z, rot, pose, blanket }` | 유한수, 좌표 범위, 90ms당 1회(토큰 45/30s) | `players:move` 100ms 배치, 존 갱신 |
| `chat:send` | `{ text }` | 존=`clearing`, 240자, 1.5s 쿨다운, 토큰 3/0.32s, 중복 15s, 링크 2개 이하 | `chat:message` 또는 `chat:denied` |
| `fire:add` | 없음 | 존=`cabin`, 토큰 1/0.4s, 세기<0.995 | `fire:state` 또는 `fire:full` |

### `move` 처리 순서

1. 토큰 버킷(용량 45, 초당 30) 확인.
2. `x/y/z/rot` 가 유한수인지 확인.
3. 좌표를 `WORLD.bounds` 로 clamp (`y` 는 -2~12).
4. 이전 위치와의 거리 < 8m 일 때만 이동 거리 누적(순간이동 치트 방지).
5. pose 를 `idle|walk|sit|lie` 중 하나로 제한.
6. zone 이 바뀌면 presence 브로드캐스트.
7. `moveQueue` 에 넣고 100ms 마다 `flushMoves()` 로 묶어 전송.
   - 수신자와 72m 이상 떨어진 플레이어는 제외
   - `volatile`: backpressure 시 오래된 위치 패킷은 버림

## 서버 → 클라이언트

| 이벤트 | 시점 | payload |
| --- | --- | --- |
| `welcome` | 접속 직후 | `{ self, players[], fire, chat[], presence, now, serverId }` |
| `player:join` | 다른 사람 접속 | `PublicPlayer` |
| `player:leave` | 다른 사람 퇴장 | `{ id }` |
| `players:move` | 100ms 배치 | 수신자 기준 72m 이내의 `{ id, x, y, z, rot, pose, blanket, zone }[]` |
| `presence` | 5초마다 + 존 변화 | `{ total, clearing, cabin, trail, max }` |
| `fire:state` | 장작 추가/복원 | `{ logs, intensity }` |
| `chat:message` | 빈터 채팅 | `{ id, userId, name, body, at, guest }` |
| `chat:denied` | 거부 | `{ reason }` |
| `fire:full` | 불 최대 | 없음 |
| `profile` | DB 접속 시 | `{ visitCount }` |

## 거부 사유

| reason | 의미 | 클라이언트 안내 |
| --- | --- | --- |
| `unauthorized` | 세션/JWT 없음/만료 | 다시 로그인 안내 |
| `forbidden_origin` | 허용되지 않은 Origin | 일반 연결 실패 |
| `rate_limited` | 핸드셰이크 시도 과다 | 잠시 후 재시도 |
| `too_many_connections` | IP당 8개 초과 | 같은 네트워크 과다 접속 |
| `room_full` | 40명 정원 | 숲이 가득 참 |
| `server_error` | 서버 내부 오류 | 재시도 |
| `clearing_only` | 빈터 밖 채팅 | 빈터에서만 가능 |
| `duplicate` | 같은 말 반복 | 잠시 후 다시 |
| `invalid` | 빈 문자열/링크 도배 | 내용 확인 |

`chat:denied(clearing_only)` 가 12회를 넘으면 서버가 연결을 끊는다(존 위조/스팸).

## 접속 종료와 자동 로그아웃

요구사항: **브라우저를 닫거나 컴퓨터가 꺼지면 서비스에서도 즉시 로그아웃**한다.

1. NextAuth 세션 토큰 쿠키는 브라우저 세션 쿠키로 발급된다.
   `src/app/api/auth/[...nextauth]/route.ts` 가 `next-auth.session-token`(또는
   `__Secure-` 접두사/`.0` 청크 포함)의 `Expires`/`Max-Age` 를 제거한다.
   → 브라우저 종료 시 쿠키가 사라진다. (JWT 자체의 7일 만료는 그대로다.)
2. `MultiplayerBridge` 는 `pagehide` 에서 소켓을 즉시 닫고, `pageshow`(bfcache 복원)에서 다시 연결한다.
3. `pagehide` 의 close 패킷이 유실되는 경우(컴퓨터 전원 차단 등)에는 서버가 pingInterval 12s +
   pingTimeout 8s 로 끊어진 연결을 감지해 `disconnect` 를 실행한다.
4. `disconnect` 에서 플레이어를 목록에서 제거하고 `player:leave` 브로드캐스트 + presence 갱신 +
   방문 종료 시각/거리를 저장한다.

측정값(로컬): 탭 닫기 약 28ms, 네트워크 차단 약 7.6s 내 접속자 목록에서 제거.

## 재접속

- `socket.io-client` 는 무한 재접속(0.8s→8s 백오프).
- 재접속 시 새 `socket.id` 와 새 플레이어로 `welcome` 을 받는다.
- 이전 원격 플레이어 목록은 `disconnect` 에서 비운다.
- 서버는 `disconnect` 에서 IP 카운트를 감소시키고 방문 종료 시각/거리를 저장한다.

## 정원과 공정성

- 전역 40명(`LIMITS.maxPlayers`), IP당 8개(`maxConnectionsPerIp`).
- 핸드셰이크 시도는 IP당 분당 약 9회(토큰 10, 0.15/s).
- 위치는 90ms 스로틀 + 변화 없으면 1.2s 간격. 서버는 100ms 마다 묶어 `players:move` 로 전송하고,
  수신자 기준 72m 밖 플레이어는 보내지 않는다(`volatile`). 40명이어도 수신자당 초당 최대 10회.
- 채팅 fan-out 은 빈터 인원에게만 발생한다.

## 확장 시 고려

v2 에서 여러 인스턴스를 쓰려면 다음이 필요하다.

1. Socket.IO Redis adapter (브로드캐스트/프레즌스 공유)
2. 플레이어 Map 을 Redis 로 이전하거나 sticky session + 존 샤딩
3. 채팅/불 상태의 단일 writer 또는 DB 기반 조정
4. IP 레이트리밋을 공유 저장소로 이전
