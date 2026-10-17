import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('Cloudflare builds main directly without a GitHub Actions deployment workflow', () => {
  assert.equal(existsSync('.github/workflows/connect-cloudflare-platform.yml'), false);
  assert.equal(existsSync('.github/workflows/deploy-staging.yml'), false);
  const verification = readFileSync('.github/workflows/verify.yml', 'utf8');
  assert.match(verification, /branches: \[main\]/);
  assert.doesNotMatch(verification, /wrangler deploy(?! --dry-run)/);
});

test('the intended Cloudflare connected configuration is production, not local', () => {
  const config = JSON.parse(readFileSync('apps/platform/wrangler.jsonc', 'utf8'));
  const live = config.env.connected;
  assert.equal(live.name, 'proinspect-platform');
  assert.equal(live.vars.APP_ENV, 'production');
  assert.equal(live.vars.EMAIL_PROVIDER, 'resend');
  // Direct Cloudflare Workers Builds replaces plaintext variables from the
  // connected config. Keeping both addresses here prevents future deployments
  // from silently disabling passwordless sign-in and operational emails.
  assert.equal(live.vars.EMAIL_FROM, 'info@proinspect.systems');
  assert.equal(live.vars.OPERATIONS_EMAIL, 'info@proinspect.systems');
  assert.match(live.vars.APP_ORIGIN, /^https:\/\//);
  assert.equal(live.vars.RESTRICTED_WORKFLOWS_ENABLED, 'false');
  assert.notDeepEqual(live.r2_buckets, config.r2_buckets);
  assert.deepEqual(live.r2_buckets.map((x: { binding: string }) => x.binding), ['DOCUMENTS','RESTRICTED_DOCUMENTS']);
  assert.equal(live.d1_databases.length, 1);
  assert.equal(live.d1_databases[0].binding, 'DB');
  assert.equal(live.d1_databases[0].database_name, 'proinspect-platform-data');
  assert.equal(live.d1_databases[0].database_id, undefined);
  assert.notEqual(live.queues.producers[0].queue, config.queues.producers[0].queue);
  assert.equal(live.durable_objects.bindings[0].class_name, 'BookingScheduler');
  assert.ok(live.migrations.some((m: { new_sqlite_classes?: string[] }) => m.new_sqlite_classes?.includes('BookingScheduler')));
});