// Read-only before/after audit for one controlled production D1 migration.
// Deliberately never creates accounts, sessions, bookings, or payments.
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const account = '8ca23ac6d2cc906d4dd13b8da5ea2b25';
const database = 'dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea';
const originCommit = 'b49b41f4c500b461ddab6f6ef830fa896c663454';
const migration = '0006_all_inclusive_subscription.sql';
const stage = process.argv[2];
if (!['before', 'after'].includes(stage)) throw new Error('Use before or after');
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('Missing GitHub Actions Cloudflare credential');
if (process.env.GITHUB_REPOSITORY !== 'info-rbp/proinspect' ||
    process.env.GITHUB_REF !== 'refs/heads/main')
  throw new Error('Refusing to run outside canonical production main');

async function request(method, path, body) {
  const res = await fetch('https://api.cloudflare.com/client/v4' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  if (!res.ok || data.success !== true)
    throw new Error('Cloudflare read failed (HTTP ' + res.status +
      ', codes: ' + JSON.stringify((data.errors || []).map(x => x.code)) + ')');
  return data.result;
}

async function query(sql) {
  if (!/^\s*(SELECT|PRAGMA foreign_key_check)/i.test(sql))
    throw new Error('Read-only queries only');
  const r = await request('POST',
    '/accounts/' + account + '/d1/database/' + database + '/query', { sql });
  if (!Array.isArray(r) || r[0]?.success === false)
    throw new Error('D1 SELECT failed');
  return r[0]?.results || [];
}
const first = async sql => (await query(sql))[0] || {};
const equal = (actual, expected, message) => {
  if (actual !== expected) throw new Error(message + ': expected ' + expected +
    ', received ' + actual);
};

const actualDb = await request('GET', '/accounts/' + account + '/d1/database/' + database);
equal(actualDb.name, 'proinspect-platform-data', 'Database identity');
const worker = await request('GET',
  '/accounts/' + account + '/workers/scripts/proinspect-platform/settings');
const deployedSHA = (worker.bindings || []).find(x => x.name === 'BUILD_SHA')?.text;
if (![originCommit, process.env.GITHUB_SHA].includes(deployedSHA))
  throw new Error('Deployed Worker SHA differs from approved application or migration commit');

const clients = await query("SELECT id,client_type,status FROM clients ORDER BY id");
const active = clients.filter(c => c.status === 'active');
const history = await query('SELECT name FROM d1_migrations ORDER BY id');
const subscriptions = await query(
  'SELECT client_id,property_id,plan_code,status,allowance_json FROM subscriptions ORDER BY client_id'
);
const triggers = await query(
  "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'client_all_inclusive_%'"
);
const invalidForeignKeys = await query('PRAGMA foreign_key_check');
const operational = await first(
  'SELECT ' +
  '(SELECT COUNT(*) FROM bookings) AS bookings, ' +
  '(SELECT COUNT(*) FROM work_orders) AS work_orders, ' +
  '(SELECT COUNT(*) FROM payments) AS payments, ' +
  '(SELECT COUNT(*) FROM client_memberships) AS memberships, ' +
  '(SELECT COUNT(*) FROM client_entitlements) AS entitlements'
);
equal(invalidForeignKeys.length, 0, 'Foreign-key violations');
const expectedIds = [
  'cli_pi_test_agency',
  'cli_pi_test_commercial',
  'cli_pi_test_landlord',
  'cli_pi_test_strata',
];
if (active.length !== 4 ||
    JSON.stringify(active.map(c => c.id).sort()) !== JSON.stringify(expectedIds))
  throw new Error('Client inventory changed; migration not authorised for unexpected clients');

if (stage === 'before') {
  equal(history.length, 5, 'Previously applied migrations');
  if (history.some(h => h.name === migration))
    throw new Error('Migration is already applied; no rerun');
  equal(subscriptions.length, 0, 'Existing subscription count');
  equal(triggers.length, 0, 'Existing trigger count');
  equal(operational.bookings, 0, 'Preexisting bookings');
  equal(operational.work_orders, 0, 'Preexisting work orders');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/subscriptions-before.json',
    JSON.stringify({ checkedAt: new Date().toISOString(),
      approvedSource: originCommit, deployedSHA, activeClients: active.length,
      migrations: history.map(h => h.name), subscriptionCount: 0, operational }, null, 2));
  console.log('PASS preflight: four synthetic accounts, no subscription, expected migration history, no FK errors');
} else {
  const baseline = JSON.parse(await readFile('artifacts/subscriptions-before.json', 'utf8'));
  equal(history.filter(h => h.name === migration).length, 1, 'Migration ledger');
  equal(subscriptions.length, 4, 'Subscription backfill count');
  for (const client of active) {
    const plans = subscriptions.filter(x => x.client_id === client.id);
    equal(plans.length, 1, 'Plans for ' + client.id);
    const sub = plans[0];
    equal(sub.plan_code, 'all_inclusive', 'Plan code');
    equal(sub.status, 'active', 'Plan status');
    equal(sub.property_id, null, 'Account-wide plan');
    const allowances = JSON.parse(sub.allowance_json);
    if (JSON.stringify(allowances.includedServiceIds) !== '["*"]')
      throw new Error('Unexpected service coverage');
  }
  for (const trigger of [
    'client_all_inclusive_subscription_insert',
    'client_all_inclusive_subscription_activation',
  ]) {
    if (!triggers.some(t => t.name === trigger))
      throw new Error('Missing automatic subscription trigger: ' + trigger);
  }
  equal(triggers.length, 2, 'Expected trigger count');
  for (const property of Object.keys(baseline.operational))
    equal(operational[property], baseline.operational[property],
      'Unintended operational change: ' + property);
  console.log('PASS: 4/4 active synthetic customer accounts have all-inclusive subscriptions');
  console.log('PASS: automatic new-Landlord sign-up and activation triggers installed');
  console.log('PASS: no new booking, work order, payment, membership or entitlement');
  await writeFile('artifacts/subscriptions-after.json',
    JSON.stringify({ checkedAt: new Date().toISOString(), deployedSHA,
      migration, allInclusiveSubscriptions: subscriptions.length,
      triggers: triggers.map(t => t.name), operational, foreignKeyViolations: 0 }, null, 2));
}
