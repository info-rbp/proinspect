import {z} from 'zod';
import {statement, assert, now, uid, type Env} from '../../../../packages/database/types';
import type {Principal, Workspace} from '../../../../packages/domain/index';
import {operationsWrite,workOrderAccess} from '../../../../packages/authorization/server';
import {activity,guard,clearGuard} from '../../../../packages/operations/core';
import {unseal} from '../../../../packages/auth/crypto';
import {releaseFeatureReady} from './release-governance.server';
import {cashPaymentTermSchema,cashInvoicePeriod,cashPeriodIsClosed,type CashPaymentTerm} from '../../../../packages/booking/inspection-checkout';

function staff(user:Principal,w:Workspace) {
  assert(w.kind==='staff',403,'STAFF_REQUIRED','Use the Staff workspace.');
  operationsWrite(user);
}
export async function effectiveCashTerms(env:Env,clientId:string){
 const row=await statement(env.DB,'SELECT term_code,credit_limit_cents,source_request_id FROM cash_client_terms WHERE client_id=?',clientId)
 .first<{term_code:CashPaymentTerm;credit_limit_cents:number|null;source_request_id:string}>();
 // A credit approval is not itself a production release. Keep the customer
 // booking screen consistent with the fail-closed scheduler while the
 // credit/invoicing provider acceptance flag remains off.
 const released=await releaseFeatureReady(env,'cash_credit');
 const applicable=released?row:null;
 return {termCode:applicable?.term_code??'upon_booking' as CashPaymentTerm,
  creditLimitCents:applicable?.credit_limit_cents??null,
  approvalRequestId:applicable?.source_request_id??null};
}
export async function assertCashCreditCapacity(env:Env,clientId:string,chargeCents:number,creditLimitCents:number|null){
 assert(creditLimitCents!==null,409,'CREDIT_LIMIT_REQUIRED',
  'Deferred account bookings require an explicitly approved credit limit.');
 const row=await statement(env.DB,`SELECT COALESCE(SUM(p.total_cents),0) AS amount
 FROM cash_booking_charges c JOIN payments p ON p.id=c.payment_id
 WHERE c.client_id=? AND c.status!='cancelled' AND p.status NOT IN('paid','waived','refunded')`,clientId).first<{amount:number}>();
 assert((row?.amount??0)+chargeCents<=creditLimitCents,409,'CREDIT_LIMIT_REACHED',
 'This account has reached its approved credit limit. Contact ProInspect or arrange an upfront payment.');
}
export async function cashBillingDirectory(env:Env,user:Principal,w:Workspace){
 staff(user,w);
 const [clients,requests,invoices,charges]=await Promise.all([
  statement(env.DB,`SELECT c.id,c.name,c.client_type,
   COALESCE(t.term_code,'upon_booking') AS term_code,t.credit_limit_cents,t.approved_at,
   COALESCE((SELECT SUM(p.total_cents) FROM cash_booking_charges bc JOIN payments p ON p.id=bc.payment_id
    WHERE bc.client_id=c.id AND bc.status!='cancelled' AND p.status NOT IN('paid','waived','refunded')),0) AS outstanding_cents
   FROM clients c LEFT JOIN cash_client_terms t ON t.client_id=c.id
   WHERE c.status='active' ORDER BY c.name LIMIT 200`).all(),
  statement(env.DB,`SELECT r.*,c.name AS client_name,u.display_name AS requested_by_name
    FROM cash_payment_term_requests r JOIN clients c ON c.id=r.client_id
    JOIN users u ON u.id=r.requested_by
    ORDER BY (r.status='pending') DESC,r.created_at DESC LIMIT 100`).all(),
  statement(env.DB,`SELECT i.*,c.name AS client_name FROM cash_invoice_batches i
    JOIN clients c ON c.id=i.client_id ORDER BY i.created_at DESC LIMIT 100`).all(),
  statement(env.DB,`SELECT c.booking_id,c.term_code,c.status,c.period,c.amount_ex_gst_cents,c.gst_cents,
   b.reference,b.property_id,p.address,pay.status AS payment_status,cl.name AS client_name
   FROM cash_booking_charges c JOIN bookings b ON b.id=c.booking_id
   JOIN properties p ON p.id=b.property_id JOIN clients cl ON cl.id=c.client_id
   JOIN payments pay ON pay.id=c.payment_id ORDER BY c.created_at DESC LIMIT 100`).all(),
 ]);
 return {clients:clients.results,requests:requests.results,invoices:invoices.results,charges:charges.results};
}
export async function cashTermCommand(env:Env,user:Principal,w:Workspace,action:'request'|'approve'|'decline',raw:unknown){
 staff(user,w);
 if(action==='request'){
  const d=z.object({
   clientId:z.string().regex(/^[a-zA-Z0-9_-]{3,100}$/),
   termCode:cashPaymentTermSchema,
   creditLimitCents:z.coerce.number().int().min(0).max(100000000).optional(),
   reason:z.string().trim().min(8).max(600)
  }).refine(value=>value.termCode==='upon_booking'||(value.creditLimitCents??0)>0,{
   path:['creditLimitCents'],message:'A positive approved credit limit is required for deferred payment terms.'
  }).parse(raw);
  const client=await statement(env.DB,"SELECT id FROM clients WHERE id=? AND status='active'",d.clientId).first();
  assert(client,404,'BILLING_CLIENT_REQUIRED','Choose an active customer account.');
  const id=uid('ctr'),time=now();
  await env.DB.batch([
   statement(env.DB,`INSERT INTO cash_payment_term_requests
    (id,client_id,term_code,credit_limit_cents,reason,status,requested_by,created_at)
    VALUES(?,?,?,?,?,'pending',?,?)`,id,d.clientId,d.termCode,d.termCode==='upon_booking'?null:(d.creditLimitCents??null),d.reason,user.id,time),
   activity(env,user,'cash_terms.requested','client',d.clientId,null,null,{requestId:id,term:d.termCode})
  ]);
  return {id,status:'pending',message:'Awaiting independent Staff approval; effective terms have not changed.'};
 }
 const d=z.object({requestId:z.string().regex(/^[a-zA-Z0-9_-]{3,100}$/),
  reviewReference:z.string().trim().min(8).max(500)}).parse(raw);
 const pending=await statement(env.DB,"SELECT * FROM cash_payment_term_requests WHERE id=? AND status='pending'",d.requestId)
   .first<{client_id:string;term_code:CashPaymentTerm;requested_by:string;credit_limit_cents:number|null}>();
 assert(pending,409,'REQUEST_NOT_PENDING','This payment-terms request has already been reviewed.');
 assert(pending.requested_by!==user.id,403,'INDEPENDENT_CREDIT_APPROVAL',
   'The requesting Staff member cannot approve or decline the same credit decision.');
 if(action==='approve'&&pending.term_code!=='upon_booking')
  await assertCashCreditCapacity(env,pending.client_id,0,pending.credit_limit_cents);
 const time=now(),status=action==='approve'?'approved':'declined';
 const steps=[
  statement(env.DB,"UPDATE cash_payment_term_requests SET status=?,reviewed_by=?,review_reference=?,reviewed_at=? WHERE id=? AND status='pending'",status,user.id,d.reviewReference,time,d.requestId),
  // Only one independent reviewer may consume a pending decision. Reject a
  // stale parallel review inside the same atomic D1 batch.
  guard(env),
  activity(env,user,'cash_terms.'+status,'client',pending.client_id,null,null,{requestId:d.requestId,reviewReference:d.reviewReference})
 ];
 if(action==='approve'){
  // Apply the credit decision only if its limit still covers the account's
  // unsettled booking exposure at the moment of the atomic D1 write. The
  // second mutation guard rejects a simultaneous/changed balance.
  steps.push(statement(env.DB,`INSERT INTO cash_client_terms
    (client_id,term_code,credit_limit_cents,source_request_id,approved_by,approved_at)
    SELECT ?,?,?,?,?,?
    WHERE (?='upon_booking' OR ?>=COALESCE((
      SELECT SUM(p.total_cents)
      FROM cash_booking_charges c JOIN payments p ON p.id=c.payment_id
      WHERE c.client_id=? AND c.status!='cancelled'
        AND p.status NOT IN('paid','waived','refunded')
    ),0))
    ON CONFLICT(client_id) DO UPDATE SET
    term_code=excluded.term_code,credit_limit_cents=excluded.credit_limit_cents,
    source_request_id=excluded.source_request_id,approved_by=excluded.approved_by,
    approved_at=excluded.approved_at`,
    pending.client_id,pending.term_code,pending.credit_limit_cents,d.requestId,user.id,time,
    pending.term_code,pending.credit_limit_cents??0,pending.client_id));
  steps.push(guard(env));
 }
 steps.push(clearGuard(env));
 await env.DB.batch(steps);
 return {id:d.requestId,status};
}
export async function prepareCashInvoice(env:Env,user:Principal,w:Workspace,raw:unknown){
 staff(user,w);
 const d=z.object({
   clientId:z.string().regex(/^[a-zA-Z0-9_-]{3,100}$/),
   termCode:z.enum(['net_7','eom_7']),
   period:z.string().trim().min(4).max(40)
 }).parse(raw);
 const period=d.termCode==='eom_7'?d.period:'booking:'+d.period;
 if(d.termCode==='eom_7')assert(cashPeriodIsClosed(d.period,now()),409,'MONTH_NOT_CLOSED',
   'Month-end charges can be prepared only after the service month closes in Perth.');
 const rows=(await statement(env.DB,`SELECT c.booking_id,c.amount_ex_gst_cents,c.gst_cents,c.period,c.term_code
 FROM cash_booking_charges c JOIN payments p ON p.id=c.payment_id
 WHERE c.client_id=? AND c.term_code=? AND c.status='ready_to_invoice' AND p.status='pending'
   AND ${d.termCode==='net_7'?'c.booking_id=?':'c.period=?'}
 ORDER BY c.booking_id`,d.clientId,d.termCode,d.period).all<{booking_id:string;amount_ex_gst_cents:number;gst_cents:number;period:string;term_code:string}>()).results;
 assert(rows.length>0,409,'INVOICE_ITEMS_NOT_READY','There are no completed, unbilled services for these terms and period.');
 const subtotal=rows.reduce((a,b)=>a+b.amount_ex_gst_cents,0);
 const gst=rows.reduce((a,b)=>a+b.gst_cents,0);
 const id=uid('cin'),time=now();
 const steps=[
  statement(env.DB,`INSERT INTO cash_invoice_batches
   (id,client_id,term_code,period,subtotal_cents,gst_cents,total_cents,status,prepared_by,created_at)
   VALUES(?,?,?,?,?,?,?,'prepared',?,?)`,id,d.clientId,d.termCode,period,subtotal,gst,subtotal+gst,user.id,time),
  ...rows.flatMap(row=>[
   statement(env.DB,'INSERT INTO cash_invoice_items(booking_id,invoice_id) VALUES(?,?)',row.booking_id,id),
   statement(env.DB,"UPDATE cash_booking_charges SET status='invoice_prepared',invoice_id=? WHERE booking_id=? AND status='ready_to_invoice'",id,row.booking_id)
  ]),
  activity(env,user,'cash_invoice.prepared','client',d.clientId,null,null,{invoiceId:id,items:rows.length})
 ];
 await env.DB.batch(steps);
 return {id,status:'prepared',lineCount:rows.length,totalCents:subtotal+gst,
   message:'Prepared for independent invoice/provider reconciliation. Not issued or sent.'};
}
export async function staffBookingIntake(env:Env,user:Principal,w:Workspace,workOrderId:string){
 assert(w.kind==='staff',403,'STAFF_REQUIRED','Only authorised Staff can view booking instructions.');
 const order=await workOrderAccess(env,user,w,workOrderId);
 assert(order.booking_id,404,'BOOKING_REQUIRED','This Work Order has no booking.');
 const row=await statement(env.DB,'SELECT envelope FROM booking_intake_secrets WHERE booking_id=?',order.booking_id)
   .first<{envelope:string}>();
 assert(row,404,'INTAKE_NOT_RECORDED','This historic booking has no structured inspection intake.');
 const intake=await unseal(env.DATA_ENCRYPTION_KEY,`booking-intake:${order.booking_id}`,row.envelope);
 await activity(env,user,'booking.intake_viewed','booking',order.booking_id,order.property_id).run();
 return {bookingId:order.booking_id,intake};
}
