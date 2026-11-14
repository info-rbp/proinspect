import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertStagingPreview, assertStagingBuildEnvironment } from '../scripts/deploy/staging-preview.mjs';

const configuration = () => JSON.parse(readFileSync('apps/platform/wrangler.jsonc', 'utf8'));

test('Preview refuses CI variables that override the validated staging Worker target', () => {
  assert.doesNotThrow(() => assertStagingBuildEnvironment({}));
  assert.throws(() => assertStagingBuildEnvironment({ WRANGLER_CI_OVERRIDE_NAME: 'proinspect-platform' }));
  assert.throws(() => assertStagingBuildEnvironment({ WRANGLER_CI_MATCH_TAG: 'df86f2a67d954ba6aa57a05648379d06' }));
});

test('Preview accepts existing staging bindings and rejects the production configuration', () => {
  assert.doesNotThrow(() => assertStagingPreview(configuration().env.staging));
  assert.throws(() => assertStagingPreview(configuration().env.connected));
});

test('Preview refuses production DB, R2, queues, enabled billing, external mail and scheduled execution', () => {
  const changes = [
    config => { config.d1_databases[0].database_id = 'dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea'; },
    config => { config.r2_buckets[0].bucket_name = 'proinspect-production-documents'; },
    config => { config.queues.producers[0].queue = 'proinspect-platform-events'; },
    config => { config.vars.STRIPE_BILLING_ENABLED = 'true'; },
    config => { config.vars.EMAIL_PROVIDER = 'resend'; },
    config => { config.triggers.crons = ['*/2 * * * *']; },
    config => { delete config.d1_databases[0].database_id; },
  ];
  for (const change of changes) {
    const config = configuration().env.staging;
    change(config);
    assert.throws(() => assertStagingPreview(config));
  }
});
