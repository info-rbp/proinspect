import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const origin = 'http://127.0.0.1:5173';
const email = () => `entry-${randomUUID()}@proinspect.test`;
async function post(context: BrowserContext, path: string, data: unknown) {
  const response = await context.request.post(path, { headers: { Origin: origin }, data });
  const body = await response.json();
  expect(response.ok(), path + ': ' + JSON.stringify(body)).toBe(true);
  return body;
}
async function session(context: BrowserContext) {
  return (await context.request.get('/api/session')).json();
}
async function signIn(context: BrowserContext, address = email()) {
  const started = await post(context, '/api/auth/start', { email: address });
  await post(context, '/api/auth/complete', {
    email: address,
    token: new URL(started.localSignInUrl).searchParams.get('token'),
  });
  return address;
}
async function verifyEmail(page: Page, address: string) {
  await page.getByLabel('Email address', { exact: true }).fill(address);
  await page.getByRole('button', { name: 'Email sign-in link', exact: true }).click();
  await page.getByRole('link', { name: 'Continue with local sign-in' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm it is you.' })).toBeVisible();
  await page.getByLabel('Email address', { exact: true }).fill(address);
  await page.getByRole('button', { name: 'Confirm sign-in', exact: true }).click();
}
test('sign-up keeps service intent, creates a free residential account and preserves the existing mobile styling', async ({
  page,
}) => {
  await page.goto('/signup?service=routine-inspection');
  await expect(
    page.getByRole('heading', { name: 'Create your free account', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: 'What brings you to ProInspect?' })).toBeVisible();
  await page.getByRole('radio', { name: /I own a residential property/ }).check();
  await verifyEmail(page, email());
  await expect(page).toHaveURL(/\/onboarding\?flow=ONB-RES-OWNER&service=routine-inspection$/);
  expect((await session(page.context())).workspaces).toHaveLength(0);
  await expect(
    page.getByRole('link', { name: 'Apply for professional organisation access' }),
  ).toHaveAttribute('href', '/organisation?flow=ONB-RES-AGENCY&service=routine-inspection');
  await expect(page.getByRole('heading', { name: "Welcome. Let's set up your property." })).toBeVisible();
  await page.getByLabel('Your full name', { exact: true }).fill('Synthetic Owner');
  await page.getByText('Does a business or entity own the property?').click();
  await page.getByLabel('Owning entity / account name').fill('Synthetic Self Managed');
  await page.getByRole('checkbox', { name: /I own and self-manage/ }).check();
  await page.getByRole('button', { name: 'Continue to add your property', exact: true }).click();
  await expect(page).toHaveURL(
    /\/w\/landlord\/cli_[a-z0-9]+\/properties\?service=routine-inspection$/,
  );
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Properties and subscriptions' })).toBeVisible();
  await expect(page.getByText('Registration is free.', { exact: false })).toBeVisible();
  const accountState = await (await page.request.get('/api/account')).json();
  expect(accountState.billingAvailable).toBe(false);
  expect(accountState.propertyPlans).toEqual([]);
  expect((await session(page.context())).workspaces.map((w: any) => w.kind)).toEqual(['landlord']);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/signup');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
    true,
  );
  mkdirSync('artifacts/screenshots', { recursive: true });
  await page.screenshot({ path: 'artifacts/screenshots/signup-mobile.png', fullPage: true });
});
for (const [flow, kind] of [
  ['ONB-RES-AGENCY', 'property-manager'],
  ['ONB-COM-MANAGER', 'commercial'],
  ['ONB-STR-MANAGER', 'strata-manager'],
]) {
  test(`${flow} applies the organisation entry policy without JavaScript or paid access`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: origin, javaScriptEnabled: false });
    try {
      await signIn(context);
      const page = await context.newPage();
      await page.goto('/start?flow=' + flow + '&service=routine-inspection');
      if (kind !== 'property-manager') {
        await expect(page.getByRole('heading',{name:'How will you use ProInspect?'})).toBeVisible();
        const blocked=await context.request.post('/api/organisation-applications',{headers:{Origin:origin},data:{kind,name:'Retired firm',businessReference:'Synthetic entitlement'}});
        expect(blocked.status()).toBe(410);
        expect((await session(context)).workspaces).toHaveLength(0);
        return;
      }
      await expect(page).toHaveURL(
        origin + '/organisation?flow=' + flow + '&service=routine-inspection',
      );
      for (const link of await page
        .getByRole('navigation', { name: 'Professional organisation type' })
        .getByRole('link')
        .all())
        await expect(link).toHaveAttribute('href', /service=routine-inspection$/);
      await page.getByLabel('Organisation or legal business name').fill('Synthetic ' + kind);
      await page
        .getByLabel('Business / engagement reference')
        .fill('SYNTHETIC-AUTHORITY-REFERENCE');
      await page.getByRole('button', { name: 'Submit for approval' }).click();
      await expect(page.getByRole('status')).toContainText('awaiting ProInspect review');
      const applications = (
        await (await context.request.get('/api/organisation-applications')).json()
      ).applications;
      expect(applications).toHaveLength(1);
      expect(applications[0]).toMatchObject({ workspace_kind: kind, status: 'pending' });
      expect((await session(context)).workspaces).toHaveLength(0);
      await expect(page.getByRole('link', { name: 'Return to My ProInspect' })).toHaveAttribute(
        'href',
        '/workspaces?service=routine-inspection',
      );
    } finally {
      await context.close();
    }
  });
}
test('Resident sign-up gives invitation help and never creates an owner or resident membership', async ({
  page,
}) => {
  await page.goto('/signup?flow=ONB-INV-CORE');
  await expect(page.getByRole('radio', { name: /I am a tenant or resident/ })).toBeChecked();
  await verifyEmail(page, email());
  await expect(page.getByRole('heading', { name: 'Connect to your invitation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Get help with access' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to add your property' })).toHaveCount(0);
  expect((await session(page.context())).workspaces).toHaveLength(0);
  await page.goto('/start?flow=ONB-STAFF');
  await expect(page.getByRole('heading', { name: 'How will you use ProInspect?' })).toBeVisible();
  expect((await page.request.get('/api/w/staff/operations')).status()).toBe(403);
});
test('invitation survives sign-up and opens only the invited tenancy after acceptance', async ({
  browser,
}) => {
  const owner = await browser.newContext({ baseURL: origin }),
    tenant = await browser.newContext({ baseURL: origin });
  try {
    await signIn(owner);
    const account = await post(owner, '/api/onboarding', {
      displayName: 'Synthetic Inviter',
      clientName: 'Synthetic Invitation Account',
    });
    const base = '/api/w/landlord/' + account.clientId;
    const property = await post(owner, base + '/properties', {
      address: randomUUID() + ' Synthetic Street',
      suburb: 'Perth',
      postcode: '6000',
      propertyType: 'House',
      selfManaged: true,
    });
    const tenancy = await post(owner, base + '/tenancies', {
      propertyId: property.propertyId,
      email: email(),
      startsAt: new Date(Date.now() - 86400000).toISOString(),
    });
    const address = email();
    const invitation = await post(owner, base + '/tenancies/' + tenancy.id + '/invite', {
      email: address,
    });
    const path =
      new URL(invitation.localInvitationUrl).pathname +
      new URL(invitation.localInvitationUrl).search;
    const page = await tenant.newPage();
    await page.goto(path);
    await expect(page).toHaveURL(/\/signin\?returnTo=/);
    await page.getByRole('link', { name: 'Create a free account' }).click();
    await expect(page.getByRole('heading', { name: 'Create your free account', exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'What brings you to ProInspect?' })).toHaveCount(0);
    await verifyEmail(page, address);
    await expect(page).toHaveURL(origin + path);
    await expect(
      page.getByRole('heading', { name: "You've been invited to ProInspect" }),
    ).toBeVisible();
    expect((await session(tenant)).workspaces).toHaveLength(0);
    await page.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(page).toHaveURL(origin + '/w/tenant/' + tenancy.id);
    await page.goto('/start');
    await expect(page).toHaveURL(origin + '/w/tenant/' + tenancy.id);
    expect((await session(tenant)).workspaces.map((w: any) => w.kind)).toEqual(['tenant']);
    expect((await tenant.request.get(base)).status()).toBe(403);
  } finally {
    await owner.close();
    await tenant.close();
  }
});
test('existing owners reach the correct portal and multiple accounts retain service selection', async ({
  page, browser,
}) => {
  await signIn(page.context());
  const residential = await post(page.context(), '/api/onboarding', {
    displayName: 'Synthetic Multi Owner',
    clientName: 'Synthetic Residential',
  });
  await page.goto('/start');
  await expect(page).toHaveURL(origin + '/w/landlord/' + residential.clientId);
  const staff = await browser.newContext({baseURL:origin});
  let agency;
  try {
    await signIn(staff,'auth-onboarding-staff@proinspect.test');
    const application=await post(page.context(),'/api/organisation-applications',{kind:'property-manager',name:'Second managed portfolio',businessReference:'Synthetic agency agreement'});
    agency=await post(staff,'/api/w/staff/operations/organisation-applications/'+application.id+'/review',{decision:'approved',reference:'Reviewed synthetic portfolio'});
  } finally { await staff.close(); }
  await page.goto('/start?service=routine-inspection');
  await expect(page).toHaveURL(origin+'/workspaces?service=routine-inspection');
  for (const [kind,id] of [['landlord',residential.clientId],['property-manager',agency.clientId]]){
    await expect(page.locator('a.workspace-card[href="/w/'+kind+'/'+id+'/book/routine-inspection"]')).toBeVisible();
  }
  await expect(page.getByRole('link',{name:'Commercial management',exact:true})).toHaveCount(0);
  for (const [kind, id, heading] of [
    ['property-manager', agency.clientId, 'Your managed portfolio'],
    ['landlord', residential.clientId, 'Your property overview'],
  ]) {
    await page.goto('/workspaces');
    await page.locator(`a.workspace-card[href="/w/${kind}/${id}"]`).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Manage properties', exact: true })).toHaveAttribute('href', `/w/${kind}/${id}/properties`);
  }
});
test('approved residential managers return to their scoped portfolio',async({browser})=>{
  const manager=await browser.newContext({baseURL:origin}),staff=await browser.newContext({baseURL:origin});
  try {
    await signIn(manager);await signIn(staff,'auth-onboarding-staff@proinspect.test');
    const app=await post(manager,'/api/organisation-applications',{kind:'property-manager',name:'Reviewed Residential Agency',businessReference:'Synthetic appointment'});
    const approved=await post(staff,'/api/w/staff/operations/organisation-applications/'+app.id+'/review',{decision:'approved',reference:'SYNTHETIC-STAFF-REVIEW'});
    const page=await manager.newPage();await page.goto('/start?flow=ONB-RES-AGENCY');
    await expect(page).toHaveURL(new RegExp('/w/property-manager/'+approved.clientId));
    expect((await session(manager)).workspaces.map((w:any)=>w.kind)).toEqual(['property-manager']);
  } finally {await manager.close();await staff.close();}
});
test('registration rejects forged roles and incomplete sign-in links provide recovery', async ({
  page,
  request,
}) => {
  const result = await request.post('/signup', {
    headers: { Origin: origin },
    form: { mode: 'signup', returnTo: '/start', flow: 'ONB-STAFF', email: email() },
  });
  expect(result.status()).toBe(422);
  await page.goto('/auth/complete?token=invalid');
  await expect(page.getByRole('alert')).toContainText('incomplete or invalid');
  await expect(page.getByRole('button', { name: 'Confirm sign-in', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Request a new sign-in link' })).toHaveAttribute(
    'href',
    '/signin',
  );
});

test('one-off inspection entry remains free and adds a property without creating paid coverage', async ({ page }) => {
  await page.goto('/signup?service=property-condition-report');
  await page.getByRole('radio', { name: /I need a one-off inspection/ }).check();
  await verifyEmail(page, email());
  await expect(page).toHaveURL(/\/onboarding\?flow=ONB-RES-OWNER&service=property-condition-report$/);
  await page.getByLabel('Your full name', { exact: true }).fill('Synthetic Inspection Owner');
  await page.getByRole('checkbox', { name: /I own and self-manage/ }).check();
  await page.getByRole('button', { name: 'Continue to add your property' }).click();
  await expect(page).toHaveURL(/\/w\/landlord\/cli_[a-z0-9]+\/properties\?service=property-condition-report$/);
  const base = new URL(page.url()).pathname.replace('/properties', '');
  await page.getByLabel('Street address, including unit if applicable').fill('47 Synthetic New Street');
  await page.getByLabel('Suburb').fill('Perth');
  await page.getByLabel('WA postcode').fill('6000');
  await page.getByRole('checkbox', { name: /I own and self-manage this residential rental property/ }).check();
  await page.getByRole('button', { name: 'Add property' }).click();
  await expect(page).toHaveURL(new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/book/property-condition-report\\?property=prop_'));
  // Client Portal PR #116 -> draft booking PR #118 is one continuous
  // authenticated owner journey, without creating a paid entitlement.
  await expect(page.getByRole('heading', { name: 'Arrange your next property visit.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inspection details' })).toBeVisible();
  await expect(page.getByLabel('Contact phone')).toBeVisible();
  await expect(page.getByLabel('Tenancy commencement date (if known)')).toBeVisible();
  const serviceIds = await page.getByLabel('Service', { exact: true })
    .locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(Boolean));
  const core = ['property-condition-report', 'final-exit-inspection', 'routine-inspection']
    .filter(id => serviceIds.includes(id));
  expect(core).toContain('property-condition-report');
  expect(serviceIds.slice(0, core.length)).toEqual(core);
  const account = await (await page.request.get('/api/account')).json();
  expect(account.propertyPlans).toHaveLength(1);
  expect(account.propertyPlans[0]).toMatchObject({
    subscription_intent: 'none',
    subscription_status: 'none',
    stripe_subscription_recorded: 0,
    grandfathered: 0,
  });
  expect(account.billingAvailable).toBe(false);
});
