import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SECONDARY_NAVIGATION } from '../../packages/marketing/public-navigation';

test.beforeEach(async ({ request }) => {
  // Browser fixtures must never exercise the connected production environment.
  const response = await request.get('/api/health');
  expect(response.ok()).toBe(true);
  expect((await response.json()).environment).toBe('local');
});

const pages = [
  '/',
  '/residential',
  '/commercial',
  '/co-spaces',
  '/maintenance',
  '/tenants',
  '/leasing',
];
for (const width of [390, 1440]) {
  for (const path of pages) {
    test(`${path} has accessible content, working imagery and no overflow at ${width}px`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('requestfailed', (request) => {
        if (request.resourceType() === 'script' && request.failure()?.errorText !== 'net::ERR_ABORTED')
          errors.push('Script request failed: ' + request.url() + ' (' + request.failure()?.errorText + ')');
      });
      page.on('response', (response) => {
        if (response.request().resourceType() === 'script' && response.status() >= 400)
          errors.push('Script response ' + response.status() + ': ' + response.url());
      });
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('main h1')).toHaveCount(1);
      for (const img of await page.locator('main img').all()) {
        await img.scrollIntoViewIfNeeded();
        await expect
          .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
          .toBe(true);
        await img.evaluate((el: HTMLImageElement) => el.decode());
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
      ).toBe(true);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      await info.attach('accessibility', {
        body: JSON.stringify(result.violations, null, 2),
        contentType: 'application/json',
      });
      expect(result.violations).toEqual([]);
      expect(errors).toEqual([]);
      await page.screenshot({
        path: `artifacts/service-enhancements/${info.project.name}-${path.slice(1) || 'home'}-${width}.png`,
        fullPage: true,
      });
    });
  }
}

for (const width of [320, 390, 768, 1024, 1440, 1920]) {
  test(`secondary navigation supports keyboard, focus return and dismissal at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/residential');
    // Wait for hydration before exercising React event handlers.
    await expect(page.locator('main h1')).toBeVisible();
    const mobile = width < 1024;
    const menu = page.locator('.marketing-menu');
    if (mobile) await menu.locator('summary').click();
    const nav = page.locator(mobile ? '.marketing-menu nav' : '.mkt-site-links');
    await expect(nav.getByRole('link', { name: 'Residential', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const toggle = nav.locator('button[aria-label="Residential pages"]');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // macOS Safari uses Option-Tab to include links with its default keyboard preference.
    await page.keyboard.press(
      browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab',
    );
    await expect(
      nav.getByRole('link', { name: 'Residential services', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowDown');
    await expect(
      nav.getByRole('link', { name: 'Residential services', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    for (const button of await nav.getByRole('button').all()) {
      await button.click();
      const id = await button.getAttribute('aria-controls');
      const submenu = page.locator('#' + id);
      await expect(submenu).toBeVisible();
      const box = await submenu.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      await page.keyboard.press('Escape');
    }
    await expect(nav.getByRole('button', { name: 'Modular pages' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'Construction pages' })).toHaveCount(0);
    await toggle.click();
    await page.mouse.click(5, 200);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    if (mobile) {
      await expect(menu).not.toHaveAttribute('open', '');
      await menu.locator('summary').click();
    }
    const tenantToggle = nav.locator('button[aria-label="Tenants pages"]');
    await tenantToggle.click();
    await nav.getByRole('link', { name: 'Maintenance and urgent assistance', exact: true }).click();
    await expect(page).toHaveURL(/\/tenants#maintenance-help$/);
    await expect(tenantToggle).toHaveAttribute('aria-expanded', 'false');
    if (mobile) await expect(menu).not.toHaveAttribute('open', '');
    const heading = page.locator('#maintenance-help h2');
    await expect(heading).toBeVisible();
    await expect.poll(async () => (await heading.boundingBox())!.y).toBeGreaterThan(105);
  });
}

test('all secondary destinations resolve and in-page targets exist', async ({ page, request }) => {
  for (const item of Object.values(SECONDARY_NAVIGATION).flat()) {
    const response = await request.get(item.href);
    expect(response.status(), item.href).toBe(200);
    if (item.href.includes('#')) {
      await page.goto(item.href);
      await expect(page.locator('#' + item.href.split('#')[1])).toHaveCount(1);
    }
  }
});

test('public service pages preserve terms, enquiry-only offers and private tenant entry', async ({
  page,
}) => {
  await page.goto('/residential');
  await expect(page.locator('#residential-services .pi-solution-tile')).toHaveCount(8);
  await expect(
    page.getByRole('link', { name: 'Explore Tailored Property Solutions' }),
  ).toHaveAttribute('href', '/residential/services/other-property-support');
  await expect(page.locator('#subscription-support')).toContainText(
    'AUD $50 + GST per week per property',
  );
  await expect(page.locator('#subscription-support')).toContainText(
    '24-month term and 60 days’ written cancellation notice',
  );
  await page.goto('/commercial');
  await expect(page.locator('main')).toContainText('not currently available booking products');
  await expect(page.locator('main a[href*="book"], main a[href*="checkout"]')).toHaveCount(0);
  await page.goto('/co-spaces');
  await expect(page.getByRole('link', { name: 'Explore Co-Living solutions' })).toHaveAttribute(
    'href',
    '/co-living',
  );
  await expect(page.getByRole('link', { name: 'Explore Co-Working solutions' })).toHaveAttribute(
    'href',
    '/co-spaces/co-working',
  );
  await page.goto('/maintenance');
  await expect(page.locator('#property-care-process')).toContainText(
    'You approve the quote before expenditure',
  );
  await expect(page.locator('#property-care-process')).toContainText(
    'no automatic spending allowance',
  );
  await page.goto('/tenants');
  await expect(page.locator('#tenant-actions .pi-solution-tile')).toHaveCount(6);
  await expect(page.locator('#maintenance-help')).toContainText(
    'not an emergency reporting service',
  );
  await expect(page.locator('main')).toContainText('Signing up alone does not grant access');
  await expect(page.locator('main form, main input[type="file"]')).toHaveCount(0);
});
