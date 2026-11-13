import { defineConfig } from '@playwright/test';

/**
 * E2E 테스트는 서버 없이도 돌 수 있도록 "체험 모드(local)" 백엔드로 실행합니다.
 * (같은 브라우저 컨텍스트의 두 탭 = 두 명의 플레이어)
 * 설치된 Edge/Chrome 을 사용: PW_CHANNEL=chrome 으로 바꿀 수 있어요.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    channel: process.env.PW_CHANNEL ?? 'msedge',
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    port: 5174,
    reuseExistingServer: true,
    env: { VITE_BACKEND: 'local' },
    timeout: 60_000,
  },
});
