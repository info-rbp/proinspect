import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('subscription prices are pinned to authorised Stripe sandbox price IDs',()=>{
 const code=readFileSync('apps/platform/worker/features/stripe-billing.server.ts','utf8');
 assert.match(code,/price_1UUOxKEv62nbUZoksUBo5igf/);
 assert.match(code,/price_1UUOxMEv62nbUZokN7kLvP4B/);
 assert.match(code,/Unsupported subscription sector/);
});
test('server-side pricing and billing guards require staging, sandbox and valid tax configuration',()=>{
 const code=readFileSync('apps/platform/worker/features/stripe-billing.server.ts','utf8')+readFileSync('apps/platform/worker/features/stripe-client.server.ts','utf8');
 for(const needle of ["env.APP_ENV", "env.STRIPE_BILLING_ENABLED", "env.STRIPE_TAX_READY", "env.STRIPE_ACCOUNT_ID===SANDBOX_ACCOUNT"])
  assert.ok(code.includes(needle),needle);
});
test('staging and production feature flags are initially disabled',()=>{
 const cfg=JSON.parse(readFileSync('apps/platform/wrangler.jsonc','utf8'));
 assert.equal(cfg.env.staging.vars.STRIPE_BILLING_ENABLED,'false');
 assert.equal(cfg.env.staging.vars.STRIPE_GUEST_CHECKOUT_ENABLED,'false');
 assert.equal(cfg.env.staging.vars.STRIPE_TAX_READY,'false');
 assert.equal(cfg.env.connected.vars.STRIPE_BILLING_ENABLED,'false');
});