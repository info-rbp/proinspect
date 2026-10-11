import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

// Real local Worker + D1 + R2 + Durable Object; no production network, email or money.
mkdirSync('artifacts',{recursive:true});
await build({entryPoints:['tests/runtime/entry.ts'],outfile:'artifacts/v2-api-worker.mjs',
 bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers']});
const mf=new Miniflare({
 modules:true,scriptPath:'artifacts/v2-api-worker.mjs',compatibilityDate:'2026-07-01',
 compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'v2-integration'},
 r2Buckets:{DOCUMENTS:'docs',RESTRICTED_DOCUMENTS:'restricted'},
 durableObjects:{SCHEDULER:{className:'BookingScheduler',useSQLite:true}},
 bindings:{APP_ENV:'local',APP_ORIGIN:'http://localhost',DATA_ENCRYPTION_KEY:randomBytes(32).toString('base64'),EMAIL_PROVIDER:'local'}
});
const db=await mf.getD1Database('DB');
const sql=(query,...args)=>db.prepare(query).bind(...args);
async function api(path,who,body){
 const headers={Origin:'http://localhost',...(who?{Cookie:who.cookie}:{})};
 if(body!==undefined)headers['Content-Type']='application/json';
 const response=await mf.dispatchFetch('http://localhost'+path,{method:body===undefined?'GET':'POST',
 headers,body:body===undefined?undefined:JSON.stringify(body)});
 return {status:response.status, data:response.headers.get('Content-Type')?.includes('json')?await response.json():await response.text(),
 response};
}
async function ok(path,who,body){
 const x=await api(path,who,body);
 assert.equal(x.status,200,path+' '+JSON.stringify(x.data));
 return x.data;
}
async function login(email){
 const start=await ok('/api/auth/start',null,{email});
 const token=new URL(start.localSignInUrl).searchParams.get('token');
 const auth=await api('/api/auth/complete',null,{email,token});
 assert.equal(auth.status,200);
 return {cookie:auth.response.headers.get('set-cookie').split(';')[0],
 id:(await sql('SELECT id FROM users WHERE email=?',email).first()).id};
}
async function check(name,callback){
 await callback();console.log('PASS V2 '+name);
}
const staffApi='/api/w/staff/operations/v2';
const year=new Date(Date.now()+360*86400000).toISOString();
const yesterday=new Date(Date.now()-86400000).toISOString();
const twoDaysAgo=new Date(Date.now()-2*86400000).toISOString();
try{
 const scripts=JSON.parse(execFileSync('python3',['scripts/schema-statements.py'],{encoding:'utf8'}));
 for(const script of scripts)await db.prepare(script).run();
 const operator=await login('v2-operator@example.test');
 const owner=await login('v2-owner@example.test');
 const other=await login('v2-other@example.test');
 await sql("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'operations_manager',1)",operator.id).run();
 const c1=await api('/api/onboarding',owner,{displayName:'V2 Owner',clientName:'V2 Self Managed'});
 const c2=await api('/api/onboarding',other,{displayName:'Other Owner',clientName:'Other Self Managed'});
 assert.equal(c1.status,201);assert.equal(c2.status,201);
 const client=c1.data.clientId,otherClient=c2.data.clientId;
 const ownerBase='/api/w/landlord/'+client;
 const otherBase='/api/w/landlord/'+otherClient;
 const p1=await api(ownerBase+'/properties',owner,{address:'901 Example Ave',suburb:'Perth',postcode:'6000',propertyType:'House',selfManaged:true});
 const p2=await api(otherBase+'/properties',other,{address:'902 Example Ave',suburb:'Perth',postcode:'6000',propertyType:'House',selfManaged:true});
 assert.equal(p1.status,201);assert.equal(p2.status,201);
 const propertyId=p1.data.propertyId,otherProperty=p2.data.propertyId;
 await check('anonymous and customer cannot enter draft business administration',async()=>{
   assert.equal((await api(staffApi,null)).status,401);
   assert.equal((await api(staffApi,owner)).status,403);
   assert.equal((await api(staffApi+'/rate-cards',owner,{marketCode:'RES',version:1,loadedHourlyCents:6200,travelVisitCents:0,fixedAdminCents:0,contingencyBp:0,targetMarginBp:0,gstBp:1000})).status,403);
 });
 await check('eleven markets, sixty-nine services and 33 plans all start controlled',async()=>{
   const d=await ok(staffApi,operator);
   assert.equal(d.markets.length,11);assert.equal(d.services.length,69);assert.equal(d.plans.length,33);
   assert.ok(d.services.every(s=>s.status==='draft'));
   assert.ok(d.plans.every(s=>s.status==='draft'));
   assert.ok(d.markets.every(m=>m.enabled===0));
 });
 await check('asset roots are automatic and cross-owner asset parents are rejected',async()=>{
   assert.equal((await sql('SELECT COUNT(*) AS total FROM v2_assets WHERE property_id=? AND kind=?',propertyId,'site').first()).total,1);
   const child=await ok(staffApi+'/assets',operator,{propertyId,parentId:'v2:property:'+propertyId,kind:'plant',name:'Heat pump'});
   assert.ok(child.id);
   const cross=await api(staffApi+'/assets',operator,{propertyId:otherProperty,parentId:'v2:property:'+propertyId,kind:'plant',name:'Wrong tree'});
   assert.notEqual(cross.status,200);
   assert.equal((await sql('SELECT COUNT(*) AS total FROM v2_assets WHERE property_id=? AND name=?',otherProperty,'Wrong tree').first()).total,0);
 });
 await check('market and service activation require distinct staff review',async()=>{
   const proposed=(await sql('SELECT id FROM v2_asset_markets WHERE property_id=? AND market_code=?',propertyId,'RES').first()).id;
   await ok(staffApi+'/asset-markets/'+proposed+'/review',operator,{status:'approved',verificationReference:'Verified property relationship and sector evidence'});
   await ok(staffApi+'/markets/RES/enable',operator,{enabled:true});
   await ok(staffApi+'/services/V2-001/review',operator,{status:'approved',approvalReference:'Approved inspection operating scope 2026'});
   await ok(staffApi+'/rules',operator,{marketCode:'RES',serviceCode:'V2-001',status:'approved',notes:'Reviewed residential inclusion'});
   const row=await sql('SELECT status FROM v2_market_service_rules WHERE market_code=? AND service_code=?','RES','V2-001').first();
   assert.equal(row.status,'approved');
   assert.equal((await sql('SELECT COUNT(*) AS total FROM services').first()).total,0);
 });
 const created=await ok(staffApi+'/engagements',operator,{clientId:client,propertyId,marketCode:'RES',
   reference:'V2-TEST-ENGAGEMENT-2026',scopeSummary:'Verified limited property attendance and inspections',
   startsAt:twoDaysAgo,endsAt:year});
 const engagement=created.id;
 await check('operational engagement is independent of property manager and requires authority',async()=>{
   const e=await sql('SELECT status FROM v2_engagements WHERE id=?',engagement).first();
   assert.equal(e.status,'draft');
   await ok(staffApi+'/engagements/'+engagement+'/activate',operator,{authorityReference:'SIGNED-2026-TEST'});
   assert.equal((await sql('SELECT status FROM v2_engagements WHERE id=?',engagement).first()).status,'active');
   assert.equal((await sql('SELECT COUNT(*) AS total FROM property_management_relationships WHERE property_id=?',propertyId).first()).total,1);
 });
 const plan='RES:standard:v1';
 await check('plan version records limits and approved eligible service',async()=>{
   await ok(staffApi+'/plans/'+encodeURIComponent(plan)+'/configure',operator,
     {includedHoursMilli:5000,includedVisits:2,includedTickets:1,includedReports:2,monthlyFeeCents:33000});
   await ok(staffApi+'/plans/'+encodeURIComponent(plan)+'/service',operator,
     {serviceCode:'V2-001',inclusion:'included'});
   await ok(staffApi+'/plans/'+encodeURIComponent(plan)+'/limit',operator,
     {serviceCode:'V2-001',metric:'hours_milli',limitQuantity:2000});
   await ok(staffApi+'/plans/'+encodeURIComponent(plan)+'/approve',operator,{});
   assert.equal((await sql('SELECT status FROM v2_plan_versions WHERE id=?',plan).first()).status,'approved');
   await assert.rejects(sql('UPDATE v2_plan_versions SET monthly_fee_cents=? WHERE id=?',20,plan).run(),/V2_APPROVED_PLAN_IMMUTABLE/);
 });
 const rate=await ok(staffApi+'/rate-cards',operator,{marketCode:'RES',version:1,
   loadedHourlyCents:6200,travelVisitCents:2500,fixedAdminCents:1200,
   contingencyBp:1000,targetMarginBp:3800,gstBp:1000});
 await ok(staffApi+'/rate-cards/'+rate.id+'/approve',operator,{approvalReference:'Pricing signoff for residential V2 fixture'});
 await check('approved cost model generates immutable quote with third-party costs',async()=>{
   const q=await ok(staffApi+'/quotes',operator,{
     clientId:client,propertyId,marketCode:'RES',serviceCode:'V2-001',rateCardId:rate.id,engagementId:engagement,
     hoursMilli:2000,visits:1,quantity:1,complexityBp:10000,externalPassThroughCents:20000
   });
   assert.equal(q.pricing.serviceFeeCents,28565);
   assert.equal(q.pricing.totalCents,53422);
   await assert.rejects(sql('UPDATE v2_quote_snapshots SET amount_ex_gst_cents=1 WHERE id=?',q.id).run(),/V2_QUOTE_SNAPSHOT_IMMUTABLE/);
 });
 const subscription=await ok(staffApi+'/subscriptions',operator,{
   engagementId:engagement,planId:plan,periodStart:yesterday,periodEnd:year,agreedMonthlyCents:33000
 });
 await check('usage posts against an actual work order with per-service limits',async()=>{
   await sql("INSERT INTO work_orders(id,reference,client_id,property_id,title,status,created_at,updated_at) VALUES(?,?,?,?,?,'triage',?,?)",
     'wo_v2','WO-V2-TEST',client,propertyId,'Routine',new Date().toISOString(),new Date().toISOString()).run();
   const u=await ok(staffApi+'/usage',operator,{subscriptionId:subscription.id,serviceCode:'V2-001',
     metric:'hours_milli',quantity:1000,sourceKey:'WO-V2-TEST-ATTENDANCE-1',workOrderId:'wo_v2'});
   assert.ok(u.id);
   const excess=await api(staffApi+'/usage',operator,{subscriptionId:subscription.id,serviceCode:'V2-001',
     metric:'hours_milli',quantity:1500,sourceKey:'WO-V2-TEST-ATTENDANCE-2',workOrderId:'wo_v2'});
   assert.notEqual(excess.status,200);
   assert.equal((await sql('SELECT SUM(quantity) AS total FROM v2_usage_ledger WHERE subscription_id=?',subscription.id).first()).total,1000);
 });
 await check('customer can see own subscribed usage, not another client data or private pricing',async()=>{
   const d=await ok(ownerBase+'/v2-account',owner);
   assert.equal(d.engagements.length,1);assert.equal(d.subscriptions.length,1);
   assert.equal(d.usage[0].consumed,1000);
   assert.ok(!JSON.stringify(d).includes('loaded_hourly_cents'));
   const stranger=await ok(otherBase+'/v2-account',other);
   assert.equal(stranger.engagements.length,0);assert.equal(stranger.usage.length,0);
 });

 const maintenance='/api/w/staff/operations/v2-maintenance';
 const fieldOfficer=await login('v2-inspector@example.test');
 await sql("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'inspector',1)",fieldOfficer.id).run();
 const workId='wo_v2';
 const taskCreated=await ok(maintenance+'/tasks',operator,{
   workOrderId:workId,assetId:'v2:property:'+propertyId,title:'Check and rectify bathroom extractor',
   trade:'general',priority:'routine',approvalRequired:false,budgetCeilingCents:20000,evidenceKind:'note',
   instructions:'Review safe access and document work scope'
 });
 const taskId=taskCreated.id;
 await check('task hierarchy is scoped and parent cannot close with open tasks',async()=>{
   const invalid=await api(maintenance+'/tasks',operator,{
    workOrderId:workId,assetId:'v2:property:'+otherProperty,title:'Cross-portfolio asset',
    trade:'general',budgetCeilingCents:5000,evidenceKind:'note'
   });
   assert.notEqual(invalid.status,200);
   await assert.rejects(sql("UPDATE work_orders SET status='completed' WHERE id=?",workId).run(),/V2_WORK_PACKAGE_OPEN/);
   assert.equal((await sql('SELECT status FROM work_orders WHERE id=?',workId).first()).status,'triage');
 });
 await check('unqualified contractor cannot be assigned and verified credentials are required',async()=>{
   const contractor=await sql("INSERT INTO contractors(id,name,email) VALUES('v2_contractor','Verified external trade','supplier@example.test')").run();
   const refused=await api(maintenance+'/assignments',operator,{
      taskId,contractorId:'v2_contractor',instructionReference:'INSTR-V2-UNVERIFIED'
   });
   assert.notEqual(refused.status,200);
   await ok(maintenance+'/credentials',operator,{
      contractorId:'v2_contractor',credentialType:'insurance',trade:'general',
      credentialReference:'POLICY-SYNTHETIC-2026',verificationReference:'PROVIDER-INDEPENDENT-CHECK-2026',
      validUntil:year
   });
   const accepted=await ok(maintenance+'/assignments',operator,{
      taskId,contractorId:'v2_contractor',instructionReference:'APPROVED-SUPPLIER-TEST'
   });
   assert.ok(accepted.id);
   const worker=await ok(maintenance+'/assignments',operator,{
      taskId,staffUserId:fieldOfficer.id,instructionReference:'INSPECTOR-ASSIGNED-TEST'
   });
   assert.ok(worker.id);
 });
 async function advance(status,version){
   return ok(maintenance+'/tasks/'+taskId+'/status',operator,{status,version,
     completionNotes:status==='completed'?'Verified service closeout evidence recorded':undefined});
 }
 await advance('assigned',1);
 const resource=await ok(maintenance+'/resources',operator,{
    name:'Field officer capacity',kind:'staff',staffUserId:fieldOfficer.id,region:'Perth WA'
 });
 await ok(maintenance+'/resources/'+resource.id+'/skill',operator,{trade:'general'});
 for(const weekday of [1,2,3,4,5]){
   await ok(maintenance+'/resources/'+resource.id+'/roster',operator,{weekday,startsMinute:480,endsMinute:1020});
 }
 const slot=new Date(Date.parse(futureDate()+'T09:00:00+08:00'));
 const startsAt=slot.toISOString(),endsAt=new Date(slot.getTime()+3600000).toISOString();
 const allocation=await ok(maintenance+'/allocations',operator,{
   taskId,resourceId:resource.id,startsAt,endsAt,allocationReference:'ASSIGN-FIELD-INSPECTOR-2026'
 });
 await check('real capacity enforces rosters and overlapping reservations',async()=>{
   const overlapping=await api(maintenance+'/allocations',operator,{
     taskId,resourceId:resource.id,startsAt:new Date(slot.getTime()+15*60000).toISOString(),
     endsAt:new Date(slot.getTime()+75*60000).toISOString(),
     allocationReference:'OVERLAP-BLOCKED-2026'
   });
   assert.notEqual(overlapping.status,200);
   const outside=await api(maintenance+'/allocations',operator,{
     taskId,resourceId:resource.id,startsAt:new Date(slot.getTime()-3*3600000).toISOString(),
     endsAt:new Date(slot.getTime()-2*3600000).toISOString(),
     allocationReference:'ROSTER-BLOCKED-2026'
   });
   assert.notEqual(outside.status,200);
   const blocked=await api(maintenance+'/blocks',operator,{
     resourceId:resource.id,startsAt,endsAt,reason:'Blocking an already assigned shift'
   });
   assert.notEqual(blocked.status,200);
   assert.equal((await sql("SELECT COUNT(*) AS n FROM v2_resource_allocations WHERE status='confirmed' AND task_id=?",taskId).first()).n,1);
 });
 await advance('scheduled',2);
 await advance('in_progress',3);
 await check('approved staff rates and linked subscription prevent silent entitlement overages',async()=>{
   const rate=await ok(maintenance+'/rates',operator,{staffUserId:fieldOfficer.id,effectiveFrom:twoDaysAgo,hourlyCostCents:6000});
   await ok(maintenance+'/rates/'+rate.id+'/approve',operator,{approvalReference:'VERIFIED-LOADED-LABOUR-RATE-2026'});
   await ok(maintenance+'/entitlements',operator,{
     taskId,subscriptionId:subscription.id,serviceCode:'V2-001'
   });
   const end=new Date(Date.now()-30*60000),start=new Date(end.getTime()-60*60000);
   const item=await ok(maintenance+'/time',fieldOfficer,{
     taskId,staffUserId:fieldOfficer.id,startedAt:start.toISOString(),endedAt:end.toISOString(),
     activityKind:'on_site',note:'Extractor inspection and adjustments',
     sourceKey:'TIMESHEET-INSPECTOR-V2-001'
   });
   assert.equal(item.minutes,60);
   const dup=await api(maintenance+'/time',fieldOfficer,{
     taskId,staffUserId:fieldOfficer.id,startedAt:start.toISOString(),endedAt:end.toISOString(),
     activityKind:'travel',sourceKey:'TIMESHEET-OVERLAP-V2-002'
   });
   assert.notEqual(dup.status,200);
   const selfReview=await api(maintenance+'/time/'+item.id+'/review',fieldOfficer,{status:'approved'});
   assert.equal(selfReview.status,403);
   const result=await ok(maintenance+'/time/'+item.id+'/review',operator,{status:'approved'});
   assert.equal(result.costCents,6000);
   const usage=await sql("SELECT quantity FROM v2_usage_ledger WHERE source_key=?", 'v2time:'+item.id).first();
   assert.equal(usage.quantity,1000);
   assert.equal((await sql('SELECT SUM(quantity) AS total FROM v2_usage_ledger WHERE subscription_id=?',subscription.id).first()).total,2000);
 });
 await check('evidence, cost review and task closeout are explicit',async()=>{
   const ev=await ok(maintenance+'/evidence',fieldOfficer,{
     taskId,kind:'note',reference:'PHOTO-REVIEWED-BY-OFFICE-REFERENCE-2026'
   });
   const cost=await ok(maintenance+'/costs',operator,{
     taskId,category:'materials',amountCents:1200,invoiceReference:'INV-V2-MATERIALS-001',
     sourceKey:'MATERIALS-ORDER-001'
   });
   const premature=await api(maintenance+'/tasks/'+taskId+'/status',operator,{
     status:'completed',version:4,completionNotes:'Closeout recorded'
   });
   assert.notEqual(premature.status,200);
   await ok(maintenance+'/evidence/'+ev.id+'/review',operator,{status:'verified'});
   await ok(maintenance+'/costs/'+cost.id+'/review',operator,{status:'approved'});
   await advance('completed',4);
   await sql("UPDATE work_orders SET status='completed' WHERE id=?",workId).run();
   assert.equal((await sql('SELECT status FROM work_orders WHERE id=?',workId).first()).status,'completed');
   assert.equal((await sql("SELECT COALESCE(SUM(cost_cents),0) AS amount FROM v2_time_entries WHERE task_id=? AND status='approved'",taskId).first()).amount,6000);
   assert.equal((await sql("SELECT COALESCE(SUM(amount_cents),0) AS amount FROM v2_external_costs WHERE task_id=? AND status='approved'",taskId).first()).amount,1200);
 });
 await check('maintenance register is staff scoped and clients cannot inspect operational cost rates',async()=>{
   const list=await ok(maintenance,operator);
   assert.ok(list.tasks.some(t=>t.id===taskId));
   assert.ok(!JSON.stringify(await ok(ownerBase+'/v2-account',owner)).includes('hourly_cost_cents'));
   assert.equal((await api(maintenance,owner)).status,403);
   assert.equal((await api(maintenance+'/tasks',owner,{workOrderId:workId,title:'Unauthorized',trade:'general',budgetCeilingCents:0})).status,403);
 });

 console.log('PASS V2 all operating-model workflow checks');
}finally {await mf.dispose();}
