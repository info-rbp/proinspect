import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
mkdirSync('artifacts', { recursive: true });
await build({
  entryPoints: ['tests/runtime/sprint-entry.ts'],
  outfile: 'artifacts/commercial-worker.mjs',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers', 'node:*'],
});
const mf = new Miniflare({
  modules: true,
  scriptPath: 'artifacts/commercial-worker.mjs',
  compatibilityDate: '2026-07-01',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'commercial-handbook-isolated' },
  r2Buckets: { DOCUMENTS: 'commercial-isolated' },
  durableObjects: { SCHEDULER: { className: 'BookingScheduler', useSQLite: true } },
  bindings: {
    APP_ENV: 'local',
    APP_ORIGIN: 'http://localhost',
    DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    EMAIL_PROVIDER: 'local',
    COMMERCIAL_OPERATIONS_ENABLED: 'true',
  },
  outboundService: () => {
    throw Error('No provider calls are permitted by this isolated suite.');
  },
});
const db = await mf.getD1Database('DB'),
  run = (s, ...a) =>
    db
      .prepare(s)
      .bind(...a)
      .run(),
  first = (s, ...a) =>
    db
      .prepare(s)
      .bind(...a)
      .first(),
  checks = [];
const staff = '/api/w/staff/operations/commercial-leases',
  commercial = '/api/w/commercial/client_a/commercial-leases',
  past = '2020-01-01T00:00:00.000Z';
async function api(path, user, body, expected = 200) {
  const r = await mf.dispatchFetch('http://localhost' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: 'http://localhost',
      ...(user ? { Cookie: user.cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = (r.headers.get('Content-Type') ?? '').includes('json')
    ? await r.json()
    : await r.text();
  assert.equal(r.status, expected, path + ' ' + JSON.stringify(value));
  return { value, response: r };
}
async function login(name) {
  const email = name + '@commercial-handbook.example.test';
  const s = (await api('/api/auth/start', null, { email })).value;
  const r = await api('/api/auth/complete', null, {
    email,
    token: new URL(s.localSignInUrl).searchParams.get('token'),
  });
  return {
    cookie: r.response.headers.get('set-cookie').split(';')[0],
    id: (await first('SELECT id FROM users WHERE email=?', email)).id,
  };
}
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log('PASS ' + name);
}
let leaseId;
const command = async (name, user, data = {}, expected = 200, base = staff) =>
  (
    await api(
      base + '/' + name,
      user,
      { leaseId, requestKey: crypto.randomUUID(), ...data },
      expected,
    )
  ).value;
try {
  for (const s of JSON.parse(
    execFileSync('python3', ['scripts/schema-statements.py'], { encoding: 'utf8' }),
  ))
    await run(s);
  const author = await login('author'),
    reviewer = await login('reviewer'),
    agency = await login('agency'),
    other = await login('other'),
    inspector = await login('inspector');
  for (const [u, role] of [
    [author, 'administrator'],
    [reviewer, 'operations_manager'],
    [inspector, 'inspector'],
  ])
    await run('INSERT INTO staff_profiles(user_id,role) VALUES(?,?)', u.id, role);
  for (const [id, user] of [
    ['a', agency],
    ['b', other],
  ]) {
    await run(
      "INSERT INTO clients(id,name,client_type,created_at) VALUES(?,?,'agency',?)",
      'client_' + id,
      'Synthetic ' + id,
      past,
    );
    await run(
      "INSERT INTO client_memberships(id,client_id,user_id,role,created_at) VALUES(?,?,?,'owner',?)",
      'member_' + id,
      'client_' + id,
      user.id,
      past,
    );
    await run(
      "INSERT INTO client_entitlements(client_id,workspace_kind,approved_by,created_at) VALUES(?,'commercial',?,?)",
      'client_' + id,
      author.id,
      past,
    );
    await run(
      "INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES(?,?,'Perth','6000',?,'commercial',?)",
      'property_' + id,
      'Synthetic premises ' + id,
      'commercial-fixture-' + id,
      past,
    );
    await run(
      "INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES(?,?,?,'managing_agent',?)",
      'link_' + id,
      'client_' + id,
      'property_' + id,
      past,
    );
    await run(
      "INSERT INTO property_management_relationships(id,property_id,manager_client_id,mode,starts_at) VALUES(?,?,?,'commercial_managed',?)",
      'management_' + id,
      'property_' + id,
      'client_' + id,
      past,
    );
    await run(
      "INSERT INTO documents(id,property_id,title,category,object_key,content_type,size,sha256,status,created_by,created_at,issued_at) VALUES(?,?,'Synthetic lease evidence','report',?,'application/pdf',20,?,'issued',?,?,?)",
      'document_' + id,
      'property_' + id,
      'synthetic/' + id + '.pdf',
      'a'.repeat(64),
      author.id,
      past,
      past,
    );
    await run(
      "INSERT INTO document_grants(document_id,recipient_kind,recipient_id,created_by,created_at) VALUES(?,'client',?,?,?)",
      'document_' + id,
      'client_' + id,
      author.id,
      past,
    );
  }
  leaseId = (
    await api(commercial + '/create', agency, {
      propertyId: 'property_a',
      reference: 'LEASE-HANDBOOK-TEST',
      occupierName: 'Synthetic business',
      startsAt: '2023-01-01T00:00:00Z',
      endsAt: '2024-01-01T00:00:00Z',
      details: 'Synthetic source, not a real legal approval.',
      sourceDocumentId: 'document_a',
    })
  ).value.id;
  const source = {
    sourceDocumentId: 'document_a',
    sourceReference: 'SYNTHETIC-SOURCE-01',
    premises: 'Synthetic premises description',
    parties: 'Synthetic lessor and occupier',
    noticeReference: 'SYNTHETIC-EXTERNAL-NOTICE',
    details: 'PRIVATE_SOURCE_NOTES retained in encrypted source evidence.',
  };
  let commencement, variation, rule1, rule2, charge, adjustment, task, successor, exception;
  await check('foreign-client source evidence is denied before a proposal is stored', async () => {
    await command(
      'revision',
      author,
      {
        ...source,
        sourceDocumentId: 'document_b',
        version: 1,
        kind: 'commencement',
        effectiveAt: '2023-01-01T00:00:00Z',
        startsAt: '2023-01-01T00:00:00Z',
        endsAt: '2024-01-01T00:00:00Z',
      },
      422,
    );
    assert.equal((await first('SELECT count(*) AS n FROM commercial_lease_revisions')).n, 0);
  });
  await check('source proposals are idempotent and cannot be self-approved', async () => {
    const data = {
      ...source,
      version: 1,
      kind: 'commencement',
      effectiveAt: '2023-01-01T00:00:00Z',
      startsAt: '2023-01-01T00:00:00Z',
      endsAt: '2024-01-01T00:00:00Z',
      requestKey: crypto.randomUUID(),
    };
    commencement = await command('revision', author, data);
    assert.equal((await command('revision', author, data)).id, commencement.id);
    await command(
      'review-revision',
      author,
      { revisionId: commencement.id, decision: 'approved', reference: 'SELF-APPROVAL-TEST' },
      403,
    );
    await command('review-revision', reviewer, {
      revisionId: commencement.id,
      decision: 'approved',
      reference: 'INDEPENDENT-SYNTHETIC-REVIEW',
    });
    assert.equal(
      (await first('SELECT version FROM commercial_lease_register WHERE id=?', leaseId)).version,
      2,
    );
  });
  await check('illegal renewal overlap and stale lease versions are rejected', async () => {
    await command(
      'revision',
      author,
      {
        ...source,
        version: 2,
        kind: 'renewal',
        effectiveAt: '2023-06-01T00:00:00Z',
        startsAt: '2023-06-01T00:00:00Z',
        endsAt: '2025-01-01T00:00:00Z',
      },
      422,
    );
    await command(
      'revision',
      author,
      {
        ...source,
        version: 1,
        kind: 'variation',
        effectiveAt: '2023-04-01T00:00:00Z',
        startsAt: '2023-01-01T00:00:00Z',
        endsAt: '2024-01-01T00:00:00Z',
      },
      409,
    );
  });
  await check(
    'overlapping option proposals must be reconciled, not silently approved',
    async () => {
      const d = {
        ...source,
        version: 2,
        kind: 'variation',
        effectiveAt: '2023-04-01T00:00:00Z',
        startsAt: '2023-01-01T00:00:00Z',
        endsAt: '2024-01-01T00:00:00Z',
        optionOpensAt: '2023-10-01T00:00:00Z',
        optionClosesAt: '2023-12-01T00:00:00Z',
      };
      variation = await command('revision', author, d);
      const alternative = await command('revision', author, {
        ...d,
        sourceReference: 'ALTERNATIVE-SOURCE-TEST',
      });
      await command(
        'review-revision',
        reviewer,
        { revisionId: variation.id, decision: 'approved', reference: 'OVERLAPPING-OPTION-REVIEW' },
        409,
      );
      await command('review-revision', reviewer, {
        revisionId: alternative.id,
        decision: 'rejected',
        reference: 'SUPERSEDED-SOURCE-REVIEW',
      });
      await command('review-revision', reviewer, {
        revisionId: variation.id,
        decision: 'approved',
        reference: 'INDEPENDENT-OPTION-REVIEW',
      });
      const d1 = (await api(commercial, agency)).value.leases[0];
      assert.ok(d1.signals.some((s) => s.includes('window has closed')));
      assert.equal(d1.starts_at, '2023-01-01T00:00:00.000Z');
    },
  );
  const financial = {
    revisionId: null,
    sourceDocumentId: 'document_a',
    sourceReference: 'APPROVED-RENT-CLAUSE',
    details: 'Synthetic source-approved monthly rent and tax inputs.',
    obligationKey: 'rent-premises-a',
    category: 'rent',
    frequency: 'monthly',
    sourceAmountCents: 310000,
    gstBasisPoints: 1000,
    taxBasis: 'exclusive',
    method: 'actual_days',
    basisFrom: '2023-10-01',
    basisTo: '2023-11-01',
    reviewMethod: 'none',
  };
  await check(
    'financial source rules require independent review and current issued evidence',
    async () => {
      rule1 = await command('rule', author, { ...financial, revisionId: variation.id });
      await command(
        'review-rule',
        author,
        { ruleId: rule1.id, decision: 'approved', reference: 'SELF-FINANCIAL-REVIEW' },
        403,
      );
      await run("DELETE FROM document_grants WHERE document_id='document_a'");
      await command(
        'review-rule',
        reviewer,
        { ruleId: rule1.id, decision: 'approved', reference: 'REVOKED-SOURCE-REVIEW' },
        422,
      );
      await run(
        "INSERT INTO document_grants(document_id,recipient_kind,recipient_id,created_by,created_at) VALUES('document_a','client','client_a',?,?)",
        author.id,
        past,
      );
      await command('review-rule', reviewer, {
        ruleId: rule1.id,
        decision: 'approved',
        reference: 'INDEPENDENT-FINANCIAL-REVIEW',
      });
    },
  );
  await check(
    'partial allocation reconciles exact cents and overlapping allocations are denied',
    async () => {
      const d = {
        mode: 'allocate',
        ruleId: rule1.id,
        periodFrom: '2023-10-16',
        periodTo: '2023-11-01',
        sourceDocumentId: 'document_a',
        sourceReference: 'PARTIAL-ALLOCATION-TEST',
      };
      charge = await command('charge', author, d);
      assert.equal(charge.calculation.totalCents, 176000);
      await command('review-charge', reviewer, {
        chargeId: charge.id,
        decision: 'approved',
        reference: 'INDEPENDENT-ALLOCATION-REVIEW',
      });
      await command('charge', author, d, 409);
      assert.equal((await first('SELECT count(*) AS n FROM commercial_lease_charges')).n, 1);
    },
  );
  await check(
    'recalculation creates an immutable delta and stale competing adjustments cannot approve',
    async () => {
      rule2 = await command('rule', author, {
        ...financial,
        revisionId: variation.id,
        sourceAmountCents: 620000,
        sourceReference: 'REVISED-RENT-CLAUSE',
      });
      await command('review-rule', reviewer, {
        ruleId: rule2.id,
        decision: 'approved',
        reference: 'INDEPENDENT-REVISED-RULE',
      });
      const d = {
        mode: 'recalculate',
        ruleId: rule2.id,
        adjustsChargeId: charge.id,
        sourceDocumentId: 'document_a',
        sourceReference: 'RECALCULATION-SOURCE',
      };
      adjustment = await command('charge', author, d);
      const stale = await command('charge', author, {
        ...d,
        sourceReference: 'COMPETING-ADJUSTMENT',
      });
      assert.equal(adjustment.calculation.totalCents, 176000);
      await command('review-charge', reviewer, {
        chargeId: adjustment.id,
        decision: 'approved',
        reference: 'INDEPENDENT-ADJUSTMENT',
      });
      await command(
        'review-charge',
        reviewer,
        { chargeId: stale.id, decision: 'approved', reference: 'STALE-ADJUSTMENT-REVIEW' },
        409,
      );
      await command('review-charge', reviewer, {
        chargeId: stale.id,
        decision: 'rejected',
        reference: 'REJECTED-STALE-ADJUSTMENT',
      });
      assert.equal(
        (await first('SELECT total_cents FROM commercial_lease_charges WHERE id=?', charge.id))
          .total_cents,
        176000,
      );
    },
  );
  await check(
    'disputes block financial approval and require a separate evidenced resolution',
    async () => {
      exception = await command('exception', author, {
        kind: 'disputed_charge',
        chargeId: charge.id,
        sourceReference: 'DISPUTED-OUTGOINGS-TEST',
        details: 'Synthetic dispute requires independent review before adjustment.',
      });
      const reverse = await command('charge', author, {
        mode: 'reverse',
        adjustsChargeId: charge.id,
        sourceDocumentId: 'document_a',
        sourceReference: 'FULL-REVERSAL-SOURCE',
      });
      await command(
        'review-charge',
        reviewer,
        { chargeId: reverse.id, decision: 'approved', reference: 'DISPUTED-REVERSAL-REVIEW' },
        409,
      );
      await command(
        'resolve-exception',
        author,
        {
          exceptionId: exception.id,
          resolutionDocumentId: 'document_a',
          reference: 'SELF-RESOLUTION-TEST',
        },
        403,
      );
      await command('assign-exception', reviewer, {
        exceptionId: exception.id,
        ownerId: reviewer.id,
        priority: 'high',
        reference: 'EXCEPTION-OWNER-ASSIGNED',
      });
      await command('resolve-exception', reviewer, {
        exceptionId: exception.id,
        resolutionDocumentId: 'document_a',
        reference: 'INDEPENDENT-DISPUTE-RESOLUTION',
      });
      await command('review-charge', reviewer, {
        chargeId: reverse.id,
        decision: 'approved',
        reference: 'INDEPENDENT-REVERSAL-REVIEW',
      });
      const totals = (await api(commercial, agency)).value.leases[0].ledgerTotals;
      assert.equal(totals.totalCents, '0');
      assert.equal(totals.gstCents, '0');
    },
  );
  await check(
    'make-good closure records observations, final report and independent responsibility',
    async () => {
      task = (
        await api(commercial + '/task', agency, {
          leaseId,
          kind: 'make_good',
          title: 'Synthetic make-good inspection',
          dueAt: '2023-11-01T00:00:00Z',
          details: 'Synthetic source-backed make-good obligation',
          reference: 'MAKE-GOOD-SOURCE-TEST',
        })
      ).value;
      await api(commercial + '/task-status', agency, {
        taskId: task.id,
        version: 1,
        status: 'review_required',
        reference: 'REQUEST-CLOSURE-REVIEW',
      });
      const c = await command('obligation-case', author, {
        taskId: task.id,
        version: 2,
        kind: 'completion',
        sourceDocumentId: 'document_a',
        conditionDocumentId: 'document_a',
        sourceReference: 'MAKE-GOOD-COMPLETION',
        responsibility: 'occupier',
        observations:
          'Synthetic inspection and final condition report record verified completed work.',
        quotationReference: 'SYNTHETIC-QUOTATION',
        quotedCents: 50000,
      });
      await command(
        'review-obligation',
        author,
        { caseId: c.id, decision: 'approved', reference: 'SELF-CLOSURE-REVIEW' },
        403,
      );
      await command('review-obligation', reviewer, {
        caseId: c.id,
        decision: 'approved',
        reference: 'INDEPENDENT-MAKE-GOOD-REVIEW',
      });
      const t = await first(
        'SELECT status,version,completion_document_id FROM commercial_lease_tasks WHERE id=?',
        task.id,
      );
      assert.equal(t.status, 'completed');
      assert.equal(t.version, 3);
      assert.equal(t.completion_document_id, 'document_a');
    },
  );
  await check(
    'reopening creates a linked successor without changing the closed original',
    async () => {
      const before = await first('SELECT * FROM commercial_lease_tasks WHERE id=?', task.id);
      const c = await command('obligation-case', author, {
        taskId: task.id,
        version: 3,
        kind: 'reopening',
        sourceDocumentId: 'document_a',
        sourceReference: 'REOPENING-SOURCE-TEST',
        responsibility: 'shared',
        observations: 'New source-backed evidence requires a separate follow-up obligation.',
        newTitle: 'Synthetic follow-up inspection',
        newDueAt: '2024-02-01T00:00:00Z',
      });
      const r = await command('review-obligation', reviewer, {
        caseId: c.id,
        decision: 'approved',
        reference: 'INDEPENDENT-REOPENING-REVIEW',
      });
      successor = r.successorId;
      assert.ok(successor);
      assert.deepEqual(
        await first('SELECT * FROM commercial_lease_tasks WHERE id=?', task.id),
        before,
      );
      const close = await command('obligation-case', author, {
        taskId: successor,
        version: 1,
        kind: 'cancellation',
        sourceDocumentId: 'document_a',
        sourceReference: 'FOLLOW-UP-RESOLUTION',
        responsibility: 'shared',
        observations:
          'Independent source review confirms the successor can be cancelled without rewriting its predecessor.',
      });
      await command('review-obligation', reviewer, {
        caseId: close.id,
        decision: 'approved',
        reference: 'INDEPENDENT-FOLLOW-UP-REVIEW',
      });
    },
  );
  await check(
    'a lease can renew and expire while the original agreement remains unchanged',
    async () => {
      const original = await first(
        'SELECT starts_at,ends_at,details_envelope,source_document_id FROM commercial_lease_register WHERE id=?',
        leaseId,
      );
      const renewed = await command('revision', author, {
        ...source,
        version: 3,
        kind: 'renewal',
        effectiveAt: '2024-01-01T00:00:00Z',
        startsAt: '2024-01-01T00:00:00Z',
        endsAt: '2025-01-01T00:00:00Z',
      });
      await command('review-revision', reviewer, {
        revisionId: renewed.id,
        decision: 'approved',
        reference: 'INDEPENDENT-RENEWAL-REVIEW',
      });
      const expired = await command('revision', author, {
        ...source,
        version: 4,
        kind: 'expiry',
        effectiveAt: '2025-01-01T00:00:00Z',
        startsAt: '2024-01-01T00:00:00Z',
        endsAt: '2025-01-01T00:00:00Z',
      });
      await command('review-revision', reviewer, {
        revisionId: expired.id,
        decision: 'approved',
        reference: 'INDEPENDENT-EXPIRY-REVIEW',
      });
      await command('end', reviewer, { version: 5, reference: 'REVIEWED-REGISTER-CLOSURE' });
      assert.equal(
        (await first('SELECT status FROM commercial_lease_register WHERE id=?', leaseId)).status,
        'ended',
      );
      assert.deepEqual(
        await first(
          'SELECT starts_at,ends_at,details_envelope,source_document_id FROM commercial_lease_register WHERE id=?',
          leaseId,
        ),
        original,
      );
    },
  );
  await check(
    'exports contain reviewed immutable rows and exact balancing control totals',
    async () => {
      const r = await api(
        commercial + '/ledger/' + leaseId + '?from=2023-10-01&to=2023-11-01',
        agency,
      );
      assert.match(r.response.headers.get('Content-Type'), /text\/csv/);
      assert.match(r.value, /CONTROL_TOTAL/);
      assert.match(r.value, /,AUD,|"AUD"/);
      assert.equal(r.value.trim().split('\r\n').length, 5);
      await api(
        commercial + '/ledger/' + leaseId + '?from=2023-10-20&to=2023-11-01',
        agency,
        undefined,
        422,
      );
    },
  );
  await check(
    'other clients and inspectors cannot read commercial evidence or financial histories',
    async () => {
      await api(
        '/api/w/commercial/client_b/commercial-leases/ledger/' +
          leaseId +
          '?from=2023-10-01&to=2023-11-01',
        other,
        undefined,
        404,
      );
      await api(staff, inspector, undefined, 403);
      const otherData = (await api('/api/w/commercial/client_b/commercial-leases', other)).value;
      assert.equal(otherData.leases.length, 0);
      assert.equal(JSON.stringify(otherData).includes('PRIVATE_SOURCE_NOTES'), false);
    },
  );
  await check(
    'revoking client membership immediately removes access despite an existing session',
    async () => {
      await run("UPDATE client_memberships SET active=0 WHERE client_id='client_a'");
      await api(commercial, agency, undefined, 403);
    },
  );
  await check('all additive data remains referentially consistent', async () => {
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  });
  writeFileSync(
    'artifacts/commercial-handbook-runtime.json',
    JSON.stringify(
      {
        environment: 'isolated-local',
        provider: 'none',
        businessAcceptance: false,
        passed: checks.length,
        checks,
      },
      null,
      2,
    ),
  );
} finally {
  await mf.dispose();
}
