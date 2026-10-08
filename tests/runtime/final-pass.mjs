import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { catalogueSql } from '../../scripts/catalogue-sql.mjs';
import { seal } from '../../packages/auth/crypto.ts';
mkdirSync('artifacts', { recursive: true });
await build({
  entryPoints: ['tests/runtime/communications-entry.ts'],
  outfile: 'artifacts/final-pass-worker.mjs',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers'],
});
const key = randomBytes(32).toString('base64'),
  mail = [],
  past = new Date(Date.now() - 86400000).toISOString(),
  checks = [];
const mf = new Miniflare({
  modules: true,
  scriptPath: 'artifacts/final-pass-worker.mjs',
  compatibilityDate: '2026-07-01',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'review' },
  r2Buckets: { DOCUMENTS: 'docs', RESTRICTED_DOCUMENTS: 'restricted' },
  durableObjects: { SCHEDULER: { className: 'BookingScheduler', useSQLite: true } },
  bindings: {
    APP_ENV: 'local',
    APP_ORIGIN: 'http://localhost',
    DATA_ENCRYPTION_KEY: key,
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 'synthetic',
    EMAIL_FROM: 'ProInspect <noreply@example.test>',
  },
  outboundService: async (request) => {
    assert.equal(new URL(request.url).origin, 'https://api.resend.com');
    mail.push(await request.json());
    return Response.json({ id: randomUUID() });
  },
});
const db = await mf.getD1Database('DB'),
  run = (q, ...v) =>
    db
      .prepare(q)
      .bind(...v)
      .run(),
  first = (q, ...v) =>
    db
      .prepare(q)
      .bind(...v)
      .first();
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log('PASS ' + name);
}
async function api(path, who, body) {
  const headers = { Origin: 'http://localhost', ...(who ? { Cookie: who.cookie } : {}) };
  if (body instanceof FormData) {
    const e = new Request('http://localhost', { method: 'POST', body });
    headers['Content-Type'] = e.headers.get('Content-Type');
    body = new Uint8Array(await e.arrayBuffer());
    headers['Content-Length'] = String(body.byteLength);
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await mf.dispatchFetch('http://localhost' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body,
  });
  return {
    response,
    status: response.status,
    data: response.headers.get('Content-Type')?.includes('json')
      ? await response.json()
      : await response.arrayBuffer(),
  };
}
async function ok(path, who, body, status = 200) {
  const r = await api(path, who, body);
  assert.equal(r.status, status, `${path}: ${JSON.stringify(r.data)}`);
  return r.data;
}
async function login(email) {
  const a = await ok('/api/auth/start', null, { email }),
    r = await api('/api/auth/complete', null, {
      email,
      token: new URL(a.localSignInUrl).searchParams.get('token'),
    });
  assert.equal(r.status, 200);
  return {
    email,
    cookie: r.response.headers.get('Set-Cookie').split(';')[0],
    id: (await first('SELECT id FROM users WHERE email=?', email)).id,
  };
}
const staffBase = '/api/w/staff/operations';
try {
  for (const q of JSON.parse(
    execFileSync('python3', ['scripts/schema-statements.py'], { encoding: 'utf8' }),
  ))
    await db.prepare(q).run();
  for (const q of catalogueSql().split('\n')) await db.prepare(q).run();
  const staff = await login('review-staff@example.test'),
    person = await login('review-person@example.test'),
    other = await login('review-other@example.test');
  await run("INSERT INTO staff_profiles VALUES(?,'operations_manager',1)", staff.id);
  const client = await ok(
      '/api/onboarding',
      person,
      { displayName: 'Review Landlord', clientName: 'Review self-managed' },
      201,
    ),
    base = '/api/w/landlord/' + client.clientId,
    otherClient = await ok(
      '/api/onboarding',
      other,
      { displayName: 'Other Landlord', clientName: 'Other self-managed' },
      201,
    ),
    otherBase = '/api/w/landlord/' + otherClient.clientId;
  await check(
    'account settings are user scoped, version guarded and hide session credentials',
    async () => {
      const d = await ok('/api/account', person);
      assert.equal(d.activeSessions, 1);
      assert.equal(d.sessions[0].current, 1);
      assert.ok(!JSON.stringify(d).includes('token_hash'));
      await ok('/api/account', person, {
        displayName: 'Updated display',
        reportEmail: false,
        version: 0,
      });
      assert.equal(
        (await api('/api/account', person, { displayName: 'Stale', reportEmail: true, version: 0 }))
          .status,
        409,
      );
      assert.equal(
        (
          await api('/api/account', person, {
            displayName: 'No elevation',
            reportEmail: true,
            version: 1,
            userId: other.id,
          })
        ).status,
        422,
      );
      assert.equal((await ok('/api/account', other)).preferences.report_email, 1);
    },
  );
  await check(
    'full portfolio pagination is scoped with stable non-overlapping cursors',
    async () => {
      const st = [];
      for (let i = 0; i < 510; i++) {
        const p = 'review_property_' + String(i).padStart(3, '0');
        st.push(
          db
            .prepare(
              "INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES(?,?,'Perth','6000',?,'residential',?)",
            )
            .bind(p, `Review property ${i}`, p, past),
          db
            .prepare(
              "INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES(?,?,?,'owner',?)",
            )
            .bind('link_' + p, client.clientId, p, past),
          db
            .prepare(
              "INSERT INTO property_management_relationships(id,property_id,manager_client_id,mode,starts_at) VALUES(?,?,?,'self_managed',?)",
            )
            .bind('manager_' + p, p, client.clientId, past),
        );
      }
      for (let i = 0; i < st.length; i += 60) await db.batch(st.slice(i, i + 60));
      const p = await ok(base + '/records?type=properties', person);
      assert.equal(p.total, 510);
      assert.equal(p.items.length, 25);
      assert.ok(p.next);
      const n = await ok(base + '/records?type=properties&after=' + p.next, person);
      assert.ok(!n.items.some((x) => p.items.some((y) => y.id === x.id)));
      assert.equal((await ok(otherBase + '/records?type=properties', other)).total, 0);
      assert.equal(
        (await api(otherBase + '/records?type=properties&after=' + p.next, other)).status,
        422,
      );
      assert.equal(
        (await ok(base + '/records?type=properties&q=Review%20property%20509', person)).total,
        1,
      );
      assert.equal(
        (await api(base + '/records?type=properties&q=changed&after=' + p.next, person)).status,
        422,
      );
    },
  );
  await check(
    'direct property lookup works beyond dashboard previews without cross-client access',
    async () => {
      assert.equal(
        (await ok(base + '/properties/review_property_000', person)).property.id,
        'review_property_000',
      );
      assert.equal((await api(otherBase + '/properties/review_property_000', other)).status, 404);
    },
  );
  await run(
    "INSERT INTO strata_schemes VALUES('scheme_review','Review building','REVIEW-001',?)",
    past,
  );
  for (const role of ['resident', 'council_member'])
    await run(
      'INSERT INTO scheme_memberships(id,user_id,scheme_id,role,starts_at,approved_by) VALUES(?,?,?,?,?,?)',
      'member_' + role,
      person.id,
      'scheme_review',
      role,
      past,
      staff.id,
    );
  const building = '/api/w/building/scheme_review',
    council = '/api/w/council/scheme_review';
  let rd, cd;
  async function document(title, audience) {
    const f = new FormData();
    f.set('title', title);
    f.set('category', 'building_document');
    f.set('schemeId', 'scheme_review');
    f.set(
      'file',
      new File(
        [new TextEncoder().encode('%PDF-1.4\nSynthetic review fixture\n%%EOF')],
        'fixture.pdf',
        { type: 'application/pdf' },
      ),
    );
    const d = await ok(staffBase + '/documents/upload', staff, f);
    await ok(staffBase + `/documents/${d.id}/issue`, staff, {
      audience,
      recipientId: 'scheme_review',
      reviewReference: 'Synthetic reviewed publication',
    });
    return d.id;
  }
  await check(
    'dual resident/council roles cannot union document lists or scoped downloads',
    async () => {
      cd = await document('Council only proposal', 'scheme_council');
      rd = await document('Resident instructions', 'scheme_resident');
      for (const [scope, yes, no] of [
        [building, rd, cd],
        [council, cd, rd],
      ]) {
        const d = await ok(scope + '/data', person);
        assert.ok(d.documents.some((x) => x.id === yes));
        assert.ok(!d.documents.some((x) => x.id === no));
        assert.equal((await ok(scope + '/records?type=documents', person)).total, 1);
        assert.equal((await api(scope + `/documents/${yes}/download`, person)).status, 200);
        assert.equal((await api(scope + `/documents/${no}/download`, person)).status, 404);
      }
    },
  );
  await check(
    'council revocation removes council access but preserves resident permissions',
    async () => {
      await run(
        'UPDATE scheme_memberships SET ends_at=? WHERE id=?',
        new Date(Date.now() - 1000).toISOString(),
        'member_council_member',
      );
      assert.equal((await api(council + '/records?type=documents', person)).status, 403);
      assert.equal((await api(building + `/documents/${rd}/download`, person)).status, 200);
    },
  );
  await check(
    'inactive services remain administrable without becoming publicly bookable',
    async () => {
      await run("UPDATE services SET active=0 WHERE id='routine-inspection'");
      assert.ok(
        (await ok(staffBase + '/data', staff)).services.some((s) => s.id === 'routine-inspection'),
      );
      assert.ok(!(await ok('/api/catalogue')).services.some((s) => s.id === 'routine-inspection'));
      assert.ok(
        !(await ok(base + '/data', person)).services.some((s) => s.id === 'routine-inspection'),
      );
    },
  );
  await check('report preference suppresses reports only, not mandatory messages', async () => {
    for (const kind of ['report.issued', 'booking.confirmed']) {
      const id = 'event_' + kind.replace('.', '_');
      await run(
        'INSERT INTO outbox_events(id,kind,envelope,available_at,created_at) VALUES(?,?,?,?,?)',
        id,
        kind,
        await seal(key, `outbox:${id}`, {
          to: person.email,
          subject: 'Synthetic',
          heading: 'Test',
          body: 'Synthetic transaction',
        }),
        past,
        past,
      );
      await ok('/__test/deliver?event=' + id);
    }
    assert.equal(
      (await first("SELECT error_code FROM outbox_events WHERE id='event_report_issued'"))
        .error_code,
      'PREFERENCE_SUPPRESSED',
    );
    assert.equal(
      (await first("SELECT status FROM outbox_events WHERE id='event_booking_confirmed'")).status,
      'sent',
    );
    assert.equal(mail.length, 1);
  });
  await check(
    'reporting counts are relationship scoped and not resident financial views',
    async () => {
      const r = await ok(base + '/reporting', person);
      assert.equal(r.currency, 'AUD');
      assert.equal(r.counts.documents.length, 0);
      assert.equal((await api(building + '/reporting', person)).status, 403);
      assert.equal((await api(otherBase + '/reporting', person)).status, 403);
    },
  );
  await check('revoke other sessions keeps the current and unrelated users active', async () => {
    const second = await login(person.email);
    await ok('/api/account/sessions/revoke', person, { scope: 'others', confirm: true });
    assert.equal((await api('/api/account', second)).status, 401);
    assert.equal((await api('/api/account', person)).status, 200);
    assert.equal((await api('/api/account', other)).status, 200);
  });
  await check('revoke all sessions clears cookie and invalidates current credentials', async () => {
    const r = await api('/api/account/sessions/revoke', person, { scope: 'all', confirm: true });
    assert.equal(r.status, 200);
    assert.match(r.response.headers.get('Set-Cookie'), /Max-Age=0/);
    assert.equal((await api('/api/account', person)).status, 401);
  });
  writeFileSync(
    'artifacts/final-pass-results.json',
    JSON.stringify({ checks: checks.length, passed: checks, deployed: false }, null, 2),
  );
  console.log(checks.length + ' final review checks passed.');
} finally {
  await mf.dispose();
}
