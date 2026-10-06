import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --dir apps/platform dev --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'pnpm --dir apps/marketing dev --host 127.0.0.1 --port 5174',
      url: 'http://127.0.0.1:5174/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
