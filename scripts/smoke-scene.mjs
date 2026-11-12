// [FEAT-15] 원하는 장소·시간의 숲 화면을 찍는다(개발 서버 필요: npm run dev).
//   node scripts/smoke-scene.mjs <이름> "spawn=cabin&time=13:00" [look]
//   - spawn: start | clearing | cabin, time: HH:MM (개발 모드 전용 주소 옵션)
//   - look: "up" 이면 하늘을 올려다본 한 장을 더 찍는다(마우스 고정 사용)
// 결과는 저장소의 .screenshots/(git에서 뺌)에 <이름>.png 로 저장된다.
// 개발 모드 첫 로드는 컴파일 때문에 1분 넘게 걸릴 수 있다.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = fileURLToPath(new URL('../.screenshots', import.meta.url));
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const [, , name = 'scene', query = '', look = ''] = process.argv;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`); });

await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 180000 });
await page.fill('#nickname', '테스터');
await page.getByRole('button', { name: '들어가기' }).click();
await page.waitForFunction(() => location.pathname === '/forest', undefined, { timeout: 180000 });
if (query) await page.goto(`${BASE}/forest?${query}`, { waitUntil: 'domcontentloaded', timeout: 180000 });

// 처음 방문이면 캐릭터 고르기 화면이 먼저 나온다(FEAT-04)
const enter = page.getByRole('button', { name: '숲으로 들어가기' });
const charScreen = page.locator('.character-screen');
await Promise.race([enter.waitFor({ timeout: 240000 }), charScreen.waitFor({ timeout: 240000 })]);
if (await charScreen.count()) {
  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: '이 캐릭터로 숲에 들어가기' }).click({ noWaitAfter: true });
}
await enter.click({ timeout: 240000 });
await page.waitForTimeout(4000);

const hud = async () => (await page.locator('.hud-meta').innerText()).replace(/\n/g, ' | ');
const brand = async () => (await page.locator('.hud-brand').innerText()).replace(/\n/g, ' ');
await page.screenshot({ path: `${OUT}/${name}.png` });
console.log(`${name}.png | ${await brand()} | ${await hud()}`);

if (look === 'up') {
  await page.mouse.click(640, 400);
  await page.waitForTimeout(800);
  if (await page.evaluate(() => !!document.pointerLockElement)) {
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(640, 400 - i * 40);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}-up.png` });
    console.log(`${name}-up.png`);
  } else {
    console.log('마우스 고정이 안 돼 하늘 사진은 건너뜀');
  }
}

fs.writeFileSync(`${OUT}/${name}-errors.log`, errors.join('\n'), 'utf8');
if (errors.length) console.log(`page errors: ${errors.length} (${name}-errors.log)`);
await browser.close();
