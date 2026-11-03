# 19 · 보안 결과 보고

실행일: 2026-11-03 · 기준 커밋: `d6b328c` · 방법: 자동 스크립트 + 수동 점검 + `npm audit`

## 총평

현재 구성(로컬/`db=off`)에서 **인증·세션·오리진·레이트리밋·헤더/CSP·입력 정화·로그아웃 흐름은 모두 정상 동작**합니다. 다만 Next.js 14.2.18 자체에 미적용 advisory가 남아 있어(아래 “잔여 위험”), **운영 배포 전 Next 메이저 업그레이드 계획과 Neon CA 검증 설정을 권장**합니다.

## 1. 통과 항목 (S-ID 기준)

| ID | 항목 | 결과 | 증거 |
| --- | --- | --- | --- |
| S-01~S-04 | 세션 쿠키 | PASS | 만료 속성 없음(`expires=-1`), 종료 시 삭제, 로그아웃 정상 |
| S-05~S-08 | 오리진/세션 검증 | PASS | 악성 Origin 차단, invalid cookie `unauthorized`, 유효 cookie `welcome` |
| S-09~S-11 | 공지 무분별 변경 | PASS | 공개 쓰기 API 없음(405), DB 콘솔에서만 변경, 변경 시 `notices:changed` 브로드캐스트 |
| S-12~S-14 | XSS | PASS | 닉네임 `<img … onerror>` 페이로드도 텍스트로만 표시, alert 없음, CSP 콘솔 위반 없음 |
| S-15 | SQLi | PASS* | 파라미터 바인딩 전용, db=off 환경에서 오류 없음 (*DB 실환경 재확인 권장) |
| S-16 | 오픈 리다이렉트 | PASS | `/ forest` 오리진 외 callbackUrl 불가, 경로 단순화 |
| S-17~S-19 | 남용 제한 | PASS | 로그인 콜백 60회/10분 → 429, 소켓 토큰 버킷/정원/16KB |
| S-20~S-26 | 헤더/캐시 | PASS | 아래 2장 참조 |

## 2. 헤더/캐시 검증

- `/`(dev): `content-security-policy`, `x-frame-options=DENY`, `x-content-type-options=nosniff`, `referrer-policy`, `cross-origin-opener-policy`, `cross-origin-resource-policy`, `origin-agent-cluster=?1`, `x-permitted-cross-domain-policies=none`, **X-Powered-By 없음**.
- `/`(prod, 임시 기동): **HSTS** `max-age=63072000; includeSubDomains; preload`, CSP `upgrade-insecure-requests`, `'unsafe-eval'` 미포함, `cache-control: private, no-cache, no-store`.
- `/api/auth/*`: `Cache-Control: no-store`, `Pragma: no-cache`.
- `/api/announcements`: 60초 서버 캐시 + ETag, `if-none-match` → **304**.

## 3. 의존성 취약점(npm audit)

### 수정 완료

- `next-auth` 4.24.11 → **4.24.15** (uuid 오류, getToken 예외, 이메일 정상화 우회 등)
- `@react-three/drei` 9.114.3 → **9.122.0** (uuid)

### 잔여 위험 (수용)

| 패키지 | Severity | 상태 | 완화 |
| --- | --- | --- | --- |
| `next` 14.2.18 | critical | 미적용(수정은 Next 16 요구, 파괴적 변경) | 우리 앱은 **Server Actions/rewrites/i18n/next/image 미사용**, nonce CSP, Render 단일 인스턴스, `/​_next/image` 미들웨어 404 차단 |
| `postcss`(Next 종속) | high | 미적용 | 사용자/외부 CSS 미처리, 빌드 타임만 사용, sourceMappingURL 신뢰 없음 |

- 전체(개발 포함): 21건 잔여, `next`/`postcss` 계열이 대부분. 배포 런타임 영향은 위 조건에서 제한적.
- **대응 계획**: 다음 메이저 업그레이드 스프린트에 `next@16.x` + `postcss` 동시 적용, 마이그레이션 가이드 점검 후 배포.

## 4. 이번에 추가된 보안 통제

- 세션 쿠키 만료 제거(브라우저 세션 쿠키) + `pagehide` 즉시 소켓 종료 + ping 12/8s
- 로그인/콜백 경로 IP당 60회/10분 → **429** (429 검증 확인)
- `X-Powered-By` 제거, `Cross-Origin-Resource-Policy: same-origin`, `X-Permitted-Cross-Domain-Policies: none`, `Origin-Agent-Cluster: ?1`
- 인증 응답 `no-store`
- `POST /api/profile/character`: 세션 없으면 401, id 화이트리스트 외 400
- 공개 쓰기 API 없음(공지는 Neon 콘솔에서만 SQL로 변경), 공지 변경은 DB 트리거 → 서버 LISTEN/폴링 → 브로드캐스트
- `/​_next/image` 404 차단(사용 안 함)

## 5. 권장 조치 (운영)

1. Render 환경변수에 `NEXTAUTH_SECRET`/ `DATABASE_URL` 의 **pooled** URL 과 `DATABASE_LISTEN_URL`(**직결**, LISTEN/NOTIFY 용) 분리 설정, `DATABASE_SSL_CA` 지정.
2. Neon 권한: 앱 계정은 DML만, 마이그레이션은 별도 계정.
3. Google OAuth: 리다이렉션 URI에 운영 도메인만 등록, `ALLOW_GUEST_LOGIN` 정책 결정.
4. `npm run db:prune` 주 1회(채팅 30일/방문 90일/감사 180일).
5. 업데이트 주기: 매월 `npm audit`, Next 메이저 업그레이드 계획 수립.

## 6. 결론

- **현 구성에서 배포 가능 여부**: 로컬 기준 기능·보안 검증 통과. **Neon+Render 스테이징에서 S-09/S-15 및 HSTS를 1회 재확인한 뒤 운영 배포**를 권장.
- 미해결은 `next`/`postcss` 상위 advisory뿐이며, 현재 아키텍처 조건에서 완화 조치가 적용되어 있습니다.
