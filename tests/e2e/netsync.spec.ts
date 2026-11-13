/**
 * 네트워크 효율 + 부드러움 측정:
 *  - 걷는 동안 초당 보내는 이동 메시지 수 (Supabase 무료 요금제 한도 절약)
 *  - 받는 쪽 화면의 위치가 실제 위치를 얼마나 잘 따라가는지
 */
import { expect, test, type Page } from '@playwright/test';

async function signUp(page: Page, email: string, nickname: string) {
  await page.bringToFront();
  await page.goto('/');
  const signupTab = page.getByRole('button', { name: '회원가입' });
  const logoutBtn = page.getByRole('button', { name: '로그아웃' });
  await expect(signupTab.or(logoutBtn)).toBeVisible();
  if (await logoutBtn.isVisible()) await logoutBtn.click();
  await signupTab.click();
  await page.getByTestId('email').fill(email);
  await page.getByTestId('password').fill('pass1234');
  await page.getByTestId('password2').fill('pass1234');
  await page.getByTestId('auth-submit').click();
  await page.getByTestId('nickname').fill(nickname);
  await page.getByTestId('start-game').click();
  await page.waitForFunction(() => !!(window as any).__game?.scene?.getScene('world')?.me);
}

test('걷는 동안 메시지는 적게, 상대 화면은 부드럽게', async ({ context }) => {
  const a = await context.newPage();
  await signUp(a, 'na@test.dev', '토끼농부');
  const b = await context.newPage();
  await b.addInitScript(() => { if (!sessionStorage.getItem('haetsal-local-session')) localStorage.removeItem('haetsal-local-session'); });
  await signUp(b, 'nb@test.dev', '감자왕');
  await a.waitForFunction(() => (window as any).__game.scene.getScene('world').others.size === 1, null, { timeout: 15000 });

  // B: 보낸 이동 메시지 수 + 자기 실제 위치 기록 / A: B 캐릭터의 화면 위치 기록
  await b.evaluate(async () => {
    const w = window as any;
    const path = '/src/game/bus.ts';
    const { bus } = await import(/* @vite-ignore */ path);
    w.__sent = 0;
    bus.on('local:move', () => { w.__sent++; });
    w.__truth = [];
    w.__truthTimer = setInterval(() => { const m = w.__game.scene.getScene('world').me; w.__truth.push([Date.now(), m.x, m.y]); }, 50);
  });
  await a.evaluate(() => {
    const w = window as any;
    w.__seen = [];
    w.__seenTimer = setInterval(() => { const o = [...w.__game.scene.getScene('world').others.values()][0]; if (o) w.__seen.push([Date.now(), o.x, o.y]); }, 50);
  });

  // B 가 오른쪽으로 1.5초 → 아래로 1.5초 걷기 (광장 안쪽)
  await b.bringToFront();
  await b.keyboard.down('ArrowLeft'); await b.waitForTimeout(1500); await b.keyboard.up('ArrowLeft');
  await b.keyboard.down('ArrowUp'); await b.waitForTimeout(1500); await b.keyboard.up('ArrowUp');
  await b.waitForTimeout(800);

  const { sent, truth } = await b.evaluate(() => { const w = window as any; clearInterval(w.__truthTimer); return { sent: w.__sent as number, truth: w.__truth as number[][] }; });
  const seen = await a.evaluate(() => { const w = window as any; clearInterval(w.__seenTimer); return w.__seen as number[][]; });

  const walkSeconds = 3;
  const perSecond = sent / walkSeconds;
  // 같은 시각의 실제 위치와 화면 위치 차이
  const errs = seen.map(([t, x, y]) => {
    const near = truth.reduce((best, cur) => (Math.abs(cur[0] - t) < Math.abs(best[0] - t) ? cur : best));
    return Math.hypot(near[1] - x, near[2] - y);
  });
  const mean = errs.reduce((s, e) => s + e, 0) / errs.length;
  const max = Math.max(...errs);
  // 한 번에 크게 튀는 움직임이 없는지 (50ms 간격 이동량)
  const jumps = seen.slice(1).map((p, i) => Math.hypot(p[1] - seen[i][1], p[2] - seen[i][2]));
  const maxJump = Math.max(...jumps);
  console.log(`[netsync] 이동 메시지 ${sent}개 (초당 ${perSecond.toFixed(1)}개), 위치 오차 평균 ${mean.toFixed(1)}px · 최대 ${max.toFixed(1)}px, 50ms당 최대 이동 ${maxJump.toFixed(1)}px`);

  expect(perSecond).toBeLessThanOrEqual(4); // 예전 방식은 초당 7개
  expect(mean).toBeLessThan(16);            // 캐릭터 한 칸(16px) 이내로 따라옴
  expect(maxJump).toBeLessThan(12);         // 걷기 속도(72px/s → 50ms에 3.6px)의 3배 이내 → 순간이동 없음
});
