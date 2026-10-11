import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-expect-error Cloudflare build preparation is a standalone JS script.
import { directConfiguration, prepareDirectBuild } from '../scripts/deploy/prepare-direct.mjs';
const config = () => JSON.parse(readFileSync('apps/platform/wrangler.jsonc', 'utf8'));

test('Cloudflare prepares production bindings directly without an extra GitHub workflow', () => {
  const result = directConfiguration(config(), { sha: 'a'.repeat(40), appOrigin: 'https://proinspect-platform.example.workers.dev' });
  assert.equal(result.env.connected.name, 'proinspect-platform');
  assert.equal(result.env.connected.vars.APP_ENV, 'production');
  assert.equal(result.env.connected.vars.APP_ORIGIN, 'https://proinspect-platform.example.workers.dev');
  assert.equal(result.env.connected.vars.BUILD_SHA, 'a'.repeat(40));
  assert.equal(result.env.connected.d1_databases[0].database_id, undefined);
  assert.equal(prepareDirectBuild({ WORKERS_CI: '0' }), false);
});
test('rejects incorrect application origin and source commit', () => {
  for (const origin of ['http://test.example', 'https://test.example/path', 'https://a:b@test.example'])
    assert.throws(() => directConfiguration(config(), { appOrigin: origin }));
  assert.throws(() => directConfiguration(config(), { sha: 'invalid' }));
  const bad = config(); bad.env.connected.vars.APP_ENV = 'local';
  assert.throws(() => directConfiguration(bad));
});
test('existing Worker preserves cf-v1 Durable Objects and creates an independent scheduler', () => {
  const live = directConfiguration(config()).env.connected;
  assert.deepEqual(live.migrations, [
    { tag: 'cf-v1', new_sqlite_classes: ['BookingCoordinator'] },
    { tag: 'v1', new_sqlite_classes: ['BookingScheduler'] },
  ]);
  assert.deepEqual(live.durable_objects.bindings, [
    { name: 'SCHEDULER', class_name: 'BookingScheduler' },
  ]);
  for (const migration of live.migrations) {
    assert.ok(!('deleted_classes' in migration));
    assert.ok(!('renamed_classes' in migration));
  }
  const workerEntry = readFileSync('apps/platform/worker/app.ts', 'utf8');
  const adapter = readFileSync('apps/platform/worker/legacy-booking-coordinator.ts', 'utf8');
  assert.match(workerEntry, /export \{ BookingCoordinator \} from '\.\/legacy-booking-coordinator'/);
  assert.match(workerEntry, /export \{ BookingScheduler \} from '\.\/scheduler'/);
  assert.match(adapter, /class BookingCoordinator extends DurableObject/);
  assert.match(adapter, /status: 503/);
  assert.doesNotMatch(adapter, /this\.ctx\.storage|this\.state\.storage|\.deleteAll\(/);
});

test('direct deploy rejects accidental retirement of legacy Durable Objects', () => {
  const missingHistory = config();
  missingHistory.env.connected.migrations = [{ tag: 'v1', new_sqlite_classes: ['BookingScheduler'] }];
  assert.throws(() => directConfiguration(missingHistory), /Keep cf-v1/);
  const destructive = config();
  destructive.env.connected.migrations.push({tag:'delete-legacy',deleted_classes:['BookingCoordinator']});
  assert.throws(() => directConfiguration(destructive), /Keep cf-v1/);
});

test('reuse the previously provisioned restricted R2 bucket across Cloudflare build retries', () => {
  const live = directConfiguration(config()).env.connected;
  assert.deepEqual(live.r2_buckets, [
    { binding: 'DOCUMENTS' },
    { binding: 'RESTRICTED_DOCUMENTS', bucket_name: 'proinspect-platform-restricted-documents' },
  ]);
  assert.notEqual(live.r2_buckets[0].bucket_name, live.r2_buckets[1].bucket_name);
});

test('reject a restricted R2 binding that would provoke duplicate auto-provisioning or share ordinary storage', () => {
  const missing = config();
  delete missing.env.connected.r2_buckets[1].bucket_name;
  assert.throws(() => directConfiguration(missing), /must reuse the existing/);
  const renamed = config();
  renamed.env.connected.r2_buckets[1].bucket_name = 'some-new-bucket';
  assert.throws(() => directConfiguration(renamed), /must reuse the existing/);
  const shared = config();
  shared.env.connected.r2_buckets[0].bucket_name = 'proinspect-platform-restricted-documents';
  assert.throws(() => directConfiguration(shared), /must have separate R2/);
});
