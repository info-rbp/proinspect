// Live Stage 2 probes are intentionally GET/SELECT-only.
// They never create login tokens, authorise accounts, change Worker settings,
// or insert synthetic transactions into the deployed production database.
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.env.PROINSPECT_ORIGIN ||
  'https://proinspect-platform.delicate-dream-e4c9.workers.dev';
const account = process.env.CLOUDFLARE_ACCOUNT_ID ||
  '8ca23ac6d2cc906d4dd13b8da5ea2b25';
const expectedDatabase = 'dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea';
const token = process.env.CLOUDFLARE_API_TOKEN;
const report = {
  runAt: new Date().toISOString(),
  origin,
  expectedWorker: 'proinspect-platform',
  expectedDatabaseName: 'proinspect-platform-data',
  observedSource: null,
  mainSha: null,
  checks: [],
  blockers: [],
  failures: [],
  acceptedForProduction: false,
  authenticatedAcceptance: 'not_executed',
  note: 'Passing observational tests is not authenticated cross-portal acceptance.'
};

function check(name, passed, detail = {}, severity = 'failure') {
  const result = passed ? 'PASS' : severity === 'blocker' ? 'BLOCKED' : 'FAIL';
  report.checks.push({ name, result, detail });
  console.log(result + ' ' + name + ' ' + JSON.stringify(detail));
  if (!passed) {
    if (severity === 'blocker') report.blockers.push(name);
    else report.failures.push(name);
  }
  return passed;
}
function requireCondition(value, message) {
  if (!value) throw new Error(message);
  return value;
}
async function getPublic(path) {
  const response = await fetch(origin + path, {
    redirect: 'manual',
    signal: AbortSignal.timeout(16000),
    headers: { Accept: 'application/json' }
  });
  let payload = null;
  if (response.headers.get('content-type')?.includes('application/json')) {
    try { payload = await response.json(); } catch {}
  }
  return { status: response.status, payload };
}
async function cf(path, method = 'GET', body) {
  requireCondition(token, 'CLOUDFLARE_API_TOKEN is missing. No live D1 acceptance claims can be made.');
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json();
  requireCondition(response.ok && data.success,
    'Cloudflare API read failed (HTTP ' + response.status + ', codes: ' +
      JSON.stringify(data.errors?.map(e => e.code) || []) + ')');
  return data.result;
}
async function query(db, sql) {
  requireCondition(/^\s*(SELECT|PRAGMA foreign_key_check\b)/i.test(sql),
    'Stage 2 script prohibits any non-read-only SQL');
  const data = await cf('/accounts/' + account + '/d1/database/' +
    db + '/query', 'POST', { sql });
  requireCondition(Array.isArray(data), 'Unexpected D1 query response');
  return data[0]?.results || [];
}
async function row(db, sql) { return (await query(db, sql))[0] || {}; }

async function run() {
  const health = await getPublic('/api/health');
  check('live_health', health.status === 200 && health.payload?.ok === true,
    { status: health.status });
  if (health.payload) {
    report.observedSource = health.payload.source || null;
    check('live_required_bindings',
      ['database', 'documents', 'scheduler', 'queue'].every(
        n => health.payload.bindings?.[n] === true),
      { bindings: health.payload.bindings });
    check('authentication_configuration_presence',
      health.payload.authenticationConfigured === true,
      { note: 'This does not prove successful real email or Turnstile delivery.' });
  }
  const repoHeaders = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'proinspect-stage2-readonly'
  };
  if (process.env.GITHUB_TOKEN) repoHeaders.Authorization =
    'Bearer ' + process.env.GITHUB_TOKEN;
  const shaResponse = await fetch(
    'https://api.github.com/repos/info-rbp/proinspect/commits/main',
    { headers: repoHeaders, signal: AbortSignal.timeout(15000) });
  requireCondition(shaResponse.ok, 'Could not retrieve the current GitHub main commit.');
  const main = await shaResponse.json();
  report.mainSha = main.sha;
  check('deployed_source_matches_main',
    report.observedSource === report.mainSha,
    { deployed: report.observedSource, main: report.mainSha });

  const settings = await cf('/accounts/' + account +
    '/workers/scripts/proinspect-platform/settings');
  const bindings = requireCondition(settings?.bindings,
    'Worker settings did not include bindings');
  const value = name => bindings.find(x => x.name === name);
  const dbBinding = value('DB');
  const db = dbBinding?.id;
  check('production_environment_flag',
    value('APP_ENV')?.text === 'production',
    { observed: value('APP_ENV')?.text });
  check('origin_agreement', value('APP_ORIGIN')?.text === origin,
    { workerOrigin: value('APP_ORIGIN')?.text, probedOrigin: origin });
  check('worker_database_identity', db === expectedDatabase,
    { matchesExpected: db === expectedDatabase });
  check('deployed_sha_binding',
    value('BUILD_SHA')?.text === report.mainSha,
    { matchesGitHubMain: value('BUILD_SHA')?.text === report.mainSha });
  requireCondition(db === expectedDatabase,
    'D1 binding mismatch: refusing to query an unexpected database');

  const databases = await cf('/accounts/' + account + '/d1/database');
  const expected = databases.find(x => x.uuid === db);
  check('database_name_checked', expected?.name === 'proinspect-platform-data',
    { expectedDatabaseFound: Boolean(expected),
      expectedNameMatched: expected?.name === 'proinspect-platform-data' });

  // Version 3: observational migration history only; no D1 data writes.
  const migrationHistory = await query(db,
    'SELECT id,name,applied_at FROM d1_migrations ORDER BY id');
  report.productionMigrationHistory = migrationHistory.map(({ id,name,applied_at }) => ({ id,name,applied_at }));
  check('production_migration_history_readable', migrationHistory.length > 0,
    { count: migrationHistory.length, latest: migrationHistory.at(-1)?.name || null });
  check('baseline_migration_0006_present', migrationHistory.some(m => m.name === '0006_all_inclusive_subscription.sql'),
    { baseline: '0006_all_inclusive_subscription.sql' }, 'blocker');
  const catalogue = await getPublic('/api/catalogue');
  const services = catalogue.payload?.services;
  check('catalogue_available', catalogue.status === 200 && Array.isArray(services),
    { status: catalogue.status, services: Array.isArray(services) ? services.length : null });

  const routes = [
    ['landlord', '/api/w/landlord/cli_pi_test_landlord'],
    ['property_manager', '/api/w/property-manager/cli_pi_test_agency'],
    ['commercial', '/api/w/commercial/cli_pi_test_commercial'],
    ['tenant', '/api/w/tenant/tnc_pi_test_landlord'],
    ['strata_manager', '/api/w/strata-manager/cli_pi_test_strata'],
    ['building_resident', '/api/w/building/scheme_pi_test'],
    ['strata_council', '/api/w/council/scheme_pi_test'],
    ['staff_admin', '/api/w/staff/operations'],
    ['session', '/api/session']
  ];
  for (const [role, path] of routes) {
    const response = await getPublic(path);
    check('anonymous_access_denied_' + role, response.status === 401,
      { status: response.status });
  }

  const identities = await row(db,
    "SELECT COUNT(*) AS total, " +
    "SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active, " +
    "SUM(CASE WHEN verified_at IS NOT NULL THEN 1 ELSE 0 END) AS verified " +
    "FROM users WHERE email LIKE '%-testing@proinspect.systems'");
  check('test_identities_present',
    identities.total === 8 && identities.active === 8,
    { total: identities.total, active: identities.active });
  check('test_identities_verified', identities.verified === 8,
    { verified: identities.verified, total: identities.total }, 'blocker');

  const memberships = await row(db, [
    "SELECT",
    "(SELECT COUNT(*) FROM client_memberships cm JOIN client_entitlements ce ON ce.client_id=cm.client_id JOIN users u ON u.id=cm.user_id WHERE u.email='landlord-testing@proinspect.systems' AND cm.active=1 AND ce.active=1 AND ce.workspace_kind='landlord') AS landlord,",
    "(SELECT COUNT(*) FROM client_memberships cm JOIN client_entitlements ce ON ce.client_id=cm.client_id JOIN users u ON u.id=cm.user_id WHERE u.email='property-manager-testing@proinspect.systems' AND cm.active=1 AND ce.active=1 AND ce.workspace_kind='property-manager') AS agency,",
    "(SELECT COUNT(*) FROM client_memberships cm JOIN client_entitlements ce ON ce.client_id=cm.client_id JOIN users u ON u.id=cm.user_id WHERE u.email='commercial-testing@proinspect.systems' AND cm.active=1 AND ce.active=1 AND ce.workspace_kind='commercial') AS commercial,",
    "(SELECT COUNT(*) FROM client_memberships cm JOIN client_entitlements ce ON ce.client_id=cm.client_id JOIN users u ON u.id=cm.user_id WHERE u.email='strata-manager-testing@proinspect.systems' AND cm.active=1 AND ce.active=1 AND ce.workspace_kind='strata-manager') AS strata,",
    "(SELECT COUNT(*) FROM tenancy_memberships tm JOIN users u ON u.id=tm.user_id WHERE u.email='tenant-testing@proinspect.systems') AS tenant,",
    "(SELECT COUNT(*) FROM scheme_memberships sm JOIN users u ON u.id=sm.user_id WHERE u.email='building-resident-testing@proinspect.systems' AND sm.role='resident' AND (sm.ends_at IS NULL OR sm.ends_at>CURRENT_TIMESTAMP)) AS resident,",
    "(SELECT COUNT(*) FROM scheme_memberships sm JOIN users u ON u.id=sm.user_id WHERE u.email='building-council-testing@proinspect.systems' AND sm.role='council_member' AND (sm.ends_at IS NULL OR sm.ends_at>CURRENT_TIMESTAMP)) AS council,",
    "(SELECT COUNT(*) FROM staff_profiles sp JOIN users u ON u.id=sp.user_id WHERE u.email='staff-testing@proinspect.systems' AND sp.active=1 AND sp.role='administrator') AS staff"
  ].join(' '));
  const expectedRoles = ['landlord', 'agency', 'commercial', 'strata',
    'tenant', 'resident', 'council', 'staff'];
  check('eight_scoped_portal_relationships',
    expectedRoles.every(n => memberships[n] === 1),
    { relationshipsPresent: expectedRoles.filter(n => memberships[n] === 1),
      missing: expectedRoles.filter(n => memberships[n] !== 1) });

  const operational = await row(db,
    "SELECT (SELECT COUNT(*) FROM sessions WHERE revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP) AS sessions, " +
    "(SELECT COUNT(*) FROM bookings) AS bookings, " +
    "(SELECT COUNT(*) FROM work_orders) AS orders, " +
    "(SELECT COUNT(*) FROM requests) AS requests, " +
    "(SELECT COUNT(*) FROM documents) AS documents, " +
    "(SELECT COUNT(*) FROM notifications) AS notifications");
  check('authenticated_test_session_evidence', operational.sessions > 0,
    { activeSessions: operational.sessions }, 'blocker');
  check('cross_portal_transaction_evidence',
    operational.orders > 0 && operational.requests > 0,
    { bookings: operational.bookings, workOrders: operational.orders,
      requests: operational.requests, documents: operational.documents,
      notifications: operational.notifications }, 'blocker');

  const catalogueModes = await query(db,
    "SELECT booking_mode, COUNT(*) AS services, " +
    "SUM(CASE WHEN price_ex_gst_cents IS NOT NULL THEN 1 ELSE 0 END) AS priced " +
    "FROM services WHERE active=1 GROUP BY booking_mode");
  check('instant_booking_ready',
    catalogueModes.some(x => x.booking_mode === 'instant' && x.priced > 0),
    { modeSummary: catalogueModes }, 'blocker');

  const integrity = await query(db, 'PRAGMA foreign_key_check');
  check('database_foreign_key_integrity', integrity.length === 0,
    { violations: integrity.length });

  const canonical = await fetch('https://proinspect.systems/api/health', {
    redirect: 'manual', signal: AbortSignal.timeout(15000)
  });
  let canonicalData = null;
  if (canonical.headers.get('content-type')?.includes('application/json')) {
    try { canonicalData = await canonical.json(); } catch {}
  }
  check('canonical_domain_unified',
    canonical.status === 200 && canonicalData?.source === report.mainSha,
    { status: canonical.status,
      note: 'Retain existing report/signing routes during a reviewed cutover.' },
    'blocker');
}
try {
  await run();
} catch (error) {
  check('audit_execution', false, { error: String(error.message || error) });
} finally {
  // Observations cannot substitute for real authenticated portal interactions.
  report.readOnlyChecksPassed = report.failures.length === 0;
  report.acceptedForProduction = false;
  report.authenticatedAcceptance = 'not_executed';
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/stage2-live-readonly.json',
    JSON.stringify(report, null, 2) + '\n');
  console.log('Stage 2 read-only probe failures: ' + report.failures.length +
    '; acceptance blockers: ' + report.blockers.length);
  if (report.failures.length > 0) process.exitCode = 1;
}
