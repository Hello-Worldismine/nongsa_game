/**
 * 상점 탭(비료·가구·낚시) → 비료 주기 → 낚시 → 집 들어가기 → 가구 배치/옮기기/보관 → 집 넓히기
 */
import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.E2E_SHOTS;
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

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
  await waitWorld(page);
}
const waitWorld = (page: Page) => page.waitForFunction(() => {
  const s = (window as any).__game?.scene?.getScene('world');
  return !!s?.me && !(window as any).__store?.getState().traveling;
});

const pos = (page: Page) => page.evaluate(() => {
  const s = (window as any).__game.scene.getScene('world');
  return { x: s.me.x as number, y: s.me.y as number };
});
async function walkTo(page: Page, tx: number, ty: number, axisFirst: 'x' | 'y' = 'x') {
  const axes = axisFirst === 'x' ? ['x', 'y'] : ['y', 'x'];
  for (const axis of axes) {
    for (let i = 0; i < 40; i++) {
      const p = await pos(page);
      const d = axis === 'x' ? tx - p.x : ty - p.y;
      if (Math.abs(d) < 3) break;
      const key = axis === 'x' ? (d > 0 ? 'ArrowRight' : 'ArrowLeft') : (d > 0 ? 'ArrowDown' : 'ArrowUp');
      await page.keyboard.down(key);
      await page.waitForTimeout(Math.min(600, Math.max(30, (Math.abs(d) / 72) * 1000)));
      await page.keyboard.up(key);
    }
  }
}
/** 먼 거리는 순간이동 (걷기는 다른 테스트에서 확인) */
const teleport = (page: Page, x: number, y: number) => page.evaluate(([px, py]) => {
  (window as any).__game.scene.getScene('world').me.setPos(px, py);
}, [x, y]);
async function face(page: Page, key: string) {
  await page.keyboard.down(key);
  await page.waitForTimeout(60);
  await page.keyboard.up(key);
  await page.waitForTimeout(150);
}
const store = <T,>(page: Page, fn: string) => page.evaluate(`(${fn})((window).__store.getState())`) as Promise<T>;
const emit = (page: Page, ev: string, payload?: unknown) => page.evaluate(async ([e, p]) => {
  const path = '/src/game/bus.ts';
  const { bus } = await import(/* @vite-ignore */ path);
  bus.emit(e, p);
}, [ev, payload] as const);

/** 월드 좌표를 클릭 */
async function clickWorld(page: Page, wx: number, wy: number) {
  const pt = await page.evaluate(([x, y]) => {
    const cam = (window as any).__game.scene.getScene('world').cameras.main;
    return { x: (x - cam.worldView.x) * cam.zoom, y: (y - cam.worldView.y) * cam.zoom };
  }, [wx, wy]);
  const box = (await page.getByTestId('game-canvas').boundingBox())!;
  await page.mouse.move(box.x + pt.x, box.y + pt.y);
  await page.waitForTimeout(100);
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
}

test('비료 · 낚시 · 집 꾸미기', async ({ context }) => {
  test.setTimeout(240_000);
  const a = await context.newPage();
  await signUp(a, 'house@test.dev', '집순이');
  // 체험 서버 DB 에서 골드 넉넉히 → 새로고침
  await a.evaluate(() => {
    const st = (window as any).__store.getState();
    const db = JSON.parse(localStorage.getItem('haetsal-local-db-v1')!);
    db.profiles[st.profile.id].gold = 60000;
    db.profiles[st.profile.id].tutorialStep = 99;
    localStorage.setItem('haetsal-notice-seen', 'skip'); // 공지 창은 아래에서 따로 확인
    localStorage.setItem('haetsal-local-db-v1', JSON.stringify(db));
  });
  await a.reload();
  await waitWorld(a);
  // 업데이트 공지: 새로고침 후 한 번 뜸 → 닫으면 다시 안 뜸
  await expect(a.getByTestId('update-notice')).toContainText('신고 ㄱㄱ');
  await shot(a, 'house_00_notice');
  await a.getByTestId('notice-close').click();
  await expect(a.getByTestId('update-notice')).toHaveCount(0);

  // ── 상점: 탭 4개, 가구는 색 골라서 ──
  await emit(a, 'interact', { kind: 'shop', id: 'shop' });
  await expect(a.getByTestId('shop-tab-seed')).toBeVisible();
  await a.getByTestId('buy-carrot').click();
  await a.getByTestId('shop-tab-fert').click();
  await a.getByTestId('buy-fert-4').click();
  await expect.poll(() => store<number>(a, 's => s.inventory["fert:4"] ?? 0')).toBe(1);
  await a.getByTestId('shop-tab-fishing').click();
  await a.getByTestId('buy-rod-1').click();
  await expect(a.getByTestId('buy-rod-1')).toHaveText('다 쓰면 다시 살 수 있어요');
  await expect(a.getByTestId('rod-left')).toHaveText('10/10');
  await a.getByTestId('shop-tab-furniture').click();
  await a.getByTestId('furn-color-bed-3').click();
  await a.getByTestId('buy-furn-bed').click();
  await a.getByTestId('furn-color-rug-5').click();
  await a.getByTestId('buy-furn-rug').click();
  await a.getByTestId('furn-color-sofa-0').click();
  await a.getByTestId('buy-furn-sofa').click();
  await expect.poll(() => store<number>(a, 's => s.inventory["furn:sofa:0"] ?? 0')).toBe(1);
  await shot(a, 'house_01_shop_furniture');
  expect(await store<number>(a, 's => s.inventory["furn:bed:3"] ?? 0')).toBe(1);
  expect(await store<number>(a, 's => s.profile.gold')).toBe(60000 - 20 - 20 - 80 - 400 - 300 - 600);
  await a.keyboard.press('Escape');

  // ── 내 농장: 당근 심고 비료 → 바로 다 자람 ──
  await a.getByTestId('btn-my-farm').click();
  await waitWorld(a);
  await expect.poll(() => store<string>(a, 's => s.space')).toMatch(/^farm:/);
  await walkTo(a, 248, 204, 'y'); await walkTo(a, 248, 204, 'x'); await walkTo(a, 248, 152, 'y'); await walkTo(a, 232, 152, 'x');
  await face(a, 'ArrowUp');
  await a.keyboard.press('e');
  await expect.poll(() => store<number>(a, 's => s.myFarm.crops.length')).toBe(1);
  await a.getByTestId('hotbar-fert-4').click();
  await expect(a.getByTestId('prompt')).toContainText('4분 비료 주기');
  await a.keyboard.press('e');
  await expect(a.getByText('4분 비료를 줬어요')).toBeVisible();
  // 화면의 남은 시간도 바로 줄어듦 (당근 30초 - 4분 → 바로 수확 가능) + 하얀 가루 표시
  await expect(a.getByTestId('prompt')).toContainText('수확하기');
  expect(await a.evaluate(() => (window as any).__game.scene.getScene('world').farmLayer.powders.size)).toBe(1);
  await teleport(a, 300, 200);
  await a.waitForTimeout(300);
  await shot(a, 'house_01b_fert_powder');
  expect(await store<number>(a, 's => s.inventory["fert:4"] ?? 0')).toBe(0);

  // ── 낚시: 농장 연못 왼쪽에서 오른쪽을 보고 ──
  await teleport(a, 396, 344); await walkTo(a, 409, 344, 'x');
  await face(a, 'ArrowRight');
  await expect(a.getByTestId('prompt')).toContainText('남은 10/10회');
  await a.keyboard.press('e');
  await expect.poll(() => store<string | null>(a, 's => s.fishing?.phase ?? null')).toBe('wait');
  await shot(a, 'house_02_fishing_wait');
  await expect.poll(() => store<string | null>(a, 's => s.fishing?.phase ?? null'), { timeout: 25_000, intervals: [100] }).toBe('bite');
  await shot(a, 'house_03_fishing_bite');
  await a.keyboard.press('e');
  await expect(a.getByText(/를 낚았어요/)).toBeVisible();
  await expect(a.getByTestId('rod-left')).toHaveText('9/10'); // 낚싯대 1회 사용
  await shot(a, 'house_03b_rod_gauge');
  const fish = await store<string[]>(a, 's => Object.keys(s.inventory).filter(k => k.startsWith("fish:"))');
  expect(fish.length).toBe(1);

  // ── 집 들어가기 ──
  await teleport(a, 96, 149);
  await face(a, 'ArrowUp');
  await expect(a.getByTestId('prompt')).toContainText('집에 들어가기');
  await a.keyboard.press('e');
  await expect.poll(() => store<string>(a, 's => s.space')).toMatch(/^house:/);
  await waitWorld(a);
  await expect(a.getByTestId('house-panel')).toBeVisible();
  await shot(a, 'house_04_empty_house');

  // 꾸미기: 침대를 고르고, 위로 조금 걸어가서 E 로 놓기
  await a.getByTestId('house-edit-toggle').click();
  await a.getByTestId('house-furn-bed-3').click();
  await walkTo(a, 64, 92, 'y');
  await walkTo(a, 40, 92, 'x');
  await face(a, 'ArrowUp');
  await a.keyboard.press('e');
  await expect.poll(() => store<number>(a, 's => s.viewHouse.items.length')).toBe(1);
  // 러그(밟을 수 있음) + 소파
  await a.getByTestId('house-furn-rug-5').click();
  await clickWorld(a, 16 * 4 + 8, 16 * 4 + 8); // 바닥 (3,1) 근처
  await expect.poll(() => store<number>(a, 's => s.viewHouse.items.length')).toBe(2);
  await a.getByTestId('house-furn-sofa-0').click();
  await clickWorld(a, 16 * 5 + 8, 16 * 3 + 8);
  await expect.poll(() => store<number>(a, 's => s.viewHouse.items.length')).toBe(3);
  await shot(a, 'house_05_furnished');

  // 놓인 침대 클릭 → 옮기기 → 보관
  const bed = await store<{ id: number; x: number; y: number }>(a, 's => s.viewHouse.items.find(i => i.type === "furn:bed")');
  await clickWorld(a, (1 + bed.x) * 16 + 8, (3 + bed.y) * 16 + 20);
  await expect(a.getByTestId('house-placing')).toBeVisible();
  await a.getByTestId('house-store').click();
  await expect.poll(() => store<number>(a, 's => s.inventory["furn:bed:3"] ?? 0')).toBe(1);
  expect(await store<number>(a, 's => s.viewHouse.items.length')).toBe(2);

  // 집 넓히기
  await a.getByTestId('btn-house-expand').click();
  await a.getByTestId('house-expand-btn').click();
  await expect.poll(() => store<number>(a, 's => s.viewHouse?.w ?? 0')).toBe(8);
  await waitWorld(a);
  await shot(a, 'house_06_expanded');

  // ── 친구가 놀러 와서 구경 (다른 탭) ──
  const b = await context.newPage();
  await b.addInitScript(() => { if (!sessionStorage.getItem('haetsal-local-session')) localStorage.removeItem('haetsal-local-session'); });
  await signUp(b, 'guest@test.dev', '손님');
  const ownerId = await store<string>(a, 's => s.profile.id');
  await b.evaluate(async (id) => {
    const path = '/src/features/game/actions.ts';
    const m = await import(/* @vite-ignore */ path);
    await m.goHouse(id);
  }, ownerId);
  await waitWorld(b);
  await expect(b.getByTestId('house-visit')).toContainText('집순이');
  expect(await store<number>(b, 's => s.viewHouse.items.length')).toBe(2);
  await shot(b, 'house_07_visit');
  // 나가기 → 그 농장의 집 앞
  await b.getByTestId('btn-leave-house').click();
  await expect.poll(() => store<string>(b, 's => s.space')).toMatch(/^farm:/);
});
