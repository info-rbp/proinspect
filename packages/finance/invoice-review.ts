import { csvRows } from './export.ts';

/** Review the financial observations already authorised for this workspace.
 * These are provider/accounting snapshots, not a bank feed or a tax invoice.
 * This module never updates balances, reconciles payouts or changes entitlements.
 */
export interface InvoiceReviewRow {
 stripe_invoice_id:string;
 client_id:string;
 currency:string;
 subtotal_cents:number;
 total_cents:number;
 paid_cents:number;
 remaining_cents:number;
 status:string;
 reconciliation:string;
 updated_at:string;
}
export interface InvoiceReviewFinding {
 invoiceId:string;
 flags:string[];
}
const cents=(value:unknown):value is number=>
 typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
export function inspectInvoiceObservation(row:InvoiceReviewRow):InvoiceReviewFinding {
 const flags:string[]=[];
 if(row.currency!=='AUD')flags.push('Unexpected invoice currency');
 const amounts=[row.subtotal_cents,row.total_cents,row.paid_cents,row.remaining_cents];
 if(!amounts.every(cents)){
  flags.push('Invalid integer-cent financial amount');
 }else{
  if(row.total_cents<row.subtotal_cents)flags.push('Total is below subtotal');
  if(row.paid_cents>row.total_cents)flags.push('Paid exceeds invoice total');
  if(row.remaining_cents>row.total_cents)flags.push('Remaining exceeds invoice total');
  // Voided and uncollectible invoices can legitimately have non-balancing
  // remaining amounts. Only classify paid/open states with known semantics.
  if(row.status==='paid'&&(row.paid_cents!==row.total_cents||row.remaining_cents!==0))
   flags.push('Paid invoice balances do not match');
  if(row.status==='open'&&row.paid_cents+row.remaining_cents!==row.total_cents)
   flags.push('Open invoice balance needs review');
 }
 if(row.reconciliation!=='matched')flags.push('Provider reconciliation not matched');
 if(row.status==='review')flags.push('Provider status requires investigation');
 return {invoiceId:row.stripe_invoice_id,flags};
}
export function invoiceObservationsCsv(rows:readonly InvoiceReviewRow[]):string {
 return csvRows([
  ['Invoice ID','Client ID','Currency','Subtotal cents','Total cents','Paid cents','Remaining cents','Status',
   'Reconciliation','Updated UTC','Review findings'],
  ...rows.map(row=>[
   row.stripe_invoice_id,row.client_id,row.currency,row.subtotal_cents,row.total_cents,row.paid_cents,
   row.remaining_cents,row.status,row.reconciliation,row.updated_at,
   inspectInvoiceObservation(row).flags.join('; '),
  ])
 ]);
}
