import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID,createHash,createHmac} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {catalogueSql} from '../../scripts/catalogue-sql.mjs';
import {unseal,seal} from '../../packages/auth/crypto.ts';
mkdirSync('artifacts',{recursive:true});
await build({entryPoints:['tests/runtime/communications-entry.ts'],outfile:'artifacts/communications-worker.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022',external: ['cloudflare:workers', 'node:crypto']});
const key=randomBytes(32).toString('base64'),gateway=randomBytes(32).toString('hex'),mail=[];
let failMail=false;
const mf=new Miniflare({
 modules:true,scriptPath:'artifacts/communications-worker.mjs',compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'communications'},r2Buckets:{DOCUMENTS:'docs',RESTRICTED_DOCUMENTS:'private'},durableObjects:{SCHEDULER:{className:'BookingScheduler',useSQLite:true}},
 bindings:{APP_ENV:'local',APP_ORIGIN:'http://localhost',MARKETING_ORIGIN:'http://localhost:5174',DATA_ENCRYPTION_KEY:key,ENQUIRY_GATEWAY_SECRET:gateway,EMAIL_PROVIDER:'resend',RESEND_API_KEY:'synthetic',EMAIL_FROM:'ProInspect <test@example.test>',OPERATIONS_EMAIL:'operations@example.test'},
 outboundService:async request=>{if(new URL(request.url).origin==='https://api.resend.com'){if(failMail)return new Response('synthetic outage',{status:503});mail.push({key:request.headers.get('Idempotency-Key'),...await request.json()});return Response.json({id:randomUUID()});}throw new Error('Unexpected external request');}
});
const db=await mf.getD1Database('DB'),run=(s,...v)=>db.prepare(s).bind(...v).run(),first=(s,...v)=>db.prepare(s).bind(...v).first();
const checks=[];
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function api(path,who,body){const r=await mf.dispatchFetch('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'http://localhost',...(who?{Cookie:who.cookie}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
async function ok(path,who,body,status=200){const r=await api(path,who,body);assert.equal(r.status,status,JSON.stringify(r));return r.data;}
async function login(email){const a=await ok('/api/auth/start',null,{email}),token=new URL(a.localSignInUrl).searchParams.get('token');const r=await mf.dispatchFetch('http://localhost/api/auth/complete',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({email,token})});assert.equal(r.status,200);return {email,cookie:r.headers.get('set-cookie').split(';')[0],id:(await first('SELECT id FROM users WHERE email=?',email)).id};}
const staffApi='/api/w/staff/operations';
function envelope(input,extra={}){const body=JSON.stringify({origin:'http://localhost:5174',clientKey:createHash('sha256').update('local-source').digest('hex'),input,...extra}),time=String(Date.now());return {body,headers:{'Content-Type':'application/json','X-Enquiry-Time':time,'X-Enquiry-Signature':createHmac('sha256',gateway).update(`proinspect-enquiry-v1\n${time}\n${body}`).digest('hex')}};}
async function submit(input,extra={}){const e=envelope(input,extra),r=await mf.dispatchFetch('http://localhost/api/public/enquiries',{method:'POST',...e});return {status:r.status,data:await r.json()};}
async function dispatch(){return ok('/__test/dispatch');}
async function deliver(id){return api('/__test/deliver?event='+id);}
const past=new Date(Date.now()-86400000).toISOString(),future=new Date(Date.now()+86400000).toISOString();
try {
 for(const q of JSON.parse(execFileSync('python3',['scripts/schema-statements.py'],{encoding:'utf8'})))await db.prepare(q).run();
 for(const q of catalogueSql().split('\n'))await db.prepare(q).run();
 const staff=await login('operator@example.test'),inspector=await login('inspector@example.test'),outsider=await login('outsider@example.test');
 await run("INSERT INTO staff_profiles VALUES(?,'operations_manager',1)",staff.id);await run("INSERT INTO staff_profiles VALUES(?,'inspector',1)",inspector.id);
 const input={requestKey:randomUUID(),name:'Synthetic agency',email:'customer@example.test',phone:'000000',organisation:'Test agency',suburb:'Perth',kind:'portfolio',serviceId:'routine-inspection',message:'We need inspection support for a synthetic portfolio.',consent:true};
 let enquiry;
 await check('signed marketing enquiry persists encrypted contact data without granting an account',async()=>{
 const r=await submit(input);assert.equal(r.status,201);enquiry=await first('SELECT * FROM marketing_enquiries WHERE reference=?',r.data.reference);assert.ok(enquiry);assert.ok(!enquiry.envelope.includes(input.email));assert.equal((await unseal(key,`enquiry:${enquiry.id}`,enquiry.envelope)).message,input.message);assert.equal(await first('SELECT id FROM users WHERE email=?',input.email),null);
 });
 await check('unsigned forged-origin changed-retry and oversized submissions are rejected',async()=>{
 const r=await mf.dispatchFetch('http://localhost/api/public/enquiries',{method:'POST',body:'{}'});assert.equal(r.status,403);
 assert.equal((await submit({...input,requestKey:randomUUID()},{origin:'https://attacker.example'})).status,403);
 assert.equal((await submit({...input,message:'Changed payload with the same key.'})).status,409);
 const over=await mf.dispatchFetch('http://localhost/api/public/enquiries',{method:'POST',body:'x'.repeat(21000)});assert.equal(over.status,413);
 });
 await check('concurrent enquiry retries return one record and one operations email',async()=>{
 const retries=await Promise.all([submit(input),submit(input)]);assert.ok(retries.every(r=>r.data.reference===enquiry.reference));assert.equal((await first('SELECT COUNT(*) AS c FROM marketing_enquiries')).c,1);assert.equal((await first("SELECT COUNT(*) AS c FROM outbox_events WHERE kind='enquiry.received'")).c,1);
 });
 await check('only authorised operations staff can view enquiry contact details',async()=>{
 assert.equal((await api(`${staffApi}/enquiries/${enquiry.id}`,inspector)).status,403);assert.equal((await api(`${staffApi}/enquiries/${enquiry.id}`,outsider)).status,403);assert.equal((await api(`${staffApi}/enquiries/${enquiry.id}`)).status,401);const d=await ok(`${staffApi}/enquiries/${enquiry.id}`,staff);assert.equal(d.contact.email,input.email);
 });
 await check('triage uses optimistic locking and records internal notes',async()=>{
 await ok(`${staffApi}/enquiries/${enquiry.id}`,staff,{version:1,status:'reviewing',assignedUserId:staff.id,note:'Scope and capacity under review.'});
 assert.equal((await api(`${staffApi}/enquiries/${enquiry.id}`,staff,{version:1,status:'closed',note:'Stale write must fail.'})).status,409);
 const d=await ok(`${staffApi}/enquiries/${enquiry.id}`,staff);assert.equal(d.enquiry.version,2);assert.ok(d.history.some(e=>e.message==='Scope and capacity under review.'));
 });
 let replyEvent;
 await check('staff reply queues once and the provider adapter receives only the chosen reply',async()=>{
 const body={version:2,requestKey:randomUUID(),message:'Thank you. Please confirm the approximate inspection volume.'};await ok(`${staffApi}/enquiries/${enquiry.id}/reply`,staff,body);await ok(`${staffApi}/enquiries/${enquiry.id}/reply`,staff,body);
 replyEvent=await first("SELECT id FROM outbox_events WHERE kind='enquiry.reply'");assert.ok(replyEvent);await deliver(replyEvent.id);await deliver(replyEvent.id);assert.equal(mail.filter(m=>m.key===replyEvent.id).length,1);assert.deepEqual(mail.find(m=>m.key===replyEvent.id).to,[input.email]);assert.equal((await ok(`${staffApi}/enquiries/${enquiry.id}`,staff)).enquiry.status,'awaiting_customer');
 });
 await check('client linking records verification without creating membership',async()=>{
 await run("INSERT INTO clients(id,name,client_type,created_at) VALUES('cl_fixture','Synthetic client','agency',?)",past);
 await ok(`${staffApi}/enquiries/${enquiry.id}/link`,staff,{version:3,clientId:'cl_fixture',reference:'Contact identity checked against signed engagement.'});assert.equal((await first("SELECT COUNT(*) AS c FROM client_memberships WHERE client_id='cl_fixture'")).c,0);
 });
 await check('enquiry queue is paginated and public consent is mandatory',async()=>{
 for(let i=0;i<27;i++)await run(`INSERT INTO marketing_enquiries(id,reference,request_key,fingerprint,envelope,enquiry_kind,created_at,updated_at) VALUES(?,?,?,?,?,'other',?,?)`,'seed_'+i,'SEED-'+i,randomUUID(),'synthetic',await seal(key,'enquiry:seed_'+i,input),past,past);
 const page=await ok(staffApi+'/enquiries',staff);assert.equal(page.items.length,25);assert.ok(page.next);const rest=await ok(staffApi+'/enquiries?after='+page.next,staff);assert.equal(rest.items.length,3);assert.ok(!rest.items.some(x=>page.items.some(y=>y.id===x.id)));assert.equal((await submit({...input,requestKey:randomUUID(),consent:false})).status,422);
 });
 const resident=await login('resident@example.test'),owner=await login('building-owner@example.test'),council=await login('council@example.test');
 await run("INSERT INTO strata_schemes(id,name,scheme_number,created_at) VALUES('sc_test','Synthetic building','TEST-001',?)",past);
 await run("INSERT INTO scheme_buildings(id,scheme_id,name) VALUES('b_test','sc_test','Building A')");
 await run("INSERT INTO strata_lots(id,scheme_id,lot_number,building_id) VALUES('lot_test','sc_test','1','b_test')");
 for(const [who,role] of [[resident,'resident'],[owner,'owner'],[council,'council_member']])await run('INSERT INTO scheme_memberships(id,scheme_id,lot_id,user_id,role,starts_at,approved_by) VALUES(?,?,?,?,?,?,?)','m_'+who.id,'sc_test','lot_test',who.id,role,past,staff.id);
 const schemeApi=staffApi+'/schemes/sc_test',residentApi='/api/w/building/sc_test',councilApi='/api/w/council/sc_test';
 await run("INSERT INTO building_notices(id,scheme_id,title,body,audience,starts_at,created_by) VALUES('notice_history','sc_test','Historical council notice','Historical meeting record','council',?,?)",past,staff.id);
 await run("INSERT INTO notice_dispatch_jobs(notice_id,status,available_at) VALUES('notice_history','pending',?)",past);
 await check('historical council notices stay within their authorised audience',async()=>{
   assert.ok((await ok(councilApi+'/schemes/sc_test',council)).notices.some(n=>n.id==='notice_history'));
   assert.ok(!(await ok(residentApi+'/schemes/sc_test',resident)).notices.some(n=>n.id==='notice_history'));
   assert.equal((await api(councilApi+'/schemes/sc_test',outsider)).status,403);
 });
 await check('staff cannot publish or retry a retired building notice',async()=>{
   for (const path of [schemeApi+'/notices',schemeApi+'/notices/notice_history/retry']) {
     const denied=await api(path,staff,{title:'New notice',body:'A new announcement',audience:'residents'});
     assert.equal(denied.status,410); assert.equal(denied.data.code,'SECTOR_RETIRED');
   }
 });
 await check('due historical jobs and previously queued mail cannot fan out or send',async()=>{
   await Promise.all([dispatch(),dispatch()]);
   assert.equal((await first("SELECT status FROM notice_dispatch_jobs WHERE notice_id='notice_history'")).status,'cancelled');
   assert.equal((await first('SELECT COUNT(*) AS n FROM notice_deliveries')).n,0);
   for (const kind of ['building.notice_available','commercial.occupant_invited']) {
     const event='old_'+kind;
     await run("INSERT INTO outbox_events(id,kind,envelope,available_at,created_at) VALUES(?,?,?,?,?)",event,kind,await seal(key,'outbox:'+event,{to:resident.email}),past,past);
     if(kind==='building.notice_available') await run("INSERT INTO notice_deliveries(notice_id,user_id,notification_id,outbox_id,created_at) VALUES('notice_history',?,'ntf_old',?,?)",resident.id,event,past);
     await deliver(event);await deliver(event);
     assert.equal((await first('SELECT error_code FROM outbox_events WHERE id=?',event)).error_code,'SECTOR_RETIRED');
     assert.equal(mail.filter(m=>m.key===event).length,0);
   }
   assert.equal((await first("SELECT status FROM notice_deliveries WHERE notice_id='notice_history'")).status,'suppressed');
 });
 const hosted=new Miniflare({modules:true,scriptPath:'artifacts/communications-worker.mjs',compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'hosted-security'},r2Buckets:{DOCUMENTS:'docs',RESTRICTED_DOCUMENTS:'private'},durableObjects:{SCHEDULER:{className:'BookingScheduler',useSQLite:true}},bindings:{APP_ENV:'staging',APP_ORIGIN:'https://platform.example.test',MARKETING_ORIGIN:'https://marketing.example.test',DATA_ENCRYPTION_KEY:key,ENQUIRY_GATEWAY_SECRET:gateway,MARKETING_TURNSTILE_SECRET_KEY:'synthetic-turnstile'},outboundService:async request=>{
 assert.equal(new URL(request.url).origin,'https://challenges.cloudflare.com');const form=new URLSearchParams(await request.text()),token=form.get('response');return Response.json({success:token!=='expired',hostname:token==='wrong-host'?'attacker.example':'marketing.example.test',action:token==='wrong-action'?'login':'enquiry'});
 }});
 try{
 const hdb=await hosted.getD1Database('DB');for(const q of JSON.parse(execFileSync('python3',['scripts/schema-statements.py'],{encoding:'utf8'})))await hdb.prepare(q).run();
 const send=async token=>{const packet=envelope({...input,serviceId:undefined,requestKey:randomUUID()},{origin:'https://marketing.example.test',turnstile:token});return hosted.dispatchFetch('https://platform.example.test/api/public/enquiries',{method:'POST',...packet});};
 await check('hosted enquiry requires a security token rather than accepting local bypass',async()=>{assert.equal((await send(undefined)).status,503);});
 await check('hosted enquiry rejects expired or wrong-host Turnstile results',async()=>{assert.equal((await send('expired')).status,403);assert.equal((await send('wrong-host')).status,403);});
 await check('hosted enquiry rejects a valid token for the wrong action',async()=>{assert.equal((await send('wrong-action')).status,403);});
 await check('hosted enquiry accepts only the expected hostname and action',async()=>{const r=await send('valid');assert.equal(r.status,201);assert.match((await r.json()).reference,/^ENQ-/);});
 }finally{await hosted.dispose();}
 writeFileSync('artifacts/communications-results.json',JSON.stringify({passed:checks.length,checks,externalServices:'deterministic test doubles only; no deployment'},null,2));console.log(`PASS ${checks.length} communications checks`);
}finally{await mf.dispose();}
