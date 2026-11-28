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
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Property Solutions.');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Built Around You.');
  mkdirSync('artifacts/screenshots', { recursive: true });
  await page.screenshot({ path: 'artifacts/screenshots/marketing-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screenshots/marketing-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
});
test('new Landlord registration is free and can consider a subscription later', async ({ page }) => {
  const email = `landlord-${Date.now()}@proinspect.test`;
  await signIn(page, email, '/book/routine-inspection');
  await expect(page.getByRole('heading',{name:'Book using your ProInspect account'})).toBeVisible();
  await page.getByRole('link',{name:'Open My ProInspect'}).click();
  await expect(page).toHaveURL(/\/workspaces\?service=routine-inspection$/);
  await page.getByRole('link',{name:'Residential owner'}).click();
  await expect(page).toHaveURL(/\/onboarding\?flow=ONB-RES-OWNER&service=routine-inspection$/);
  await expect(page.getByRole('heading',{name:"Welcome. Let's set up your property."})).toBeVisible();
  await page.getByLabel('Your full name', { exact: true }).fill('Jordan Example');
  await page.getByText('Does a business or entity own the property?').click();
  await page.getByLabel('Owning entity / account name').fill('Example Self Managed');
  await page.getByRole('checkbox', { name: /I own and self-manage/ }).check();
  await page.getByRole('button', { name: 'Continue to add your property' }).click();
  await expect(page).toHaveURL(/\/properties\?service=routine-inspection$/);
  const base = new URL(page.url()).pathname.replace(/\/properties$/, '');
  await page.getByLabel('Street address, including unit number')
    .fill(`${Math.floor(Date.now() / 1000)} Example Street`);
  await page.getByLabel('Suburb', { exact: true }).fill('Perth');
  await page.getByLabel('WA postcode').fill('6000');
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.getByRole('heading',{name:'Tell us about the property'})).toBeVisible();
  await page.getByRole('button', {name:'Add Bedrooms'}).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.getByRole('heading',{name:'Is the property currently tenanted?'})).toBeVisible();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('checkbox', {name:/I confirm I own and self-manage/}).check();
  await page.getByRole('button', { name: 'Add property', exact: true }).click();
  await expect(page).toHaveURL(/\/book\/routine-inspection\?property=/);
  await expect(page.getByRole('button', { name: /Book an inspection/ })).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button', { name: /Open Homes & leasing/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Keys & access control/ })).toBeVisible();
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

test('a retired booking link cannot open account setup or issue a paid entitlement', async ({page}) => {
  const email = `closed-${Date.now()}@proinspect.test`;
  await signIn(page,email,'/workspaces');
  await expect(page.getByRole('link',{name:'Residential owner',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Commercial owner',exact:true})).toHaveCount(0);
  const denied=await page.goto('/book/commercial-property-inspection');
  expect(denied?.status()).toBe(410);
  const account=await (await page.request.get('/api/session')).json();
  expect(account.workspaces).toEqual([]);
});
