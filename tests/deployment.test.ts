import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Deployment tooling is intentionally plain JavaScript.
import { resourceNames, stagingConfigurations } from '../scripts/deploy/staging.mjs';
test('staging bootstrap cannot target production or a legacy application', () => {
  assert.throws(() => resourceNames('production'));
  for (const name of Object.values(resourceNames())) assert.match(String(name), /^proinspect-v2-staging-/);
});
test('generated staging configuration separates storage, origins and queues', () => {
  const c = stagingConfigurations({ name: 'local-platform' }, { name: 'local-marketing' }, {
    subdomain: 'example-account', databaseId: '11111111-1111-1111-1111-111111111111', sourceSha: 'a'.repeat(40),
  });
  assert.equal(c.receipt.deployed, false);
  assert.notEqual(c.receipt.appOrigin, c.receipt.marketingOrigin);
  assert.equal(c.platform.env.staging.vars.APP_ENV, 'staging');
  assert.notEqual(c.platform.env.staging.r2_buckets[0].bucket_name, c.platform.env.staging.r2_buckets[1].bucket_name);
  assert.equal(c.platform.env.staging.queues.consumers[0].dead_letter_queue, resourceNames().deadLetter);
  assert.equal(c.marketing.env.staging.vars.PLATFORM_ORIGIN, c.receipt.appOrigin);
  assert.equal('routes' in c.platform.env.staging, false);
});
