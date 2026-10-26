/** Pure projection of verified invoice events. Never derive authority or entitlement here. */
export interface InvoiceSnapshot {total_cents:number;paid_cents:number;remaining_cents:number;status:string;reconciliation:string;last_provider_created:number;}
export interface InvoiceProjection {apply:boolean;matched:boolean;needsReview:boolean;reason:string;status:string;paidCents:number;remainingCents:number;reconciliation:string;providerCreated:number;}
export function projectInvoiceObservation(prior:InvoiceSnapshot,type:string,o:Record<string,unknown>,created:number):InvoiceProjection {
 const keep=(reason:string,needsReview=false):InvoiceProjection=>({apply:false,matched:prior.reconciliation==='matched'&&!needsReview,needsReview,reason,status:prior.status,paidCents:prior.paid_cents,remainingCents:prior.remaining_cents,reconciliation:prior.reconciliation,providerCreated:prior.last_provider_created});
 if(!Number.isSafeInteger(created)||created<=0)return keep('invoice_event_time_unusable',true);
 const amount=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
 if(!amount(o.total)||o.total!==prior.total_cents||!amount(o.amount_paid)||!amount(o.amount_remaining)||o.amount_paid>o.total||o.amount_remaining>o.total)return keep('invoice_amount_requires_review',true);
 const paid=type==='invoice.paid'&&o.status==='paid'&&o.paid===true&&o.amount_paid===o.total&&o.amount_remaining===0;
 const voided=type==='invoice.voided'&&o.status==='void'&&o.amount_paid===0&&o.amount_remaining===0;
 const badDebt=type==='invoice.marked_uncollectible'&&o.status==='uncollectible';
 if(!paid&&!voided&&o.amount_paid+o.amount_remaining!==o.total)return keep('invoice_balance_requires_review',true);
 // An older event is audit evidence, never permission to rewrite a newer financial observation.
 if(created<prior.last_provider_created)return keep('invoice_older_observation_retained');
 if(prior.status==='paid')return paid?keep('invoice_settlement_already_matched'):keep('settled_invoice_not_downgraded',created>prior.last_provider_created);
 if(prior.status==='void')return voided?keep('invoice_void_already_observed'):keep('void_invoice_transition_requires_review',true);
 if(o.amount_paid<prior.paid_cents)return keep('invoice_payment_regression',true);
 // Stripe event timestamps have second precision, not a total ordering. A same-second
 // nonterminal change is ambiguous; retain the snapshot for independent reconciliation.
 if(created===prior.last_provider_created&&!paid){
  const same=o.amount_paid===prior.paid_cents&&o.amount_remaining===prior.remaining_cents&&o.status===prior.status;
  return keep(same?'invoice_snapshot_already_observed':'invoice_same_second_conflict',!same);
 }
 if(!paid&&!voided&&!badDebt&&o.status!=='open'&&o.status!=='draft')return keep('invoice_state_requires_review',true);
 const status=paid?'paid':voided?'void':badDebt?'uncollectible':String(o.status);
 return {apply:true,matched:paid,needsReview:false,reason:paid?'approved_statement_settled':'provider_state_observed',status,paidCents:o.amount_paid,remainingCents:o.amount_remaining,reconciliation:paid?'matched':'exception',providerCreated:created};
}
