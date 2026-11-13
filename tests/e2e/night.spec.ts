/**
 * 밤 + 마을 거지: 잡히면 돈을 뜯기고, 주위 주민 화면에도 알림, 같은 거지는 하루 1번
 * (체험 모드에서는 localStorage 'haetsal-force-night' 로 밤을 강제)
 */
import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.E2E_SHOTS;
async function shot(page: Page, name: string) { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); }

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
const store = <T,>(page: Page, fn: string) => page.evaluate(`(${fn})((window).__store.getState())`) as Promise<T>;

test('밤에 마을 거지에게 잡히면 돈을 뜯긴다', async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('haetsal-force-night', '1'));
  const a = await context.newPage();
  await signUp(a, 'night-a@test.dev', '올빼미');
  // 뜯길 돈 넉넉히 (체험 서버 DB)
  await a.evaluate(() => {
    const st = (window as any).__store.getState();
    const db = JSON.parse(localStorage.getItem('haetsal-local-db-v1')!);
    db.profiles[st.profile.id].gold = 10000;
    localStorage.setItem('haetsal-local-db-v1', JSON.stringify(db));
  });
  await a.reload();
  await a.waitForFunction(() => !!(window as any).__game?.scene?.getScene('world')?.me);
  await expect(a.getByTestId('day-clock')).toContainText('밤');
  await expect(a.getByTestId('day-clock')).toContainText('거지 조심');
  await a.waitForFunction(() => (window as any).__game.scene.getScene('world').beggars?.list?.length === 5);

  const b = await context.newPage();
  await b.addInitScript(() => { if (!sessionStorage.getItem('haetsal-local-session')) localStorage.removeItem('haetsal-local-session'); });
  await signUp(b, 'night-b@test.dev', '구경꾼');

  await a.bringToFront();
  // (B 가 가입하는 동안 가만히 서 있던 A 가 이미 잡혔을 수도 있으니 그 뒤부터 셈)
  await a.waitForTimeout(1500);
  const robbedBefore = await store<number[]>(a, 's => s.beggarRobbed');
  const before = await store<number>(a, 's => s.profile.gold');
  // 거지 1 옆으로 순간이동해서 가만히 서 있기
  await a.evaluate(() => {
    const s = (window as any).__game.scene.getScene('world');
    const free = s.beggars.list.filter((x: any) => !(window as any).__store.getState().beggarRobbed.includes(x.def.id));
    const bg = free[0].av;
    s.beggars.list.filter((x: any) => x !== free[0]).forEach((x: any) => { x.av.setPos(40, 40); x.cooldownUntil = performance.now() + 60_000; });
    free[0].mode = 'wander'; free[0].cooldownUntil = 0; free[0].targetId = null;
    s.me.setPos(bg.x + 24, bg.y);
  });
  await expect(a.getByText(/마을 거지에게 돈을 갈취당했습니다/).first()).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => store<number>(a, 's => s.profile.gold'), { timeout: 12_000 }).toBeLessThan(before);
  await a.waitForTimeout(400);
  await shot(a, 'night_01_robbed');
  const after = await store<number>(a, 's => s.profile.gold');
  const lost = before - after;
  expect(lost % 100).toBe(0);
  expect(lost).toBeGreaterThanOrEqual(100);
  expect(lost).toBeLessThanOrEqual(1000);
  const robbedAll = await store<number[]>(a, 's => s.beggarRobbed');
  const robbed = robbedAll.filter((x) => !robbedBefore.includes(x));
  expect(robbed.length).toBe(1);

  // 주위 주민(B) 화면에도 알림 (채팅 기록 / 말풍선)
  await b.bringToFront();
  await expect.poll(() => store<string[]>(b, 's => s.chatLog.map(m => m.nickname + ":" + m.body)'), { timeout: 10_000 })
    .toEqual(expect.arrayContaining([expect.stringContaining('올빼미:💸 마을 거지에게 돈을 갈취당했습니다')]));
  await shot(b, 'night_02_other_view');

  // 같은 거지 옆에 다시 서 있어도 더 이상 안 뜯김
  await a.bringToFront();
  const id = robbed[0];
  await a.evaluate((bid) => {
    const s = (window as any).__game.scene.getScene('world');
    const bg = s.beggars.list.find((x: any) => x.def.id === bid);
    // 다른 거지들은 멀리 보내기
    s.beggars.list.forEach((x: any) => { if (x !== bg) x.av.setPos(40, 40); x.cooldownUntil = 0; x.mode = 'wander'; });
    s.me.setPos(bg.av.x + 20, bg.av.y);
  }, id);
  await a.waitForTimeout(2500);
  expect(await store<number>(a, 's => s.profile.gold')).toBe(after);

  // 낮이 되면 거지가 사라짐
  await a.evaluate(() => localStorage.setItem('haetsal-force-night', '0'));
  await a.waitForFunction(() => (window as any).__game.scene.getScene('world').beggars.list.length === 0, null, { timeout: 5000 });
  await expect(a.getByTestId('day-clock')).toContainText('낮');
});
