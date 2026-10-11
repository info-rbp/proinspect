import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('Cloudflare native main deploy has no manual GitHub connector dependency', () => {
  const platform = JSON.parse(readFileSync('apps/platform/wrangler.jsonc','utf8'));
  assert.equal(platform.env.connected.name, 'proinspect-platform');
  assert.notEqual(platform.env.connected.vars.APP_ENV, 'staging');
  assert.equal(platform.env.connected.d1_databases[0].database_id, undefined);
  assert.equal(existsSync('scripts/deploy/connect-platform.mjs'), false);
  assert.equal(existsSync('scripts/deploy/stamp-connected.mjs'), false);
});