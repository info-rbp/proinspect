import type {Env} from '../../../../packages/database/types';
import {statement} from '../../../../packages/database/types';
import {projectOperationalSignals,type OperationalMetric} from '../../../../packages/operations/operational-health';

/** Administrator-only, read-only aggregate health. No event payloads,
 * personal identifiers, external provider credentials or bank records leave D1.
 * Missing optional migrations are reported, never assumed deployed.
 */
export async function operationalHealth(env:Env){
 const available=new Set((await statement(env.DB,
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('outbox_events','integration_deliveries','booking_calendar_sync','rental_document_scan_jobs','payment_reconciliation_items','billing_invoice_dispatches')")
  .all<{name:string}>()).results.map(x=>x.name));
 const definitions=[
  {code:'mail_failed',label:'Failed email events',table:'outbox_events',
   sql:"SELECT COUNT(*) AS count FROM outbox_events WHERE status='failed'",enabled:env.EMAIL_PROVIDER==='resend'},
  {code:'mail_pending',label:'Pending email events',table:'outbox_events',
   sql:"SELECT COUNT(*) AS count FROM outbox_events WHERE status IN('pending','processing')",enabled:env.EMAIL_PROVIDER==='resend'},
  {code:'projections_failed',label:'Failed external projections',table:'integration_deliveries',
   sql:"SELECT COUNT(*) AS count FROM integration_deliveries WHERE status='failed'",enabled:!!env.SHEETS_WEBHOOK_URL&&!!env.SHEETS_WEBHOOK_SECRET},
  {code:'calendar_attention',label:'Calendar synchronisation exceptions',table:'booking_calendar_sync',
   sql:"SELECT COUNT(*) AS count FROM booking_calendar_sync WHERE status='attention'",enabled:env.GOOGLE_CALENDAR_ENABLED==='true'&&env.GOOGLE_CALENDAR_BOOKINGS_ENABLED==='true'},
  {code:'scanner_exhausted',label:'Document scanner attempts exhausted',table:'rental_document_scan_jobs',
   sql:"SELECT COUNT(*) AS count FROM rental_document_scan_jobs WHERE completed_at IS NULL AND attempts>=8",enabled:env.RENTAL_SCANNER_ENABLED==='true'},
  {code:'payment_open',label:'Open payment reconciliation items',table:'payment_reconciliation_items',
   sql:"SELECT COUNT(*) AS count FROM payment_reconciliation_items WHERE status='open'",enabled:env.PAYMENT_RECONCILIATION_ENABLED==='true'},
  {code:'invoices_review',label:'Invoice delivery requires reconciliation',table:'billing_invoice_dispatches',
   sql:"SELECT COUNT(*) AS count FROM billing_invoice_dispatches WHERE status='needs_reconciliation'",enabled:env.STRIPE_INVOICING_ENABLED==='true'}
 ] as const;
 const counts:OperationalMetric[]=await Promise.all(definitions.map(async item=>{
  if(!available.has(item.table))return {code:item.code,label:item.label,count:null,enabled:item.enabled,unavailable:true};
  const row=await statement(env.DB,item.sql).first<{count:number}>();
  return {code:item.code,label:item.label,count:row?.count??0,enabled:item.enabled};
 }));
 const signals=projectOperationalSignals(counts);
 return {basis:'read_only_aggregates',source:env.BUILD_SHA??null,generatedAt:new Date().toISOString(),
  signals,scope:'operator_only',caveat:'Counts describe D1 operational records, not provider delivery, bank settlement, restored backups or release acceptance.'};
}
