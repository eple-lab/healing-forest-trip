# 09 · 데이터와 프라이버시

## 수집하는 것

| 데이터 | 목적 | 보관 |
| --- | --- | --- |
| 사용자 ID (Google sub / `guest:<uuid>`) | 세션·방문 연결 | 탈퇴/정리 전까지 |
| 표시 이름 | 다른 사람에게 보여 주기 | 갱신됨 |
| 프로필 이미지 URL (Google만) | 이름표/랜딩 | 갱신됨 |
| 방문 시각/퇴장 시각/마지막 존/이동 거리 | 통계, 품질 개선 | 90일 |
| 채팅 본문/표시 이름 | 빈터 대화 | 30일 |
| 불 상태 | 오두막 분위기 복원 | 최신값만 |
| 감사 이벤트(행위/사유) | 보안/운영 | 180일 |

## 수집하지 않는 것

- **이메일**: Google 로그인에서 받아오지만 DB/로그에 저장하지 않는다.
- **IP 원문**: 소켓 메모리에서만 사용하고, 감사 로그에는 8자리 해시만 남긴다.
- 위치(실제 GPS), 연락처, 결제 정보, 광고 식별자.
- 채팅 외의 음성/영상.

## 익명성

- 게스트는 접속할 때마다 새 `guest:<uuid>` 를 받는다. 같은 사람이 다시 와도
  이전 방문과 연결되지 않는다.
- Google 사용자도 이메일 없이 `sub` 로만 식별한다.
- 채팅은 빈터에 있는 사람에게만 전달되고, 30일 뒤 삭제된다.

## 보관 기간과 정리

`scripts/prune.mjs`:

- `chat_messages` 30일 초과 삭제
- `visits` 퇴장 90일 초과 삭제
- `audit_events` 180일 초과 삭제

Render Cron Job 또는 외부 스케줄러로 주 1회 실행한다.

```
npm run db:prune
```

## 사용자에게 알리는 문구

랜딩과 도움말에 다음을 명시한다.

> Google 로그인은 이름과 프로필 사진만 사용합니다. 이메일은 저장하지 않으며,
> 채팅 기록은 30일 뒤 자동으로 정리됩니다.

## DB 스키마 요약

- `users(id, provider, name, image_url, visit_count, created_at, last_seen_at)`
- `visits(id, user_id, joined_at, left_at, last_zone, distance_walked)`
- `chat_messages(id, user_id, display_name, body, zone, created_at)`
- `world_state(key, value jsonb, updated_at)`
- `audit_events(id, actor_id, action, detail jsonb, created_at)`

CHECK 제약으로 provider/존/길이를 제한한다. `image_url` 은 https 만 허용한다.

## 삭제 요청

v1 에는 셀프서비스 삭제 UI 가 없다. 운영자는 다음 SQL 로 특정 사용자의 데이터를
삭제할 수 있다(파라미터 바인딩 필수).

```sql
DELETE FROM chat_messages WHERE user_id = $1;
DELETE FROM visits WHERE user_id = $1;
DELETE FROM users WHERE id = $1;
```

게스트는 ID 가 매번 달라지므로, 요청 시 닉네임/대략적 시각으로 찾아야 한다.
v2 에서 계정 삭제와 신고 기능을 추가한다.

## 국외 이전

Render/Neon 리전은 운영자가 선택한다(예: Singapore). 최소 데이터만 저장하며,
민감정보를 수집하지 않는다.
