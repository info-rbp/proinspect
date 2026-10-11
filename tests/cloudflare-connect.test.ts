import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error JS deployment utility has no ambient types.
import * as cloudflareConnector from '../scripts/deploy/connect-platform.mjs';
const { connectedConfiguration, BUILD_SETTINGS, CONNECTED_WORKER } = cloudflareConnector;

test('connected config uses an isolated D1 and existing Worker name, not old local resources', () => {
  const original = {
    name: 'proinspect-platform-local',
    env: {} as Record<string, any>,
    triggers: { crons: ['*/2 * * * *'] },
    migrations: [{ tag: 'v1', new_sqlite_classes: ['BookingScheduler'] }],
  };
  const result = connectedConfiguration(original, {
    subdomain: 'example-workers',
    databaseId: '11111111-2222-3333-4444-555555555555',
    sourceSha: 'a'.repeat(40),
  });
  const c = result.configuration.env.connected;
  assert.equal(c.name, CONNECTED_WORKER);
  assert.equal(c.vars.APP_ENV, 'staging');
  assert.equal(c.vars.APP_ORIGIN, 'https://proinspect-platform.example-workers.workers.dev');
  assert.equal(c.d1_databases[0].binding, 'DB');
  assert.equal(c.d1_databases[0].database_id, '11111111-2222-3333-4444-555555555555');
  assert.equal(c.d1_databases[0].database_name, 'proinspect-v2-staging-data');
  assert.notEqual(c.r2_buckets[0].bucket_name, c.r2_buckets[1].bucket_name);
  assert.ok(c.migrations[0].new_sqlite_classes.includes('BookingScheduler'));
  assert.equal(c.triggers.crons[0], '*/2 * * * *');
  assert.equal(result.receipt.newIsolatedResources, true);
  assert.equal(original.env.connected, undefined);
});

test('connected build must explicitly target one package, and preserve main branch source isolation', () => {
  assert.equal(BUILD_SETTINGS.root_directory, '/');
  assert.match(
    BUILD_SETTINGS.build_command,
    /CLOUDFLARE_ENV=connected pnpm --dir apps\/platform build/,
  );
  assert.equal(BUILD_SETTINGS.deploy_command, 'pnpm --dir apps/platform exec wrangler deploy');
});