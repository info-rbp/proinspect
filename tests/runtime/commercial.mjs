import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { seal } from '../../packages/auth/crypto.ts';
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
const key = randomBytes(32).toString('base64');
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
    DATA_ENCRYPTION_KEY: key,
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
const leaseId = 'historical_lease';
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
  await run(`INSERT INTO commercial_lease_register(id,property_id,client_id,reference,occupier_name,starts_at,ends_at,details_envelope,source_document_id,created_by,created_at,updated_at)
    VALUES(?,'property_a','client_a','ARCHIVED-LEASE','Historical tenant','2020-01-01','2022-01-01',?,'document_a',?,?,?)`,
    leaseId, await seal(key,'commercial-lease:'+leaseId,{details:'PRIVATE_SOURCE_NOTES'}),author.id,past,past);
  await check('authorised clients can find their historical lease', async () => {
    const register=(await api(commercial,agency)).value;
    assert.ok(register.leases.some(lease=>lease.id===leaseId));
  });
  await check('retired lease creation and changes stay closed for approved customers and staff', async () => {
    for (const [base,actor] of [[commercial,agency],[staff,author]]) {
      for (const action of ['create','revision','approve','task','charge','adjustment']) {
        const {value}=await api(base+'/'+action,actor,{propertyId:'property_a',leaseId,requestKey:crypto.randomUUID()},410);
        assert.equal(value.code,'SECTOR_RETIRED');
      }
    }
    assert.equal((await first('SELECT COUNT(*) AS n FROM commercial_lease_register')).n,1);
    assert.equal((await first('SELECT version FROM commercial_lease_register WHERE id=?',leaseId)).version,1);
  });
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
