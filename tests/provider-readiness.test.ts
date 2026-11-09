import test from 'node:test';
import assert from 'node:assert/strict';
import {providerReadiness} from '../packages/operations/provider-readiness.ts';
test('readiness inventory reports missing configuration without asserting acceptance',()=>{
 const result=providerReadiness({APP_ENV:'staging'});assert.equal(result.length,10);
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

test('live Stripe reporting rejects wrong account, keys and non-property tax category without leaking values',()=>{
 const account='acct_rejected_private_test',key='sk_live_never_should_be_returned',secret='whsec_invalid';
 const result=providerReadiness({APP_ENV:'production',STRIPE_RESIDENTIAL_LIVE_ACCOUNT_ID:account,
  STRIPE_RESIDENTIAL_LIVE_KEY:key,STRIPE_RESIDENTIAL_LIVE_WEBHOOK_SECRET:secret,
  RESIDENTIAL_APPROVED_TAX_CODE:'txcd_10203001'});
 const row=result.find(x=>x.provider==='Stripe live residential')!;
 assert.equal(row.state,'configuration_missing');
 assert.deepEqual(row.invalid.sort(),[
  'STRIPE_RESIDENTIAL_LIVE_ACCOUNT_ID','STRIPE_RESIDENTIAL_LIVE_KEY',
  'STRIPE_RESIDENTIAL_LIVE_WEBHOOK_SECRET','RESIDENTIAL_APPROVED_TAX_CODE'].sort());
 for(const value of [account,key,secret])assert.ok(!JSON.stringify(result).includes(value));
});
test('present valid-shaped Stripe live configuration is still unaccepted',()=>{
 const row=providerReadiness({APP_ENV:'production',
  STRIPE_RESIDENTIAL_LIVE_ACCOUNT_ID:'acct_1USumSEynzcud8MV',
  STRIPE_RESIDENTIAL_LIVE_KEY:'rk_live_'+'a'.repeat(24),
  STRIPE_RESIDENTIAL_LIVE_WEBHOOK_SECRET:'whsec_'+'b'.repeat(24),
  RESIDENTIAL_APPROVED_TAX_CODE:'txcd_12345678'}).find(x=>x.provider==='Stripe live residential')!;
 assert.equal(row.state,'acceptance_required');
 assert.equal(row.invalid.length,0);
});
