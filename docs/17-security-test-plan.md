# 17 · 시큐리티 테스트 계획

작성일: 2026-11-03 · 대상 커밋: `d6b328c` · 환경: 로컬(db=off) 우선, 스테이징(Neon) 최종

## 1. 범위와 위협 모델

자산: 세션, 프로필(Google 이름/사진), 채팅, 공지, 서버/DB.

| 위협 | 공격 경로 | 완화 | 검증 ID |
| --- | --- | --- | --- |
| 세션 탈취 | 쿠키 유출 | httpOnly, SameSite=Lax, HTTPS, secure cookie, 브라우저 세션 쿠키 | S-01~S-04 |
| 오리진 위장 | 소켓 핸드셰이크 | Origin 허용목록, `allowRequest`, 40명/IP당 8개 | S-05~S-07 |
| 세션 위조 | invalid cookie | `getToken` 검증, `unauthorized` | S-08 |
| 공지 변조 | 공개 쓰기 | 공개 쓰기 API 없음, DB 트리거→서버 LISTEN, 인증 불필요 없음 | S-09~S-11 |
| XSS | 닉네임/채팅/공지 제목 | NFKC+제어문자 제거, React 이스케이프, nonce CSP, frame-ancestors none | S-12~S-14 |
| SQLi | 로그인/프로필 | 파라미터 바인딩, 스키마 CHECK/인덱스 | S-15 |
| 오픈 리다이렉트 | callbackUrl | 같은 오리진만 허용 | S-16 |
| 남용/DoS | 로그인 폭주, 채팅 도배 | IP 60회/10분, 429, 토큰 버킷, 16KB payload | S-17~S-19 |
| 정보 노출 | 헤더/에러 | X-Powered-By 숨김, 인증 응답 no-store, HSTS(prod) | S-20~S-24 |
| 캐시 오염 | 공지/통계 캐시 | ETag/304, `stale-while-revalidate` 한도, 인증 응답 no-store | S-25 |
| 의존성 취약 | npm | audit 결과 문서화, 패치 업데이트 | S-26 |

## 2. 테스트 환경

- 기본: `npm run dev` (db=off) + `node scripts/security-smoke.mjs`
- 검증용 프로그레시브: production 서버(HTTPS 종단형, `NEXTAUTH_URL=https://도메인`)
- Neon 있는 경우: `DATABASE_LISTEN_URL` 로 공지 트리거→push 확인

## 3. 자동 테스트(스크립트)

| 스크립트 | 검증 |
| --- | --- |
| `scripts/security-smoke.mjs` | 헤더/CSP/세션/공지/소켓 |
| `scripts/security-ratelimit.mjs` | `/api/auth/callback/*` 60회/10분 → 429 |
| `scripts/smoke-two.mjs` | 2탭 퇴장 시 접속자 목록 정리 |
| `scripts/smoke-character.mjs` | 캐릭터 API 401/400 + ETag 304 |

## 4. 수동 검증 절차

### S-01~S-04 세션/쿠키

1. 게스트 로그인 → DevTools → Application → Cookies.
2. `next-auth.session-token` 에 `Expires` 가 **없어야** 한다.
3. 재시작/전원 차단 → 재진입 시 로그인 화면.
4. 로그아웃 후 뒤로가기 → `/` 강제, 보호 페이지 진입 불가.

### S-05~S-08 오리진/쿠키

```powershell
node scripts/security-smoke.mjs
```
기대:
- `https://evil.example.com` Origin → 연결 불가(`websocket error`/거부)
- invalid cookie → `unauthorized`
- valid cookie → `welcome`

### S-09~S-11 공지

1. Neon SQL Editor:
   ```sql
   INSERT INTO announcements (title, body, category, pinned, is_published)
   VALUES ('점검', '금요일 02:00~04:00 점검', 'maintenance', true, true);
   ```
2. 모든 접속 탭에 `notices:changed` 수신 → 알림판 패널 자동 갱신.
3. 공개 API 쓰기 불가(POST /api/announcements → 405).
4. DB 없으면 `x-announcements-source: fallback` 1건만.

### S-12~S-14 XSS

1. 닉네임 `<img src=x onerror=alert(1)>` 로 게스트 로그인.
2. 다른 탭에서 원격 캐릭터/이름표 확인 → 텍스트로만 표시, alert 없음.
3. 공지 title/body 에 `<script>` → 패널에서 텍스트로만.
4. CSP 콘솔 위반 없음.

### S-15 SQLi

- 닉네임 `x' OR '1'='1' --` → 로그인 성공(정상 동작), DB 오류 없음(db=off).
- DB 사용 시에도 파라미터 바인딩만 사용(코드 리뷰) / 오류 없음.

### S-16 오픈 리다이렉트

- `callbackUrl=https://evil.example.com` 포함 로그인 시도 → 같은 오리진으로만 복귀.

### S-17~S-19 레이트리밋

```powershell
node scripts/security-ratelimit.mjs
# 주의: 현재 IP 의 로그인 콜백은 10분간 제한됨 → 검증 후 서버 재시작
```
기대: 60회 이후 429.

### S-20~S-26 헤더/캐싱/의존성

- `/` 응답에 HSTS(prod), `upgrade-insecure-requests`(prod), CSP `default-src 'self'`, `frame-ancestors 'none'`, `X-Powered-By` 없음.
- `/api/auth/session` → `Cache-Control: no-store`, `Pragma: no-cache`.
- `node_modules/next… postcss` → 알려진 audit 존재, 완화책은 docs/19.

## 5. 합격 기준

- S-01~S-20 전부 통과.
- S-21 이상: 문서화된 수용 리스크(현재: Next 14.2.18 advisory → 미적용 항목 명시).

## 6. 산출물

- docs/18-test-report.md (실행 결과)
- docs/19-security-report.md (보안 결과 및 잔여 위험)
