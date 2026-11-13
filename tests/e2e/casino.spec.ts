/**
 * 과일 따기 + 햇살 카지노 (두 사람이 함께 한 판)
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
const gold = async (page: Page) => Number((await page.locator('[data-testid=my-nickname] + span').innerText()).replace(/\D/g, ''));
const openCasino = (page: Page) => page.evaluate(async () => {
  const path = '/src/game/bus.ts';
  const { bus } = await import(/* @vite-ignore */ path);
  bus.emit('interact', { kind: 'casino', id: 'casino' });
});

test('과일 따기 + 카지노 한 판', async ({ context }) => {
  const a = await context.newPage();
  await signUp(a, 'ca@test.dev', '토끼농부');

  // ── 과일: 마을 복숭아 나무 앞에서 E → +30G, 바로 다시는 못 땀 ──
  await a.evaluate(() => {
    const s = (window as any).__game.scene.getScene('world');
    const t = s.map.objects.find((o: any) => o.fruitId === 'v:4,31');
    s.me.setPos(t.x, t.y + 14); // 테스트용: 나무 바로 앞으로 이동
  });
  await expect(a.getByTestId('prompt')).toContainText('복숭아 따기 (+30G)');
  await a.keyboard.press('e');
  await expect.poll(() => gold(a)).toBe(330);
  await expect(a.getByTestId('prompt')).toContainText('다시 열리기까지');
  await a.waitForFunction(() => (window as any).__game.scene.getScene('world').fruitTrees.find((t: any) => t.id === 'v:4,31').img.texture.key === 'tree_peach_bare');

  // ── 분수 소원: 빌면 안내가 뜨고, 1분 안에 다시 빌면 쉬는 중 ──
  await a.evaluate(() => { (window as any).__game.scene.getScene('world').me.setPos(448, 384); });
  await expect(a.getByTestId('prompt')).toContainText('분수에 소원 빌기');
  const g1 = await gold(a);
  await a.keyboard.press('e');
  await expect(a.getByText(/\+30G \(1분 뒤에 다시 빌 수 있어요\)/)).toBeVisible();
  await expect.poll(() => gold(a)).toBe(g1 + 30);
  await a.keyboard.press('e');
  await expect(a.getByText('분수가 잠시 쉬고 있어요')).toBeVisible();
  // 이후 골드 계산이 흔들리지 않도록 330G 로 맞춤 (테스트용)
  await a.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('haetsal-local-db-v1')!);
    const id = (window as any).__store.getState().profile.id;
    db.profiles[id].gold = 330; localStorage.setItem('haetsal-local-db-v1', JSON.stringify(db));
    const st = (window as any).__store.getState(); st.set({ profile: { ...st.profile, gold: 330 } });
  });

  // 카지노 건물 앞 모습 (스크린샷)
  await a.evaluate(() => { (window as any).__game.scene.getScene('world').me.setPos(632, 330); });
  await a.waitForTimeout(1200);
  await expect(a.getByTestId('prompt')).toContainText('햇살 카지노 들어가기'); // 문 앞 안내
  await a.screenshot({ path: `${process.env.E2E_SHOTS ?? 'test-results'}/e2e_casino_building.png` });

  // ── 카지노: 두 사람이 걸고 모두 준비 → 한 사람이 판돈 전부 ──
  const b = await context.newPage();
  await b.addInitScript(() => { if (!sessionStorage.getItem('haetsal-local-session')) localStorage.removeItem('haetsal-local-session'); });
  await signUp(b, 'cb@test.dev', '감자왕');
  await openCasino(a);
  await openCasino(b);
  await expect(a.getByRole('dialog', { name: '햇살 카지노' })).toBeVisible();

  // A 가 100G 판을 열면 → 마을 채팅에 모집 글, B 는 같은 금액으로만 참가
  await a.getByTestId('casino-amount').fill('100');
  await a.getByTestId('casino-open').click();
  await expect(b.getByTestId('chat-log')).toContainText('100G 판을 모집해요', { timeout: 8000 });
  await expect(b.getByTestId('casino-stake')).toContainText('100G', { timeout: 6000 });
  await expect(b.getByTestId('casino-amount')).toHaveCount(0); // 금액을 고를 수 없음
  await b.getByTestId('casino-join').click();
  await expect(a.getByTestId('casino-bets')).toContainText('감자왕', { timeout: 6000 });
  await expect.poll(() => gold(a)).toBe(230);
  await expect.poll(() => gold(b)).toBe(200);

  await a.getByTestId('casino-ready').click();
  await expect(b.getByTestId('casino-bets')).toContainText('✅ 준비', { timeout: 6000 });
  await b.getByTestId('casino-ready').click();

  // 두 화면 모두 룰렛이 돌고 같은 결과가 나옴
  await expect(a.getByTestId('casino-spinning')).toBeVisible({ timeout: 6000 });
  await expect(b.getByTestId('casino-spinning')).toBeVisible({ timeout: 6000 });
  await expect(a.getByTestId('casino-result')).toBeVisible({ timeout: 10000 });
  await expect(b.getByTestId('casino-result')).toBeVisible({ timeout: 10000 });
  const resA = await a.getByTestId('casino-result').innerText();
  const resB = await b.getByTestId('casino-result').innerText();
  expect(resA).toBe(resB);
  expect(resA).toContain('200G');
  // 판돈 200G 가 한 명에게 → 두 사람 골드 합은 그대로 (230+200+200 = 630)
  await expect.poll(async () => (await gold(a)) + (await gold(b))).toBe(630);
  const ga = await gold(a), gb = await gold(b);
  expect([[430, 200], [230, 400]]).toContainEqual([ga, gb]);
  await a.screenshot({ path: `${process.env.E2E_SHOTS ?? 'test-results'}/e2e_casino.png` });
});
