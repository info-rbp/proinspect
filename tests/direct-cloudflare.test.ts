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