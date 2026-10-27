import test from 'node:test';
import assert from 'node:assert/strict';
import {isSandboxApiKey,isStripeWebhookSecret,isBillingPortalConfigurationId,isReviewedSandboxPortal,STRIPE_SANDBOX_ACCOUNT} from '../packages/finance/stripe-sandbox-policy.ts';
import {sandboxConnectEnabled} from '../packages/finance/connect-policy.ts';
const origin='https://isolated.example.test',id='bpc_synthetic_fixture';
function configuration(){return {id,active:true,livemode:false,default_return_url:origin+'/workspaces',metadata:{application:'proinspect',environment:'staging'},login_page:{enabled:false},features:{invoice_history:{enabled:true},payment_method_update:{enabled:true},customer_update:{enabled:false},subscription_update:{enabled:false},subscription_cancel:{enabled:false},subscription_pause:{enabled:false}}};}
test('restricted and secret sandbox keys are accepted without admitting live or publishable credentials',()=>{
 for(const key of ['rk_test_synthetic_fixture','sk_test_synthetic_fixture'])assert.equal(isSandboxApiKey(key),true);
 for(const key of [undefined,null,{},'','rk_test_','sk_test_','pk_test_synthetic','rk_live_synthetic','sk_live_synthetic','rk_test_bad\n','rk_test_bad space','rk_test_bad/escape','rk_test_'+ 'a'.repeat(257)])assert.equal(isSandboxApiKey(key),false);
 assert.equal(isStripeWebhookSecret('whsec_synthetic_fixture'),true);
 for(const key of [null,'','whsec_','whsec_bad\n','rk_test_synthetic'])assert.equal(isStripeWebhookSecret(key),false);
});
test('rent onboarding accepts restricted sandbox keys only on the pinned staging account',()=>{
 const env={APP_ENV:'staging',STRIPE_ACCOUNT_ID:STRIPE_SANDBOX_ACCOUNT,RENT_CONNECT_SANDBOX_ENABLED:'true',STRIPE_SECRET_KEY:'rk_test_synthetic_fixture'};
 assert.equal(sandboxConnectEnabled(env),true);
 for(const APP_ENV of ['production','local','unknown'])assert.equal(sandboxConnectEnabled({...env,APP_ENV}),false);
 for(const STRIPE_ACCOUNT_ID of [undefined,'acct_unrelated'])assert.equal(sandboxConnectEnabled({...env,STRIPE_ACCOUNT_ID}),false);
 for(const STRIPE_SECRET_KEY of ['rk_test_','rk_live_synthetic','pk_test_synthetic'])assert.equal(sandboxConnectEnabled({...env,STRIPE_SECRET_KEY}),false);
});
test('portal configuration ID rejects paths, query strings and unbounded data',()=>{
 assert.equal(isBillingPortalConfigurationId(id),true);
 for(const bad of [null,'bpc_','bpc_x/other','bpc_x?enabled=true','bpc_x\n','bpc_'+ 'x'.repeat(129)])assert.equal(isBillingPortalConfigurationId(bad),false);
});
test('only the exact reviewed sandbox portal with a safe return origin is accepted',()=>{
 assert.equal(isReviewedSandboxPortal(configuration(),id,origin),true);
 for(const bad of [null,[],{}, {...configuration(),id:'bpc_another'},{...configuration(),active:false},{...configuration(),livemode:true},{...configuration(),default_return_url:'https://other.example.test/workspaces'},{...configuration(),metadata:{}},{...configuration(),login_page:{enabled:true}}])assert.equal(isReviewedSandboxPortal(bad,id,origin),false);
});
for(const feature of ['subscription_cancel','subscription_pause','subscription_update','customer_update'])test('portal cannot enable '+feature,()=>{
 const p=configuration();p.features[feature as keyof typeof p.features].enabled=true;
 assert.equal(isReviewedSandboxPortal(p,id,origin),false);
});
test('missing capability fields and newly enabled provider features fail closed',()=>{
 const p=configuration();delete (p.features as Record<string,unknown>).subscription_pause;assert.equal(isReviewedSandboxPortal(p,id,origin),false);
 const n=configuration();(n.features as Record<string,unknown>).future_transfer_feature={enabled:true};assert.equal(isReviewedSandboxPortal(n,id,origin),false);
 const f=configuration();f.features.invoice_history.enabled=false;assert.equal(isReviewedSandboxPortal(f,id,origin),false);
});
