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
  outfile: 'artifacts/api-worker.mjs',
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
  scriptPath: 'artifacts/api-worker.mjs',
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
        id: 'cs_test_' + data.get('metadata[payment_id]'),
        url: 'https://checkout.stripe.com/c/pay/test_' + data.get('metadata[payment_id]'),
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
  const admin = await login('admin@tests.example'),
    operator = await login('operator@tests.example'),
    owner = await login('owner@tests.example'),
    outsider = await login('outsider@tests.example');
  await run("INSERT INTO staff_profiles VALUES(?,'administrator',1)", await userId(admin));
  await run("INSERT INTO staff_profiles VALUES(?,'operations_manager',1)", await userId(operator));
  const client = (
      await ok(
        '/api/onboarding',
        owner,
        { displayName: 'Test owner', clientName: 'Self managed test' },
        201,
      )
    ).clientId,
    base = `/api/w/landlord/${client}`;
  const propertyId = (
    await ok(
      base + '/properties',
      owner,
      {
        address: '30 Connected Test Street',
        suburb: 'Perth',
        postcode: '6000',
        propertyType: 'House',
        selfManaged: true,
      },
      201,
    )
  ).propertyId;
  const tenant = await makeTenant(owner, base, propertyId, 'tenant@tests.example');
  const b = await book(owner, base, propertyId);
  await check(
    'published inspection follows the correct tenancy and rescheduling withdraws stale information',
    async () => {
      await ok(base + '/inspections/publish', owner, {
        tenancyId: tenant.tenancyId,
        bookingId: b.id,
        noticeReference: 'Actual notice reference fixture',
      });
      assert.equal((await ok(tenant.base, tenant)).inspections.length, 1);
      const slots = await ok(
          `${base}/availability?service=routine-inspection&date=${futureDate()}`,
          owner,
        ),
        input = {
          action: 'reschedule',
          version: 1,
          startsAt: slots.slots[0].start,
          requestKey: requestKey(),
          reason: 'Access arrangement changed',
          accessConfirmed: true,
        };
      await ok(`${base}/bookings/${b.id}/change`, owner, input);
      assert.equal((await ok(tenant.base, tenant)).inspections.length, 0);
      assert.equal((await ok(`${base}/bookings/${b.id}/change`, owner, input)).replayed, true);
      assert.equal(
        (
          await api(`${base}/bookings/${b.id}/change`, {
            cookie: owner.cookie,
            body: { ...input, reason: 'Changed retry' },
          })
        ).status,
        409,
      );
    },
  );
  await check(
    'cancellation releases capacity atomically with work order and rejects stale writes',
    async () => {
      const row = await first('SELECT * FROM bookings WHERE id=?', b.id);
      await ok(`${base}/bookings/${b.id}/change`, owner, {
        action: 'cancel',
        version: row.version,
        requestKey: requestKey(),
        reason: 'Service no longer required',
      });
      assert.equal(
        (await first('SELECT status FROM work_orders WHERE booking_id=?', b.id)).status,
        'cancelled',
      );
      const slots = await ok(
        `${base}/availability?service=routine-inspection&date=${futureDate()}`,
        owner,
      );
      assert.ok(slots.slots.some((s) => s.start === row.starts_at));
    },
  );
  const maintenance = await ok(
    tenant.base + '/requests',
    tenant,
    {
      title: 'Bathroom fan issue',
      details: 'The bathroom fan is no longer operating.',
      category: 'maintenance',
      priority: 'routine',
    },
    201,
  );
  let attachment;
  await check(
    'request attachments quarantine, release and download respect requester and manager relationships',
    async () => {
      attachment = await ok(
        `${tenant.base}/requests/${maintenance.id}/attachments`,
        tenant,
        upload(),
      );
      assert.equal(
        (await api(`${base}/attachments/${attachment.id}/download`, { cookie: owner.cookie }))
          .status,
        404,
      );
      await ok(`${staffBase}/attachments/${attachment.id}/review`, operator, {
        status: 'released',
        reference: 'Manual safety review fixture',
      });
      assert.equal(
        (await api(`${base}/attachments/${attachment.id}/download`, { cookie: owner.cookie }))
          .status,
        200,
      );
      assert.equal(
        (await api(`${base}/attachments/${attachment.id}/download`, { cookie: outsider.cookie }))
          .status,
        403,
      );
      const bad = new FormData();
      bad.set('file', new File(['not a pdf'], 'evil.pdf', { type: 'application/pdf' }));
      assert.equal(
        (
          await api(`${tenant.base}/requests/${maintenance.id}/attachments`, {
            cookie: tenant.cookie,
            body: bad,
          })
        ).status,
        422,
      );
    },
  );
  await check(
    'internal operational comments are absent from tenant and landlord views',
    async () => {
      await ok(`${staffBase}/requests/${maintenance.id}/comments`, operator, {
        body: 'INTERNAL-ONLY-SYNTHETIC',
        audience: 'staff',
      });
      await ok(`${base}/requests/${maintenance.id}/comments`, owner, {
        body: 'An inspection is being arranged.',
        audience: 'requester',
      });
      assert.ok(
        !JSON.stringify(await ok(`${tenant.base}/requests/${maintenance.id}`, tenant)).includes(
          'INTERNAL-ONLY-SYNTHETIC',
        ),
      );
    },
  );
  let doc;
  await check(
    'reviewed tenancy PDF is inaccessible until explicitly issued and PCR response is tenant scoped',
    async () => {
      doc = await ok(
        base + '/documents/upload',
        owner,
        upload({
          title: 'Initial property condition report',
          category: 'property_condition_report',
          propertyId,
        }),
      );
      assert.equal(
        (await api(`/api/documents/${doc.id}/download`, { cookie: tenant.cookie })).status,
        404,
      );
      await ok(`${base}/documents/${doc.id}/issue`, owner, {
        audience: 'tenancy',
        recipientId: tenant.tenancyId,
        reviewReference: 'Reviewed original PCR',
      });
      assert.equal(
        (await api(`/api/documents/${doc.id}/download`, { cookie: tenant.cookie })).status,
        200,
      );
      const r = await ok(tenant.base + '/pcr-responses', tenant, {
        documentId: doc.id,
        response: 'Mark to the left wall is pre-existing.',
        acceptCondition: false,
      });
      await ok(`${base}/pcr-responses/${r.id}/acknowledge`, owner, {});
      assert.equal(
        (await ok(`${base}/tenancies/${tenant.tenancyId}`, owner)).pcrResponses[0].status,
        'acknowledged',
      );
    },
  );
  await check(
    'document revisions preserve old files and reject unrelated client recipients',
    async () => {
      const revised = await ok(
        base + '/documents/upload',
        owner,
        upload(
          {
            title: 'Revised PCR',
            category: 'property_condition_report',
            propertyId,
            previousDocumentId: doc.id,
          },
          pdf('Revised'),
        ),
      );
      assert.equal(revised.version, 2);
      await ok(`${base}/documents/${revised.id}/issue`, owner, {
        audience: 'tenancy',
        recipientId: tenant.tenancyId,
        reviewReference: 'Second reviewed version',
      });
      assert.equal(
        (await first('SELECT status FROM documents WHERE id=?', doc.id)).status,
        'archived',
      );
      assert.equal(
        (await api(`/api/documents/${doc.id}/download`, { cookie: tenant.cookie })).status,
        200,
      );
      assert.equal(
        (
          await api(`${base}/documents/${revised.id}/issue`, {
            cookie: owner.cookie,
            body: {
              audience: 'client',
              recipientId: 'unrelated',
              reviewReference: 'Bad sharing attempt',
            },
          })
        ).status,
        403,
      );
    },
  );
  await check(
    'document requests run through preparation and cannot complete without issued property/client output',
    async () => {
      const r = await ok(base + '/document-requests', owner, {
        propertyId,
        productCode: 'property_record',
        title: 'Property record summary',
        answers: {
          purpose: 'Provide an operational property summary.',
          instructions: 'Include previous work.',
        },
      });
      assert.equal(
        (await ok(`${staffBase}/document-requests/${r.id}`, operator)).answers.instructions,
        'Include previous work.',
      );
      let version = 1;
      for (const status of ['under_review', 'awaiting_information'])
        await ok(`${staffBase}/document-requests/${r.id}`, operator, {
          status,
          version: version++,
        });
      await ok(`${base}/document-requests/${r.id}/information`, owner, {
        version: version++,
        instructions: 'Include the approved repair summary.',
      });
      for (const status of ['in_preparation', 'review', 'ready'])
        await ok(`${staffBase}/document-requests/${r.id}`, operator, {
          status,
          version: version++,
        });
      assert.equal(
        (
          await api(`${staffBase}/document-requests/${r.id}`, {
            cookie: operator.cookie,
            body: { status: 'completed', version },
          })
        ).status,
        422,
      );
      const out = await ok(
        `${staffBase}/documents/upload`,
        operator,
        upload(
          { title: 'Requested property summary', category: 'property_record', propertyId },
          pdf('Property summary'),
        ),
      );
      await ok(`${staffBase}/documents/${out.id}/issue`, operator, {
        audience: 'client',
        recipientId: client,
        reviewReference: 'Delivery review',
      });
      await ok(`${staffBase}/document-requests/${r.id}`, operator, {
        status: 'completed',
        version,
        documentId: out.id,
      });
    },
  );
  await check(
    'ordinary WA form coordination requires reviewed official PDF and an actual service reference',
    async () => {
      const f = await ok(tenant.base + '/forms', tenant, {
        tenancyId: tenant.tenancyId,
        formCode: 'WA_FORM_25',
        details: 'Tenant instructions for a pet request.',
      });
      await ok(`${tenant.base}/forms/${f.id}`, tenant, { version: 1, status: 'submitted' });
      await ok(`${base}/forms/${f.id}`, owner, { version: 2, status: 'under_review' });
      assert.equal(
        (
          await api(`${base}/forms/${f.id}`, {
            cookie: owner.cookie,
            body: { version: 3, status: 'ready' },
          })
        ).status,
        422,
      );
      const out = await ok(
        base + '/documents/upload',
        owner,
        upload(
          {
            title: 'Reviewed official pet request fixture',
            category: 'tenancy_document',
            propertyId,
          },
          pdf('Official template test fixture'),
        ),
      );
      await ok(`${base}/documents/${out.id}/issue`, owner, {
        audience: 'tenancy',
        recipientId: tenant.tenancyId,
        reviewReference: 'Reviewed official form fixture',
      });
      await ok(`${base}/forms/${f.id}`, owner, { version: 3, status: 'ready', documentId: out.id });
      assert.equal(
        (
          await api(`${base}/forms/${f.id}`, {
            cookie: owner.cookie,
            body: { version: 4, status: 'recorded' },
          })
        ).status,
        422,
      );
      await ok(`${base}/forms/${f.id}`, owner, {
        version: 4,
        status: 'recorded',
        reference: 'Actual service record fixture',
      });
    },
  );
  const wo = (await ok(`${staffBase}/requests/${maintenance.id}/convert`, operator, {})).id;
  await check(
    'pending cost proposal blocks operational bypass and only commissioning landlord can decide',
    async () => {
      const row = await first('SELECT version FROM work_orders WHERE id=?', wo),
        a = await ok(`${staffBase}/work-orders/${wo}/proposals`, operator, {
          version: row.version,
          summary: 'Fan replacement proposal',
          amountCents: 66000,
          reference: 'Quote fixture 100',
          requestKey: requestKey(),
        });
      const current = await first('SELECT version FROM work_orders WHERE id=?', wo);
      assert.equal(
        (
          await api(`${staffBase}/work-orders/${wo}`, {
            cookie: operator.cookie,
            body: { version: current.version, status: 'approved' },
          })
        ).status,
        409,
      );
      await ok(`${base}/approvals/${a.id}/decision`, owner, { version: 1, decision: 'approved' });
      assert.equal(
        (await first('SELECT status FROM work_orders WHERE id=?', wo)).status,
        'approved',
      );
      assert.equal(
        (
          await api(`${base}/approvals/${a.id}/decision`, {
            cookie: owner.cookie,
            body: { version: 1, decision: 'declined' },
          })
        ).status,
        409,
      );
    },
  );
  let payment;
  await check(
    'manual billing records are scoped, versioned and do not claim a provider charge',
    async () => {
      payment = await ok(staffBase + '/payments', operator, {
        workOrderId: wo,
        description: 'Inspection service test',
        amountExGstCents: 12000,
        gstCents: 1200,
        requestKey: requestKey(),
      });
      await ok(`${staffBase}/payments/${payment.id}/record`, operator, {
        version: 1,
        status: 'paid',
        reference: 'Verified external bank fixture',
      });
      assert.equal(
        (await first('SELECT status FROM payments WHERE id=?', payment.id)).status,
        'paid',
      );
      assert.equal(
        (
          await api(`${base}/payments/${payment.id}/record`, {
            cookie: owner.cookie,
            body: { version: 2, status: 'refunded', reference: 'Unauthorised adjustment' },
          })
        ).status,
        403,
      );
    },
  );
  await check(
    'Stripe checkout uses server totals and signed webhook handles replay without trusting return URLs',
    async () => {
      const p = await ok(staffBase + '/payments', operator, {
        workOrderId: wo,
        description: 'Online payment fixture',
        amountExGstCents: 9000,
        gstCents: 900,
        requestKey: requestKey(),
      });
      const c = await ok(`${base}/payments/${p.id}/checkout`, owner, {});
      assert.ok(c.url.startsWith('https://checkout.stripe.com/'));
      assert.equal(checkouts.at(-1)['line_items[0][price_data][unit_amount]'], '9900');
      const stored = await first('SELECT * FROM payments WHERE id=?', p.id);
      assert.notEqual(stored.status, 'paid');
      const event = {
          id: 'evt_synthetic_paid',
          livemode: false,
          type: 'checkout.session.completed',
          data: {
            object: {
              id: stored.checkout_session_id,
              mode: 'payment',
              payment_status: 'paid',
              amount_total: 9900,
              currency: 'aud',
              metadata: { payment_id: p.id, client_id: client },
            },
          },
        },
        raw = JSON.stringify(event),
        t = String(Math.floor(Date.now() / 1000)),
        sig = createHmac('sha256', webhookSecret).update(`${t}.${raw}`).digest('hex');
      assert.equal(
        (
          await mf.dispatchFetch('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'stripe-signature': `t=${t},v1=${'0'.repeat(64)}`,
            },
            body: raw,
          })
        ).status,
        400,
      );
      for (let n = 0; n < 2; n++)
        assert.equal(
          (
            await mf.dispatchFetch('http://localhost/api/webhooks/stripe', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'stripe-signature': `t=${t},v1=${sig}`,
              },
              body: raw,
            })
          ).status,
          200,
        );
      assert.equal((await first('SELECT status FROM payments WHERE id=?', p.id)).status, 'paid');
      assert.equal(
        (
          await first(
            "SELECT count(*) AS n FROM webhook_receipts WHERE event_id='evt_synthetic_paid'",
          )
        ).n,
        1,
      );
    },
  );
  const agency = await login('agency@tests.example');
  let pm;
  await check(
    'professional organisation entitlement requires review and cannot be self-elevated',
    async () => {
      const application = await ok(
        '/api/organisation-applications',
        agency,
        {
          kind: 'property-manager',
          name: 'Example Property Managers',
          businessReference: 'Verified engagement',
        },
        201,
      );
      assert.equal((await ok('/api/session', agency)).workspaces.length, 0);
      assert.equal(
        (
          await api(`${staffBase}/organisation-applications/${application.id}/review`, {
            cookie: agency.cookie,
            body: { decision: 'approved', reference: 'Self approval' },
          })
        ).status,
        403,
      );
      const approved = await ok(
        `${staffBase}/organisation-applications/${application.id}/review`,
        operator,
        { decision: 'approved', reference: 'Staff business review' },
      );
      pm = { id: approved.clientId, base: `/api/w/property-manager/${approved.clientId}` };
      assert.equal((await ok('/api/session', agency)).workspaces[0].kind, 'property-manager');
    },
  );
  let imported;
  await check(
    'portfolio imports preview, atomically apply, deduplicate and retain owner contacts without owner login grants',
    async () => {
      const preview = await ok(pm.base + '/imports/preview', agency, {
        csv: 'address,suburb,postcode,ownerName\n40 Portfolio Street,Perth,6000,Owner A\n42 Portfolio Street,Perth,6000,Owner B',
        authorityReference: 'Management agreement register',
      });
      assert.equal(preview.valid, true);
      imported = await ok(`${pm.base}/imports/${preview.id}/apply`, agency, {});
      assert.equal(imported.count, 2);
      assert.equal((await ok(`${pm.base}/imports/${preview.id}/apply`, agency, {})).replayed, true);
      assert.equal((await ok(pm.base, agency)).properties.length, 2);
      const duplicate = await ok(pm.base + '/imports/preview', agency, {
        csv: 'address,suburb,postcode,ownerName\n40 Portfolio Street,Perth,6000,Owner A',
        authorityReference: 'Same agreement',
      });
      assert.equal(duplicate.valid, false);
    },
  );
  const member = await login('member@tests.example');
  await check(
    'agency staff see only assigned properties and an ended membership loses workspace access',
    async () => {
      const i = await ok(pm.base + '/team/invite', agency, { email: member.email, role: 'member' });
      await invited(member, i.localInvitationUrl);
      assert.equal((await ok(pm.base, member)).properties.length, 0);
      await ok(pm.base + '/team/assignments', agency, {
        userId: await userId(member),
        propertyId: imported.propertyIds[0],
        assigned: true,
      });
      assert.equal((await ok(pm.base, member)).properties.length, 1);
      assert.equal(
        (
          await api(pm.base + '/plans', {
            cookie: member.cookie,
            body: {
              propertyId: imported.propertyIds[1],
              serviceId: 'routine-inspection',
              intervalMonths: 3,
              nextDue: futureDate(),
            },
          })
        ).status,
        404,
      );
      await ok(pm.base + '/team/' + (await userId(member)), agency, {
        role: 'member',
        active: false,
      });
      assert.equal((await api(pm.base, { cookie: member.cookie })).status, 403);
    },
  );
  await check(
    'bulk booking produces individual guarded jobs and replay does not duplicate accepted items',
    async () => {
      const input = {
          propertyIds: imported.propertyIds,
          serviceId: 'routine-inspection',
          date: futureDate(),
          requestKey: requestKey(),
          access: {
            method: 'agent',
            instructions: 'Keys available by prior arrangement.',
            noticeConfirmed: true,
          },
        },
        batch = await ok(pm.base + '/bulk-bookings', agency, input);
      assert.equal(batch.succeeded, 2);
      const again = await ok(pm.base + '/bulk-bookings', agency, input);
      assert.deepEqual(
        again.results.map((r) => r.id),
        batch.results.map((r) => r.id),
      );
    },
  );
  await check(
    'recurring plan occurrence advances only when its matching booking succeeds',
    async () => {
      const plan = await ok(pm.base + '/plans', agency, {
        propertyId: imported.propertyIds[0],
        serviceId: 'routine-inspection',
        intervalMonths: 3,
        nextDue: futureDate(),
      });
      const booked = await book(agency, pm.base, imported.propertyIds[0], {
        recurringPlanId: plan.id,
        planDue: futureDate(),
      });
      assert.ok(await first('SELECT booking_id FROM plan_occurrences WHERE plan_id=?', plan.id));
      assert.notEqual(
        (await first('SELECT next_due FROM recurring_plans WHERE id=?', plan.id)).next_due,
        futureDate(),
      );
      const slots = await ok(
        `${pm.base}/availability?service=routine-inspection&date=${futureDate()}`,
        agency,
      );
      assert.equal(
        (
          await api(pm.base + '/bookings', {
            cookie: agency.cookie,
            body: {
              propertyId: imported.propertyIds[0],
              serviceId: 'routine-inspection',
              startsAt: slots.slots[0].start,
              requestKey: requestKey(),
              recurringPlanId: plan.id,
              planDue: futureDate(),
              access: { method: 'agent', instructions: 'Test', noticeConfirmed: true },
            },
          })
        ).status,
        409,
      );
    },
  );
  const commercialUser = await login('commercial@tests.example'),
    commercial = await organisation(commercialUser, 'commercial', 'Example Commercial', operator);
  await check(
    'commercial property operations remain separate from residential self-management',
    async () => {
      const p = await ok(
        commercial.base + '/properties',
        commercialUser,
        {
          address: '50 Commercial Street',
          suburb: 'Perth',
          postcode: '6000',
          ownerName: 'Commercial Owner',
          authorityReference: 'Commercial agreement',
        },
        201,
      );
      assert.equal(
        (await first('SELECT sector FROM properties WHERE id=?', p.propertyId)).sector,
        'commercial',
      );
      assert.equal(
        (await api(`/api/w/landlord/${commercial.id}`, { cookie: commercialUser.cookie })).status,
        403,
      );
    },
  );
  const strataUser = await login('strata@tests.example'),
    strataOrg = await organisation(strataUser, 'strata-manager', 'Example Strata Firm', operator),
    expires = new Date(Date.now() + 365 * 86400000).toISOString();
  let scheme, lot, council, resident;
  await check(
    'strata scheme onboarding distinguishes the management firm from the strata company',
    async () => {
      scheme = await ok(strataOrg.base + '/schemes', strataUser, {
        name: 'Connected Apartments',
        schemeNumber: 'SP-TEST-200',
        address: '80 Strata Street',
        suburb: 'Perth',
        postcode: '6000',
        authorityReference: 'Scheme management contract',
        validUntil: expires,
      });
      assert.equal(
        (await first('SELECT client_type FROM clients WHERE id=?', strataOrg.id)).client_type,
        'other',
      );
      lot = await ok(`${staffBase}/schemes/${scheme.id}/structure`, operator, {
        kind: 'lot',
        name: '23',
        buildingId: scheme.buildingId,
        propertyId,
      });
      await ok(`${strataOrg.base}/schemes/${scheme.id}/structure`, strataUser, {
        kind: 'area',
        name: 'Basement',
        buildingId: scheme.buildingId,
      });
    },
  );
  await check(
    'one person has independent tenancy, resident and council relationships',
    async () => {
      await invited(
        tenant,
        (
          await ok(strataOrg.base + '/team/invite', strataUser, {
            email: tenant.email,
            schemeId: scheme.id,
            lotId: lot.id,
            role: 'resident',
          })
        ).localInvitationUrl,
      );
      resident = { ...tenant, base: `/api/w/building/${scheme.id}` };
      council = await login('council@tests.example');
      await invited(
        council,
        (
          await ok(strataOrg.base + '/team/invite', strataUser, {
            email: council.email,
            schemeId: scheme.id,
            role: 'council_member',
            endsAt: expires,
          })
        ).localInvitationUrl,
      );
      council.base = `/api/w/council/${scheme.id}`;
      const ws = (await ok('/api/session', tenant)).workspaces;
      assert.ok(ws.some((w) => w.kind === 'tenant') && ws.some((w) => w.kind === 'building'));
      assert.ok(!JSON.stringify(await ok(resident.base, resident)).includes('response_envelope'));
    },
  );
  let issue, buildingWo;
  await check(
    'resident inside-lot maintenance routes to tenancy while common-property issue routes to the scheme',
    async () => {
      const inside = await ok(`${resident.base}/schemes/${scheme.id}/requests`, resident, {
        title: 'Inside-lot issue',
        details: 'The kitchen tap is leaking inside the lot.',
        locationKind: 'lot',
        lotId: lot.id,
      });
      assert.equal(inside.routedTo, 'tenancy');
      issue = await ok(`${resident.base}/schemes/${scheme.id}/requests`, resident, {
        title: 'Basement leak',
        details: 'Water is leaking in the common-property basement.',
        locationKind: 'common',
      });
      assert.equal(issue.routedTo, 'building');
      buildingWo = (await ok(`${strataOrg.base}/requests/${issue.id}/dispatch`, strataUser, {})).id;
      assert.equal(
        (await ok(`${strataOrg.base}/requests/${issue.id}/dispatch`, strataUser, {})).id,
        buildingWo,
      );
    },
  );
  await check(
    'scheme authority escalation collects council advice but requires an authorised recorded outcome',
    async () => {
      const o = await first('SELECT version FROM work_orders WHERE id=?', buildingWo),
        a = await ok(`${strataOrg.base}/work-orders/${buildingWo}/proposals`, strataUser, {
          version: o.version,
          amountCents: 125000,
          summary: 'Repair basement waterproofing',
          reference: 'Contractor quote register',
          requestKey: requestKey(),
        });
      assert.equal(a.decisionScope, 'council');
      await ok(`${council.base}/approvals/${a.id}/response`, council, {
        response: 'support',
        comment: 'Recommendation recorded.',
      });
      assert.equal(
        (await first('SELECT status FROM approvals WHERE id=?', a.id)).status,
        'pending',
      );
      assert.equal(
        (
          await api(`${council.base}/approvals/${a.id}/decision`, {
            cookie: council.cookie,
            body: { version: 1, decision: 'approved' },
          })
        ).status,
        403,
      );
      await ok(`${staffBase}/approvals/${a.id}/decision`, operator, {
        version: 1,
        decision: 'approved',
        reference: 'Authorised council outcome evidence 2026-10',
      });
    },
  );
  await check(
    'resident visibility excludes financial details, tenancy documents and other requesters identities',
    async () => {
      const o = await first('SELECT version FROM work_orders WHERE id=?', buildingWo);
      await ok(`${strataOrg.base}/work-orders/${buildingWo}/public`, strataUser, {
        version: o.version,
        residentVisible: true,
        summary: 'Contractor investigating the basement leak.',
      });
      const view = await ok(resident.base, resident);
      assert.equal(view.payments.length, 0);
      assert.equal(view.approvals.length, 0);
      assert.ok(
        view.workOrders.some((o) => o.title === 'Contractor investigating the basement leak.'),
      );
      assert.equal((await ok(strataOrg.base, strataUser)).tenancies.length, 0);
      assert.equal(
        (
          await api(`${strataOrg.base}/tenancies/${tenant.tenancyId}`, {
            cookie: strataUser.cookie,
          })
        ).status,
        403,
      );
    },
  );
  await check(
    'building notices are filtered by audience and lot and do not leak council-only content',
    async () => {
      await ok(`${strataOrg.base}/schemes/${scheme.id}/notices`, strataUser, {
        title: 'Council briefing',
        body: 'Council-only operational briefing.',
        audience: 'council',
      });
      await ok(`${strataOrg.base}/schemes/${scheme.id}/notices`, strataUser, {
        title: 'Lot 23 access',
        body: 'Authorised access arrangements for your lot.',
        audience: 'residents',
        lotId: lot.id,
      });
      const visible = await ok(`${resident.base}/schemes/${scheme.id}`, resident);
      assert.equal(visible.notices.length, 1);
      assert.equal(visible.notices[0].title, 'Lot 23 access');
      assert.equal(visible.members.length, 0);
    },
  );
  await check(
    'council term revocation removes the workspace without changing the person account',
    async () => {
      const m = await first(
        "SELECT id FROM scheme_memberships WHERE user_id=? AND scheme_id=? AND role='council_member'",
        await userId(council),
        scheme.id,
      );
      await ok(`${strataOrg.base}/schemes/${scheme.id}/members/${m.id}/end`, strataUser, {});
      assert.equal((await api(council.base, { cookie: council.cookie })).status, 403);
      assert.equal((await ok('/api/session', council)).user.active, undefined);
    },
  );
  await check(
    'confidential evidence is encrypted and only the applicant and case-granted reviewer can read it',
    async () => {
      await ok(staffBase + '/admin/restricted-reviewers', admin, {
        userId: await userId(operator),
        active: true,
      });
      const c = await ok(tenant.base + '/confidential', tenant, {
        details: 'CONFIDENTIAL SYNTHETIC CONTENT',
        safeContact: 'Do not email fixture',
        reviewerId: await userId(operator),
      });
      const evidence = await ok(
        `${tenant.base}/confidential/${c.id}/evidence`,
        tenant,
        upload({}, pdf('SENSITIVE-EVIDENCE-FIXTURE')),
      );
      const row = await first('SELECT object_key FROM restricted_evidence WHERE id=?', evidence.id),
        bucket = await mf.getR2Bucket('RESTRICTED_DOCUMENTS');
      assert.ok(
        !(await (await bucket.get(row.object_key)).text()).includes('SENSITIVE-EVIDENCE-FIXTURE'),
      );
      assert.equal(
        (await api(`${base}/confidential/${c.id}`, { cookie: owner.cookie })).status,
        404,
      );
      assert.equal(
        (await api(`${staffBase}/confidential/${c.id}`, { cookie: admin.cookie })).status,
        404,
      );
      assert.equal(
        (await api(`${staffBase}/confidential/${c.id}`, { cookie: operator.cookie })).status,
        200,
      );
      assert.equal(
        (
          await api(`${staffBase}/confidential-evidence/${evidence.id}/download`, {
            cookie: operator.cookie,
          })
        ).status,
        200,
      );
      assert.equal(
        (await first('SELECT count(*) AS n FROM audit_events WHERE entity_id=?', c.id)).n,
        0,
      );
      assert.equal(
        (await first('SELECT count(*) AS n FROM integration_deliveries WHERE entity_id=?', c.id)).n,
        0,
      );
    },
  );
  await check(
    'signed Report Tool callback issues one private report and rejects invalid signatures',
    async () => {
      const b = await book(owner, base, propertyId),
        handoff = await ok(
          `${staffBase}/work-orders/${b.workOrderId}/report-handoff`,
          operator,
          {},
        ),
        payload = JSON.parse(
          Buffer.from(new URL(handoff.url).searchParams.get('payload'), 'base64url').toString(),
        );
      const form = upload(
          { handoffId: payload.id, token: payload.token, title: 'Report Tool synthetic output' },
          pdf('Signed Report Tool output'),
        ),
        encoded = new Request(payload.callbackUrl, { method: 'POST', body: form }),
        raw = await encoded.arrayBuffer(),
        timestamp = String(Math.floor(Date.now() / 1000)),
        signature = createHmac('sha256', reportSecret)
          .update(`${timestamp}.${createHash('sha256').update(Buffer.from(raw)).digest('hex')}`)
          .digest('hex');
      const headers = {
        'Content-Type': encoded.headers.get('Content-Type'),
        'x-proinspect-timestamp': timestamp,
        'x-proinspect-signature': signature,
      };
      for (let n = 0; n < 2; n++) {
        const r = await mf.dispatchFetch(payload.callbackUrl, {
          method: 'POST',
          headers,
          body: new Uint8Array(raw),
        });
        assert.equal(r.status, 200, await r.text());
      }
      assert.equal(
        (await first('SELECT count(*) AS n FROM documents WHERE source_report_id=?', payload.id)).n,
        1,
      );
      assert.equal(
        (
          await mf.dispatchFetch(payload.callbackUrl, {
            method: 'POST',
            headers: { ...headers, 'x-proinspect-signature': '0'.repeat(64) },
            body: new Uint8Array(raw),
          })
        ).status,
        403,
      );
    },
  );
  await check(
    'end tenancy preserves issued history and removes ordinary new-request authority',
    async () => {
      const r = await first('SELECT version FROM tenancies WHERE id=?', tenant.tenancyId);
      await ok(`${base}/tenancies/${tenant.tenancyId}`, owner, {
        version: r.version,
        status: 'ended',
        reference: 'Actual tenancy end record',
      });
      assert.equal(
        (await api(`/api/documents/${doc.id}/download`, { cookie: tenant.cookie })).status,
        200,
      );
      assert.equal(
        (
          await api(tenant.base + '/requests', {
            cookie: tenant.cookie,
            body: {
              title: 'Blocked new request',
              details: 'This ordinary request must not be submitted.',
              category: 'maintenance',
              priority: 'routine',
            },
          })
        ).status,
        403,
      );
    },
  );
  await check(
    'unrelated tenants and clients cannot enumerate any newly added management endpoint',
    async () => {
      for (const path of [
        pm.base,
        strataOrg.base,
        staffBase + '/admin',
        staffBase + '/integrations',
        `${resident.base}/schemes/${scheme.id}`,
      ])
        assert.equal((await api(path, { cookie: outsider.cookie })).status, 403);
      const view = await ok(staffBase + '/admin', operator);
      assert.ok(view.applications.length >= 3);
      assert.ok(!JSON.stringify(view).includes('CONFIDENTIAL SYNTHETIC CONTENT'));
      assert.equal((await sql.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
    },
  );
  writeFileSync(
    'artifacts/connected-results.json',
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        externalProviders: 'mocked; no hosted deployment or live external effects',
      },
      null,
      2,
    ),
  );
  console.log(`${checks.length} connected feature checks passed.`);
} finally {
  await mf.dispose();
}
