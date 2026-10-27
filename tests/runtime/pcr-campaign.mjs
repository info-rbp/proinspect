import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHmac} from 'node:crypto';
import {build} from 'esbuild';import {Miniflare} from 'miniflare';
import {catalogueSql} from '../../scripts/catalogue-sql.mjs';
mkdirSync('artifacts',{recursive:true});
await build({entryPoints:['tests/runtime/entry.ts'],outfile:'artifacts/pcr-worker.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers','node:*']});
const secret='whsec_pcr_isolated_fixture',sessions=new Map(),checks=[];let seq=0;
const mf=new Miniflare({modules:true,scriptPath:'artifacts/pcr-worker.mjs',compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'pcr-isolated'},r2Buckets:{DOCUMENTS:'pcr-documents',RESTRICTED_DOCUMENTS:'pcr-private'},durableObjects:{SCHEDULER:{className:'BookingScheduler',useSQLite:true}},bindings:{APP_ENV:'local',APP_ORIGIN:'http://localhost',DATA_ENCRYPTION_KEY:randomBytes(32).toString('base64'),EMAIL_PROVIDER:'local',GUEST_BOOKINGS_ENABLED:'true',PCR_LAUNCH_ENABLED:'true',PCR_DISCOUNT_REDEMPTION_ENABLED:'true',STRIPE_GUEST_CHECKOUT_ENABLED:'true',STRIPE_PAYMENTS_ENABLED:'true',STRIPE_TAX_READY:'true',STRIPE_ACCOUNT_ID:'acct_1USumhEv62nbUZok',STRIPE_SECRET_KEY:'rk_test_pcr_fixture',STRIPE_WEBHOOK_SECRET:secret},outboundService:async request=>{
 const u=new URL(request.url);assert.equal(u.origin,'https://api.stripe.com');
 if(u.pathname==='/v1/account')return Response.json({id:'acct_1USumhEv62nbUZok'});
 if(u.pathname==='/v1/checkout/sessions'&&request.method==='POST'){
  const f=new URLSearchParams(await request.text());assert.equal(f.has('automatic_tax[enabled]'),false);
  const s={id:'cs_test_pcr_'+(++seq),livemode:false,mode:'payment',status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/c/pay/cs_test_pcr_'+seq,amount_total:Number(f.get('line_items[0][price_data][unit_amount]')),currency:'aud',client_reference_id:f.get('client_reference_id'),metadata:{payment_id:f.get('metadata[payment_id]'),client_id:f.get('metadata[client_id]'),payment_attempt_id:f.get('metadata[payment_attempt_id]')},payment_intent:'pi_pcr_'+seq,expires_at:Math.floor(Date.now()/1000)+1800};sessions.set(s.id,s);return Response.json(s);
 }
 if(u.pathname.startsWith('/v1/checkout/sessions/'))return Response.json(sessions.get(u.pathname.split('/').pop()));
 throw Error('Unapproved fixture request '+u.pathname);
}});
const db=await mf.getD1Database('DB'),run=(s,...a)=>db.prepare(s).bind(...a).run(),first=(s,...a)=>db.prepare(s).bind(...a).first();
async function api(path,body,expected=200,cookie){const r=await mf.dispatchFetch('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'http://localhost',...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();assert.equal(r.status,expected,path+' '+JSON.stringify(v));return {value:v,response:r};}
async function check(name,f){await f();checks.push(name);console.log('PASS '+name);}
let eventSeq=0;async function webhook(event){const raw=JSON.stringify(event),time=Math.floor(Date.now()/1000),sig=createHmac('sha256',secret).update(time+'.'+raw).digest('hex');const r=await mf.dispatchFetch('http://localhost/api/webhooks/stripe',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':`t=${time},v1=${sig}`},body:raw});const v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v;}
const event=(type,object)=>({id:'evt_pcr_'+(++eventSeq),type,created:Math.floor(Date.now()/1000),livemode:false,data:{object}});
const input={name:'Synthetic PCR purchaser',email:'pcr-owner@example.test',phone:'0400000000',sector:'residential',address:'813 Synthetic PCR Street',suburb:'Perth',postcode:'6000',propertyType:'House',access:{method:'owner',instructions:'Synthetic fixture only',noticeConfirmed:true},consent:true,website:''};
const date=new Date(Date.now()+14*86400000);while([0,6].includes(date.getUTCDay()))date.setUTCDate(date.getUTCDate()+1);const day=date.toISOString().slice(0,10);
async function requestGuest(serviceId,extras={}){const made=(await api('/api/guest/requests',{...input,requestKey:crypto.randomUUID(),serviceId,...extras},201)).value;const verified=(await api('/api/guest/verify',{token:made.localVerifyToken})).value;return {token:verified.localManageToken,reference:made.reference};}
async function slots(token){return (await api('/api/guest/availability?'+new URLSearchParams({token,date:day}))).value.slots;}
let source,target,adminCookie,sourceSession,targetSession;
try{
 for(const s of JSON.parse(execFileSync('python3',['scripts/schema-statements.py'],{encoding:'utf8'})))await run(s);
 for(const s of catalogueSql().split('\n'))await run(s);
 await run("INSERT OR IGNORE INTO schedule_resources(id,name) VALUES('default','Fixture')");
 await run("UPDATE services SET duration_minutes=60,booking_mode='instant',price_ex_gst_cents=10000 WHERE id IN('routine-inspection','property-condition-report')");
 const started=(await api('/api/auth/start',{email:'reviewer@pcr.example.test'})).value;
 const logged=await api('/api/auth/complete',{email:'reviewer@pcr.example.test',token:new URL(started.localSignInUrl).searchParams.get('token')});adminCookie=logged.response.headers.get('set-cookie').split(';')[0];
 const admin=await first("SELECT id FROM users WHERE email='reviewer@pcr.example.test'");await run("INSERT INTO staff_profiles(user_id,role) VALUES(?,'administrator')",admin.id);
 await check('PCR must confirm the selected absolute appointment amount before reserving',async()=>{
  source=await requestGuest('property-condition-report',{launchOffer:'pcr100',offsiteKeyCollection:true,keyCollectionLocation:'Synthetic office for key collection'});
  const s=(await slots(source.token))[0];assert.equal(s.estimatedTotalCents,11000);
  await api('/api/guest/manage',{token:source.token,action:'confirm',startsAt:s.start,appointmentTotalCents:100},409);
  assert.equal((await first('SELECT count(*) n FROM bookings')).n,0);
  await api('/api/guest/manage',{token:source.token,action:'confirm',startsAt:s.start,appointmentTotalCents:11000},201);
  assert.equal((await first('SELECT count(*) n FROM pcr_routine_discount_entitlements')).n,0);
 });
 await check('only verified paid events grant four benefits and replay does not duplicate them',async()=>{
  await api('/api/guest/checkout',{token:source.token});sourceSession=[...sessions.values()].at(-1);assert.equal(sourceSession.amount_total,11000);
  const paid=event('checkout.session.completed',{...sourceSession,status:'complete',payment_status:'paid'});await webhook(paid);await webhook(paid);
  const rows=await first('SELECT count(*) n,sum(uses_remaining) remaining FROM pcr_routine_discount_entitlements');assert.equal(rows.n,1);assert.equal(rows.remaining,4);
 });
 await check('verified routine customer explicitly opts into a price-bound property benefit',async()=>{
  target=await requestGuest('routine-inspection');let status=(await api('/api/guest/status?token='+target.token)).value;
  assert.equal(status.pcrDiscount.totalCents,8800);assert.equal(status.pcrDiscount.usesRemaining,4);
  const s=(await slots(target.token))[0];
  // Matching address does not confer authority; the existing property still needs a real Staff review in the isolated fixture.
  await api('/api/guest/manage',{token:target.token,action:'confirm',startsAt:s.start,applyPcrDiscount:true,discountTotalCents:8800},409);
  const o=await first('SELECT id FROM guest_service_orders WHERE reference=?',target.reference);
  await api('/api/staff/guest-orders/'+o.id+'/review',{approve:true},200,adminCookie);
  await api('/api/guest/manage',{token:target.token,action:'confirm',startsAt:s.start,applyPcrDiscount:true,discountTotalCents:1},409);
  assert.equal((await first('SELECT uses_remaining FROM pcr_routine_discount_entitlements')).uses_remaining,4);
  await api('/api/guest/manage',{token:target.token,action:'confirm',startsAt:s.start,applyPcrDiscount:true,discountTotalCents:8800},201);
  assert.equal((await first('SELECT uses_remaining FROM pcr_routine_discount_entitlements')).uses_remaining,3);
 });
 await check('signed discounted settlement consumes exactly the reserved use',async()=>{
  await api('/api/guest/checkout',{token:target.token});targetSession=[...sessions.values()].at(-1);assert.equal(targetSession.amount_total,8800);
  const paid=event('checkout.session.async_payment_succeeded',{...targetSession,status:'complete',payment_status:'paid'});await webhook(paid);await webhook(paid);
  assert.equal((await first('SELECT status FROM pcr_discount_reservations')).status,'redeemed');assert.equal((await first('SELECT count(*) n FROM pcr_routine_discount_redemptions')).n,1);assert.equal((await first('SELECT uses_remaining FROM pcr_routine_discount_entitlements')).uses_remaining,3);
 });
 await check('unstarted cancellation restores its reserved use exactly once',async()=>{
  const other=await requestGuest('routine-inspection'),s=(await slots(other.token))[0];await api('/api/guest/manage',{token:other.token,action:'confirm',startsAt:s.start},409);
  const o=await first('SELECT id FROM guest_service_orders WHERE reference=?',other.reference);await api('/api/staff/guest-orders/'+o.id+'/review',{approve:true},200,adminCookie);
  await api('/api/guest/manage',{token:other.token,action:'confirm',startsAt:s.start,applyPcrDiscount:true,discountTotalCents:8800},201);
  assert.equal((await first('SELECT uses_remaining FROM pcr_routine_discount_entitlements')).uses_remaining,2);
  await api('/api/guest/manage',{token:other.token,action:'cancel'});assert.equal((await first('SELECT uses_remaining FROM pcr_routine_discount_entitlements')).uses_remaining,3);
  await api('/api/guest/checkout',{token:other.token},409);
 });
 await check('source refunds suspend remaining benefits without rewriting issued prices',async()=>{
  await webhook(event('charge.refunded',{id:'ch_pcr_source',payment_intent:sourceSession.payment_intent,currency:'aud',amount:11000,amount_refunded:100}));
  assert.equal((await first('SELECT status FROM pcr_routine_discount_entitlements')).status,'suspended');
  assert.equal((await first('SELECT total_cents FROM payments WHERE id=?',targetSession.metadata.payment_id)).total_cents,8800);
 });
 assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
 writeFileSync('artifacts/pcr-campaign-runtime.json',JSON.stringify({passed:checks.length,checks,synthetic:true,providerAcceptance:false},null,2));
}finally{await mf.dispose();}
