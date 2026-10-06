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

test('tenant evidence, reviewed PCR and cost approval connect to the self-managing landlord', async ({
  browser,
}) => {
  const owner = await person(browser, 'owner'),
    tenant = await person(browser, 'tenant');
  const operator = await person(browser, 'staff', 'staff@proinspect.test');
  try {
    const client = await post(owner.context, '/api/onboarding', {
      displayName: 'Browser Landlord',
      clientName: 'Browser Self Managed',
    });
    const base = `/api/w/landlord/${client.clientId}`,
      href = `/w/landlord/${client.clientId}`;
    const address = `${id()} Browser Street`;
    const p = await post(owner.context, `${base}/properties`, {
      address,
      suburb: 'Perth',
      postcode: '6000',
      propertyType: 'House',
      selfManaged: true,
    });
    const t = await post(owner.context, `${base}/tenancies`, {
      propertyId: p.propertyId,
      email: `initial-${id()}@proinspect.test`,
      startsAt: new Date(Date.now() - 86400000).toISOString(),
    });
    const invitation = await post(owner.context, `${base}/tenancies/${t.id}/invite`, {
      email: tenant.email,
    });
    await post(tenant.context, '/api/invitations/accept', {
      token: new URL(invitation.localInvitationUrl).searchParams.get('token'),
    });
    const tenantApi = `/api/w/tenant/${t.id}`,
      tenantHref = `/w/tenant/${t.id}`;
    await visit(owner.page, href + '/document-operations', 'Document preparation and issue');
    const upload = panel(owner.page, 'Upload document for review');
    await upload.getByLabel('Document title', { exact: true }).fill('Browser reviewed PCR');
    await upload.getByLabel('Document category').selectOption('property_condition_report');
    await upload.getByLabel(/Property context/).selectOption(p.propertyId);
    await upload
      .getByLabel(/Reviewed PDF/)
      .setInputFiles({
        name: 'reviewed.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\nSynthetic browser review fixture\n%%EOF'),
      });
    await upload.getByRole('button', { name: 'Upload for review' }).click();
    await saved(owner.page);
    const release = owner.page
      .locator('details')
      .filter({ hasText: 'Browser reviewed PCR - Version' });
    await release.locator('summary').click();
    await release.getByLabel('Audience type').selectOption('tenancy');
    await release.getByLabel('Specific account, tenancy or scheme').selectOption(t.id);
    await release.getByLabel('Review / release reference').fill('Browser explicit release review');
    await release.getByRole('button', { name: 'Issue to selected audience' }).click();
    await expect(release.locator('summary')).toContainText('issued');
    await visit(tenant.page, `${tenantHref}/tenancies/${t.id}`, address);
    await tenant.page
      .getByLabel('Issued property condition report')
      .selectOption({ label: 'Browser reviewed PCR' });
    await tenant.page.getByLabel('Your response', { exact: true }).selectOption('false');
    await tenant.page
      .getByLabel('Response / itemised comments')
      .fill('The wall mark was present before this tenancy began.');
    await tenant.page.getByRole('button', { name: 'Submit PCR response' }).click();
    await saved(tenant.page);
    await visit(owner.page, `${href}/tenancies/${t.id}`, address);
    await expect(
      owner.page.getByText('The wall mark was present before this tenancy began.'),
    ).toBeVisible();
    await owner.page.getByRole('button', { name: 'Acknowledge response' }).click();
    await saved(owner.page);
    const request = await post(tenant.context, tenantApi + '/requests', {
      title: 'Browser fan repair',
      details: 'The bathroom fan no longer operates.',
      category: 'maintenance',
      priority: 'routine',
    });
    await visit(tenant.page, `${tenantHref}/requests/${request.id}`, 'Browser fan repair');
    await tenant.page
      .getByLabel('Update', { exact: true })
      .fill('The issue occurs every time the switch is used.');
    await tenant.page.getByRole('button', { name: 'Add update' }).click();
    await saved(tenant.page);
    await tenant.page
      .getByLabel(/PDF, JPEG or PNG/)
      .setInputFiles({
        name: 'evidence.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\nSynthetic request evidence\n%%EOF'),
      });
    await tenant.page.getByRole('button', { name: 'Upload evidence' }).click();
    await expect(tenant.page.locator('.badge').filter({ hasText: /quarantined/i })).toBeVisible();
    const order = await post(operator.context, `${staffApi}/requests/${request.id}/convert`);
    const record = (await get(operator.context, staffApi)).workOrders.find(
      (x: any) => x.id === order.id,
    );
    await post(operator.context, `${staffApi}/work-orders/${order.id}/proposals`, {
      version: record.version,
      summary: 'Browser fan replacement approval',
      amountCents: 66000,
      reference: 'Synthetic contractor quote',
      requestKey: randomUUID(),
    });
    await visit(owner.page, href + '/finance', 'Approvals and payments');
    const approval = panel(owner.page, 'Browser fan replacement approval');
    await approval.getByLabel('Decision', { exact: true }).selectOption('approved');
    await approval.getByRole('button', { name: 'Record decision', exact: true }).click();
    await expect(approval.locator('.badge')).toHaveText(/approved/i);
    mkdirSync('artifacts/screenshots', { recursive: true });
    await owner.page.screenshot({
      path: 'artifacts/screenshots/landlord-approval.png',
      fullPage: true,
    });
    await tenant.page.setViewportSize({ width: 390, height: 844 });
    await tenant.page.screenshot({
      path: 'artifacts/screenshots/tenant-request-mobile.png',
      fullPage: true,
    });
    expect(
      await tenant.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
    ).toBe(true);
  } finally {
    await owner.context.close();
    await tenant.context.close();
    await operator.context.close();
  }
});

test('professional portfolio import, recurring plan and commercial workspace are usable', async ({
  browser,
}) => {
  const agency = await person(browser, 'agency'),
    operator = await person(browser, 'staff', 'staff@proinspect.test');
  const commercial = await person(browser, 'commercial');
  try {
    const pm = await organisation(agency.context, 'property-manager', operator.context);
    await visit(agency.page, pm.href + '/portfolio', 'Portfolio operations');
    const importPanel = panel(agency.page, 'Import a portfolio'),
      street = `${id()} Portfolio Street`;
    await importPanel
      .getByLabel('CSV content')
      .fill(`address,suburb,postcode,ownerName\n${street},Perth,6000,Browser Owner`);
    await importPanel
      .getByLabel('Portfolio authority reference')
      .fill('Browser signed management reference');
    await importPanel.getByRole('button', { name: 'Preview import' }).click();
    await expect(importPanel.getByText('1 properties passed validation.')).toBeVisible();
    await importPanel.getByRole('button', { name: 'Apply reviewed import' }).click();
    await expect(agency.page.getByRole('link', { name: street, exact: true })).toBeVisible();
    const portfolio = await get(agency.context, pm.api),
      planPanel = panel(agency.page, 'Recurring inspection plans');
    await planPanel
      .getByLabel('Property', { exact: true })
      .selectOption(portfolio.properties[0].id);
    await planPanel.getByLabel('Service', { exact: true }).selectOption('routine-inspection');
    await planPanel
      .getByLabel('Next due date')
      .fill(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    await planPanel.getByRole('button', { name: 'Create inspection plan' }).click();
    await expect(planPanel.getByRole('button', { name: 'Pause plan' })).toBeVisible();
    await planPanel.getByRole('button', { name: 'Pause plan' }).click();
    await expect(planPanel.getByRole('button', { name: 'Resume plan' })).toBeVisible();
    await agency.page.screenshot({
      path: 'artifacts/screenshots/property-manager-portfolio.png',
      fullPage: true,
    });
    await visit(agency.page, pm.href + '/team', 'Team and portfolio access');
    await expect(agency.page.getByText('Browser Owner', { exact: false })).toBeVisible();
    const commercialWorkspace = await organisation(
      commercial.context,
      'commercial',
      operator.context,
    );
    await visit(commercial.page, commercialWorkspace.href + '/portfolio', 'Portfolio operations');
    await expect(
      commercial.page.getByText('Commercial Property Portal', { exact: true }),
    ).toBeVisible();
    const response = await commercial.context.request.get(
      `/api/w/landlord/${commercialWorkspace.clientId}`,
    );
    expect(response.status()).toBe(403);
  } finally {
    await agency.context.close();
    await operator.context.close();
    await commercial.context.close();
  }
});

test('resident report reaches strata operations and council sees only its decision workflow', async ({
  browser,
}) => {
  const manager = await person(browser, 'strata'),
    resident = await person(browser, 'resident');
  const council = await person(browser, 'council'),
    operator = await person(browser, 'staff', 'staff@proinspect.test');
  try {
    const firm = await organisation(manager.context, 'strata-manager', operator.context);
    await visit(manager.page, firm.href + '/schemes', 'Schemes and buildings');
    const setup = panel(manager.page, 'Set up a managed scheme'),
      name = `Browser Apartments ${id()}`;
    await setup.getByLabel('Scheme name').fill(name);
    await setup.getByLabel('Scheme number').fill(`SP-BROWSER-${id()}`);
    await setup.getByLabel('Primary building address').fill(`${id()} Building Street`);
    await setup.getByLabel('Suburb', { exact: true }).fill('Perth');
    await setup.getByLabel('Postcode', { exact: true }).fill('6000');
    await setup.getByLabel('Management authority reference').fill('Browser scheme contract');
    await setup.getByLabel('Management authority expires').fill(future().slice(0, 16));
    await setup.getByRole('button', { name: 'Create scheme' }).click();
    await expect(manager.page.getByRole('heading', { level: 1 })).toHaveText(name);
    const schemeId = new URL(manager.page.url()).pathname.split('/').pop()!;
    for (const [who, role] of [
      [resident, 'resident'],
      [council, 'council_member'],
    ] as const) {
      const invitation = await post(manager.context, firm.api + '/team/invite', {
        email: who.email,
        role,
        schemeId,
        ...(role === 'council_member' ? { endsAt: future() } : {}),
      });
      await post(who.context, '/api/invitations/accept', {
        token: new URL(invitation.localInvitationUrl).searchParams.get('token'),
      });
    }
    const notice = panel(manager.page, 'Publish a targeted notice');
    await notice.getByLabel('Notice title').fill('Browser council-only briefing');
    await notice
      .getByLabel('Message', { exact: true })
      .fill('A private council briefing about operational proposals.');
    await notice.getByLabel('Audience', { exact: true }).selectOption('council');
    await notice.getByRole('button', { name: 'Publish notice' }).click();
    await saved(manager.page);
    const residentHref = `/w/building/${schemeId}`,
      councilHref = `/w/council/${schemeId}`;
    await visit(resident.page, `${residentHref}/schemes/${schemeId}`, name);
    await expect(resident.page.getByText('Browser council-only briefing')).toHaveCount(0);
    await resident.page.getByLabel('Where is the issue?').selectOption('common');
    await resident.page.getByLabel('Issue summary').fill('Browser basement leak');
    await resident.page
      .getByLabel('What happened?')
      .fill('Water is collecting beside the basement door.');
    await resident.page.getByLabel('Request type').selectOption('maintenance');
    await resident.page.getByLabel('Urgency').selectOption('urgent');
    await resident.page.getByRole('button', { name: 'Submit issue' }).click();
    await saved(resident.page);
    const requests = (await get(manager.context, firm.api)).requests;
    const request = requests.find((x: any) => x.title === 'Browser basement leak');
    expect(request).toBeTruthy();
    await visit(manager.page, `${firm.href}/requests/${request.id}`, 'Browser basement leak');
    await manager.page.getByRole('button', { name: 'Request operational attendance' }).click();
    await saved(manager.page);
    const order = (await get(manager.context, firm.api)).workOrders.find(
      (x: any) => x.request_id === request.id,
    );
    await post(manager.context, `${firm.api}/work-orders/${order.id}/proposals`, {
      version: order.version,
      summary: 'Browser drainage proposal',
      amountCents: 750000,
      reference: 'Browser works quote',
      requestKey: randomUUID(),
    });
    await visit(council.page, councilHref + '/finance', 'Decisions and oversight');
    const proposal = panel(council.page, 'Browser drainage proposal');
    await proposal.getByLabel('Recommendation', { exact: true }).selectOption('support');
    await proposal.getByRole('button', { name: 'Record recommendation' }).click();
    await saved(council.page);
    await expect(proposal.locator('.badge')).toHaveText(/pending/i);
    await expect(
      council.page.getByRole('button', { name: /Record authorised council outcome/ }),
    ).toHaveCount(0);
    await council.page.screenshot({
      path: 'artifacts/screenshots/council-decision.png',
      fullPage: true,
    });
    await visit(manager.page, `${firm.href}/schemes/${schemeId}`, name);
    await manager.page.screenshot({
      path: 'artifacts/screenshots/strata-scheme.png',
      fullPage: true,
    });
    await resident.page.setViewportSize({ width: 390, height: 844 });
    await resident.page.screenshot({
      path: 'artifacts/screenshots/building-mobile.png',
      fullPage: true,
    });
    expect(
      await resident.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
    ).toBe(true);
  } finally {
    await manager.context.close();
    await resident.context.close();
    await council.context.close();
    await operator.context.close();
  }
});
