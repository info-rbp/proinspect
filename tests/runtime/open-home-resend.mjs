/**
 * Isolated Worker/D1/Resend integration test.
 * The network service is a deterministic in-process mock; no real email
 * is sent, and no deployed Worker or customer data is accessed.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {seal,unseal} from '../../packages/auth/crypto.ts';

mkdirSync('artifacts',{recursive:true});
await build({
 entryPoints:['tests/runtime/open-home-resend-entry.ts'],
 outfile:'artifacts/open-home-resend-worker.mjs',
 bundle:true,format:'esm',platform:'browser',target:'es2022',
 external:['cloudflare:workers'],
});
const secret=randomBytes(32).toString('base64');
const sent=[];
const attempts=[];
let failResend=false;
const env={
 APP_ENV:'production',APP_ORIGIN:'https://testing.proinspect.invalid',
 DATA_ENCRYPTION_KEY:secret,EMAIL_PROVIDER:'resend',
 OPEN_HOME_REPORT_EMAIL_PROVIDER:'resend',OPEN_HOME_REPORTS_ENABLED:'true',
 RESEND_API_KEY:'synthetic-only-never-live',
 EMAIL_FROM:'info@proinspect.systems',
};
const mf=new Miniflare({
 modules:true,scriptPath:'artifacts/open-home-resend-worker.mjs',
 compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],
 d1Databases:{DB:'open-home-report-synthetic'},
 bindings:env,
 outboundService:async request=>{
  assert.equal(new URL(request.url).origin,'https://api.resend.com');
  assert.equal(new URL(request.url).pathname,'/emails');
  assert.equal(request.method,'POST');
  assert.equal(request.headers.get('authorization'),'Bearer synthetic-only-never-live');
  const email=await request.json();
  const key=request.headers.get('Idempotency-Key');
  attempts.push({key,email});
  if(failResend) return new Response('Synthetic provider interruption',{status:503});
  sent.push({key,email});
  return Response.json({id:randomUUID()});
 },
});
const db=await mf.getD1Database('DB');
const run=(sql,...args)=>db.prepare(sql).bind(...args).run();
const first=(sql,...args)=>db.prepare(sql).bind(...args).first();
const count=(sql,...args)=>first(sql,...args).then(r=>r.c);
const checks=[];
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
const moment='2026-10-21T00:00:00.000Z';
const readyAt=Date.parse('2026-10-22T01:00:00.000Z');
const reportId=sessionId=>'evt_openhome_'+sessionId;
async function call(path){
 const response=await mf.dispatchFetch('https://testing.proinspect.invalid'+path);
 return {status:response.status,result:await response.json()};
}
const cron=at=>call('/__test/cron?scheduledTime='+at);
const deliver=id=>call('/__test/deliver?event='+encodeURIComponent(id));
async function session(id,startsAt,endsAt,status='scheduled'){
 await run(
  'INSERT INTO leasing_sessions(id,listing_id,starts_at,ends_at,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
  id,'listing_case',startsAt,endsAt,status,moment,moment,
 );
}
async function addVisitor(id,sessionId,preRegistered=false){
 const envelope=await seal(secret,'open-home-checkin:'+id,{
  name:'Synthetic Visitor '+id,email:id+'@example.invalid',
  phone:'000-000-000',consentAt:'2026-10-21T04:00:00.000Z',
 });
 let registeredLeadId=null;
 if(preRegistered){
  registeredLeadId='lead_'+id;
  await run(
   'INSERT INTO leasing_leads(id,listing_id,session_id,kind,request_key,fingerprint,email_hash,envelope,cancel_token_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
   registeredLeadId,'listing_case',sessionId,'inspection','prereg_'+id,'synthetic','hash_'+id,'test-envelope','cancel_'+id,moment,
  );
 }
 await run(
  'INSERT INTO leasing_checkins(id,listing_id,session_id,registered_lead_id,request_key,fingerprint,email_hash,attendee_hash,contact_envelope,source,consent_version,arrived_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
  id,'listing_case',sessionId,registeredLeadId,'checkin_'+id,'synthetic','hash_'+id,'attendee_'+id,
  envelope,'web','open-home-attendance-v1','2026-10-21T04:00:00.000Z',moment,
 );
}

try{
 for(const statement of JSON.parse(execFileSync('python3',['scripts/schema-statements.py'],{encoding:'utf8'}))){
  await db.prepare(statement).run();
 }
 await run('INSERT INTO users(id,email,verified_at,created_at) VALUES(?,?,?,?)',
  'rep_case','agent@example.invalid',moment,moment);
 await run('INSERT INTO users(id,email,verified_at,created_at) VALUES(?,?,?,?)',
  'staff_case','staff@example.invalid',moment,moment);
 await run("INSERT INTO clients(id,name,client_type,created_at) VALUES(?,?,?,?)",
  'client_case','Synthetic Agency','agency',moment);
 await run('INSERT INTO client_memberships(id,client_id,user_id,role,created_at) VALUES(?,?,?,?,?)',
  'member_case','client_case','rep_case','admin',moment);
 await run("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES(?,?,?,?,?,?,?)",
  'property_case','1 Fictional Test Avenue','Perth','6000','fictional-test-avenue','residential',moment);
 await run('INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES(?,?,?,?,?)',
  'link_case','client_case','property_case','managing_agent',moment);
 await run(
  "INSERT INTO leasing_listings(id,property_id,instructed_by_client_id,kind,slug,title,description,display_address,suburb,postcode,agent_name,agent_role,created_by,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  'listing_case','property_case','client_case','residential','synthetic-testing-property',
  'Synthetic open home for email test','A synthetic listing used only to verify queue delivery.',
  '1 Fictional Test Avenue','Perth','6000','Example Agent','leasing_agent',
  'staff_case','published',moment,moment,
 );
 await run(
  'INSERT INTO open_home_report_settings(listing_id,enabled,recipient_user_id,authority_reference,configured_by,updated_at) VALUES(?,?,?,?,?,?)',
  'listing_case',1,'rep_case','synthetic approved reporting','staff_case',moment,
 );
 await session('session_success','2026-10-21T03:00:00.000Z','2026-10-21T03:30:00.000Z');
 await session('session_retry','2026-10-21T04:00:00.000Z','2026-10-21T04:30:00.000Z');
 await session('session_cancelled','2026-10-21T02:00:00.000Z','2026-10-21T02:30:00.000Z','cancelled');
 await session('session_today','2026-10-22T03:00:00.000Z','2026-10-22T03:30:00.000Z');
 await addVisitor('visitor_1','session_success',true);
 await addVisitor('visitor_2','session_success',false);

 await check('08:59 Perth queues no reports and sends no email',async()=>{
  const response=await cron(Date.parse('2026-10-22T00:59:00.000Z'));
  assert.equal(response.status,200,JSON.stringify(response));
  assert.equal(response.result.queued,0);
  assert.equal(await count('SELECT COUNT(*) AS c FROM open_home_inspection_reports'),0);
  assert.equal(sent.length,0);
 });
 await check('09:00 Perth queues previous-day valid inspections exactly once',async()=>{
  const response=await cron(readyAt);
  assert.equal(response.status,200,JSON.stringify(response));
  assert.equal(response.result.reportDatePerth,'2026-10-21');
  assert.equal(response.result.queued,2);
  assert.equal(await count('SELECT COUNT(*) AS c FROM open_home_inspection_reports'),2);
  assert.equal((await first('SELECT status FROM leasing_sessions WHERE id=?','session_success')).status,'completed');
  assert.equal((await first('SELECT status FROM leasing_sessions WHERE id=?','session_cancelled')).status,'cancelled');
  assert.equal((await first('SELECT status FROM leasing_sessions WHERE id=?','session_today')).status,'scheduled');
  assert.equal(sent.length,0);
  const repeat=await cron(readyAt);
  assert.equal(repeat.status,200,JSON.stringify(repeat));
  assert.equal(repeat.result.queued,0);
  assert.equal(await count('SELECT COUNT(*) AS c FROM open_home_inspection_reports'),2);
 });
 await check('report email contains only aggregates and a sign-in-protected report URL',async()=>{
  const id=reportId('session_success');
  const outbox=await first('SELECT envelope,status FROM outbox_events WHERE id=?',id);
  assert.equal(outbox.status,'pending');
  const job=await unseal(secret,'outbox:'+id,outbox.envelope);
  assert.equal(job.to,'agent@example.invalid');
  assert.equal(job.facts['Visitors checked in'],'2');
  assert.equal(job.facts['Pre-registered arrivals'],'1');
  assert.equal(job.facts['Walk-in visitors'],'1');
  assert.equal(job.href,'https://testing.proinspect.invalid/open-home/report/session_success');
  assert.equal(JSON.stringify(job).includes('visitor_1@example.invalid'),false);
  assert.equal(JSON.stringify(job).includes('Synthetic Visitor'),false);
 });
 await check('Resend receives branded HTML and text with stable idempotency and no visitor PII',async()=>{
  const id=reportId('session_success');
  const response=await deliver(id);
  assert.equal(response.status,200,JSON.stringify(response));
  assert.equal(sent.length,1);
  const {key,email}=sent[0];
  assert.equal(key,id);
  assert.equal(email.from,'info@proinspect.systems');
  assert.deepEqual(email.to,['agent@example.invalid']);
  assert.match(email.subject,/Open home attendance report/);
  assert.match(email.html,/ProInspect/);
  assert.match(email.html,/Visitors checked in/);
  assert.match(email.text,/session_success/);
  assert.equal(JSON.stringify(email).includes('visitor_1@example.invalid'),false);
  assert.equal(JSON.stringify(email).includes('Synthetic Visitor'),false);
  assert.equal((await first('SELECT status FROM outbox_events WHERE id=?',id)).status,'sent');
  await deliver(id);
  assert.equal(sent.length,1);
 });
 await check('temporary Resend failure remains queued and retry uses same idempotency key',async()=>{
  const id=reportId('session_retry');
  failResend=true;
  const failure=await deliver(id);
  assert.equal(failure.status,503,JSON.stringify(failure));
  assert.equal((await first('SELECT status FROM outbox_events WHERE id=?',id)).status,'pending');
  failResend=false;
  const succeeded=await deliver(id);
  assert.equal(succeeded.status,200,JSON.stringify(succeeded));
  assert.equal((await first('SELECT status FROM outbox_events WHERE id=?',id)).status,'sent');
  const attemptsForThis=attempts.filter(x=>x.key===id);
  assert.equal(attemptsForThis.length,2);
  assert.equal(sent.filter(x=>x.key===id).length,1);
 });
 await check('revoked client membership suppresses a queued report instead of emailing',async()=>{
  await session('session_revoked','2026-10-21T06:00:00.000Z','2026-10-21T06:30:00.000Z');
  const report=await cron(readyAt);
  assert.equal(report.status,200,JSON.stringify(report));
  assert.equal(report.result.queued,1);
  await run('UPDATE client_memberships SET active=0 WHERE id=?','member_case');
  const response=await deliver(reportId('session_revoked'));
  assert.equal(response.status,200,JSON.stringify(response));
  const event=await first('SELECT status,error_code FROM outbox_events WHERE id=?',reportId('session_revoked'));
  assert.equal(event.status,'failed');
  assert.equal(event.error_code,'REPORT_RECIPIENT_SUPPRESSED');
  assert.equal(sent.filter(x=>x.key===reportId('session_revoked')).length,0);
 });
 writeFileSync('artifacts/open-home-resend-results.json',JSON.stringify({
  result:'pass',checks,synthetic:true,
  externalServices:'in-process Resend mock only, no external API call, no email sent',
 },null,2));
 console.log('PASS '+checks.length+' open-home Resend tests — no external email sent');
}finally{
 await mf.dispose();
}
