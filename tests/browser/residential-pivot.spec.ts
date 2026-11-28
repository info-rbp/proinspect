import { test, expect } from '@playwright/test';
const labels = [
  'Residential','Commercial','Co-Spaces','Maintenance','Modular','Construction',
  'Tenants','Leasing','Subscriptions','Information',
];
for (const width of [320, 390, 1440])
  test(`Residential public journeys at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      '/',
      '/residential',
      '/co-living',
      '/commercial',
      '/construction',
      '/co-spaces',
      '/co-spaces/co-working',
      '/modular',
      '/subscriptions',
      '/information',
      '/leasing',
      '/tenants',
      '/maintenance',
      '/about',
      '/who-we-help',
      '/contact',
      '/services',
      '/service-finder',
      '/residential-property-support',
      '/subscription-terms',
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('body')).not.toContainText('$150');
      await expect(page.locator('body')).not.toContainText('$20');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      expect(overflow, path + ' horizontal overflow').toBe(false);
      const retired = await page
        .locator('a[href]')
        .evaluateAll((links) =>
          links
            .map((a) => a.getAttribute('href'))
            .filter((h) =>
              /^\/(commercial|strata|construction|student-living)(\/|$)/.test(h || '') && !['/commercial','/construction'].includes(h || ''),
            ),
        );
      expect(retired, path + ' retired links').toEqual([]);
    }
    await page.goto('/residential');
    await expect(
      page.getByText('Residential All Inclusive Subscription', { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.pi-plan-disclosure').filter({ hasText: 'An initial 24-month term' }),
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText('$150');
    await expect(page.locator('body')).not.toContainText('$20');
    if (width < 1000) {
      await page.getByLabel('Site menu').click();
      expect(
        await page
          .getByRole('navigation', { name: 'Mobile site navigation' })
          .getByRole('link')
          .allTextContents(),
      ).toEqual(labels);
      await expect(page.getByRole('navigation', {name: 'Mobile site navigation'}).getByRole('link', {name: 'Sign Up / Sign In'})).toHaveCount(0);
      await expect(page.locator('.mkt-header-book')).toHaveAttribute('href','/client');
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('navigation', { name: 'Mobile site navigation' }),
      ).not.toBeVisible();
    } else {
      expect(
        await page
          .getByRole('navigation', { name: 'Primary navigation' })
          .getByRole('link')
          .allTextContents(),
      ).toEqual(labels);
    }
    await page.screenshot({ path: `artifacts/residential-pivot-${width}.png`, fullPage: true });
  });
test('retired routes and forged data requests are not new acquisition', async ({ request }) => {
  for (const path of [
    '/strata',
    '/commercial/new',
    '/construction/new',
    '/commercial-application/session',
    '/commercial-application/recover',
    '/services/commercial-property-inspection',
    '/properties-for-lease/commercial',
  ]) {
    const r = await request.get(path);
    expect(r.status(), path).toBe(410);
    expect(r.headers()['x-robots-tag']).toContain('noindex');
  }
  for(const path of ['/commercial','/construction']){
    const response=await request.get(path);
    expect(response.status(),path).toBe(200);
    expect(response.headers()['x-robots-tag']).toContain('noindex');
    expect((await request.post(path,{data:{}})).status()).toBe(410);
  }
  const student = await request.get('/student-living', { maxRedirects: 0 });
  expect(student.status()).toBe(301);
  expect(student.headers().location).toBe('/co-living');
  const sitemap = await request.get('/sitemap.xml');
  expect(await sitemap.text()).not.toMatch(
    /<loc>[^<]*(?:\/commercial|\/strata|\/student-living|\/construction)/,
  );
});
