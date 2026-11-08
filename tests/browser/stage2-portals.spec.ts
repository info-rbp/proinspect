import { test, expect, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const origin = 'http://127.0.0.1:5173';
async function signIn(context: BrowserContext, email: string) {
  const first = await context.request.post('/api/auth/start', { headers: { Origin: origin }, data: { email } });
  expect(first.ok()).toBe(true);
  const token = new URL((await first.json()).localSignInUrl).searchParams.get('token');
  const completed = await context.request.post('/api/auth/complete', { headers: { Origin: origin }, data: { email, token } });
  expect(completed.ok()).toBe(true);
}
test('Staff Today prioritises work and keeps specialist routes searchable', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin, viewport: {width: 1280, height: 800} });
  try {
    await signIn(context, 'review-staff@proinspect.test');
    const page = await context.newPage();
    const result = await page.goto('/w/staff/operations');
    expect(result?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: "Today's work", level: 1 })).toBeVisible();
    for (const label of ['Bookings due', 'Reports to review', 'Open work', 'Exceptions'])
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    const nav = page.getByRole('complementary', { name: 'Workspace navigation' });
    for (const label of ['Today', 'Schedule', 'Work Orders', 'Reports', 'Clients & properties', 'Finance'])
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
    expect(await nav.getByRole('link').count()).toBeLessThan(15);
    await nav.locator('.side-nav-more summary').click();
    await expect(nav.getByText('Operations', { exact: true })).toBeVisible();
    await nav.getByRole('searchbox', { name: 'Find a tool' }).fill('Browse all records');
    await expect(nav.getByRole('link', { name: 'Browse all records' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Booking changes' })).toHaveCount(0);
    await page.setViewportSize({width: 390, height: 844});
    await expect(page.getByRole('button', {name: 'Open navigation'})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  } finally { await context.close(); }
});

test('new free Landlord retains a distinct, compact portal without Staff privileges', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin, viewport: {width: 390, height: 844} });
  try {
    await signIn(context, 'stage2-'+randomUUID()+'@proinspect.test');
    const create = await context.request.post('/api/onboarding', { headers: { Origin: origin }, data: {
      displayName: 'Portal Test Owner', clientName: 'Portal Test Residential'
    } });
    expect(create.ok()).toBe(true);
    const {clientId} = await create.json();
    const page = await context.newPage();
    const result = await page.goto('/w/landlord/'+clientId);
    expect(result?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Property overview', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const nav = page.getByRole('complementary', { name: 'Workspace navigation' });
    await expect(nav.getByRole('link', { name: 'My properties' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Work Orders', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Release acceptance' })).toHaveCount(0);
    await nav.locator('.side-nav-more summary').click();
    await expect(nav.getByRole('link', { name: 'Browse all records' })).toBeVisible();
    await nav.getByRole('button', { name: 'Close menu' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  } finally { await context.close(); }
});
