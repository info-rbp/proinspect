import { assert, statement, uid, now, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { clientAdmin, propertyAccess } from '../../../../packages/authorization/server';
import { guard, clearGuard } from '../../../../packages/operations/core';
import { legalStatements } from './legal-acceptance.server';
import { requireReleaseApproval } from './release-governance.server';
import { ensureBillingCustomer, invoiceObservation } from './billing-accounts.server';
import { commitProviderEvent, reconciliation, type ProviderEvent } from './payment-lifecycle.server';
import { SANDBOX_ACCOUNT, stripeApi, sandboxConfiguration, verifySandboxAccount, integrationIdentifier } from './stripe-client.server';
export const RESIDENTIAL='price_1UVkM6Ev62nbUZoknG7CA5P5';
export const RESIDENTIAL_WEEKLY_EX_GST_CENTS=5000;
export const COMMERCIAL='price_1UUOxMEv62nbUZokN7kLvP4B';
export function billingReady(env:Env,feature:'subscription'|'guest'='subscription'){
 sandboxConfiguration(env);
 assert((feature==='guest'?env.STRIPE_GUEST_CHECKOUT_ENABLED:env.STRIPE_BILLING_ENABLED)==='true',503,'BILLING_DISABLED','Sandbox payment collection is not enabled.');
 assert(env.STRIPE_TAX_READY==='true',503,'TAX_CONFIGURATION_REQUIRED','Verify the approved GST treatment before enabling collection.');
 assert(env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'),503,'WEBHOOK_REQUIRED','Configure the corresponding webhook signing secret.');
}
/** Fail closed if the business flag differs from Stripe Tax's verified state.
 * An Australian registration and reviewed product tax code are required;
 * creating a Price alone cannot enable GST collection.
 */
export async function verifySubscriptionTax(env:Env,priceId:string){
 const [settings,registrations,price]=await Promise.all([
   stripeApi(env,'/tax/settings'),
   stripeApi(env,'/tax/registrations'),
   stripeApi(env,'/prices/'+priceId)
 ]);
 assert(settings.status==='active' && settings.head_office,503,'STRIPE_TAX_PENDING',
   'Complete the Stripe Tax head-office setup before subscription Checkout.');
 assert(Array.isArray(registrations.data) && registrations.data.some((r:any)=>
   r.country==='AU' && r.status==='active'),503,'AU_GST_REGISTRATION_REQUIRED',
   'Verify an active Australian GST registration in Stripe Tax.');
 const expected=priceId===RESIDENTIAL?5000:25000;
 assert(price.livemode===false && price.active===true && price.currency==='aud' &&
   price.unit_amount===expected && price.tax_behavior==='exclusive' &&
   price.recurring?.interval===(priceId===RESIDENTIAL?'week':'month') &&
   price.recurring?.interval_count===1,503,'STRIPE_PRICE_MISMATCH',
   'The approved Stripe Price does not match the authorised subscription schedule.');
 const product=await stripeApi(env,'/products/'+price.product);
 assert(product.tax_code || settings.defaults?.tax_code,503,'STRIPE_PRODUCT_TAX_CODE_REQUIRED',
   'Review and configure the correct Stripe Tax product classification before collecting GST.');
 return true;
}
export function priceForSector(sector:string){if(sector==='residential')return RESIDENTIAL;if(sector==='commercial')return COMMERCIAL;throw Error('Unsupported subscription sector');}
export function checkoutForm(params:{origin:string;linkId:string;clientId:string;priceId:string}){
 return new URLSearchParams({mode:'subscription',success_url:params.origin+'/workspaces?billing=returned',cancel_url:params.origin+'/workspaces?billing=cancelled','line_items[0][price]':params.priceId,'line_items[0][quantity]':'1','metadata[billing_link_id]':params.linkId,'subscription_data[metadata][billing_link_id]':params.linkId,'subscription_data[metadata][client_id]':params.clientId,client_reference_id:params.linkId,'automatic_tax[enabled]':'true',integration_identifier:integrationIdentifier(params.linkId)});
}
export async function createSubscriptionCheckout(env:Env,user:Principal,w:Workspace,propertyId:string,legalConsent?:unknown){
 billingReady(env);await requireReleaseApproval(env,'stripe_billing');
 assert(['landlord','commercial'].includes(w.kind),403,'SUBSCRIPTION_OWNER_REQUIRED','Only an authorised landlord may subscribe.');
 await clientAdmin(env,user,w);const property=await propertyAccess(env,user,w,propertyId);
 assert(property.sector===(w.kind==='landlord'?'residential':'commercial'),422,'PROPERTY_SECTOR','Choose a property in this account.');
 const price=priceForSector(property.sector);
 let old=await statement(env.DB,"SELECT * FROM stripe_billing_links WHERE client_id=? AND property_id=? AND status NOT IN('canceled','expired') LIMIT 1",w.scopeId,propertyId).first<Record<string,any>>();
 assert(!old||old.status==='pending',409,'SUBSCRIPTION_EXISTS','A subscription for this property already exists.');
 await verifySandboxAccount(env);
 await verifySubscriptionTax(env,price);
 assert(!old || old.price_id===price,409,'SUBSCRIPTION_PRICE_CHANGED','The pending subscription uses an old price. Contact support to expire that Checkout and restart at the approved rate.');
 if(old?.session_id){const current=await stripeApi(env,'/checkout/sessions/'+old.session_id);assert(current.id===old.session_id&&current.livemode===false&&current.mode==='subscription'&&current.customer===old.stripe_customer_id,409,'SUBSCRIPTION_SESSION_CHANGED','Stored Checkout needs reconciliation.');if(current.status==='open'&&Number(current.expires_at)>Date.now()/1000){assert(typeof current.url==='string'&&new URL(current.url).origin==='https://checkout.stripe.com',502,'CHECKOUT_URL_INVALID','Invalid checkout URL.');return {checkoutUrl:current.url,replayed:true};}if(current.status==='expired'){await statement(env.DB,"UPDATE stripe_billing_links SET status='expired',checkout_url=NULL,updated_at=? WHERE id=? AND status='pending'",now(),old.id).run();old=null;}else return {pending:true,message:'The subscription Checkout is awaiting signed event reconciliation.'};}
 const id=old?.id??uid('sbl');
 const legal=await legalStatements(env,{kind:'user',id:user.id},'subscription',id,{clientId:w.scopeId,propertyId,priceId:price,quantity:1,environment:'sandbox'},legalConsent);
 const customer=await ensureBillingCustomer(env,user,w.scopeId);
 const enrollment=property.sector==='residential'
   ? [statement(env.DB,"INSERT INTO residential_paid_property_enrollments(client_id,property_id,enrolled_at) VALUES(?,?,?) ON CONFLICT(client_id,property_id) DO NOTHING",w.scopeId,propertyId,now())]
   : [];
 if(!old)await env.DB.batch([...legal,...enrollment,statement(env.DB,"INSERT INTO stripe_billing_links(id,client_id,property_id,sector,price_id,stripe_customer_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',?,?)",id,w.scopeId,propertyId,property.sector,price,customer,now(),now())]);
 else {assert(old.stripe_customer_id===customer,409,'BILLING_CUSTOMER_CHANGED','Billing customer mapping changed.');
   if(enrollment.length)await env.DB.batch(enrollment);
 }
 const form=checkoutForm({origin:env.APP_ORIGIN,linkId:id,clientId:w.scopeId,priceId:price});form.set('customer',customer);form.set('customer_update[address]','auto');form.set('billing_address_collection','required');
 const session=await stripeApi(env,'/checkout/sessions',form,'proinspect-subscription-'+id);
 assert(typeof session.id==='string'&&session.id.startsWith('cs_test_')&&session.livemode===false&&session.mode==='subscription'&&session.customer===customer&&typeof session.url==='string'&&new URL(session.url).origin==='https://checkout.stripe.com',502,'STRIPE_RESPONSE_INVALID','Invalid subscription Checkout response.');
 await env.DB.batch([statement(env.DB,"UPDATE stripe_billing_links SET session_id=?,checkout_url=?,updated_at=? WHERE id=? AND status IN('pending','incomplete','active') AND (session_id IS NULL OR session_id=?) AND stripe_customer_id=?",session.id,session.url,now(),id,session.id,customer),guard(env),clearGuard(env)]);
 return {checkoutUrl:session.url};
}
/** Turn a signed invoice into an immutable-identity observation.
 * Invoice events may precede the subscription event that binds the Checkout.
 */
function invoiceSnapshot(o:Record<string,any>,eventType:string,created:number){
 const subValue=o.subscription??o.parent?.subscription_details?.subscription;
 const subscriptionId=typeof subValue==='string'?subValue:subValue?.id;
 const customerId=typeof o.customer==='string'?o.customer:o.customer?.id;
 if(!/^sub_[A-Za-z0-9_]+$/.test(String(subscriptionId??'')) ||
    !/^cus_[A-Za-z0-9_]+$/.test(String(customerId??'')) ||
    typeof o.id!=='string'||!/^in_[A-Za-z0-9_]+$/.test(o.id) || o.currency!=='aud')return null;
 const lines:Array<Record<string,any>>=Array.isArray(o.lines?.data)?o.lines.data:[];
 const item=lines.find(l=>Boolean(l.price?.id || l.pricing?.price_details?.price));
 const priceId=String(item?.price?.id??item?.pricing?.price_details?.price??'unverified');
 const end=Number(item?.period?.end??o.period_end??0);
 const through=Number.isSafeInteger(end)&&end>0 ? new Date(end*1000).toISOString():'1970-01-01T00:00:00.000Z';
 const paid=eventType==='invoice.paid' && o.status==='paid' && o.paid===true &&
   Number.isSafeInteger(o.amount_paid) && o.amount_paid>0 &&
   item && (item.quantity??1)===1 && priceId!=='unverified' && end>0;
 const status=eventType==='invoice.payment_failed'||eventType==='invoice.voided'||
   eventType==='invoice.marked_uncollectible'?'failed':paid?'paid':eventType==='invoice.finalized'?'pending':'review';
 return {id:o.id,subscriptionId,customerId,priceId,status,amount:paid?o.amount_paid:0,
   invoiceCreated:Number.isSafeInteger(o.created)?o.created:created,paidThrough:through};
}
export async function billingEvent(env:Env,event:ProviderEvent,raw:string){
 assert(event.livemode===false&&env.APP_ENV!=='production',400,'SANDBOX_ONLY','This billing adapter records sandbox events only.');
 const o=event.data.object,t=event.type,time=now(),created=Number.isSafeInteger(event.created)?event.created!:0;
 const session=t.startsWith('checkout.session.'),sub=t.startsWith('customer.subscription.'),invoice=t.startsWith('invoice.');
 assert(session||sub||invoice,422,'EVENT_TYPE','Unsupported billing event.');
 if(session)assert(o.mode==='subscription'&&typeof o.id==='string'&&o.id.startsWith('cs_test_'),422,'SESSION_INVALID','Invalid subscription Checkout.');
 const invoiceData=invoice?invoiceSnapshot(o,t,created):null;
 const subValue=sub?o.id:session?(typeof o.subscription==='object'?o.subscription?.id:o.subscription):invoiceData?.subscriptionId;
 const subId=typeof subValue==='string'?subValue:'';
 let link=subId?await statement(env.DB,'SELECT * FROM stripe_billing_links WHERE stripe_subscription_id=?',subId).first<Record<string,any>>():null;
 if(!link&&session)link=await statement(env.DB,'SELECT * FROM stripe_billing_links WHERE session_id=?',o.id).first<Record<string,any>>();
 // Stripe may send subscription.created before checkout.session.completed.
 if(!link&&sub&&typeof o.metadata?.billing_link_id==='string')
  link=await statement(env.DB,"SELECT * FROM stripe_billing_links WHERE id=? AND stripe_subscription_id IS NULL AND stripe_customer_id=? AND status='pending'",o.metadata.billing_link_id,o.customer).first<Record<string,any>>();
 if(link){
  assert(typeof o.customer==='string'&&link.stripe_customer_id===o.customer,409,'CUSTOMER_MISMATCH','The event customer differs from the approved billing customer.');
  assert(!link.stripe_subscription_id||link.stripe_subscription_id===subId,409,'SUBSCRIPTION_MISMATCH','The subscription identity changed.');
  if(session)assert(link.session_id===o.id&&o.client_reference_id===link.id,409,'SESSION_MISMATCH','Checkout does not match the stored session.');
  if(sub)assert(Array.isArray(o.items?.data)&&o.items.data.length===1&&o.items.data[0].price?.id===link.price_id&&(o.items.data[0].quantity??1)===1,409,'PRICE_MISMATCH','The subscription must contain exactly its approved per-property Price and quantity.');
  if(invoice)assert(o.currency==='aud',409,'CURRENCY_MISMATCH','Unexpected invoice currency.');
 }
 const observation=invoice?await invoiceObservation(env,event):null;
 const validSubscriptionInvoice=!!(invoiceData && link && invoiceData.priceId===link.price_id && invoiceData.customerId===link.stripe_customer_id && invoiceData.subscriptionId===subId);
 const matched=!!link||!!observation;
 const status=sub?String(t.endsWith('.deleted')?'canceled':o.status??''):session?'checkout_observed':validSubscriptionInvoice?'subscription_invoice_observed':observation?.matched?'invoice_settled':invoice?'needs_reconciliation':'unmatched';
 if(link&&sub)assert(['active','trialing','incomplete','past_due','unpaid','canceled','paused','incomplete_expired'].includes(status),422,'STATUS_INVALID','Unknown subscription status.');
 const needsReconciliation=!matched||(invoice&&!observation?.matched&&!validSubscriptionInvoice)||
    (invoice&&!!link&&(!invoiceData||invoiceData.priceId!==link.price_id));
 const steps:D1PreparedStatement[]=[statement(env.DB,'INSERT INTO stripe_billing_events(event_id,link_id,event_type,stripe_object_id,status,currency,amount_cents,needs_reconciliation,created_at) VALUES(?,?,?,?,?,?,?,?,?)',event.id,link?.id??null,t,String(o.id??''),status,o.currency??null,Number.isSafeInteger(o.amount_paid)?o.amount_paid:null,+needsReconciliation,time)];
 if(needsReconciliation)steps.push(reconciliation(env,event.id,null,'unmatched_or_unverified_billing_event',String(o.id??'')));
 if(observation)steps.push(...observation.steps);
 if(invoiceData){
   // Event-time compare-and-swap prevents older failed/paid events replacing newer observations.
   steps.push(statement(env.DB,`INSERT INTO stripe_subscription_invoice_observations(
    stripe_invoice_id,stripe_subscription_id,stripe_customer_id,price_id,status,currency,amount_paid_cents,invoice_created,paid_through,last_event_created,last_event_id,updated_at
   ) VALUES(?,?,?,?,?,'aud',?,?,?,?,?,?)
   ON CONFLICT(stripe_invoice_id) DO UPDATE SET
     price_id=CASE WHEN stripe_subscription_invoice_observations.price_id='unverified' THEN excluded.price_id ELSE stripe_subscription_invoice_observations.price_id END,
     status=excluded.status,amount_paid_cents=excluded.amount_paid_cents,paid_through=excluded.paid_through,
     last_event_created=excluded.last_event_created,last_event_id=excluded.last_event_id,updated_at=excluded.updated_at
   WHERE excluded.last_event_created>stripe_subscription_invoice_observations.last_event_created
     AND (excluded.price_id=stripe_subscription_invoice_observations.price_id
      OR excluded.price_id='unverified'
      OR stripe_subscription_invoice_observations.price_id='unverified')`,
    invoiceData.id,invoiceData.subscriptionId,invoiceData.customerId,invoiceData.priceId,
    invoiceData.status,invoiceData.amount,invoiceData.invoiceCreated,invoiceData.paidThrough,
    created,event.id,time));
 }
 if(link&&session){
  if(t==='checkout.session.expired')steps.push(statement(env.DB,"UPDATE stripe_billing_links SET status='expired',checkout_url=NULL,updated_at=? WHERE id=? AND status='pending' AND stripe_subscription_id IS NULL",time,link.id));
  else if(t==='checkout.session.async_payment_failed')steps.push(reconciliation(env,event.id,null,'subscription_async_payment_failed',o.id));
  else if(subId)steps.push(statement(env.DB,"UPDATE stripe_billing_links SET stripe_subscription_id=COALESCE(stripe_subscription_id,?),status=CASE WHEN status='pending' THEN 'incomplete' ELSE status END,checkout_url=NULL,updated_at=? WHERE id=? AND session_id=?",subId,time,link.id,o.id));
 }
 if(link&&sub&&created>link.last_subscription_event_created)
  steps.push(statement(env.DB,"UPDATE stripe_billing_links SET stripe_subscription_id=?,status=?,last_subscription_event_created=?,updated_at=? WHERE id=? AND last_subscription_event_created<? AND status NOT IN('canceled','expired')",subId,status==='incomplete_expired'?'expired':status,created,time,link.id,created));
 // Read-only entitlement gate combines active subscription state with latest signed paid invoice.
 // Historical business-approved subscriptions remain unchanged.
 return {...await commitProviderEvent(env,event,raw,steps),matched,needsReconciliation};
}
