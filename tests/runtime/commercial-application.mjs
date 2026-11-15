import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { unseal } from '../../packages/auth/crypto.ts';
mkdirSync('artifacts', { recursive: true });
await build({
  entryPoints: ['tests/runtime/commercial-application-entry.ts'],
  outfile: 'artifacts/commercial-application-worker.mjs',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers', 'node:*'],
});
const key = randomBytes(32).toString('base64'),
  secret = 'synthetic-commercial-provider-secret-2026-11-15',
  scans = [],
  deliveries = [];
const hmac = (time, raw) =>
  'sha256=' +
  createHmac('sha256', secret)
    .update(time + '.' + raw)
    .digest('hex');
let providerUncertain = false;
const mf = new Miniflare({
  modules: true,
  scriptPath: 'artifacts/commercial-application-worker.mjs',
  compatibilityDate: '2026-07-01',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'synthetic-commercial-application' },
  r2Buckets: { RESTRICTED_DOCUMENTS: 'synthetic-commercial-private' },
  bindings: {
    APP_ENV: 'local',
    APP_ORIGIN: 'http://localhost',
    DATA_ENCRYPTION_KEY: key,
    EMAIL_PROVIDER: 'local',
    COMMERCIAL_APPLICATIONS_ENABLED: 'true',
    COMMERCIAL_APPLICATION_SCANNER_ENABLED: 'true',
    COMMERCIAL_APPLICATION_HANDOFF_ENABLED: 'true',
    COMMERCIAL_SCANNER_ENDPOINT: 'https://scanner.example.invalid/scan',
    COMMERCIAL_SCANNER_ALLOWED_HOST: 'scanner.example.invalid',
    COMMERCIAL_SCANNER_TOKEN: secret,
    COMMERCIAL_SCANNER_WEBHOOK_SECRET: secret,
    COMMERCIAL_HANDOFF_ENDPOINT: 'https://handoff.example.invalid/intake',
    COMMERCIAL_HANDOFF_ALLOWED_HOST: 'handoff.example.invalid',
    COMMERCIAL_HANDOFF_SECRET: secret,
    COMMERCIAL_RETENTION_DRAFT_DAYS: '30',
    COMMERCIAL_RETENTION_SUBMITTED_DAYS: '180',
    COMMERCIAL_RETENTION_WITHDRAWN_DAYS: '30',
  },
  outboundService: async (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'scanner.example.invalid') {
      assert.equal(request.headers.get('Authorization'), 'Bearer ' + secret);
      const bytes = await request.arrayBuffer();
      assert(bytes.byteLength > 5);
      scans.push({
        applicationId: request.headers.get('X-ProInspect-Application'),
        documentId: request.headers.get('X-ProInspect-Document'),
        sha256: request.headers.get('X-ProInspect-SHA256'),
      });
      return new Response(null, { status: 202 });
    }
    assert.equal(url.hostname, 'handoff.example.invalid', 'No unapproved outbound requests');
    const raw = await request.text();
    assert.equal(
      request.headers.get('X-ProInspect-Signature'),
      hmac(request.headers.get('X-ProInspect-Time'), raw),
    );
    const payload = JSON.parse(raw);
    deliveries.push(payload);
    assert.equal(payload.noEmailAttachments, true);
    assert.ok(!raw.includes('PRIVATE-ADDRESS'));
    if (providerUncertain) return new Response('Uncertain fixture', { status: 502 });
    const time = String(Math.floor(Date.now() / 1000)),
      receipt = JSON.stringify({
        accepted: true,
        idempotencyKey: payload.idempotencyKey,
        recipientHash: payload.recipientHash,
        messageReference: 'synthetic-ack-' + deliveries.length,
      });
    return new Response(receipt, {
      headers: {
        'Content-Type': 'application/json',
        'X-ProInspect-Time': time,
        'X-ProInspect-Signature': hmac(time, receipt),
      },
    });
  },
});
const db = await mf.getD1Database('DB'),
  run = (sql, ...args) =>
    db
      .prepare(sql)
      .bind(...args)
      .run(),
  first = (sql, ...args) =>
    db
      .prepare(sql)
      .bind(...args)
      .first(),
  checks = [];
async function call(path, body = {}, expected = 200) {
  const response = await mf.dispatchFetch('http://localhost' + path, {
    method: 'POST',
    headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const value = await response.json();
  assert.equal(response.status, expected, path + ' ' + JSON.stringify(value).slice(0, 300));
  return value;
}
async function check(label, fn) {
  await fn();
  checks.push(label);
  console.log('PASS ' + label);
}
async function privateLink(email) {
  const rows = await db
    .prepare(
      "SELECT id,envelope FROM outbox_events WHERE kind='commercial.application.private_link' ORDER BY created_at DESC,id DESC",
    )
    .all();
  for (const row of rows.results) {
    const m = await unseal(key, 'outbox:' + row.id, row.envelope);
    if (m.to === email) return new URL(m.href).pathname.split('/').pop();
  }
  throw Error('No matching private synthetic invitation');
}
let session, otherSession, flowId, appId, primaryId, otherId, receipt;
try {
  for (const sql of JSON.parse(
    execFileSync('python3', ['scripts/schema-statements.py'], { encoding: 'utf8' }),
  ))
    await db.prepare(sql).run();
  const stamp = '2026-11-15T00:00:00.000Z';
  for (const [id, role] of [
    ['usr_cm_a', 'administrator'],
    ['usr_cm_b', 'administrator'],
    ['usr_rental_only', 'operations_manager'],
  ]) {
    await run(
      'INSERT INTO users(id,email,active,verified_at,created_at) VALUES(?,?,1,?,?)',
      id,
      id + '@example.invalid',
      stamp,
      stamp,
    );
    await run('INSERT INTO staff_profiles(user_id,role,active) VALUES(?,?,1)', id, role);
  }
  await run(
    "INSERT INTO clients(id,name,client_type,status,created_at) VALUES('cli_cm_synthetic','Synthetic commercial owner','commercial_landlord','active',?)",
    stamp,
  );
  await run(
    "INSERT INTO properties(id,address,suburb,state,postcode,address_key,sector,created_at) VALUES('prop_cm_synthetic','12 Synthetic Avenue','Perth','WA','6000','synthetic-cm-address','commercial',?)",
    stamp,
  );
  await run(
    "INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES('lcp_cm_synthetic','cli_cm_synthetic','prop_cm_synthetic','landlord',?)",
    stamp,
  );
  await run(
    "INSERT INTO leasing_listings(id,property_id,instructed_by_client_id,kind,slug,title,description,display_address,suburb,postcode,agent_name,agent_role,created_by,status,created_at,updated_at) VALUES('lst_cm_synthetic','prop_cm_synthetic','cli_cm_synthetic','commercial','synthetic-commercial','Synthetic commercial premises','Fictional property for isolated application acceptance only.','12 Synthetic Avenue','Perth','6000','Synthetic Lessor','landlord','usr_cm_a','published',?,?)",
    stamp,
    stamp,
  );
  await check('listing-specific authority and independent review are required', async () => {
    await run("INSERT INTO property_application_management(property_id,provider,authority_reference,updated_by,updated_at) VALUES('prop_cm_synthetic','proinspect','SYNTHETIC-MANAGEMENT-AUTHORITY','usr_cm_a',?)",stamp);
    const draftInput = {
        listingId: 'lst_cm_synthetic',
        managedByProInspect: true,
        authorityReference: 'SYNTHETIC-SIGNED-AUTHORITY',
        recipient: 'lessor@example.invalid',
        privacyVersion: 'synthetic-privacy-v1',
        collectionNotice:
          'Synthetic private collection notice for application assessment only. Recipients are the named synthetic lessor and permitted private providers; access, correction, withdrawal and reviewed erasure are available. This fixture is never production acceptance.',
        providerDisclosure:
          'Synthetic allowlisted scanner and handoff provider only; no real PII or external email.',
        guarantee: 'required',
        securityRequirements: 'Synthetic proposed guarantee assessment; no guarantee is executed.',
        retention: { draft: 30, submitted: 180, withdrawn: 30 },
    };
    await call('/draft-flow', {input:{...draftInput,managedByProInspect:false}},422);
    const flow = await call('/draft-flow', {input:draftInput});
    flowId = flow.id;
    const row = await first(
        "SELECT id,envelope FROM outbox_events WHERE kind='commercial.recipient.verify' ORDER BY created_at DESC LIMIT 1",
      ),
      mail = await unseal(key, 'outbox:' + row.id, row.envelope);
    const token = new URL(mail.href).pathname.split('/').pop();
    await call('/verify-recipient', { token });
    const input = {
      configHash: flow.configHash,
      reference: 'SYNTHETIC-INDEPENDENT-REVIEW',
      authorityVerified: true,
      privacyAndRetentionApproved: true,
      providerProcessingApproved: true,
    };
    await call('/approve-flow', { flowId, input }, 409);
    await call('/approve-flow', { flowId, input, staffId: 'usr_cm_b' });
    await call('/grant', {
      input: {
        userId: 'usr_cm_a',
        configure: true,
        review: true,
        reference: 'SYNTHETIC-COMMERCIAL-PERMISSION',
      },
    });
    assert.equal((await call('/gate', { disabled: true })).ready, false);
  });
  await check(
    'single-use email links exchange into private sessions and cannot replay',
    async () => {
      await call('/begin', {
        flowId,
        input: { name: 'Lead invitation', email: 'lead@example.invalid', consent: true },
      });
      const token = await privateLink('lead@example.invalid');
      session = (await call('/exchange', { token })).session;
      await call('/exchange', { token }, 404);
      const page = await call('/page', { session });
      primaryId = page.personId;
      appId = (
        await first('SELECT id FROM commercial_applications WHERE reference=?', page.reference)
      ).id;
      await call('/page', { session, disabled: true }, 503);
      await call(
        '/staff-detail',
        { applicationId: appId, staffId: 'usr_rental_only', staffRole: 'operations_manager' },
        403,
      );
    },
  );
  await check('participants share roles without sharing private answers or documents', async () => {
    let p = await call('/page', { session });
    const invited = await call('/invite', {
      session,
      version: p.version,
      input: {
        name: 'Additional participant invitation',
        email: 'other@example.invalid',
        adultConfirmed: true,
      },
    });
    otherId = invited.personId;
    otherSession = (await call('/exchange', { token: await privateLink('other@example.invalid') }))
      .session;
    p = await call('/page', { session });
    assert.equal(
      (
        await call('/invite', {
          session,
          version: p.version,
          input: {
            name: 'Same person another role',
            email: 'other@example.invalid',
            adultConfirmed: true,
          },
        })
      ).alreadyIncluded,
      true,
    );
    const entity = {
      version: 'proinspect-commercial-application-v1',
      entities: [
        {
          id: 'cent_synthetic_company',
          entityType: 'company',
          legalName: 'Synthetic Company Pty Ltd',
          address: '12 Synthetic Business Avenue',
          abn: '',
          tradingName: '',
          capacity: 'applicant',
          signatories: [primaryId],
          acn: '123456789',
          directors: [primaryId, otherId],
        },
      ],
      roles: [
        {
          personId: primaryId,
          entityId: 'cent_synthetic_company',
          role: 'signatory',
          authorityEvidence: 'Synthetic authority',
        },
        {
          personId: primaryId,
          entityId: 'cent_synthetic_company',
          role: 'director',
          authorityEvidence: '',
        },
        {
          personId: otherId,
          entityId: 'cent_synthetic_company',
          role: 'director',
          authorityEvidence: '',
        },
        {
          personId: otherId,
          entityId: 'cent_synthetic_company',
          role: 'guarantor',
          authorityEvidence: 'Synthetic private guarantor assessment',
        },
      ],
    };
    await call('/save', { session, section: 'entity', input: entity, version: p.version });
    const operations = {
      businessDescription: 'Synthetic consulting business for isolated tests',
      proposedUse: 'Office consulting',
      tradingHours: 'Weekdays by arrangement',
      staffCount: 2,
      customerTraffic: 'Appointments only',
      proposedCommencement: '2030-06-01',
      licencesAndPermits: 'Subject to responsible authority review',
    };
    const sections = {
      operations,
      financial: {
        historyYears: 2,
        basQuarters: 4,
        unavailableReason: '',
        alternativeEvidence: '',
      },
      references: {
        previousLandlord: null,
        noLandlordReason: 'First commercial premises',
        tradeReferences: [
          {
            name: 'Synthetic Referee One',
            organisation: 'Synthetic A',
            contact: 'ref1@example.invalid',
            relationship: 'Supplier',
          },
          {
            name: 'Synthetic Referee Two',
            organisation: 'Synthetic B',
            contact: 'ref2@example.invalid',
            relationship: 'Supplier',
          },
        ],
        accountant: null,
        accountantPermission: null,
      },
      fitout: {
        alterations: false,
        description: '',
        approvalNeeds: '',
        signage: 'None proposed',
        equipment: 'Office equipment',
        utilities: 'Existing utilities subject to verification',
        maintenanceResponsibilities: 'Subject to lease review',
        parkingStorage: 'As approved by lessor',
      },
      security: {
        instrument: 'bank_guarantee',
        details: 'Subject to separate legal review',
        guarantorPersonIds: [otherId],
        guarantorEntityIds: [],
      },
    };
    for (const [section, input] of Object.entries(sections)) {
      p = await call('/page', { session });
      await call('/save', { session, section, input, version: p.version });
    }
    p = await call('/page', { session });
    await call(
      '/save',
      { session: otherSession, section: 'operations', input: operations, version: p.version },
      403,
    );
  });
  await check(
    'financial evidence stays quarantined until signed clean verdict and review',
    async () => {
      const categories = [
        ['registry', ''],
        ['financial_year', '2024-2025'],
        ['financial_year', '2025-2026'],
        ['bas_quarter', '2025-Q3'],
        ['bas_quarter', '2025-Q4'],
        ['bas_quarter', '2026-Q1'],
        ['bas_quarter', '2026-Q2'],
      ];
      for (const [category, period] of categories) {
        const p = await call('/page', { session });
        await call('/upload', {
          session,
          category,
          period,
          entityId: 'cent_synthetic_company',
          version: p.version,
        });
      }
      let p = await call('/page', { session });
      await call(
        '/upload',
        { session, category: 'identity', bytes: 'not a PDF', version: p.version },
        422,
      );
      const docs = p.documents;
      await call(
        '/review-doc',
        {
          applicationId: appId,
          documentId: docs[0].id,
          input: { status: 'released', note: 'Cannot release without clean scanner proof' },
        },
        409,
      );
      const download = await mf.dispatchFetch('http://localhost/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: appId, documentId: docs[0].id }),
      });
      assert.equal(download.status, 404);
      while (scans.length < categories.length) await call('/scan', { applicationId: appId });
      const time = String(Math.floor(Date.now() / 1000));
      for (const scan of scans) {
        const raw = JSON.stringify({
          ...scan,
          eventId: randomUUID(),
          verdict: 'clean',
          engine: 'Synthetic scanner',
          reference: 'SYNTHETIC-CLEAN-' + scan.documentId,
        });
        if (scan === scans[0]) {
          const bad = await mf.dispatchFetch('http://localhost/scan-result', {
            method: 'POST',
            headers: {
              'X-ProInspect-Time': time,
              'X-ProInspect-Signature': 'sha256=' + '0'.repeat(64),
            },
            body: raw,
          });
          assert.equal(bad.status, 403);
        }
        const accepted = await mf.dispatchFetch('http://localhost/scan-result', {
          method: 'POST',
          headers: { 'X-ProInspect-Time': time, 'X-ProInspect-Signature': hmac(time, raw) },
          body: raw,
        });
        assert.equal(accepted.status, 200);
        await call('/review-doc', {
          applicationId: appId,
          documentId: scan.documentId,
          input: {
            status: 'released',
            note: 'Synthetic authorised document review after clean scan',
          },
        });
      }
      p = await call('/page', { session });
      const unsafe = await call('/upload', {
        session,
        category: 'other',
        bytes: '%PDF-1.7\nSYNTHETIC-UNSAFE-SCANNER-FIXTURE\n%%EOF',
        version: p.version,
      });
      await call('/scan', { applicationId: appId });
      const scan = scans.find((s) => s.documentId === unsafe.id),
        unsafeRaw = JSON.stringify({
          ...scan,
          eventId: randomUUID(),
          verdict: 'unsafe',
          engine: 'Synthetic scanner',
          reference: 'SYNTHETIC-UNSAFE-VERDICT',
        });
      const rejected = await mf.dispatchFetch('http://localhost/scan-result', {
        method: 'POST',
        headers: { 'X-ProInspect-Time': time, 'X-ProInspect-Signature': hmac(time, unsafeRaw) },
        body: unsafeRaw,
      });
      assert.equal(rejected.status, 200);
      await call(
        '/review-doc',
        {
          applicationId: appId,
          documentId: unsafe.id,
          input: { status: 'released', note: 'Unsafe content must never be released.' },
        },
        409,
      );
      const reversal = JSON.stringify({
        ...scan,
        eventId: randomUUID(),
        verdict: 'clean',
        engine: 'Synthetic scanner',
        reference: 'SYNTHETIC-INVALID-REVERSAL',
      });
      const blocked = await mf.dispatchFetch('http://localhost/scan-result', {
        method: 'POST',
        headers: { 'X-ProInspect-Time': time, 'X-ProInspect-Signature': hmac(time, reversal) },
        body: reversal,
      });
      assert.equal(blocked.status, 409);
      p = await call('/page', { session });
      assert.equal(p.readiness.ready, false);
      await call('/delete', { session, documentId: unsafe.id, version: p.version });
      assert.equal((await call('/page', { session: otherSession })).documents.length, 0);
    },
  );
  await check(
    'private offers are permissioned, have explicit periods and reset declarations',
    async () => {
      const p = await call('/page', { session }),
        expiry = new Date(Date.now() + 86400000).toISOString();
      await call('/offer', {
        applicationId: appId,
        version: p.version,
        input: {
          id: 'synthetic_offer',
          version: 'synthetic-v1',
          expiresAt: expiry,
          authorisationReference: 'SYNTHETIC-LESSOR-OFFER-AUTHORITY',
          rent: { amountCents: 3600000, period: 'year', currency: 'AUD', taxTreatment: 'ex_gst' },
          term: 'A separately agreed synthetic term',
          options: 'Subject to review',
          commencement: '2030-06-01',
          paymentSchedule: 'As separately agreed',
          rentReview: 'Subject to separate legal agreement',
          incentives: [],
          outgoings: {
            basis: 'Approved actual-cost allocation under separate agreement',
            paymentSchedule: 'As separately agreed',
            responsibility: 'As agreed in the lease',
          },
          security: {
            instrument: 'Bank guarantee',
            amountCents: 100000,
            taxTreatment: 'Confirmed for synthetic test only',
            conditions: 'Separate legal execution required',
          },
          leasingCosts: {
            description: 'Separately documented costs',
            responsibleParty: 'Subject to approved lease',
            taxTreatment: 'Confirmed for synthetic fixture',
          },
          permittedPersonIds: [primaryId],
          nonBinding: true,
        },
      });
      assert.equal((await call('/page', { session })).offer.version, 'synthetic-v1');
      assert.equal((await call('/page', { session: otherSession })).offer, null);
    },
  );
  await check(
    'every person declares privately and submission is sealed and idempotent',
    async () => {
      for (const [access, name, address, guarantee] of [
        [session, 'PRIVATE-LEAD-NAME', 'PRIVATE-ADDRESS-LEAD', false],
        [otherSession, 'PRIVATE-OTHER-NAME', 'PRIVATE-ADDRESS-OTHER', true],
      ]) {
        const p = await call('/page', { session: access });
        const input = {
          profile: {
            name,
            email: p.profile.email,
            telephone: '0400000000',
            address,
            identityType: 'Not yet available',
            identityReference: '',
            authorityStatement: 'Synthetic authority and role reviewed for this application.',
          },
          noticeHash: p.notice.hash,
          authority: true,
          nonBinding: true,
          referencePermission: access === session,
          guaranteeConsent: guarantee,
        };
        if (guarantee)
          await call(
            '/declare',
            {
              session: access,
              version: p.version,
              personVersion: p.personVersion,
              input: { ...input, guaranteeConsent: false },
            },
            422,
          );
        await call('/declare', {
          session: access,
          version: p.version,
          personVersion: p.personVersion,
          input,
        });
      }
      const lead = await call('/page', { session }),
        other = await call('/page', { session: otherSession });
      assert.ok(!JSON.stringify(lead).includes('PRIVATE-OTHER-NAME'));
      assert.ok(!JSON.stringify(other).includes('PRIVATE-ADDRESS-LEAD'));
      receipt = await call('/submit', { session, requestKey: randomUUID(), version: lead.version });
      const again = await call('/submit', {
        session,
        requestKey: randomUUID(),
        version: lead.version,
      });
      assert.equal(again.receipt, receipt.receipt);
      assert.equal(again.replayed, true);
      assert.equal(
        (
          await first(
            'SELECT COUNT(*) AS n FROM commercial_application_submissions WHERE application_id=?',
            appId,
          )
        ).n,
        1,
      );
      await assert.rejects(
        run(
          'UPDATE commercial_application_submissions SET sha256=? WHERE id=?',
          '0'.repeat(64),
          receipt.receipt,
        ),
        /IMMUTABLE/,
      );
    },
  );
  await check(
    'uncertain delivery is held, signed reconciliation records acceptance without resending',
    async () => {
      let app = await first('SELECT version FROM commercial_applications WHERE id=?', appId);
      const referral = await call('/prepare', {
        applicationId: appId,
        version: app.version,
        reviewReference: 'SYNTHETIC-REVIEW-COMPLETED',
        manualReviewConfirmed: true,
      });
      providerUncertain = true;
      const sent = await call('/dispatch', { referralId: referral.id });
      assert.equal(sent.status, 'uncertain');
      await call('/dispatch', { referralId: referral.id }, 409);
      assert.equal(deliveries.length, 1);
      const payload = deliveries[0],
        time = String(Math.floor(Date.now() / 1000)),
        raw = JSON.stringify({
          outcome: 'accepted',
          idempotencyKey: payload.idempotencyKey,
          recipientHash: payload.recipientHash,
          messageReference: 'synthetic-reconciled-ack',
        });
      await call('/reconcile', {
        referralId: referral.id,
        input: {
          receipt: raw,
          timestamp: time,
          signature: hmac(time, raw),
          reference: 'SYNTHETIC-PROVIDER-RECONCILIATION',
        },
      });
      assert.equal(
        (await first('SELECT status FROM commercial_applications WHERE id=?', appId)).status,
        'referred',
      );
      assert.equal(deliveries.length, 1);
      const token = new URL(payload.privateRetrieval).pathname.split('/').pop(),
        path = '/retrieve/' + token;
      const denied = await mf.dispatchFetch('http://localhost' + path);
      assert.equal(denied.status, 403);
      const allowed = await mf.dispatchFetch('http://localhost' + path, {
        headers: { 'X-ProInspect-Time': time, 'X-ProInspect-Signature': hmac(time, path) },
      });
      assert.equal(allowed.status, 200);
      const grant = await allowed.json();
      assert.equal(grant.snapshot.reference, receipt.reference);
    },
  );
  await check('privacy requests, holds and verified erasure preserve a minimal audit', async () => {
    await call('/privacy', {
      session: otherSession,
      input: { kind: 'correction', note: 'Synthetic private correction request.' },
    });
    const lead = await call('/page', { session }),
      other = await call('/page', { session: otherSession });
    assert.equal(lead.privacyRequests.length, 0);
    assert.equal(other.privacyRequests.length, 1);
    await call('/withdraw-person', { session: otherSession, version: other.version });
    assert.equal(
      (await first('SELECT status FROM commercial_applications WHERE id=?', appId)).status,
      'blocked',
    );
    const current = await call('/page', { session });
    await call('/withdraw', { session, version: current.version });
    await run(
      'UPDATE commercial_applications SET retained_until=? WHERE id=?',
      '2020-01-01T00:00:00Z',
      appId,
    );
    let app = await first('SELECT version FROM commercial_applications WHERE id=?', appId);
    await call('/staff-review', {
      applicationId: appId,
      command: 'privacy-hold',
      input: {
        version: app.version,
        note: 'Synthetic hold prevents deletion pending review.',
        until: '2099-01-01T00:00:00Z',
      },
    });
    app = await first('SELECT version FROM commercial_applications WHERE id=?', appId);
    const input = {
      version: app.version,
      reference: 'SYNTHETIC-ERASURE-VERIFICATION',
      downstreamCopiesVerified: true,
      backupsAndLegalHoldReviewed: true,
    };
    await call('/purge', { applicationId: appId, input }, 409);
    await call('/staff-review', {
      applicationId: appId,
      command: 'privacy-hold',
      input: { version: app.version, note: 'Synthetic hold resolved with documented authority.' },
    });
    app = await first('SELECT version FROM commercial_applications WHERE id=?', appId);
    await call('/purge', { applicationId: appId, input: { ...input, version: app.version } });
    const detail = await call('/staff-detail', { applicationId: appId });
    assert.ok(detail.application.purgedAt);
    assert.equal(detail.submissions.length, 0);
    assert.equal(
      (
        await first(
          'SELECT COUNT(*) AS n FROM commercial_application_evidence WHERE application_id=?',
          appId,
        )
      ).n,
      0,
    );
    await call('/page', { session }, 404);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  });
  writeFileSync(
    'artifacts/commercial-application-runtime.json',
    JSON.stringify(
      { status: 'PASS', synthetic: true, productionTouched: false, realEmailSent: false, checks },
      null,
      2,
    ) + '\n',
  );
  console.log('Commercial application: ' + checks.length + ' isolated end-to-end checks passed.');
} finally {
  await mf.dispose();
}
