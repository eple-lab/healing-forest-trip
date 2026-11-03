/**
 * Neon Postgres 스키마 적용
 * ─────────────────────────────────────────────
 * 사용법:
 *   DATABASE_URL=postgres://... npm run db:migrate
 *
 * - 여러 번 실행해도 안전합니다 (CREATE ... IF NOT EXISTS).
 * - DATABASE_SSL_CA 가 있으면 인증서를 검증하고, 없으면 Neon 기본 TLS 를 사용합니다.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(here, '..', 'db', 'schema.sql');

function sslConfig() {
  if (process.env.PG_NO_SSL === 'true') return false;
  const ca = process.env.DATABASE_SSL_CA;
  if (ca) return { ca: ca.replace(/\\n/g, '\n'), rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[migrate] DATABASE_URL 이 없습니다. Neon 연결 문자열을 설정하세요.');
    process.exit(1);
  }

  const sql = await readFile(schemaPath, 'utf8');
  const pool = new Pool({
    connectionString,
    ssl: sslConfig(),
    max: 1,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    application_name: 'healing-forest-migrate',
  });

  const client = await pool.connect();
  try {
    const host = (() => {
      try {
        return new URL(connectionString).host;
      } catch {
        return 'unknown';
      }
    })();
    console.log(`[migrate] 스키마 적용 중 → ${host}`);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name`,
    );
    console.log(`[migrate] 완료. 테이블: ${rows.map((r) => r.table_name).join(', ')}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[migrate] 실패:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] 예상치 못한 오류:', err?.message ?? err);
  process.exit(1);
});
