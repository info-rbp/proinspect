import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash, createHmac } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { catalogueSql } from '../../scripts/catalogue-sql.mjs';
import { unseal } from '../../packages/auth/crypto.ts';

mkdirSync('artifacts', { recursive: true });
await build({
  entryPoints: ['tests/runtime/entry.ts'],
  outfile: 'artifacts/continuity-worker.mjs',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers'],
});
const key = randomBytes(32).toString('base64');
const webhookSecret = 'whsec_synthetic_fixture_only',
  reportSecret = 'synthetic-report-signature-fixture';
const checkouts = [];
const mf = new Miniflare({
  modules: true,
  scriptPath: 'artifacts/continuity-worker.mjs',
  compatibilityDate: '2026-07-01',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'integration-db' },
  r2Buckets: { DOCUMENTS: 'integration-documents', RESTRICTED_DOCUMENTS: 'integration-restricted' },
  durableObjects: { SCHEDULER: { className: 'BookingScheduler', useSQLite: true } },
  outboundService: async (request) => {
    const url = new URL(request.url);
    if (url.origin === 'https://api.stripe.com' && url.pathname === '/v1/checkout/sessions') {
      const data = new URLSearchParams(await request.text());
      checkouts.push(Object.fromEntries(data));
      return Response.json({
        id: 'cs_test_' + checkouts.length,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        url: 'https://checkout.stripe.com/c/pay/test_' + checkouts.length,
      });
    }
    throw new Error('Unexpected external request blocked: ' + url.origin);
  },
  bindings: {
    APP_ENV: 'local',
    RESTRICTED_WORKFLOWS_ENABLED: 'true',
    STRIPE_SECRET_KEY: 'sk_test_fixture_only',
    STRIPE_WEBHOOK_SECRET: webhookSecret,
    REPORT_TOOL_SECRET: reportSecret,
    REPORT_TOOL_ORIGIN: 'https://reports.example.test',
    APP_ORIGIN: 'http://localhost',
    DATA_ENCRYPTION_KEY: key,
    EMAIL_PROVIDER: 'local',
    OPERATIONS_EMAIL: 'operations@example.test',
  },
});
const checks = [];
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log(`PASS ${name}`);
}
const sql = await mf.getD1Database('DB');
const run = (query, ...args) =>
  sql
    .prepare(query)
    .bind(...args)
    .run();
const first = (query, ...args) =>
  sql
    .prepare(query)
    .bind(...args)
    .first();

async function api(path, options = {}) {
  const headers = new Headers({
    Origin: 'http://localhost',
    ...(options.cookie ? { Cookie: options.cookie } : {}),
    ...options.headers,
  });
  let body = options.body;
  if (body instanceof FormData) {
    // Node and Miniflare use different Fetch implementations. Encode multipart
    // bytes with Node first, then transport bytes and their matching boundary.
    const encoded = new Request('http://localhost' + path, { method: 'POST', body });
    headers.set('Content-Type', encoded.headers.get('Content-Type'));
    body = new Uint8Array(await encoded.arrayBuffer());
    headers.set('Content-Length', String(body.byteLength));
  } else if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  const response = await mf.dispatchFetch('http://localhost' + path, {
    method: options.method ?? (body ? 'POST' : 'GET'),
    headers: Object.fromEntries(headers),
    body,
  });
  const type = response.headers.get('Content-Type') ?? '';
  return {
    response,
    status: response.status,
    data: type.includes('json') ? await response.json() : await response.arrayBuffer(),
  };
}
async function login(email) {
  const start = await api('/api/auth/start', { body: { email } });
  assert.equal(start.status, 200);
  const token = new URL(start.data.localSignInUrl).searchParams.get('token');
  const end = await api('/api/auth/complete', { body: { email, token } });
  assert.equal(end.status, 200);
  return { cookie: end.response.headers.get('set-cookie').split(';')[0], token, email };
}
function futureDate() {
  const d = new Date(Date.now() + 4 * 86400000);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const staffBase = '/api/w/staff/operations';
const requestKey = () => randomBytes(16).toString('hex');
const pdf = (title = 'Synthetic reviewed document') =>
  new TextEncoder().encode('%PDF-1.4\n' + title + '\n%%EOF');
function upload(fields = {}, content = pdf()) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  f.set('file', new File([content], 'reviewed.pdf', { type: 'application/pdf' }));
  return f;
}
async function ok(path, who, body, status = 200) {
  const r = await api(path, { cookie: who.cookie, ...(body === undefined ? {} : { body }) });
  assert.equal(r.status, status, `${path}: ${JSON.stringify(r.data)}`);
  return r.data;
}
async function userId(who) {
  return (await first('SELECT id FROM users WHERE email=?', who.email)).id;
}
async function invited(who, source) {
  const token = new URL(source).searchParams.get('token');
  await ok('/api/invitations/accept', who, { token });
}
async function makeTenant(owner, base, propertyId, email) {
  const t = await ok(
    base + '/tenancies',
    owner,
    { propertyId, email, startsAt: new Date(Date.now() - 86400000).toISOString() },
    201,
  );
  const e = await first(
    "SELECT id,envelope FROM outbox_events WHERE kind='tenancy.invited' ORDER BY created_at DESC LIMIT 1",
  );
  const payload = await unseal(key, `outbox:${e.id}`, e.envelope),
    tenant = await login(email);
  await invited(tenant, payload.href);
  return { ...tenant, tenancyId: t.id, base: `/api/w/tenant/${t.id}` };
}
async function organisation(who, kind, name, admin) {
  const a = await ok(
    '/api/organisation-applications',
    who,
    { kind, name, businessReference: 'Verified engagement fixture' },
    201,
  );
  const approved = await ok(`${staffBase}/organisation-applications/${a.id}/review`, admin, {
    decision: 'approved',
    reference: 'Reviewed signed agreement fixture',
  });
  return { id: approved.clientId, base: `/api/w/${kind}/${approved.clientId}` };
}
async function book(who, base, propertyId, extra = {}) {
  const slots = await ok(
    `${base}/availability?service=routine-inspection&date=${futureDate()}`,
    who,
  );
  assert.ok(slots.slots.length);
  return ok(
    base + '/bookings',
    who,
    {
      propertyId,
      serviceId: 'routine-inspection',
      startsAt: slots.slots[0].start,
      requestKey: requestKey(),
      access: { method: 'owner', instructions: 'Verified test access', noticeConfirmed: true },
      ...extra,
    },
    201,
  );
}
const past = new Date(Date.now() - 86400000 * 2).toISOString();
const recent = new Date(Date.now() - 86400000).toISOString();
const future = new Date(Date.now() + 86400000 * 2).toISOString();
const all = async (query, ...args) =>
  (
    await sql
      .prepare(query)
      .bind(...args)
      .all()
  ).results;
const count = async (table, where = '', ...args) =>
  (await first(`SELECT COUNT(*) AS n FROM ${table} ${where}`, ...args)).n;
async function webhook(event, status = 200) {
  const raw = JSON.stringify(event),
    time = Math.floor(Date.now() / 1000);
  const response = await mf.dispatchFetch('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': `t=${time},v1=${createHmac('sha256', webhookSecret).update(`${time}.${raw}`).digest('hex')}`,
    },
    body: raw,
  });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}
function stripeEvent(id, type, sessionId, paymentId, clientId, paid = false) {
  return {
    id,
    type,
    livemode: false,
    data: {
      object: {
        id: sessionId,
        mode: 'payment',
        metadata: { payment_id: paymentId, client_id: clientId },
        amount_total: 11000,
        currency: 'aud',
        payment_status: paid ? 'paid' : 'unpaid',
      },
    },
  };
}
try {
  for (const q of JSON.parse(
    execFileSync('python3', ['scripts/schema-statements.py'], { encoding: 'utf8' }),
  ))
    await sql.prepare(q).run();
  for (const q of catalogueSql().split('\n')) await sql.prepare(q).run();
  await run("INSERT INTO schedule_resources VALUES('default','Synthetic capacity',1)");
  await run(
    "UPDATE services SET price_ex_gst_cents=12000,booking_mode='instant' WHERE id='routine-inspection'",
  );
  const admin = await login('admin@continuity.example'),
    owner = await login('owner@continuity.example'),
    dual = await login('dual@continuity.example'),
    outsider = await login('outsider@continuity.example'),
    pmMember = await login('member@continuity.example');
  const adminId = await userId(admin),
    dualId = await userId(dual),
    memberId = await userId(pmMember);
  await run("INSERT INTO staff_profiles VALUES(?,'administrator',1)", adminId);
  // This same person is Staff, a resident and a council member: non-Staff workspaces must remain scoped.
  await run("INSERT INTO staff_profiles VALUES(?,'operations_manager',1)", dualId);
  const client = (
    await ok(
      '/api/onboarding',
      owner,
      { displayName: 'Self manager', clientName: 'Private account' },
      201,
    )
  ).clientId;
  const base = '/api/w/landlord/' + client;
  const propertyId = (
    await ok(
      base + '/properties',
      owner,
      {
        address: '10 Continuity Street',
        suburb: 'Test suburb',
        postcode: '6000',
        propertyType: 'House',
        selfManaged: true,
      },
      201,
    )
  ).propertyId;
  const tenant = await makeTenant(owner, base, propertyId, 'tenant@continuity.example');
  const strataOrg = await organisation(admin, 'strata-manager', 'Synthetic strata operator', admin);
  const scheme = await ok(strataOrg.base + '/schemes', admin, {
    name: 'Synthetic building',
    schemeNumber: 'TEST-CONTINUITY',
    address: '20 Continuity Street',
    suburb: 'Test suburb',
    postcode: '6000',
    authorityReference: 'Synthetic signed agreement',
    validUntil: future,
  });
  const lot = await ok(strataOrg.base + `/schemes/${scheme.id}/structure`, admin, {
    kind: 'lot',
    name: '1',
    buildingId: scheme.buildingId,
  });
  const lot2 = await ok(strataOrg.base + `/schemes/${scheme.id}/structure`, admin, {
    kind: 'lot',
    name: '2',
    buildingId: scheme.buildingId,
  });
  for (const role of ['resident', 'council_member'])
    await run(
      'INSERT INTO scheme_memberships(id,user_id,scheme_id,lot_id,role,starts_at,approved_by) VALUES(?,?,?,?,?,?,?)',
      'dual_' + role,
      dualId,
      scheme.id,
      lot.id,
      role,
      past,
      adminId,
    );
  const buildingBase = '/api/w/building/' + scheme.id,
    councilBase = '/api/w/council/' + scheme.id;
  async function notice(audience = 'residents', overrides = {}) {
    return ok(strataOrg.base + `/schemes/${scheme.id}/notices`, admin, {
      title: 'Scheduled work notice',
      body: 'Approved synthetic building notice for testing.',
      audience,
      startsAt: recent,
      expiresAt: future,
      emailEnabled: true,
      ...overrides,
    });
  }
  async function noticeMail(id, version = 1) {
    for (const e of await all(
      "SELECT id,envelope FROM outbox_events WHERE kind='building.notice_available'",
    )) {
      const job = await unseal(key, `outbox:${e.id}`, e.envelope);
      if (job.notice.id === id && job.notice.version === version) return e.id;
    }
    throw new Error('Missing notice mail ' + id);
  }
  await check(
    'future notice fan-out waits for publication then delivers exactly once',
    async () => {
      const n = await notice('residents', {
        startsAt: new Date(Date.now() + 3600000).toISOString(),
      });
      assert.equal(await count('notice_deliveries', 'WHERE notice_id=?', n.id), 0);
      assert.equal(
        (await ok(buildingBase + `/schemes/${scheme.id}`, dual)).notices.some((x) => x.id === n.id),
        false,
      );
      await run('UPDATE building_notices SET starts_at=? WHERE id=?', recent, n.id); // move fixture clock, not production state
      const ticks = await Promise.all([api('/__test/notice-tick'), api('/__test/notice-tick')]);
      assert.ok(ticks.every((x) => x.status === 200));
      assert.equal(await count('notice_deliveries', 'WHERE notice_id=?', n.id), 1);
      await api('/__test/notice-tick');
      assert.equal(await count('notifications', 'WHERE source_notice_id=?', n.id), 1);
      assert.equal(
        (await ok(buildingBase, dual)).notifications.some((x) => x.id.includes(n.id)),
        true,
      );
      assert.equal(
        (await ok(councilBase, dual)).notifications.some((x) => x.id.includes(n.id)),
        false,
      );
    },
  );
  await check('publication retries reuse the saved notice and reject changed content', async () => {
    const input = {
      requestKey: requestKey(),
      title: 'Idempotent notice',
      body: 'An approved notice should not duplicate on retry.',
      audience: 'residents',
      startsAt: recent,
      expiresAt: future,
    };
    const n = await ok(strataOrg.base + `/schemes/${scheme.id}/notices`, admin, input);
    const retry = await ok(strataOrg.base + `/schemes/${scheme.id}/notices`, admin, input);
    assert.equal(n.id, retry.id);
    assert.equal(retry.replayed, true);
    assert.equal(
      (
        await api(strataOrg.base + `/schemes/${scheme.id}/notices`, {
          cookie: admin.cookie,
          body: { ...input, title: 'Changed instruction' },
        })
      ).status,
      409,
    );
    assert.equal(await count('building_notices', "WHERE title='Idempotent notice'"), 1);
  });
  await check(
    'resident and council notice audiences stay separated for one multi-role identity',
    async () => {
      const c = await notice('council'),
        r = await notice('residents');
      const residentView = await ok(buildingBase + `/schemes/${scheme.id}`, dual),
        councilView = await ok(councilBase + `/schemes/${scheme.id}`, dual);
      assert.ok(residentView.notices.some((x) => x.id === r.id));
      assert.ok(!residentView.notices.some((x) => x.id === c.id));
      assert.ok(councilView.notices.some((x) => x.id === c.id));
      assert.ok(!councilView.notices.some((x) => x.id === r.id));
      const everyone = await notice('all_members');
      assert.equal(
        await count('notice_deliveries', 'WHERE notice_id=? AND user_id=?', everyone.id, dualId),
        1,
      );
      assert.equal(
        (
          await api(`${buildingBase}/schemes/${scheme.id}/notices`, {
            cookie: dual.cookie,
            body: {
              title: 'Denied',
              body: 'Should not be able to publish',
              audience: 'all_members',
            },
          })
        ).status,
        403,
      );
    },
  );
  await check(
    'targeted, expired, ended and unverified membership notices do not leak',
    async () => {
      const otherLot = await notice('residents', { lotId: lot2.id });
      assert.equal(await count('notice_deliveries', 'WHERE notice_id=?', otherLot.id), 0);
      const expired = await notice('residents', { startsAt: past, expiresAt: recent });
      assert.equal(await count('notice_deliveries', 'WHERE notice_id=?', expired.id), 0);
      const unknown = 'not-verified-user';
      await run(
        'INSERT INTO users(id,email,created_at) VALUES(?,?,?)',
        unknown,
        'notverified@continuity.example',
        past,
      );
      await run(
        "INSERT INTO scheme_memberships(id,user_id,scheme_id,lot_id,role,starts_at,approved_by) VALUES('unverified',?,?,?,'resident',?,?)",
        unknown,
        scheme.id,
        lot.id,
        past,
        adminId,
      );
      const excluded = await notice();
      assert.equal(
        await count('notice_deliveries', 'WHERE notice_id=? AND user_id=?', excluded.id, unknown),
        0,
      );
    },
  );
  await check('notice revisions preserve history and suppress stale queued emails', async () => {
    const n = await notice();
    const oldMail = await noticeMail(n.id);
    const changed = await ok(strataOrg.base + `/schemes/${scheme.id}/notices/${n.id}`, admin, {
      version: 1,
      action: 'revise',
      reason: 'Works postponed',
      title: 'Revised works notice',
      body: 'The synthetic works have a revised schedule.',
    });
    assert.equal(changed.version, 2);
    assert.equal(await count('notice_revisions', 'WHERE notice_id=? AND version=1', n.id), 1);
    assert.equal(
      (
        await api(strataOrg.base + `/schemes/${scheme.id}/notices/${n.id}`, {
          cookie: admin.cookie,
          body: { version: 1, action: 'withdraw', reason: 'Stale operator' },
        })
      ).status,
      409,
    );
    await api('/__test/mail/' + oldMail);
    assert.equal(
      (await first('SELECT error_code FROM outbox_events WHERE id=?', oldMail)).error_code,
      'NOTICE_NO_LONGER_AVAILABLE',
    );
    assert.equal(
      (await ok(buildingBase, dual)).notifications.filter((x) => x.id.includes(n.id)).length,
      1,
    );
    const newMail = await noticeMail(n.id, 2);
    await ok(strataOrg.base + `/schemes/${scheme.id}/notices/${n.id}`, admin, {
      version: 2,
      action: 'withdraw',
      reason: 'Works cancelled',
    });
    await api('/__test/mail/' + newMail);
    assert.equal(
      (await first('SELECT status FROM outbox_events WHERE id=?', newMail)).status,
      'failed',
    );
    assert.equal(
      (await ok(buildingBase + `/schemes/${scheme.id}`, dual)).notices.some((x) => x.id === n.id),
      false,
    );
    assert.equal(
      (await ok(buildingBase, dual)).notifications.some((x) => x.id.includes(n.id)),
      false,
    );
  });
  await check(
    'email permission is rechecked after notice creation and membership revocation',
    async () => {
      const n = await notice();
      const mail = await noticeMail(n.id);
      await run("UPDATE scheme_memberships SET ends_at=? WHERE id='dual_resident'", recent);
      await api('/__test/mail/' + mail);
      assert.equal(
        (await first('SELECT error_code FROM outbox_events WHERE id=?', mail)).error_code,
        'NOTICE_NO_LONGER_AVAILABLE',
      );
      assert.equal((await api(buildingBase, { cookie: dual.cookie })).status, 403);
      await run("UPDATE scheme_memberships SET ends_at=NULL WHERE id='dual_resident'");
    },
  );
  await check(
    'bounded notice fan-out resumes without duplicate recipient notifications',
    async () => {
      for (let i = 0; i < 37; i++) {
        const id = 'bulk-user-' + i;
        await run(
          'INSERT INTO users(id,email,created_at,verified_at) VALUES(?,?,?,?)',
          id,
          `${id}@continuity.example`,
          past,
          past,
        );
        await run(
          "INSERT INTO scheme_memberships(id,user_id,scheme_id,lot_id,role,starts_at,approved_by) VALUES(?,?,?,?,'resident',?,?)",
          'bulk-member-' + i,
          id,
          scheme.id,
          lot.id,
          past,
          adminId,
        );
      }
      const n = await notice('residents', { emailEnabled: false });
      for (let i = 0; i < 10; i++) await api('/__test/notice-tick');
      assert.equal(await count('notice_deliveries', 'WHERE notice_id=?', n.id), 38);
      assert.equal(await count('notifications', 'WHERE source_notice_id=?', n.id), 38);
    },
  );
  const bucket = await mf.getR2Bucket('DOCUMENTS');
  async function fixtureDocument(id, kind, recipient, extra = {}) {
    await bucket.put(id, pdf());
    await run(
      "INSERT INTO documents(id,property_id,scheme_id,tenancy_id,title,category,object_key,content_type,size,sha256,status,created_by,created_at,issued_at) VALUES(?,?,?,?,?,'report',?,'application/pdf',30,'fixture-hash','issued',?,?,?)",
      id,
      extra.propertyId ?? null,
      extra.schemeId ?? scheme.id,
      extra.tenancyId ?? null,
      id,
      id,
      adminId,
      recent,
      recent,
    );
    await run(
      'INSERT INTO document_grants(document_id,recipient_kind,recipient_id,created_by,created_at) VALUES(?,?,?,?,?)',
      id,
      kind,
      recipient,
      adminId,
      recent,
    );
  }
  await fixtureDocument('council-document', 'scheme_council', scheme.id);
  await fixtureDocument('resident-document', 'scheme_resident', scheme.id);
  await check(
    'workspace document lists and downloads do not union council resident and staff roles',
    async () => {
      const buildingDocs = (await ok(buildingBase, dual)).documents,
        councilDocs = (await ok(councilBase, dual)).documents;
      assert.deepEqual(
        buildingDocs.map((x) => x.id),
        ['resident-document'],
      );
      assert.deepEqual(
        councilDocs.map((x) => x.id),
        ['council-document'],
      );
      assert.equal(
        (await api(buildingBase + '/documents/council-document/download', { cookie: dual.cookie }))
          .status,
        404,
      );
      assert.equal(
        (await api(councilBase + '/documents/resident-document/download', { cookie: dual.cookie }))
          .status,
        404,
      );
      assert.equal(
        (await api(councilBase + '/documents/council-document/download', { cookie: dual.cookie }))
          .status,
        200,
      );
      assert.equal(
        (await api(staffBase + '/documents/council-document/download', { cookie: dual.cookie }))
          .status,
        200,
      );
      assert.equal(
        (
          await api(buildingBase + '/documents/resident-document/download', {
            cookie: outsider.cookie,
          })
        ).status,
        403,
      );
    },
  );
  await check(
    'one tenancy workspace cannot download a document issued to another tenancy',
    async () => {
      await fixtureDocument('tenancy-document', 'tenancy', tenant.tenancyId, {
        propertyId,
        tenancyId: tenant.tenancyId,
      });
      // Issue after the actual invitation membership began.
      await run(
        'UPDATE documents SET issued_at=? WHERE id=?',
        new Date().toISOString(),
        'tenancy-document',
      );
      assert.equal(
        (await api(tenant.base + '/documents/tenancy-document/download', { cookie: tenant.cookie }))
          .status,
        200,
      );
      const secondProperty = (
        await ok(
          base + '/properties',
          owner,
          {
            address: '11 Continuity Street',
            suburb: 'Test suburb',
            postcode: '6000',
            propertyType: 'House',
            selfManaged: true,
          },
          201,
        )
      ).propertyId;
      await run(
        "INSERT INTO tenancies(id,property_id,status,starts_at) VALUES('second-tenancy',?,'active',?)",
        secondProperty,
        past,
      );
      await run(
        "INSERT INTO tenancy_memberships(id,tenancy_id,user_id,starts_at) VALUES('second-membership','second-tenancy',?,?)",
        await userId(tenant),
        past,
      );
      assert.equal(
        (
          await api('/api/w/tenant/second-tenancy/documents/tenancy-document/download', {
            cookie: tenant.cookie,
          })
        ).status,
        404,
      );
    },
  );
  await check(
    'inspection publication and rescheduling notify the tenant and withdraw obsolete information',
    async () => {
      const b = await book(owner, base, propertyId);
      await ok(base + '/inspections/publish', owner, {
        tenancyId: tenant.tenancyId,
        bookingId: b.id,
        noticeReference: 'Synthetic independently served notice',
      });
      assert.ok(
        (await ok(tenant.base, tenant)).notifications.some(
          (x) => x.title === 'Inspection information available',
        ),
      );
      const slots = await ok(
        `${base}/availability?service=routine-inspection&date=${futureDate()}`,
        owner,
      );
      await ok(`${base}/bookings/${b.id}/change`, owner, {
        action: 'reschedule',
        version: 1,
        startsAt: slots.slots[0].start,
        requestKey: requestKey(),
        reason: 'Synthetic access change',
        accessConfirmed: true,
      });
      const data = await ok(tenant.base, tenant);
      assert.equal(data.inspections.length, 0);
      assert.ok(data.notifications.some((x) => x.title === 'Inspection information withdrawn'));
    },
  );
  const agency = await organisation(admin, 'property-manager', 'Synthetic portfolio', admin);
  await run(
    "INSERT INTO client_memberships(id,client_id,user_id,role,created_at) VALUES('portfolio-member',?,?,'member',?)",
    agency.id,
    memberId,
    past,
  );
  for (let i = 0; i < 33; i++) {
    const id = 'directory-property-' + i,
      address = i === 32 ? '99 100% Court' : String(i).padStart(3, '0') + ' Shared Address';
    await run(
      "INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES(?,?,?,'6000',?,'residential',?)",
      id,
      address,
      'Test suburb',
      id,
      past,
    );
    await run(
      "INSERT INTO property_management_relationships(id,property_id,manager_client_id,mode,starts_at) VALUES(?,?,?,'agency_managed',?)",
      'directory-management-' + i,
      id,
      agency.id,
      past,
    );
    if (i < 3)
      await run(
        'INSERT INTO portfolio_assignments(user_id,property_id,client_id) VALUES(?,?,?)',
        memberId,
        id,
        agency.id,
      );
  }
  await check(
    'portfolio search has exact counts, safe keyset pages and literal wildcard matching',
    async () => {
      const a = await ok(agency.base + '/property-directory?limit=20', admin);
      assert.equal(a.total, 33);
      assert.equal(a.items.length, 20);
      assert.ok(a.next);
      const b = await ok(
        agency.base + '/property-directory?limit=20&after=' + encodeURIComponent(a.next),
        admin,
      );
      assert.equal(b.items.length, 13);
      assert.equal(b.next, null);
      assert.equal(new Set([...a.items, ...b.items].map((x) => x.id)).size, 33);
      assert.equal((await ok(agency.base + '/property-directory?q=%25', admin)).items.length, 1);
      assert.equal(
        (await api(agency.base + '/property-directory?after=bad-cursor', { cookie: admin.cookie }))
          .status,
        422,
      );
      assert.equal((await ok(agency.base, admin)).propertyTotal, 33);
    },
  );
  await check(
    'a cursor and an additional Staff identity never widen portfolio assignments',
    async () => {
      const a = await ok(agency.base + '/property-directory?limit=2', pmMember);
      assert.equal(a.total, 3);
      assert.equal(a.items.length, 2);
      await run("INSERT INTO staff_profiles VALUES(?,'operations_manager',1)", memberId);
      const b = await ok(agency.base + '/property-directory?limit=100', pmMember);
      assert.equal(b.total, 3);
      assert.equal(
        (await api(base + '/property-directory', { cookie: pmMember.cookie })).status,
        403,
      );
      await fixtureDocument('unassigned-portfolio-document', 'client', agency.id, {
        propertyId: 'directory-property-32',
      });
      assert.equal(
        (
          await api(agency.base + '/documents/unassigned-portfolio-document/download', {
            cookie: pmMember.cookie,
          })
        ).status,
        404,
      );
    },
  );
  async function payment(id) {
    await run(
      "INSERT INTO payments(id,client_id,property_id,description,amount_ex_gst_cents,gst_cents,total_cents,status,created_at) VALUES(?,?,?,'Synthetic service',10000,1000,11000,'payment_required',?)",
      id,
      client,
      propertyId,
      recent,
    );
    await ok(base + `/payments/${id}/checkout`, owner, {});
    return (await first('SELECT checkout_session_id FROM payments WHERE id=?', id))
      .checkout_session_id;
  }
  await check('unpaid checkout is pending and cannot start a duplicate payment', async () => {
    const session = await payment('delayed-payment');
    await webhook(
      stripeEvent('evt-unpaid', 'checkout.session.completed', session, 'delayed-payment', client),
    );
    assert.equal(
      (await first("SELECT status FROM payments WHERE id='delayed-payment'")).status,
      'pending',
    );
    const before = checkouts.length;
    assert.equal(
      (await api(base + '/payments/delayed-payment/checkout', { cookie: owner.cookie, body: {} }))
        .status,
      409,
    );
    assert.equal(checkouts.length, before);
    await webhook(
      stripeEvent(
        'evt-delayed-paid',
        'checkout.session.async_payment_succeeded',
        session,
        'delayed-payment',
        client,
        true,
      ),
    );
    assert.equal(
      (await first("SELECT status FROM payments WHERE id='delayed-payment'")).status,
      'paid',
    );
  });
  await check(
    'late expiry failure or unpaid completion cannot undo a successful settlement',
    async () => {
      const session = (
        await first("SELECT checkout_session_id FROM payments WHERE id='delayed-payment'")
      ).checkout_session_id;
      for (const [id, type] of [
        ['evt-late-expire', 'checkout.session.expired'],
        ['evt-late-fail', 'checkout.session.async_payment_failed'],
        ['evt-late-unpaid', 'checkout.session.completed'],
      ])
        await webhook(stripeEvent(id, type, session, 'delayed-payment', client));
      assert.equal(
        (await first("SELECT status FROM payments WHERE id='delayed-payment'")).status,
        'paid',
      );
      assert.equal(
        (await first('SELECT status FROM payment_checkout_attempts WHERE session_id=?', session))
          .status,
        'paid',
      );
    },
  );
  await check('verified expiry and failure release checkout for a controlled retry', async () => {
    const session = await payment('expired-payment');
    await run("UPDATE payments SET checkout_expires_at=? WHERE id='expired-payment'", recent);
    assert.equal(
      (await api(base + '/payments/expired-payment/checkout', { cookie: owner.cookie, body: {} }))
        .status,
      409,
    );
    await webhook(
      stripeEvent('evt-expired', 'checkout.session.expired', session, 'expired-payment', client),
    );
    const p = await first("SELECT * FROM payments WHERE id='expired-payment'");
    assert.equal(p.status, 'payment_required');
    assert.equal(p.checkout_url, null);
    await ok(base + '/payments/expired-payment/checkout', owner, {});
    const next = (
      await first("SELECT checkout_session_id FROM payments WHERE id='expired-payment'")
    ).checkout_session_id;
    assert.notEqual(next, session);
    await webhook(
      stripeEvent(
        'evt-async-failed',
        'checkout.session.async_payment_failed',
        next,
        'expired-payment',
        client,
      ),
    );
    assert.equal(
      (await first("SELECT status FROM payments WHERE id='expired-payment'")).status,
      'failed',
    );
  });
  await check(
    'changed retry receipts and mismatched signed payment amounts are rejected',
    async () => {
      const session = await payment('verified-payment'),
        e = stripeEvent(
          'evt-verified',
          'checkout.session.completed',
          session,
          'verified-payment',
          client,
          true,
        );
      await webhook(
        { ...e, id: 'evt-bad-amount', data: { object: { ...e.data.object, amount_total: 1 } } },
        409,
      );
      await webhook(e);
      assert.equal((await webhook(e)).replayed, true);
      await webhook(
        { ...e, data: { object: { ...e.data.object, payment_status: 'unpaid' } } },
        409,
      );
      assert.equal(
        await count('payment_events', "WHERE payment_id='verified-payment' AND to_status='paid'"),
        1,
      );
    },
  );
  await check(
    'superseded and duplicate settlements enter a Staff-only reconciliation queue',
    async () => {
      const firstSession = await payment('race-payment');
      await webhook(
        stripeEvent(
          'evt-race-expiry',
          'checkout.session.expired',
          firstSession,
          'race-payment',
          client,
        ),
      );
      await ok(base + '/payments/race-payment/checkout', owner, {});
      const secondSession = (
        await first("SELECT checkout_session_id FROM payments WHERE id='race-payment'")
      ).checkout_session_id;
      await webhook(
        stripeEvent(
          'evt-race-old-paid',
          'checkout.session.async_payment_succeeded',
          firstSession,
          'race-payment',
          client,
          true,
        ),
      );
      await webhook(
        stripeEvent(
          'evt-race-new-paid',
          'checkout.session.completed',
          secondSession,
          'race-payment',
          client,
          true,
        ),
      );
      assert.equal(
        (await first("SELECT status FROM payments WHERE id='race-payment'")).status,
        'paid',
      );
      const queue = await ok(staffBase + '/payment-reconciliation', admin);
      assert.equal(queue.items.filter((x) => x.payment_id === 'race-payment').length, 2);
      assert.equal(
        (await api(base + '/payment-reconciliation', { cookie: owner.cookie })).status,
        403,
      );
      const item = queue.items[0];
      await ok(staffBase + `/payment-reconciliation/${item.id}`, admin, {
        reference: 'Verified provider investigation, no automated refund',
      });
      assert.equal(
        (await first('SELECT status FROM payment_reconciliation_items WHERE id=?', item.id)).status,
        'resolved',
      );
    },
  );
  await check(
    'new migrations retain foreign-key integrity and immutable notice history',
    async () => {
      assert.deepEqual(await all('PRAGMA foreign_key_check'), []);
      await assert.rejects(() => run('DELETE FROM notice_revisions'), /AUDIT_IMMUTABLE/);
    },
  );
  writeFileSync(
    'artifacts/continuity-integration.json',
    JSON.stringify(
      {
        checks,
        passed: checks.length,
        environment: 'local Cloudflare runtime; synthetic counterparties',
      },
      null,
      2,
    ),
  );
  console.log(`${checks.length} continuity and cross-workspace checks passed.`);
} finally {
  await mf.dispose();
}
