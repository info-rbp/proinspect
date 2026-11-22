import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {catalogueSql} from '../../scripts/catalogue-sql.mjs';

// Live Worker + real isolated SQLite D1 fixture: deliberately no external
// Stripe transfers, tenancy charges, bond lodgements or email delivery.
mkdirSync('artifacts',{recursive:true});
await build({entryPoints:['tests/runtime/entry.ts'],outfile:'artifacts/co-living-onboarding-worker.mjs',
  bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers','node:*']});
const mf=new Miniflare({
  modules:true,scriptPath:'artifacts/co-living-onboarding-worker.mjs',
  compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],
  d1Databases:{DB:'co-living-onboarding-fixture'},
  r2Buckets:{DOCUMENTS:'co-living-onboarding-docs',RESTRICTED_DOCUMENTS:'co-living-onboarding-restricted'},
  durableObjects:{SCHEDULER:{className:'BookingScheduler',useSQLite:true}},
  bindings:{APP_ENV:'local',APP_ORIGIN:'http://localhost',
    DATA_ENCRYPTION_KEY:randomBytes(32).toString('base64'),EMAIL_PROVIDER:'local',
    OPERATIONS_EMAIL:'operations@example.test'},
});
const db=await mf.getD1Database('DB');
const sql=(q,...args)=>db.prepare(q).bind(...args);
async function api(path,{cookie,body,method,origin='http://localhost'}={}){
  const headers=new Headers({Origin:origin});
  if(cookie)headers.set('Cookie',cookie);
  let payload;
  if(body!==undefined){headers.set('Content-Type','application/json');payload=JSON.stringify(body);}
  const response=await mf.dispatchFetch('http://localhost'+path,{
    method:method??(payload?'POST':'GET'),headers:Object.fromEntries(headers),body:payload});
  return {status:response.status,
    data:response.headers.get('content-type')?.includes('json')?await response.json():null,
    cookie:response.headers.get('set-cookie')};
}
async function login(email){
  const start=await api('/api/auth/start',{body:{email}});
  assert.equal(start.status,200,JSON.stringify(start.data));
  const token=new URL(start.data.localSignInUrl).searchParams.get('token');
  const result=await api('/api/auth/complete',{body:{email,token}});
  assert.equal(result.status,200,JSON.stringify(result.data));
  return {cookie:result.cookie.split(';')[0],email};
}
try{
  const statements=JSON.parse(execFileSync('python3',['scripts/schema-statements.py'],{encoding:'utf8'}));
  for(const item of statements)await db.prepare(item).run();
  for(const item of catalogueSql().split('\n'))await db.prepare(item).run();
  const landlord=await login('coliving-onboarding-landlord@example.test');
  const outsider=await login('coliving-onboarding-outsider@example.test');
  const writer=await login('coliving-onboarding-writer@example.test');
  const reviewer=await login('coliving-onboarding-reviewer@example.test');
  const wr=(await sql('SELECT id FROM users WHERE email=?',writer.email).first()).id;
  const rv=(await sql('SELECT id FROM users WHERE email=?',reviewer.email).first()).id;
  await sql("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'operations_manager',1)",wr).run();
  await sql("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'operations_manager',1)",rv).run();
  const ownerCreate=await api('/api/onboarding',{cookie:landlord.cookie,body:{
    displayName:'Co-Living Test Landlord',clientName:'Co-Living Synthetic Owner',landlordType:'residential'}});
  assert.equal(ownerCreate.status,201,JSON.stringify(ownerCreate.data));
  const clientId=ownerCreate.data.clientId,root='/api/w/landlord/'+clientId;
  const added=await api(root+'/properties',{cookie:landlord.cookie,body:{
    address:'19 Workflow Example Street',suburb:'Perth',postcode:'6000',propertyType:'House',selfManaged:true}});
  assert.equal(added.status,201,JSON.stringify(added.data));
  const propertyId=added.data.propertyId;
  const ownerBase=root+'/co-living-onboardings',staffBase='/api/w/staff/operations/co-living-onboardings';
  const key=randomUUID();
  const enquiry=await api(ownerBase,{cookie:landlord.cookie,body:{
    propertyId,objectives:'Create an approved six-room fully furnished co-living property.',
    consent:true,requestKey:key}});
  assert.equal(enquiry.status,200,JSON.stringify(enquiry.data));
  const projectId=enquiry.data.id;
  const duplicate=await api(ownerBase,{cookie:landlord.cookie,body:{
    propertyId,objectives:'Create an approved six-room fully furnished co-living property.',
    consent:true,requestKey:key}});
  assert.equal(duplicate.status,200);
  assert.equal(duplicate.data.id,projectId);
  const ownerUrl=ownerBase+'/'+projectId,staffUrl=staffBase+'/'+projectId;
  assert.equal((await api(ownerUrl,{cookie:outsider.cookie})).status,403);
  assert.equal((await api('/api/w/landlord/'+clientId+'/co-living-onboardings',{cookie:outsider.cookie})).status,403);
  assert.equal((await api(ownerUrl,{cookie:landlord.cookie})).status,200);
  assert.equal((await api(staffUrl,{cookie:writer.cookie})).status,200);
  assert.equal((await api(ownerUrl,{cookie:landlord.cookie,body:{action:'advance',version:1,requestKey:randomUUID()}})).status,403);
  assert.equal((await api(staffUrl,{cookie:writer.cookie,body:{action:'advance',version:1,requestKey:randomUUID()},
    origin:'https://untrusted.invalid'})).status,403);
  const command=async(cookie,body,expected=200)=>{
    const response=await api(cookie===landlord.cookie?ownerUrl:staffUrl,{
      cookie,body:{...body,requestKey:randomUUID()}});
    assert.equal(response.status,expected,JSON.stringify({body,result:response.data}));
    return response.data;
  };
  const detail=async()=>(await api(staffUrl,{cookie:writer.cookie})).data;
  const checks=async(codes)=>{
    for(const code of codes){
      await command(writer.cookie,{action:'submit_check',code,evidenceReference:'synthetic-evidence-'+code});
      await command(reviewer.cookie,{action:'review_check',code,decision:'verified'});
    }
  };
  const advance=async()=>{
    const current=await detail();
    await command(writer.cookie,{action:'advance',version:current.project.version});
  };
  await checks(['contact_recorded','consent_recorded','assessment_assigned']);
  await advance();
  assert.equal((await detail()).project.stage,'site_visit');
  await command(writer.cookie,{action:'save_assessment',visitAt:new Date().toISOString(),
    summary:'Six room layout proposed subject to required lawful room-use checks.',
    internalNotes:'CONFIDENTIAL_SITE_ASSESSMENT_DO_NOT_EXPOSE_OWNER',
    proposedRooms:6,evidenceReference:'synthetic-visit-report-001'});
  const privateAssessment=(await api(ownerUrl,{cookie:landlord.cookie})).data.assessment;
  assert.equal(privateAssessment,null);
  await command(reviewer.cookie,{action:'review_assessment'});
  const ownerAssessment=(await api(ownerUrl,{cookie:landlord.cookie})).data.assessment;
  assert.match(ownerAssessment.summary,/Six room layout/);
  assert.equal(ownerAssessment.internal_notes,undefined);
  const staffAssessment=(await detail()).assessment;
  assert.match(staffAssessment.internal_notes,/CONFIDENTIAL_SITE_ASSESSMENT/);
  await checks(['visit_completed','existing_tenancy_reviewed','room_use_risks_documented','preliminary_budget_recorded']);
  await advance();
  assert.equal((await detail()).project.stage,'proposal');
  const draft=await command(writer.cookie,{action:'draft_proposal',
    traditionalWeeklyCents:89000,roomWeeklyCents:205000,parkingWeeklyCents:5000,
    furnishingBudgetCents:2702500,worksBudgetCents:0,
    assumptions:'Illustrative pricing before expenses. Rooms subject to statutory approval.',
    agreementVersion:'co-living-service-agreement-v1',documentReference:'synthetic-owner-proposal-001'});
  assert.equal((await api(ownerUrl,{cookie:landlord.cookie})).data.proposals.length,0);
  await command(writer.cookie,{action:'issue_proposal',proposalId:draft.proposalId},403);
  await command(reviewer.cookie,{action:'issue_proposal',proposalId:draft.proposalId});
  await command(landlord.cookie,{action:'owner_decision',proposalId:draft.proposalId,
    version:1,decision:'approved',note:'Approved preliminary establishment budget'});
  await command(landlord.cookie,{action:'owner_decision',proposalId:draft.proposalId,
    version:1,decision:'approved',note:'Duplicate acceptance'},409);
  const proposalRow=await sql('SELECT management_fee_bp,utility_cap_of_fee_bp,status FROM co_living_onboarding_proposals WHERE id=?',
    draft.proposalId).first();
  assert.deepEqual([proposalRow.management_fee_bp,proposalRow.utility_cap_of_fee_bp,proposalRow.status],
    [2500,2500,'accepted']);
  await checks(['agreement_executed']);
  await advance();
  assert.equal((await detail()).project.stage,'implementation');
  const item=await command(writer.cookie,{action:'add_item',spaceLabel:'Bedroom 1',
    itemName:'Furniture package',supplier:'IKEA',quantity:1,unitCostCents:3000000});
  const itemId=(await sql("SELECT id FROM co_living_onboarding_items WHERE project_id=?",projectId).first()).id;
  await command(writer.cookie,{action:'update_item',itemId,status:'ordered',actualTotalCents:3000000},409);
  await command(writer.cookie,{action:'request_variation',description:'Additional approved furnishings allowance',extraBudgetCents:1000000});
  const variationId=(await sql("SELECT id FROM co_living_onboarding_variations WHERE project_id=?",projectId).first()).id;
  await command(landlord.cookie,{action:'variation_decision',variationId,decision:'approved'});
  await command(writer.cookie,{action:'update_item',itemId,status:'installed',actualTotalCents:3000000,
    receiptReference:'synthetic-item-receipt-001',warrantyReference:'synthetic-warranty-001'});
  await checks(['approved_works_completed','room_use_approved','inventory_verified',
    'utilities_and_cleaning_ready','readiness_independently_approved']);
  await advance();
  assert.equal((await detail()).project.stage,'advertising');
  await command(writer.cookie,{action:'advance',version:(await detail()).project.version},409);
  // The fixture has no published, approved room listing and no active tenant:
  // the project MUST NOT silently transition into Tenanted.
  const holding=await detail();
  await command(writer.cookie,{action:'set_status',status:'on_hold',
    version:holding.project.version,reason:'Awaiting independently approved listing'});
  assert.equal((await detail()).project.status,'on_hold');
  await command(writer.cookie,{action:'set_status',status:'active',
    version:(await detail()).project.version,reason:'Proceeding after review'});
  assert.equal((await detail()).project.status,'active');
  const published=await sql("SELECT price_ex_gst_cents,booking_mode FROM services WHERE id='routine-inspection'").first();
  assert.equal(published.booking_mode,'request'); // #118 candidate prices remain inactive.
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  console.log('PASS: PR118-descendant Co-Living onboarding role isolation, assessment privacy, proposal review, owner approval, budgets and readiness');
}finally{await mf.dispose();}
