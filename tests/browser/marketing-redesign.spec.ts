import { expect, test } from '@playwright/test';

test('focused homepage communicates Option A positioning and the real customer journeys', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Property work, taken care of');
  await expect(page.getByRole('heading', { name: 'What do you need taken care of?' })).toBeVisible();
  await expect(page.locator('.pi-service-card')).toHaveCount(4);
  await expect(page.locator('.pi-sector-card')).toHaveCount(3);
  await expect(page.locator('.pi-steps li')).toHaveCount(3);
  await expect(page.locator('.pi-arrangements article')).toHaveCount(2);
  await expect(page.locator('.mkt-featured-card')).toHaveCount(0);
  await expect(page.getByText(/Illustrative report layout, not an actual issued report/)).toBeVisible();
  await expect(page.locator('.pi-actions').getByRole('link', { name: /Arrange a service/ })).toHaveAttribute('href','/book');
  await expect(page.locator('.pi-actions').getByRole('link', { name: 'Explore services' })).toHaveAttribute('href','/services');
  await page.locator('.pi-service-card').first().getByRole('link').click();
  await expect(page).toHaveURL(/\/services\/category\/inspections$/);
  await expect(page.locator('.mkt-catalogue-card').first()).toBeVisible();
});

test('home service discovery and distinct one-off/ongoing conversion paths are preserved', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Find the right service/ })).toHaveAttribute('href','/service-finder');
  await expect(page.getByRole('link', { name: /Arrange a one-off service/ })).toHaveAttribute('href','/book');
  await expect(page.getByRole('link', { name: /Discuss ongoing support/ })).toHaveAttribute('href','/contact');
  await expect(page.getByRole('link', { name: /Create a free account or sign in/ })).toHaveAttribute('href','/signin');
  await expect(page.locator('[data-pi-conversion="home-arrange"]')).toHaveCount(1);
  await expect(page.locator('[data-pi-conversion="home-finder"]')).toHaveCount(1);
  await expect(page.locator('.pi-hero-picture .mkt-art-illustration-note')).toBeVisible();
});

test('marketing homepage and service page remain usable at mobile widths', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: 'http://127.0.0.1:5173' });
  try {
    const page = await context.newPage();
    for (const route of ['/', '/services/routine-inspection']) {
      await page.goto(route);
      await expect(page.locator('body')).toHaveClass(/site/);
      await expect(page.locator('.marketing-menu summary')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Book a service' }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
    }
    await page.locator('.marketing-menu summary').click();
    await expect(page.getByRole('navigation', { name: 'Mobile site navigation' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Mobile site navigation' }).getByRole('link', { name: 'Services', exact: true }).click();
    await expect(page).toHaveURL(/\/services$/);
  } finally {
    await context.close();
  }
});
