import {z} from 'zod';
import {assert,statement,now,uid,type Env} from '../../../../packages/database/types';
import type {Principal,Workspace} from '../../../../packages/domain/index';
import {operationsWrite} from '../../../../packages/authorization/server';

const id=z.string().min(4).max(100).regex(/^[A-Za-z0-9_-]+$/);
const source=z.string().trim().min(8).max(300);
const key=z.string().min(16).max(100);
const command=z.discriminatedUnion('action',[
  z.object({action:z.literal('credit_request'),invoiceId:id,amountCents:z.number().int().positive().max(100000000),
    rationale:z.string().trim().min(8).max(3000),sourceReference:source,requestKey:key}),
  z.object({action:z.literal('credit_review'),proposalId:id,decision:z.enum(['approved','rejected']),
    sourceReference:source}),
  z.object({action:z.literal('bank_record'),paymentId:id,observedAmountCents:z.number().int().min(0).max(100000000),
    observationType:z.enum(['bank_received','bank_returned','payout_match','payout_exception']),
    sourceReference:source,requestKey:key}),
  z.object({action:z.literal('bank_review'),observationId:id,decision:z.enum(['reviewed','disputed']),
    sourceReference:source}),
]);

export async function financeReviewData(env:Env,user:Principal,w:Workspace){
  assert(w.kind==='staff',403,'STAFF_REQUIRED','Financial evidence review is internal only.');
  operationsWrite(user);
  const [invoices,payments,credits,observations]=await Promise.all([
    statement(env.DB,`SELECT stripe_invoice_id,client_id,total_cents,status,reconciliation
      FROM billing_invoices ORDER BY updated_at DESC LIMIT 150`).all(),
    statement(env.DB,`SELECT id,client_id,total_cents,status,provider,refunded_cents
      FROM payments ORDER BY created_at DESC LIMIT 150`).all(),
    statement(env.DB,`SELECT id,stripe_invoice_id,client_id,amount_cents,rationale,
      evidence_reference,status,requested_by,reviewed_by,created_at
      FROM invoice_credit_proposals ORDER BY created_at DESC LIMIT 150`).all(),
    statement(env.DB,`SELECT id,payment_id,observed_amount_cents,observation_type,
      source_reference,status,requested_by,reviewed_by,created_at
      FROM bank_reconciliation_observations ORDER BY created_at DESC LIMIT 150`).all(),
  ]);
  return {invoices:invoices.results,payments:payments.results,credits:credits.results,
    observations:observations.results,
    caveat:'Evidence-only. Approval is not a Stripe credit note, payout match, bank statement verification or payment mutation.'};
}
export async function financeReviewCommand(env:Env,user:Principal,w:Workspace,input:unknown){
  assert(w.kind==='staff',403,'STAFF_REQUIRED','Financial evidence review is internal only.');
  operationsWrite(user);
  const d=command.parse(input),timestamp=now();
  if(d.action==='credit_request'){
    const invoice=await statement(env.DB,
      'SELECT client_id,total_cents FROM billing_invoices WHERE stripe_invoice_id=?',
      d.invoiceId).first<{client_id:string;total_cents:number}>();
    assert(invoice,404,'INVOICE_NOT_FOUND','Invoice record not found.');
    assert(d.amountCents<=invoice.total_cents,422,'CREDIT_EXCEEDS_INVOICE',
      'A proposed adjustment cannot exceed the observed invoice total.');
    const prior=await statement(env.DB,
      'SELECT id,requested_by,stripe_invoice_id,amount_cents FROM invoice_credit_proposals WHERE request_key=?',
      d.requestKey).first<{id:string;requested_by:string;stripe_invoice_id:string;amount_cents:number}>();
    if(prior){
      assert(prior.requested_by===user.id&&prior.stripe_invoice_id===d.invoiceId&&prior.amount_cents===d.amountCents,
        409,'CREDIT_REPLAY_CHANGED','This request key belongs to a different adjustment.');
      return {ok:true,id:prior.id,replayed:true};
    }
    const proposalId=uid('icp');
    await env.DB.batch([
      statement(env.DB,`INSERT INTO invoice_credit_proposals
        (id,stripe_invoice_id,client_id,amount_cents,rationale,evidence_reference,
          request_key,requested_by,created_at)
        VALUES(?,?,?,?,?,?,?,?,?)`,proposalId,d.invoiceId,invoice.client_id,d.amountCents,
        d.rationale,d.sourceReference,d.requestKey,user.id,timestamp),
      statement(env.DB,`INSERT INTO audit_events
        (id,actor_id,action,entity_type,entity_id,metadata_json,created_at)
        VALUES(?,?,?,?,?,?,?)`,uid('aud'),user.id,'invoice.credit_proposed','invoice_credit_proposal',proposalId,
        JSON.stringify({invoiceId:d.invoiceId,source:d.sourceReference,providerAction:false}),timestamp),
    ]);
    return {ok:true,id:proposalId,status:'requested',message:'Credit review proposed, not issued or sent.'};
  }
  if(d.action==='credit_review'){
    const prior=await statement(env.DB,
      'SELECT id,requested_by,status FROM invoice_credit_proposals WHERE id=?',d.proposalId)
      .first<{id:string;requested_by:string;status:string}>();
    assert(prior?.status==='requested',409,'CREDIT_REVIEW_UNAVAILABLE','A pending credit proposal is required.');
    assert(prior.requested_by!==user.id,403,'INDEPENDENT_CREDIT_REVIEW','A separate operator must review the proposal.');
    await env.DB.batch([
      statement(env.DB,`UPDATE invoice_credit_proposals SET status=?,reviewed_by=?,reviewed_at=?
        WHERE id=? AND status='requested'`,d.decision,user.id,timestamp,d.proposalId),
      statement(env.DB,`INSERT INTO audit_events
        (id,actor_id,action,entity_type,entity_id,metadata_json,created_at)
        VALUES(?,?,?,?,?,?,?)`,uid('aud'),user.id,'invoice.credit_reviewed','invoice_credit_proposal',d.proposalId,
        JSON.stringify({decision:d.decision,source:d.sourceReference,providerAction:false}),timestamp),
    ]);
    return {ok:true,id:d.proposalId,status:d.decision,
      message:'Independent adjustment review recorded. No Stripe credit note was created.'};
  }
  if(d.action==='bank_record'){
    const payment=await statement(env.DB,
      'SELECT id FROM payments WHERE id=?',d.paymentId).first();
    assert(payment,404,'PAYMENT_NOT_FOUND','Payment not found.');
    const prior=await statement(env.DB,
      'SELECT id,payment_id,requested_by,observed_amount_cents FROM bank_reconciliation_observations WHERE request_key=?',
      d.requestKey).first<{id:string;payment_id:string;requested_by:string;observed_amount_cents:number}>();
    if(prior){
      assert(prior.requested_by===user.id&&prior.payment_id===d.paymentId&&prior.observed_amount_cents===d.observedAmountCents,
        409,'BANK_REPLAY_CHANGED','This observation key is already used for another record.');
      return {ok:true,id:prior.id,replayed:true};
    }
    const observationId=uid('bro');
    await env.DB.batch([
      statement(env.DB,`INSERT INTO bank_reconciliation_observations
        (id,payment_id,observed_amount_cents,observation_type,source_reference,
          request_key,requested_by,created_at)
        VALUES(?,?,?,?,?,?,?,?)`,observationId,d.paymentId,d.observedAmountCents,
        d.observationType,d.sourceReference,d.requestKey,user.id,timestamp),
      statement(env.DB,`INSERT INTO audit_events
        (id,actor_id,action,entity_type,entity_id,metadata_json,created_at)
        VALUES(?,?,?,?,?,?,?)`,uid('aud'),user.id,'bank.observation_recorded','bank_reconciliation_observation',observationId,
        JSON.stringify({paymentId:d.paymentId,source:d.sourceReference,settled:false}),timestamp),
    ]);
    return {ok:true,id:observationId,status:'recorded',
      message:'Evidence observation recorded. Payment settlement has not changed.'};
  }
  const prior=await statement(env.DB,
    'SELECT id,requested_by,status FROM bank_reconciliation_observations WHERE id=?',
    d.observationId).first<{id:string;requested_by:string;status:string}>();
  assert(prior?.status==='recorded',409,'BANK_REVIEW_UNAVAILABLE','An unreviewed bank observation is required.');
  assert(prior.requested_by!==user.id,403,'INDEPENDENT_BANK_REVIEW','A separate operator must review bank evidence.');
  await env.DB.batch([
    statement(env.DB,`UPDATE bank_reconciliation_observations SET status=?,reviewed_by=?,reviewed_at=?
      WHERE id=? AND status='recorded'`,d.decision,user.id,timestamp,d.observationId),
    statement(env.DB,`INSERT INTO audit_events
      (id,actor_id,action,entity_type,entity_id,metadata_json,created_at)
      VALUES(?,?,?,?,?,?,?)`,uid('aud'),user.id,'bank.observation_reviewed','bank_reconciliation_observation',d.observationId,
      JSON.stringify({decision:d.decision,source:d.sourceReference,settled:false}),timestamp),
  ]);
  return {ok:true,id:d.observationId,status:d.decision,
    message:'Evidence review recorded; bank and provider settlement remain separately unverified.'};
}
