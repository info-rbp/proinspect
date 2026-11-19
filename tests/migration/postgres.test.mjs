import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { reserve, reschedule, providerEvent, transaction } from './transactions.mjs';
const url = new URL(process.env.SPIKE_DATABASE_URL || '');
if (!['127.0.0.1','localhost'].includes(url.hostname) || !url.pathname.startsWith('/proinspect_spike')) throw Error('Only a disposable local spike database is allowed');
const pool = new pg.Pool({ connectionString: url.href, max: 12 });
const input = (key='one', start='2030-01-01T01:00Z', end='2030-01-01T02:00Z') => ({ client:'synthetic-client',user:'synthetic-user',key,fingerprint:'a',envelope:'opaque-synthetic-envelope',start,end });
before(async () => { await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8')); });
beforeEach(async () => { await pool.query('TRUNCATE bookings, reservations, work_orders, payments, audit_events, outbox, webhook_receipts, payment_events, invoice_credit_proposals CASCADE'); });
after(() => pool.end());
test('20 concurrent competing bookings commit exactly one complete aggregate',async()=>{
 const results=await Promise.allSettled(Array.from({length:20},(_,i)=>reserve(pool,input(String(i)))));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 for(const t of ['bookings','reservations','work_orders','payments','audit_events','outbox']) assert.equal((await pool.query(`SELECT count(*) FROM ${t}`)).rows[0].count,'1');
});
test('concurrent identical retries return one booking; changed user or fingerprint is rejected',async()=>{
 const r=await Promise.all(Array.from({length:12},()=>reserve(pool,input()))); assert.equal(new Set(r.map(x=>x.id)).size,1);
 await assert.rejects(reserve(pool,{...input(),user:'another'}),/IDEMPOTENCY_MISMATCH/);
 await assert.rejects(reserve(pool,{...input(),fingerprint:'changed'}),/IDEMPOTENCY_MISMATCH/);
});
test('half-open buffered slots permit adjacency but reject overlap and blocks',async()=>{
 await reserve(pool,input());
 await reserve(pool,input('adjacent','2030-01-01T02:00Z','2030-01-01T03:00Z'));
 await pool.query("INSERT INTO reservations VALUES('block','default',NULL,tstzrange('2030-01-01T04:00Z','2030-01-01T05:00Z','[)'))");
 await assert.rejects(reserve(pool,input('blocked','2030-01-01T04:30Z','2030-01-01T05:30Z')),e=>e.code==='23P01');
 await assert.rejects(pool.query("INSERT INTO reservations VALUES('collision','default',NULL,tstzrange('2030-01-01T01:30Z','2030-01-01T02:00Z','[)'))"),e=>e.code==='23P01');
});
test('late booking failure rolls back payment, secrets envelope, audit and outbox',async()=>{
 await assert.rejects(reserve(pool,{...input(),fail:true}),/INJECTED/);
 for(const t of ['bookings','work_orders','payments','audit_events','outbox']) assert.equal((await pool.query(`SELECT count(*) FROM ${t}`)).rows[0].count,'0');
});
test('optimistic version conflict has no side effects and reschedule collision rolls back',async()=>{
 const a=await reserve(pool,input()); await reserve(pool,input('two','2030-01-01T03:00Z','2030-01-01T04:00Z'));
 await assert.rejects(reschedule(pool,a.id,2,'2030-01-01T05:00Z','2030-01-01T06:00Z'),/VERSION_CONFLICT/);
 await assert.rejects(reschedule(pool,a.id,1,'2030-01-01T03:00Z','2030-01-01T04:00Z'),e=>e.code==='23P01');
 assert.equal((await pool.query('SELECT version FROM bookings WHERE id=$1',[a.id])).rows[0].version,1);
 await reschedule(pool,a.id,1,'2030-01-01T05:00Z','2030-01-01T06:00Z');
});
test('cancel releases capacity atomically',async()=>{
 const a=await reserve(pool,input());
 await transaction(pool,async c=>{await c.query("UPDATE bookings SET status='cancelled' WHERE id=$1",[a.id]);await c.query('DELETE FROM reservations WHERE booking_id=$1',[a.id]);});
 await reserve(pool,input('new'));
});
test('concurrent webhook deliveries commit receipt and financial effect once',async()=>{
 const a=await reserve(pool,input()); const event={id:'evt_test',hash:'payload',payment:a.id};
 const r=await Promise.all(Array.from({length:15},()=>providerEvent(pool,event)));
 assert.equal(r.filter(x=>!x.replayed).length,1);
 assert.equal((await pool.query('SELECT count(*) FROM payment_events')).rows[0].count,'1');
 assert.equal((await pool.query('SELECT status FROM work_orders')).rows[0].status,'scheduled');
 await assert.rejects(providerEvent(pool,{...event,hash:'tampered'}),/EVENT_REPLAY_MISMATCH/);
});
test('webhook failure rolls back receipt and settlement so retry can succeed',async()=>{
 const a=await reserve(pool,input());const event={id:'evt_failure',hash:'payload',payment:a.id};
 await assert.rejects(providerEvent(pool,{...event,fail:true}),/INJECTED/);
 assert.equal((await pool.query('SELECT count(*) FROM webhook_receipts')).rows[0].count,'0');
 assert.equal((await pool.query('SELECT status FROM payments')).rows[0].status,'payment_required');
 await providerEvent(pool,event);
});
test('wrong amount/currency and overrefund are rejected; out-of-order refunds never decrease',async()=>{
 const a=await reserve(pool,input());const base={id:'evt_paid',hash:'p',payment:a.id};
 await assert.rejects(providerEvent(pool,{...base,amount:1}),/PAYMENT_AMOUNT/);
 await assert.rejects(providerEvent(pool,{...base,currency:'USD'}),/PAYMENT_AMOUNT/);
 await providerEvent(pool,base);
 await Promise.all([8000,4000,7000].map((refund,i)=>providerEvent(pool,{...base,id:'evt_refund'+i,refund})));
 assert.equal((await pool.query('SELECT refunded_cents FROM payments')).rows[0].refunded_cents,'8000');
 await assert.rejects(providerEvent(pool,{...base,id:'evt_over',refund:11001}),/REFUND_AMOUNT/);
 await providerEvent(pool,{...base,id:'evt_full',refund:11000});
 await providerEvent(pool,{...base,id:'evt_late_paid'});
 assert.equal((await pool.query('SELECT status FROM payments')).rows[0].status,'refunded');
});
test('0062 credit-review separation and immutable terminal decision survive PostgreSQL conversion',async()=>{
 await pool.query("INSERT INTO invoice_credit_proposals(id,requested_by) VALUES('credit','maker')");
 await assert.rejects(pool.query("UPDATE invoice_credit_proposals SET status='approved',reviewed_by='maker',reviewed_at=now()"),/FINANCE_SELF_REVIEW_DENIED/);
 await pool.query("UPDATE invoice_credit_proposals SET status='approved',reviewed_by='checker',reviewed_at=now()");
 await assert.rejects(pool.query("UPDATE invoice_credit_proposals SET status='requested'"),/CREDIT_PROPOSAL_IMMUTABLE/);
});
