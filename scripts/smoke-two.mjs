import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:3000';
// [BUG-06] PC 사용자 폴더 절대 경로가 공개 저장소에 들어갔다 → 저장소 기준 .screenshots/(gitignore)에 저장한다.
const OUT = fileURLToPath(new URL('../.screenshots', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });

function attachLogging(page, label, stats) {
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) stats.logs.push(`[${label}][console.${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => stats.logs.push(`[${label}][pageerror] ${err.message}`));
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      const payload = String(frame.payload ?? '');
      if (payload.includes('players:move')) stats.moveFrames += 1;
      if (payload.includes('player:move') && !payload.includes('players:move')) {
        stats.legacyFrames += 1;
      }
    });
  });
}

async function join(browser, nickname, stats, label) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
  const page = await context.newPage();
  attachLogging(page, label, stats);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('#nickname', nickname);
  await page.getByRole('button', { name: '들어가기' }).click();
  await page.waitForFunction(() => window.location.pathname === '/forest', undefined, {
    timeout: 180000,
  });
  await page.waitForTimeout(2000);
  const enter = page.getByRole('button', { name: '숲으로 들어가기' });
  if (await enter.count()) await enter.click();
  await page.waitForTimeout(3000);
  return { context, page };
}

const stats = { logs: [], moveFrames: 0, legacyFrames: 0 };
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});

const a = await join(browser, '기그스A', stats, 'A');
const b = await join(browser, '기그스B', stats, 'B');

console.log('A hud:', (await a.page.locator('.hud-meta').innerText()).replace(/\n/g, ' | '));
console.log('B hud:', (await b.page.locator('.hud-meta').innerText()).replace(/\n/g, ' | '));

// B 가 앞으로 3초 걸으면 A 에 players:move 배치가 도착해야 한다.
await b.page.keyboard.down('KeyW');
await b.page.waitForTimeout(3000);
await b.page.keyboard.up('KeyW');
await a.page.waitForTimeout(1000);

console.log('players:move frames received by A =', stats.moveFrames);
console.log('legacy player:move frames =', stats.legacyFrames);

await a.page.screenshot({ path: `${OUT}/two-clients-a.png` });
await b.page.screenshot({ path: `${OUT}/two-clients-b.png` });

// A 를 닫으면 B 의 HUD 인원이 줄어야 한다.
await a.context.close();
await b.page.waitForTimeout(3000);
console.log('B hud after A left:', (await b.page.locator('.hud-meta').innerText()).replace(/\n/g, ' | '));

console.log('--- console issues ---');
console.log(stats.logs.slice(0, 40).join('\n') || '(none)');

await browser.close();
