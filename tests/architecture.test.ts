import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function readConfig(path: string) {
  const result = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
  assert.equal(result.error, undefined);
  return result.config;
}

test('two distinct Workers, no legacy runtime', () => {
  const platform = readConfig('apps/platform/wrangler.jsonc');
  const marketing = readConfig('apps/marketing/wrangler.jsonc');
  assert.notEqual(platform.name, marketing.name);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const forbidden of ['firebase', 'firebase-admin', 'express', 'googleapis']) {
    assert.equal(pkg.dependencies[forbidden], undefined);
  }
});
