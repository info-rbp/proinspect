import {assert,statement,now,type Env} from '../../../../packages/database/types';
import {commitProviderEvent,reconciliation,type ProviderEvent} from './payment-lifecycle.server';
import {paidInvoiceIdsForPaymentIntent,stripeApi} from './stripe-client.server';

function idOf(value:unknown):string{
 if(typeof value==='string')return value;
 if(value&&typeof value==='object'&&typeof (value as any).id==='string')return (value as any).id;
 return '';
}

/** Only verified Stripe invoice identities can suspend a residential subscription.
 * Existing one-off payment events continue to the legacy payment adapter.
 */
export async function subscriptionRiskEvent(env:Env,event:ProviderEvent,raw:string){
 assert(env.APP_ENV!=='production' && event.livemode===false,400,'SANDBOX_ONLY','This risk handler is sandbox-only.');
 const o=event.data.object,t=event.type,chargeId=t==='charge.refunded'?idOf(o.id):idOf(o.charge);
 if(!/^ch_[A-Za-z0-9_]+$/.test(chargeId))return null;
 const time=now();
 if(t==='charge.dispute.closed'){
  const holds=(await statement(env.DB,
   "SELECT * FROM stripe_subscription_risk_holds WHERE charge_id=? AND reason='dispute' AND status='open'",
   chargeId).all<Record<string,any>>()).results;
  if(!holds.length)return null;
  const steps:D1PreparedStatement[]=[];
  if(o.status==='won')steps.push(statement(env.DB,
   "UPDATE stripe_subscription_risk_holds SET status='released',released_at=? WHERE charge_id=? AND reason='dispute' AND status='open'",
   time,chargeId));
  else steps.push(reconciliation(env,event.id,null,'subscription_dispute_closed_requires_review',idOf(o.id)));
  return {...await commitProviderEvent(env,event,raw,steps),matched:true};
 }
 if(!['charge.refunded','charge.dispute.created','radar.early_fraud_warning.created'].includes(t))return null;
 if(t==='charge.refunded' && !(Number.isSafeInteger(o.amount_refunded)&&o.amount_refunded>0))return null;
 // Preserve the existing one-off adjustment adapter without fetching Stripe for an
 // already-mapped one-off PaymentIntent or Charge.
 const eventPaymentIntent=idOf(o.payment_intent);
 const oneOff=eventPaymentIntent
  ? await statement(env.DB,'SELECT id FROM payments WHERE stripe_payment_intent_id=?',eventPaymentIntent).first()
  : await statement(env.DB,'SELECT id FROM payments WHERE stripe_charge_id=?',chargeId).first();
 if(oneOff)return null;
 const directInvoice=idOf(o.invoice);
 let paymentIntent=idOf(o.payment_intent),customer=idOf(o.customer);
 if(!directInvoice && !paymentIntent){
  const charge=await stripeApi(env,'/charges/'+chargeId);
  paymentIntent=idOf(charge.payment_intent);
  customer=customer||idOf(charge.customer);
 }
 // For 2025-03-31.basil+ a Charge no longer owns an invoice field.
 const invoices=directInvoice?[directInvoice]:paymentIntent?
    await paidInvoiceIdsForPaymentIntent(env,paymentIntent):[];
 if(!invoices.length)return null;
 const matches=[];
 for(const invoiceId of invoices){
  if(!/^in_[A-Za-z0-9_]+$/.test(invoiceId))continue;
  const record=await statement(env.DB,
   "SELECT stripe_invoice_id,stripe_subscription_id,stripe_customer_id FROM stripe_subscription_invoice_observations WHERE stripe_invoice_id=?",
   invoiceId).first<{stripe_invoice_id:string;stripe_subscription_id:string;stripe_customer_id:string}>();
  if(record&&(!customer||customer===record.stripe_customer_id))matches.push(record);
 }
 if(!matches.length)return null;
 const reason=t==='charge.refunded'?'refunded':t==='charge.dispute.created'?'dispute':'fraud_warning';
 const steps:D1PreparedStatement[]=matches.map(row=>statement(env.DB,
  "INSERT INTO stripe_subscription_risk_holds(id,stripe_invoice_id,stripe_subscription_id,stripe_customer_id,charge_id,reason,status,created_at) VALUES(?,?,?,?,?,?,'open',?) ON CONFLICT(id) DO NOTHING",
  event.id+':'+row.stripe_invoice_id,row.stripe_invoice_id,row.stripe_subscription_id,row.stripe_customer_id,chargeId,reason,time));
 return {...await commitProviderEvent(env,event,raw,steps),matched:true,accessSuspended:true};
}
