import { expect, test } from '@playwright/test';
import { SECTOR_OVERVIEWS } from '../../packages/marketing/sector-overviews';

test('phone header keeps the logo, sign-in button and menu on the same row', async ({ page }) => {
  for (const width of [390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const centres = await page.locator('.mkt-site-header').evaluate((header) =>
      ['.mkt-brand', '.mkt-header-actions', '.marketing-menu'].map((selector) => {
        const bounds = header.querySelector(selector)!.getBoundingClientRect();
        return bounds.top + bounds.height / 2;
      }),
    );
    expect(Math.max(...centres) - Math.min(...centres), width + 'px header alignment').toBeLessThan(
      2,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
      true,
    );
  }
});

test('logo returns home and all service overviews have working images, FAQs and portal access', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [slug, content] of Object.entries(SECTOR_OVERVIEWS)) {
    await page.goto('/' + slug);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(content.headline);
    await expect(
      page.locator('.pi-editorial-copy').getByRole('link', { name: 'Discuss your requirements' }),
    ).toHaveAttribute('href', '/contact');
    const image = page.locator('.pi-editorial-hero-image img');
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await page.locator('.mkt-faq-list summary').first().click();
    await expect(page.locator('.mkt-faq-list details').first()).toHaveAttribute('open', '');
    if ('planned' in content)
      await expect(page.getByRole('complementary', { name: 'Service availability' })).toContainText(
        'not yet available to book',
      );
    await page.getByRole('link', { name: 'ProInspect home', exact: true }).click();
    await expect(page).toHaveURL('http://127.0.0.1:5173/');
  }
  expect(errors).toEqual([]);
});

test('new pages reflow at narrow sizes and include canonical metadata and tenant navigation', async ({
  page,
  request,
}) => {
  const paths = [
    '/residential',
    '/commercial',
    '/strata',
    '/co-living',
    '/student-living',
    '/construction',
    '/maintenance',
    '/leasing',
    '/about',
    '/who-we-help',
    '/contact',
    '/tenants',
  ];
  for (const width of [320, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator('main h1')).toHaveCount(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
        width + 'px ' + path,
      ).toBe(true);
      await expect(page.locator('main .mkt-art-illustration-note')).toHaveCount(0);
    }
  }
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const path of paths.filter((path) => path !== '/leasing'))
    expect(sitemap).toContain('https://proinspect.systems' + path + '</loc>');
  expect(sitemap).not.toContain('https://proinspect.systems/leasing</loc>');
  await page.goto('/tenants');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://proinspect.systems/tenants',
  );
  await expect(
    page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Tenants' }),
  ).toHaveAttribute('aria-current', 'page');
});

test('Leasing goes directly to the catalogue while preserving check-in and application recovery', async ({
  page,
}) => {
  await page.goto('/leasing');
  await expect(page.getByRole('heading', { name: 'Properties for lease.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search properties' })).toBeVisible();
  await page.getByLabel('Search property location').fill('no-match-synthetic-location');
  await page.getByRole('button', { name: 'Search properties' }).click();
  await expect(page.getByRole('heading', { name: 'No properties currently match.' })).toBeVisible();
  await page.getByRole('link', { name: 'View all properties' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5173/leasing');
  await page.goto('/tenants');
  await expect(
    page.getByRole('link', { name: 'Open home check-in', exact: false }),
  ).toHaveAttribute('href', '/open-home/check-in');
  await expect(page.getByRole('link', { name: 'Resume an existing application' })).toHaveAttribute(
    'href',
    '/rental-application/recover',
  );
});
