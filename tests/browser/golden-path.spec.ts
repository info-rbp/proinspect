import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

async function signIn(page: Page, email: string, returnTo = '/workspaces') {
  await page.goto(`/signin?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Email sign-in link', exact: true }).click();
  await page.getByRole('link', { name: 'Continue with local sign-in' }).click();
  // The email field exists on both routes. Wait for the destination, not a stale field.
  await expect(page.getByRole('heading', { name: 'Confirm it is you.' })).toBeVisible();
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Confirm sign-in', exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:5173${returnTo}`);
}
function futureDate() {
  const date = new Date(Date.now() + 5 * 86400000);
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
test('marketing is server rendered and responsive', async ({ page, request }) => {
  const response = await request.get('http://127.0.0.1:5174/services/routine-inspection');
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('Routine Inspection');
  expect(html).toContain('Clear work. A useful record.');
  expect(html).toContain('rel="canonical"');
  expect(html).not.toContain('<title>Service not found');
  await page.goto('http://127.0.0.1:5174');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('The work gets done.');
  mkdirSync('artifacts/screenshots', { recursive: true });
  await page.screenshot({ path: 'artifacts/screenshots/marketing-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screenshots/marketing-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
});
test('service intent survives signup, booking, staff completion and report delivery', async ({ page, browser }) => {
  const email = `landlord-${Date.now()}@proinspect.test`;
  await signIn(page, email, '/book/routine-inspection');
  await page.getByRole('link', { name: 'Set up account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Start with the essentials.' })).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill('Jordan Example');
  await page.getByLabel('Account name', { exact: true }).fill('Example Self Managed');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create Landlord account' }).click();
  await expect(page).toHaveURL(/\/properties\?service=routine-inspection$/);
  const base = new URL(page.url()).pathname.replace(/\/properties$/, '');
  await page.getByLabel('Street address, including unit if applicable').fill(`${Math.floor(Date.now() / 1000)} Example Street`);
  await page.getByLabel('Suburb', { exact: true }).fill('Perth');
  await page.getByLabel('WA postcode').fill('6000');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Add property', exact: true }).click();
  await expect(page).toHaveURL(/\/book\/routine-inspection\?property=/);
  await expect(page.getByLabel('Service', { exact: true })).toHaveValue('routine-inspection');
  await page.getByLabel('Preferred date', { exact: true }).fill(futureDate());
  await expect(page.getByRole('radio').first()).toBeVisible();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Confirm booking', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your service is booked.' })).toBeVisible();
  await page.goto(base);
  await page.screenshot({ path: 'artifacts/screenshots/landlord-desktop.png', fullPage: true });
  const staffContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5173' });
  const staff = await staffContext.newPage();
  await signIn(staff, 'staff@proinspect.test');
  await staff.getByRole('link', { name: /ProInspect operations/ }).click();
  await staff.getByRole('link', { name: 'Work orders', exact: true }).click();
  const order = staff.locator('article.panel').first();
  await order.locator('summary').click();
  await order.getByLabel('Status', { exact: true }).selectOption('in_progress');
  await order.getByRole('button', { name: 'Save work order' }).click();
  await expect(staff.getByRole('status')).toContainText('Work order updated');
  if (!(await order.getByLabel('Final PDF report', { exact: true }).isVisible())) await order.locator('summary').click();
  await order.getByLabel('Report title', { exact: true }).fill('Routine inspection - acceptance report');
  await order.getByLabel('Final PDF report', { exact: true }).setInputFiles({
    name: 'report.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'),
  });
  await order.getByRole('button', { name: 'Upload and issue report' }).click();
  await expect(staff.getByRole('status')).toContainText('Report issued');
  if (!(await order.getByLabel('Status', { exact: true }).isVisible())) await order.locator('summary').click();
  await order.getByLabel('Status', { exact: true }).selectOption('completed');
  await order.getByRole('button', { name: 'Save work order' }).click();
  await expect(staff.getByRole('status')).toContainText('Work order updated');
  await staff.screenshot({ path: 'artifacts/screenshots/staff-work-orders.png', fullPage: true });
  await page.goto(base + '/documents');
  await expect(page.getByRole('heading', { name: 'Routine inspection - acceptance report' })).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download PDF', exact: true }).first().click();
  expect((await downloaded).suggestedFilename()).toMatch(/ProInspect-/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screenshots/landlord-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
  await staffContext.close();
});
