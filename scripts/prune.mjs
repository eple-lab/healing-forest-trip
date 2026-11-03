/**
 * 오래된 개인정보 최소 보관 정리
 * ─────────────────────────────────────────────
 * 사용법:
 *   DATABASE_URL=postgres://... npm run db:prune
 *
 * - 채팅: 30일
 * - 방문 기록: 90일 (퇴장 시각 기준)
 * - 보안 감사 로그: 180일
 *
 * Render Cron Job 등에서 주 1회 실행하는 것을 권장합니다.
 */
import { closePool, isDbConfigured, pruneOldData } from '../server/db.mjs';

async function main() {
  if (!isDbConfigured()) {
    console.error('[prune] DATABASE_URL 이 없습니다.');
    process.exit(1);
  }
  const started = Date.now();
  const result = await pruneOldData();
  console.log(
    `[prune] 완료 (${Date.now() - started}ms) · 채팅 ${result.chatDeleted}건, ` +
      `방문 ${result.visitsDeleted}건, 감사 로그 ${result.auditDeleted}건 삭제`,
  );
  await closePool();
}

main().catch(async (err) => {
  console.error('[prune] 실패:', err?.message ?? err);
  await closePool().catch(() => {});
  process.exit(1);
});
