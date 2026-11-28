import { expect, test } from '@playwright/test';
import { SECTOR_OVERVIEWS } from '../../packages/marketing/sector-overviews';

test('phone header keeps logo and sign-in aligned above navigation', async ({ page }) => {
  for (const width of [390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const centres = await page.locator('.mkt-site-header').evaluate((header) =>
      ['.mkt-brand', '.mkt-header-actions'].map((selector) => {
        const bounds = header.querySelector(selector)!.getBoundingClientRect();
        return bounds.top + bounds.height / 2;
      }),
    );
    expect(Math.max(...centres) - Math.min(...centres), width + 'px header alignment').toBeLessThan(2);
    const rows=await page.locator('.mkt-site-header').evaluate(header=>{
      const top=header.querySelector('.mkt-header-identity')!.getBoundingClientRect();
      const nav=header.querySelector('.mkt-header-navigation')!.getBoundingClientRect();
      return {top:top.bottom,nav:nav.top};
    });
    expect(rows.nav).toBeGreaterThanOrEqual(rows.top-1);
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
    if (!['residential','co-living','maintenance'].includes(slug)) continue;
    await page.goto('/' + slug);
    const approved = {
      residential: { heading: 'Your Property. Our Support. Your Peace of Mind.', name: 'Explore our residential solutions', href: '#residential-services' },
      'co-living': { heading: 'Your Property. A Complete Co-Living Solution.', name: 'Explore Co-Living Support', href: '#service-options' },
      maintenance: { heading: 'Taking Care of Your Property. Taking Care of the Details.', name: 'Explore our maintenance solutions', href: '#maintenance-solutions' },
    }[slug as 'residential' | 'co-living' | 'maintenance'];
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(approved.heading);
    const action = approved;
    await expect(
      page.locator('.pi-editorial-copy').getByRole('link', { name: action.name }),
    ).toHaveAttribute('href', action.href);
    await page.locator('.pi-editorial-copy').getByRole('link', { name: action.name }).click();
    await expect(page.locator(action.href)).toBeVisible();
    await expect(page.locator('.mkt-header-book')).toHaveAttribute('href', '/client');
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
    '/co-living',
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
      const overflow = await page.evaluate(() => {
        const viewport = window.innerWidth;
        const offenders = Array.from(document.querySelectorAll('main *'))
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            className: String(element.className).slice(0, 80),
            right: Math.round(element.getBoundingClientRect().right),
            text: (element.textContent || '').trim().slice(0, 65),
          }))
          .filter((item) => item.right > viewport + 2)
          .slice(0, 8);
        return {
          fits: document.documentElement.scrollWidth <= viewport + 2,
          scrollWidth: document.documentElement.scrollWidth,
          offenders,
        };
      });
      expect(
        overflow.fits,
        width + 'px ' + path + ' ' + JSON.stringify(overflow),
      ).toBe(true);
      await expect(page.locator('main .mkt-art-illustration-note')).toHaveCount(0);
    }
  }
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const path of paths.filter((path) => !['/leasing','/who-we-help'].includes(path)))
    expect(sitemap).toContain('https://proinspect.systems' + path + '</loc>');
  expect(sitemap).not.toContain('https://proinspect.systems/leasing</loc>');
  expect(sitemap).not.toContain('https://proinspect.systems/who-we-help</loc>');
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
  await expect(page.getByRole('heading', { name: 'Current Properties Available.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search properties' })).toBeVisible();
  await page.getByLabel('Search property location').fill('no-match-synthetic-location');
  await page.getByRole('button', { name: 'Search properties' }).click();
  await expect(page.getByRole('heading', { name: 'No properties currently match.' })).toBeVisible();
  await page.getByRole('link', { name: 'View all properties' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5173/leasing#available-properties');
  await page.goto('/tenants');
  const checkins = page.locator('main').getByRole('link', { name: 'Open home check-in', exact: true });
  await expect(checkins).toHaveCount(2);
  for (const link of await checkins.all()) {
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/open-home/check-in');
  }
  await expect(page.locator('#tenant-actions').getByRole('link', { name: 'Resume your application' })).toHaveAttribute('href', '/rental-application/recover');
  await expect(page.getByRole('link', { name: 'Resume an existing application' })).toHaveAttribute('href', '/rental-application/recover');
  await page.locator('#tenant-actions').getByRole('link', { name: 'Open home check-in', exact: true }).click();
  await expect(page).toHaveURL(/\/open-home\/check-in$/);
  await page.goto('/tenants');
  await page.locator('#tenant-actions').getByRole('link', { name: 'Resume your application' }).click();
  await expect(page).toHaveURL(/\/rental-application\/recover$/);
});
