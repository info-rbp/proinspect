import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
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
const run = (query, ...args) => sql.prepare(query).bind(...args).run();
const first = (query, ...args) => sql.prepare(query).bind(...args).first();

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
try {
  const statements = JSON.parse(
    execFileSync('python3', ['scripts/schema-statements.py'], { encoding: 'utf8' }),
  );
  for (const statement of statements) await sql.prepare(statement).run();
  for (const statement of catalogueSql().split('\n')) await sql.prepare(statement).run();
  await run("INSERT INTO schedule_resources VALUES('default','Test capacity',1)");
  await run("UPDATE services SET price_ex_gst_cents=12000,booking_mode='instant' WHERE id='routine-inspection'");

  await check('anonymous operational calls are rejected', async () => {
    assert.equal((await api('/api/session')).status, 401);
    assert.equal((await api('/api/onboarding', { body: { displayName: 'Unauthorised', clientName: 'Unauthorised' } })).status, 401);
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
    assert.equal((await api('/api/auth/complete', { body: { email: owner.email, token: owner.token } })).status, 400);
    assert.equal((await api('/api/auth/start', { body: { email: 'blocked@example.test' }, headers: { Origin: 'https://evil.example' } })).status, 403);
  });
  const onboarding = { displayName: 'Test Landlord', clientName: 'Test Self Managed' };
  const onboarded = await api('/api/onboarding', { cookie: owner.cookie, body: onboarding });
  assert.equal(onboarded.status, 201);
  const clientId = onboarded.data.clientId;
  const base = `/api/w/landlord/${clientId}`;
  const outsiderClient = (await api('/api/onboarding', { cookie: outsider.cookie, body: { displayName: 'Other Landlord', clientName: 'Other Account' } })).data.clientId;
  await check('onboarding cannot provision staff authority', async () => {
    assert.equal((await first('SELECT count(*) AS n FROM staff_profiles WHERE user_id=?', ownerUser.id)).n, 0);
    assert.equal((await api('/api/w/staff/operations', { cookie: owner.cookie })).status, 403);
  });
  const propertyInput = { address: '24 Example Street', suburb: 'Perth', postcode: '6000', propertyType: 'House', selfManaged: true };
  const created = await api(base + '/properties', { cookie: owner.cookie, body: propertyInput });
  assert.equal(created.status, 201);
  const propertyId = created.data.propertyId;
  await check('an address match does not grant another client access', async () => {
    const response = await api(`/api/w/landlord/${outsiderClient}/properties`, { cookie: outsider.cookie, body: propertyInput });
    assert.equal(response.status, 409);
    assert.equal(response.data.propertyId, undefined);
    assert.equal((await api(base, { cookie: outsider.cookie })).status, 403);
  });
  const date = futureDate();
  const pcrInput = {
    propertyId,
    serviceId: 'property-condition-report',
    requestKey: randomBytes(16).toString('hex'),
    access: { method: 'owner', instructions: 'Synthetic PCR booking test', noticeConfirmed: true },
  };
  const inclusiveId = `sub_inclusive_${clientId}`;
  await check('new Landlord and other customer accounts automatically receive an active all-inclusive plan', async () => {
    const sub = await first('SELECT * FROM subscriptions WHERE client_id=?', clientId);
    assert.equal(sub.id, inclusiveId);
    assert.equal(sub.plan_code, 'all_inclusive');
    assert.equal(sub.status, 'active');
    assert.equal(sub.property_id, null);
    assert.deepEqual(JSON.parse(sub.allowance_json).includedServiceIds, ['*']);
    const outsiderPlan = await first('SELECT plan_code,status FROM subscriptions WHERE client_id=?', outsiderClient);
    assert.equal(outsiderPlan.plan_code, 'all_inclusive');
    assert.equal(outsiderPlan.status, 'active');
    const denied = await api(
      `/api/w/landlord/${outsiderClient}/availability?service=property-condition-report&date=${date}&property=${propertyId}`,
      { cookie: outsider.cookie },
    );
    assert.equal(denied.status, 404);
  });
  await run("UPDATE subscriptions SET status='paused' WHERE id=?", inclusiveId);
  await check('paused subscriptions cannot schedule even though account exists', async () => {
    const d = await api(base, { cookie: owner.cookie });
    assert.deepEqual(d.data.subscriptionBookingServices[propertyId] ?? [], []);
    const slots = await api(
      `${base}/availability?service=property-condition-report&date=${date}&property=${propertyId}`,
      { cookie: owner.cookie },
    );
    assert.equal(slots.status, 200);
    assert.equal(slots.data.slots.length, 0);
    const denied = await api(base + '/bookings', {
      cookie: owner.cookie,
      body: { ...pcrInput, startsAt: `${date}T09:00:00+08:00` },
    });
    assert.equal(denied.status, 409);
  });
  await run("UPDATE subscriptions SET status='active' WHERE id=?", inclusiveId);
  await check('all-inclusive plan books an unpriced PCR without extra payment and creates exactly one Work Order', async () => {
    const data = await api(base, { cookie: owner.cookie });
    assert.ok(data.data.subscriptionBookingServices[propertyId].includes('property-condition-report'));
    assert.ok(data.data.subscriptionBookingServices[propertyId].includes('routine-inspection'));
    const open = await api(
      `${base}/availability?service=property-condition-report&date=${date}&property=${propertyId}`,
      { cookie: owner.cookie },
    );
    assert.equal(open.status, 200);
    assert.ok(open.data.slots.length > 1);
    const booked = await api(base + '/bookings', {
      cookie: owner.cookie,
      body: { ...pcrInput, startsAt: open.data.slots[0].start },
    });
    assert.equal(booked.status, 201, JSON.stringify(booked.data));
    const stored = await first('SELECT * FROM bookings WHERE id=?', booked.data.id);
    assert.equal(stored.price_ex_gst_cents, 0);
    const snapshot = JSON.parse(stored.snapshot_json);
    assert.equal(snapshot.bookingBasis, 'subscription_included');
    assert.equal(snapshot.subscription.id, inclusiveId);
    assert.equal(snapshot.subscription.planCode, 'all_inclusive');
    assert.equal(
      (await first('SELECT booking_id FROM work_orders WHERE id=?', booked.data.workOrderId)).booking_id,
      booked.data.id,
    );
    assert.equal((await first('SELECT COUNT(*) AS n FROM payments WHERE work_order_id=?', booked.data.workOrderId)).n, 0);
    const retry = await api(base + '/bookings', {
      cookie: owner.cookie,
      body: { ...pcrInput, startsAt: open.data.slots[0].start },
    });
    assert.equal(retry.status, 200);
    assert.equal(retry.data.replayed, true);
    // Another date/slot is permitted: there is currently no numeric visit limit.
    const remaining = await api(
      `${base}/availability?service=property-condition-report&date=${date}&property=${propertyId}`,
      { cookie: owner.cookie },
    );
    assert.ok(remaining.data.slots.length);
    const next = await api(base + '/bookings', {
      cookie: owner.cookie,
      body: { ...pcrInput, requestKey: randomBytes(16).toString('hex'), startsAt: remaining.data.slots[0].start },
    });
    assert.equal(next.status, 201, JSON.stringify(next.data));
    assert.equal((await first("SELECT COUNT(*) AS n FROM bookings WHERE service_id='property-condition-report'")).n, 2);
  });
  await run("UPDATE subscriptions SET status='paused' WHERE id=?", inclusiveId);
  await check('pausing the plan prevents later included bookings without deleting existing records', async () => {
    const data = await api(base, { cookie: owner.cookie });
    assert.deepEqual(data.data.subscriptionBookingServices[propertyId], []);
    const checkSlots = await api(
      `${base}/availability?service=property-condition-report&date=${date}&property=${propertyId}`,
      { cookie: owner.cookie },
    );
    assert.equal(checkSlots.data.slots.length, 0);
    const blocked = await api(base + '/bookings', {
      cookie: owner.cookie,
      body: { ...pcrInput, requestKey: randomBytes(16).toString('hex'), startsAt: `${date}T12:00:00+08:00` },
    });
    assert.equal(blocked.status, 409);
    assert.equal((await first("SELECT COUNT(*) AS n FROM bookings WHERE service_id='property-condition-report'")).n, 2);
  });
  await run("UPDATE subscriptions SET status='active' WHERE id=?", inclusiveId);
  const available = await api(`${base}/availability?service=routine-inspection&date=${date}`, { cookie: owner.cookie });
  assert.equal(available.status, 200);
  assert.ok(available.data.slots.length > 0);
  const payload = {
    propertyId,
    serviceId: 'routine-inspection',
    startsAt: available.data.slots[0].start,
    requestKey: randomBytes(16).toString('hex'),
    access: { method: 'lockbox', instructions: 'CONFIDENTIAL-TEST-CODE-9472', noticeConfirmed: false },
  };
  const booking = await api(base + '/bookings', { cookie: owner.cookie, body: payload });
  assert.equal(booking.status, 201, JSON.stringify(booking.data));
  const woId = booking.data.workOrderId;
  await check('booking, work order, secret and outbox are linked', async () => {
    assert.ok(await first('SELECT id FROM work_orders WHERE booking_id=?', booking.data.id));
    const secret = await first('SELECT envelope FROM booking_access_secrets WHERE booking_id=?', booking.data.id);
    assert.ok(!secret.envelope.includes('9472'));
    assert.ok((await first('SELECT count(*) AS n FROM outbox_events')).n >= 2);
  });
  await check('booking retry is idempotent and changed replay rejected', async () => {
    const repeated = await api(base + '/bookings', { cookie: owner.cookie, body: payload });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.id, booking.data.id);
    const changed = await api(base + '/bookings', { cookie: owner.cookie, body: { ...payload, access: { ...payload.access, instructions: 'changed' } } });
    assert.equal(changed.status, 409);
  });
  await check('concurrent reservation has exactly one winner', async () => {
    const remaining = await api(`${base}/availability?service=routine-inspection&date=${date}`, { cookie: owner.cookie });
    const startsAt = remaining.data.slots[0].start;
    const results = await Promise.all([1, 2].map(() => api(base + '/bookings', { cookie: owner.cookie, body: { ...payload, startsAt, requestKey: randomBytes(16).toString('hex') } })));
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  });
  await check('inspector cannot read unassigned access credentials', async () => {
    assert.equal((await api(`/api/w/staff/operations/work-orders/${woId}/access`, { cookie: inspector.cookie })).status, 404);
  });
  const assignment = await api(`/api/w/staff/operations/work-orders/${woId}`, {
    cookie: operator.cookie,
    body: { version: 1, assignedStaffId: inspectorUser.id, status: 'in_progress' },
  });
  assert.equal(assignment.status, 200, JSON.stringify(assignment.data));
  await check('assigned inspector access is audited and stale writes rejected', async () => {
    const access = await api(`/api/w/staff/operations/work-orders/${woId}/access`, { cookie: inspector.cookie });
    assert.equal(access.status, 200);
    assert.equal(access.data.instructions, payload.access.instructions);
    assert.ok(await first("SELECT id FROM audit_events WHERE action='booking.access_viewed'"));
    assert.equal((await api(`/api/w/staff/operations/work-orders/${woId}`, { cookie: operator.cookie, body: { version: 1, status: 'completed' } })).status, 409);
  });
  await check('booking completion requires an issued report', async () => {
    assert.equal((await api(`/api/w/staff/operations/work-orders/${woId}`, { cookie: operator.cookie, body: { version: 2, status: 'completed' } })).status, 409);
  });
  const report = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
  const form = new FormData();
  form.set('title', 'Routine inspection test report');
  form.set('file', new File([report], 'report.pdf', { type: 'application/pdf' }));
  const uploaded = await api(`/api/w/staff/operations/work-orders/${woId}/report`, { cookie: inspector.cookie, body: form });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  await check('issued PDF is downloadable only by an authorised recipient', async () => {
    const read = await api(`/api/documents/${uploaded.data.id}/download`, { cookie: owner.cookie });
    assert.equal(read.status, 200);
    assert.equal(createHash('sha256').update(Buffer.from(read.data)).digest('hex'), createHash('sha256').update(report).digest('hex'));
    assert.equal((await api(`/api/documents/${uploaded.data.id}/download`, { cookie: outsider.cookie })).status, 404);
  });
  await check('report upload retry does not duplicate the record', async () => {
    const retry = await api(`/api/w/staff/operations/work-orders/${woId}/report`, { cookie: inspector.cookie, body: form });
    assert.equal(retry.status, 201);
    assert.equal(retry.data.id, uploaded.data.id);
    assert.equal((await first('SELECT count(*) AS n FROM documents WHERE work_order_id=?', woId)).n, 1);
  });
  await check('completed work synchronises its booking', async () => {
    const updated = await api(`/api/w/staff/operations/work-orders/${woId}`, { cookie: operator.cookie, body: { version: 2, status: 'completed', completionNotes: 'Synthetic test completion' } });
    assert.equal(updated.status, 200);
    assert.equal((await first('SELECT status FROM bookings WHERE id=?', booking.data.id)).status, 'completed');
  });
  const tenancy = await api(base + '/tenancies', {
    cookie: owner.cookie,
    body: { propertyId, email: 'tenant@example.test', startsAt: new Date(Date.now() - 86400000).toISOString() },
  });
  assert.equal(tenancy.status, 201, JSON.stringify(tenancy.data));
  const invitationEvent = await first("SELECT id,envelope FROM outbox_events WHERE kind='tenancy.invited' ORDER BY created_at DESC LIMIT 1");
  const invite = await unseal(key, `outbox:${invitationEvent.id}`, invitationEvent.envelope);
  const inviteToken = new URL(invite.href).searchParams.get('token');
  const tenant = await login('tenant@example.test');
  await check('tenancy invitation is restricted to the verified invited email', async () => {
    assert.equal((await api('/api/invitations/accept', { cookie: outsider.cookie, body: { token: inviteToken } })).status, 400);
    assert.equal((await api('/api/invitations/accept', { cookie: tenant.cookie, body: { token: inviteToken } })).status, 200);
    assert.equal((await api('/api/invitations/accept', { cookie: tenant.cookie, body: { token: inviteToken } })).status, 400);
  });
  const tenantBase = `/api/w/tenant/${tenancy.data.id}`;
  const maintenance = await api(tenantBase + '/requests', {
    cookie: tenant.cookie,
    body: { category: 'maintenance', title: 'Kitchen tap leaking', details: 'Water drips from the kitchen tap continuously.', priority: 'routine' },
  });
  assert.equal(maintenance.status, 201, JSON.stringify(maintenance.data));
  await check('tenant maintenance reaches the manager without exposing complaints', async () => {
    const complaint = await api(tenantBase + '/requests', { cookie: tenant.cookie, body: { category: 'complaint', title: 'Private concern', details: 'A confidential concern for ProInspect to review.', priority: 'routine' } });
    assert.equal(complaint.status, 201);
    const dashboard = await api(base, { cookie: owner.cookie });
    assert.ok(dashboard.data.requests.some(r => r.id === maintenance.data.id));
    assert.ok(!dashboard.data.requests.some(r => r.id === complaint.data.id));
    assert.equal((await api(`/api/documents/${uploaded.data.id}/download`, { cookie: tenant.cookie })).status, 404);
  });
  await check('staff can convert the tenant request to a work order', async () => {
    const converted = await api(`/api/w/staff/operations/requests/${maintenance.data.id}/convert`, { cookie: operator.cookie, body: {} });
    assert.equal(converted.status, 200);
    const twice = await api(`/api/w/staff/operations/requests/${maintenance.data.id}/convert`, { cookie: operator.cookie, body: {} });
    assert.equal(twice.data.id, converted.data.id);
  });
  await check('ended tenancy retains its view but cannot create ordinary requests', async () => {
    await run("UPDATE tenancies SET status='ended',ends_at=? WHERE id=?", new Date(Date.now() - 1000).toISOString(), tenancy.data.id);
    assert.equal((await api(tenantBase, { cookie: tenant.cookie })).status, 200);
    assert.equal((await api(tenantBase + '/requests', { cookie: tenant.cookie, body: { category: 'maintenance', title: 'New request blocked', details: 'This must not be accepted after the tenancy ended.', priority: 'routine' } })).status, 403);
  });
  await check('Residential and Commercial Landlord types create independently scoped, all-inclusive accounts', async () => {
    const wrongType = await api('/api/onboarding', {
      cookie: outsider.cookie,
      body: { displayName: 'No Staff Grant', clientName: 'Unauthorised Staff', landlordType: 'staff' },
    });
    assert.equal(wrongType.status, 422);
    const commercialInput = {
      displayName: 'Test Commercial Owner',
      clientName: 'Self Managed Commercial Premises',
      landlordType: 'commercial',
    };
    const signup = await api('/api/onboarding', { cookie: owner.cookie, body: commercialInput });
    assert.equal(signup.status, 201, JSON.stringify(signup.data));
    assert.equal(signup.data.workspaceKind, 'commercial');
    assert.equal(signup.data.landlordType, 'commercial');
    assert.notEqual(signup.data.clientId, clientId);
    const repeated = await api('/api/onboarding', { cookie: owner.cookie, body: commercialInput });
    assert.equal(repeated.status, 201);
    assert.equal(repeated.data.clientId, signup.data.clientId);
    const state = await first('SELECT client_type FROM clients WHERE id=?', signup.data.clientId);
    assert.equal(state.client_type, 'commercial_landlord');
    const subscription = await first('SELECT status,plan_code,allowance_json FROM subscriptions WHERE client_id=?', signup.data.clientId);
    assert.equal(subscription.status, 'active');
    assert.equal(subscription.plan_code, 'all_inclusive');
    assert.deepEqual(JSON.parse(subscription.allowance_json).includedServiceIds, ['*']);
    const ws = (await api('/api/session', { cookie: owner.cookie })).data.workspaces;
    assert.ok(ws.some(w => w.kind === 'landlord' && w.scopeId === clientId));
    assert.ok(ws.some(w => w.kind === 'commercial' && w.scopeId === signup.data.clientId));
    assert.equal(ws.filter(w => w.scopeId === signup.data.clientId).length, 1);
    assert.equal((await api(`/api/w/landlord/${signup.data.clientId}`, { cookie: owner.cookie })).status, 403);
    assert.equal((await api(`/api/w/commercial/${signup.data.clientId}`, { cookie: outsider.cookie })).status, 403);
    assert.equal((await api(`/api/w/landlord/${clientId}`, { cookie: outsider.cookie })).status, 403);
    assert.equal((await api(`/api/w/commercial/${signup.data.clientId}/properties`, {
      cookie: owner.cookie,
      body: { address: '90 Synthetic Office Street', suburb: 'Perth', postcode: '6000', propertyType: 'House', selfManaged: true },
    })).status, 422);
    assert.equal((await api(base + '/properties', {
      cookie: owner.cookie,
      body: { address: '91 Synthetic House Street', suburb: 'Perth', postcode: '6000', propertyType: 'Office', selfManaged: true },
    })).status, 422);
    const commBase = `/api/w/commercial/${signup.data.clientId}`;
    const added = await api(commBase + '/properties', {
      cookie: owner.cookie,
      body: {
        address: '90 Synthetic Office Street',
        suburb: 'Perth',
        postcode: '6000',
        propertyType: 'Office',
        selfManaged: true,
      },
    });
    assert.equal(added.status, 201, JSON.stringify(added.data));
    const p = await first('SELECT sector,property_type FROM properties WHERE id=?', added.data.propertyId);
    assert.equal(p.sector, 'commercial');
    assert.equal(p.property_type, 'Office');
    const rel = await first('SELECT mode FROM property_management_relationships WHERE property_id=?', added.data.propertyId);
    assert.equal(rel.mode, 'commercial_managed');
    assert.equal((await first('SELECT name FROM portfolio_owners WHERE property_id=?', added.data.propertyId)).name, 'Test Commercial Owner');
    const sectorDenied = await api(`${commBase}/availability?service=property-condition-report&date=${date}&property=${added.data.propertyId}`, {
      cookie: owner.cookie,
    });
    assert.equal(sectorDenied.status, 422);
    const service = await first('SELECT booking_mode,price_ex_gst_cents FROM services WHERE id=?', 'commercial-property-inspection');
    assert.equal(service.booking_mode, 'request');
    assert.equal(service.price_ex_gst_cents, null);
    const covered = (await api(commBase, { cookie: owner.cookie })).data;
    assert.ok(covered.subscriptionBookingServices[added.data.propertyId].includes('commercial-property-inspection'));
    assert.ok(!covered.subscriptionBookingServices[added.data.propertyId].includes('property-condition-report'));
    const open = await api(`${commBase}/availability?service=commercial-property-inspection&date=${date}&property=${added.data.propertyId}`, {
      cookie: owner.cookie,
    });
    assert.equal(open.status, 200, JSON.stringify(open.data));
    assert.ok(open.data.slots.length);
    const booked = await api(commBase + '/bookings', {
      cookie: owner.cookie,
      body: {
        propertyId: added.data.propertyId,
        serviceId: 'commercial-property-inspection',
        startsAt: open.data.slots[0].start,
        requestKey: randomBytes(16).toString('hex'),
        access: { method: 'owner', instructions: 'Synthetic commercial owner visit', noticeConfirmed: true },
      },
    });
    assert.equal(booked.status, 201, JSON.stringify(booked.data));
    const record = await first('SELECT client_id,price_ex_gst_cents,snapshot_json FROM bookings WHERE id=?', booked.data.id);
    assert.equal(record.client_id, signup.data.clientId);
    assert.equal(record.price_ex_gst_cents, 0);
    const snap = JSON.parse(record.snapshot_json);
    assert.equal(snap.bookingBasis, 'subscription_included');
    assert.equal(snap.subscription.planCode, 'all_inclusive');
    assert.equal((await first('SELECT booking_id FROM work_orders WHERE id=?', booked.data.workOrderId)).booking_id, booked.data.id);
    assert.equal((await first('SELECT COUNT(*) AS n FROM payments WHERE work_order_id=?', booked.data.workOrderId)).n, 0);
    assert.ok((await api('/api/w/staff/operations', { cookie: operator.cookie })).data.workOrders.some(o => o.booking_id === booked.data.id));
  });
  await check('audit immutability and database referential integrity hold', async () => {
    await assert.rejects(() => run('DELETE FROM audit_events'));
    assert.equal((await sql.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
  });
  writeFileSync('artifacts/integration-results.json', JSON.stringify({ passed: checks.length, checks }, null, 2));
  console.log(`${checks.length} real Worker/D1/R2/DO integration checks passed.`);
} finally {
  await mf.dispose();
}
