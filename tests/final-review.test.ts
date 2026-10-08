import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { seal, unseal } from '../packages/auth/crypto.ts';
// @ts-expect-error Repository tooling is plain JavaScript.
import * as config from '../scripts/configuration.mjs';
const {checkConfiguration,environmentManifest,secretTargets,requireRepositoryAcceptance}=config;
// @ts-expect-error Repository tooling is plain JavaScript.
import { stagingConfigurations } from '../scripts/deploy/staging.mjs';
import { SERVICE_SEEDS } from '../packages/service-catalogue/index.ts';
import { SERVICE_FOCUS, GUIDES } from '../packages/marketing/content.ts';
test('configuration inventory covers runtime bindings and separates marketing secrets', () => {
  const text = readFileSync('packages/database/types.ts', 'utf8').split(
      'export interface CloudflareContext',
    )[0],
    known = new Set([
      ...Object.keys(environmentManifest.secrets),
      ...Object.keys(environmentManifest.variables),
      ...environmentManifest.generated,
      ...environmentManifest.bindings,
    ]);
  for (const m of text.matchAll(/^  ([A-Z][A-Z_]+)\??:/gm)) assert.ok(known.has(m[1]), m[1]);
  assert.deepEqual(secretTargets('marketing'), ['ENQUIRY_GATEWAY_SECRET']);
  assert.ok(!secretTargets('platform').includes('CLOUDFLARE_API_TOKEN'));
});
test('configuration errors reveal names not values and require accepted source', () => {
  const marker = 'sensitive-credential-marker-not-for-output',
    r = checkConfiguration({
      DATA_ENCRYPTION_KEY: marker,
      REPORT_TOOL_SECRET: marker,
      STRIPE_SECRET_KEY: 'sk_live_' + marker,
    });
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes('STRIPE_WEBHOOK_SECRET'));
  assert.ok(r.missing.includes('REPORT_TOOL_ORIGIN'));
  assert.ok(!JSON.stringify(r).includes(marker));
  assert.equal(r.remoteCalls, 0);
  assert.throws(() => requireRepositoryAcceptance({ SOURCE_SHA: 'a'.repeat(40) }));
  assert.throws(() =>
    requireRepositoryAcceptance({
      SOURCE_SHA: 'a'.repeat(40),
      REPOSITORY_ACCEPTED_SHA: 'b'.repeat(40),
    }),
  );
});
test('complete configuration validates while unsafe release settings fail', () => {
  const input = {
    CLOUDFLARE_API_TOKEN: 'synthetic-ci',
    CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
    DATA_ENCRYPTION_KEY: Buffer.from(randomBytes(32)).toString('base64'),
    RESEND_API_KEY: 'synthetic-resend',
    TURNSTILE_SECRET_KEY: 'synthetic-login',
    MARKETING_TURNSTILE_SECRET_KEY: 'synthetic-enquiry',
    ENQUIRY_GATEWAY_SECRET: Buffer.from(randomBytes(32)).toString('hex'),
    EMAIL_FROM: 'ProInspect <noreply@example.test>',
    OPERATIONS_EMAIL: 'operations@example.test',
    EMAIL_SINK: 'tester@example.test',
    TURNSTILE_SITE_KEY: 'site-login',
    MARKETING_TURNSTILE_SITE_KEY: 'site-marketing',
  };
  assert.equal(checkConfiguration(input).ok, true);
  assert.equal(checkConfiguration({ ...input, RESTRICTED_WORKFLOWS_ENABLED: 'true' }).ok, false);
  assert.equal(checkConfiguration(input, { environment: 'production' }).ok, false);
  assert.equal(
    checkConfiguration({ ...input, EMAIL_SINK: '' }, { environment: 'production' }).ok,
    true,
  );
  const c = stagingConfigurations(
    {},
    {},
    {
      subdomain: 'fixture',
      databaseId: '11111111-1111-1111-1111-111111111111',
      sourceSha: 'a'.repeat(40),
      marketingTurnstileSiteKey: 'site-marketing',
      reportToolOrigin: 'https://reports.example.test',
    },
  );
  assert.equal(c.marketing.env.staging.vars.MARKETING_TURNSTILE_SITE_KEY, 'site-marketing');
  assert.equal(c.platform.env.staging.vars.RESTRICTED_WORKFLOWS_ENABLED, 'false');
  assert.equal(c.platform.env.staging.vars.REPORT_TOOL_ORIGIN, 'https://reports.example.test');
});
test('large encrypted envelopes avoid the argument stack limit and remain context bound', async () => {
  const key = Buffer.from(randomBytes(32)).toString('base64'),
    value = { text: 'Private Unicode \u03a9 '.repeat(24000) },
    encrypted = await seal(key, 'large:record', value);
  assert.deepEqual(await unseal(key, 'large:record', encrypted), value);
  await assert.rejects(() => unseal(key, 'wrong:context', encrypted));
});
test('service decision content covers the catalogue and links to existing services', () => {
  const ids = new Set(SERVICE_SEEDS.map((s) => s.id));
  for (const s of SERVICE_SEEDS) assert.ok(SERVICE_FOCUS[s.id], s.id);
  for (const g of Object.values(GUIDES)) for (const id of g.services) assert.ok(ids.has(id), id);
});
