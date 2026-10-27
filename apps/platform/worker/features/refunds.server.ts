import {z} from 'zod';
import {assert,statement,now,uid,type Env} from '../../../../packages/database/types';
import type {Principal} from '../../../../packages/domain/index';
import {operationsWrite} from '../../../../packages/authorization/server';
import {activity,guard,clearGuard,recordId,reference} from '../../../../packages/operations/core';
import {requireReleaseApproval} from './release-governance.server';
import {stripeApi,verifySandboxAccount} from './stripe-client.server';
import type {PaymentRecord} from './payment-lifecycle.server';
export async function refundCommand(env:Env,user:Principal,command:string,id:string|null,input:unknown){
 operationsWrite(user);
 if(command==='request'){
  const d=z.object({paymentId:recordId,amountCents:z.number().int().positive().max(100000000),reason:z.string().trim().min(8).max(2000),requestKey:z.string().min(16).max(100)}).parse(input);
  const prior=await statement(env.DB,'SELECT * FROM refund_requests WHERE request_key=?',d.requestKey).first<Record<string,any>>();
  if(prior){assert(prior.requested_by===user.id&&prior.payment_id===d.paymentId&&prior.amount_cents===d.amountCents&&prior.reason===d.reason,409,'REFUND_RETRY_CHANGED','Refund request changed.');return {id:prior.id,status:prior.status,replayed:true};}
  const p=await statement(env.DB,'SELECT * FROM payments WHERE id=?',d.paymentId).first<PaymentRecord>();assert(p,404,'PAYMENT_NOT_FOUND','Payment not found.');
  assert(p&&p.status==='paid'&&p.stripe_payment_intent_id&&d.amountCents<=p.total_cents-p.refunded_cents,409,'REFUND_UNAVAILABLE','Only reconciled Stripe payments with an available refundable balance are eligible.');
  const key=uid('rrq');await env.DB.batch([statement(env.DB,'INSERT INTO refund_requests(id,payment_id,amount_cents,reason,evidence_reference,request_key,requested_by,requested_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',key,p.id,d.amountCents,d.reason,d.reason,d.requestKey,user.id,now(),now()),activity(env,user,'refund.requested','refund_request',key,p.property_id)]);return {id:key,status:'requested'};
 }
 const d=z.object({reference:z.string().trim().min(8).max(500)}).parse(input);
 const r=await statement(env.DB,'SELECT r.*,p.stripe_payment_intent_id,p.total_cents,p.refunded_cents,p.status AS payment_status FROM refund_requests r JOIN payments p ON p.id=r.payment_id WHERE r.id=?',id).first<Record<string,any>>();assert(r,404,'REFUND_NOT_FOUND','Refund request not found.');
 if(command==='approve'||command==='reject'){
  assert(r.status==='requested',409,'REFUND_ALREADY_REVIEWED','Refund has already been reviewed.');assert(r.requested_by!==user.id,403,'INDEPENDENT_REVIEW','Another operator must review this refund.');
  await env.DB.batch([statement(env.DB,'UPDATE refund_requests SET status=?,approved_by=?,approval_reference=?,approved_at=?,version=version+1,updated_at=? WHERE id=? AND status=\'requested\' AND version=?',command==='approve'?'approved':'rejected',user.id,d.reference,now(),now(),r.id,r.version),guard(env),activity(env,user,'refund.'+command,'refund_request',r.id,null,null,{reference:d.reference}),clearGuard(env)]);return {id:r.id,status:command==='approve'?'approved':'rejected'};
 }
 assert(command==='execute',404,'REFUND_ACTION','Unknown refund action.');await requireReleaseApproval(env,'refunds');await verifySandboxAccount(env);
 assert(['approved','processing','submitted'].includes(r.status)&&r.approved_by!==r.requested_by&&r.approved_by,409,'REFUND_NOT_APPROVED','Independent refund approval is required.');
 if(r.status==='submitted')return {id:r.id,providerId:r.stripe_refund_id,status:'submitted',settled:false,replayed:true};
 const approver=await statement(env.DB,"SELECT u.id FROM users u JOIN staff_profiles sp ON sp.user_id=u.id WHERE u.id=? AND u.active=1 AND u.verified_at IS NOT NULL AND sp.active=1 AND sp.role IN('administrator','operations_manager')",r.approved_by).first();
 assert(approver,403,'REFUND_APPROVER_REVOKED','The approving operator no longer has refund authority. Obtain current independent approval before execution.');
 assert(r.stripe_payment_intent_id&&r.payment_status==='paid'&&r.amount_cents<=r.total_cents-r.refunded_cents,409,'REFUND_BALANCE_CHANGED','The refundable balance changed; review the request.');
 const pi=await stripeApi(env,'/payment_intents/'+r.stripe_payment_intent_id);
 assert(pi.id===r.stripe_payment_intent_id&&pi.livemode===false&&pi.currency==='aud'&&pi.amount_received===r.total_cents&&pi.status==='succeeded',409,'REFUND_SOURCE_MISMATCH','The provider payment no longer matches the approved original transaction.');
 if(r.status==='approved')await env.DB.batch([statement(env.DB,"UPDATE refund_requests SET status='processing',updated_at=?,version=version+1 WHERE id=? AND status='approved' AND version=?",now(),r.id,r.version),guard(env),clearGuard(env)]);
 const refund=await stripeApi(env,'/refunds',new URLSearchParams({payment_intent:r.stripe_payment_intent_id,amount:String(r.amount_cents),'metadata[refund_request_id]':r.id}),'proinspect-refund-'+r.id);
 assert(typeof refund.id==='string'&&refund.id.startsWith('re_')&&refund.payment_intent===r.stripe_payment_intent_id&&refund.amount===r.amount_cents&&refund.currency==='aud',502,'REFUND_RESPONSE_MISMATCH','Refund response needs reconciliation; no second instruction will be issued.');
 await env.DB.batch([statement(env.DB,"UPDATE refund_requests SET status='submitted',stripe_refund_id=?,updated_at=?,version=version+1 WHERE id=? AND status='processing' AND (stripe_refund_id IS NULL OR stripe_refund_id=?)",refund.id,now(),r.id,refund.id),guard(env),activity(env,user,'refund.submitted','refund_request',r.id,null,null,{reference:d.reference}),clearGuard(env)]);
 return {id:r.id,providerId:refund.id,status:'submitted',settled:false,message:'The signed refund event, not this request response, updates financial settlement.'};
}
export async function resolvePaymentException(env:Env,user:Principal,id:string,input:unknown){
 operationsWrite(user);const d=z.object({reference:z.string().trim().min(8).max(500)}).parse(input);
 await env.DB.batch([statement(env.DB,"UPDATE payment_reconciliation_items SET status='resolved',resolved_by=?,resolved_at=?,evidence_reference=? WHERE id=? AND status='open'",user.id,now(),d.reference,id),guard(env),activity(env,user,'payment.exception_resolved','payment_exception',id,null,null,{reference:d.reference}),clearGuard(env)]);
 return {id,status:'resolved',paymentStatusChanged:false};
}
