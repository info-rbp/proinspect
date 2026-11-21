import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertStagingPreview } from './staging-preview.mjs';
const branch = 'implementation/residential-only-pivot-20261121';
const source = JSON.parse(readFileSync('apps/platform/wrangler.jsonc', 'utf8'));
assertStagingPreview(source.env.staging);
assert.equal(process.env.GITHUB_REPOSITORY, 'info-rbp/proinspect');
assert.equal(
  process.env.GITHUB_REF,
  'refs/heads/' + branch,
  'Only the Residential implementation branch may use this preview',
);
assert.equal(process.env.GITHUB_EVENT_NAME, 'push');
assert.equal(process.env.WORKERS_CI ?? '0', '0');
assert.ok(!process.env.WRANGLER_CI_OVERRIDE_NAME, 'No Worker name override');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(sha, process.env.GITHUB_SHA);
const env = { ...process.env, WORKERS_CI: '0', CLOUDFLARE_ENV: '' };
const run = (args) => execFileSync('pnpm', args, { env, stdio: 'inherit' });
// Only the previously verified isolated staging database; preserve all data.
run([
  'exec',
  'wrangler',
  'd1',
  'migrations',
  'apply',
  'DB',
  '--remote',
  '--config',
  'apps/platform/wrangler.jsonc',
  '--env',
  'staging',
]);
run(['exec', 'node', 'scripts/deploy/staging-preview.mjs', 'build']);
run(['exec', 'node', 'scripts/deploy/staging-preview.mjs', 'deploy']);
const origin = 'https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev';
const health = await fetch(origin + '/api/health');
assert.ok(health.ok);
assert.equal((await health.json()).source, sha);
for (const path of ['/commercial', '/strata', '/construction']) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 410, path);
}
const page = await fetch(origin + '/residential');
assert.equal(page.status, 200);
const html = await page.text();
assert.ok(html.includes('Residential All Inclusive Subscription'));
assert.ok(html.includes('60 days'));
console.log('Isolated staging source and Residential/retired-route smoke verified: ' + sha);
