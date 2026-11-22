/** Isolated connected Cash Client booking verification, without real provider activity. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {catalogueSql} from '../../scripts/catalogue-sql.mjs';

await build({entryPoints:['tests/runtime/entry.ts'],
 outfile:'artifacts/cash-booking-worker.mjs',
 bundle:true,format:'esm',platform:'browser',target:'es2022',
 external:['cloudflare:workers','node:*']});
const mf=new Miniflare({
 modules:true,scriptPath:'artifacts/cash-booking-worker.mjs',
 compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],
 d1Databases:{DB:'cash-booking-isolated'},
 r2Buckets:{DOCUMENTS:'cash-test-docs',RESTRICTED_DOCUMENTS:'cash-test-restricted'},
 durableObjects:{SCHEDULER:{className:'BookingScheduler',useSQLite:true}},
 bindings:{APP_ENV:'local',APP_ORIGIN:'http://localhost',
  DATA_ENCRYPTION_KEY:randomBytes(32).toString('base64'),
  EMAIL_PROVIDER:'local',OPERATIONS_EMAIL:'operator@example.invalid'}
});
const db=await mf.getD1Database('DB');
const sql=(query,...values)=>db.prepare(query).bind(...values);
async function api(path,options={}){
 const headers={Origin:'http://localhost',
  ...(options.cookie?{Cookie:options.cookie}:{}),
  ...(options.body===undefined?{}:{'Content-Type':'application/json'})};
 const response=await mf.dispatchFetch('http://localhost'+path,{
  method:options.method??(options.body===undefined?'GET':'POST'),
  headers,
  body:options.body===undefined?undefined:JSON.stringify(options.body)
 });
 const body=await response.text();
 return {status:response.status,
  data:body?JSON.parse(body):null,
  cookie:response.headers.get('set-cookie')};
}
async function login(email){
 const start=await api('/api/auth/start',{body:{email}});
 assert.equal(start.status,200,JSON.stringify(start.data));
 const token=new URL(start.data.localSignInUrl).searchParams.get('token');
 const complete=await api('/api/auth/complete',{body:{email,token}});
 assert.equal(complete.status,200,JSON.stringify(complete.data));
 return {cookie:complete.cookie.split(';')[0],
  id:(await sql('SELECT id FROM users WHERE email=?',email).first()).id};
}
function weekdayDate(offset){
 const date=new Date(Date.now()+offset*86400000);
 while([0,6].includes(date.getUTCDay()))date.setUTCDate(date.getUTCDate()+1);
 return date.toISOString().slice(0,10);
}
try{
 for(const statement of JSON.parse(execFileSync('python3',
  ['scripts/schema-statements.py'],{encoding:'utf8'})))
  await db.prepare(statement).run();
 for(const statement of catalogueSql().split('\n'))
  await db.prepare(statement).run();
 await sql("INSERT INTO schedule_resources(id,name) VALUES('default','Isolated Cash Client test')").run();
 // Rates are explicitly configured in this test DB: migration 0064 alone
 // must leave them in request/quote mode.
 assert.equal((await sql("SELECT booking_mode FROM services WHERE id='routine-inspection'").first()).booking_mode,'request');
 await sql("UPDATE services SET price_ex_gst_cents=12000,booking_mode='instant',active=1 WHERE id='routine-inspection'").run();

 const owner=await login('cash-owner@example.invalid');
 const unrelated=await login('cash-unrelated@example.invalid');
 const requester=await login('cash-ops-requester@example.invalid');
 const reviewer=await login('cash-ops-reviewer@example.invalid');
 for(const member of [requester,reviewer])
  await sql("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'administrator',1)",member.id).run();

 const onboard=await api('/api/onboarding',{cookie:owner.cookie,
  body:{displayName:'Cash Client Owner',clientName:'Cash Client Test',landlordType:'residential'}});
 assert.equal(onboard.status,201,JSON.stringify(onboard.data));
 const clientId=onboard.data.clientId;
 const base='/api/w/landlord/'+clientId;
 const staff='/api/w/staff/operations';
 const property=await api(base+'/properties',{cookie:owner.cookie,
  body:{address:'78 Synthetic Cash Street',suburb:'Perth',postcode:'6000',
   propertyType:'House',selfManaged:true}});
 assert.equal(property.status,201,JSON.stringify(property.data));
 const propertyId=property.data.propertyId;

 const defaultTerms=await api(base+'/cash-terms',{cookie:owner.cookie});
 assert.equal(defaultTerms.status,200);
 assert.equal(defaultTerms.data.termCode,'upon_booking');
 assert.equal((await api(base+'/cash-terms',{cookie:unrelated.cookie})).status,403);

 const proposed=await api(staff+'/billing/cash-terms/request',{cookie:requester.cookie,
  body:{clientId,termCode:'net_7',creditLimitCents:15000,
   reason:'Independent synthetic credit review'}});
 assert.equal(proposed.status,200,JSON.stringify(proposed.data));
 assert.equal(proposed.data.status,'pending');
 const requestId=proposed.data.id;
 assert.equal((await api(staff+'/billing/cash-terms/approve',{cookie:requester.cookie,
  body:{requestId,reviewReference:'Self-approval must fail'}})).status,403);
 assert.equal((await api(base+'/cash-terms',{cookie:owner.cookie})).data.termCode,'upon_booking');
 const approved=await api(staff+'/billing/cash-terms/approve',{cookie:reviewer.cookie,
  body:{requestId,reviewReference:'Separate credit review accepted'}});
 assert.equal(approved.status,200,JSON.stringify(approved.data));
 assert.equal((await api(base+'/cash-terms',{cookie:owner.cookie})).data.termCode,'net_7');
 assert.equal((await api(staff+'/billing/cash-terms/approve',{cookie:requester.cookie,
  body:{requestId,reviewReference:'Repeat review prohibited'}})).status,409);

 const dates=[weekdayDate(20),weekdayDate(32)];
 const firstAvailability=await api(base+'/availability?service=routine-inspection&date='+
  dates[0]+'&property='+propertyId,{cookie:owner.cookie});
 assert.equal(firstAvailability.status,200,JSON.stringify(firstAvailability.data));
 assert.ok(firstAvailability.data.slots.length);
 const intake={contactPhone:'0400 111 222',reason:'Scheduled routine inspection',
  occupancyStatus:'tenanted',areasOfConcern:'Restricted private test detail'};
 const input={propertyId,serviceId:'routine-inspection',
  startsAt:firstAvailability.data.slots[0].start,
  requestKey:randomBytes(18).toString('hex'),intake,
  access:{method:'owner',instructions:'Private synthetic key safe',noticeConfirmed:true}};
 const booked=await api(base+'/bookings',{cookie:owner.cookie,body:input});
 assert.equal(booked.status,201,JSON.stringify(booked.data));
 assert.equal(booked.data.paymentRequired,false);
 assert.equal(booked.data.invoiceAfterService,true);
 assert.equal(booked.data.paymentTerms,'net_7');
 assert.equal(booked.data.totalCents,13200);
 const payment=await sql('SELECT status,total_cents FROM payments WHERE id=?',booked.data.paymentId).first();
 assert.deepEqual([payment.status,payment.total_cents],['pending',13200]);
 const encrypted=await sql('SELECT envelope FROM booking_intake_secrets WHERE booking_id=?',booked.data.id).first();
 assert.ok(encrypted && !encrypted.envelope.includes('Restricted private test detail'));

 const retry=await api(base+'/bookings',{cookie:owner.cookie,body:input});
 assert.equal(retry.status,200,JSON.stringify(retry.data));
 assert.equal(retry.data.id,booked.data.id);
 assert.equal(retry.data.paymentId,booked.data.paymentId);
 assert.equal(retry.data.invoiceAfterService,true);
 assert.equal(retry.data.paymentTerms,'net_7');
 assert.equal(retry.data.totalCents,13200);
 assert.equal((await api(base+'/bookings',{cookie:owner.cookie,
  body:{...input,intake:{...intake,reason:'Altered after first submission'}}})).status,409);
 assert.equal((await sql('SELECT count(*) AS n FROM bookings WHERE client_id=?',clientId).first()).n,1);

 const privatePath=staff+'/work-orders/'+booked.data.workOrderId+'/booking-intake';
 const visible=await api(privatePath,{cookie:reviewer.cookie});
 assert.equal(visible.status,200,JSON.stringify(visible.data));
 assert.equal(visible.data.intake.areasOfConcern,intake.areasOfConcern);
 assert.equal((await api(base+'/work-orders/'+booked.data.workOrderId+'/booking-intake',
  {cookie:owner.cookie})).status,403);

 const nextAvailability=await api(base+'/availability?service=routine-inspection&date='+
  dates[1]+'&property='+propertyId,{cookie:owner.cookie});
 assert.equal(nextAvailability.status,200,JSON.stringify(nextAvailability.data));
 assert.ok(nextAvailability.data.slots.length);
 const exceeded=await api(base+'/bookings',{cookie:owner.cookie,body:{
  ...input,requestKey:randomBytes(18).toString('hex'),
  startsAt:nextAvailability.data.slots[0].start}});
 assert.equal(exceeded.status,409,JSON.stringify(exceeded.data));
 assert.equal(exceeded.data.code,'CREDIT_LIMIT_REACHED');
 assert.equal((await sql('SELECT count(*) AS n FROM cash_booking_charges WHERE client_id=?',clientId).first()).n,1);
 assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
 console.log('PASS: Cash Client independent approval, protected intake, same-key replay, bounded credit and property access');
}finally{
 await mf.dispose();
}
