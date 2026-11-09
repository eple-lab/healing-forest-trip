import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:3000';
// [BUG-06] PC 사용자 폴더 절대 경로가 공개 저장소에 들어갔다 → 저장소 기준 .screenshots/(gitignore)에 저장한다.
const OUT = fileURLToPath(new URL('../.screenshots', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });

function attachLogging(page, label, stats) {
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) {
      stats.logs.push(`[${label}][console.${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => stats.logs.push(`[${label}][pageerror] ${err.message}`));
}

async function joinAndSelect(browser, { nickname, label, stats, characterLabel }) {
  const context = await browser.newContext({
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  attachLogging(page, label, stats);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('#nickname', nickname);
  await page.getByRole('button', { name: '들어가기' }).click();
  await page.waitForFunction(() => window.location.pathname === '/forest', undefined, {
    timeout: 180000,
  });

  // 캐릭터 선택 화면 또는 게임 캔버스 중 하나가 뜰 때까지 기다린다.
  await page.waitForFunction(
    () =>
      document.querySelector('.character-screen') !== null ||
      document.querySelector('canvas') !== null,
    undefined,
    { timeout: 180000 },
  );
  const selectionVisible = await page.locator('.character-screen').count();
  console.log(`${label}: 캐릭터 선택 화면 =`, selectionVisible);
  if (selectionVisible) {
    await page.getByRole('radio', { name: new RegExp(characterLabel) }).click();
    await page.getByRole('button', { name: '이 캐릭터로 숲에 들어가기' }).click();
  }
  await page.waitForSelector('canvas', { timeout: 180000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/character-${label}.png` });
  return { context, page };
}

const stats = { logs: [] };
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});

const a = await joinAndSelect(browser, {
  nickname: '기그스강아지',
  label: 'dog',
  stats,
  characterLabel: '강아지 · 꼬리흔들',
});
const b = await joinAndSelect(browser, {
  nickname: '기그스고양이',
  label: 'cat',
  stats,
  characterLabel: '고양이 · 살금살금',
});

await a.page.waitForTimeout(1500);
console.log('A hud:', (await a.page.locator('.hud-meta').innerText()).replace(/\n/g, ' | '));
console.log('B hud:', (await b.page.locator('.hud-meta').innerText()).replace(/\n/g, ' | '));

// A 새로고침 → 캐릭터 선택 화면이 다시 뜨면 실패
await a.page.reload({ waitUntil: 'networkidle' });
await a.page.waitForTimeout(3000);
const reselect = await a.page.locator('.character-screen').count();
const canvasAfterReload = await a.page.locator('canvas').count();
console.log('A reload: character-screen =', reselect, 'canvas =', canvasAfterReload);

// 알림판 API 확인
const first = await fetch(`${BASE}/api/announcements`);
const etag = first.headers.get('etag');
const payload = await first.json();
const second = await fetch(`${BASE}/api/announcements`, { headers: { 'if-none-match': etag ?? '' } });
console.log('announcements: status', first.status, 'etag', etag ? 'present' : 'none', 'items', payload.items?.length ?? 0);
console.log('conditional GET status =', second.status);

console.log('--- console issues ---');
console.log(stats.logs.slice(0, 40).join('\n') || '(none)');

await browser.close();
