import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// [BUG-06] PC 사용자 폴더 절대 경로가 공개 저장소에 들어갔다 → 저장소 기준 .screenshots/(gitignore)에 저장한다.
const OUT = fileURLToPath(new URL('../.screenshots', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
  ],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});
const page = await context.newPage();

const logs = [];
page.on('console', (msg) => {
  if (['error', 'warning'].includes(msg.type())) logs.push(`[console.${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));

const step = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`shot ${name}`);
};

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(800);
await step('01-landing');
console.log('title:', await page.title());
console.log('guest form:', await page.locator('#nickname').count());

await page.fill('#nickname', '테스터');
await page.getByRole('button', { name: '들어가기' }).click();
await page.waitForFunction(() => window.location.pathname === '/forest', undefined, {
  timeout: 180000,
});
await page.waitForTimeout(6000);
await step('02-start-overlay');
console.log('canvas:', await page.locator('canvas').count());
console.log('start button:', await page.getByRole('button', { name: '숲으로 들어가기' }).count());

await page.getByRole('button', { name: '숲으로 들어가기' }).click();
await page.waitForTimeout(2500);
await step('03-forest');
console.log('hud:', (await page.locator('.hud-meta').innerText()).replace(/\n/g, ' | '));

// 걷기: 앞으로 4초
await page.keyboard.down('KeyW');
await page.waitForTimeout(4000);
await page.keyboard.up('KeyW');
await page.waitForTimeout(500);
await step('04-walk');

// 달리기: 12초
await page.keyboard.down('ShiftLeft');
await page.keyboard.down('KeyW');
await page.waitForTimeout(12000);
await page.keyboard.up('KeyW');
await page.keyboard.up('ShiftLeft');
await page.waitForTimeout(800);
await step('05-run');
console.log('hud after run:', (await page.locator('.hud-meta').innerText()).replace(/\n/g, ' | '));

// 도움말
await page.keyboard.press('KeyH');
await page.waitForTimeout(500);
await step('06-help');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// 대화 패널
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
await step('07-chat');
const chatInput = page.locator('textarea, input[type="text"]').last();
if (await chatInput.count()) {
  await chatInput.fill('안녕하세요!');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  await step('08-chat-sent');
}
await page.keyboard.press('Escape');

// 모바일 뷰포트
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1200);
await step('09-mobile');

await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(500);

// 연결 상태 확인
console.log('connection text:', (await page.locator('.hud-meta').innerText()).replace(/\n/g, ' | '));

fs.writeFileSync(`${OUT}/console.log`, logs.join('\n'), 'utf8');
console.log('--- console issues ---');
console.log(logs.slice(0, 40).join('\n') || '(none)');

await browser.close();
