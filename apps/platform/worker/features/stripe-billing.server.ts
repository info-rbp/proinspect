import { assert, statement, uid, now, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { clientAdmin, propertyAccess } from '../../../../packages/authorization/server';
import { guard, clearGuard } from '../../../../packages/operations/core';
import { legalStatements } from './legal-acceptance.server';
import { requireReleaseApproval } from './release-governance.server';
import { ensureBillingCustomer, invoiceObservation } from './billing-accounts.server';
import { commitProviderEvent, reconciliation, type ProviderEvent } from './payment-lifecycle.server';
import { SANDBOX_ACCOUNT, stripeApi, sandboxConfiguration, verifySandboxAccount, integrationIdentifier } from './stripe-client.server';
export const RESIDENTIAL='price_1UUOxKEv62nbUZoksUBo5igf';
export const COMMERCIAL='price_1UUOxMEv62nbUZokN7kLvP4B';
export function billingReady(env:Env,feature:'subscription'|'guest'='subscription'){
 sandboxConfiguration(env);
 assert((feature==='guest'?env.STRIPE_GUEST_CHECKOUT_ENABLED:env.STRIPE_BILLING_ENABLED)==='true',503,'BILLING_DISABLED','Sandbox payment collection is not enabled.');
 assert(env.STRIPE_TAX_READY==='true',503,'TAX_CONFIGURATION_REQUIRED','Verify the approved GST treatment before enabling collection.');
 assert(env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'),503,'WEBHOOK_REQUIRED','Configure the corresponding webhook signing secret.');
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
 if(old?.session_id){const current=await stripeApi(env,'/checkout/sessions/'+old.session_id);assert(current.id===old.session_id&&current.livemode===false&&current.mode==='subscription'&&current.customer===old.stripe_customer_id,409,'SUBSCRIPTION_SESSION_CHANGED','Stored Checkout needs reconciliation.');if(current.status==='open'&&Number(current.expires_at)>Date.now()/1000){assert(typeof current.url==='string'&&new URL(current.url).origin==='https://checkout.stripe.com',502,'CHECKOUT_URL_INVALID','Invalid checkout URL.');return {checkoutUrl:current.url,replayed:true};}if(current.status==='expired'){await statement(env.DB,"UPDATE stripe_billing_links SET status='expired',checkout_url=NULL,updated_at=? WHERE id=? AND status='pending'",now(),old.id).run();old=null;}else return {pending:true,message:'The subscription Checkout is awaiting signed event reconciliation.'};}
 const id=old?.id??uid('sbl');
 const legal=await legalStatements(env,{kind:'user',id:user.id},'subscription',id,{clientId:w.scopeId,propertyId,priceId:price,quantity:1,environment:'sandbox'},legalConsent);
 const customer=await ensureBillingCustomer(env,user,w.scopeId);
 if(!old)await env.DB.batch([...legal,statement(env.DB,"INSERT INTO stripe_billing_links(id,client_id,property_id,sector,price_id,stripe_customer_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',?,?)",id,w.scopeId,propertyId,property.sector,price,customer,now(),now())]);
 else assert(old.stripe_customer_id===customer,409,'BILLING_CUSTOMER_CHANGED','Billing customer mapping changed.');
 const form=checkoutForm({origin:env.APP_ORIGIN,linkId:id,clientId:w.scopeId,priceId:price});form.set('customer',customer);form.set('customer_update[address]','auto');form.set('billing_address_collection','required');
 const session=await stripeApi(env,'/checkout/sessions',form,'proinspect-subscription-'+id);
 assert(typeof session.id==='string'&&session.id.startsWith('cs_test_')&&session.livemode===false&&session.mode==='subscription'&&session.customer===customer&&typeof session.url==='string'&&new URL(session.url).origin==='https://checkout.stripe.com',502,'STRIPE_RESPONSE_INVALID','Invalid subscription Checkout response.');
 await env.DB.batch([statement(env.DB,"UPDATE stripe_billing_links SET session_id=?,checkout_url=?,updated_at=? WHERE id=? AND status IN('pending','incomplete','active') AND (session_id IS NULL OR session_id=?) AND stripe_customer_id=?",session.id,session.url,now(),id,session.id,customer),guard(env),clearGuard(env)]);
 return {checkoutUrl:session.url};
}
export async function billingEvent(env:Env,event:ProviderEvent,raw:string){
 assert(event.livemode===false&&env.APP_ENV!=='production',400,'SANDBOX_ONLY','This billing adapter records sandbox events only.');
 const o=event.data.object,t=event.type,time=now(),created=Number.isSafeInteger(event.created)?event.created!:0;
 const session=t.startsWith('checkout.session.'),sub=t.startsWith('customer.subscription.'),invoice=t.startsWith('invoice.');
 assert(session||sub||invoice,422,'EVENT_TYPE','Unsupported billing event.');
 if(session)assert(o.mode==='subscription'&&typeof o.id==='string'&&o.id.startsWith('cs_test_'),422,'SESSION_INVALID','Invalid subscription Checkout.');
 const subId=String(sub?o.id:session?(typeof o.subscription==='object'?o.subscription?.id:o.subscription)??'':o.subscription??o.parent?.subscription_details?.subscription??'');
 let link=subId?await statement(env.DB,'SELECT * FROM stripe_billing_links WHERE stripe_subscription_id=?',subId).first<Record<string,any>>():null;
 if(!link&&session)link=await statement(env.DB,'SELECT * FROM stripe_billing_links WHERE session_id=?',o.id).first<Record<string,any>>();
 // Early subscription events can precede Checkout completion. The local customer and Price must already be bound.
 if(!link&&sub&&typeof o.metadata?.billing_link_id==='string')link=await statement(env.DB,"SELECT * FROM stripe_billing_links WHERE id=? AND stripe_subscription_id IS NULL AND stripe_customer_id=? AND status='pending'",o.metadata.billing_link_id,o.customer).first<Record<string,any>>();
 if(link){
  assert(typeof o.customer==='string'&&link.stripe_customer_id===o.customer,409,'CUSTOMER_MISMATCH','The event customer differs from the approved billing customer.');
  assert(!link.stripe_subscription_id||link.stripe_subscription_id===subId,409,'SUBSCRIPTION_MISMATCH','The subscription identity changed.');
  if(session)assert(link.session_id===o.id&&o.client_reference_id===link.id,409,'SESSION_MISMATCH','Checkout does not match the stored session.');
  if(sub)assert(Array.isArray(o.items?.data)&&o.items.data.length===1&&o.items.data[0].price?.id===link.price_id&&(o.items.data[0].quantity??1)===1,409,'PRICE_MISMATCH','The subscription must contain exactly its approved per-property Price and quantity.');
  if(invoice)assert(o.currency==='aud',409,'CURRENCY_MISMATCH','Unexpected invoice currency.');
 }
 const observation=invoice?await invoiceObservation(env,event):null;
 const matched=!!link||!!observation;
 const status=sub?String(t.endsWith('.deleted')?'canceled':o.status??''):session?'checkout_observed':observation?.matched?'invoice_settled':invoice?'needs_reconciliation':'unmatched';
 if(link&&sub)assert(['active','trialing','incomplete','past_due','unpaid','canceled','paused','incomplete_expired'].includes(status),422,'STATUS_INVALID','Unknown subscription status.');
 const steps:D1PreparedStatement[]=[statement(env.DB,'INSERT INTO stripe_billing_events(event_id,link_id,event_type,stripe_object_id,status,currency,amount_cents,needs_reconciliation,created_at) VALUES(?,?,?,?,?,?,?,?,?)',event.id,link?.id??null,t,String(o.id??''),status,o.currency??null,Number.isSafeInteger(o.amount_paid)?o.amount_paid:null,+(!matched||(invoice&&!observation?.matched)),time)];
 if(!matched)steps.push(reconciliation(env,event.id,null,'unmatched_billing_event',String(o.id??'')));
 if(observation)steps.push(...observation.steps);
 if(link&&session){
  if(t==='checkout.session.expired')steps.push(statement(env.DB,"UPDATE stripe_billing_links SET status='expired',checkout_url=NULL,updated_at=? WHERE id=? AND status='pending' AND stripe_subscription_id IS NULL",time,link.id));
  else if(t==='checkout.session.async_payment_failed')steps.push(reconciliation(env,event.id,null,'subscription_async_payment_failed',o.id));
  else if(subId)steps.push(statement(env.DB,"UPDATE stripe_billing_links SET stripe_subscription_id=COALESCE(stripe_subscription_id,?),status=CASE WHEN status='pending' THEN 'incomplete' ELSE status END,checkout_url=NULL,updated_at=? WHERE id=? AND session_id=?",subId,time,link.id,o.id));
 }
 if(link&&sub&&created>link.last_subscription_event_created)steps.push(statement(env.DB,"UPDATE stripe_billing_links SET stripe_subscription_id=?,status=?,last_subscription_event_created=?,updated_at=? WHERE id=? AND last_subscription_event_created<? AND status NOT IN('canceled','expired')",subId,status==='incomplete_expired'?'expired':status,created,time,link.id,created));
 // The financial record never silently changes the business-approved all-inclusive entitlement.
 return {...await commitProviderEvent(env,event,raw,steps),matched,needsReconciliation:!matched||(invoice&&!observation?.matched)};
}
