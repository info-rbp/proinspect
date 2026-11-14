import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = new URL('../../', import.meta.url);
const sourcePath = new URL('apps/platform/wrangler.jsonc', root);
const pointerPath = new URL('apps/platform/.wrangler/deploy/config.json', root);
const stagingOrigin = 'https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev';

export function assertStagingPreview(config) {
  assert.equal(config.name, 'proinspect-v3-staging', 'Preview must target the existing staging Worker');
  assert.equal(config.vars?.APP_ENV, 'staging');
  assert.equal(config.vars?.EMAIL_PROVIDER, 'local');
  for (const name of ['APP_ORIGIN', 'MARKETING_ORIGIN', 'PLATFORM_ORIGIN'])
    assert.equal(config.vars?.[name], stagingOrigin);
  for (const [name, value] of Object.entries(config.vars ?? {}))
    if (name.endsWith('_ENABLED')) assert.equal(value, 'false', name + ' must remain disabled');
  assert.equal(config.d1_databases?.length, 1);
  assert.equal(config.d1_databases[0].binding, 'DB');
  assert.equal(config.d1_databases[0].database_id, 'e66b8ebc-637d-4737-8d47-b0fbec3c082c');
  assert.equal(config.d1_databases[0].database_name, 'proinspect-v3-staging-data');
  assert.deepEqual(config.r2_buckets?.map(bucket => [bucket.binding, bucket.bucket_name]), [
    ['DOCUMENTS', 'proinspect-v3-staging-documents'],
    ['RESTRICTED_DOCUMENTS', 'proinspect-v3-staging-restricted'],
  ]);
  assert.deepEqual(config.queues?.producers, [{ binding: 'EVENTS', queue: 'proinspect-v3-staging-events' }]);
  for (const consumer of config.queues?.consumers ?? []) {
    assert.equal(consumer.queue, 'proinspect-v3-staging-events');
    assert.equal(consumer.dead_letter_queue, 'proinspect-v3-staging-events-dlq');
  }
  assert.deepEqual(config.durable_objects?.bindings, [{ name: 'SCHEDULER', class_name: 'BookingScheduler' }]);
  assert.deepEqual(config.migrations, [{ tag: 'v1', new_sqlite_classes: ['BookingScheduler'] }]);
  assert.equal(config.triggers?.crons?.length ?? 0, 0);
  for (const forbidden of ['dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea', 'proinspect-platform-data',
    'proinspect-production-documents', 'proinspect-platform-restricted-documents', 'proinspect-platform-events'])
    assert.ok(!JSON.stringify(config).includes(forbidden), 'Production resource in Preview configuration');
}

export function assertStagingBuildEnvironment(env) {
  assert.equal(env.WRANGLER_CI_OVERRIDE_NAME ?? 'proinspect-v3-staging', 'proinspect-v3-staging');
  assert.equal(env.WRANGLER_CI_MATCH_TAG ?? '74e503e70f874565a01fee474e447922', '74e503e70f874565a01fee474e447922');
}

function compiledConfiguration() {
  const pointer = JSON.parse(readFileSync(pointerPath, 'utf8'));
  assert.equal(typeof pointer.configPath, 'string');
  const configPath = new URL(pointer.configPath, pointerPath);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assertStagingPreview(config);
  return configPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const action = process.argv[2];
  assert.ok(['build', 'deploy'].includes(action), 'Specify build or deploy');
  assertStagingBuildEnvironment(process.env);
  assertStagingPreview(JSON.parse(readFileSync(sourcePath, 'utf8')).env.staging);
  const env = { ...process.env, WORKERS_CI: '0', CLOUDFLARE_ENV: 'staging' };
  if (action === 'build') {
    execFileSync('pnpm', ['--dir', 'apps/platform', 'build'], { cwd: root, env, stdio: 'inherit' });
    compiledConfiguration();
  } else {
    const configPath = compiledConfiguration();
    const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    assert.match(sourceSha, /^[a-f0-9]{40}$/);
    execFileSync('pnpm', ['--dir', 'apps/platform', 'exec', 'wrangler', 'deploy', '--config', configPath.pathname,
      '--var', 'BUILD_SHA:' + sourceSha],
      { cwd: root, env: { ...env, CLOUDFLARE_ENV: '' }, stdio: 'inherit' });
  }
}
