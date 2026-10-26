import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { clientAdmin, clientMembership, operationsWrite } from '../../../../packages/authorization/server';
import { activity, guard, clearGuard, reference, recordId } from '../../../../packages/operations/core';
import { digest } from '../../../../packages/auth/crypto';
import { z } from 'zod';
import type { ProviderEvent } from './payment-lifecycle.server';
import {sandboxConfiguration,stripeApi,verifySandboxAccount,SANDBOX_ACCOUNT} from './stripe-client.server';
import {requireReleaseApproval} from './release-governance.server';
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
 const [accounts,subscriptions,invoices,exceptions,refunds]=await Promise.all([
 statement(env.DB,`SELECT client_id,mode,created_at FROM billing_accounts WHERE ${clause}`, ...values).all(),
 statement(env.DB,`SELECT id,client_id,property_id,sector,status,price_id FROM stripe_billing_links WHERE ${clause} ORDER BY updated_at DESC LIMIT 100`,...values).all(),
 statement(env.DB,`SELECT * FROM billing_invoices WHERE ${clause} ORDER BY updated_at DESC LIMIT 100`,...values).all(),
 staff?statement(env.DB,"SELECT id,payment_id,code,created_at FROM payment_reconciliation_items WHERE status='open' ORDER BY created_at LIMIT 100").all():Promise.resolve({results:[]}),
 staff?statement(env.DB,"SELECT r.*,p.description,p.total_cents,p.refunded_cents FROM refund_requests r JOIN payments p ON p.id=r.payment_id ORDER BY requested_at DESC LIMIT 100").all():Promise.resolve({results:[]})]);
 return {accounts:accounts.results,subscriptions:subscriptions.results,invoices:invoices.results,exceptions:exceptions.results,refunds:refunds.results,portalEnabled:env.STRIPE_CUSTOMER_PORTAL_ENABLED==='true',invoicesEnabled:env.STRIPE_INVOICING_ENABLED==='true',refundsEnabled:env.STRIPE_REFUNDS_ENABLED==='true'};
}
export async function billingPortal(env:Env,user:Principal,w:Workspace){
 await clientAdmin(env,user,w);await requireReleaseApproval(env,'billing_portal');await verifySandboxAccount(env);assert(env.STRIPE_CUSTOMER_PORTAL_ENABLED==='true',503,'BILLING_PORTAL_DISABLED','Customer billing self-service is not activated.');
 const a=await statement(env.DB,"SELECT stripe_customer_id FROM billing_accounts WHERE client_id=? AND mode='test' AND stripe_account_id=?",w.scopeId,sandbox).first<{stripe_customer_id:string}>();assert(a?.stripe_customer_id,409,'BILLING_CUSTOMER_REQUIRED','A verified billing customer must be linked first.');
 const s=await stripeRequest(env,'/billing_portal/sessions',new URLSearchParams({customer:a.stripe_customer_id,return_url:env.APP_ORIGIN+w.href+'/billing'}));
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
export async function invoiceObservation(env:Env,event:ProviderEvent){
 const o=event.data.object;
 const prior=await statement(env.DB,'SELECT * FROM billing_invoices WHERE stripe_invoice_id=?',String(o.id??'')).first<Record<string,any>>();
 if(!prior)return null;
 assert(o.customer===prior.stripe_customer_id&&o.currency==='aud',409,'INVOICE_IDENTITY_MISMATCH','Invoice identity or currency differs.');
 const matched=Number.isSafeInteger(o.total)&&o.total===prior.total_cents&&Number.isSafeInteger(o.amount_paid)&&Number.isSafeInteger(o.amount_remaining)&&o.amount_paid>=0&&o.amount_remaining>=0;
 const paid=event.type==='invoice.paid'&&matched&&o.paid===true&&o.status==='paid'&&o.amount_remaining===0&&o.amount_paid===prior.total_cents;
 const status=paid?'paid':event.type==='invoice.voided'?'void':event.type==='invoice.marked_uncollectible'?'uncollectible':matched?'open':'review';
 const created=Number.isSafeInteger(event.created)?event.created!:0;
 return {matched:!!paid,steps:[statement(env.DB,'INSERT INTO billing_reconciliations(id,provider_event_id,stripe_invoice_id,matched,reason,created_at) VALUES(?,?,?,?,?,?)',uid('bre'),event.id,o.id,+!!paid,paid?'approved_statement_settled':matched?'provider_state_observed':'amount_requires_review',now()),statement(env.DB,"UPDATE billing_invoices SET status=CASE WHEN status='paid' AND ?!='paid' THEN status ELSE ? END,paid_cents=MAX(paid_cents,?),remaining_cents=CASE WHEN status='paid' THEN 0 ELSE ? END,reconciliation=?,last_provider_created=?,updated_at=? WHERE stripe_invoice_id=? AND last_provider_created<=?",status,status,Number.isSafeInteger(o.amount_paid)?o.amount_paid:prior.paid_cents,Number.isSafeInteger(o.amount_remaining)?o.amount_remaining:prior.remaining_cents,paid?'matched':'exception',created,now(),o.id,created)]};
}
