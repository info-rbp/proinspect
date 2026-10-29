import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';

// All objects, signing secrets, customers and payments below are synthetic.
// This never calls the real Stripe account or creates a real customer/charge.
mkdirSync('artifacts',{recursive:true});
await build({entryPoints:['tests/runtime/entry.ts'],outfile:'artifacts/residential-live-worker.mjs',
 bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers','node:*']});
const secret='wh'+'sec_'+'synthetic_live_webhook_'+randomBytes(10).toString('hex');
const account='acct_1USumSEynzcud8MV';
const mf=new Miniflare({
 modules:true,scriptPath:'artifacts/residential-live-worker.mjs',compatibilityDate:'2026-07-01',
 compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'residential-live-synthetic'},
 r2Buckets:{DOCUMENTS:'residential-live-documents',RESTRICTED_DOCUMENTS:'residential-live-restricted'},
 durableObjects:{SCHEDULER:{className:'BookingScheduler',useSQLite:true}},
 bindings:{
  APP_ENV:'production',BUILD_SHA:'isolated-live-test-fixture',
  APP_ORIGIN:'https://proinspect.systems',MARKETING_ORIGIN:'https://proinspect.systems',
  DATA_ENCRYPTION_KEY:randomBytes(32).toString('base64'),
  RESIDENTIAL_LIVE_BILLING_ENABLED:'true',RESIDENTIAL_PAYMENT_GRACE_HOURS:'72',
  STRIPE_RESIDENTIAL_LIVE_ACCOUNT_ID:account,
  STRIPE_RESIDENTIAL_LIVE_KEY:'rk_'+'live_'+'synthetic_integration_'+randomBytes(12).toString('hex'),
  STRIPE_RESIDENTIAL_LIVE_WEBHOOK_SECRET:secret,EMAIL_PROVIDER:'local'
 }
});
const db=await mf.getD1Database('DB');
const run=(sql,...args)=>db.prepare(sql).bind(...args).run();
const get=(sql,...args)=>db.prepare(sql).bind(...args).first();
const tests=[];
async function check(name,fn){await fn();tests.push(name);console.log('PASS '+name);}
const now=Math.floor(Date.now()/1000),price='price_1UVUgqEynzcud8MVLxm1mGRn';
const customer='cus_synthetic_live',subscription='sub_synthetic_live',session='cs_live_synthetic';
let seq=100;
const event=(type,obj,created=++seq)=>({id:'evt_synthetic_'+created+'_'+type.replaceAll('.','_'),type,created,livemode:true,data:{object:obj}});
async function webhook(e,signingSecret=secret){
 const raw=JSON.stringify(e),ts=Math.floor(Date.now()/1000);
 const signature=createHmac('sha256',signingSecret).update(ts+'.'+raw).digest('hex');
 const response=await mf.dispatchFetch('https://proinspect.systems/api/webhooks/stripe/residential-live',{
  method:'POST',headers:{'Content-Type':'application/json','stripe-signature':'t='+ts+',v1='+signature},body:raw
 });
 let body;try{body=await response.json()}catch{body={};}
 return {status:response.status,body};
}
async function covered(client='cli_live_fixture',property='prop_live_fixture'){
 const response=await mf.dispatchFetch('https://proinspect.systems/__test__/residential-coverage?client='+client+'&property='+property);
 assert.equal(response.status,200);
 return (await response.json()).covered;
}
try{
 const statements=JSON.parse(execFileSync('python3',['scripts/schema-statements.py'],{encoding:'utf8'}));
 for(const sql of statements)await db.prepare(sql).run();
 await run("INSERT INTO clients(id,name,client_type,created_at) VALUES('cli_live_fixture','Synthetic owner','landlord','2026-10-29')");
 await run("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('prop_live_fixture','1 Synthetic Street','Perth','6000','live-fixture','residential','2026-10-29')");
 await run("INSERT INTO residential_paid_property_enrollments(client_id,property_id,enrolled_at) VALUES('cli_live_fixture','prop_live_fixture','2026-10-29')");
 await run("INSERT INTO stripe_billing_links(id,client_id,property_id,sector,price_id,session_id,stripe_customer_id,status,created_at,updated_at) VALUES('sbl_live_fixture','cli_live_fixture','prop_live_fixture','residential',?,?,?,'pending','2026-10-29','2026-10-29')",price,session,customer);
 const base={id:subscription,customer,metadata:{billing_link_id:'sbl_live_fixture'},
  items:{data:[{price:{id:price},quantity:1}]}};
 const line={price:{id:price},quantity:1,period:{end:now+604800}};
 await check('reject invalid webhook signature before financial mutations',async()=>{
  const e=event('checkout.session.completed',{id:session,mode:'subscription'});
  assert.equal((await webhook(e,'synthetic_wrong_secret')).status,400);
 });
 await check('complete checkout without settlement does not grant service entitlement',async()=>{
  const res=await webhook(event('checkout.session.completed',{id:session,mode:'subscription',
   customer,subscription,client_reference_id:'sbl_live_fixture',payment_status:'unpaid'}));
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(await covered(),false);
 });
 await check('active subscription without a paid invoice does not grant entitlement',async()=>{
  const r=await webhook(event('customer.subscription.created',{...base,status:'active'}));
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(await covered(),false);
 });
 const first={id:'in_live_first',parent:{subscription_details:{subscription}},
  customer,currency:'aud',status:'paid',paid:true,amount_paid:5500,created:now-30,lines:{data:[line]}};
 await check('signed Friday paid invoice activates subscription for enrolled property',async()=>{
  const r=await webhook(event('invoice.paid',first));
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(await covered(),true);
  assert.equal((await get("SELECT status FROM stripe_subscription_invoice_observations WHERE stripe_invoice_id='in_live_first'")).status,'paid');
 });
 const renewal={...first,id:'in_live_second',status:'open',paid:false,amount_paid:0,created:now+1};
 await check('failed renewal allows existing customer inside 72-hour grace only',async()=>{
  assert.equal((await webhook(event('invoice.payment_failed',renewal))).status,200);
  assert.equal((await webhook(event('customer.subscription.updated',{...base,status:'past_due'}))).status,200);
  assert.equal(await covered(),true);
  assert.equal((await webhook(event('invoice.payment_action_required',renewal))).status,200);
  assert.equal(await covered(),true);
  await run("UPDATE stripe_subscription_invoice_observations SET paid_through=? WHERE stripe_invoice_id='in_live_first'",new Date((now-5*86400)*1000).toISOString());
  assert.equal(await covered(),false);
  await run("UPDATE stripe_subscription_invoice_observations SET paid_through=? WHERE stripe_invoice_id='in_live_first'",new Date((now+604800)*1000).toISOString());
 });
 await check('recovered invoice and active subscription restore service',async()=>{
  assert.equal((await webhook(event('invoice.paid',{...renewal,status:'paid',paid:true,amount_paid:5500}))).status,200);
  assert.equal((await webhook(event('customer.subscription.updated',{...base,status:'active'}))).status,200);
  assert.equal(await covered(),true);
 });
 await check('older signed failed event cannot overwrite paid renewal',async()=>{
  const stale=event('invoice.payment_failed',renewal,100);
  assert.equal((await webhook(stale)).status,200);
  assert.equal(await covered(),true);
 });
 await check('dispute suspends service and won dispute releases hold',async()=>{
  const dispute={id:'dp_live_fixture',charge:'ch_live_fixture',invoice:'in_live_second',
   customer,payment_intent:'pi_live_fixture',status:'needs_response'};
  assert.equal((await webhook(event('charge.dispute.created',dispute))).status,200);
  assert.equal(await covered(),false);
  assert.equal((await webhook(event('charge.dispute.closed',{...dispute,status:'won'}))).status,200);
  assert.equal(await covered(),true);
 });
 await check('a verified charge refund suspends included services',async()=>{
  const r=await webhook(event('charge.refunded',{id:'ch_live_refund',invoice:'in_live_second',
   customer,payment_intent:'pi_live_fixture',amount_refunded:100,currency:'aud'}));
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(await covered(),false);
 });
 await check('subscription pause removes entitlement until explicit resume and paid invoice status',async()=>{
  assert.equal((await webhook(event('customer.subscription.paused',{...base,status:'paused'}))).status,200);
  assert.equal(await covered(),false);
  assert.equal((await webhook(event('customer.subscription.resumed',{...base,status:'active'}))).status,200);
  // The earlier refund hold remains active, so resumption does NOT override fraud protection.
  assert.equal(await covered(),false);
 });
 await check('cancellation revokes service without deleting history',async()=>{
  assert.equal((await webhook(event('customer.subscription.deleted',{...base,status:'canceled'}))).status,200);
  assert.equal((await get("SELECT status FROM stripe_billing_links WHERE id='sbl_live_fixture'")).status,'canceled');
  assert.equal((await get("SELECT COUNT(*) count FROM stripe_subscription_invoice_observations")).count,2);
 });
 writeFileSync('artifacts/residential-live-synthetic-results.json',JSON.stringify({passed:tests.length,tests,environment:'local synthetic live-mode fixture',liveStripeCalls:0},null,2));
}finally{await mf.dispose()}
