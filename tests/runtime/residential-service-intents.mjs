/** Isolated, synthetic Worker/D1 acceptance for residential service-intake and optional add-on safety. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { catalogueSql } from '../../scripts/catalogue-sql.mjs';

await build({entryPoints:['tests/runtime/entry.ts'],
 outfile:'artifacts/residential-service-intents-worker.mjs',
 bundle:true,format:'esm',platform:'browser',target:'es2022',
 external:['cloudflare:workers','node:*']});
const mf=new Miniflare({
 modules:true,scriptPath:'artifacts/residential-service-intents-worker.mjs',
 compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],
 d1Databases:{DB:'residential-service-intents-isolated'},
 r2Buckets:{DOCUMENTS:'residential-service-intents-docs',
  RESTRICTED_DOCUMENTS:'residential-service-intents-restricted'},
 durableObjects:{SCHEDULER:{className:'BookingScheduler',useSQLite:true}},
 bindings:{APP_ENV:'local',APP_ORIGIN:'http://localhost',
  DATA_ENCRYPTION_KEY:randomBytes(32).toString('base64'),
  EMAIL_PROVIDER:'local',OPERATIONS_EMAIL:'operator@example.invalid'},
});
const db=await mf.getD1Database('DB');
const sql=(query,...values)=>db.prepare(query).bind(...values);
async function api(path,options={}){
 const res=await mf.dispatchFetch('http://localhost'+path,{
  method:options.method??(options.body===undefined?'GET':'POST'),
  headers:{Origin:'http://localhost',...(options.cookie?{Cookie:options.cookie}:{}),
   ...(options.body===undefined?{}:{'Content-Type':'application/json'})},
  body:options.body===undefined?undefined:JSON.stringify(options.body),
 });
 const body=await res.text();
 return {status:res.status,data:body?JSON.parse(body):null,cookie:res.headers.get('set-cookie')};
}
async function login(email){
 const start=await api('/api/auth/start',{body:{email}});
 assert.equal(start.status,200,JSON.stringify(start.data));
 const token=new URL(start.data.localSignInUrl).searchParams.get('token');
 const completed=await api('/api/auth/complete',{body:{email,token}});
 assert.equal(completed.status,200,JSON.stringify(completed.data));
 return {cookie:completed.cookie.split(';')[0],
  id:(await sql('SELECT id FROM users WHERE email=?',email).first()).id};
}
function dateFromNow(days){
 const d=new Date(Date.now()+days*86400000);
 return d.toISOString().slice(0,10);
}
function availableWeekday(days){
 const d=new Date(Date.now()+days*86400000);
 while([0,6].includes(d.getUTCDay()))d.setUTCDate(d.getUTCDate()+1);
 return d.toISOString().slice(0,10);
}
function inputFor(propertyId,serviceId,startsAt,intake){
 return {propertyId,serviceId,startsAt,requestKey:randomBytes(18).toString('hex'),
  access:{method:'owner',instructions:'Private synthetic owner access',noticeConfirmed:true},
  intake};
}
try {
 for(const item of JSON.parse(execFileSync('python3',
  ['scripts/schema-statements.py'],{encoding:'utf8'})))await db.prepare(item).run();
 for(const item of catalogueSql().split('\n'))await db.prepare(item).run();
 await sql("INSERT INTO schedule_resources(id,name) VALUES('default','Service intents test')").run();
 for(const id of ['property-condition-report','routine-inspection','final-exit-inspection']){
   assert.equal((await sql('SELECT booking_mode FROM services WHERE id=?',id).first()).booking_mode,'request');
   // Isolated synthetic authorisation of direct bookings. Real publication is unchanged.
   await sql("UPDATE services SET booking_mode='instant',price_ex_gst_cents=0 WHERE id=?",id).run();
 }
 const owner=await login('service-owner@example.invalid');
 const other=await login('service-outsider@example.invalid');
 const staff=await login('service-operations@example.invalid');
 await sql("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'administrator',1)",staff.id).run();
 const onboard=await api('/api/onboarding',{cookie:owner.cookie,
  body:{displayName:'Service Intake Owner',clientName:'Synthetic Service Owner',landlordType:'residential'}});
 assert.equal(onboard.status,201,JSON.stringify(onboard.data));
 const clientId=onboard.data.clientId,base='/api/w/landlord/'+clientId;
 const prop=await api(base+'/properties',{cookie:owner.cookie,
  body:{address:'84 Synthetic Service Lane',suburb:'Perth',postcode:'6000',
   propertyType:'House',selfManaged:true}});
 assert.equal(prop.status,201,JSON.stringify(prop.data));
 const propertyId=prop.data.propertyId;
 function makeRequest(serviceIntake){
   return api(base+'/requests',{cookie:owner.cookie,body:{
     propertyId,category:'other',title:'Synthetic service request',
     details:'Please review the authorised synthetic property request.',
     priority:'routine',serviceIntake,
   }});
 }
 const tooSoon=await makeRequest({serviceCode:'open-home',
   preferredDate:dateFromNow(1),timeFrame:'afternoon',marketingRequested:true});
 assert.equal(tooSoon.status,422,JSON.stringify(tooSoon.data));
 assert.equal((await sql('SELECT count(*) AS n FROM requests').first()).n,0);
 const openHome=await makeRequest({serviceCode:'open-home',
   preferredDate:dateFromNow(5),timeFrame:'evening',
   marketingRequested:true,tenantApplicationRequested:true});
 assert.equal(openHome.status,201,JSON.stringify(openHome.data));
 const homeRow=await sql('SELECT status FROM requests WHERE id=?',openHome.data.id).first();
 assert.equal(homeRow.status,'submitted');
 const stored=await sql('SELECT encrypted_envelope FROM request_service_intakes WHERE request_id=?',
   openHome.data.id).first();
 assert.ok(stored.encrypted_envelope);
 assert.ok(!stored.encrypted_envelope.includes('tenantApplicationRequested'));
 const securePath='/requests/'+openHome.data.id+'/service-intake';
 assert.equal((await api(base+securePath,{cookie:other.cookie})).status,403);
 const ownerRead=await api(base+securePath,{cookie:owner.cookie});
 assert.equal(ownerRead.status,200,JSON.stringify(ownerRead.data));
 assert.equal(ownerRead.data.intake.marketingRequested,true);
 assert.equal(ownerRead.data.intake.tenantApplicationRequested,true);
 assert.equal(ownerRead.data.deliveryState,'review_required');
 const staffRead=await api('/api/w/staff/operations'+securePath,{cookie:staff.cookie});
 assert.equal(staffRead.status,200,JSON.stringify(staffRead.data));

 const privateBad=await makeRequest({serviceCode:'private-open-home',
  preferredDate:dateFromNow(5),preferredTime:'15:30'});
 assert.equal(privateBad.status,422);
 const privateViewing=await makeRequest({serviceCode:'private-open-home',
  preferredDate:dateFromNow(5),preferredTime:'15:30',attendeeName:'Syd Synthetic',
  attendeeEmail:'viewing@example.invalid'});
 assert.equal(privateViewing.status,201,JSON.stringify(privateViewing.data));
 const privateRow=await sql('SELECT encrypted_envelope FROM request_service_intakes WHERE request_id=?',
   privateViewing.data.id).first();
 assert.ok(!privateRow.encrypted_envelope.includes('viewing@example.invalid'));

 const video=await makeRequest({serviceCode:'video-walkthrough-property',
  recipients:[{name:'Approved Receiver',email:'receiver@example.invalid'}]});
 assert.equal(video.status,201,JSON.stringify(video.data));
 assert.equal((await api(base+'/requests/'+video.data.id+'/service-intake',
  {cookie:owner.cookie})).data.intake.recipients[0].name,'Approved Receiver');
 const badVideo=await makeRequest({serviceCode:'video-walkthrough-property',recipients:[]});
 assert.equal(badVideo.status,422);
 const insurance=await makeRequest({serviceCode:'insurance',incidentDate:dateFromNow(-4),
  claimReference:'SYNTHETIC-CLAIM-123'});
 assert.equal(insurance.status,201,JSON.stringify(insurance.data));
 const maintaining=await makeRequest({serviceCode:'maintenance'});
 assert.equal(maintaining.status,201,JSON.stringify(maintaining.data));
 assert.equal((await sql('SELECT count(*) AS n FROM payments').first()).n,0);

 async function slot(serviceId,days){
  const date=availableWeekday(days);
  const response=await api(base+'/availability?service='+serviceId+
   '&property='+propertyId+'&date='+date,{cookie:owner.cookie});
  assert.equal(response.status,200,JSON.stringify(response.data));
  assert.ok(response.data.slots.length,date);
  return response.data.slots[0].start;
 }
 const pcrIntake={contactPhone:'0400 111 222',reason:'New tenancy',occupancyStatus:'tenanted',
  furnishingStatus:'part_furnished',furnished:'yes',addOns:['inventory_with_pcr']};
 const pcr=await api(base+'/bookings',{cookie:owner.cookie,
  body:inputFor(propertyId,'property-condition-report',
   await slot('property-condition-report',14),pcrIntake)});
 assert.equal(pcr.status,201,JSON.stringify(pcr.data));
 assert.equal(pcr.data.addonReviewRequired,true);
 assert.equal(pcr.data.paymentRequired,false);
 assert.equal(pcr.data.totalCents,0);
 assert.equal((await sql('SELECT status FROM work_orders WHERE id=?',
  pcr.data.workOrderId).first()).status,'awaiting_approval');
 const addOn=await sql('SELECT addon_code,source_fee_candidate_ex_gst_cents,status FROM booking_service_addon_intents WHERE booking_id=?',
  pcr.data.id).first();
 assert.deepEqual([addOn.addon_code,addOn.source_fee_candidate_ex_gst_cents,addOn.status],
  ['inventory_with_pcr',15000,'requested']);
 assert.equal((await sql('SELECT COUNT(*) AS n FROM payments').first()).n,0);
 const encryptedIntake=await sql('SELECT envelope FROM booking_intake_secrets WHERE booking_id=?',pcr.data.id).first();
 assert.ok(encryptedIntake&&!encryptedIntake.envelope.includes('part_furnished'));
 const routineInput=inputFor(propertyId,'routine-inspection',
  await slot('routine-inspection',22),{contactPhone:'0400 111 222',
   reason:'Scheduled routine',occupancyStatus:'tenanted',addOns:['form19_service']});
 const routine=await api(base+'/bookings',{cookie:owner.cookie,body:routineInput});
 assert.equal(routine.status,201,JSON.stringify(routine.data));
 assert.equal((await api(base+'/bookings',{cookie:owner.cookie,body:routineInput})).status,200);
 assert.equal((await sql('SELECT COUNT(*) AS n FROM booking_service_addon_intents WHERE booking_id=?',
  routine.data.id).first()).n,1);
 const invalid=await api(base+'/bookings',{cookie:owner.cookie,
  body:inputFor(propertyId,'routine-inspection',await slot('routine-inspection',28),
   {...pcrIntake,addOns:['inventory_with_pcr']})});
 assert.equal(invalid.status,422);
 const vacant=await api(base+'/bookings',{cookie:owner.cookie,
  body:inputFor(propertyId,'property-condition-report',await slot('property-condition-report',32),
   {...pcrIntake,furnishingStatus:'unfurnished',furnished:'no'})});
 assert.equal(vacant.status,422);
 assert.equal((await sql('SELECT COUNT(*) AS n FROM payments').first()).n,0);
 assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
 console.log('PASS: grouped open homes, confidential client requests, no unauthorised billing, and linked inspection add-ons');
} finally {await mf.dispose();}
