import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID,createHash,createHmac} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {catalogueSql} from '../../scripts/catalogue-sql.mjs';
import {unseal,seal} from '../../packages/auth/crypto.ts';
mkdirSync('artifacts',{recursive:true});
await build({entryPoints:['tests/runtime/communications-entry.ts'],outfile:'artifacts/communications-worker.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers']});
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
 let scheduled;
 await check('future notice remains hidden and queues nothing before publication time',async()=>{
 scheduled=await ok(schemeApi+'/notices',staff,{title:'Scheduled water shutdown',body:'Synthetic building works notice.',audience:'residents',startsAt:future,lotId:'lot_test'});await dispatch();assert.equal((await first('SELECT COUNT(*) AS c FROM notice_deliveries WHERE notice_id=?',scheduled.id)).c,0);assert.equal((await ok(residentApi+'/schemes/sc_test',resident)).notices.length,0);assert.ok((await ok(schemeApi,staff)).notices.some(n=>n.id===scheduled.id));
 });
 await run('UPDATE building_notices SET starts_at=? WHERE id=?',past,scheduled.id);await run('UPDATE notice_dispatch_jobs SET available_at=? WHERE notice_id=?',past,scheduled.id);
 await check('due notice fans out only to the correct membership once under competing dispatches',async()=>{
 await Promise.all([dispatch(),dispatch()]);await dispatch();const rows=(await db.prepare('SELECT * FROM notice_deliveries WHERE notice_id=?').bind(scheduled.id).all()).results;assert.equal(rows.length,1);assert.equal(rows[0].user_id,resident.id);assert.equal((await first('SELECT COUNT(*) AS c FROM notifications WHERE id=?',rows[0].notification_id)).c,1);
 });
 await check('revoked membership suppresses pending email and removes portal alert visibility',async()=>{
 await run('UPDATE scheme_memberships SET ends_at=? WHERE user_id=?',new Date(Date.now()-3600000).toISOString(),resident.id);const delivery=await first('SELECT outbox_id FROM notice_deliveries WHERE notice_id=?',scheduled.id);await deliver(delivery.outbox_id);assert.equal((await first('SELECT status FROM notice_deliveries WHERE notice_id=?',scheduled.id)).status,'suppressed');assert.equal(mail.filter(m=>m.key===delivery.outbox_id).length,0);
 });
 await run('UPDATE scheme_memberships SET ends_at=NULL WHERE user_id=?',resident.id);
 await check('one person with resident and council roles must switch workspace for council notices',async()=>{
 await run('INSERT INTO scheme_memberships(id,scheme_id,lot_id,user_id,role,starts_at,approved_by) VALUES(?,?,?,?,?,?,?)','extra-council','sc_test','lot_test',resident.id,'council_member',past,staff.id);
 const n=await ok(schemeApi+'/notices',staff,{title:'Council-only review',body:'Only council members should see this content.',audience:'council'});
 assert.equal((await ok(residentApi+'/schemes/sc_test',resident)).notices.some(x=>x.id===n.id),false);assert.equal((await ok(councilApi+'/schemes/sc_test',resident)).notices.some(x=>x.id===n.id),true);
 });
 await check('withdrawal prevents queued delivery and rejects stale withdrawal',async()=>{
 const n=await ok(schemeApi+'/notices',staff,{title:'Withdraw before delivery',body:'This should never be emailed to a resident.',audience:'residents'});await dispatch();await ok(schemeApi+`/notices/${n.id}/withdraw`,staff,{version:1});assert.equal((await api(schemeApi+`/notices/${n.id}/withdraw`,staff,{version:1})).status,409);const event=await first('SELECT outbox_id FROM notice_deliveries WHERE notice_id=?',n.id);await deliver(event.outbox_id);assert.equal((await first('SELECT status FROM notice_deliveries WHERE notice_id=?',n.id)).status,'suppressed');assert.equal((await ok(residentApi+'/schemes/sc_test',resident)).notices.some(x=>x.id===n.id),false);
 });
 await check('bounded notice fan-out resumes to completion without duplicating multi-role users',async()=>{
 for(let i=0;i<31;i++){const id='usr_fanout_'+String(i).padStart(3,'0');await run('INSERT INTO users(id,email,created_at,verified_at) VALUES(?,?,?,?)',id,`fanout-${i}@example.test`,past,past);await run('INSERT INTO scheme_memberships(id,scheme_id,user_id,role,starts_at,approved_by) VALUES(?,?,?,?,?,?)','m_'+id,'sc_test',id,'resident',past,staff.id);}
 const n=await ok(schemeApi+'/notices',staff,{title:'Whole building update',body:'One publication across the whole building.',audience:'all_members'});await dispatch();await dispatch();await dispatch();assert.equal((await first('SELECT COUNT(*) AS c FROM notice_deliveries WHERE notice_id=?',n.id)).c,34);assert.equal((await first('SELECT status FROM notice_dispatch_jobs WHERE notice_id=?',n.id)).status,'completed');
 });
 await check('provider failure is retried with the same message key and no premature sent status',async()=>{
 const n=await ok(schemeApi+'/notices',staff,{title:'Retry delivery',body:'Provider retry uses a stable identifier.',audience:'owners'});await dispatch();const event=await first('SELECT outbox_id FROM notice_deliveries WHERE notice_id=?',n.id);failMail=true;assert.equal((await deliver(event.outbox_id)).status,503);assert.equal((await first('SELECT status FROM notice_deliveries WHERE notice_id=?',n.id)).status,'queued');failMail=false;await run('UPDATE outbox_events SET available_at=? WHERE id=?',past,event.outbox_id);await deliver(event.outbox_id);assert.equal((await first('SELECT status FROM notice_deliveries WHERE notice_id=?',n.id)).status,'sent');
 });
 await check('exhausted deliveries can be retried but suppression and sent receipts remain final',async()=>{
 const n=await ok(schemeApi+'/notices',staff,{title:'Manual delivery recovery',body:'Only failed deliveries may be requeued.',audience:'owners'});await dispatch();const event=await first('SELECT outbox_id FROM notice_deliveries WHERE notice_id=?',n.id);await run('UPDATE outbox_events SET attempts=5 WHERE id=?',event.outbox_id);failMail=true;await deliver(event.outbox_id);failMail=false;assert.equal((await first('SELECT status FROM notice_deliveries WHERE notice_id=?',n.id)).status,'failed');await ok(schemeApi+`/notices/${n.id}/retry`,staff,{});await deliver(event.outbox_id);assert.equal((await first('SELECT status FROM notice_deliveries WHERE notice_id=?',n.id)).status,'sent');assert.equal((await api(schemeApi+`/notices/${n.id}/retry`,staff,{})).status,409);assert.equal((await api(schemeApi+`/notices/${scheduled.id}/retry`,staff,{})).status,409);
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
