import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { catalogueSql } from '../../scripts/catalogue-sql.mjs';

mkdirSync('artifacts', { recursive: true });
await build({
  entryPoints: ['tests/runtime/entry.ts'],
  outfile: 'artifacts/weekly-billing-worker.mjs',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers', 'node:*'],
});
const price = 'price_1UVkM6Ev62nbUZoknG7CA5P5',
  account = 'acct_1USumhEv62nbUZok';
const providerCalls = [],
  sessions = new Map();
let observedSubscription;
const mf = new Miniflare({
  modules: true,
  scriptPath: 'artifacts/weekly-billing-worker.mjs',
  compatibilityDate: '2026-07-01',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'weekly-billing-fixture' },
  r2Buckets: { DOCUMENTS: 'co-living-docs', RESTRICTED_DOCUMENTS: 'co-living-restricted' },
  durableObjects: { SCHEDULER: { className: 'BookingScheduler', useSQLite: true } },
  outboundService: async (request) => {
    const url = new URL(request.url);
    assert.equal(url.origin, 'https://api.stripe.com');
    const form = request.method === 'POST' ? new URLSearchParams(await request.text()) : null;
    providerCalls.push({ path: url.pathname, method: request.method, form });
    if (url.pathname === '/v1/account') return Response.json({ id: account });
    if (url.pathname === '/v1/tax/settings')
      return Response.json({ status: 'active', head_office: { address: { country: 'AU' } } });
    if (url.pathname === '/v1/tax/registrations')
      return Response.json({ data: [{ country: 'AU', status: 'active' }] });
    if (url.pathname === '/v1/prices/' + price)
      return Response.json({
        id: price,
        livemode: false,
        active: true,
        currency: 'aud',
        unit_amount: 5000,
        tax_behavior: 'exclusive',
        recurring: { interval: 'week', interval_count: 1 },
        product: 'prod_synthetic',
      });
    if (url.pathname === '/v1/products/prod_synthetic')
      return Response.json({ tax_code: 'txcd_20030000' });
    if (url.pathname === '/v1/subscriptions/sub_weekly_synthetic') {
      assert.equal(request.method, 'GET');
      return Response.json(observedSubscription);
    }
    if (url.pathname === '/v1/customers')
      return Response.json({ id: 'cus_weekly_synthetic', livemode: false });
    if (url.pathname === '/v1/checkout/sessions' && form) {
      const id = 'cs_test_weekly_' + sessions.size;
      const value = {
        id,
        mode: 'subscription',
        livemode: false,
        status: 'open',
        customer: form.get('customer'),
        url: 'https://checkout.stripe.com/c/' + id,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      sessions.set(id, value);
      return Response.json(value);
    }
    if (url.pathname.startsWith('/v1/checkout/sessions/'))
      return Response.json(sessions.get(url.pathname.split('/').at(-1)));
    throw Error('Unexpected synthetic provider operation: ' + url.pathname);
  },
  bindings: {
    APP_ENV: 'local',
    LEGAL_ACCEPTANCE_ENABLED: 'true',
    STRIPE_BILLING_ENABLED: 'true',
    STRIPE_TAX_READY: 'true',
    STRIPE_ACCOUNT_ID: account,
    STRIPE_SECRET_KEY: 'rk_test_synthetic_weekly_fixture_only',
    STRIPE_WEBHOOK_SECRET: 'whsec_synthetic_weekly_fixture_only',
    APP_ORIGIN: 'http://localhost',
    DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    EMAIL_PROVIDER: 'local',
    OPERATIONS_EMAIL: 'operations@example.test',
  },
});
const db = await mf.getD1Database('DB');
const sql = (q, ...args) => db.prepare(q).bind(...args);
async function api(path, { cookie, body, method, origin = 'http://localhost' } = {}) {
  const headers = new Headers({ Origin: origin });
  if (cookie) headers.set('Cookie', cookie);
  let payload;
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }
  const res = await mf.dispatchFetch('http://localhost' + path, {
    method: method ?? (payload ? 'POST' : 'GET'),
    headers: Object.fromEntries(headers),
    body: payload,
  });
  return {
    status: res.status,
    data: res.headers.get('content-type')?.includes('json') ? await res.json() : null,
    cookie: res.headers.get('set-cookie'),
  };
}
async function login(email) {
  const start = await api('/api/auth/start', { body: { email } });
  assert.equal(start.status, 200, JSON.stringify(start.data));
  const token = new URL(start.data.localSignInUrl).searchParams.get('token');
  const response = await api('/api/auth/complete', { body: { email, token } });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return { cookie: response.cookie.split(';')[0], email };
}
try {
  for (const item of JSON.parse(
    execFileSync('python3', ['scripts/schema-statements.py'], { encoding: 'utf8' }),
  ))
    await db.prepare(item).run();
  for (const item of catalogueSql().split('\n')) await db.prepare(item).run();
  for (const id of ['drafter', 'reviewer'])
    await sql(
      "INSERT INTO users(id,email,verified_at,created_at) VALUES(?,?, '2026-01-01','2026-01-01')",
      id,
      id + '@synthetic.invalid',
    ).run();
  const docs = [];
  for (const key of ['privacy', 'platform-terms', 'terms', 'subscription-terms']) {
    const id = 'ldv_weekly_' + key.replaceAll('-', '_'),
      hash = 'a'.repeat(64);
    await sql(
      "INSERT INTO legal_document_versions(id,document_key,version_label,title,body_json,content_sha256,status,created_by,created_at,approved_by,approved_at,effective_at,approval_reference) VALUES(?,?,?,'Synthetic test-only approval','{}',?,'approved','drafter','2026-01-01','reviewer','2026-01-01','2026-01-01','SYNTHETIC-ONLY')",
      id,
      key,
      key === 'subscription-terms' ? 'residential-all-inclusive-weekly-2026-11' : 'synthetic-1',
      hash,
    ).run();
    docs.push({ id, sha256: hash });
  }
  const owner = await login('weekly-owner@example.test'),
    other = await login('weekly-other@example.test');
  const register = await api('/api/onboarding', {
    cookie: owner.cookie,
    body: {
      displayName: 'Weekly Owner',
      clientName: 'Weekly Home',
      legalConsent: { acknowledged: true, documents: docs.slice(0, 2) },
    },
  });
  assert.equal(register.status, 201, JSON.stringify(register.data));
  const clientId = register.data.clientId,
    base = '/api/w/landlord/' + clientId;
  const property = await api(base + '/properties', {
    cookie: owner.cookie,
    body: {
      address: '88 Synthetic Street',
      suburb: 'Perth',
      postcode: '6000',
      propertyType: 'House',
      selfManaged: true,
    },
  });
  assert.equal(property.status, 201, JSON.stringify(property.data));
  const payload = { workspaceKind: 'landlord', clientId, propertyId: property.data.propertyId };
  const path = '/api/stripe/subscription-checkout';
  assert.equal((await api(path, { cookie: other.cookie, body: payload })).status, 403);
  assert.equal(providerCalls.length, 0, 'Unauthorised caller cannot contact provider');
  assert.equal(
    (await api(path, { cookie: owner.cookie, body: payload })).status,
    422,
    'Consent cannot be omitted',
  );
  assert.equal((await sql('SELECT count(*) n FROM stripe_billing_links').first()).n, 0);
  payload.legalConsent = { acknowledged: true, documents: docs };
  const result = await api(path, { cookie: owner.cookie, body: payload });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const contract = await sql('SELECT * FROM residential_subscription_contracts').first();
  assert.equal(contract.billing_unit, 'property');
  assert.equal(contract.initial_term_months, 24);
  assert.equal(contract.cancellation_notice_days, 60);
  assert.equal(contract.weekly_ex_gst_cents, 5000);
  assert.equal(
    contract.starts_at,
    null,
    'Checkout redirect is not verified subscription commencement',
  );
  assert.equal(
    (
      await sql(
        "SELECT count(*) n FROM legal_acceptance_receipts WHERE purpose='subscription'",
      ).first()
    ).n,
    4,
  );
  const checkout = providerCalls.find(
    (c) => c.path === '/v1/checkout/sessions' && c.method === 'POST',
  ).form;
  assert.equal(checkout.get('line_items[0][price]'), price);
  assert.equal(checkout.get('line_items[0][quantity]'), '1');
  assert.equal(checkout.get('automatic_tax[enabled]'), 'true');
  assert.equal(
    checkout.has('subscription_data[billing_cycle_anchor]'),
    false,
    'No unapproved Friday anchor',
  );
  const retry = await api(path, { cookie: owner.cookie, body: payload });
  assert.equal(retry.data.checkoutUrl, result.data.checkoutUrl);
  assert.equal(sessions.size, 1);
  assert.equal(
    (await sql('SELECT count(*) n FROM residential_subscription_contracts').first()).n,
    1,
  );
  const cancel = await api(base + '/billing/cancellation-notice', {
    cookie: owner.cookie,
    body: { billingLinkId: contract.billing_link_id, reason: 'Synthetic notice' },
  });
  assert.equal(cancel.status, 409, 'Notice cannot invent a provider start date');
  const start = Math.floor(Date.now() / 1000),
    event = {
      id: 'evt_weekly_start',
      type: 'customer.subscription.created',
      created: start,
      livemode: false,
      data: {
        object: {
          id: 'sub_weekly_synthetic',
          customer: 'cus_weekly_synthetic',
          status: 'active',
          start_date: start,
          metadata: { billing_link_id: contract.billing_link_id },
          items: { data: [{ price: { id: price }, quantity: 1 }] },
        },
      },
    };
  const raw = JSON.stringify(event),
    signature = createHmac('sha256', 'whsec_synthetic_weekly_fixture_only')
      .update(start + '.' + raw)
      .digest('hex');
  const signed = await mf.dispatchFetch('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body: raw,
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': `t=${start},v1=${signature}`,
    },
  });
  assert.equal(signed.status, 200, await signed.text());
  assert.equal(
    (await sql('SELECT starts_at FROM residential_subscription_contracts').first()).starts_at,
    new Date(start * 1000).toISOString(),
  );
  const notice = await api(base + '/billing/cancellation-notice', {
    cookie: owner.cookie,
    body: { billingLinkId: contract.billing_link_id, reason: 'Synthetic written notice' },
  });
  assert.equal(notice.status, 200, JSON.stringify(notice.data));
  assert.equal(notice.data.status, 'pending_review');
  await api(base + '/billing/cancellation-notice', {
    cookie: owner.cookie,
    body: { billingLinkId: contract.billing_link_id, reason: 'Retry of notice' },
  });
  assert.equal(
    (
      await sql(
        "SELECT COUNT(*) n FROM audit_events WHERE action='subscription.cancellation_notice_received'",
      ).first()
    ).n,
    1,
  );
  const ops = await login('review-ops@weekly.example');
  await sql(
    "INSERT INTO staff_profiles(user_id,role) SELECT id,'operations_manager' FROM users WHERE email=?",
    ops.email,
  ).run();
  const verify = '/api/w/staff/operations/billing/cancellation-review';
  const command = { billingLinkId: contract.billing_link_id };
  assert.equal((await api(verify, { cookie: other.cookie, body: command })).status, 403);
  const overview = await api('/api/w/staff/operations/billing', { cookie: ops.cookie });
  assert.equal(overview.status, 200, JSON.stringify(overview.data));
  assert.ok(
    overview.data.cancellationNotices.some(
      (n) => n.billing_link_id === contract.billing_link_id && n.status === 'pending_review',
    ),
  );
  observedSubscription = {
    id: 'sub_weekly_synthetic',
    customer: 'cus_weekly_synthetic',
    livemode: false,
    status: 'active',
    cancel_at: null,
    metadata: { billing_link_id: contract.billing_link_id },
    items: { data: [{ price: { id: price }, quantity: 1 }], has_more: false },
  };
  assert.equal((await api(verify, { cookie: ops.cookie, body: command })).status, 409);
  observedSubscription.cancel_at =
    Math.ceil(Date.parse(notice.data.earliest_end_at) / 1000) - 86400;
  assert.equal((await api(verify, { cookie: ops.cookie, body: command })).status, 409);
  observedSubscription.cancel_at += 2 * 86400;
  observedSubscription.customer = 'cus_another_property';
  assert.equal((await api(verify, { cookie: ops.cookie, body: command })).status, 409);
  observedSubscription.customer = 'cus_weekly_synthetic';
  const verified = await api(verify, { cookie: ops.cookie, body: command });
  assert.equal(verified.status, 200, JSON.stringify(verified.data));
  assert.equal(verified.data.status, 'provider_scheduled');
  assert.deepEqual((await api(verify, { cookie: ops.cookie, body: command })).data, verified.data);
  assert.equal(
    (
      await sql(
        "SELECT COUNT(*) n FROM audit_events WHERE action='subscription.cancellation_verified_in_sandbox'",
      ).first()
    ).n,
    1,
  );
  console.log(
    'PASS: synthetic weekly Checkout, mandatory consent, exact price/tax/quantity, per-property immutable 24/60 contract, duplicate replay and no unverified start. No real provider calls.',
  );
} finally {
  await mf.dispose();
}
