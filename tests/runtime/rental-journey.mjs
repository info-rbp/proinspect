/**
 * Synthetic rental listing -> applicant intake -> declaration -> submission ->
 * restricted staff review -> signed Apps Script transport acceptance.
 *
 * Uses isolated Miniflare D1 and R2, a fake Apps Script endpoint, and .invalid
 * applicant addresses. Does not access Cloudflare production or send emails.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHmac,randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {unseal} from '../../packages/auth/crypto.ts';

mkdirSync('artifacts',{recursive:true});
await build({
 entryPoints:['tests/runtime/rental-journey-entry.ts'],
 outfile:'artifacts/rental-journey-worker.mjs',
 bundle:true,format:'esm',platform:'browser',target:'es2022',
 external:['cloudflare:workers','node:crypto'],
});
const key=randomBytes(32).toString('base64');
const scriptSecret='isolated-rental-handoff-secret-2026-11-08';
const captured=[];
const mf=new Miniflare({
 modules:true,scriptPath:'artifacts/rental-journey-worker.mjs',
 compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],
 d1Databases:{DB:'isolated-rental-journey'},
 r2Buckets:{DOCUMENTS:'rental-journey-documents',RESTRICTED_DOCUMENTS:'rental-journey-restricted'},
 bindings:{
  APP_ENV:'local',APP_ORIGIN:'http://localhost',
  DATA_ENCRYPTION_KEY:key,EMAIL_PROVIDER:'local',
  RENTAL_APPLICATIONS_ENABLED:'true',
  RENTAL_RETENTION_DRAFT_DAYS:'30',RENTAL_RETENTION_SUBMITTED_DAYS:'180',
  RENTAL_RETENTION_WITHDRAWN_DAYS:'30',
  RENTAL_APPS_SCRIPT_ENABLED:'true',
  RENTAL_APPS_SCRIPT_ENDPOINT:'https://script.google.com/macros/s/synthetic/exec',
  RENTAL_APPS_SCRIPT_ALLOWED_HOST:'script.google.com',
  RENTAL_APPS_SCRIPT_SECRET:scriptSecret,
  OPERATIONS_EMAIL:'operations@example.invalid',
 },
 outboundService:async request=>{
  const url=new URL(request.url);
  assert.equal(url.hostname,'script.google.com','unknown outbound call is prohibited');
  assert.equal(request.method,'POST');
  const envelope=await request.json();
  const actual=createHmac('sha256',scriptSecret).update(envelope.timestamp+'.'+envelope.data).digest('hex');
  assert.equal(envelope.signature,'sha256='+actual);
  const payload=JSON.parse(envelope.data);
  assert.equal(payload.contractVersion,'proinspect-rental-email-v1');
  assert.equal(payload.recipient,'Lighthousepropertygroup@mail.com');
  assert.equal(payload.instructingClientId,'cli_lighthouse_property_group_pty_ltd');
  assert.equal(payload.cc,'info@proinspect.systems');
  assert.equal(payload.applicants.length,1);
  assert.equal(payload.documents.length,0);
  captured.push(payload);
  const messageReference='synthetic-script-ack-'+captured.length;
  const confirmation=payload.idempotencyKey+'.'+messageReference+'.accepted';
  const signature=createHmac('sha256',scriptSecret).update(confirmation).digest('hex');
  return Response.json({accepted:true,idempotencyKey:payload.idempotencyKey,messageReference,signature:'sha256='+signature});
 },
});
const db=await mf.getD1Database('DB');
const run=(sql,...params)=>db.prepare(sql).bind(...params).run();
const first=(sql,...params)=>db.prepare(sql).bind(...params).first();
const report={synthetic:true,liveEmailSent:false,productionDataAccessed:false,checks:[],status:'FAIL'};
const check=async(name,fn)=>{await fn();report.checks.push(name);console.log('PASS '+name);};
async function call(path,body){
 const response=await mf.dispatchFetch('http://localhost'+path,{
  method:body===undefined?'GET':'POST',
  headers:body===undefined?{}:{'Content-Type':'application/json',Origin:'http://localhost'},
  body:body===undefined?undefined:JSON.stringify(body),
 });
 const result=await response.json();
 assert.equal(response.status,200,path+': '+JSON.stringify(result));
 return result;
}
try{
 for(const statement of JSON.parse(execFileSync('python3',['scripts/schema-statements.py'],{encoding:'utf8'}))){
  await db.prepare(statement).run();
 }
 const stamp='2026-11-08T00:00:00.000Z';
 await run('INSERT INTO users(id,email,active,verified_at,created_at) VALUES(?,?,?,?,?)',
  'usr_rental_synthetic_staff','reviewer@example.invalid',1,stamp,stamp);
 await run('INSERT INTO staff_profiles(user_id,role,active) VALUES(?,?,?)',
  'usr_rental_synthetic_staff','operations_manager',1);
 await run('INSERT INTO clients(id,name,client_type,status,created_at) VALUES(?,?,?,?,?)',
  'cli_lighthouse_property_group_pty_ltd','Lighthouse synthetic fixture','landlord','active',stamp);
 for(const unit of [6,16]){
  const address='Unit '+unit+', 273 Fulham Street';
  const prop='prop_synthetic_fulham_'+unit;
  const listing='lst_synthetic_fulham_'+unit;
  await run('INSERT INTO properties(id,address,suburb,state,postcode,address_key,sector,created_at) VALUES(?,?,?,?,?,?,?,?)',
   prop,address,'Cloverdale','WA','6105','synthetic-fulham-unit-'+unit,'residential',stamp);
  await run(`INSERT INTO leasing_listings(
   id,property_id,instructed_by_client_id,kind,slug,title,description,
   display_address,suburb,postcode,agent_name,agent_role,created_by,
   status,application_mode,application_authority_reference,
   application_recipient_email,tenancy_database_notice_mode,
   rental_approval_state,rental_recipient_verified_at,created_at,updated_at
  ) VALUES(?,?,?,'residential',?,?,?,?,?,?,?,'landlord',?,
   'published','proinspect','SYNTHETIC-AUTHORITY-DO-NOT-DEPLOY',
   'Lighthousepropertygroup@mail.com','not_used','approved',?,?,?)`,
   listing,prop,'cli_lighthouse_property_group_pty_ltd',
   'unit-'+unit+'-273-fulham-street-cloverdale',
   address+', Cloverdale WA 6105',address+', Cloverdale WA 6105',
   address,'Cloverdale','6105','Lighthouse Property Group Pty Ltd',
   'usr_rental_synthetic_staff',stamp,stamp,stamp);
 }
 await check('two published test listing URLs resolve to the correct Lighthouse properties',async()=>{
  for(const unit of [6,16]){
   const slug='unit-'+unit+'-273-fulham-street-cloverdale';
   const listing=await call('/__test/listing?slug='+slug);
   assert.equal(listing.listing.slug,slug);
   assert.equal(listing.listing.agent_name,'Lighthouse Property Group Pty Ltd');
   const start=await call('/__test/start-page?slug='+slug);
   assert.equal(start.enabled,true);
   assert.equal(start.listing.title.includes('Unit '+unit+','),true);
  }
 });
 for(const unit of [6,16]){
  const listingId='lst_synthetic_fulham_'+unit;
  const email='fictional-unit-'+unit+'@example.invalid';
  let token,applicationId;
  await check('Unit '+unit+': secure application start creates only private outbox invitation',async()=>{
   const response=await call('/__test/start',{listingId,name:'Fictional Tenant Unit '+unit,email,consent:true});
   assert.equal(response.sent,true);
   const row=await first("SELECT id,envelope FROM outbox_events WHERE kind='rental.application.started' ORDER BY created_at DESC,id DESC LIMIT 1");
   const message=await unseal(key,'outbox:'+row.id,row.envelope);
   assert.equal(message.to,email);
   token=new URL(message.href).pathname.split('/').pop();
   assert.match(token,/^[a-f0-9]{64}$/);
   const app=await first('SELECT id,status FROM rental_applications WHERE listing_id=?',listingId);
   assert.equal(app.status,'draft');
   applicationId=app.id;
  });
  await check('Unit '+unit+': applicant saves four Form 18 sections and submits after consent',async()=>{
   const answers={
    identity:{fullName:'Fictional Tenant Unit '+unit,dateOfBirth:'1990-01-01',mobile:'0400000000',
     email,currentAddress:'1 Fictional Avenue, Perth WA 6000',idType:'Passport',
     totalOccupants:'1',petsProposed:'No'},
    rental:{hasRentalHistory:'No'},
    employment:{employmentType:'Student'},
    references:{},
   };
   for(const [section,raw] of Object.entries(answers)){
    const page=await call('/__test/page',{token});
    await call('/__test/section',{token,section,raw,version:page.version});
   }
   const page=await call('/__test/page',{token});
   await call('/__test/complete',{token,version:page.version});
   const submitted=await call('/__test/submit',{token});
   assert.equal(submitted.submitted,true);
   assert.match(submitted.reference,/^RNT-/);
   const app=await first('SELECT status,submitted_at FROM rental_applications WHERE id=?',applicationId);
   assert.equal(app.status,'submitted');
   assert.ok(app.submitted_at);
   assert.equal((await first('SELECT COUNT(*) AS n FROM rental_application_submissions WHERE application_id=?',applicationId)).n,1);
   const msg=await first("SELECT id,envelope FROM outbox_events WHERE kind='rental.application.received' ORDER BY created_at DESC,id DESC LIMIT 1");
   const letter=await unseal(key,'outbox:'+msg.id,msg.envelope);
   assert.equal(letter.to,email);
   assert.equal((await first("SELECT COUNT(*) AS n FROM outbox_events WHERE kind='rental.application.operations'")).n,unit===6?1:2);
  });
  await check('Unit '+unit+': staff review stages a recipient-bound signed handoff',async()=>{
   const app=await first('SELECT version FROM rental_applications WHERE id=?',applicationId);
   const result=await call('/__test/staff-ready',{applicationId,version:app.version});
   assert.equal(result.status,'ready_for_handoff');
   const handoff=await first('SELECT id,status FROM rental_application_handoffs WHERE application_id=?',applicationId);
   assert.equal(handoff.status,'awaiting_script');
  });
  await check('Unit '+unit+': signed fake Apps Script receipt forwards the application exactly once',async()=>{
   await call('/__test/dispatch',{});
   const app=await first('SELECT status,forwarded_at FROM rental_applications WHERE id=?',applicationId);
   assert.equal(app.status,'forwarded');
   assert.ok(app.forwarded_at);
   const receipt=await first('SELECT r.message_reference FROM rental_handoff_receipts r JOIN rental_application_handoffs h ON h.id=r.handoff_id WHERE h.application_id=?',applicationId);
   assert.ok(receipt.message_reference.startsWith('synthetic-script-ack-'));
   assert.equal(captured.at(-1).property,'Unit '+unit+', 273 Fulham Street');
   const count=captured.length;
   await call('/__test/dispatch',{});
   assert.equal(captured.length,count);
  });
 }
 report.status='PASS';
}catch(error){
 report.error=error instanceof Error?error.message:String(error);
 console.error('FAIL rental synthetic journey: '+report.error);
 process.exitCode=1;
}finally{
 writeFileSync('artifacts/rental-journey.json',JSON.stringify(report,null,2)+'\n');
 await mf.dispose();
 console.log(JSON.stringify(report,null,2));
}
