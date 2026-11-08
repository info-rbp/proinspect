import { expect, test } from '@playwright/test';

test('PCR promotional landing and sample routes are removed', async ({ page, request }) => {
  for (const path of ['/offers/pcr-100', '/offers/pcr/sample']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
  await page.goto('/');
  await expect(page.locator('nav[aria-label="Primary navigation"]')).not.toContainText('$100 PCR');
  await expect(page.locator('nav[aria-label="Mobile site navigation"]')).not.toContainText('$100 PCR offer');
});

test('normal PCR catalogue page and general booking are preserved', async ({ page }) => {
  await page.goto('/services/property-condition-report');
  await expect(page.getByRole('heading', { name: /Property Condition Report/i }).first()).toBeVisible();
  await page.goto('/book/property-condition-report');
  await expect(page.getByRole('heading', { name: 'How would you like to book?' })).toBeVisible();
});
