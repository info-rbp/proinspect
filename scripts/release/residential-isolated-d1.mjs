/** Actual local Cloudflare D1 migration and recovery; synthetic fixtures only. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const root = resolve('.'),
  tmp = mkdtempSync(join(tmpdir(), 'residential-d1-0063-'));
const migrations = join(tmp, 'migrations'),
  persist = join(tmp, 'd1'),
  config = join(tmp, 'wrangler.json');
const evidence = {
  scope: 'isolated local Cloudflare D1; synthetic records only',
  hostedRestoreAccepted: false,
  sourceSha: process.env.GITHUB_SHA ?? 'local',
  checks: [],
  passed: false,
};
const check = (name, ok) => {
  assert.ok(ok, name);
  evidence.checks.push(name);
};
const wrangler = (args) =>
  execFileSync(
    'pnpm',
    ['exec', 'wrangler', ...args, '--config', config, '--local', '--persist-to', persist],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, CI: 'true' } },
  );
const query = (sql) =>
  JSON.parse(wrangler(['d1', 'execute', 'DB', '--command', sql, '--json']).trim()).flatMap((r) => {
    assert.notEqual(r.success, false);
    return r.results ?? [];
  });
const file = () => {
  const files = readdirSync(persist, { recursive: true }).filter(
    (n) => n.endsWith('.sqlite') && basename(n) !== 'metadata.sqlite',
  );
  assert.equal(files.length, 1);
  return join(persist, files[0]);
};
try {
  const names = readdirSync('database/migrations')
    .filter((n) => /^\d{4}_.*\.sql$/.test(n))
    .sort();
  check(
    'complete additive 0001–0063 migration sequence',
    names.length === 63 && names.every((n, i) => n.startsWith(String(i + 1).padStart(4, '0'))),
  );
  mkdirSync(migrations);
  for (const name of names.slice(0, 62))
    copyFileSync(join(root, 'database/migrations', name), join(migrations, name));
  writeFileSync(
    config,
    JSON.stringify({
      name: 'residential-recovery-local',
      compatibility_date: '2026-07-01',
      d1_databases: [
        {
          binding: 'DB',
          database_id: 'residential-recovery-local',
          database_name: 'residential-recovery-local',
          migrations_dir: './migrations',
        },
      ],
    }),
  );
  wrangler(['d1', 'migrations', 'apply', 'DB']);
  query(
    "INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('recovery_fixture','Synthetic home','Perth','6000','residential-recovery','residential','2026-11-21')",
  );
  const expected = query("SELECT * FROM properties WHERE id='recovery_fixture'");
  const backup = join(tmp, 'before-0063.sqlite');
  copyFileSync(file(), backup);
  copyFileSync(join(root, 'database/migrations', names[62]), join(migrations, names[62]));
  wrangler(['d1', 'migrations', 'apply', 'DB']);
  check(
    '0063 applied with no foreign key errors',
    query('SELECT COUNT(*) n FROM d1_migrations')[0].n === 63 &&
      query('PRAGMA foreign_key_check').length === 0,
  );
  check(
    'new immutable contract and notice tables exist',
    query(
      "SELECT name FROM sqlite_master WHERE name IN ('residential_subscription_contracts','residential_cancellation_notices')",
    ).length === 2,
  );
  assert.deepEqual(query("SELECT * FROM properties WHERE id='recovery_fixture'"), expected);
  query("UPDATE properties SET address='Synthetic damage' WHERE id='recovery_fixture'");
  // Each Wrangler process has exited. Restore the entire isolated D1 file, not selected rows.
  const target = file();
  for (const suffix of ['', '-wal', '-shm']) rmSync(target + suffix, { force: true });
  copyFileSync(backup, target);
  assert.deepEqual(query("SELECT * FROM properties WHERE id='recovery_fixture'"), expected);
  check(
    'actual restored D1 returns to 0062 with historical row intact',
    query('SELECT COUNT(*) n FROM d1_migrations')[0].n === 62,
  );
  wrangler(['d1', 'migrations', 'apply', 'DB']);
  check(
    '0063 safely reapplies after recovery',
    query('SELECT COUNT(*) n FROM d1_migrations')[0].n === 63 &&
      query('PRAGMA foreign_key_check').length === 0,
  );
  const db = new DatabaseSync(file(), { readOnly: true });
  try {
    check(
      'restored and upgraded database integrity',
      db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok',
    );
  } finally {
    db.close();
  }
  evidence.passed = true;
  console.log('PASS: local D1 0062 → 0063, full recovery to 0062 and reapply');
} catch (error) {
  evidence.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/residential-isolated-d1.json', JSON.stringify(evidence, null, 2) + '\n');
  rmSync(tmp, { recursive: true, force: true });
}
