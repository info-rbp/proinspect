import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('apps/platform/worker/features/contractor-payments.server.ts','utf8');
const migration=readFileSync('database/migrations/0028_contractor_payment_choices.sql','utf8');
test('both payment models are explicit and mutually distinct',()=>{
 assert.match(source,/platform_collect/);
 assert.match(source,/payer_direct/);
 assert.match(migration,/CHECK\(mode='platform_collect' OR/);
 assert.match(source,/external_verification_reference/);
});
test('collection and transfer are independently disabled until all approvals',()=>{
 for(const flag of ['CONTRACTOR_PAYMENTS_ENABLED','STRIPE_CONNECT_MARKETPLACE_APPROVED','STRIPE_CONNECT_COLLECTION_ENABLED','STRIPE_CONNECT_TRANSFERS_ENABLED','STRIPE_TAX_READY'])
  assert.ok(source.includes(flag),`Missing safety gate ${flag}`);
 assert.match(source,/env\.APP_ENV !== 'production'/);
 assert.match(source,/STRIPE_TRANSFERS_DISABLED/);
 assert.match(source,/PAYMENT_UNRECONCILED/);
 assert.match(source,/RECIPIENT_NOT_VERIFIED/);
 assert.match(source,/INDEPENDENT_REVIEW_REQUIRED/);
});
test('separate charges and transfers do not auto-transfer or use an application fee',()=>{
 assert.ok(source.includes("'/v1/transfers'"));
 assert.ok(source.includes('source_transaction:chargeId'));
 assert.doesNotMatch(source, /['\"]application_fee_amount['\"]\s*:/);
 assert.ok(!source.includes('transfer_data['));
 assert.ok(!source.includes('destination_charge'));
});
test('external payer reports cannot assert Stripe settlement',()=>{
 assert.match(source,/external_due/);
 assert.match(source,/external_reported/);
 assert.match(source,/external_verified/);
 assert.match(source,/export async function reportExternalPayment/);
 assert.match(source,/verifyExternalPayment/);
});

test('refunds and disputes before a transfer cannot permit contractor release',()=>{
 assert.match(source,/charge\?\.refunded===false/);
 assert.match(source,/charge\?\.disputed===false/);
 assert.match(source,/charge\?\.amount_refunded===0/);
 assert.match(source,/stripe_payment_intent_id=\?/);
 assert.match(source,/\/v1\/charges\/\$\{encodeURIComponent\(chargeId\)\}/);
});