import test from 'node:test';
import assert from 'node:assert/strict';
import {providerReadiness} from '../packages/operations/provider-readiness.ts';
test('readiness inventory reports missing configuration without asserting acceptance',()=>{
 const result=providerReadiness({APP_ENV:'staging'});assert.equal(result.length,9);
 const stripe=result.find(x=>x.provider==='Stripe sandbox')!;assert.ok(stripe.missing.includes('STRIPE_SECRET_KEY'));assert.equal(stripe.state,'configuration_missing');
 assert.equal(result.find(x=>x.provider.includes('agreement'))?.state,'adapter_not_connected');
});
test('configured sandbox is still unaccepted and never discloses any credential values',()=>{
 const secret='rk_test_private_fixture_never_disclosed',webhook='whsec_private_fixture';
 const result=providerReadiness({APP_ENV:'staging',STRIPE_ACCOUNT_ID:'acct_1USumhEv62nbUZok',STRIPE_SECRET_KEY:secret,STRIPE_WEBHOOK_SECRET:webhook});
 assert.equal(result[0].state,'acceptance_required');const json=JSON.stringify(result);assert.equal(json.includes(secret),false);assert.equal(json.includes(webhook),false);
});
test('live credentials cannot make a sandbox-only adapter appear launch ready',()=>{
 const results=providerReadiness({APP_ENV:'production',STRIPE_SECRET_KEY:'rk_live_synthetic_placeholder'});
 assert.equal(results[0].state,'sandbox_only');assert.ok(results[0].invalid.includes('STRIPE_SECRET_KEY'));
});
test('scanner endpoint mismatch is not presented as valid configuration',()=>{
 const rows=providerReadiness({APP_ENV:'staging',RENTAL_SCANNER_ENDPOINT:'https://unapproved.example/scan',RENTAL_SCANNER_ALLOWED_HOST:'approved.example',RENTAL_SCANNER_OUTBOUND_SECRET:'redacted',RENTAL_SCANNER_WEBHOOK_SECRET:'redacted'});
 const row=rows.find(x=>x.provider==='Rental document scanner')!;assert.equal(row.state,'configuration_missing');assert.deepEqual(row.invalid,['RENTAL_SCANNER_ENDPOINT']);assert.equal(JSON.stringify(rows).includes('unapproved.example'),false);
});
