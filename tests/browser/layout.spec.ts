import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('long workspace names retain usable mobile navigation and keyboard skip access', async ({
  browser,
}) => {
  const origin = 'http://127.0.0.1:5173';
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  try {
    const email = `layout-${randomUUID()}@proinspect.test`;
    const post = async (path: string, data: unknown) => {
      const response = await context.request.post(path, { headers: { Origin: origin }, data });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    const start = await post('/api/auth/start', { email });
    const token = new URL(start.localSignInUrl).searchParams.get('token');
    await post('/api/auth/complete', { email, token });
    const client = await post('/api/onboarding', {
      displayName: 'Mobile Layout Test',
      clientName: 'A deliberately long residential property account name for mobile review',
    });
    const page = await context.newPage();
    const response = await page.goto(`/w/landlord/${client.clientId}`);
    expect(response?.ok()).toBe(true);
    const header = page.getByRole('banner');
    const toggle = page.getByRole('button', { name: 'Open navigation', exact: true });
    await expect(toggle).toBeVisible();
    const bounds = await header.boundingBox();
    const button = await toggle.boundingBox();
    const title = await header.locator('.topbar-context').boundingBox();
    expect(bounds).not.toBeNull();
    expect(button).not.toBeNull();
    expect(title).not.toBeNull();
    expect(button!.y).toBeGreaterThanOrEqual(bounds!.y);
    expect(title!.y + title!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
      true,
    );
    await toggle.click();
    await expect(page.getByRole('complementary', { name: 'Workspace navigation' })).toBeVisible();
    await page.getByRole('button', { name: 'Close menu', exact: true }).click();
    await page.getByRole('link', { name: 'Skip to content', exact: true }).focus();
    await expect(page.getByRole('link', { name: 'Skip to content', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  } finally {
    await context.close();
  }
});
