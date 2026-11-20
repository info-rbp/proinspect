import test from 'node:test';
import assert from 'node:assert/strict';
import {
 inspectInvoiceObservation,invoiceObservationsCsv,type InvoiceReviewRow,
} from '../packages/finance/invoice-review.ts';
const sample=():InvoiceReviewRow=>({
 stripe_invoice_id:'in_visible_test',client_id:'cli_test',currency:'AUD',
 subtotal_cents:10000,total_cents:11000,paid_cents:0,remaining_cents:11000,
 status:'open',reconciliation:'matched',updated_at:'2026-11-08T00:00:00.000Z',
});
test('valid open/paid/voided invoice snapshots are not automatically treated as bank issues',()=>{
 const open=sample();
 assert.deepEqual(inspectInvoiceObservation(open).flags,[]);
 assert.deepEqual(inspectInvoiceObservation({...open,status:'paid',paid_cents:11000,remaining_cents:0}).flags,[]);
 assert.deepEqual(inspectInvoiceObservation({...open,status:'void',remaining_cents:0}).flags,[]);
});
test('invoice exception review highlights unbalanced and unreconciled observations without writing data',()=>{
 const open=sample();
 const unpaid={...open,status:'open',remaining_cents:4000,reconciliation:'exception'};
 const flagged=inspectInvoiceObservation(unpaid);
 assert.ok(flagged.flags.includes('Open invoice balance needs review'));
 assert.ok(flagged.flags.includes('Provider reconciliation not matched'));
 assert.deepEqual(open,sample(),'pure read-only review cannot mutate an invoice');
 assert.ok(inspectInvoiceObservation({...open,status:'paid'}).flags.includes('Paid invoice balances do not match'));
 assert.ok(inspectInvoiceObservation({...open,currency:'USD'}).flags.includes('Unexpected invoice currency'));
 assert.ok(inspectInvoiceObservation({...open,paid_cents:11001}).flags.includes('Paid exceeds invoice total'));
 assert.ok(inspectInvoiceObservation({...open,total_cents:1000}).flags.includes('Total is below subtotal'));
});
test('CSV invoice previews escape spreadsheet formulas and retain exact AUD cents',()=>{
 const csv=invoiceObservationsCsv([sample(),{...sample(),
  stripe_invoice_id:'=HYPERLINK("https://example.test","bad")',
  client_id:'@dynamic',remaining_cents:3500,reconciliation:'exception'}]);
 assert.match(csv,/"Invoice ID","Client ID","Currency"/);
 assert.match(csv,/"'=HYPERLINK\(""https:\/\/example.test"",""bad""\)"/);
 assert.match(csv,/"'@dynamic"/);
 assert.match(csv,/11000,0,11000/);
 assert.match(csv,/Provider reconciliation not matched/);
 assert.throws(()=>invoiceObservationsCsv([{...sample(),total_cents:55.1}]),/exact integers/);
});
