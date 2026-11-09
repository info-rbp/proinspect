/** Staff operational signals from authorised aggregate counts only.
 * These projections contain no recipient, tenancy, document, event payload,
 * Stripe object or provider credential values.
 */
export type OperationalSignalState='clear'|'attention'|'blocked'|'not_available';
export interface OperationalSignal {
 code:string;
 label:string;
 state:OperationalSignalState;
 count:number|null;
 note:string;
}
export interface OperationalMetric {
 code:string;
 label:string;
 count:number|null;
 enabled:boolean;
 unavailable?:boolean;
}
const DEFINITIONS:Readonly<Record<string,{label:string,note:string}>>={
 mail_failed:{label:'Failed email events',note:'Review delivery error codes and recipient authority before retrying.'},
 mail_pending:{label:'Pending email events',note:'A queue backlog alone is not evidence of failed delivery.'},
 projections_failed:{label:'Failed external projections',note:'Reconcile signed external acknowledgements before replay.'},
 calendar_attention:{label:'Calendar synchronisation exceptions',note:'ProInspect bookings remain authoritative; validate conflicts before retry.'},
 scanner_exhausted:{label:'Document scanner attempts exhausted',note:'Quarantined documents must remain inaccessible until signed scanner verdict and independent review.'},
 payment_open:{label:'Open payment reconciliation items',note:'Do not mark funds received without provider and bank evidence.'},
 invoices_review:{label:'Invoice delivery requires reconciliation',note:'An accepted provider request does not establish customer inbox delivery.'},
};
export function projectOperationalSignals(metrics:readonly OperationalMetric[]):OperationalSignal[]{
 return metrics.map(metric=>{
  const def=DEFINITIONS[metric.code];
  if(!def)throw new Error('Unrecognised operational metric');
  const missing=metric.unavailable===true||metric.count===null;
  const needsAttention=metric.code!=='mail_pending'&&Number(metric.count)>0;
  return {code:metric.code,label:def.label,count:missing?null:metric.count,
   state:missing?'not_available':needsAttention?(metric.enabled?'attention':'blocked'):'clear',
   note:missing?'Database schema not available; verify migration before activation.':def.note};
 });
}
