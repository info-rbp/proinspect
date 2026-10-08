import { test, expect, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
const origin = 'http://127.0.0.1:5173';
async function post(c: BrowserContext, path: string, data: unknown = {}) {
  const r = await c.request.post(path, { headers: { Origin: origin }, data });
  const v = await r.json();
  expect(r.ok(), JSON.stringify(v)).toBe(true);
  return v as any;
}
async function login(c: BrowserContext, email: string) {
  const s = await post(c, '/api/auth/start', { email });
  await post(c, '/api/auth/complete', {
    email,
    token: new URL(s.localSignInUrl).searchParams.get('token'),
  });
}
function date() {
  const d = new Date(Date.now() + 12 * 86400000);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
test('marketing category, engagement and guide routes render with mobile navigation', async ({
  page,
  request,
}) => {
  const paths = [
    '/services/category/inspections',
    '/services/category/documents',
    '/how-we-work/pay-as-you-go',
    '/how-we-work/inspection-plans',
    '/how-we-work/standard-support',
    '/how-we-work/outsourced-operations',
    '/resources',
    '/resources/routine-inspection-vs-pcr',
    '/resources/pre-vacate-vs-final',
    '/resources/verify-completed-works',
    '/why-proinspect',
    '/areas-we-service',
  ];
  for (const path of paths) {
    const r = await request.get('http://127.0.0.1:5174' + path);
    expect(r.status(), path).toBe(200);
    expect(await r.text()).toContain('rel="canonical"');
  }
  expect((await request.get('http://127.0.0.1:5174/resources/not-a-guide')).status()).toBe(404);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5174/resources');
  await page.locator('.marketing-menu summary').click();
  await expect(
    page
      .getByRole('navigation', { name: 'Mobile site navigation' })
      .getByRole('link', { name: 'Contact', exact: true }),
  ).toBeVisible();
  await page.locator('.marketing-menu summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
    true,
  );
  mkdirSync('artifacts/screenshots', { recursive: true });
  await page.screenshot({
    path: 'artifacts/screenshots/marketing-resources-mobile.png',
    fullPage: true,
  });
});
test('professional booking creates a job and scoped full record browsing opens it', async ({
  browser,
}) => {
  const agency = await browser.newContext({ baseURL: origin }),
    staff = await browser.newContext({ baseURL: origin });
  try {
    await login(agency, `review-pm-${randomUUID()}@proinspect.test`);
    await login(staff, 'review-staff@proinspect.test');
    const a = await post(agency, '/api/organisation-applications', {
        kind: 'property-manager',
        name: 'Review agency ' + randomUUID().slice(0, 6),
        businessReference: 'Synthetic signed engagement',
      }),
      c = await post(staff, `/api/w/staff/operations/organisation-applications/${a.id}/review`, {
        decision: 'approved',
        reference: 'Synthetic reviewed acceptance',
      }),
      href = `/w/property-manager/${c.clientId}`,
      api = '/api' + href;
    const property = await post(agency, api + '/properties', {
        address: randomUUID().slice(0, 8) + ' Review Street',
        suburb: 'Perth',
        postcode: '6000',
        ownerName: 'Synthetic Owner',
        authorityReference: 'Synthetic management instruction',
      }),
      page = await agency.newPage();
    await page.goto(href + `/book/routine-inspection?property=${property.propertyId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Arrange your next property visit.',
    );
    await page.getByLabel('Preferred date', { exact: true }).fill(date());
    await expect(page.getByRole('radio').first()).toBeVisible();
    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: 'Confirm booking', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your service is booked.' })).toBeVisible();
    await page.goto(href + '/records/bookings');
    await expect(page.getByRole('status')).toHaveText('1 matching authorised records.');
    await page.getByRole('link', { name: 'Open record' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Change a booking');
    await page.goto(href + '/reporting');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Operational reporting');
    await page.screenshot({
      path: 'artifacts/screenshots/property-manager-reporting.png',
      fullPage: true,
    });
  } finally {
    await agency.close();
    await staff.close();
  }
});
test('account preferences persist and other-session revocation preserves current browser', async ({
  browser,
}) => {
  const c = await browser.newContext({ baseURL: origin }),
    second = await browser.newContext({ baseURL: origin });
  try {
    const email = `review-account-${randomUUID()}@proinspect.test`;
    await login(c, email);
    await login(second, email);
    const page = await c.newPage();
    await page.goto('/account');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your account');
    await page.getByLabel('Display name', { exact: true }).fill('Reviewed Account');
    await page
      .getByRole('checkbox', { name: 'Email me when an inspection report is issued.' })
      .uncheck();
    await page.getByRole('button', { name: 'Save account preferences' }).click();
    await expect(page.getByRole('status')).toContainText('account preferences have been saved');
    await page.reload();
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Reviewed Account');
    await expect(
      page.getByRole('checkbox', { name: 'Email me when an inspection report is issued.' }),
    ).not.toBeChecked();
    await page.getByRole('button', { name: 'Sign out other sessions' }).click();
    await expect(page.getByRole('status')).toContainText('Other sessions');
    expect((await second.request.get('/api/account')).status()).toBe(401);
    expect((await c.request.get('/api/account')).status()).toBe(200);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
      true,
    );
    await page.screenshot({
      path: 'artifacts/screenshots/account-security-mobile.png',
      fullPage: true,
    });
  } finally {
    await c.close();
    await second.close();
  }
});
