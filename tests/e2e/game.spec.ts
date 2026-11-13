/**
 * 핵심 사용자 시나리오 E2E (체험 모드 백엔드)
 *  1. 회원가입 → 캐릭터 → 마을 스폰
 *  2. 상점까지 걸어가서 당근 씨앗 구매 → 내 농장 → 심기 → 30초 성장 → 새로고침 후 유지 → 수확 → 판매
 *  3. 두 번째 플레이어(다른 탭) 접속 → 서로 보임 → 이동 동기화 → 말풍선 채팅 → 농장 방문(심기 불가)
 */
import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.E2E_SHOTS;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function signUp(page: Page, email: string, nickname: string) {
  await page.bringToFront(); // 헤드리스에서 뒤쪽 탭은 그리기가 멈출 수 있음
  await page.goto('/');
  // 같은 브라우저에 다른 계정 로그인이 남아 있으면 먼저 로그아웃
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
  await expect(page.getByTestId('hotbar')).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__game?.scene?.getScene('world')?.me);
}

const pos = (page: Page) => page.evaluate(() => {
  const s = (window as any).__game.scene.getScene('world');
  return { x: s.me.x as number, y: s.me.y as number };
});

/** 목표 지점까지 방향키로 걸어가기 (축 하나씩) */
async function walkTo(page: Page, tx: number, ty: number, axisFirst: 'x' | 'y' = 'x') {
  const axes = axisFirst === 'x' ? ['x', 'y'] : ['y', 'x'];
  for (const axis of axes) {
    for (let i = 0; i < 40; i++) {
      const p = await pos(page);
      const d = axis === 'x' ? tx - p.x : ty - p.y;
      if (Math.abs(d) < 4) break;
      const key = axis === 'x' ? (d > 0 ? 'ArrowRight' : 'ArrowLeft') : (d > 0 ? 'ArrowDown' : 'ArrowUp');
      await page.keyboard.down(key);
      await page.waitForTimeout(Math.min(600, Math.max(40, (Math.abs(d) / 72) * 1000)));
      await page.keyboard.up(key);
    }
  }
}

async function face(page: Page, key: string) {
  await page.keyboard.down(key);
  await page.waitForTimeout(70);
  await page.keyboard.up(key);
  await page.waitForTimeout(120);
}

async function enterField(page: Page) {
  await walkTo(page, 248, 204, 'y');
  await walkTo(page, 248, 204, 'x');
  await walkTo(page, 248, 152, 'y');
  await walkTo(page, 232, 152, 'x');
}

const gold = async (page: Page) => Number((await page.locator('[data-testid=my-nickname] + span').innerText()).replace(/\D/g, ''));

test('농사 루프 + 멀티플레이', async ({ context }) => {
  const a = await context.newPage();
  await signUp(a, 'a@test.dev', '토끼농부');
  await expect(a.getByTestId('tutorial')).toContainText('방향키');
  await shot(a, 'e2e_01_village');

  // ── 벤치에 앉았다가 일어나서 어느 방향으로든 움직일 수 있어야 함 ──
  await walkTo(a, 384, 390, 'y');
  await walkTo(a, 384, 390, 'x');
  await expect(a.getByTestId('prompt')).toContainText('벤치에 앉기');
  // E 입력이 드물게 씹히는 경우가 있어 최대 3번까지 눌러 봄
  await expect(async () => {
    if (!(await a.getByTestId('prompt').innerText()).includes('일어나기')) await a.keyboard.press('e');
    await expect(a.getByTestId('prompt')).toContainText('일어나기', { timeout: 1000 });
  }).toPass({ timeout: 5000 });
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp']) {
    const before = await pos(a);
    await a.keyboard.down(key); await a.waitForTimeout(350); await a.keyboard.up(key);
    const after = await pos(a);
    expect(Math.hypot(after.x - before.x, after.y - before.y), `${key} 이동`).toBeGreaterThan(8);
    if (key === 'ArrowLeft') { await walkTo(a, 384, 390, 'x'); await a.keyboard.press('e'); } // 다시 앉았다가
  }

  // ── 상점까지 걸어가기 (광장 → 북쪽 길 → 상점 문 앞) ──
  await walkTo(a, 330, 380, 'x');
  await walkTo(a, 330, 214, 'y');
  await walkTo(a, 200, 214, 'x');
  await expect(a.getByTestId('prompt')).toContainText('씨앗 상점');
  await a.keyboard.press('e');
  await expect(a.getByRole('dialog', { name: '씨앗 상점' })).toBeVisible();
  await a.getByTestId('seed-card-carrot').getByRole('button', { name: '+' }).click();
  await a.getByTestId('seed-card-carrot').getByRole('button', { name: '+' }).click();
  await shot(a, 'e2e_02_shop');
  await a.getByTestId('buy-carrot').click();
  await expect(a.getByTestId('hotbar-carrot')).toBeVisible();
  expect(await gold(a)).toBe(240);
  await a.keyboard.press('Escape');

  // ── 내 농장으로 ──
  await a.getByTestId('btn-my-farm').click();
  await expect(a.getByTestId('travel-overlay')).toBeHidden({ timeout: 15000 });
  await a.waitForFunction(() => (window as any).__game.scene.getScene('world').farmLayer?.size === 3);
  // 울타리 아래쪽 문(x=248)으로 들어가서 밭 (0,0) 중심 = (232,136) 아래에서 위를 바라보고 심기
  await enterField(a);
  await face(a, 'ArrowUp');
  await expect(a.getByTestId('prompt')).toContainText('당근 씨앗 심기');
  await a.keyboard.press('e');
  await a.waitForFunction(() => (window as any).__game.scene.getScene('world').farmLayer.cropAt(0, 0));
  // 옆 칸에는 마우스 클릭으로 심기
  const canvasBox = await a.getByTestId('game-canvas').boundingBox();
  const screenOf = (wx: number, wy: number) => a.evaluate(([x, y]) => {
    const cam = (window as any).__game.scene.getScene('world').cameras.main;
    return { x: (x - cam.worldView.x) * cam.zoom, y: (y - cam.worldView.y) * cam.zoom };
  }, [wx, wy]);
  const p10 = await screenOf(248, 136);
  await a.mouse.click(canvasBox!.x + p10.x, canvasBox!.y + p10.y);
  await a.waitForFunction(() => (window as any).__game.scene.getScene('world').farmLayer.cropAt(1, 0));
  await shot(a, 'e2e_03_planted');

  // ── 두 번째 플레이어 (다른 탭) ──
  const b = await context.newPage();
  // 새 탭은 "로그인 유지" 정보 때문에 A 로 자동 입장하므로, 이 탭에서만 기억된 로그인을 지우고 시작
  await b.addInitScript(() => { if (!sessionStorage.getItem('haetsal-local-session')) localStorage.removeItem('haetsal-local-session'); });
  await signUp(b, 'b@test.dev', '감자왕');
  await expect(b.getByTestId('online-count')).toContainText('2/10');

  // B 가 A 의 농장에 방문 → 서로 보임
  await b.getByTestId('btn-residents').click();
  await b.getByTestId('visit-토끼농부').click();
  await expect(b.getByTestId('travel-overlay')).toBeHidden({ timeout: 15000 });
  await b.waitForFunction(() => (window as any).__game.scene.getScene('world').others.size === 1, null, { timeout: 15000 });
  await a.waitForFunction(() => (window as any).__game.scene.getScene('world').others.size === 1, null, { timeout: 15000 });

  // B 의 이동이 A 화면에 반영
  await a.waitForTimeout(600);
  const before = await a.evaluate(() => [...(window as any).__game.scene.getScene('world').others.values()][0].x);
  await b.keyboard.down('ArrowRight'); await b.waitForTimeout(700); await b.keyboard.up('ArrowRight');
  await a.waitForTimeout(800);
  const after = await a.evaluate(() => [...(window as any).__game.scene.getScene('world').others.values()][0].x);
  expect(after - before).toBeGreaterThan(20);

  // B 의 채팅 → A 의 채팅 기록 + 말풍선
  await b.keyboard.press('Enter');
  await b.getByTestId('chat-input').fill('놀러왔어요! 당근 귀엽다');
  await b.keyboard.press('Enter');
  await expect(a.getByTestId('chat-log')).toContainText('감자왕: 놀러왔어요! 당근 귀엽다');
  await expect(b.getByTestId('chat-log')).toContainText('놀러왔어요!');
  await shot(a, 'e2e_04_visit_chat');

  // 방문자는 남의 밭에 심거나 수확할 수 없음
  await b.evaluate(async () => {
    const path = '/src/game/bus.ts';
    const { bus } = await import(/* @vite-ignore */ path);
    bus.emit('plot', { x: 2, y: 2 });
  });
  await expect(b.getByText('다른 사람의 농장은 구경만 할 수 있어요.')).toBeVisible();

  // ── 친구 밭 물 주기: B 가 A 의 당근(1,0) 앞에서 R → 수확 시간 단축, 바로 또는 불가 ──
  const readyAt = (page: Page) => page.evaluate(() => (window as any).__store.getState().viewFarm.crops.find((c: any) => c.x === 1 && c.y === 0)?.readyAt as number);
  await b.evaluate(() => { const s = (window as any).__game.scene.getScene('world'); s.me.setPos(248, 156); s.me.setState('up', false); });
  await expect(b.getByTestId('prompt')).toContainText('R: 밭 전체에 물 주기', { timeout: 5000 });
  const readyBefore = await readyAt(b);
  await b.keyboard.press('r');
  await expect(b.getByText('친구 밭 작물 2개에 물을 줬어요!')).toBeVisible();
  await expect.poll(() => readyAt(b)).toBeLessThan(readyBefore);
  await expect.poll(() => readyAt(a), { timeout: 8000 }).toBeLessThan(readyBefore); // 주인 화면에도 반영
  await expect(a.getByTestId('chat-notice')).toContainText('감자왕님이 내 밭에 물을 줬어요', { timeout: 8000 }); // 주인 채팅창에 공지
  // 물을 줘서 당근이 바로 다 자람 → 방문자 화면에도 새 시간이 바로 반영돼야 함
  await expect(b.getByTestId('prompt')).toContainText(/다 자랐어요|뒤에 다시 물을 줄 수 있어요/);
  await b.keyboard.press('r');
  await expect(b.getByText('이 친구 밭에는 이미 물을 줬어요')).toBeVisible();

  // ── 성장 대기 (당근 30초) → 새로고침 후에도 유지 ──
  await a.waitForTimeout(31_000);
  // 두 번째 접속부터는 캐릭터 화면 없이 바로 마을로 입장
  await a.reload();
  await expect(a.getByTestId('nickname')).toHaveCount(0);
  await expect(a.getByTestId('hotbar')).toBeVisible();
  await a.getByTestId('btn-my-farm').click();
  await expect(a.getByTestId('travel-overlay')).toBeHidden({ timeout: 15000 });
  await a.waitForFunction(() => {
    const s = (window as any).__game.scene.getScene('world');
    return s.farmLayer && s.farmLayer.cropAt(0, 0) && s.farmLayer.cropAt(1, 0);
  });
  await shot(a, 'e2e_05_grown');
  await enterField(a);
  await face(a, 'ArrowUp');
  await expect(a.getByTestId('prompt')).toContainText('수확하기');
  await a.keyboard.press('e');
  await a.waitForFunction(() => !(window as any).__game.scene.getScene('world').farmLayer.cropAt(0, 0));
  // 같은 칸 다시 수확 시도 → 빈 밭
  
  await walkTo(a, 248, 152, 'x');
  await face(a, 'ArrowUp');
  await a.keyboard.press('e');
  await a.waitForFunction(() => !(window as any).__game.scene.getScene('world').farmLayer.cropAt(1, 0));

  // ── 보관함: 당근 1개 넣었다가 꺼내기 (판매는 불가) ──
  await a.keyboard.press('i');
  await expect(a.getByRole('dialog', { name: '가방' })).toBeVisible();
  await a.keyboard.press('Escape');
  await walkTo(a, 248, 152, 'x');
  await walkTo(a, 248, 204, 'y');
  await walkTo(a, 164, 204, 'x');
  await walkTo(a, 164, 150, 'y');
  await face(a, 'ArrowUp');
  await expect(a.getByTestId('prompt')).toContainText('보관함');
  await a.keyboard.press('e');
  await expect(a.getByRole('dialog', { name: '내 보관함' })).toBeVisible();
  await a.getByTestId('deposit-crop:carrot').getByRole('button', { name: '−' }).click();
  await a.getByTestId('deposit-crop:carrot').getByRole('button', { name: '넣기' }).click();
  await expect(a.getByTestId('stored-crop:carrot')).toContainText('× 1');
  await expect(a.getByTestId('storage-log')).toContainText('당근 1개를 넣었어요');
  await shot(a, 'e2e_06_storage');
  await a.getByTestId('stored-crop:carrot').getByRole('button', { name: '꺼내기' }).click();
  await expect(a.getByTestId('storage-box')).toContainText('아직 비어 있어요');
  await expect(a.getByText('sell-all')).toHaveCount(0);
  await a.keyboard.press('Escape');

  // B 가 A 의 농장에서 보관함 기록을 구경 (넣기/빼기 버튼 없음)
  await b.evaluate(async () => {
    const path = '/src/game/bus.ts';
    const { bus } = await import(/* @vite-ignore */ path);
    bus.emit('interact', { kind: 'ship', id: 'ship' });
  });
  await expect(b.getByRole('dialog', { name: '토끼농부님의 보관함' })).toBeVisible();
  await expect(b.getByTestId('storage-log')).toContainText('당근 1개를 꺼냈어요');
  await expect(b.getByRole('button', { name: '꺼내기' })).toHaveCount(0);
  await b.keyboard.press('Escape');

  // ── 농장 방명록: 놀러 온 B 가 남기고, 주인 A 가 읽기 ──
  const openMailbox = (page: Page) => page.evaluate(async () => {
    const path = '/src/game/bus.ts';
    const { bus } = await import(/* @vite-ignore */ path);
    bus.emit('interact', { kind: 'mailbox', id: 'mailbox' });
  });
  await openMailbox(b);
  await expect(b.getByRole('dialog', { name: '토끼농부님의 방명록' })).toBeVisible();
  await b.getByTestId('guestbook-input').fill('당근밭 정말 귀여워요! 또 놀러 올게요 🥕');
  await b.getByTestId('guestbook-submit').click();
  await expect(b.getByTestId('guestbook-list')).toContainText('감자왕');
  await b.keyboard.press('Escape');
  await openMailbox(a);
  await expect(a.getByRole('dialog', { name: '내 농장 방명록' })).toBeVisible();
  await expect(a.getByTestId('guestbook-list')).toContainText('당근밭 정말 귀여워요!');
  await expect(a.getByTestId('guestbook-input')).toHaveCount(0); // 주인은 자기 방명록에 쓰지 않음
  await shot(a, 'e2e_06b_guestbook');
  await a.keyboard.press('Escape');

  // ── 마을 농산물 판매소에서 판매 ──
  await a.getByTestId('btn-to-village').click();
  await expect(a.getByTestId('travel-overlay')).toBeHidden({ timeout: 15000 });
  await a.waitForFunction(() => !(window as any).__game.scene.getScene('world').farmLayer);
  await walkTo(a, 448, 430, 'y');
  await walkTo(a, 520, 430, 'x');
  await walkTo(a, 520, 214, 'y');
  await walkTo(a, 696, 214, 'x');
  await expect(a.getByTestId('prompt')).toContainText('판매소');
  await a.keyboard.press('e');
  await expect(a.getByTestId('sell-row-carrot')).toContainText('× 2');
  await a.getByTestId('sell-all').click();
  await expect.poll(() => gold(a)).toBe(240 + 70);
  await a.keyboard.press('Escape');
  await shot(a, 'e2e_07_sold');

  // ── 분수대 위 주민 게시판: A 가 글을 쓰고 B 가 읽기 ──
  await walkTo(a, 520, 214, 'x'); // 왔던 길(북쪽 길 → 광장 동쪽)로 되돌아가기
  await walkTo(a, 520, 290, 'y');
  await walkTo(a, 448, 290, 'x');
  await face(a, 'ArrowUp');
  await expect(a.getByTestId('prompt')).toContainText('주민 게시판');
  await a.keyboard.press('e');
  await a.getByTestId('board-input').fill(`내일 저녁에 광장에서 만나요!
수박 파티 🍉`);
  await a.getByTestId('board-submit').click();
  await expect(a.getByTestId('board-posts')).toContainText('수박 파티');
  await shot(a, 'e2e_08_board');
  await a.keyboard.press('Escape');
  await b.getByTestId('btn-to-village').click();
  await expect(b.getByTestId('travel-overlay')).toBeHidden({ timeout: 15000 });
  await b.evaluate(async () => {
    const path = '/src/game/bus.ts';
    const { bus } = await import(/* @vite-ignore */ path);
    bus.emit('interact', { kind: 'residentBoard', id: 'residentBoard' });
  });
  await expect(b.getByTestId('board-posts')).toContainText('토끼농부');
  await expect(b.getByTestId('board-posts')).toContainText('내일 저녁에 광장에서 만나요!');
  await expect(b.getByTestId('board-posts').getByText('지우기')).toHaveCount(0); // 남의 글은 못 지움
  await b.keyboard.press('Escape');

  // 튜토리얼은 판매까지 진행되면 완료
  await expect(a.getByTestId('tutorial')).toBeHidden();
});
