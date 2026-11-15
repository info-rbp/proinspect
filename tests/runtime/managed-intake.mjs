/** Synthetic production-mode acceptance. Local D1/R2/mail only; no real providers. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {unseal} from '../../packages/auth/crypto.ts';
import * as detailsPolicy from '../../packages/marketing/managed-rental-policy-v1.ts';
import * as documentPolicy from '../../packages/marketing/managed-rental-policy.ts';
import {scanKeyId,SCANNER_BASE_IMAGE_DIGEST} from '../../packages/marketing/private-scan.ts';
const documentsMode=process.argv.includes('--documents');
const {MANAGED_RENTAL_POLICY,MANAGED_RENTAL_POLICY_VERSION}=documentsMode?documentPolicy:detailsPolicy;
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey),keyId=await scanKeyId(publicKey);
let scannerMode='valid',scanCount=0;
async function scanner(request){
 const nonce=request.headers.get('X-ProInspect-Scan-Nonce'),path=new URL(request.url).pathname;
 if(scannerMode==='unavailable')return new Response('Unavailable',{status:503});
 const evidence={protocol:'proinspect-private-scan-v1',kind:path==='/health'?'health':'scan',sourceSha:'a'.repeat(40),baseImageDigest:SCANNER_BASE_IMAGE_DIGEST,nonce,keyId,eventId:crypto.randomUUID(),checkedAt:new Date().toISOString(),engine:{engineVersion:'ClamAV 1.5.4',databaseVersion:12345,definitionsUpdatedAt:new Date(Date.now()-3600000).toISOString()}};
 if(path==='/scan'){
  const meta=JSON.parse(atob(request.headers.get('X-ProInspect-Scan-Metadata')));
  assert.deepEqual(Object.keys(meta).sort(),['contentType','documentId','nonce','sha256','sizeBytes'].sort(),'No applicant, property or filename is sent to the engine');
  const bytes=await request.arrayBuffer();assert.equal(createHash('sha256').update(Buffer.from(bytes)).digest('hex'),meta.sha256);scanCount++;
  Object.assign(evidence,{documentId:meta.documentId,sha256:meta.sha256,verdict:Buffer.from(bytes).includes(Buffer.from('SYNTHETIC-UNSAFE-FIXTURE'))?'unsafe':'clean',complete:scannerMode!=='incomplete'});
 }
 const timestamp=String(Math.floor(Date.now()/1000)),raw=JSON.stringify(evidence);
 const signature=Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(timestamp+'.'+raw))).toString('base64url');
 return new Response(scannerMode==='forged'?raw.replace('12345','12346'):raw,{headers:{'X-ProInspect-Scan-Time':timestamp,'X-ProInspect-Scan-Signature':signature}});
}

mkdirSync('artifacts',{recursive:true});
await build({entryPoints:['tests/runtime/rental-journey-entry.ts'],outfile:'artifacts/managed-intake-worker.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers','node:crypto']});
const key=randomBytes(32).toString('base64'),source='a'.repeat(40),stamp=new Date().toISOString();
const policyHash=createHash('sha256').update(JSON.stringify(MANAGED_RENTAL_POLICY)).digest('hex');
const report={synthetic:true,productionDataAccessed:false,liveEmailSent:false,checks:[],status:'FAIL'};
const mf=new Miniflare({serviceBindings:documentsMode?{PRIVATE_DOCUMENT_SCANNER:scanner}:{},modules:true,scriptPath:'artifacts/managed-intake-worker.mjs',compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],
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
 if(documentsMode){
  await run("INSERT INTO managed_rental_document_releases(id,environment,source_sha,policy_version,policy_sha256,intake_mode,scanner_worker_name,scanner_source_sha,scanner_image_digest,scanner_key_id,scanner_public_jwk,scanner_test_sha256,scanner_verified_at,authorized_by,authorization_reference,enabled,created_at) VALUES('mdr_synthetic','production',?,?,?,'scanned_documents','proinspect-private-document-scanner',?,?,?,?,?,?,'synthetic-owner','Synthetic only, never live acceptance evidence',1,?)",source,MANAGED_RENTAL_POLICY_VERSION,policyHash,source,SCANNER_BASE_IMAGE_DIGEST,keyId,JSON.stringify(publicKey),'c'.repeat(64),stamp,stamp);
 }else await run("INSERT INTO managed_rental_intake_releases(id,environment,source_sha,policy_version,policy_sha256,intake_mode,authorized_by,authorization_reference,enabled,created_at) VALUES('mip_synthetic','production',?,?,?,'details_only','synthetic-owner','Synthetic owner instruction, never production acceptance',1,?)",source,MANAGED_RENTAL_POLICY_VERSION,policyHash,stamp);
 await check(documentsMode?'source-bound owner release enables private scanned managed intake only':'source-bound owner release enables only the document-free rental capability',async()=>{
  const state=await call('/__test/release-state');assert.equal(state.rental,true);
  assert.equal(state.scanner,documentsMode);
  for(const key of ['handoff','commercial'])assert.equal(state[key],false);
  assert.equal(state.privacy.version_label,MANAGED_RENTAL_POLICY_VERSION);
  assert.equal((await call('/__test/start-page?slug=managed-synthetic')).enabled,false,'A management tag is still required');
  await assert.rejects(()=>run(documentsMode?"UPDATE managed_rental_document_releases SET source_sha=?":"UPDATE managed_rental_intake_releases SET source_sha=?",'b'.repeat(40)),documentsMode?/DOCUMENT_RELEASE_IMMUTABLE/:/MANAGED_RELEASE_IMMUTABLE/);
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
  assert.equal(page.detailsOnly,!documentsMode);assert.equal(page.collectionNotice.recipient,'ProInspect Property Services Pty Ltd');
  assert.deepEqual(page.collectionNotice.retention,{draft:14,submitted:90,withdrawn:30});
  await call('/__test/start',{listingId:'lst_managed_synthetic',name:'Fictional Applicant',email:'applicant@example.invalid',consent:true,turnstile:'synthetic'});
  const row=await first("SELECT id,envelope FROM outbox_events WHERE kind='rental.application.started'");
  token=new URL((await unseal(key,'outbox:'+row.id,row.envelope)).href).pathname.split('/').pop();
  const app=await first("SELECT id,retained_until FROM rental_applications");applicationId=app.id;
  assert(Math.abs(Date.parse(app.retained_until)-Date.now()-14*86400000)<10000);
 });
 await check(documentsMode?'managed intake minimises unnecessary personal information':'uploads are blocked in the server and unnecessary third-party contact fields are discarded',async()=>{
  const page=await call('/__test/page',{token});assert.equal(page.uploadsEnabled,documentsMode);
  if(!documentsMode)assert.equal((await call('/__test/upload-blocked',{token},503)).code,'DOCUMENT_UPLOADS_DISABLED');
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
 if(documentsMode)await check('scanned uploads stay private, reject forged and incomplete results, and permit submission before human review',async()=>{
  async function upload(body,expected=200){
   const form=new FormData();form.set('token',token);form.set('category','income');form.set('file',new File([body],'synthetic-evidence.pdf',{type:'application/pdf'}));
   const request=new Request('http://localhost/__test/upload',{method:'POST',body:form});
   const response=await mf.dispatchFetch(request.url,{method:'POST',headers:request.headers,body:await request.arrayBuffer()});
   const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));return result;
  }
  scannerMode='unavailable';await upload('%PDF-1.4 unavailable',503);
  assert.equal((await first('SELECT COUNT(*) AS n FROM rental_application_documents')).n,0);
  scannerMode='valid';await upload('%PDF-1.4 synthetic clean evidence');
  const doc=await first('SELECT id,scan_status,review_status,reviewed_by FROM rental_application_documents');
  assert.equal(doc.scan_status,'pending');assert.equal(doc.review_status,'quarantined');assert.equal(doc.reviewed_by,null);
  assert.equal((await mf.dispatchFetch('http://localhost/__test/document-download?app='+applicationId+'&doc='+doc.id)).status,404,'Staff cannot open draft application files');
  for(const mode of ['forged','incomplete']){
   scannerMode=mode;await run('UPDATE rental_document_scan_jobs SET next_attempt_at=?',stamp);await call('/__test/scan-dispatch',{});
   assert.equal((await first('SELECT scan_status FROM rental_application_documents WHERE id=?',doc.id)).scan_status,'pending');
  }
  scannerMode='valid';await run('UPDATE rental_document_scan_jobs SET next_attempt_at=?',stamp);await call('/__test/scan-dispatch',{});
  const clean=await first('SELECT scan_status,review_status,reviewed_by FROM rental_application_documents WHERE id=?',doc.id);
  assert.equal(clean.scan_status,'clean');assert.equal(clean.review_status,'quarantined');assert.equal(clean.reviewed_by,null,'No human reviewer is fabricated');
  await upload('%PDF-1.4 SYNTHETIC-UNSAFE-FIXTURE');await call('/__test/scan-dispatch',{});
  const unsafe=await first("SELECT id,scan_status,review_status FROM rental_application_documents WHERE scan_status='unsafe'");
  assert.equal(unsafe.review_status,'rejected');
  const page=await call('/__test/page',{token});await call('/__test/complete',{token,version:page.version});
  assert.equal((await call('/__test/submit',{token},409)).code,'DOCUMENTS_NOT_READY');
  await call('/__test/delete-document',{token,documentId:unsafe.id});
  assert.equal((await first('SELECT COUNT(*) AS n FROM rental_document_scan_receipts WHERE document_id=?',unsafe.id)).n,0);
 });
 await check(documentsMode?'security-cleared files submit for separate private staff review':'an application submits without attachments for private staff review',async()=>{
  const page=await call('/__test/page',{token});await call('/__test/complete',{token,version:page.version});
  const response=await call('/__test/submit',{token});assert.equal(response.submitted,true);
  assert.equal((await first('SELECT COUNT(*) AS n FROM rental_application_handoffs')).n,0);
  assert.equal((await first('SELECT COUNT(*) AS n FROM rental_application_documents')).n,documentsMode?1:0);
  if(documentsMode){
   const doc=await first('SELECT id FROM rental_application_documents');
   const response=await mf.dispatchFetch('http://localhost/__test/document-download?app='+applicationId+'&doc='+doc.id);
   assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.match(response.headers.get('Content-Disposition'),/^attachment/);
   assert.equal((await first('SELECT reviewed_by FROM rental_application_documents')).reviewed_by,null);
   await call('/__test/document-review',{applicationId,documentId:doc.id});
   assert.equal((await first('SELECT reviewed_by FROM rental_application_documents')).reviewed_by,'usr_rental_synthetic_admin');
   assert(scanCount>=4);
  }
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
finally{writeFileSync(documentsMode?'artifacts/private-document-scanning-acceptance.json':'artifacts/managed-intake-acceptance.json',JSON.stringify(report,null,2)+'\n');await mf.dispose();console.log(JSON.stringify(report,null,2));}
