import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertStagingPreview, assertStagingBuildEnvironment, isApprovedStagingPreview } from '../scripts/deploy/staging-preview.mjs';

test('shared staging preview accepts only the named repository and authorised branches', () => {
  const environment = { PR01_STAGING_PREVIEW: '1', GITHUB_REPOSITORY: 'info-rbp/proinspect', GITHUB_EVENT_NAME: 'pull_request' };
  for (const branch of ['feat/pr01-account-driven-client-portal', 'feat/public-site-services-refresh', 'feat/public-content-final-alignment', 'feat/residential-application-readiness', 'feat/commercial-dynamic-application', 'feat/managed-property-application-routing', 'feat/private-managed-document-scanning', 'fix/managed-rental-application-availability', 'feat/temporary-rental-document-delivery', 'integrate/public-offering-portals-20261116']) {
    assert.equal(isApprovedStagingPreview({ ...environment, GITHUB_HEAD_REF: branch }), true);
    assert.equal(isApprovedStagingPreview({ ...environment, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/' + branch }), true);
  }
  assert.equal(isApprovedStagingPreview({ ...environment, GITHUB_HEAD_REF: 'main' }), false);
  assert.equal(isApprovedStagingPreview({ ...environment, GITHUB_HEAD_REF: 'feat/public-site-services-refresh', GITHUB_REPOSITORY: 'another/repository' }), false);
  assert.equal(isApprovedStagingPreview({ ...environment, GITHUB_HEAD_REF: 'feat/public-site-services-refresh', PR01_STAGING_PREVIEW: '0' }), false);
  assert.equal(isApprovedStagingPreview({ ...environment, GITHUB_EVENT_NAME: 'push', GITHUB_HEAD_REF: 'feat/public-site-services-refresh' }), false);
});

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
