import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const origin = process.env.PUBLIC_SITE_REVIEW_ORIGIN || 'http://127.0.0.1:5173';
const staging = 'https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev';
assert.ok(
  ['http://127.0.0.1:5173', staging].includes(origin),
  'Review targets local or existing staging only',
);
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const paths = [
  '/',
  '/residential',
  '/commercial',
  '/strata',
  '/co-living',
  '/construction',
  '/leasing',
  '/maintenance',
  '/about',
  '/who-we-help',
  '/contact',
  '/tenants',
];
const directory = 'artifacts/public-site-review';
mkdirSync(directory, { recursive: true });
const report = {
  sourceSha,
  origin,
  readOnly: true,
  productionTargeted: false,
  checks: [],
  errors: [],
  status: 'FAIL',
};
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  const health = await (await page.request.get(origin + '/api/health')).json();
  if (origin === staging)
    assert.equal(health.source, sourceSha, 'Preview must use the exact source commit');
  for (const viewport of [
    { label: 'desktop', width: 1440, height: 900 },
    { label: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const path of paths) {
      const response = await page.goto(origin + path, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, path);
      await expect(page.locator('main h1')).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
        'Horizontal overflow: ' + path,
      );
      for (const image of await page.locator('main img.pi-brand-image').all()) {
        await image.scrollIntoViewIfNeeded();
        await expect
          .poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0))
          .toBe(true);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path:
          directory + '/' + (path === '/' ? 'home' : path.slice(1)) + '-' + viewport.label + '.png',
        fullPage: true,
        animations: 'disabled',
      });
      report.checks.push({
        path,
        viewport: viewport.label,
        status: response.status(),
        imagesLoaded: true,
      });
    }
  }
  assert.deepEqual(report.errors, []);
  report.status = 'PASS';
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  writeFileSync(directory + '/review.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, checks: report.checks.length }, null, 2));
}
