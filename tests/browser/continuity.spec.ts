import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const origin = 'http://127.0.0.1:5173';
const staffApi = '/api/w/staff/operations';
const future = () => new Date(Date.now() + 180 * 86400000).toISOString();
const id = () => randomUUID().slice(0, 12);
async function post(c: BrowserContext, path: string, value: unknown = {}) {
  const response = await c.request.post(path, { headers: { Origin: origin }, data: value });
  const result = await response.json();
  expect(response.ok(), `${path}: ${JSON.stringify(result)}`).toBe(true);
  return result as any;
}
async function get(c: BrowserContext, path: string) {
  const response = await c.request.get(path);
  expect(response.ok(), path).toBe(true);
  return (await response.json()) as any;
}
async function person(browser: Browser, name: string, fixedEmail?: string) {
  const context = await browser.newContext({ baseURL: origin });
  const email = fixedEmail ?? `${name}-${id()}@proinspect.test`;
  const started = await post(context, '/api/auth/start', { email });
  const token = new URL(started.localSignInUrl).searchParams.get('token');
  await post(context, '/api/auth/complete', { email, token });
  return { context, email, page: await context.newPage() };
}
async function organisation(c: BrowserContext, kind: string, operator: BrowserContext) {
  const application = await post(c, '/api/organisation-applications', {
    kind,
    name: `Browser ${kind} ${id()}`,
    businessReference: 'Synthetic business review fixture',
  });
  const reviewed = await post(
    operator,
    `${staffApi}/organisation-applications/${application.id}/review`,
    {
      decision: 'approved',
      reference: 'Synthetic reviewed engagement',
    },
  );
  return {
    clientId: reviewed.clientId,
    api: `/api/w/${kind}/${reviewed.clientId}`,
    href: `/w/${kind}/${reviewed.clientId}`,
  };
}
async function visit(page: Page, href: string, title: string | RegExp) {
  const response = await page.goto(href);
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
}
async function saved(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' }).last()).toBeVisible();
}
function panel(page: Page, title: string) {
  return page
    .locator('section.panel')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

test('property directory search and pagination remain usable on mobile', async ({ browser }) => {
  const owner = await person(browser, 'paged-owner');
  try {
    const c = await post(owner.context, '/api/onboarding', {
      displayName: 'Directory owner',
      clientName: 'Self managed directory',
    });
    const base = `/api/w/landlord/${c.clientId}`,
      href = `/w/landlord/${c.clientId}`;
    for (let i = 0; i < 26; i++)
      await post(owner.context, base + '/properties', {
        address: `${String(i).padStart(2, '0')} ${id()} Page Street`,
        suburb: 'Test suburb',
        postcode: '6000',
        propertyType: 'House',
        selfManaged: true,
      });
    await visit(owner.page, href + '/properties', 'My properties');
    await expect(
      owner.page.getByText('26 matching properties in this workspace. Showing 24 on this page.'),
    ).toBeVisible();
    await owner.page.getByRole('link', { name: 'Next page', exact: true }).click();
    await expect(
      owner.page.getByText('26 matching properties in this workspace. Showing 2 on this page.'),
    ).toBeVisible();
    await owner.page.getByLabel('Search your properties').fill('does-not-exist');
    await owner.page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(owner.page.getByRole('heading', { name: 'No matching properties' })).toBeVisible();
    await owner.page.getByLabel('Search your properties').fill('Page Street');
    await owner.page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(
      owner.page.getByText('26 matching properties in this workspace. Showing 24 on this page.'),
    ).toBeVisible();
    await owner.page.setViewportSize({ width: 390, height: 844 });
    expect(
      await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
    ).toBe(true);
    mkdirSync('artifacts/screenshots', { recursive: true });
    await owner.page.screenshot({
      path: 'artifacts/screenshots/property-directory-mobile.png',
      fullPage: true,
    });
  } finally {
    await owner.context.close();
  }
});
test('strata notice revisions and withdrawal update the resident experience', async ({
  browser,
}) => {
  const manager = await person(browser, 'notice-manager'),
    resident = await person(browser, 'notice-resident'),
    operator = await person(browser, 'staff', 'staff@proinspect.test');
  try {
    const firm = await organisation(manager.context, 'strata-manager', operator.context);
    const name = 'Browser notice lifecycle ' + id();
    const s = await post(manager.context, firm.api + '/schemes', {
      name,
      schemeNumber: 'TEST-' + id(),
      address: id() + ' Notice Street',
      suburb: 'Test suburb',
      postcode: '6000',
      authorityReference: 'Synthetic signed agreement',
      validUntil: future(),
    });
    const invitation = await post(manager.context, firm.api + '/team/invite', {
      email: resident.email,
      role: 'resident',
      schemeId: s.id,
    });
    await post(resident.context, '/api/invitations/accept', {
      token: new URL(invitation.localInvitationUrl).searchParams.get('token'),
    });
    await visit(manager.page, `${firm.href}/schemes/${s.id}`, name);
    const publisher = panel(manager.page, 'Publish a targeted notice');
    await publisher.getByLabel('Notice title').fill('Water service interruption');
    await publisher
      .getByLabel('Message', { exact: true })
      .fill('The approved water work is scheduled for this building.');
    await publisher.getByLabel('Audience', { exact: true }).selectOption('residents');
    await publisher.getByRole('button', { name: 'Publish notice', exact: true }).click();
    await saved(manager.page);
    const residentHref = `/w/building/${s.id}`;
    await visit(resident.page, residentHref + `/schemes/${s.id}`, name);
    await expect(
      resident.page.getByRole('heading', { name: 'Water service interruption' }),
    ).toBeVisible();
    const article = manager.page
      .locator('article.notice')
      .filter({ has: manager.page.getByRole('heading', { name: 'Water service interruption' }) });
    await article.locator('summary').click();
    await article
      .getByLabel('Updated title', { exact: true })
      .fill('Revised water service interruption');
    await article
      .getByLabel('Reason for this revision')
      .fill('Works rescheduled by the approved contractor');
    await article.getByRole('button', { name: 'Save notice change' }).click();
    await expect(
      manager.page.getByRole('heading', { name: 'Revised water service interruption' }),
    ).toBeVisible();
    await resident.page.reload();
    await expect(
      resident.page.getByRole('heading', { name: 'Revised water service interruption' }),
    ).toBeVisible();
    await resident.page.screenshot({
      path: 'artifacts/screenshots/building-revised-notice.png',
      fullPage: true,
    });
    const revised = manager.page
      .locator('article.notice')
      .filter({
        has: manager.page.getByRole('heading', { name: 'Revised water service interruption' }),
      });
    await revised.getByLabel('Notice action').selectOption('withdraw');
    await revised.getByLabel('Reason for this revision').fill('Works have been cancelled');
    await revised.getByRole('button', { name: 'Save notice change' }).click();
    await expect(revised.getByText(/Withdrawn/)).toBeVisible();
    await resident.page.reload();
    await expect(
      resident.page.getByText('No current notices apply to your membership.'),
    ).toBeVisible();
    await visit(
      operator.page,
      '/w/staff/operations/finance/reconciliation',
      'Payment reconciliation',
    );
    await expect(operator.page.getByText('No payment exceptions')).toBeVisible();
  } finally {
    await manager.context.close();
    await resident.context.close();
    await operator.context.close();
  }
});
