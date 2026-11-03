# 08 · 보안 모델

## 위협 모델

| 자산 | 위협 | 완화 |
| --- | --- | --- |
| 세션 | 탈취/위조 | httpOnly 쿠키, JWT 서명, HTTPS, `useSecureCookies`. 브라우저에는 **세션 쿠키**로 발급(Expires 제거) → 브라우저 종료 시 자동 로그아웃 |
| 사용자 이름 | 사칭/스크립트 주입 | React 이스케이프, NFKC·제어문자 제거, 24자 제한, 서버가 최종 결정 |
| 채팅 | 도배/광고/욕설/링크 | 존 검증, 240자, 1.5s, 토큰 버킷, 중복 15s, 링크 2개 제한 |
| 서버 | 소켓 스팸/과부하 | IP당 8연결, 40명 정원, 16KB payload, move 30/s, 시도 제한 |
| 좌표 | 순간이동/존 위조 | 서버 clamp, 존 재계산, 8m 초과 이동은 거리 미집계 |
| 불 | 무한 장작/원격 조작 | `cabin` 존 검증, 0.4s 토큰, 최대 1.0, 서버 브로드캐스트 |
| DB | SQL 주입 | 모든 쿼리 파라미터 바인딩, 스키마 CHECK 제약 |
| 브라우저 | XSS/클릭재킹 | nonce CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY` |
| 리다이렉트 | 오픈 리다이렉트 | 같은 오리진만 허용, 그 외 `/forest` |
| 개인정보 | 이메일/IP 저장 | 이메일 미수집, IP 원문 미저장(해시만), 보관 기간 제한 |

## 인증

- Google OAuth: `openid email profile`, `prompt=select_account`. 이름/사진만 사용하고
  이메일은 DB 에 저장하지 않는다.
- 게스트: Credentials provider. 닉네임 2~16자, `guest:<uuid>` 로 매번 새 ID.
- JWT: `NEXTAUTH_SECRET` 32자 이상, 7일 만료, 1시간마다 갱신.
- `NEXTAUTH_URL` 이 https 이면 secure cookie.
- 운영에서 시크릿/URL/게스트 정책이 잘못되면 `server.mjs` 가 **부팅을 거부**한다.

## 접속 종료 (세션 쿠키)

- NextAuth 는 세션 JWT 쿠키에 기본 7일 `Expires` 를 붙인다. 이 앱은 설정이 필요 없는 "브라우저 종료 시 로그아웃"을
  보장하기 위해 `src/app/api/auth/[...nextauth]/route.ts` 에서 세션 토큰 쿠키의 `Expires`/`Max-Age` 를 제거한다.
  (`__Secure-` 접두사와 청크 이름 `.0` `.1` 까지 처리. 다른 쿠키는 유지.)
- `MultiplayerBridge` 는 `pagehide` 에 소켓을 닫고, `pageshow`(bfcache)에서 재연결한다.
- 서버는 pingInterval 12s / pingTimeout 8s. close 패킷 유실 시 비정상 종료를 최대 ~20초 안에 감지한다.
- 검증(로컬): 탭 닫기 28ms 내 제거, 네트워크 차단 7.6s 내 제거.
- JWT 자체의 만료(7일)도 유지된다. 세션 쿠키는 "브라우저가 열려 있는 동안"만 존재한다.

## 소켓 인증

1. `allowRequest` 에서 Origin 허용 목록 확인.
2. `io.use` 에서 IP 시도 토큰 버킷 확인.
3. `getToken({ req: socket.request })` 로 NextAuth JWT 검증.
4. `token.sub` 없으면 `unauthorized`.
5. IP 연결 수/전체 정원 확인 후 플레이어 생성.
6. 이름/사진은 토큰에서만 가져오고, 클라이언트 payload 의 이름은 사용하지 않는다.

## CSP

`middleware.ts` 가 요청마다 nonce 를 생성한다.

```
default-src 'self';
script-src 'self' 'nonce-…' 'strict-dynamic' [dev: 'unsafe-eval'];
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data: https://lh3.googleusercontent.com https://*.googleusercontent.com;
connect-src 'self' wss://<host> ws://<host> [dev: ws: http://localhost:*];
object-src 'none'; base-uri 'self'; frame-ancestors 'none'; frame-src 'none';
form-action 'self' https://accounts.google.com;
[prod: upgrade-insecure-requests]
```

추가 헤더: HSTS(2년, preload), `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`(카메라/마이크/위치/결제/USB 차단), `COOP: same-origin`,
`Cross-Origin-Resource-Policy: same-origin`, `X-Permitted-Cross-Domain-Policies: none`,
`Origin-Agent-Cluster: ?1`, `X-DNS-Prefetch-Control`, `X-Powered-By` 숨김(`poweredByHeader: false`).
인증 응답은 `Cache-Control: no-store` 로 어떤 캐시에도 남지 않는다.

## 입력 정화

- `cleanText`: NFKC 정규화 → 제어/보이지 않는 문자 제거 → 공백 축약 → 코드포인트 단위 절단.
- 채팅: 빈 문자열 거부, `http(s)://` 2개 초과 거부.
- 아바타 URL: `https://*.googleusercontent.com/` 만 허용, 512자 제한.
- 모든 클라이언트 값은 서버에서 타입/범위를 재확인한다.

## 레이트 리밋

| 대상 | 정책 |
| --- | --- |
| 핸드셰이크 | 토큰 10, 0.15/s (분당 약 9회) |
| 로그인/콜백 | middleware, IP당 10분 60회 (429) |
| 이동 | 토큰 45, 30/s |
| 채팅 | 토큰 3, 0.32/s + 1.5s 쿨다운 |
| 장작 | 토큰 1, 0.4/s |
| IP 연결 | 8개 |
| 전체 | 40명 |

토큰 버킷은 프로세스 로컬이다. 다중 인스턴스로 확장하면 Redis 등 공유 저장소로
옮겨야 한다.

## 운영 체크리스트

- [ ] `NEXTAUTH_SECRET` 32자 이상, 저장소에 커밋하지 않음
- [ ] `NEXTAUTH_URL` https
- [ ] Google 리디렉션 URI 에 운영 도메인 등록
- [ ] `ALLOW_GUEST_LOGIN` 정책 결정
- [ ] `DATABASE_URL` pooled 연결, `DATABASE_SSL_CA` 설정 권장
- [ ] Render 환경변수에 비밀값만, 빌드 로그에 출력 금지
- [ ] `/healthz` 모니터링
- [ ] `npm run db:prune` 주 1회
- [ ] 의존성 업데이트 시 `npm audit` 확인
- [ ] CSP 위반 리포트가 필요하면 report-uri 추가(v2)

## 남은 위험

- 채팅 내용 자체의 욕설/혐오 표현은 자동 필터가 없다. 소규모 공간 + 신고 부재를
  전제로 하며, v2 에서 신고/차단/금칙어를 추가한다.
- IP 기반 제한은 NAT/프록시 뒤에서 여러 사용자를 한 명처럼 취급할 수 있다.
- 단일 인스턴스이므로 프로세스가 죽으면 접속이 끊긴다(자동 재접속으로 완화).
