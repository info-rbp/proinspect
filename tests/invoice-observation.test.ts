import test from 'node:test';
import assert from 'node:assert/strict';
import {projectInvoiceObservation as project,type InvoiceSnapshot} from '../packages/finance/invoice-observation.ts';
const initial:InvoiceSnapshot={total_cents:11000,paid_cents:0,remaining_cents:11000,status:'open',reconciliation:'exception',last_provider_created:100};
const paid={total:11000,amount_paid:11000,amount_remaining:0,status:'paid',paid:true};
const open={total:11000,amount_paid:0,amount_remaining:11000,status:'open',paid:false};
test('exact signed settlement can close an open invoice even within the same second',()=>{
 const d=project(initial,'invoice.paid',paid,100);assert.equal(d.apply,true);assert.equal(d.matched,true);assert.equal(d.remainingCents,0);
});
test('a paid invoice cannot become unpaid or lose its matched financial snapshot',()=>{
 const p={...initial,status:'paid',reconciliation:'matched',paid_cents:11000,remaining_cents:0,last_provider_created:200};
 for(const t of [100,200,300]){const d=project(p,'invoice.payment_failed',open,t);assert.equal(d.apply,false);assert.equal(d.status,'paid');assert.equal(d.remainingCents,0);assert.equal(d.reconciliation,'matched');}
 assert.equal(project(p,'invoice.payment_failed',open,300).needsReview,true);
});
test('invalid balances and unapproved amounts are retained as exceptions without corrupting totals',()=>{
 for(const o of [{...paid,total:12000},{...open,amount_paid:-1},{...open,amount_paid:1000},{...open,amount_paid:11001,amount_remaining:0},{...open,amount_paid:NaN}]){
 const d=project(initial,'invoice.updated',o,201);assert.equal(d.apply,false);assert.equal(d.needsReview,true);assert.equal(d.paidCents,0);}
});
test('ambiguous same-second changes require reconciliation rather than last-arrival ordering',()=>{
 const d=project(initial,'invoice.updated',{...open,amount_paid:1000,amount_remaining:10000},100);assert.equal(d.apply,false);assert.equal(d.reason,'invoice_same_second_conflict');
});
test('partial payments update a coherent balance but never assert full settlement',()=>{
 const d=project(initial,'invoice.updated',{...open,amount_paid:1000,amount_remaining:10000},101);assert.equal(d.apply,true);assert.equal(d.matched,false);assert.equal(d.paidCents+d.remainingCents,11000);
});
test('a void invoice cannot silently reappear as paid',()=>{
 const d=project({...initial,status:'void',remaining_cents:0},'invoice.paid',paid,201);assert.equal(d.apply,false);assert.equal(d.needsReview,true);
});
test('older events and malformed event times do not rewrite current snapshots',()=>{
 assert.equal(project(initial,'invoice.paid',paid,99).apply,false);
 assert.equal(project(initial,'invoice.paid',paid,NaN).needsReview,true);
});
test('a new partial observation cannot decrease previously recorded paid amount',()=>{
 const d=project({...initial,paid_cents:1000,remaining_cents:10000},'invoice.updated',open,101);assert.equal(d.apply,false);assert.equal(d.reason,'invoice_payment_regression');
});
