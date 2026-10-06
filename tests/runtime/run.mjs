import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { catalogueSql } from '../../scripts/catalogue-sql.mjs';
import { unseal } from '../../packages/auth/crypto.ts';
mkdirSync('artifacts', { recursive: true });
await build({
  entryPoints: ['tests/runtime/entry.ts'],
  outfile: 'artifacts/api-worker.mjs',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers'],
});
const key = randomBytes(32).toString('base64');
const mf = new Miniflare({
  modules: true,
  scriptPath: 'artifacts/api-worker.mjs',
  compatibilityDate: '2026-07-01',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'integration-db' },
  r2Buckets: { DOCUMENTS: 'integration-documents', RESTRICTED_DOCUMENTS: 'integration-restricted' },
  durableObjects: { SCHEDULER: { className: 'BookingScheduler', useSQLite: true } },
  bindings: {
    APP_ENV: 'local',
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
async function run(query, ...args) {
  return sql
    .prepare(query)
    .bind(...args)
    .run();
}
async function first(query, ...args) {
  return sql
    .prepare(query)
    .bind(...args)
    .first();
}
async function api(path, options = {}) {
  const headers = {
    Origin: 'http://localhost',
    ...(options.cookie ? { Cookie: options.cookie } : {}),
    ...options.headers,
  };
  let body = options.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await mf.dispatchFetch('http://localhost' + path, {
    method: options.method ?? (body ? 'POST' : 'GET'),
    headers,
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
try {
  const statements = JSON.parse(
    execFileSync('python3', ['scripts/schema-statements.py'], { encoding: 'utf8' }),
  );
  for (const statement of statements) await sql.prepare(statement).run();
  for (const statement of catalogueSql().split('\n')) await sql.prepare(statement).run();
  await run("INSERT INTO schedule_resources VALUES('default','Test capacity',1)");
  await run(
    "UPDATE services SET price_ex_gst_cents=12000,booking_mode='instant' WHERE id='routine-inspection'",
  );
  await check('anonymous operational calls are rejected', async () => {
    assert.equal((await api('/api/session')).status, 401);
    assert.equal(
      (
        await api('/api/onboarding', {
          body: { displayName: 'Unauthorised', clientName: 'Unauthorised' },
        })
      ).status,
      401,
    );
  });
  const owner = await login('owner@example.test');
  const outsider = await login('outsider@example.test');
  const operator = await login('operator@example.test');
  const inspector = await login('inspector@example.test');
  const ownerUser = await first('SELECT id FROM users WHERE email=?', owner.email);
  const operatorUser = await first('SELECT id FROM users WHERE email=?', operator.email);
  const inspectorUser = await first('SELECT id FROM users WHERE email=?', inspector.email);
  await run("INSERT INTO staff_profiles VALUES(?,'operations_manager',1)", operatorUser.id);
  await run("INSERT INTO staff_profiles VALUES(?,'inspector',1)", inspectorUser.id);
  await check('magic links are single-use and origin-checked', async () => {
    assert.equal(
      (await api('/api/auth/complete', { body: { email: owner.email, token: owner.token } }))
        .status,
      400,
    );
    assert.equal(
      (
        await api('/api/auth/start', {
          body: { email: 'blocked@example.test' },
          headers: { Origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
  });
  const onboard = await api('/api/onboarding', {
    cookie: owner.cookie,
    body: { displayName: 'Test Landlord', clientName: 'Test Self Managed' },
  });
  assert.equal(onboard.status, 201);
  const clientId = onboard.data.clientId;
  const base = `/api/w/landlord/${clientId}`;
  const outsiderClient = (
    await api('/api/onboarding', {
      cookie: outsider.cookie,
      body: { displayName: 'Other Landlord', clientName: 'Other Account' },
    })
  ).data.clientId;
  await check('onboarding cannot provision staff authority', async () => {
    assert.equal(
      (await first('SELECT count(*) AS n FROM staff_profiles WHERE user_id=?', ownerUser.id)).n,
      0,
    );
    assert.equal((await api('/api/w/staff/operations', { cookie: owner.cookie })).status, 403);
  });
  const created = await api(base + '/properties', {
    cookie: owner.cookie,
    body: {
      address: '24 Example Street',
      suburb: 'Perth',
      postcode: '6000',
      propertyType: 'House',
      selfManaged: true,
    },
  });
  assert.equal(created.status, 201);
  const propertyId = created.data.propertyId;
  await check('an address match does not grant another client access', async () => {
    const r = await api(`/api/w/landlord/${outsiderClient}/properties`, {
      cookie: outsider.cookie,
      body: {
        address: '24 Example Street',
        suburb: 'Perth',
        postcode: '6000',
        propertyType: 'House',
        selfManaged: true,
      },
    });
    assert.equal(r.status, 409);
    assert.equal(r.data.propertyId, undefined);
    assert.equal((await api(base, { cookie: outsider.cookie })).status, 403);
  });
  const date = futureDate();
  const available = await api(`${base}/availability?service=routine-inspection&date=${date}`, {
    cookie: owner.cookie,
  });
  assert.equal(available.status, 200);
  assert.ok(available.data.slots.length > 0);
  const payload = {
    propertyId,
    serviceId: 'routine-inspection',
    startsAt: available.data.slots[0].start,
    requestKey: randomBytes(16).toString('hex'),
    access: {
      method: 'lockbox',
      instructions: 'CONFIDENTIAL-TEST-CODE-9472',
      noticeConfirmed: false,
    },
  };
  const booking = await api(base + '/bookings', { cookie: owner.cookie, body: payload });
  assert.equal(booking.status, 201, JSON.stringify(booking.data));
  const woId = booking.data.workOrderId;
  await check('booking, work order, secret and outbox are linked', async () => {
    assert.ok(await first('SELECT id FROM work_orders WHERE booking_id=?', booking.data.id));
    const secret = await first(
      'SELECT envelope FROM booking_access_secrets WHERE booking_id=?',
      booking.data.id,
    );
    assert.ok(!secret.envelope.includes('9472'));
    assert.equal((await first('SELECT count(*) AS n FROM outbox_events')).n >= 2, true);
  });
  await check('booking retry is idempotent and changed replay rejected', async () => {
    const repeated = await api(base + '/bookings', { cookie: owner.cookie, body: payload });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.id, booking.data.id);
    const changed = await api(base + '/bookings', {
      cookie: owner.cookie,
      body: { ...payload, access: { ...payload.access, instructions: 'changed' } },
    });
    assert.equal(changed.status, 409);
  });
  await check('concurrent reservation has exactly one winner', async () => {
    const remaining = await api(`${base}/availability?service=routine-inspection&date=${date}`, {
      cookie: owner.cookie,
    });
    const next = remaining.data.slots[0].start;
    const results = await Promise.all(
      [1, 2].map(() =>
        api(base + '/bookings', {
          cookie: owner.cookie,
          body: { ...payload, startsAt: next, requestKey: randomBytes(16).toString('hex') },
        }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  });
  await check('inspector cannot read unassigned access credentials', async () => {
    assert.equal(
      (
        await api(`/api/w/staff/operations/work-orders/${woId}/access`, {
          cookie: inspector.cookie,
        })
      ).status,
      404,
    );
  });
  const assignment = await api(`/api/w/staff/operations/work-orders/${woId}`, {
    cookie: operator.cookie,
    body: { version: 1, assignedStaffId: inspectorUser.id, status: 'in_progress' },
  });
  assert.equal(assignment.status, 200, JSON.stringify(assignment.data));
  await check('assigned inspector access is audited and stale writes rejected', async () => {
    const access = await api(`/api/w/staff/operations/work-orders/${woId}/access`, {
      cookie: inspector.cookie,
    });
    assert.equal(access.status, 200);
    assert.equal(access.data.instructions, payload.access.instructions);
    assert.ok(await first("SELECT id FROM audit_events WHERE action='booking.access_viewed'"));
    assert.equal(
      (
        await api(`/api/w/staff/operations/work-orders/${woId}`, {
          cookie: operator.cookie,
          body: { version: 1, status: 'completed' },
        })
      ).status,
      409,
    );
  });
  await check('booking completion requires an issued report', async () => {
    assert.equal(
      (
        await api(`/api/w/staff/operations/work-orders/${woId}`, {
          cookie: operator.cookie,
          body: { version: 2, status: 'completed' },
        })
      ).status,
      409,
    );
  });
  const report = new TextEncoder().encode(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
  );
  const form = new FormData();
  form.set('title', 'Routine inspection test report');
  form.set('file', new File([report], 'report.pdf', { type: 'application/pdf' }));
  const uploaded = await api(`/api/w/staff/operations/work-orders/${woId}/report`, {
    cookie: inspector.cookie,
    body: form,
  });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  await check('issued PDF is downloadable only by an authorised recipient', async () => {
    const read = await api(`/api/documents/${uploaded.data.id}/download`, { cookie: owner.cookie });
    assert.equal(read.status, 200);
    assert.equal(
      createHash('sha256').update(Buffer.from(read.data)).digest('hex'),
      createHash('sha256').update(report).digest('hex'),
    );
    assert.equal(
      (await api(`/api/documents/${uploaded.data.id}/download`, { cookie: outsider.cookie }))
        .status,
      404,
    );
  });
  await check('completed work synchronises its booking', async () => {
    const updated = await api(`/api/w/staff/operations/work-orders/${woId}`, {
      cookie: operator.cookie,
      body: { version: 2, status: 'completed', completionNotes: 'Synthetic test completion' },
    });
    assert.equal(updated.status, 200);
    assert.equal(
      (await first('SELECT status FROM bookings WHERE id=?', booking.data.id)).status,
      'completed',
    );
  });
  const tenancy = await api(base + '/tenancies', {
    cookie: owner.cookie,
    body: {
      propertyId,
      email: 'tenant@example.test',
      startsAt: new Date(Date.now() - 86400000).toISOString(),
    },
  });
  assert.equal(tenancy.status, 201, JSON.stringify(tenancy.data));
  const invitationEvent = await first(
    "SELECT id,envelope FROM outbox_events WHERE kind='tenancy.invited' ORDER BY created_at DESC LIMIT 1",
  );
  const invite = await unseal(key, `outbox:${invitationEvent.id}`, invitationEvent.envelope);
  const inviteToken = new URL(invite.href).searchParams.get('token');
  const tenant = await login('tenant@example.test');
  await check('tenancy invitation is restricted to the verified invited email', async () => {
    assert.equal(
      (
        await api('/api/invitations/accept', {
          cookie: outsider.cookie,
          body: { token: inviteToken },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api('/api/invitations/accept', {
          cookie: tenant.cookie,
          body: { token: inviteToken },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api('/api/invitations/accept', {
          cookie: tenant.cookie,
          body: { token: inviteToken },
        })
      ).status,
      400,
    );
  });
  const tenantBase = `/api/w/tenant/${tenancy.data.id}`;
  const maintenance = await api(tenantBase + '/requests', {
    cookie: tenant.cookie,
    body: {
      category: 'maintenance',
      title: 'Kitchen tap leaking',
      details: 'Water drips from the kitchen tap continuously.',
      priority: 'routine',
    },
  });
  assert.equal(maintenance.status, 201, JSON.stringify(maintenance.data));
  await check('tenant maintenance reaches the manager without exposing complaints', async () => {
    const complaint = await api(tenantBase + '/requests', {
      cookie: tenant.cookie,
      body: {
        category: 'complaint',
        title: 'Private concern',
        details: 'A confidential concern for ProInspect to review.',
        priority: 'routine',
      },
    });
    assert.equal(complaint.status, 201);
    const dashboard = await api(base, { cookie: owner.cookie });
    assert.ok(dashboard.data.requests.some((r) => r.id === maintenance.data.id));
    assert.ok(!dashboard.data.requests.some((r) => r.id === complaint.data.id));
    assert.equal(
      (await api(`/api/documents/${uploaded.data.id}/download`, { cookie: tenant.cookie })).status,
      404,
    );
  });
  await check('staff can convert the tenant request to a work order', async () => {
    const converted = await api(`/api/w/staff/operations/requests/${maintenance.data.id}/convert`, {
      cookie: operator.cookie,
      body: {},
    });
    assert.equal(converted.status, 200);
    const twice = await api(`/api/w/staff/operations/requests/${maintenance.data.id}/convert`, {
      cookie: operator.cookie,
      body: {},
    });
    assert.equal(twice.data.id, converted.data.id);
  });
  await check('ended tenancy retains its view but cannot create ordinary requests', async () => {
    await run(
      "UPDATE tenancies SET status='ended',ends_at=? WHERE id=?",
      new Date(Date.now() - 1000).toISOString(),
      tenancy.data.id,
    );
    assert.equal((await api(tenantBase, { cookie: tenant.cookie })).status, 200);
    assert.equal(
      (
        await api(tenantBase + '/requests', {
          cookie: tenant.cookie,
          body: {
            category: 'maintenance',
            title: 'New request blocked',
            details: 'This must not be accepted after the tenancy ended.',
            priority: 'routine',
          },
        })
      ).status,
      403,
    );
  });
  await check('audit immutability and database referential integrity hold', async () => {
    await assert.rejects(() => run('DELETE FROM audit_events'));
    const violations = await sql.prepare('PRAGMA foreign_key_check').all();
    assert.equal(violations.results.length, 0);
  });
  writeFileSync(
    'artifacts/integration-results.json',
    JSON.stringify({ passed: checks.length, checks }, null, 2),
  );
  console.log(`${checks.length} real Worker/D1/R2/DO integration checks passed.`);
} finally {
  await mf.dispose();
}
