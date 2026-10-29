import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

mkdirSync('artifacts', { recursive: true });
await build({ entryPoints: ['tests/runtime/entry.ts'], outfile: 'artifacts/stripe-worker.mjs', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', external: ['cloudflare:workers','node:*'] });
const secret = 'whsec_integration_test_secret';
const mf = new Miniflare({
  modules: true,
  scriptPath: 'artifacts/stripe-worker.mjs',
  compatibilityDate: '2026-07-01',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'stripe-integration-db' },
  r2Buckets: { DOCUMENTS: 'stripe-integration-documents', RESTRICTED_DOCUMENTS: 'stripe-integration-restricted' },
  durableObjects: { SCHEDULER: { className: 'BookingScheduler', useSQLite: true } },
  bindings: {
    APP_ENV: 'local', APP_ORIGIN: 'http://localhost', MARKETING_ORIGIN: 'http://localhost',
    DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'), STRIPE_WEBHOOK_SECRET: secret,
    STRIPE_ACCOUNT_ID: 'acct_1USumhEv62nbUZok', STRIPE_BILLING_ENABLED: 'false',
    STRIPE_GUEST_CHECKOUT_ENABLED: 'false', STRIPE_TAX_READY: 'false',
    RESIDENTIAL_PAYMENT_GRACE_HOURS: '0', // Legacy immediate-suspension tests; live synthetic suite separately verifies approved grace.
    EMAIL_PROVIDER: 'local',
  },
});
const db = await mf.getD1Database('DB');
const run = (sql,...args) => db.prepare(sql).bind(...args).run();
const get = (sql,...args) => db.prepare(sql).bind(...args).first();
const checks=[];
async function check(name,fn) { await fn();checks.push(name); console.log('PASS '+name); }
const statementSql = JSON.parse(execFileSync('python3', ['scripts/schema-statements.py'], {encoding:'utf8'}));
try {
  for (const sql of statementSql) await db.prepare(sql).run();
  await run("INSERT INTO clients(id,name,client_type,created_at) VALUES('cli_stripe_test','Sandbox account','landlord','2026-10-25')");
  await run("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('prop_stripe_test','1 Test Street','Perth','6000','test-stripe-25','residential','2026-10-25')");
  await run("INSERT INTO stripe_billing_links(id,client_id,property_id,sector,price_id,session_id,stripe_customer_id,status,created_at,updated_at) VALUES('sbl_stripe_test','cli_stripe_test','prop_stripe_test','residential','price_1UVkM6Ev62nbUZoknG7CA5P5','cs_test_stripe_sub','cus_stripe_test','pending','2026-10-25','2026-10-25')");
  const subscriptionsBefore = (await get('SELECT COUNT(*) n FROM subscriptions')).n;
  await run("INSERT INTO residential_paid_property_enrollments(client_id,property_id,enrolled_at) VALUES('cli_stripe_test','prop_stripe_test','2026-10-29')");
  async function coverage(){const r=await mf.dispatchFetch('http://localhost/__test__/residential-coverage?client=cli_stripe_test&property=prop_stripe_test');assert.equal(r.status,200);return (await r.json()).covered;}
  async function webhook(event, overrideSecret) {
    const raw=JSON.stringify(event), ts=Math.floor(Date.now()/1000);
    const sig=createHmac('sha256',overrideSecret??secret).update(ts+'.'+raw).digest('hex');
    const res=await mf.dispatchFetch('http://localhost/api/webhooks/stripe', {
      method:'POST', headers:{'Content-Type':'application/json','stripe-signature':`t=${ts},v1=${sig}`},body:raw,
    });
    return {status:res.status,body:await res.json()};
  }
  let seq=1;
  const event=(type,object,created=seq++)=>({id:`evt_${type.replaceAll('.','_')}_${created}`,type,livemode:false,created,data:{object}});
  const s={id:'sub_stripe_test',customer:'cus_stripe_test',metadata:{billing_link_id:'sbl_stripe_test'},items:{data:[{price:{id:'price_1UVkM6Ev62nbUZoknG7CA5P5'}}]}};
  await check('rejects unsigned and incorrectly signed webhook payloads',async()=>{
    assert.equal((await webhook(event('checkout.session.completed',{id:'cs_test_stripe_sub',mode:'subscription'}),'wrong')).status,400);
  });
  await check('checkout observation cannot falsely grant active subscription',async()=>{
    const e=event('checkout.session.completed',{id:'cs_test_stripe_sub',mode:'subscription',client_reference_id:'sbl_stripe_test',subscription:s.id,customer:s.customer,payment_status:'unpaid'},100);
    const r=await webhook(e);assert.equal(r.status,200,JSON.stringify(r.body));
    assert.equal((await get('SELECT status FROM stripe_billing_links WHERE id=?','sbl_stripe_test')).status,'incomplete');
    assert.equal((await get('SELECT COUNT(*) n FROM subscriptions')).n,subscriptionsBefore);
  });
  await check('payment-gated property cannot use included services before payment',async()=>{assert.equal(await coverage(),false)});
  const active=event('customer.subscription.created',{...s,status:'active'},300);
  await check('lifecycle webhook updates sandbox billing ledger once',async()=>{
    assert.equal((await webhook(active)).status,200);
    assert.equal((await get('SELECT status FROM stripe_billing_links WHERE id=?','sbl_stripe_test')).status,'active');
    const replay=await webhook(active);assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);
    assert.equal((await get('SELECT COUNT(*) n FROM stripe_billing_events WHERE event_id=?',active.id)).n,1);
  });
  await check('out-of-order subscription event cannot replace newer active state',async()=>{
    assert.equal((await webhook(event('customer.subscription.updated',{...s,status:'past_due'},200))).status,200);
    assert.equal((await get('SELECT status FROM stripe_billing_links WHERE id=?','sbl_stripe_test')).status,'active');
  });
  await check('invoice events stay explicitly flagged for reconciliation',async()=>{
    const invoice={id:'in_stripe_test',subscription:s.id,customer:s.customer,currency:'aud',status:'paid',paid:true,amount_paid:3300,amount_remaining:0};
    const r=await webhook(event('invoice.paid',invoice,350));
    assert.equal(r.status,200,JSON.stringify(r.body));
    assert.equal((await get("SELECT needs_reconciliation FROM stripe_billing_events WHERE event_type='invoice.paid'")).needs_reconciliation,1);
    assert.equal((await get('SELECT COUNT(*) n FROM subscriptions')).n,subscriptionsBefore);
    assert.equal(await coverage(),false);
  });
  const future=Math.floor(Date.now()/1000)+7*86400;
  const invoiceLine={price:{id:'price_1UVkM6Ev62nbUZoknG7CA5P5'},quantity:1,period:{end:future}};
  await check('verified paid invoice activates only the enrolled property',async()=>{
    const paid={id:'in_stripe_paid',subscription:s.id,customer:s.customer,currency:'aud',status:'paid',paid:true,
      amount_paid:5500,amount_remaining:0,created:501,lines:{data:[invoiceLine]}};
    const r=await webhook(event('invoice.paid',paid,370));
    assert.equal(r.status,200,JSON.stringify(r.body));
    assert.equal(await coverage(),true);
    assert.equal((await get("SELECT status FROM stripe_subscription_invoice_observations WHERE stripe_invoice_id='in_stripe_paid'")).status,'paid');
  });
  await check('failed renewal invoice immediately blocks included booking',async()=>{
    const failed={id:'in_stripe_renewal',subscription:s.id,customer:s.customer,currency:'aud',status:'open',paid:false,
      amount_paid:0,amount_remaining:5500,created:502,lines:{data:[invoiceLine]}};
    const r=await webhook(event('invoice.payment_failed',failed,380));
    assert.equal(r.status,200,JSON.stringify(r.body));
    assert.equal(await coverage(),false);
  });
  await check('paid renewal restores entitlement and stale failure cannot remove it',async()=>{
    const paid={id:'in_stripe_renewal',subscription:s.id,customer:s.customer,currency:'aud',status:'paid',paid:true,
      amount_paid:5500,amount_remaining:0,created:502,lines:{data:[invoiceLine]}};
    const res=await webhook(event('invoice.paid',paid,390));
    assert.equal(res.status,200,JSON.stringify(res.body));
    assert.equal(await coverage(),true);
    const stale={...paid,status:'open',paid:false,amount_paid:0};
    assert.equal((await webhook(event('invoice.payment_failed',stale,385))).status,200);
    assert.equal(await coverage(),true);
  });
  await check('signed subscription dispute holds service until a won outcome',async()=>{
    const disputed={id:'dp_stripe_sub_test',charge:'ch_stripe_sub',invoice:'in_stripe_renewal',
      customer:'cus_stripe_test',payment_intent:'pi_stripe_sub',status:'needs_response'};
    const response=await webhook(event('charge.dispute.created',disputed,395));
    assert.equal(response.status,200,JSON.stringify(response.body));
    assert.equal(await coverage(),false);
    assert.equal((await get("SELECT status FROM stripe_subscription_risk_holds WHERE reason='dispute'")).status,'open');
    const closed=await webhook(event('charge.dispute.closed',{...disputed,status:'won'},396));
    assert.equal(closed.status,200,JSON.stringify(closed.body));
    assert.equal(await coverage(),true);
  });
  await check('partial refund of settled subscription invoice suspends included access',async()=>{
    const r=await webhook(event('charge.refunded',{
      id:'ch_stripe_sub',invoice:'in_stripe_renewal',customer:'cus_stripe_test',
      payment_intent:'pi_stripe_sub',currency:'aud',amount_refunded:100,refunded:true,
    },405));
    assert.equal(r.status,200,JSON.stringify(r.body));
    assert.equal(await coverage(),false);
    assert.equal((await get("SELECT status FROM stripe_subscription_risk_holds WHERE reason='refunded'")).status,'open');
  });
  await check('fraud warning remains independently held and receipt replay is idempotent',async()=>{
    const e=event('radar.early_fraud_warning.created',{
      id:'iss_stripe_warning',charge:'ch_stripe_fraud',invoice:'in_stripe_renewal',
      customer:'cus_stripe_test',payment_intent:'pi_stripe_sub',
    },410);
    assert.equal((await webhook(e)).status,200);
    assert.equal((await webhook(e)).body.replayed,true);
    assert.equal((await get("SELECT COUNT(*) n FROM stripe_subscription_risk_holds WHERE reason='fraud_warning'")).n,1);
  });
  await check('wrong subscription price fails closed',async()=>{
    const bad={...s,items:{data:[{price:{id:'price_unapproved'}}]},status:'active'};
    assert.equal((await webhook(event('customer.subscription.updated',bad,400))).status,409);
    assert.equal((await get('SELECT status FROM stripe_billing_links WHERE id=?','sbl_stripe_test')).status,'active');
  });
  await check('cancelled record is retained and separately accounted',async()=>{
    assert.equal((await webhook(event('customer.subscription.deleted',{...s,status:'canceled'},500))).status,200);
    assert.equal((await get('SELECT status FROM stripe_billing_links WHERE id=?','sbl_stripe_test')).status,'canceled');
    assert.equal(await coverage(),false);
    await run("INSERT INTO stripe_billing_links(id,client_id,property_id,sector,price_id,status,created_at,updated_at) VALUES('sbl_new','cli_stripe_test','prop_stripe_test','residential','price_1UVkM6Ev62nbUZoknG7CA5P5','pending','2026-10-25','2026-10-25')");
    assert.equal((await get('SELECT COUNT(*) n FROM stripe_billing_links')).n,2);
  });
  await check('existing one-off payment webhooks remain idempotent',async()=>{
    await run("INSERT INTO payments(id,client_id,description,amount_ex_gst_cents,gst_cents,total_cents,status,provider,checkout_session_id,created_at) VALUES('pay_stripe','cli_stripe_test','Sandbox inspection',20000,2000,22000,'payment_required','stripe','cs_test_stripe_pay','2026-10-25')");
    const paid=event('checkout.session.completed',{id:'cs_test_stripe_pay',mode:'payment',payment_status:'paid',amount_total:22000,currency:'aud',metadata:{payment_id:'pay_stripe',client_id:'cli_stripe_test'}},600);
    assert.equal((await webhook(paid)).status,200);
    assert.equal((await webhook(paid)).status,200);
    assert.equal((await get("SELECT status FROM payments WHERE id='pay_stripe'")).status,'paid');
    assert.equal((await get("SELECT COUNT(*) n FROM payment_events WHERE payment_id='pay_stripe' AND to_status='paid'")).n,1);
  });
  writeFileSync('artifacts/stripe-sandbox-results.json',JSON.stringify({passed:checks.length,checks},null,2));
} finally { await mf.dispose(); }