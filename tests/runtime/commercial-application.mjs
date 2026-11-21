import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { seal } from '../../packages/auth/crypto.ts';
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
const key = randomBytes(32).toString('base64');
const secret = 'synthetic-commercial-provider-secret';
let outboundCalls = 0;
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
  outboundService: () => {
    outboundCalls++;
    throw Error('Retired acquisition must not call a provider.');
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
  const flowId='historical_flow', appId='historical_application';
  await run(`INSERT INTO commercial_application_flows(id,listing_id,version,mode,status,config_envelope,config_sha256,recipient_hash,created_by,created_at)
    VALUES(?,'lst_cm_synthetic',1,'proinspect_commercial','revoked',?,?,?,'usr_cm_a',?)`,flowId,
    await seal(key,'commercial-flow:'+flowId,{}),'a'.repeat(64),'b'.repeat(64),stamp);
  await run(`INSERT INTO commercial_applications(id,flow_id,reference,status,shared_envelope,scope_sha256,created_at,updated_at,retained_until,purged_at)
    VALUES(?,?,'ARCHIVED-COMMERCIAL-01','closed',?,?,?,?,?,?)`,appId,flowId,await seal(key,'commercial-shared:'+appId,{}),'a'.repeat(64),stamp,stamp,stamp,stamp);
  await check('even a previously configured listing cannot open a new commercial application',async()=>{
    const denied=await call('/begin',{flowId,input:{name:'Historical lead',email:'lead@example.invalid',consent:true}},410);
    assert.equal(denied.code,'SECTOR_RETIRED');
    assert.equal((await first('SELECT COUNT(*) AS n FROM commercial_applications')).n,1);
    assert.equal((await first('SELECT COUNT(*) AS n FROM commercial_application_people')).n,0);
    assert.equal((await first('SELECT COUNT(*) AS n FROM outbox_events')).n,0);
    assert.equal(outboundCalls,0);
  });
  await check('only an explicitly granted reviewer can read a retained application audit',async()=>{
    await call('/staff-detail',{applicationId:appId,staffId:'usr_rental_only',staffRole:'operations_manager'},403);
    await call('/grant',{input:{userId:'usr_cm_a',configure:false,review:true,reference:'Existing synthetic review permission'}});
    const record=await call('/staff-detail',{applicationId:appId});
    assert.equal(record.application.reference,'ARCHIVED-COMMERCIAL-01');
    assert.equal(record.application.status,'closed');
    assert.deepEqual(record.people,[]);assert.deepEqual(record.documents,[]);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
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
