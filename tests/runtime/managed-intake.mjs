/** Synthetic production-mode acceptance. Local D1/R2/mail only; no real providers. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {unseal} from '../../packages/auth/crypto.ts';
import {MANAGED_RENTAL_POLICY,MANAGED_RENTAL_POLICY_VERSION} from '../../packages/marketing/managed-rental-policy.ts';

mkdirSync('artifacts',{recursive:true});
await build({entryPoints:['tests/runtime/rental-journey-entry.ts'],outfile:'artifacts/managed-intake-worker.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers','node:crypto']});
const key=randomBytes(32).toString('base64'),source='a'.repeat(40),stamp=new Date().toISOString();
const policyHash=createHash('sha256').update(JSON.stringify(MANAGED_RENTAL_POLICY)).digest('hex');
const report={synthetic:true,productionDataAccessed:false,liveEmailSent:false,checks:[],status:'FAIL'};
const mf=new Miniflare({modules:true,scriptPath:'artifacts/managed-intake-worker.mjs',compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],
 d1Databases:{DB:'isolated-managed-intake'},r2Buckets:{DOCUMENTS:'isolated-managed-documents',RESTRICTED_DOCUMENTS:'isolated-managed-restricted'},
 bindings:{APP_ENV:'production',APP_ORIGIN:'http://localhost',BUILD_SHA:source,ISOLATED_MANAGED_INTAKE:'true',DATA_ENCRYPTION_KEY:key,EMAIL_PROVIDER:'local',RENTAL_APPLICATIONS_ENABLED:'true',RENTAL_RETENTION_AUTOPURGE_ENABLED:'true',RENTAL_SCANNER_ENABLED:'false',RENTAL_APPS_SCRIPT_ENABLED:'false',OPERATIONS_EMAIL:'operations@example.invalid',MARKETING_TURNSTILE_SECRET_KEY:'synthetic-turnstile-secret'},
 outboundService:async request=>{
  const url=new URL(request.url);
  assert.equal(url.hostname,'challenges.cloudflare.com','No applicant information may be sent to scanner or handoff providers');
  return Response.json({success:true,hostname:'localhost',action:'rental_application'});
 }});
const db=await mf.getD1Database('DB'),run=(sql,...v)=>db.prepare(sql).bind(...v).run(),first=(sql,...v)=>db.prepare(sql).bind(...v).first();
const check=async(name,fn)=>{await fn();report.checks.push(name);console.log('PASS '+name);};
async function call(path,body,expected=200){
 const response=await mf.dispatchFetch('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost'},body:body===undefined?undefined:JSON.stringify(body)});
 const value=await response.json();assert.equal(response.status,expected,path+': '+JSON.stringify(value));return value;
}
let token,applicationId;
try{
 for(const sql of JSON.parse(execFileSync('python3',['scripts/schema-statements.py'],{encoding:'utf8'})))await db.prepare(sql).run();
 await run("INSERT INTO users(id,email,active,verified_at,created_at) VALUES('usr_rental_synthetic_admin','admin@example.invalid',1,?,?)",stamp,stamp);
 await run("INSERT INTO staff_profiles(user_id,role,active) VALUES('usr_rental_synthetic_admin','administrator',1)");
 await run("INSERT INTO clients(id,name,client_type,status,created_at) VALUES('cli_managed_synthetic','Synthetic owner','landlord','active',?)",stamp);
 await run("INSERT INTO properties(id,address,suburb,state,postcode,address_key,sector,created_at) VALUES('prop_managed_synthetic','1 Fictional Avenue','Perth','WA','6000','managed-synthetic','residential',?)",stamp);
 await run("INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES('link_managed_synthetic','cli_managed_synthetic','prop_managed_synthetic','landlord',?)",stamp);
 await run("INSERT INTO leasing_listings(id,property_id,instructed_by_client_id,kind,slug,title,description,display_address,suburb,postcode,agent_name,agent_role,created_by,status,application_mode,application_authority_reference,created_at,updated_at) VALUES('lst_managed_synthetic','prop_managed_synthetic','cli_managed_synthetic','residential','managed-synthetic','Synthetic managed property','Fictional property used only for an isolated application test.','1 Fictional Avenue','Perth','6000','Private Synthetic Landlord','landlord','usr_rental_synthetic_admin','published','proinspect','SYNTHETIC-OWNER-INSTRUCTION',?,?)",stamp,stamp);
 await run("INSERT INTO leasing_photos(id,listing_id,object_key,content_type,size,alt_text,created_at) VALUES('photo_managed_synthetic','lst_managed_synthetic','synthetic/managed-photo','image/jpeg',1,'Synthetic property photograph',?)",stamp);
 await check('a flag alone cannot enable intake or publish a privacy policy',async()=>{
  const state=await call('/__test/release-state');assert.equal(state.rental,false);assert.equal(state.privacy,null);
  assert.equal((await call('/__test/start-page?slug=managed-synthetic')).enabled,false);
 });
 await run("INSERT INTO managed_rental_intake_releases(id,environment,source_sha,policy_version,policy_sha256,intake_mode,authorized_by,authorization_reference,enabled,created_at) VALUES('mip_synthetic','production',?,?,?,'details_only','synthetic-owner','Synthetic owner instruction, never production acceptance',1,?)",source,MANAGED_RENTAL_POLICY_VERSION,policyHash,stamp);
 await check('source-bound owner release enables only the document-free rental capability',async()=>{
  const state=await call('/__test/release-state');assert.equal(state.rental,true);
  for(const key of ['scanner','handoff','commercial'])assert.equal(state[key],false);
  assert.equal(state.privacy.version_label,MANAGED_RENTAL_POLICY_VERSION);
  assert.equal((await call('/__test/start-page?slug=managed-synthetic')).enabled,false,'A management tag is still required');
  await assert.rejects(()=>run("UPDATE managed_rental_intake_releases SET source_sha=?", 'b'.repeat(40)),/MANAGED_RELEASE_IMMUTABLE/);
 });
 await check('staff can tag a property; stale changes cannot overwrite its classification',async()=>{
  const body={listingId:'lst_managed_synthetic',input:{provider:'proinspect',reference:'SYNTHETIC-OWNER-CONFIRMATION',version:0}};
  await call('/__test/management-tag',body);await call('/__test/management-tag',body,409);
  assert.equal((await first("SELECT provider,version FROM property_application_management WHERE property_id='prop_managed_synthetic'")).provider,'proinspect');
  assert.equal((await call('/__test/start-page?slug=managed-synthetic')).enabled,true);
  assert.equal((await first("SELECT rental_approval_state,rental_recipient_verified_at FROM leasing_listings WHERE id='lst_managed_synthetic'")).rental_approval_state,'pending','No independent approval or verified inbox was fabricated');
 });
 await check('managed intake creates a private application with a 14-day draft deadline',async()=>{
  const page=await call('/__test/start-page?slug=managed-synthetic');
  assert.equal(page.detailsOnly,true);assert.equal(page.collectionNotice.recipient,'ProInspect Property Services Pty Ltd');
  assert.deepEqual(page.collectionNotice.retention,{draft:14,submitted:90,withdrawn:30});
  await call('/__test/start',{listingId:'lst_managed_synthetic',name:'Fictional Applicant',email:'applicant@example.invalid',consent:true,turnstile:'synthetic'});
  const row=await first("SELECT id,envelope FROM outbox_events WHERE kind='rental.application.started'");
  token=new URL((await unseal(key,'outbox:'+row.id,row.envelope)).href).pathname.split('/').pop();
  const app=await first("SELECT id,retained_until FROM rental_applications");applicationId=app.id;
  assert(Math.abs(Date.parse(app.retained_until)-Date.now()-14*86400000)<10000);
 });
 await check('uploads are blocked in the server and unnecessary third-party contact fields are discarded',async()=>{
  const page=await call('/__test/page',{token});assert.equal(page.uploadsEnabled,false);
  assert.equal((await call('/__test/upload-blocked',{token},503)).code,'DOCUMENT_UPLOADS_DISABLED');
  const sections={
   identity:{fullName:'Fictional Applicant',dateOfBirth:'1990-01-01',mobile:'0400000000',currentAddress:'1 Fictional Road',totalOccupants:'1',petsProposed:'No'},
   rental:{hasRentalHistory:'No',noHistoryReason:'First tenancy; relevant alternative evidence can be arranged.'},
   employment:{employmentType:'Student'},
   references:{additionalReferences:JSON.stringify([{name:'Synthetic Referee',relationship:'Colleague',phone:'0400000001',email:''}]),emergencyName:'Must not be collected',nextKinName:'Must not be collected',reference1Address:'Must not be collected'}
  };
  for(const [section,raw] of Object.entries(sections)){const current=await call('/__test/page',{token});await call('/__test/section',{token,section,raw,version:current.version});}
  const saved=await call('/__test/page',{token});
  assert.equal(saved.answers.identity.idType,'Not yet available');
  assert(!JSON.stringify(saved.answers).includes('Must not be collected'));
 });
 await check('an application submits without attachments for private staff review',async()=>{
  const page=await call('/__test/page',{token});await call('/__test/complete',{token,version:page.version});
  const response=await call('/__test/submit',{token});assert.equal(response.submitted,true);
  assert.equal((await first('SELECT COUNT(*) AS n FROM rental_application_handoffs')).n,0);
  assert.equal((await first('SELECT COUNT(*) AS n FROM rental_application_documents')).n,0);
  const app=await first('SELECT status,retained_until FROM rental_applications WHERE id=?',applicationId);
  assert.equal(app.status,'submitted');assert(Math.abs(Date.parse(app.retained_until)-Date.now()-90*86400000)<10000);
  const current=await first('SELECT version FROM rental_applications WHERE id=?',applicationId);
  assert.equal((await call('/__test/staff-ready',{applicationId,version:current.version},409)).code,'MANAGED_INTAKE_FORWARDING_DISABLED');
  assert.equal((await first('SELECT COUNT(*) AS n FROM rental_application_handoffs')).n,0);
 });
 await check('expired applications respect holds and erase even after the listing closes',async()=>{
  await run("UPDATE leasing_listings SET status='leased' WHERE id='lst_managed_synthetic'");
  await run('UPDATE rental_applications SET retained_until=?,privacy_hold_until=? WHERE id=?',new Date(Date.now()-86400000).toISOString(),new Date(Date.now()+86400000).toISOString(),applicationId);
  await call('/__test/retention',{});assert(await first('SELECT id FROM rental_applications WHERE id=?',applicationId));
  await run('UPDATE rental_applications SET privacy_hold_until=NULL WHERE id=?',applicationId);
  await call('/__test/retention',{});assert.equal(await first('SELECT id FROM rental_applications WHERE id=?',applicationId),null);
  assert.equal((await first('SELECT COUNT(*) AS n FROM rental_application_purge_receipts')).n,1);
  await run("UPDATE leasing_listings SET status='published' WHERE id='lst_managed_synthetic'");
 });
 await check('an external management tag closes native intake even with an accepted release',async()=>{
  await call('/__test/management-tag',{listingId:'lst_managed_synthetic',input:{provider:'external',reference:'SYNTHETIC-EXTERNAL-INSTRUCTION',version:1}});
  assert.equal((await call('/__test/start-page?slug=managed-synthetic')).enabled,false);
  await call('/__test/start',{listingId:'lst_managed_synthetic',name:'Blocked Applicant',email:'blocked@example.invalid',consent:true,turnstile:'synthetic'},404);
  assert.equal((await first('SELECT COUNT(*) AS n FROM rental_applications')).n,0);
 });
 report.status='PASS';
}catch(error){report.error=String(error?.stack??error);console.error(report.error);process.exitCode=1;}
finally{writeFileSync('artifacts/managed-intake-acceptance.json',JSON.stringify(report,null,2)+'\n');await mf.dispose();console.log(JSON.stringify(report,null,2));}
