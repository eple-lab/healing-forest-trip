-- ─────────────────────────────────────────────────────────────
-- 숲속여행 · Neon Postgres 스키마
-- 실행: npm run db:migrate
-- 앱 계정은 DML 만, 마이그레이션은 별도 계정으로 실행하는 것을 권장합니다.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_meta (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  -- Google: sub, 게스트: guest:<uuid>
  id           text PRIMARY KEY,
  provider     text NOT NULL CHECK (provider IN ('google', 'guest')),
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 32),
  image_url    text CHECK (image_url IS NULL OR image_url ~ '^https://'),
  visit_count  integer NOT NULL DEFAULT 0 CHECK (visit_count >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
-- 이메일은 수집하지 않습니다 (최소 수집 원칙).
ALTER TABLE users ADD COLUMN IF NOT EXISTS character text
  CHECK (character IS NULL OR char_length(character) <= 32);

CREATE TABLE IF NOT EXISTS visits (
  id              bigserial PRIMARY KEY,
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  left_at         timestamptz,
  last_zone       text CHECK (last_zone IN ('trail', 'clearing', 'cabin')),
  distance_walked double precision NOT NULL DEFAULT 0 CHECK (distance_walked >= 0),
  CHECK (left_at IS NULL OR left_at >= joined_at)
);
CREATE INDEX IF NOT EXISTS visits_user_id_idx ON visits (user_id);
CREATE INDEX IF NOT EXISTS visits_joined_at_idx ON visits (joined_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id           bigserial PRIMARY KEY,
  user_id      text REFERENCES users(id) ON DELETE SET NULL,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 32),
  body         text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 240),
  zone         text NOT NULL DEFAULT 'clearing' CHECK (zone = 'clearing'),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON chat_messages (created_at DESC);

CREATE TABLE IF NOT EXISTS world_state (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 보안/운영 이벤트만 기록합니다. IP·이메일 등 개인정보는 저장하지 않습니다.
CREATE TABLE IF NOT EXISTS audit_events (
  id         bigserial PRIMARY KEY,
  actor_id   text,
  action     text NOT NULL,
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events (created_at DESC);

-- 입구 알림판 공지. 관리자(운영자)만 Neon 콘솔/SQL 로 작성한다.
-- 앱에는 공개 쓰기 엔드포인트를 두지 않는다.
CREATE TABLE IF NOT EXISTS announcements (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body         text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  category     text NOT NULL DEFAULT 'notice'
               CHECK (category IN ('notice', 'schedule', 'maintenance', 'update')),
  pinned       boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS announcements_published_idx
  ON announcements (published_at DESC)
  WHERE is_published = TRUE;

-- 공지가 바뀌면 PostgreSQL 이 announcements_changed 를 알린다.
-- 서버는 pooled 연결이 아니라 직결(DATABASE_LISTEN_URL)로 LISTEN 한다.
-- (pooled PgBouncer 는 LISTEN/NOTIFY 를 지원하지 않는다.)
CREATE OR REPLACE FUNCTION notify_notices_changed()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('announcements_changed', '1');
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS announcements_notify ON announcements;
CREATE TRIGGER announcements_notify
  AFTER INSERT OR UPDATE OR DELETE ON announcements
  FOR EACH STATEMENT
  EXECUTE FUNCTION notify_notices_changed();

INSERT INTO app_meta (key, value)
VALUES ('schema_version', '2')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
