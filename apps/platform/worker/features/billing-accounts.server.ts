import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { clientAdmin, clientMembership, operationsWrite } from '../../../../packages/authorization/server';
import { activity, guard, clearGuard, reference, recordId } from '../../../../packages/operations/core';
import { digest } from '../../../../packages/auth/crypto';
import { z } from 'zod';
import {projectInvoiceObservation,type InvoiceSnapshot} from '../../../../packages/finance/invoice-observation';
import {reconciliation} from './payment-lifecycle.server';
import type { ProviderEvent } from './payment-lifecycle.server';
import {sandboxConfiguration,stripeApi,verifySandboxAccount,SANDBOX_ACCOUNT} from './stripe-client.server';
import {requireReleaseApproval} from './release-governance.server';
import {isBillingPortalConfigurationId,isReviewedSandboxPortal} from '../../../../packages/finance/stripe-sandbox-policy';
const sandbox=SANDBOX_ACCOUNT;
export const sandboxFinance=sandboxConfiguration;
export const stripeRequest=stripeApi;
export async function ensureBillingCustomer(env:Env,user:Principal,clientId:string){
 await verifySandboxAccount(env);
 const c=await statement(env.DB,"SELECT id,name FROM clients WHERE id=? AND status='active'",clientId).first<{id:string;name:string}>();assert(c,404,'BILLING_ACCOUNT_UNAVAILABLE','The billing account is unavailable.');
 const old=await statement(env.DB,'SELECT * FROM billing_accounts WHERE client_id=?',clientId).first<{stripe_customer_id:string|null;stripe_account_id:string;mode:string}>();
 if(old){assert(old.mode==='test'&&old.stripe_account_id===sandbox,409,'BILLING_MODE_MISMATCH','This client is mapped to a different Stripe environment.');if(old.stripe_customer_id)return old.stripe_customer_id;}
 await statement(env.DB,"INSERT INTO billing_accounts(client_id,stripe_account_id,mode,created_by,created_at,updated_at) VALUES(?,?,'test',?,?,?) ON CONFLICT(client_id) DO NOTHING",clientId,sandbox,user.id,now(),now()).run();
 const customer=await stripeRequest(env,'/customers',new URLSearchParams({name:c.name,'metadata[proinspect_client_id]':clientId}),`proinspect-customer-${clientId}-sandbox`);
 assert(typeof customer.id==='string'&&/^cus_/.test(customer.id)&&customer.livemode===false,502,'CUSTOMER_RESPONSE_INVALID','Invalid sandbox customer response.');
 await statement(env.DB,'UPDATE billing_accounts SET stripe_customer_id=?,updated_at=? WHERE client_id=? AND stripe_account_id=? AND (stripe_customer_id IS NULL OR stripe_customer_id=?)',customer.id,now(),clientId,sandbox,customer.id).run();
 const saved=await statement(env.DB,'SELECT stripe_customer_id FROM billing_accounts WHERE client_id=?',clientId).first<{stripe_customer_id:string}>();assert(saved?.stripe_customer_id===customer.id,409,'CUSTOMER_LINK_CHANGED','Billing mapping changed during creation.');return customer.id as string;
}
export async function billingDashboard(env:Env,user:Principal,w:Workspace){
 assert(['landlord','commercial','property-manager','strata-manager','staff'].includes(w.kind),403,'BILLING_FORBIDDEN','This workspace does not have billing authority.');
 const staff=w.kind==='staff';if(staff)operationsWrite(user);else await clientAdmin(env,user,w);
 const values=staff?[]:[w.scopeId];const clause=staff?'1=1':'client_id=?';
 const [accounts,subscriptions,invoices,exceptions,refunds,contacts,dispatches]=await Promise.all([
 statement(env.DB,`SELECT client_id,mode,created_at FROM billing_accounts WHERE ${clause}`, ...values).all(),
 statement(env.DB,`SELECT id,client_id,property_id,sector,status,price_id FROM stripe_billing_links WHERE ${clause} ORDER BY updated_at DESC LIMIT 100`,...values).all(),
 statement(env.DB,`SELECT * FROM billing_invoices WHERE ${clause} ORDER BY updated_at DESC LIMIT 100`,...values).all(),
 staff?statement(env.DB,"SELECT id,payment_id,code,created_at FROM payment_reconciliation_items WHERE status='open' ORDER BY created_at LIMIT 100").all():Promise.resolve({results:[]}),
 staff?statement(env.DB,"SELECT r.*,p.description,p.total_cents,p.refunded_cents FROM refund_requests r JOIN payments p ON p.id=r.payment_id ORDER BY requested_at DESC LIMIT 100").all():Promise.resolve({results:[]}),
 staff?statement(env.DB,"SELECT id,client_id,email,status,approved_by FROM billing_invoice_contacts ORDER BY created_at DESC LIMIT 100").all():Promise.resolve({results:[]}),
 staff?statement(env.DB,"SELECT statement_id,stripe_invoice_id,status,recipient_email FROM billing_invoice_dispatches ORDER BY created_at DESC LIMIT 100").all():Promise.resolve({results:[]})]);
 return {accounts:accounts.results,subscriptions:subscriptions.results,invoices:invoices.results,exceptions:exceptions.results,refunds:refunds.results,contacts:contacts.results,dispatches:dispatches.results,portalEnabled:env.STRIPE_CUSTOMER_PORTAL_ENABLED==='true',invoicesEnabled:env.STRIPE_INVOICING_ENABLED==='true',refundsEnabled:env.STRIPE_REFUNDS_ENABLED==='true'};
}
export async function billingPortal(env:Env,user:Principal,w:Workspace){
 await clientAdmin(env,user,w);await requireReleaseApproval(env,'billing_portal');assert(env.STRIPE_CUSTOMER_PORTAL_ENABLED==='true',503,'BILLING_PORTAL_DISABLED','Customer billing self-service is not activated.');
 const configuration=env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID;
 assert(isBillingPortalConfigurationId(configuration),503,'BILLING_PORTAL_CONFIGURATION_REQUIRED','Select the reviewed sandbox billing portal configuration.');
 const a=await statement(env.DB,"SELECT stripe_customer_id FROM billing_accounts WHERE client_id=? AND mode='test' AND stripe_account_id=?",w.scopeId,sandbox).first<{stripe_customer_id:string}>();assert(a?.stripe_customer_id,409,'BILLING_CUSTOMER_REQUIRED','A verified billing customer must be linked first.');
 await verifySandboxAccount(env);
 const policy=await stripeRequest(env,'/billing_portal/configurations/'+configuration);
 assert(isReviewedSandboxPortal(policy,configuration,env.APP_ORIGIN),503,'BILLING_PORTAL_POLICY_UNACCEPTED','The sandbox portal configuration differs from the reviewed invoice and payment-method-only policy.');
 const s=await stripeRequest(env,'/billing_portal/sessions',new URLSearchParams({customer:a.stripe_customer_id,configuration,return_url:env.APP_ORIGIN+w.href+'/billing'}));
 assert(typeof s.url==='string'&&new URL(s.url).origin==='https://billing.stripe.com',502,'BILLING_PORTAL_INVALID','Invalid billing portal response.');
 await activity(env,user,'billing.portal_opened','client',w.scopeId).run();return {url:s.url};
}
export async function exportStatement(env:Env,user:Principal,input:unknown){
 operationsWrite(user);await requireReleaseApproval(env,'invoices');await verifySandboxAccount(env);assert(env.STRIPE_INVOICING_ENABLED==='true'&&env.STRIPE_TAX_READY==='true',503,'INVOICING_DISABLED','Invoice export requires verified sandbox tax and activation.');
 const d=z.object({statementId:recordId,dueDays:z.number().int().min(1).max(120),termsReference:reference}).parse(input);
 const s=await statement(env.DB,"SELECT s.*,a.client_id,a.gst_basis_points FROM agency_monthly_statements s JOIN agency_commercial_agreements a ON a.id=s.agreement_id WHERE s.id=? AND s.status='approved'",d.statementId).first<Record<string,any>>();assert(s,409,'APPROVED_STATEMENT_REQUIRED','Independently approve the statement before preparing an invoice.');
 const lines=(await statement(env.DB,'SELECT id,description,amount_cents,property_id FROM agency_statement_lines WHERE statement_id=? ORDER BY id',s.id).all<{id:string;description:string;amount_cents:number;property_id:string|null}>()).results;
 assert(lines.length>0&&lines.reduce((t,l)=>t+l.amount_cents,0)===s.subtotal_cents,409,'STATEMENT_MISMATCH','Statement lines do not reconcile.');
 const snapshot=await digest(JSON.stringify({statement:s.id,lines,subtotal:s.subtotal_cents,gst:s.gst_cents,total:s.total_cents,dueDays:d.dueDays,termsReference:d.termsReference}));
 let prior=await statement(env.DB,'SELECT * FROM agency_invoice_exports WHERE statement_id=?',s.id).first<Record<string,any>>();
 if(prior){assert(prior.snapshot_hash===snapshot,409,'INVOICE_RETRY_CHANGED','Invoice parameters changed after preparation.');if(prior.status==='draft'||prior.status==='finalized')return {id:prior.stripe_invoice_id,status:prior.status,sent:false};}
 else await statement(env.DB,"INSERT INTO agency_invoice_exports(statement_id,client_id,snapshot_hash,status,due_days,terms_reference,requested_by,created_at,updated_at) VALUES(?,?,?,'preparing',?,?,?,?,?)",s.id,s.client_id,snapshot,d.dueDays,d.termsReference,user.id,now(),now()).run();
 const customer=await ensureBillingCustomer(env,user,s.client_id);
 const invoice=await stripeRequest(env,'/invoices',new URLSearchParams({customer,collection_method:'send_invoice',days_until_due:String(d.dueDays),auto_advance:'false','automatic_tax[enabled]':'true','metadata[proinspect_statement_id]':s.id,'metadata[proinspect_client_id]':s.client_id,'metadata[proinspect_snapshot_hash]':snapshot}),`proinspect-statement-${s.id}`);
 assert(typeof invoice.id==='string'&&/^in_/.test(invoice.id)&&invoice.livemode===false&&invoice.status==='draft',502,'INVOICE_RESPONSE_INVALID','Expected a sandbox draft invoice.');
 for(const line of lines){await stripeRequest(env,'/invoiceitems',new URLSearchParams({customer,invoice:invoice.id,currency:'aud',amount:String(line.amount_cents),description:line.description,'metadata[proinspect_line_id]':line.id,'metadata[property_id]':line.property_id??'',tax_behavior:'exclusive'}),`proinspect-invoice-line-${line.id}`);}
 const provider=await stripeRequest(env,'/invoices/'+invoice.id);
 assert(provider.customer===customer&&provider.currency==='aud'&&provider.subtotal===s.subtotal_cents&&provider.total===s.total_cents,409,'INVOICE_TAX_RECONCILIATION_REQUIRED','Provider tax or total differs from the approved statement. Draft is retained unsent for review.');
 await env.DB.batch([statement(env.DB,"UPDATE agency_invoice_exports SET stripe_invoice_id=?,status='draft',updated_at=? WHERE statement_id=? AND snapshot_hash=?",invoice.id,now(),s.id,snapshot),guard(env),statement(env.DB,"INSERT INTO billing_invoices(stripe_invoice_id,client_id,statement_id,stripe_customer_id,currency,subtotal_cents,total_cents,remaining_cents,status,reconciliation,created_at,updated_at) VALUES(?,?,?,?,'AUD',?,?,?,'draft','matched',?,?) ON CONFLICT(stripe_invoice_id) DO NOTHING",invoice.id,s.client_id,s.id,customer,s.subtotal_cents,s.total_cents,s.total_cents,now(),now()),activity(env,user,'billing.invoice_draft_prepared','invoice',invoice.id),clearGuard(env)]);
 return {id:invoice.id,status:'draft',sent:false,paid:false};
}
export async function finalizeStatement(env:Env,user:Principal,input:unknown){
 operationsWrite(user);await requireReleaseApproval(env,'invoices');await verifySandboxAccount(env);assert(env.STRIPE_INVOICING_ENABLED==='true',503,'INVOICING_DISABLED','Invoice processing is not activated.');
 const d=z.object({statementId:recordId,approvalReference:reference}).parse(input);
 const e=await statement(env.DB,"SELECT e.*,i.total_cents,i.stripe_customer_id FROM agency_invoice_exports e JOIN billing_invoices i ON i.stripe_invoice_id=e.stripe_invoice_id WHERE e.statement_id=?",d.statementId).first<Record<string,any>>();
 assert(e&&e.status==='draft',409,'DRAFT_INVOICE_REQUIRED','A reconciled draft invoice is required.');assert(e.requested_by!==user.id,403,'INDEPENDENT_REVIEW','An independent operator must finalize this invoice.');
 const before=await stripeRequest(env,'/invoices/'+e.stripe_invoice_id);assert(before.livemode===false&&before.customer===e.stripe_customer_id&&before.total===e.total_cents&&before.status==='draft',409,'PROVIDER_INVOICE_CHANGED','The provider invoice changed. Reconciliation is required.');
 const result=await stripeRequest(env,'/invoices/'+e.stripe_invoice_id+'/finalize',new URLSearchParams({auto_advance:'false'}),`proinspect-finalize-${e.statement_id}`);
 assert(result.customer===e.stripe_customer_id&&result.total===e.total_cents&&result.livemode===false&&['open','paid'].includes(result.status),502,'FINALIZATION_MISMATCH','Finalized invoice requires reconciliation.');
 await env.DB.batch([statement(env.DB,"UPDATE agency_invoice_exports SET status='finalized',approved_by=?,updated_at=? WHERE statement_id=? AND status='draft'",user.id,now(),e.statement_id),guard(env),activity(env,user,'billing.invoice_finalized','invoice',e.stripe_invoice_id,null,null,{reference:d.approvalReference}),clearGuard(env)]);
 return {id:e.stripe_invoice_id,status:result.status,sent:false,paid:false};
}
/** An independently approved email address is required before even sandbox delivery. */
export async function billingRecipientCommand(env:Env,user:Principal,command:'request'|'approve'|'revoke',input:unknown){
 operationsWrite(user);
 const time=now();
 if(command==='request'){
  const d=z.object({clientId:recordId,email:z.string().trim().toLowerCase().email().max(254),authorityReference:z.string().trim().min(8).max(500)}).parse(input);
  assert(await statement(env.DB,"SELECT id FROM clients WHERE id=? AND status='active'",d.clientId).first(),404,'BILLING_CLIENT_REQUIRED','Choose an active commissioning client.');
  const id=uid('bic');
  await env.DB.batch([
    statement(env.DB,"INSERT INTO billing_invoice_contacts(id,client_id,email,authority_reference,status,requested_by,created_at) VALUES(?,?,?,?,'pending',?,?)",id,d.clientId,d.email,d.authorityReference,user.id,time),
    activity(env,user,'billing.recipient_requested','client',d.clientId,null,null,{recipientId:id}),
  ]);
  return {id,status:'pending'};
 }
 const d=z.object({contactId:recordId,reference:z.string().trim().min(8).max(500)}).parse(input);
 const prior=await statement(env.DB,'SELECT * FROM billing_invoice_contacts WHERE id=?',d.contactId).first<Record<string,any>>();
 assert(prior&&prior.status!=='revoked',409,'CONTACT_NOT_PENDING','This billing contact is unavailable.');
 if(command==='approve'){
  assert(prior.status==='pending'&&prior.requested_by!==user.id,403,'BILLING_CONTACT_INDEPENDENT_REVIEW','A separate active operations reviewer must approve the billing recipient.');
  await env.DB.batch([
    statement(env.DB,"UPDATE billing_invoice_contacts SET status='approved',approved_by=?,approved_at=? WHERE id=? AND status='pending'",user.id,time,d.contactId),guard(env),
    activity(env,user,'billing.recipient_approved','client',prior.client_id,null,null,{recipientId:d.contactId,reference:d.reference}),clearGuard(env)
  ]);
  return {id:d.contactId,status:'approved'};
 }
 assert(prior.status==='approved'||prior.status==='pending',409,'BILLING_CONTACT_REVOKED','The recipient is already revoked.');
 await env.DB.batch([
  statement(env.DB,"UPDATE billing_invoice_contacts SET status='revoked',revoked_by=?,revoked_at=? WHERE id=? AND status IN('approved','pending')",user.id,time,d.contactId),guard(env),
  activity(env,user,'billing.recipient_revoked','client',prior.client_id,null,null,{recipientId:d.contactId,reference:d.reference}),clearGuard(env)
 ]);
 return {id:d.contactId,status:'revoked'};
}
export async function dispatchApprovedInvoice(env:Env,user:Principal,input:unknown){
 operationsWrite(user);
 await requireReleaseApproval(env,'invoices');
 assert(env.STRIPE_INVOICING_ENABLED==='true'&&env.STRIPE_TAX_READY==='true',503,'INVOICING_DISABLED','Approved sandbox invoicing is disabled.');
 await verifySandboxAccount(env);
 const d=z.object({statementId:recordId,contactId:recordId,approvalReference:z.string().trim().min(8).max(500)}).parse(input);
 const invoice=await statement(env.DB,`SELECT e.statement_id,e.client_id,e.requested_by AS prepared_by,e.approved_by AS approved_by,
 e.stripe_invoice_id,e.status AS export_status,i.stripe_customer_id,i.total_cents,i.status AS invoice_status,
 c.email,c.status AS recipient_status,c.approved_by AS contact_reviewer
 FROM agency_invoice_exports e JOIN billing_invoices i ON i.stripe_invoice_id=e.stripe_invoice_id
 JOIN billing_invoice_contacts c ON c.client_id=e.client_id AND c.id=?
 WHERE e.statement_id=?`,d.contactId,d.statementId).first<Record<string,any>>();
 assert(invoice&&invoice.export_status==='finalized'&&['draft','open'].includes(invoice.invoice_status)&&invoice.recipient_status==='approved',409,'INVOICE_DELIVERY_APPROVAL_REQUIRED','Finalised invoice and independently approved billing recipient are required.');
 assert(invoice.contact_reviewer!==user.id,403,'INVOICE_SENDER_SEPARATION','The billing recipient approver must not dispatch the invoice.');
 assert(invoice.approved_by!==null,409,'INVOICE_APPROVAL_MISSING','An independent invoice finalisation approval is required.');
 const existing=await statement(env.DB,'SELECT status,contact_id,recipient_email FROM billing_invoice_dispatches WHERE statement_id=?',d.statementId).first<{status:string,contact_id:string,recipient_email:string}>();
 if(existing){
  assert(existing.contact_id===d.contactId&&existing.recipient_email===invoice.email,409,'DISPATCH_RECIPIENT_CHANGED','The original recipient binding cannot change.');
  if(existing.status==='provider_accepted')return {status:'provider_accepted',sent:false,replayed:true,providerAccepted:true};
  assert(false,409,'DISPATCH_RECONCILIATION_REQUIRED','A previous send may have reached the provider. Reconcile it independently; do not send twice.');
 }
 const from=await stripeRequest(env,'/invoices/'+invoice.stripe_invoice_id);
 assert(from.livemode===false&&from.customer===invoice.stripe_customer_id&&from.total===invoice.total_cents&&from.status==='open'&&from.collection_method==='send_invoice',409,'INVOICE_PROVIDER_CHANGED','The provider invoice is not the finalised, open, sendable invoice.');
 const customer=await stripeRequest(env,'/customers/'+invoice.stripe_customer_id);
 assert(customer.livemode===false&&customer.id===invoice.stripe_customer_id&&typeof customer.email==='string'&&customer.email.toLowerCase()===invoice.email,
  409,'INVOICE_PROVIDER_RECIPIENT','Provider billing email differs from the independently approved recipient. Correct it under a reviewed process first.');
 const stamp=now();
 await env.DB.batch([
  statement(env.DB,"INSERT INTO billing_invoice_dispatches(statement_id,stripe_invoice_id,contact_id,customer_id,recipient_email,status,requested_by,approval_reference,created_at,updated_at) VALUES(?,?,?,?,?,'preparing',?,?,?,?)",d.statementId,invoice.stripe_invoice_id,d.contactId,invoice.stripe_customer_id,invoice.email,user.id,d.approvalReference,stamp,stamp),
  statement(env.DB,"INSERT INTO billing_invoice_dispatch_events(id,statement_id,event,actor_id,reference,created_at) VALUES(?,?,'requested',?,?,?)",uid('bde'),d.statementId,user.id,d.approvalReference,stamp),
  activity(env,user,'billing.invoice_delivery_requested','invoice',invoice.stripe_invoice_id,null,null,{recipientId:d.contactId})
 ]);
 // The reservation is durable before calling Stripe. Timeout or a lost response is
 // intentionally NOT auto-retried: a duplicate email must require manual review.
 let result:Record<string,any>;
 try {
  result=await stripeRequest(env,'/invoices/'+invoice.stripe_invoice_id+'/send',new URLSearchParams(),`proinspect-invoice-send-${d.statementId}`);
 } catch (error) {
  // A timed-out HTTP call can already have sent the invoice. The recorded
  // reservation must survive and be explicitly reconciled, never retried.
  await env.DB.batch([
   statement(env.DB,"UPDATE billing_invoice_dispatches SET status='needs_reconciliation',updated_at=? WHERE statement_id=? AND status='preparing'",now(),d.statementId),guard(env),
   statement(env.DB,"INSERT INTO billing_invoice_dispatch_events(id,statement_id,event,actor_id,reference,created_at) VALUES(?,?,'needs_reconciliation',?,?,?)",uid('bde'),d.statementId,user.id,d.approvalReference,now()),
   activity(env,user,'billing.invoice_delivery_uncertain','invoice',invoice.stripe_invoice_id,null,null,{statementId:d.statementId}),clearGuard(env)
  ]);
  throw error;
 }
 assert(result.livemode===false&&result.id===invoice.stripe_invoice_id&&result.customer===invoice.stripe_customer_id&&result.status==='open',502,'INVOICE_DELIVERY_UNCONFIRMED','Provider did not acknowledge the exact invoice dispatch. Reconciliation is required.');
 await env.DB.batch([
  statement(env.DB,"UPDATE billing_invoice_dispatches SET status='provider_accepted',provider_accepted_at=?,updated_at=? WHERE statement_id=? AND status='preparing'",now(),now(),d.statementId),guard(env),
  statement(env.DB,"INSERT INTO billing_invoice_dispatch_events(id,statement_id,event,actor_id,reference,created_at) VALUES(?,?,'provider_accepted',?,?,?)",uid('bde'),d.statementId,user.id,result.id,now()),
  activity(env,user,'billing.invoice_provider_accepted','invoice',invoice.stripe_invoice_id,null,null,{recipientId:d.contactId}),clearGuard(env)
 ]);
 return {status:'provider_accepted',sent:true,providerAccepted:true,inboxDeliveryVerified:false,invoiceId:invoice.stripe_invoice_id};
}
export async function invoiceObservation(env:Env,event:ProviderEvent){
 const o=event.data.object;
 const prior=await statement(env.DB,'SELECT * FROM billing_invoices WHERE stripe_invoice_id=?',String(o.id??'')).first<Record<string,any>>();
 if(!prior)return null;
 assert(o.customer===prior.stripe_customer_id&&o.currency==='aud',409,'INVOICE_IDENTITY_MISMATCH','Invoice identity or currency differs.');
 const decision=projectInvoiceObservation(prior as InvoiceSnapshot,event.type,o,Number(event.created));
 const steps:D1PreparedStatement[]=[statement(env.DB,'INSERT INTO billing_reconciliations(id,provider_event_id,stripe_invoice_id,matched,reason,created_at) VALUES(?,?,?,?,?,?)',uid('bre'),event.id,o.id,+decision.matched,decision.reason,now())];
 if(decision.needsReview)steps.push(reconciliation(env,event.id,null,decision.reason,String(o.id)));
 if(decision.apply){
  // Compare-and-swap the whole observed financial snapshot. A concurrent event rolls
  // back this receipt and retries rather than mixing balances from two snapshots.
  steps.push(statement(env.DB,`UPDATE billing_invoices SET status=?,paid_cents=?,remaining_cents=?,reconciliation=?,last_provider_created=?,updated_at=?
   WHERE stripe_invoice_id=? AND last_provider_created=? AND status=? AND paid_cents=? AND remaining_cents=? AND reconciliation=?`,
   decision.status,decision.paidCents,decision.remainingCents,decision.reconciliation,decision.providerCreated,now(),o.id,prior.last_provider_created,prior.status,prior.paid_cents,prior.remaining_cents,prior.reconciliation),guard(env),clearGuard(env));
 }
 return {matched:decision.matched,steps};
}
