import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { catalogueSql } from '../../scripts/catalogue-sql.mjs';

mkdirSync('artifacts', { recursive: true });
await build({
  entryPoints: ['tests/runtime/entry.ts'],
  outfile: 'artifacts/residential-pivot-worker.mjs',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers', 'node:*'],
});
const mf = new Miniflare({
  modules: true,
  scriptPath: 'artifacts/residential-pivot-worker.mjs',
  compatibilityDate: '2026-07-01',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'residential-pivot-fixture' },
  r2Buckets: { DOCUMENTS: 'co-living-docs', RESTRICTED_DOCUMENTS: 'co-living-restricted' },
  durableObjects: { SCHEDULER: { className: 'BookingScheduler', useSQLite: true } },
  bindings: {
    APP_ENV: 'local',
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
  const statements = JSON.parse(
    execFileSync('python3', ['scripts/schema-statements.py'], { encoding: 'utf8' }),
  );
  for (const item of statements) await db.prepare(item).run();
  for (const item of catalogueSql().split('\n')) await db.prepare(item).run();
  const owner = await login('pivot-owner@example.test');
  const other = await login('pivot-other@example.test');
  const staff = await login('pivot-staff@example.test');
  const staffUser = await sql('SELECT id FROM users WHERE email=?', staff.email).first();
  await sql(
    "INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'operations_manager',1)",
    staffUser.id,
  ).run();
  const registered = await api('/api/onboarding', {
    cookie: owner.cookie,
    body: { displayName: 'Pivot Owner', clientName: 'Pivot Homes', landlordType: 'residential' },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const clientId = registered.data.clientId,
    base = '/api/w/landlord/' + clientId;
  const created = await api(base + '/properties', {
    cookie: owner.cookie,
    body: {
      address: '77 Synthetic Street',
      suburb: 'Perth',
      postcode: '6000',
      propertyType: 'House',
      selfManaged: true,
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const propertyId = created.data.propertyId;
  assert.equal(
    (await sql('SELECT count(*) AS n FROM stripe_billing_links').first()).n,
    0,
    'Free registration must not create billing',
  );
  assert.equal(
    (await api(base + '/properties/' + propertyId, { cookie: other.cookie })).status,
    403,
  );
  assert.equal(
    (
      await api('/api/onboarding', {
        cookie: other.cookie,
        body: { displayName: 'Other', clientName: 'Retired', landlordType: 'commercial' },
      })
    ).status,
    410,
  );
  for (const kind of ['commercial', 'strata-manager'])
    assert.equal(
      (
        await api('/api/organisation-applications', {
          cookie: other.cookie,
          body: { kind, name: 'Retired agency', businessReference: 'synthetic review' },
        })
      ).status,
      410,
    );
  assert.equal(
    (
      await api('/api/organisation-applications', {
        cookie: other.cookie,
        body: {
          kind: 'property-manager',
          name: 'Residential agency',
          businessReference: 'synthetic review',
        },
      })
    ).status,
    201,
  );
  const staffWorkspace = (await api('/api/session', { cookie: staff.cookie })).data.workspaces.find(
    (w) => w.kind === 'staff',
  );
  assert.ok(staffWorkspace);
  const staffBase = '/api/w/staff/' + staffWorkspace.scopeId;
  await sql("INSERT INTO organisation_applications(id,user_id,name,workspace_kind,business_reference,status,created_at) VALUES('old_commercial_application',?,'Old application','commercial','SYNTHETIC-ONLY','pending','2026-01-01')",staffUser.id).run();
  assert.equal((await api(staffBase+'/organisation-applications/old_commercial_application/review',{cookie:staff.cookie,body:{decision:'approved',reference:'SYNTHETIC-ONLY'}})).status,410);
  assert.equal((await sql("SELECT status FROM organisation_applications WHERE id='old_commercial_application'").first()).status,'pending');

  for (const path of [
    'schemes',
    'commercial-leases',
    'facilities',
    'council-appointments',
    'amenities',
  ])
    assert.equal(
      (await api(staffBase + '/' + path, { cookie: staff.cookie, body: { action: 'create' } }))
        .status,
      410,
      path,
    );
  for (const market of ['COM', 'STR', 'CTS', 'STA']) {
    assert.equal(
      (
        await api(staffBase + '/v2/markets/' + market + '/enable', {
          cookie: staff.cookie,
          body: { enabled: true },
        })
      ).status,
      410,
    );
    assert.equal(
      (
        await api(staffBase + '/v2/asset-markets', {
          cookie: staff.cookie,
          body: { propertyId, marketCode: market },
        })
      ).status,
      410,
    );
  }
  const asset = await api(staffBase + '/v2/assets', {
    cookie: staff.cookie,
    body: { propertyId, kind: 'building', name: 'Residential shared asset' },
  });
  assert.equal(asset.status, 200, JSON.stringify(asset.data));
  const profile = await api(staffBase + '/v2-estates/profiles', {
    cookie: staff.cookie,
    body: { assetId: asset.data.id, assetCode: 'SYNTHETIC-RESIDENTIAL' },
  });
  assert.equal(profile.status, 200, JSON.stringify(profile.data));
  // Historical records are seeded as pre-pivot state, never via active acquisition.
  await sql(
    "INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('pivot_legacy','Legacy address','Perth','6000','legacy-pivot','commercial','2026-01-01')",
  ).run();
  const legacyAsset = await sql(
    "SELECT id FROM v2_assets WHERE property_id='pivot_legacy'",
  ).first();
  assert.ok(legacyAsset);
  assert.equal(
    (
      await api(staffBase + '/v2-estates/profiles', {
        cookie: staff.cookie,
        body: { assetId: legacyAsset.id, assetCode: 'RETIRED-ASSET' },
      })
    ).status,
    410,
  );
  assert.equal(
    (await api(staffBase + '/properties/pivot_legacy', { cookie: staff.cookie })).status,
    200,
    'Authorised historical read',
  );
  assert.equal(
    (
      await api(staffBase + '/properties/pivot_legacy', {
        cookie: staff.cookie,
        body: { address: 'changed' },
      })
    ).status,
    410,
    'Staff cannot mutate a retired property',
  );
  const untyped = await mf.dispatchFetch(
    'http://localhost' + staffBase + '/properties/pivot_legacy',
    {
      method: 'POST',
      headers: { Origin: 'http://localhost', Cookie: staff.cookie },
      body: JSON.stringify({ address: 'changed' }),
    },
  );
  assert.equal(untyped.status, 410, 'Content-Type omission cannot bypass retirement');
  assert.equal(
    (
      await api(staffBase + '/bookings', {
        cookie: staff.cookie,
        body: { propertyId: 'pivot_legacy', serviceId: 'routine-inspection' },
      })
    ).status,
    410,
  );
  assert.equal(
    (
      await api(base + '/bookings', {
        cookie: owner.cookie,
        body: { propertyId, serviceId: 'commercial-property-inspection' },
      })
    ).status,
    410,
  );
  assert.equal((await api('/api/v4/catalogue/COM-001')).status, 410);
  assert.deepEqual((await api('/api/public/leasing?kind=commercial')).data.listings, []);
  const publicServices = (await api('/api/catalogue')).data.services;
  assert.ok(
    publicServices.length > 0 && publicServices.every((s) => s.sectors.includes('residential')),
  );
  assert.equal(
    (
      await api('/api/stripe/subscription-checkout', {
        cookie: owner.cookie,
        body: { workspaceKind: 'landlord', clientId, propertyId },
      })
    ).status,
    503,
    'No approved terms means no Checkout',
  );
  // Written notice is account-scoped, replay-safe and cannot promise provider cancellation.
  const ownerId = (await sql('SELECT id FROM users WHERE email=?', owner.email).first()).id;
  await sql(
    "INSERT INTO stripe_billing_links(id,client_id,property_id,sector,price_id,stripe_customer_id,status,created_at,updated_at) VALUES('sbl_pivot',?,?,'residential','price_test','cus_test','active','2026-01-01','2026-01-01')",
    clientId,
    propertyId,
  ).run();
  await sql(
    "INSERT INTO residential_subscription_contracts VALUES('sbl_pivot','residential-all-inclusive-weekly-2026-11',5000,'AUD','property',24,60,?,'2026-01-01','2026-01-01T00:00:00.000Z')",
    ownerId,
  ).run();
  const notice = await api(base + '/billing/cancellation-notice', {
    cookie: owner.cookie,
    body: { billingLinkId: 'sbl_pivot', reason: 'Written test notice' },
  });
  assert.equal(notice.status, 200, JSON.stringify(notice.data));
  assert.equal(notice.data.status, 'pending_review');
  assert.ok(notice.data.earliest_end_at >= '2028-01-01T00:00:00.000Z');
  const replay = await api(base + '/billing/cancellation-notice', {
    cookie: owner.cookie,
    body: { billingLinkId: 'sbl_pivot', reason: 'Repeated request' },
  });
  assert.equal(replay.data.received_at, notice.data.received_at);
  assert.equal(
    (
      await api(base + '/billing/cancellation-notice', {
        cookie: other.cookie,
        body: { billingLinkId: 'sbl_pivot', reason: 'Not authorised' },
      })
    ).status,
    403,
  );
  assert.equal(
    (await sql("SELECT status FROM stripe_billing_links WHERE id='sbl_pivot'").first()).status,
    'active',
  );
  await assert.rejects(() =>
    sql(
      "UPDATE residential_subscription_contracts SET initial_term_months=1 WHERE billing_link_id='sbl_pivot'",
    ).run(),
  );
  await assert.rejects(() =>
    sql("DELETE FROM residential_subscription_contracts WHERE billing_link_id='sbl_pivot'").run(),
  );
  await assert.rejects(() =>
    sql(
      "UPDATE residential_cancellation_notices SET received_at='2030-01-01' WHERE billing_link_id='sbl_pivot'",
    ).run(),
  );
  const dashboard = await api(base + '/billing', { cookie: owner.cookie });
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.data));
  const savedNotice = dashboard.data.subscriptions.find((s) => s.id === 'sbl_pivot');
  assert.equal(savedNotice.notice_received_at, notice.data.received_at);
  assert.equal(savedNotice.notice_status, 'pending_review');
  assert.equal(dashboard.data.portalEnabled, false);
  // R2 recovery uses only this isolated fixture bucket, including exact byte comparison.
  const bucket = await mf.getR2Bucket('DOCUMENTS');
  const bytes = Buffer.from('Synthetic issued report – no customer data.');
  await bucket.put('reports/synthetic', bytes);
  const backup = await (await bucket.get('reports/synthetic')).arrayBuffer();
  await bucket.delete('reports/synthetic');
  assert.equal(await bucket.get('reports/synthetic'), null);
  await bucket.put('reports/synthetic', backup);
  assert.deepEqual(Buffer.from(await (await bucket.get('reports/synthetic')).arrayBuffer()), bytes);
  assert.equal((await sql('PRAGMA foreign_key_check').all()).results.length, 0);
  console.log(
    'Residential pivot: free owner/property, agency pending application, cross-account denial, retired Staff mutations, legacy read, catalogue, checkout gate, cancellation replay and isolated R2 restore passed.',
  );
} finally {
  await mf.dispose();
}
