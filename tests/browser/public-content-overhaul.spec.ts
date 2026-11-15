import { expect, test } from '@playwright/test';

test('Student Living is an independent, usable service programme with responsive content', async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/student-living');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Room-by-room support for a better student accommodation experience.',
    );
    await expect(page.getByRole('heading', { name: 'From enquiry to a working programme.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Practical outcomes, connected to the property.' })).toBeVisible();
    await expect(page.locator('.pi-editorial-hero-image img')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
  }
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href', 'https://proinspect.systems/student-living',
  );
});

test('homepage compares advertised prices without representing provisional entitlements as final', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.pi-plan-card')).toHaveCount(3);
  await expect(page.locator('.pi-plan-card').nth(0)).toContainText('$20');
  await expect(page.locator('.pi-plan-card').nth(1)).toContainText('$150');
  await expect(page.locator('.pi-plan-card').nth(2)).toContainText('$150');
  await expect(page.locator('.pi-plan-disclosure')).toContainText('property-specific subscription schedule');
  await expect(page.locator('.pi-property-card')).toHaveCount(8);
});

test('legacy duplicate sector pages permanently redirect and canonical sitemap includes Student Living', async ({ request }) => {
  const redirects: Record<string, string> = {
    '/sectors/residential': '/residential',
    '/sectors/commercial': '/commercial',
    '/sectors/strata-building': '/strata',
  };
  for (const [legacy, canonical] of Object.entries(redirects)) {
    const response = await request.get(legacy, { maxRedirects: 0 });
    expect(response.status(), legacy).toBe(301);
    expect(response.headers()['location'], legacy).toBe(canonical);
  }
  const xml = await (await request.get('/sitemap.xml')).text();
  expect(xml).toContain('https://proinspect.systems/student-living</loc>');
  expect(xml).not.toContain('https://proinspect.systems/sectors/');
});

test('guided service finder distinguishes Student Living room tasks from tailored programmes', async ({ page }) => {
  await page.goto('/service-finder');
  await page.getByLabel('Property setting').selectOption('student-living');
  await expect(page.getByRole('link', { name: /View scope and next steps/ })).toHaveCount(2);
  await page.getByLabel('Your intended outcome').selectOption('programme');
  await expect(page.getByRole('heading', { name: 'A tailored programme fits this request.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Explore the programme/ })).toHaveAttribute('href', '/student-living');
  await page.getByLabel('Property setting').selectOption('construction');
  await page.getByLabel('Your intended outcome').selectOption('defects');
  await expect(page.getByRole('link', { name: /View scope and next steps/ })).toHaveCount(2);
});
