/** Read-only laboratory audit. No forms, account creation or production writes. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const origin = process.env.SERVICE_REVIEW_ORIGIN || 'http://127.0.0.1:5175';
const label = process.env.SERVICE_REVIEW_LABEL || 'candidate';
assert.match(label, /^[a-z0-9-]+$/);
const out = 'artifacts/service-enhancements';
mkdirSync(out, { recursive: true });
const report = {
  origin,
  label,
  source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  note: 'Single cold-cache laboratory sample per page/profile; not field Core Web Vitals or a cross-origin timing comparison.',
  runs: [],
  errors: [],
};
const browser = await chromium.launch();
try {
  for (const mobile of [false, true]) {
    for (const path of [
      '/',
      '/residential',
      '/commercial',
      '/co-spaces',
      '/maintenance',
      '/tenants',
      '/leasing',
    ]) {
      const context = await browser.newContext({
        viewport: { width: mobile ? 390 : 1440, height: 900 },
        deviceScaleFactor: mobile ? 2 : 1,
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (mobile) {
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 150,
          downloadThroughput: 200000,
          uploadThroughput: 93750,
        });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        window.__servicePerformance = { lcp: 0, cls: 0, blockingMs: 0 };
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__servicePerformance.lcp = e.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            if (!e.hadRecentInput) window.__servicePerformance.cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            window.__servicePerformance.blockingMs += Math.max(0, e.duration - 50);
        }).observe({ type: 'longtask', buffered: true });
      });
      const response = await page.goto(origin + path, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, path);
      await page.evaluate(() => document.fonts.ready);
      await page
        .locator('main img')
        .first()
        .evaluate((img) => img.decode());
      // Allow buffered performance observations to be delivered before scrolling.
      await page.waitForTimeout(300);
      const initial = await page.evaluate(() => ({
        ...window.__servicePerformance,
        bytes: performance.getEntriesByType('resource').reduce((sum, e) => sum + e.transferSize, 0),
        ttfb: performance.getEntriesByType('navigation')[0].responseStart,
      }));
      const images = [];
      for (const img of await page.locator('main img').all()) {
        await img.scrollIntoViewIfNeeded();
        await img.evaluate((img) => img.decode());
        images.push(
          await img.evaluate((img) => ({
            src: img.currentSrc,
            width: img.naturalWidth,
            loading: img.loading,
            brand: img.classList.contains('pi-brand-image'),
          })),
        );
      }
      if (label !== 'baseline')
        assert.ok(
          images
            .filter((img) => img.brand)
            .every((img) => new URL(img.src).pathname.endsWith('.webp')),
          path + ': all brand imagery must use WebP',
        );
      assert.ok(initial.cls <= 0.1, path + ': excessive layout shift');
      assert.deepEqual(errors, [], path + ': browser errors');
      report.runs.push({
        path,
        profile: mobile ? 'mobile-150ms-1.6Mbps-4xCPU' : 'desktop-unthrottled',
        ...initial,
        images,
      });
      console.log(
        `${label} ${path} ${mobile ? 'mobile' : 'desktop'}: LCP ${Math.round(initial.lcp)}ms, CLS ${initial.cls.toFixed(3)}, blocking ${Math.round(initial.blockingMs)}ms`,
      );
      await context.close();
    }
  }
} catch (error) {
  report.errors.push(String(error));
  throw error;
} finally {
  writeFileSync(`${out}/performance-${label}.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
