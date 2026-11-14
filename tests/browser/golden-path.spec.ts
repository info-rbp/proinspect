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
  const response = await request.get('http://127.0.0.1:5173/services/routine-inspection');
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('Routine Inspection');
  expect(html).toContain('What is a Routine Inspection?');
  expect(html).toContain('rel="canonical"');
  expect(html).not.toContain('<title>Service not found');
  await page.goto('http://127.0.0.1:5173');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Property work, taken care of');
  mkdirSync('artifacts/screenshots', { recursive: true });
  await page.screenshot({ path: 'artifacts/screenshots/marketing-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screenshots/marketing-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
});
test('new Landlord registration is free and can consider a subscription later', async ({ page }) => {
  const email = `landlord-${Date.now()}@proinspect.test`;
  await signIn(page, email, '/book/subscriber/routine-inspection');
  await page.getByRole('link', { name: 'Set up account', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Jordan Example');
  await page.getByLabel('Account name', { exact: true }).fill('Example Self Managed');
  await page.getByRole('checkbox', { name: /I own and self-manage/ }).check();
  await page.getByRole('button', { name: 'Create Landlord account' }).click();
  await expect(page).toHaveURL(/\/properties\?service=routine-inspection$/);
  const base = new URL(page.url()).pathname.replace(/\/properties$/, '');
  await page.getByLabel('Street address, including unit if applicable')
    .fill(`${Math.floor(Date.now() / 1000)} Example Street`);
  await page.getByLabel('Suburb', { exact: true }).fill('Perth');
  await page.getByLabel('WA postcode').fill('6000');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Add property', exact: true }).click();
  await expect(page).toHaveURL(/\/book\/routine-inspection\?property=/);
  await expect(page.getByLabel('Service', { exact: true })).toHaveValue('routine-inspection');
  await expect(page.getByText('Included in your active ProInspect subscription.', { exact: false })).toHaveCount(0);
  // Routine inspections can also be purchased as priced one-off services.
  // A free account must not be represented as having subscription coverage.
  await expect(page.getByText('Service price', { exact: true })).toBeVisible();
  await expect(page.getByText('Included — no additional charge', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirm booking' })).toBeDisabled();
  await page.goto('/account');
  await expect(page.getByRole('heading',{name:'Properties and subscriptions'})).toBeVisible();
  await expect(page.getByText('Free account — no paid subscription', {exact:false})).toBeVisible();
  await expect(page.getByRole('link',{name:'Subscription information'})).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots/landlord-free-account.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
});

test('commercial Landlord signup is free and does not grant included inspection services', async ({ page }) => {
  const email = `commercial-owner-${Date.now()}@proinspect.test`;
  await signIn(page, email, '/book/subscriber/commercial-property-inspection');
  await page.getByRole('link', { name: 'Set up account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Start with the essentials.' })).toBeVisible();
  await page.getByLabel('Landlord type', { exact: true }).selectOption('commercial');
  await page.getByLabel('Your name', { exact: true }).fill('Commercial Test Owner');
  await page.getByLabel('Account name', { exact: true }).fill('Synthetic Commercial Ownership');
  await page.getByRole('checkbox', { name: /I own and self-manage/ }).check();
  await page.getByRole('button', { name: 'Create Landlord account' }).click();
  await expect(page).toHaveURL(/\/w\/commercial\/cli_[a-z0-9]+\/properties\?service=commercial-property-inspection$/);
  const base = new URL(page.url()).pathname.replace(/\/properties$/, '');
  const session = await page.request.get('/api/session');
  expect(session.ok()).toBe(true);
  const workspaces = (await session.json()).workspaces;
  expect(workspaces.map((w: any) => w.kind)).toContain('commercial');
  expect(workspaces.map((w: any) => w.kind)).not.toContain('staff');
  await page.goto(base + '/portfolio');
  await expect(page.getByText('Self-managed commercial ownership')).toBeVisible();
  await expect(page.getByText('Add a managed property', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Import a portfolio', { exact: true })).toHaveCount(0);
  await page.goto(base + '/properties?service=commercial-property-inspection');
  await expect(page.getByText('Add a property', { exact: true })).toBeVisible();
  await page.getByLabel('Street address, including unit if applicable').fill(`${Math.floor(Date.now() / 1000)} Synthetic Office Road`);
  await page.getByLabel('Suburb', { exact: true }).fill('Perth');
  await page.getByLabel('WA postcode').fill('6000');
  await page.getByLabel('Property type', { exact: true }).selectOption('Office');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Add property', exact: true }).click();
  await expect(page).toHaveURL(/\/w\/commercial\/cli_[a-z0-9]+\/book\/commercial-property-inspection\?property=/);
  await expect(page.getByLabel('Service', { exact: true })).toHaveValue('commercial-property-inspection');
  await expect(page.getByText('Included in your active ProInspect subscription.', { exact: false })).toHaveCount(0);
  await expect(page.getByText('This service requires a scope or price confirmation.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm booking' })).toBeDisabled();
  await page.goto('/account');
  await expect(page.getByText('Free account — no paid subscription', { exact: false })).toBeVisible();
});
