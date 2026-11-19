import { randomUUID } from 'node:crypto';
export async function transaction(pool, fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; }
  catch (error) { await c.query('ROLLBACK'); throw error; }
  finally { c.release(); }
}
export async function reserve(pool, input) {
  return transaction(pool, async c => {
    // Scope matches current client/request-key + user/fingerprint replay contract.
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([input.client, input.key])]);
    const prior = (await c.query('SELECT * FROM bookings WHERE client_id=$1 AND request_key=$2', [input.client,input.key])).rows[0];
    if (prior) {
      if (prior.fingerprint !== input.fingerprint || prior.user_id !== input.user) throw Error('IDEMPOTENCY_MISMATCH');
      return { id: prior.id, replayed: true };
    }
    await c.query('SELECT id FROM resources WHERE id=$1 FOR UPDATE', ['default']);
    const id = randomUUID();
    await c.query('INSERT INTO bookings(id,client_id,user_id,request_key,fingerprint,envelope) VALUES($1,$2,$3,$4,$5,$6)', [id,input.client,input.user,input.key,input.fingerprint,input.envelope]);
    await c.query("INSERT INTO reservations VALUES($1,'default',$1,tstzrange($2,$3,'[)'))", [id,input.start,input.end]);
    await c.query("INSERT INTO work_orders VALUES($1,$1,'awaiting_approval')", [id]);
    await c.query("INSERT INTO payments(id,work_order_id,amount_ex_gst_cents,gst_cents,total_cents,currency) VALUES($1,$1,10000,1000,11000,'AUD')", [id]);
    await c.query("INSERT INTO audit_events(booking_id,action) VALUES($1,'booking.created')", [id]);
    await c.query("INSERT INTO outbox(booking_id,event) VALUES($1,'booking.confirmed')", [id]);
    if (input.fail) throw Error('INJECTED_FAILURE');
    return { id, replayed: false };
  });
}
export async function reschedule(pool, id, expectedVersion, start, end) {
  return transaction(pool, async c => {
    await c.query("SELECT id FROM resources WHERE id='default' FOR UPDATE");
    const changed = await c.query('UPDATE bookings SET version=version+1 WHERE id=$1 AND version=$2', [id,expectedVersion]);
    if (changed.rowCount !== 1) throw Error('VERSION_CONFLICT'); // replaces changes()/mutation_guards
    await c.query("UPDATE reservations SET period=tstzrange($2,$3,'[)') WHERE booking_id=$1", [id,start,end]);
    await c.query("INSERT INTO audit_events(booking_id,action) VALUES($1,'booking.changed')", [id]);
  });
}
export async function providerEvent(pool, { id, hash, payment, amount=11000, currency='AUD', refund, fail }) {
  return transaction(pool, async c => {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['stripe:'+id]);
    const receipt = (await c.query("SELECT * FROM webhook_receipts WHERE provider='stripe' AND event_id=$1",[id])).rows[0];
    if (receipt) { if (receipt.payload_hash !== hash) throw Error('EVENT_REPLAY_MISMATCH'); return { replayed: true }; }
    const p = (await c.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[payment])).rows[0];
    if (!p || BigInt(p.total_cents)!==BigInt(amount) || p.currency!==currency) throw Error('PAYMENT_AMOUNT_MISMATCH');
    await c.query("INSERT INTO webhook_receipts VALUES('stripe',$1,$2)",[id,hash]);
    if (refund === undefined) {
      await c.query("UPDATE payments SET status='paid',version=version+1 WHERE id=$1 AND status IN ('payment_required','failed')",[payment]);
      await c.query("UPDATE work_orders SET status='scheduled' WHERE id=$1 AND status='awaiting_approval'",[p.work_order_id]);
    } else {
      if (!Number.isSafeInteger(refund) || refund<0 || refund>amount || !['paid','refunded'].includes(p.status)) throw Error('REFUND_AMOUNT_MISMATCH');
      await c.query("UPDATE payments SET refunded_cents=GREATEST(refunded_cents,$2),status=CASE WHEN GREATEST(refunded_cents,$2)=total_cents THEN 'refunded' ELSE status END WHERE id=$1",[payment,refund]);
    }
    await c.query('INSERT INTO payment_events(payment_id,event_id) VALUES($1,$2)',[payment,id]);
    if (fail) throw Error('INJECTED_FAILURE');
    return { replayed: false };
  });
}
