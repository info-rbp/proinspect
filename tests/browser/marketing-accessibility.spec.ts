import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const reviewRoutes = [
  ['home', '/'],
  ['services', '/services'],
  ['inspection', '/services/routine-inspection'],
  ['residential', '/sectors/residential'],
  ['resources', '/resources'],
  ['contact', '/contact'],
  ['privacy-draft', '/privacy'],
] as const;

test('public marketing keyboard access preserves skip-link, responsive navigation and focus states', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  const menu = page.locator('.marketing-menu');
  const toggle = menu.locator('summary');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('open', '');
  const links = page.getByRole('navigation', { name: 'Mobile site navigation' });
  await expect(links.getByRole('link', { name: 'Services', exact: true })).toBeVisible();
  await links.getByRole('link', { name: 'Resources' }).click();
  await expect(page).toHaveURL(/\/resources$/);
  await expect(menu).not.toHaveAttribute('open', '');
});

test('public marketing reflows at narrow and wide desktop viewports', async ({ page }) => {
  for (const width of [320, 390, 768, 1100, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/services', '/services/routine-inspection', '/contact']) {
      await page.goto(path);
      const metrics = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        main: document.querySelectorAll('main#main').length,
        offenders: Array.from(document.querySelectorAll('body *')).map((node) => {
          const r = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return { element: node.tagName.toLowerCase(), className: String(node.className).slice(0, 100),
            left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
            position: style.position, overflowX: style.overflowX };
        }).filter((v) => v.right > window.innerWidth + 2 || v.left < -2).slice(0, 16),
      }));
      expect(metrics.main, path).toBe(1);
      expect(metrics.scroll, width + 'px ' + path + ': ' + JSON.stringify(metrics.offenders)).toBeLessThanOrEqual(metrics.client + 2);
    }
  }
});

test('draft legal content is visible but not presented as approved or indexable', async ({ page, request }) => {
  for (const path of ['/privacy', '/terms']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['x-robots-tag']).toContain('noindex');
    const html = await response.text();
    expect(html).toContain('noindex, nofollow');
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Pre-release information')).toBeVisible();
    await expect(page.getByText(/Do not treat this review draft as an approved policy or a binding contract/)).toBeVisible();
  }
});

test('public imagery remains labelled as illustration until genuinely approved local assets exist', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.mkt-art-illustration-note').first()).toBeVisible();
  expect(await page.locator('img[src*="/api/"],img[src*="/w/"],img[src*="r2"]').count()).toBe(0);
  await page.goto('/services/routine-inspection');
  await expect(page.getByText('ILLUSTRATIVE EXAMPLE', { exact: true })).toBeVisible();
  await expect(page.getByText(/not a genuine customer record/i)).toBeVisible();
});

test('marketing-wide design signoff captures representative desktop and mobile screens', async ({ page }) => {
  mkdirSync('artifacts/screenshots/marketing-release-review', { recursive: true });
  for (const [label, path] of reviewRoutes) {
    for (const device of [
      { label: 'desktop', width: 1440, height: 900 },
      { label: 'mobile', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: device.width, height: device.height });
      await page.goto(path);
      await expect(page.locator('main h1')).toHaveCount(1);
      await page.screenshot({
        path: 'artifacts/screenshots/marketing-release-review/' + label + '-' + device.label + '.png',
        fullPage: label === 'home' || label === 'inspection',
        animations: 'disabled',
      });
    }
  }
});
