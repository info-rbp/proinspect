import {settlePcrDiscount,suspendPcrBenefits} from './pcr-discounts.server';
import {assert,statement,now,uid,type Env} from '../../../../packages/database/types';
import type {Principal} from '../../../../packages/domain/index';
import {digest} from '../../../../packages/auth/crypto';
import {guard,clearGuard,activity} from '../../../../packages/operations/core';
import {stripeApi,verifySandboxAccount,integrationIdentifier} from './stripe-client.server';
export type ProviderEvent={id:string;type:string;created?:number;livemode:boolean;data:{object:Record<string,any>}};
export type PaymentRecord={id:string;client_id:string;property_id:string|null;work_order_id:string|null;version:number;total_cents:number;currency:string;description:string;status:string;checkout_session_id:string|null;checkout_url:string|null;stripe_payment_intent_id:string|null;stripe_charge_id:string|null;refunded_cents:number};
function objectId(x:any):string|null{return typeof x==='string'?x:typeof x?.id==='string'?x.id:null;}
export function reconciliation(env:Env,eventId:string,paymentId:string|null,code:string,object:string|null){
 return statement(env.DB,"INSERT INTO payment_reconciliation_items(id,payment_id,provider_event_id,code,object_id,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(provider_event_id,code) DO NOTHING",uid('rec'),paymentId,eventId,code,object,now());
}
/** The receipt and its entire effect commit together. Concurrent identical deliveries are harmless. */
export async function commitProviderEvent(env:Env,event:ProviderEvent,raw:string,steps:D1PreparedStatement[]){
 assert(/^evt_[A-Za-z0-9_]+$/.test(event.id),422,'EVENT_INVALID','Invalid Stripe event identity.');
 const hash=await digest(raw);
 const existing=await statement(env.DB,"SELECT payload_hash FROM webhook_receipts WHERE provider='stripe' AND event_id=?",event.id).first<{payload_hash:string}>();
 if(existing){assert(existing.payload_hash===hash,409,'EVENT_REPLAY_MISMATCH','A different payload reused the event identity.');return {received:true,replayed:true};}
 try {await env.DB.batch([statement(env.DB,"INSERT INTO webhook_receipts(provider,event_id,payload_hash,created_at) VALUES('stripe',?,?,?)",event.id,hash,now()),...steps]);}
 catch(error){const won=await statement(env.DB,"SELECT payload_hash FROM webhook_receipts WHERE provider='stripe' AND event_id=?",event.id).first<{payload_hash:string}>();if(won?.payload_hash===hash)return {received:true,replayed:true};throw error;}
 return {received:true,replayed:false};
}
export async function openPaymentCheckout(env:Env,p:PaymentRecord,redirects:{success:string;cancel:string},actor?:Principal,legal:D1PreparedStatement[]=[]){
 if(p.work_order_id){const w=await statement(env.DB,'SELECT status FROM work_orders WHERE id=?',p.work_order_id).first<{status:string}>();assert(w&&w.status!=='cancelled',409,'WORK_CANCELLED','Cancelled work requires financial review, not a new Checkout.');}
 await verifySandboxAccount(env);
 assert(['payment_required','failed'].includes(p.status)&&Number.isSafeInteger(p.total_cents)&&p.total_cents>0&&p.currency==='AUD',409,'PAYMENT_UNAVAILABLE','This payment is not awaiting collection.');
 for(const value of Object.values(redirects))assert(new URL(value).origin===new URL(env.APP_ORIGIN).origin,422,'RETURN_URL','Use the current application origin.');
 let attempt=await statement(env.DB,"SELECT * FROM payment_checkout_attempts WHERE payment_id=? AND status IN('creating','open','processing')",p.id).first<Record<string,any>>();
 if(attempt){
  assert(attempt.amount_cents===p.total_cents&&attempt.currency===p.currency,409,'PAYMENT_SNAPSHOT_CHANGED','The payment amount changed; reconciliation is required.');
  assert(attempt.success_url===redirects.success&&attempt.cancel_url===redirects.cancel,409,'CHECKOUT_RETRY_CHANGED','Continue the existing payment from its original workspace.');
  if(attempt.status==='processing')return {pending:true,message:'Payment processing is still in progress. No second charge has been opened.'};
  if(attempt.session_id){
   const current=await stripeApi(env,'/checkout/sessions/'+attempt.session_id);
   assert(current.id===attempt.session_id&&current.livemode===false&&current.mode==='payment'&&current.amount_total===p.total_cents&&current.currency==='aud',409,'SESSION_MISMATCH','Existing Checkout requires reconciliation.');
   if(current.status==='open'&&Number(current.expires_at)>Date.now()/1000){assert(typeof current.url==='string'&&new URL(current.url).origin==='https://checkout.stripe.com',502,'CHECKOUT_URL_INVALID','Invalid hosted checkout URL.');return {url:current.url,checkoutUrl:current.url,replayed:true};}
   if(current.status!=='expired')return {pending:true,message:'Payment is awaiting verified event reconciliation. No second charge has been opened.'};
   await statement(env.DB,"UPDATE payment_checkout_attempts SET status='expired',updated_at=? WHERE id=? AND status='open'",now(),attempt.id).run();attempt=null;
  }
 }
 if(!attempt){
  const id=uid('pat'),time=now();
  await env.DB.batch([...legal,statement(env.DB,"INSERT INTO payment_checkout_attempts(id,payment_id,payment_version,amount_cents,currency,client_id,description,success_url,cancel_url,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'creating',?,?)",id,p.id,p.version,p.total_cents,p.currency,p.client_id,p.description,redirects.success,redirects.cancel,time,time)]);
  attempt={id,payment_id:p.id,amount_cents:p.total_cents,client_id:p.client_id,description:p.description,success_url:redirects.success,cancel_url:redirects.cancel};
 }
 // The stored total already includes its approved GST. No automatic_tax or manual tax rate is added.
 const body=new URLSearchParams({mode:'payment',success_url:attempt.success_url,cancel_url:attempt.cancel_url,'line_items[0][price_data][currency]':'aud','line_items[0][price_data][unit_amount]':String(attempt.amount_cents),'line_items[0][price_data][product_data][name]':attempt.description,'line_items[0][quantity]':'1',client_reference_id:attempt.id,'metadata[payment_id]':p.id,'metadata[client_id]':p.client_id,'metadata[payment_attempt_id]':attempt.id,'payment_intent_data[metadata][payment_id]':p.id,integration_identifier:integrationIdentifier(attempt.id)});
 const session=await stripeApi(env,'/checkout/sessions',body,'proinspect-payment-attempt-'+attempt.id);
 assert(typeof session.id==='string'&&session.id.startsWith('cs_test_')&&session.livemode===false&&session.mode==='payment'&&typeof session.url==='string'&&new URL(session.url).origin==='https://checkout.stripe.com'&&session.amount_total===p.total_cents&&session.currency==='aud',502,'STRIPE_RESPONSE_INVALID','Invalid sandbox Checkout response.');
 const early=await statement(env.DB,'SELECT session_id,status FROM payment_checkout_attempts WHERE id=?',attempt.id).first<{session_id:string|null;status:string}>();
 if(early?.session_id===session.id&&early.status!=='creating')return {pending:early.status!=='paid',paid:early.status==='paid',message:'The signed payment result was received before the Checkout response. Refresh the payment record.',attemptId:attempt.id};
 const time=now();
 await env.DB.batch([statement(env.DB,"UPDATE payment_checkout_attempts SET session_id=?,checkout_url=?,status='open',expires_at=?,updated_at=? WHERE id=? AND status='creating' AND (session_id IS NULL OR session_id=?)",session.id,session.url,Number.isSafeInteger(session.expires_at)?session.expires_at:null,time,attempt.id,session.id),guard(env),statement(env.DB,"UPDATE payments SET provider='stripe',checkout_session_id=?,checkout_url=?,version=version+1,updated_at=? WHERE id=? AND status IN('payment_required','failed') AND total_cents=?",session.id,session.url,time,p.id,p.total_cents),guard(env),...(actor?[activity(env,actor,'payment.checkout_opened','payment',p.id,p.property_id)]:[]),clearGuard(env)]);
 return {url:session.url,checkoutUrl:session.url,attemptId:attempt.id};
}
export async function paymentSessionEvent(env:Env,event:ProviderEvent,raw:string){
 const s=event.data.object;
 assert(s.mode==='payment'&&typeof s.id==='string'&&/^cs_/.test(s.id),422,'SESSION_INVALID','Expected a payment Checkout Session.');
 let attempt=await statement(env.DB,'SELECT * FROM payment_checkout_attempts WHERE session_id=?',s.id).first<Record<string,any>>();
 // Stripe may deliver a signed event before the Checkout API response is persisted.
 // Resolve only an already-created immutable server attempt, never a customer-supplied price.
 if(!attempt&&typeof s.client_reference_id==='string'&&s.metadata?.payment_attempt_id===s.client_reference_id){
  attempt=await statement(env.DB,"SELECT * FROM payment_checkout_attempts WHERE id=? AND session_id IS NULL AND status='creating'",s.client_reference_id).first<Record<string,any>>();
 }

 const p=await statement(env.DB,attempt?'SELECT * FROM payments WHERE id=?':'SELECT * FROM payments WHERE checkout_session_id=?',attempt?.payment_id??s.id).first<PaymentRecord>();
 if(!p)return {...await commitProviderEvent(env,event,raw,[reconciliation(env,event.id,null,'unmatched_checkout',s.id)]),matched:false};
 assert(s.currency==='aud'&&Number.isSafeInteger(s.amount_total)&&s.amount_total===(attempt?.amount_cents??p.total_cents),409,'PAYMENT_AMOUNT_MISMATCH','Checkout currency or amount differs from the approved payment.');
 if(s.metadata?.payment_id)assert(s.metadata.payment_id===p.id&&s.metadata.client_id===p.client_id,409,'PAYMENT_OWNER_MISMATCH','Checkout ownership differs.');
 if(attempt)assert(s.client_reference_id===attempt.id&&s.metadata?.payment_attempt_id===attempt.id,409,'ATTEMPT_MISMATCH','Checkout attempt differs from its immutable snapshot.');
 const paid=['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&s.payment_status==='paid';
 const pi=objectId(s.payment_intent);
 assert(!pi||/^pi_[A-Za-z0-9_]+$/.test(pi),422,'PAYMENT_INTENT_INVALID','Invalid payment intent identity.');
 const effects:D1PreparedStatement[]=[];let next=p.status;
 if(attempt&&!attempt.session_id){
  assert(s.metadata?.payment_id===p.id&&s.metadata?.client_id===p.client_id,409,'EARLY_EVENT_OWNER_MISMATCH','Early event is not bound to this approved attempt.');
  effects.push(statement(env.DB,"UPDATE payment_checkout_attempts SET session_id=?,updated_at=? WHERE id=? AND session_id IS NULL AND status='creating'",s.id,now(),attempt.id),guard(env),clearGuard(env));
 }

 if(paid){
  if(p.status==='paid'||p.status==='refunded'){
   if(p.checkout_session_id!==s.id||(pi&&p.stripe_payment_intent_id&&pi!==p.stripe_payment_intent_id))effects.push(reconciliation(env,event.id,p.id,'duplicate_successful_checkout',s.id));
  }else if(['payment_required','failed'].includes(p.status)&&p.total_cents===s.amount_total){
   next='paid';effects.push(statement(env.DB,"UPDATE payments SET status='paid',provider='stripe',external_reference=?,stripe_payment_intent_id=COALESCE(stripe_payment_intent_id,?),checkout_session_id=?,checkout_url=NULL,version=version+1,updated_at=? WHERE id=? AND status IN('payment_required','failed') AND total_cents=?",pi??s.id,pi,s.id,now(),p.id,s.amount_total),guard(env),statement(env.DB,"INSERT INTO payment_events(id,payment_id,from_status,to_status,reference,created_at) VALUES(?,?,?,'paid',?,?)",uid('pe'),p.id,p.status,event.id,now()),clearGuard(env));
   effects.push(settlePcrDiscount(env,p.id));
   const heldDiscount=await statement(env.DB,"SELECT status FROM pcr_discount_reservations WHERE payment_id=? AND status IN('released','exception')",p.id).first();
   if(heldDiscount)effects.push(reconciliation(env,event.id,p.id,'discount_settlement_requires_review',s.id));
   if(!pi)effects.push(reconciliation(env,event.id,p.id,'payment_intent_link_missing',s.id));
   // Award the four future routine-inspection benefits only on a verified, paid PCR Checkout event.
   if(p.work_order_id){
     const offer=await statement(env.DB,"SELECT g.id,g.purchaser_email_hash FROM guest_service_orders g JOIN bookings b ON b.id=g.booking_id JOIN work_orders w ON w.booking_id=b.id WHERE w.id=? AND g.offer_code='pcr100' AND g.status='confirmed'",p.work_order_id).first<{id:string;purchaser_email_hash:string|null}>();
     if(offer?.purchaser_email_hash)effects.push(statement(env.DB,"INSERT INTO pcr_routine_discount_entitlements(id,guest_order_id,purchaser_email_hash,discount_basis_points,uses_remaining,created_at,updated_at,source_payment_id) VALUES(?,?,?,2000,4,?,?,?) ON CONFLICT(guest_order_id) DO NOTHING",uid('pcrd'),offer.id,offer.purchaser_email_hash,now(),now(),p.id));
   }
  }else effects.push(reconciliation(env,event.id,p.id,'unexpected_payment_success',s.id));
 }
 if(attempt){const status=paid?'paid':event.type==='checkout.session.expired'?'expired':event.type==='checkout.session.async_payment_failed'?'failed':'processing';effects.push(statement(env.DB,"UPDATE payment_checkout_attempts SET status=CASE WHEN status='paid' THEN 'paid' ELSE ? END,payment_intent_id=COALESCE(payment_intent_id,?),updated_at=? WHERE id=?",status,pi,now(),attempt.id));}
 if(!paid&&event.type==='checkout.session.async_payment_failed'&&p.checkout_session_id===s.id&&p.status==='payment_required')effects.push(statement(env.DB,"UPDATE payments SET status='failed',checkout_url=NULL,version=version+1,updated_at=? WHERE id=? AND status='payment_required' AND checkout_session_id=?",now(),p.id,s.id));
 const r=await commitProviderEvent(env,event,raw,effects);return {...r,matched:true,status:next};
}
export async function adjustmentEvent(env:Env,event:ProviderEvent,raw:string){
 const o=event.data.object,pi=objectId(o.payment_intent),charge=event.type==='charge.refunded'?objectId(o.id):objectId(o.charge);
 const p=(pi?await statement(env.DB,'SELECT * FROM payments WHERE stripe_payment_intent_id=?',pi).first<PaymentRecord>():null)??(charge?await statement(env.DB,'SELECT * FROM payments WHERE stripe_charge_id=?',charge).first<PaymentRecord>():null);
 if(!p)return {...await commitProviderEvent(env,event,raw,[reconciliation(env,event.id,null,'unmatched_financial_adjustment',objectId(o.id))]),matched:false};
 assert(o.currency==='aud'&&(!pi||pi===p.stripe_payment_intent_id),409,'ADJUSTMENT_IDENTITY','Adjustment identity or currency differs.');
 const created=Number.isSafeInteger(event.created)?event.created!:0,time=now(),effects:D1PreparedStatement[]=[];
 if(charge){assert(!p.stripe_charge_id||p.stripe_charge_id===charge,409,'CHARGE_MISMATCH','Charge identity differs.');effects.push(statement(env.DB,'UPDATE payments SET stripe_charge_id=COALESCE(stripe_charge_id,?) WHERE id=?',charge,p.id));}
 if(event.type==='charge.refunded'){
  assert(Number.isSafeInteger(o.amount_refunded)&&o.amount_refunded>=0&&o.amount_refunded<=p.total_cents&&o.amount===p.total_cents,409,'REFUND_AMOUNT_MISMATCH','Refund totals differ from the original charge.');
  effects.push(statement(env.DB,"UPDATE payments SET refunded_cents=MAX(refunded_cents,?),status=CASE WHEN MAX(refunded_cents,?)=total_cents THEN 'refunded' ELSE status END,updated_at=?,version=version+1 WHERE id=? AND status IN('paid','refunded')",o.amount_refunded,o.amount_refunded,time,p.id));
 }else if(event.type.startsWith('refund.')){
  assert(/^re_/.test(String(o.id))&&Number.isSafeInteger(o.amount)&&o.amount>0&&o.amount<=p.total_cents&&['pending','requires_action','succeeded','failed','canceled'].includes(o.status),422,'REFUND_INVALID','Invalid refund observation.');
  const old=await statement(env.DB,'SELECT * FROM payment_refund_observations WHERE refund_id=?',o.id).first<Record<string,any>>();
  if(old)assert(old.payment_id===p.id&&old.amount_cents===o.amount,409,'REFUND_IDENTITY_MISMATCH','Refund changed ownership or amount.');
  effects.push(statement(env.DB,"INSERT INTO payment_refund_observations(refund_id,payment_id,payment_intent_id,amount_cents,currency,status,provider_created,last_event_created,updated_at) VALUES(?,?,?,?,'AUD',?,?,?,?) ON CONFLICT(refund_id) DO UPDATE SET status=CASE WHEN payment_refund_observations.status='succeeded' THEN 'succeeded' ELSE excluded.status END,last_event_created=excluded.last_event_created,updated_at=excluded.updated_at WHERE excluded.last_event_created>=payment_refund_observations.last_event_created",o.id,p.id,p.stripe_payment_intent_id,o.amount,o.status,Number.isSafeInteger(o.created)?o.created:0,created,time));
  effects.push(statement(env.DB,"UPDATE payments SET refunded_cents=MAX(refunded_cents,COALESCE((SELECT sum(amount_cents) FROM payment_refund_observations WHERE payment_id=? AND status='succeeded'),0)),status=CASE WHEN MAX(refunded_cents,COALESCE((SELECT sum(amount_cents) FROM payment_refund_observations WHERE payment_id=? AND status='succeeded'),0))=total_cents THEN 'refunded' ELSE status END,updated_at=?,version=version+1 WHERE id=? AND status IN('paid','refunded')",p.id,p.id,time,p.id));
  if(['failed','requires_action'].includes(o.status))effects.push(reconciliation(env,event.id,p.id,'refund_'+o.status,o.id));
 }else{
  assert(/^dp_/.test(String(o.id))&&Number.isSafeInteger(o.amount)&&o.amount>0&&o.amount<=p.total_cents&&typeof o.status==='string',422,'DISPUTE_INVALID','Invalid dispute observation.');
  effects.push(statement(env.DB,"INSERT INTO payment_disputes(dispute_id,payment_id,payment_intent_id,amount_cents,currency,status,last_event_created,updated_at) VALUES(?,?,?,?,'AUD',?,?,?) ON CONFLICT(dispute_id) DO UPDATE SET status=excluded.status,last_event_created=excluded.last_event_created,updated_at=excluded.updated_at WHERE excluded.last_event_created>=payment_disputes.last_event_created",o.id,p.id,p.stripe_payment_intent_id,o.amount,o.status,created,time),reconciliation(env,event.id,p.id,'dispute_'+o.status,o.id));
 }
 if((event.type==='charge.refunded'&&o.amount_refunded>0)||(event.type.startsWith('refund.')&&o.status==='succeeded')||event.type.startsWith('charge.dispute.')){
  effects.push(...suspendPcrBenefits(env,p.id));
  const benefit=await statement(env.DB,'SELECT id FROM pcr_discount_reservations WHERE payment_id=?',p.id).first();
  if(benefit)effects.push(reconciliation(env,event.id,p.id,'discount_financial_adjustment_review',objectId(o.id)));
 }
 return {...await commitProviderEvent(env,event,raw,effects),matched:true};
}
