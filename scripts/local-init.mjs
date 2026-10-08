import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { catalogueSql } from './catalogue-sql.mjs';
// This command can only address the local Wrangler database. It never accepts --remote.
if (process.argv.includes('--remote'))
  throw new Error('Local init does not support remote targets.');
const root = process.cwd(),
  app = resolve(root, 'apps/platform');
mkdirSync('artifacts', { recursive: true });
const variables = resolve(app, '.dev.vars');
if (!existsSync(variables))
  writeFileSync(variables, `DATA_ENCRYPTION_KEY="${randomBytes(32).toString('base64')}"\n`, {
    mode: 0o600,
  });
// Share only the dedicated local enquiry transport secret, never the data encryption key.
const marketingVars = resolve(root, 'apps/marketing/.dev.vars');
const existingGateway = readFileSync(variables, 'utf8').match(
  /^ENQUIRY_GATEWAY_SECRET="([^"\n]+)"/m,
)?.[1];
const gateway = existingGateway || randomBytes(32).toString('hex');
if (!existingGateway)
  appendFileSync(variables, `ENQUIRY_GATEWAY_SECRET="${gateway}"\n`, { mode: 0o600 });
if (!existsSync(marketingVars))
  writeFileSync(marketingVars, `ENQUIRY_GATEWAY_SECRET="${gateway}"\n`, { mode: 0o600 });
else if (!readFileSync(marketingVars, 'utf8').includes('ENQUIRY_GATEWAY_SECRET='))
  appendFileSync(marketingVars, `ENQUIRY_GATEWAY_SECRET="${gateway}"\n`);
const testFixtures = process.argv.includes('--test-fixtures');
let sql =
  catalogueSql() +
  "\nINSERT INTO schedule_resources(id,name,active) VALUES('default','ProInspect inspection capacity',1) ON CONFLICT(id) DO NOTHING;\n";
if (testFixtures)
  sql +=
    "UPDATE services SET price_ex_gst_cents=12000,booking_mode='instant' WHERE id='routine-inspection';\nINSERT INTO users(id,email,display_name,created_at,verified_at) VALUES('usr_test_staff','staff@proinspect.test','Test Operations','2026-01-01','2026-01-01') ON CONFLICT(id) DO NOTHING;\nINSERT INTO staff_profiles(user_id,role,active) VALUES('usr_test_staff','operations_manager',1) ON CONFLICT(user_id) DO NOTHING;\n";
// Distinct local fixture accounts keep browser suites independent without weakening sign-in limits.
if (testFixtures)
  sql +=
    "INSERT INTO users(id,email,display_name,created_at,verified_at) VALUES('usr_test_communications','communications-staff@proinspect.test','Test Communications','2026-01-01','2026-01-01') ON CONFLICT(id) DO NOTHING;\nINSERT INTO staff_profiles(user_id,role,active) VALUES('usr_test_communications','operations_manager',1) ON CONFLICT(user_id) DO NOTHING;\n";
if (testFixtures)
  sql +=
    "INSERT INTO users(id,email,display_name,created_at,verified_at) VALUES('usr_test_review','review-staff@proinspect.test','Test Review','2026-01-01','2026-01-01') ON CONFLICT(id) DO NOTHING;\nINSERT INTO staff_profiles(user_id,role,active) VALUES('usr_test_review','operations_manager',1) ON CONFLICT(user_id) DO NOTHING;\n";
writeFileSync('artifacts/local-seed.sql', sql);
execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'DB', '--local'], {
  cwd: app,
  stdio: 'inherit',
});
execFileSync(
  'pnpm',
  [
    'exec',
    'wrangler',
    'd1',
    'execute',
    'DB',
    '--local',
    '--file',
    resolve(root, 'artifacts/local-seed.sql'),
  ],
  { cwd: app, stdio: 'inherit' },
);
console.log(
  testFixtures
    ? 'Local test database initialised with synthetic staff and an explicitly synthetic test price.'
    : 'Local database initialised. Publish approved service prices before opening instant booking.',
);
