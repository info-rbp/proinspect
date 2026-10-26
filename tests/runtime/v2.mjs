import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

// Real local Worker + D1 + R2 + Durable Object; no production network, email or money.
mkdirSync('artifacts',{recursive:true});
await build({entryPoints:['tests/runtime/entry.ts'],outfile:'artifacts/v2-api-worker.mjs',
 bundle:true,format:'esm',platform:'browser',target:'es2022',external: ['cloudflare:workers', 'node:crypto']});
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
function futureDate(){
  const d=new Date(Date.now()+4*86400000);
  while([0,6].includes(new Date(d.getTime()+8*3600000).getUTCDay()))d.setUTCDate(d.getUTCDate()+1);
  return d.toISOString().slice(0,10);
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
   const held=await api(maintenance+'/tasks/'+taskId+'/status',operator,{status:'completed',version:4,completionNotes:'Verified field work and evidence'});
   assert.notEqual(held.status,200);
   await ok(maintenance+'/allocations/'+allocation.id+'/release',operator,{status:'completed'});
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


 const estates='/api/w/staff/operations/v2-estates';
 const sectors='/api/w/staff/operations/v2-sectors';
 const enterprise='/api/w/staff/operations/v2-intelligence';
 const rootAsset='v2:property:'+propertyId;
 const approver=await login('v2-capital-administrator@example.test');
 await sql("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'administrator',1)",approver.id).run();
 await check('asset lifecycle, immutable condition reviews and warranty references',async()=>{
   const result=await ok(estates+'/profiles',operator,{assetId:rootAsset,assetCode:'ASSET-V2-ROOT-001',
    manufacturer:'Equipment Test Co',model:'Base Facility',designLifeMonths:240,
    replacementCostCents:240000,criticality:'high',lifecycleStatus:'operational',
    notes:'Operational asset condition register'});
   assert.equal(result.version,1);
   const x=await ok(estates+'/conditions',operator,{assetId:rootAsset,score:2,
    observedOn:new Date().toISOString().slice(0,10),method:'visual',
    summary:'Asset requires scheduled service review'});
   const invalidSelf=await api(estates+'/conditions/'+x.id+'/review',operator,{status:'verified',verificationReference:'NO-SELF-VERIFICATION'});
   assert.equal(invalidSelf.status,403);
   await assert.rejects(sql("UPDATE v2_asset_conditions SET status='verified',verified_by=?,verified_at=?,verification_reference=? WHERE id=?",
     operator.id,new Date().toISOString(),'DIRECT-SQL-SELF-REVIEW',x.id).run(),/V2_CONDITION_SELF_REVIEW/);
   await ok(estates+'/conditions/'+x.id+'/review',approver,{status:'verified',
    verificationReference:'INDEPENDENT-CONDITION-REVIEW-2026'});
   const profile=await sql('SELECT last_condition_score,version FROM v2_asset_details WHERE asset_id=?',rootAsset).first();
   assert.equal(profile.last_condition_score,2);assert.equal(profile.version,2);
   await assert.rejects(sql('DELETE FROM v2_asset_conditions WHERE id=?',x.id).run(),/V2_CONDITION_HISTORY_LOCKED/);
   const warr=await ok(estates+'/warranties',operator,{assetId:rootAsset,
      provider:'Verified Manufacturer Pty Ltd',warrantyReference:'MANUFACTURE-WARRANTY-V2',
      expiresOn:year.slice(0,10),verificationReference:'INDEPENDENT-WARRANTY-REVIEW'});
   assert.ok(warr.id);
 });
 const preventive=await ok(estates+'/plans',operator,{
   assetId:rootAsset,engagementId:engagement,serviceCode:'V2-001',
   title:'Three-monthly property plant condition review',instructions:'Check service history and defects, confirm safe access, record evidence.',
   cadenceMonths:3,leadDays:14,nextDue:new Date(Date.now()-86400000).toISOString().slice(0,10)
 });
 await check('preventive programme issues one canonical work order per due cycle',async()=>{
   await ok(estates+'/plans/'+preventive.id+'/state',operator,{status:'active',
     authorityReference:'SIGNED-APPROVED-PLANNED-SERVICE',version:1});
   const first=await ok(estates+'/plans/'+preventive.id+'/issue',operator,{authorityReference:'PM-DUE-AUTHORISATION-V2'});
   assert.ok(first.workOrderId);assert.ok(first.taskId);
   const rows=await sql('SELECT id,client_id,property_id FROM work_orders WHERE id=?',first.workOrderId).first();
   assert.equal(rows.client_id,client);assert.equal(rows.property_id,propertyId);
   assert.equal((await sql('SELECT asset_id FROM v2_maintenance_tasks WHERE id=?',first.taskId).first()).asset_id,rootAsset);
   assert.equal((await sql('SELECT COUNT(*) AS n FROM v2_preventive_occurrences WHERE plan_id=?',preventive.id).first()).n,1);
   assert.notEqual((await sql('SELECT next_due FROM v2_preventive_plans WHERE id=?',preventive.id).first()).next_due,new Date(Date.now()-86400000).toISOString().slice(0,10));
 });
 const obligation=await ok(estates+'/obligations',operator,{assetId:rootAsset,engagementId:engagement,
   title:'External fire system evidence review',category:'fire',jurisdiction:'Western Australia',
   sourceReference:'AUTHORITY-PROVIDER-SERVICE-SCOPE-2026',
   requirementSummary:'Follow up on independent qualified provider attendance evidence.',
   accountableParty:'qualified_provider',recurrenceMonths:12,
   nextReviewOn:new Date(Date.now()-86400000).toISOString().slice(0,10)
 });
 await check('compliance tracks accountable party and independent evidence without declaring statutory compliance',async()=>{
   await ok(estates+'/obligations/'+obligation.id+'/state',operator,{status:'tracked',
     reviewReference:'MANAGER-REVIEWED-COMPLIANCE-REGISTER',version:1});
   const rec=await ok(estates+'/compliance-evidence',operator,{obligationId:obligation.id,
     kind:'service_record',providerName:'External Licensed Fire Service',
     evidenceReference:'SERVICE-CERTIFICATE-EXTERNAL-001',
     issuedOn:new Date().toISOString().slice(0,10),expiresOn:year.slice(0,10)});
   const invalidSelf=await api(estates+'/compliance-evidence/'+rec.id+'/review',operator,{
      status:'verified',independentCheckReference:'NO-SELF-VALIDATION'});
   assert.equal(invalidSelf.status,403);
   await assert.rejects(sql("UPDATE v2_compliance_evidence SET status='verified',reviewed_by=?,reviewed_at=?,independent_check_reference=? WHERE id=?",
       operator.id,new Date().toISOString(),'DIRECT-SQL-SELF-REVIEW',rec.id).run(),/V2_COMPLIANCE_EVIDENCE_SELF_REVIEW/);
   await ok(estates+'/compliance-evidence/'+rec.id+'/review',approver,{
     status:'verified',independentCheckReference:'LICENSED-PROVIDER-EVIDENCE-CHECK'});
   const action=await ok(estates+'/actions',operator,{obligationId:obligation.id,
     actionText:'Confirm next external contractor review',dueOn:year.slice(0,10),assigneeId:operator.id});
   await ok(estates+'/actions/'+action.id+'/close',operator,{status:'done',
     completionReference:'NEXT-REVIEW-CALENDAR-ACKNOWLEDGED'});
   const risk=await ok(estates+'/risks',operator,{assetId:rootAsset,category:'failure',
     summary:'Mechanical system requires condition monitoring',likelihood:3,impact:4,
     mitigation:'Review service evidence and record replacement forecast',
     nextReviewOn:year.slice(0,10),ownerStaffId:operator.id});
   assert.ok(risk.id);
   const rows=await ok(estates,operator);
   assert.ok(rows.obligations.some(x=>x.id===obligation.id));
   assert.ok(!JSON.stringify(rows).includes('statutory_certified'));
 });
 await check('all eleven specialist market packs remain disabled until seven independent gates',async()=>{
   const d=await ok(sectors,operator);
   assert.equal(d.packs.length,11);assert.equal(d.modules.length,55);assert.equal(d.checks.length,77);
   const early=await api(sectors+'/packs/'+encodeURIComponent('RES:pack:v1')+'/approve',approver,{
      approvalReference:'PREMATURE-PACK-APPROVAL'});
   assert.notEqual(early.status,200);
   assert.equal((await api(sectors,owner)).status,403);
 });
 const moduleCodes=['RES-M01','RES-M02','RES-M03','RES-M04','RES-M05'];
 for(let i=0;i<moduleCodes.length;i++){
   await ok(sectors+'/modules/'+moduleCodes[i]+'/review',operator,{
    status:i===0?'approved':'excluded',reviewReference:'REVIEWED-RESIDENTIAL-SCOPE-'+moduleCodes[i]});
 }
 for(const c of ['governance','service_scope','pricing','insurance','credentials','privacy','workflow_acceptance']){
   await ok(sectors+'/checks',operator,{packId:'RES:pack:v1',checkCode:c,status:'verified',
     evidenceReference:'INDEPENDENT-MARKET-RELEASE-CHECK-'+c});
 }
 await ok(sectors+'/packs/'+encodeURIComponent('RES:pack:v1')+'/approve',approver,{
    approvalReference:'BOARD-AUTHORISED-RESIDENTIAL-PACK-V1'});
 const rollout=await ok(sectors+'/rollouts',operator,{packId:'RES:pack:v1',engagementId:engagement});
 await check('progressive sector pilot enforces scoped approved module facts and stage sequence',async()=>{
   await ok(sectors+'/rollouts/'+rollout.id+'/state',approver,{status:'pilot',
     authorityReference:'CLIENT-PILOT-APPROVAL-2026'});
   const rejected=await api(sectors+'/records',operator,{rolloutId:rollout.id,moduleCode:'RES-M01',
      assetId:rootAsset,sourceKey:'PRIVATE-CASE-REJECTED',
      facts:{scopeReference:'SIGNED-PILOT',evidenceReference:'SURVEY-REF-001',patientDiagnosis:'MUST-NOT-STORE'}});
   assert.equal(rejected.status,422);
   const cross=await api(sectors+'/records',operator,{rolloutId:rollout.id,moduleCode:'RES-M01',
      assetId:'v2:property:'+otherProperty,sourceKey:'CROSS-PROPERTY-REJECTED',
      facts:{scopeReference:'SIGNED-PILOT',evidenceReference:'SURVEY-REF-001'}});
   assert.notEqual(cross.status,200);
   const record=await ok(sectors+'/records',operator,{rolloutId:rollout.id,moduleCode:'RES-M01',
      assetId:rootAsset,sourceKey:'SIGNED-PILOT-SURVEY-001',
      facts:{scopeReference:'OPERATIONAL-CLIENT-SCOPE',evidenceReference:'SERVICE-SURVEY-REF-001'}});
   await ok(sectors+'/records/'+record.id+'/review',approver,{status:'accepted',
      reviewReference:'INDEPENDENT-OPERATIONS-EVIDENCE-REVIEW'});
   await ok(sectors+'/rollouts/'+rollout.id+'/state',approver,{status:'live',
      authorityReference:'CLIENT-LIVE-ROLLOUT-SIGNOFF-2026'});
   assert.equal((await sql("SELECT COUNT(*) AS n FROM v2_sector_rollouts WHERE status='live'").first()).n,1);
   assert.equal((await sql("SELECT COUNT(*) AS n FROM v2_sector_packs WHERE status='approved'").first()).n,1);
   assert.equal((await sql("SELECT COUNT(*) AS n FROM v2_sector_packs WHERE status='draft'").first()).n,10);
 });
 const pf=await ok(enterprise+'/portfolios',operator,{clientId:client,name:'V2 Planned Estates',
    purpose:'Maintain consistent scoped operational indicators',
    authorityReference:'VERIFIED-CLIENT-REPORTING-AUTHORITY'});
 await check('enterprise portfolio never grants access to unrelated property or client',async()=>{
   await ok(enterprise+'/portfolio-members',operator,{portfolioId:pf.id,propertyId,
     authorityReference:'CLIENT-ASSET-REPORTING-CONSENT'});
   const unrelated=await api(enterprise+'/portfolio-members',operator,{
      portfolioId:pf.id,propertyId:otherProperty,authorityReference:'INVALID-CROSS-CLIENT-LINK'});
   assert.notEqual(unrelated.status,200);
 });
 const capital=await ok(enterprise+'/programmes',operator,{engagementId:engagement,
    title:'Proactive plant replacement programme',
    purpose:'Capture asset renewal costs and staged contractor commitments',
    baselineBudgetCents:10000});
 await check('capital programme approval requires another authorised staff user',async()=>{
   const self=await api(enterprise+'/programmes/'+capital.id+'/state',operator,{status:'approved',
     authorityReference:'SELF-APPROVAL-INVALID',version:1});
   assert.equal(self.status,403);
   await ok(enterprise+'/programmes/'+capital.id+'/state',approver,{status:'approved',
     authorityReference:'SIGNED-CLIENT-CAPEX-AUTHORITY',version:1});
 });
 const project=await ok(enterprise+'/projects',operator,{programmeId:capital.id,assetId:rootAsset,
   title:'Mechanical plant condition remediation',
   scopeSummary:'Review replacement options and contractor proposals before order',
   estimatedCents:10000});
 await ok(enterprise+'/projects/'+project.id+'/state',approver,{
   status:'approved',authorityReference:'CLIENT-CAPEX-PROJECT-AUTHORITY'});
 await check('capital committed amount is transactionally capped by approved programme baseline',async()=>{
   const a=await ok(enterprise+'/commitments',operator,{projectId:project.id,
      category:'professional',proposedCents:7000,quotationReference:'CAPEX-QUOTE-7000'});
   await ok(enterprise+'/commitments/'+a.id+'/review',approver,{status:'approved',
      authorityReference:'CLIENT-SIGNED-COMMITMENT-7000'});
   const b=await ok(enterprise+'/commitments',operator,{projectId:project.id,
      category:'materials',proposedCents:4000,quotationReference:'CAPEX-QUOTE-4000'});
   const over=await api(enterprise+'/commitments/'+b.id+'/review',approver,{status:'approved',
      authorityReference:'SHOULD-BE-REJECTED-OVER-BUDGET'});
   assert.notEqual(over.status,200);
   assert.equal((await sql("SELECT COALESCE(SUM(proposed_cents),0) AS total FROM v2_capital_commitments WHERE status='approved' AND project_id=?",project.id).first()).total,7000);
   const forecast=await ok(enterprise+'/forecasts',operator,{projectId:project.id,
      revision:1,forecastTotalCents:9200,rationale:'Supplier bids reduced provisional costs',
      sourceReference:'INDEPENDENT-SUPPLIER-ESTIMATE-2026'});
   await assert.rejects(sql("UPDATE v2_capital_forecasts SET forecast_total_cents=1 WHERE id=?",forecast.id).run(),/V2_CAPITAL_FORECAST_IMMUTABLE/);
 });
 await check('enterprise reporting uses live scoped records and immutable auditable snapshots',async()=>{
   // Create intentionally similar work on another client's site, plus another
   // market on our site. Each report filter must remove the other rows.
   const t=new Date().toISOString(),past=new Date(Date.now()-3*86400000).toISOString().slice(0,10);
   await sql("INSERT INTO v2_engagements(id,client_id,property_id,market_code,reference,status,scope_summary,starts_at,created_by,created_at) VALUES(?,?,?,?,?,'active',?,?,?,?)",
      'v2-external-com-eng',otherClient,otherProperty,'COM','FOREIGN-COM-ENGAGEMENT',
      'Isolated synthetic operations',twoDaysAgo,operator.id,t).run();
   await sql("INSERT INTO v2_engagements(id,client_id,property_id,market_code,reference,status,scope_summary,starts_at,created_by,created_at) VALUES(?,?,?,?,?,'active',?,?,?,?)",
      'v2-sameclient-com-eng',client,propertyId,'COM','SAMECLIENT-COM-ENGAGEMENT',
      'Isolated synthetic sector scope',twoDaysAgo,operator.id,t).run();
   for(const [id,eng,asset] of [
      ['v2-other-com-obligation','v2-external-com-eng','v2:property:'+otherProperty],
      ['v2-self-com-obligation','v2-sameclient-com-eng',rootAsset]
   ]){
      await sql("INSERT INTO v2_compliance_obligations(id,engagement_id,asset_id,title,category,source_reference,requirement_summary,accountable_party,next_review_on,status,created_by,created_at,updated_at) VALUES(?,?,?,'Extra sector record','fire','EXTERNAL-REFERENCE','Independent maintenance','qualified_provider',?,'tracked',?,?,?)",
        id,eng,asset,past,operator.id,t,t).run();
   }
   for(const [id,eng,budget] of [
      ['v2-external-cap','v2-external-com-eng',50000],
      ['v2-sameclient-cap','v2-sameclient-com-eng',30000]
   ]){
      await sql("INSERT INTO v2_capital_programmes(id,engagement_id,title,purpose,baseline_budget_cents,status,authority_reference,approved_by,approved_at,created_by,created_at,updated_at) VALUES(?,?,'External test capex','Scope regression',?,'approved','SYNTHETIC-REVIEW',?,?,?, ?,?)",
        id,eng,budget,approver.id,t,operator.id,t,t).run();
   }
   const report=await ok(enterprise+'/reports',operator,{
      title:'Client approved residential portfolio scorecard',reportKind:'operations',
      clientId:client,marketCode:'RES',portfolioId:pf.id,windowDays:90});
   const saved=await ok(enterprise+'/reports/'+report.id+'/snapshot',operator,{});
   assert.ok(saved.id);
   assert.ok(Number(saved.summary.assets.assets)>=1);
   assert.equal(Number(saved.summary.compliance.review_overdue),1,
      'RES report must exclude COM obligations, including another market on the same property');
   assert.equal(Number(saved.summary.capital.baseline_cents),10000,
      'RES report must exclude other-client and same-client COM capital programmes');
   assert.equal(saved.summary.capital.committed_cents,7000);
   await assert.rejects(sql("DELETE FROM v2_report_snapshots WHERE id=?",saved.id).run(),/V2_REPORT_SNAPSHOT_IMMUTABLE/);
   const csv=await api(enterprise+'/export?days=90',operator);
   assert.equal(csv.status,200);assert.ok(csv.data.includes('metric'));
   assert.equal((await api(enterprise,owner)).status,403);
   assert.equal((await api(enterprise+'/reports',owner,{title:'Unsafe',reportKind:'operations',windowDays:90})).status,403);
 });

 console.log('PASS V2 all operating-model workflow checks');
}finally {await mf.dispose();}
