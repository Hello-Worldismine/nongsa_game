/**
 * 회귀 테스트: 상대가 잠깐 연결을 다시 맺어도(접속자 목록이 잠깐 비어도)
 * 내 화면에서 상대 캐릭터가 깜빡이며 사라지지 않아야 한다.
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

test('상대가 재연결해도 캐릭터가 깜빡이지 않음', async ({ context }) => {
  const a = await context.newPage();
  await signUp(a, 'fa@test.dev', '토끼농부');
  const b = await context.newPage();
  await b.addInitScript(() => { if (!sessionStorage.getItem('haetsal-local-session')) localStorage.removeItem('haetsal-local-session'); });
  await signUp(b, 'fb@test.dev', '감자왕');
  await a.waitForFunction(() => (window as any).__game.scene.getScene('world').others.size === 1, null, { timeout: 15000 });

  // A 화면에서 0.1초마다 상대 수를 기록
  await a.evaluate(() => {
    const w = window as any;
    w.__samples = [];
    w.__sampler = setInterval(() => w.__samples.push(w.__game.scene.getScene('world').others.size), 100);
  });
  // B 가 같은 공간 채널에 세 번 연달아 다시 접속 (연결 흔들림 재현)
  for (let i = 0; i < 3; i++) {
    await b.evaluate(async () => {
      const path = '/src/features/multiplayer/session.ts';
      const { session } = await import(/* @vite-ignore */ path);
      session.joinSpace('village');
    });
    await b.waitForTimeout(1200);
  }
  const samples = await a.evaluate(() => { const w = window as any; clearInterval(w.__sampler); return w.__samples as number[]; });
  expect(samples.length).toBeGreaterThan(20);
  expect(samples.filter((n) => n === 0)).toHaveLength(0); // 한 번도 사라지지 않음

  // 반대로, B 가 자기 농장으로 "진짜로 떠나면" 작별 신호로 A 화면에서 바로 사라져야 함 (45초 유예 없이)
  await b.getByTestId('btn-my-farm').click();
  await a.waitForFunction(() => (window as any).__game.scene.getScene('world').others.size === 0, null, { timeout: 5000 });
});
