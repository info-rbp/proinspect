import { expect, test } from '@playwright/test';

// The same browser origin must serve public content and every private route.
test('a visitor can browse marketing and enter the booking/sign-in workflow on one site', async ({ page, request }) => {
  const origin = 'http://127.0.0.1:5173';
  const homepage = await request.get('/');
  expect(homepage.status()).toBe(200);
  const html = await homepage.text();
  expect(html).toContain('Real property work.');
  expect(html).toContain('Clearly documented.');
  expect(html).toContain('ProInspect');
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/site/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Real property work.');
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Services' }).click();
  await expect(page).toHaveURL(`${origin}/services`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('The right service');
  await page.getByRole('link', { name: 'Explore service' }).first().click();
  await expect(page).toHaveURL(/\/services\/[^/]+$/);
  await page.getByRole('link', { name: 'Arrange this service', exact: true }).first().click();
  await expect(page).toHaveURL(/\/signin|\/book/);
  await page.goto('/signin');
  await expect(page.getByRole('heading', { name: 'Your properties. Your work. One place.' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/site/);
  await page.getByRole('link', { name: /ProInspect/ }).first().click();
  await expect(page).toHaveURL(`${origin}/`);
});

test('all public support routes, contact, sitemap and robots work on the deployed application', async ({ page, request }) => {
  for (const path of ['/contact', '/services/category/inspections', '/resources', '/why-proinspect', '/privacy']) {
    const r = await request.get(path);
    expect(r.status(), path).toBe(200);
    expect(await r.text(), path).toContain('rel="canonical"');
  }
  await page.goto('/contact?service=routine-inspection');
  await expect(page.getByRole('heading', { name: 'Tell us what the property needs.' })).toBeVisible();
  await expect(page.getByLabel('Service (optional)')).toHaveValue('routine-inspection');
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain('https://proinspect.systems/services/routine-inspection');
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Disallow: /'); // Local previews are not indexed.
});