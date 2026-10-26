import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'artifacts/browser-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    launchOptions: process.env.PROINSPECT_CHROMIUM
      ? { executablePath: process.env.PROINSPECT_CHROMIUM }
      : undefined,
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
  ],
});