import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: 'service-pages.spec.ts',
  outputDir: 'artifacts/service-enhancements/cross-browser-traces',
  reporter: [
    ['list'],
    ['json', { outputFile: 'artifacts/service-enhancements/cross-browser-results.json' }],
  ],
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
