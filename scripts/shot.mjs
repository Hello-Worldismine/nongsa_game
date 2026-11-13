// 개발용: 헤드리스 브라우저로 페이지 스크린샷 찍기
// 사용법: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs]
import { chromium } from '@playwright/test';

const [url, out, w = '1280', h = '720', waitMs = '1500'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console error]', m.text()); });
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.goto(url);
await page.waitForTimeout(Number(waitMs));
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log('saved', out);
