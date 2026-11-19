import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {catalogueSql} from '../../scripts/catalogue-sql.mjs';

export const secret='whsec_registered_synthetic_fixture';
export async function registeredBookingJourney({db,dispatchFetch,concurrency=1}) {
  const sql=(query,...values)=>db.prepare(query).bind(...values);
async function api(path,options={}){
  const headers={Origin:'http://localhost',...(options.cookie?{Cookie:options.cookie}:{}),
    ...(options.body===undefined?{}:{'Content-Type':'application/json'}),...options.headers};
  const response=await dispatchFetch('http://localhost'+path,{method:options.method??(options.body===undefined?'GET':'POST'),
    headers,body:options.body===undefined?undefined:JSON.stringify(options.body)});
  return {status:response.status,data:(response.headers.get('Content-Type')??'').includes('json')?
    await response.json():await response.text(),cookie:response.headers.get('set-cookie')};
}
async function login(email){
  const start=await api('/api/auth/start',{body:{email}});
  assert.equal(start.status,200,JSON.stringify(start.data));
  const link=new URL(start.data.localSignInUrl);
  const result=await api('/api/auth/complete',{body:{email,token:link.searchParams.get('token')}});
  assert.equal(result.status,200,JSON.stringify(result.data));
  return {email,cookie:result.cookie.split(';')[0],id:(await sql('SELECT id FROM users WHERE email=?',email).first()).id};
}
async function event(session,id='evt_registered_payment_1',secretValue=secret){
  const item={id,type:'checkout.session.async_payment_succeeded',
    created:Math.floor(Date.now()/1000),livemode:false,data:{object:session}};
  const raw=JSON.stringify(item),stamp=Math.floor(Date.now()/1000);
  const mac=createHmac('sha256',secretValue).update(stamp+'.'+raw).digest('hex');
  const r=await dispatchFetch('http://localhost/api/webhooks/stripe',{method:'POST',
    headers:{'Content-Type':'application/json','stripe-signature':`t=${stamp},v1=${mac}`},body:raw});
  return {status:r.status,data:await r.json()};
}
  for(const statement of catalogueSql().split('\n'))await db.prepare(statement).run();
  await sql("INSERT INTO schedule_resources(id,name) VALUES('default','Synthetic test')").run();
  await sql("UPDATE services SET price_ex_gst_cents=12000,booking_mode='instant',active=1 WHERE id='routine-inspection'").run();
  const owner=await login('registered-owner@example.invalid');
  const outsider=await login('unrelated-owner@example.invalid');
  const staff=await login('registered-admin@example.invalid');
  await sql("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'administrator',1)",staff.id).run();
  const signup=await api('/api/onboarding',{cookie:owner.cookie,
    body:{displayName:'Registered Owner',clientName:'Synthetic Owner',landlordType:'residential'}});
  assert.equal(signup.status,201,JSON.stringify(signup.data));
  const account=signup.data.clientId,base='/api/w/landlord/'+account;
  const property=await api(base+'/properties',{cookie:owner.cookie,
    body:{address:'55 Registered Booking Street',suburb:'Perth',postcode:'6000',propertyType:'House',selfManaged:true}});
  assert.equal(property.status,201,JSON.stringify(property.data));
  const id=property.data.propertyId;
  const date=new Date(Date.now()+20*86400000);
  while([0,6].includes(date.getUTCDay()))date.setUTCDate(date.getUTCDate()+1);
  const availability=await api(base+'/availability?service=routine-inspection&date='+date.toISOString().slice(0,10)+'&property='+id,{cookie:owner.cookie});
  assert.equal(availability.status,200,JSON.stringify(availability.data));
  assert.ok(availability.data.slots.length);
  const requestKey=randomBytes(18).toString('hex');
  const input={propertyId:id,serviceId:'routine-inspection',
    startsAt:availability.data.slots[0].start,requestKey,
    access:{method:'owner',instructions:'Synthetic authorised property access',noticeConfirmed:true}};
  const attempts=await Promise.all(Array.from({length:concurrency},()=>api(base+'/bookings',{cookie:owner.cookie,body:input})));
  assert.equal(attempts.filter(r=>r.status===201).length,1,JSON.stringify(attempts));
  const made=attempts.find(r=>r.status===201);
  assert.ok(attempts.every(r=>[200,201].includes(r.status)&&r.data.id===made.data.id));
  assert.equal(made.status,201,JSON.stringify(made.data));
  assert.equal(made.data.paymentRequired,true);
  assert.equal(made.data.totalCents,13200);
  const pay=await sql('SELECT id,status,total_cents,version FROM payments WHERE id=?',made.data.paymentId).first();
  assert.equal(pay.status,'payment_required');
  assert.equal(pay.total_cents,13200);
  assert.equal((await sql('SELECT status FROM work_orders WHERE id=?',made.data.workOrderId).first()).status,
    'awaiting_approval');
  const retry=await api(base+'/bookings',{cookie:owner.cookie,body:input});
  assert.equal(retry.status,200,JSON.stringify(retry.data));
  assert.equal(retry.data.id,made.data.id);
  assert.equal(retry.data.paymentId,made.data.paymentId);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM registered_booking_payment_links WHERE booking_id=?',
    made.data.id).first()).n,1);
  assert.equal((await api(base+'/payments/'+pay.id+'/checkout',{cookie:outsider.cookie,body:{}})).status,403);
  assert.equal((await api('/api/w/staff/operations/work-orders/'+made.data.workOrderId,{cookie:staff.cookie,
    body:{version:1,status:'approved'}})).status,409);
  const attemptId='pat_synthetic_registered';
  await sql(`INSERT INTO payment_checkout_attempts
     (id,payment_id,payment_version,amount_cents,currency,client_id,description,success_url,cancel_url,status,created_at,updated_at)
     VALUES(?,?,?,?,? ,?,?,?,?,'creating',?,?)`,
    attemptId,pay.id,pay.version,pay.total_cents,'AUD',account,'Synthetic routine inspection',
    'http://localhost/workspaces','http://localhost/workspaces',new Date().toISOString(),new Date().toISOString()).run();
  const session={id:'cs_test_registered_1',mode:'payment',currency:'aud',amount_total:13200,
    payment_status:'paid',payment_intent:'pi_registered_synthetic_1',status:'complete',
    client_reference_id:attemptId,
    metadata:{payment_id:pay.id,client_id:account,payment_attempt_id:attemptId}};
  const wrong=await event({...session,amount_total:1},'evt_registered_invalid_amount');
  assert.equal(wrong.status,409,JSON.stringify(wrong.data));
  assert.equal((await sql('SELECT status FROM payments WHERE id=?',pay.id).first()).status,'payment_required');
  assert.equal((await event(session,'evt_registered_invalid_signature','whsec_wrong_secret')).status,400);
  const settlements=await Promise.all(Array.from({length:concurrency},()=>event(session)));
  const settled=settlements[0];
  assert.ok(settlements.every(r=>r.status===200),JSON.stringify(settlements));
  assert.equal(settled.status,200,JSON.stringify(settled.data));
  assert.equal((await sql('SELECT status,provider FROM payments WHERE id=?',pay.id).first()).status,'paid');
  assert.equal((await sql('SELECT status FROM work_orders WHERE id=?',made.data.workOrderId).first()).status,'scheduled');
  assert.equal((await event(session)).status,200,'signed replay must not duplicate settlement');
  assert.equal((await sql('SELECT COUNT(*) AS n FROM payment_events WHERE payment_id=? AND to_status=\'paid\'',pay.id).first()).n,1);
}
