import { expect, test } from '@playwright/test';

test('premium public homepage shows key sections and destinations without impacting authentication', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Real property work.');
  await expect(page.getByRole('heading', { name: 'What can we help you with?' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Explore inspections/i })).toHaveCount(0);
  await expect(page.locator('.mkt-family-card')).toHaveCount(6);
  await expect(page.locator('.mkt-sector-card')).toHaveCount(3);
  await expect(page.locator('.mkt-featured-card')).toHaveCount(6);
  await expect(page.locator('.mkt-engagement-card')).toHaveCount(4);
  await expect(page.getByText('Illustrative report design.')).toBeVisible();
  await page.getByRole('link', { name: /Routine Inspection/i }).first().click();
  await expect(page).toHaveURL(/\/services\/routine-inspection$/);
  await expect(page.getByRole('heading', { name: 'What is a Routine Inspection?' })).toBeVisible();
  await expect(page.getByText('ILLUSTRATIVE EXAMPLE')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Arrange this service' }).first()).toHaveAttribute('href', '/book/routine-inspection');
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
