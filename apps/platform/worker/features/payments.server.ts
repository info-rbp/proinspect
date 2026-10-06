import { z } from 'zod';
import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import {
  booksServices,
  clientMembership,
  operationsWrite,
} from '../../../../packages/authorization/server';
import { paymentAccess, verifyHmac } from './finance.server';
import {
  guard,
  clearGuard,
  activity,
  projection,
  reference,
} from '../../../../packages/operations/core';
import { digest } from '../../../../packages/auth/crypto';

export async function checkout(env: Env, user: Principal, w: Workspace, id: string) {
  const p = await paymentAccess(env, user, w, id);
  assert(
    booksServices(w),
    403,
    'CUSTOMER_REQUIRED',
    'Use the commissioning customer account to pay.',
  );
  await clientMembership(env, user, w.scopeId, true);
  assert(
    ['payment_required', 'failed'].includes(p.status),
    409,
    'PAYMENT_CLOSED',
    'This payment is closed or is awaiting a provider result.',
  );
  assert(
    env.STRIPE_SECRET_KEY,
    503,
    'PAYMENT_PROVIDER_UNCONFIGURED',
    'Online payment is not configured. Manual reconciliation remains available.',
  );
  assert(
    env.APP_ENV === 'production' || env.STRIPE_SECRET_KEY.startsWith('sk_test_'),
    503,
    'TEST_KEY_REQUIRED',
    'Only test-mode credentials are accepted outside production.',
  );
  if (p.checkout_url) {
    assert(
      !p.checkout_expires_at || p.checkout_expires_at > now(),
      409,
      'CHECKOUT_RECONCILIATION_REQUIRED',
      'This checkout has expired. Await the verified provider outcome before retrying a payment.',
    );
    return { url: p.checkout_url };
  }
  const body = new URLSearchParams({
    mode: 'payment',
    success_url: `${env.APP_ORIGIN}${w.href}/finance?checkout=returned`,
    cancel_url: `${env.APP_ORIGIN}${w.href}/finance`,
    'line_items[0][price_data][currency]': 'aud',
    'line_items[0][price_data][unit_amount]': String(p.total_cents),
    'line_items[0][price_data][product_data][name]': p.description,
    'line_items[0][quantity]': '1',
    'metadata[payment_id]': id,
    'metadata[client_id]': p.client_id,
    client_reference_id: id,
  });
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `proinspect-payment-${id}-${p.version}`,
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  assert(
    response.ok,
    502,
    'PAYMENT_PROVIDER_ERROR',
    'Checkout could not be opened. No payment has been marked paid.',
  );
  const s = z
    .object({
      id: z.string().regex(/^cs_[A-Za-z0-9_]+$/),
      url: z.string().url(),
      expires_at: z.number().int().positive(),
    })
    .parse(await response.json());
  assert(
    new URL(s.url).origin === 'https://checkout.stripe.com' && s.expires_at * 1000 > Date.now(),
    502,
    'CHECKOUT_INVALID',
    'Invalid checkout response.',
  );
  const time = now(),
    expiry = new Date(s.expires_at * 1000).toISOString();
  await env.DB.batch([
    statement(
      env.DB,
      "UPDATE payments SET provider='stripe',checkout_session_id=?,checkout_url=?,checkout_expires_at=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status IN('payment_required','failed')",
      s.id,
      s.url,
      expiry,
      time,
      id,
      p.version,
    ),
    guard(env),
    statement(
      env.DB,
      "INSERT INTO payment_checkout_attempts(session_id,payment_id,status,amount_cents,currency,expires_at,created_at,updated_at) VALUES(?,?,'open',?,'AUD',?,?,?)",
      s.id,
      id,
      p.total_cents,
      expiry,
      time,
      time,
    ),
    activity(env, user, 'payment.checkout_opened', 'payment', id, p.property_id),
    clearGuard(env),
  ]);
  return { url: s.url };
}
const eventSchema = z.object({
  id: z.string().min(1).max(255),
  type: z.string(),
  livemode: z.boolean(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});
const relevant = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
]);
export async function stripeWebhook(env: Env, request: Request) {
  assert(
    env.STRIPE_WEBHOOK_SECRET,
    503,
    'WEBHOOK_UNCONFIGURED',
    'Payment webhook is not configured.',
  );
  const raw = await request.text();
  assert(raw.length <= 65536, 413, 'PAYLOAD_TOO_LARGE', 'Payload exceeds the limit.');
  const parts = (request.headers.get('stripe-signature') ?? '').split(',').map((x) => x.trim()),
    times = parts.filter((x) => x.startsWith('t='));
  assert(times.length === 1, 400, 'SIGNATURE_INVALID', 'Invalid webhook signature.');
  const t = Number(times[0].slice(2));
  assert(
    Number.isInteger(t) && Math.abs(Date.now() / 1000 - t) <= 300,
    400,
    'SIGNATURE_EXPIRED',
    'Invalid webhook timestamp.',
  );
  let valid = false;
  for (const s of parts.filter((x) => x.startsWith('v1=')))
    if (await verifyHmac(env.STRIPE_WEBHOOK_SECRET, `${t}.${raw}`, s.slice(3))) valid = true;
  assert(valid, 400, 'SIGNATURE_INVALID', 'Invalid webhook signature.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    assert(false, 400, 'EVENT_INVALID', 'Invalid webhook JSON.');
  }
  const event = eventSchema.parse(parsed);
  assert(
    env.APP_ENV === 'production' || !event.livemode,
    400,
    'LIVE_EVENT_BLOCKED',
    'Live events are blocked in this environment.',
  );
  if (!relevant.has(event.type)) return { received: true, ignored: true };
  const hash = await digest(raw),
    prior = await statement(
      env.DB,
      "SELECT payload_hash FROM webhook_receipts WHERE provider='stripe' AND event_id=?",
      event.id,
    ).first<{ payload_hash: string }>();
  if (prior) {
    assert(
      prior.payload_hash === hash,
      409,
      'EVENT_REPLAY_MISMATCH',
      'Event content differs from the accepted receipt.',
    );
    return { received: true, replayed: true };
  }
  const s = event.data.object as Record<string, any>;
  assert(
    s.mode === 'payment' && typeof s.id === 'string',
    422,
    'EVENT_INVALID',
    'Invalid checkout event.',
  );
  const p = await statement(
    env.DB,
    'SELECT * FROM payments WHERE id=?',
    String(s.metadata?.payment_id ?? ''),
  ).first<Record<string, any>>();
  const attempt = await statement(
    env.DB,
    'SELECT * FROM payment_checkout_attempts WHERE session_id=?',
    s.id,
  ).first<Record<string, any>>();
  assert(
    p &&
      attempt &&
      attempt.payment_id === p.id &&
      p.provider === 'stripe' &&
      p.client_id === s.metadata?.client_id &&
      p.total_cents === s.amount_total &&
      attempt.amount_cents === s.amount_total &&
      s.currency === 'aud',
    409,
    'PAYMENT_MISMATCH',
    'Payment event does not match a recorded checkout.',
  );
  const settled =
    s.payment_status === 'paid' ||
    (p.total_cents === 0 && s.payment_status === 'no_payment_required');
  let nextAttempt: string;
  if (event.type === 'checkout.session.async_payment_succeeded') {
    assert(settled, 422, 'EVENT_INVALID', 'A successful event must confirm settlement.');
    nextAttempt = 'paid';
  } else if (event.type === 'checkout.session.completed')
    nextAttempt = settled ? 'paid' : 'processing';
  else {
    assert(!settled, 422, 'EVENT_INVALID', 'An expiry or failure cannot declare a paid session.');
    nextAttempt = event.type.endsWith('.expired') ? 'expired' : 'failed';
  }
  // Late expiry/failure must never undo a settlement; late unpaid completion cannot reopen a closed attempt.
  if (
    attempt.status === 'paid' ||
    (['failed', 'expired'].includes(attempt.status) && nextAttempt === 'processing')
  )
    nextAttempt = attempt.status;
  const isCurrent = p.checkout_session_id === s.id;
  let status = p.status,
    reconciliation: string | null = null;
  if (nextAttempt === 'paid') {
    if (p.status === 'refunded' || p.status === 'waived')
      reconciliation = 'SETTLEMENT_AFTER_ADJUSTMENT';
    else if (p.status === 'paid' && p.external_reference !== s.id)
      reconciliation = 'MULTIPLE_SESSIONS_PAID';
    else {
      status = 'paid';
      if (!isCurrent) reconciliation = 'SUPERSEDED_SESSION_PAID';
    }
  } else if (isCurrent && !['paid', 'refunded', 'waived'].includes(p.status)) {
    status =
      nextAttempt === 'processing'
        ? 'pending'
        : nextAttempt === 'failed'
          ? 'failed'
          : nextAttempt === 'expired'
            ? 'payment_required'
            : p.status;
  }
  const time = now(),
    commands = [
      statement(
        env.DB,
        "INSERT INTO webhook_receipts(provider,event_id,payload_hash,created_at) VALUES('stripe',?,?,?)",
        event.id,
        hash,
        time,
      ),
      statement(
        env.DB,
        'UPDATE payment_checkout_attempts SET status=?,updated_at=? WHERE session_id=?',
        nextAttempt,
        time,
        s.id,
      ),
    ];
  const closedAttempt =
    isCurrent &&
    ['failed', 'expired'].includes(nextAttempt) &&
    !['paid', 'refunded', 'waived'].includes(p.status);
  if (status !== p.status || closedAttempt) {
    commands.push(
      statement(
        env.DB,
        'UPDATE payments SET status=?,checkout_url=CASE WHEN ?=1 THEN NULL ELSE checkout_url END,external_reference=CASE WHEN ?=1 THEN ? ELSE external_reference END,version=version+1,updated_at=? WHERE id=? AND version=?',
        status,
        Number(closedAttempt),
        Number(status === 'paid'),
        s.id,
        time,
        p.id,
        p.version,
      ),
      guard(env),
    );
    commands.push(
      statement(
        env.DB,
        'INSERT INTO payment_events(id,payment_id,from_status,to_status,reference,created_at) VALUES(?,?,?,?,?,?)',
        uid('pe'),
        p.id,
        p.status,
        status,
        event.id,
        time,
      ),
      projection(env, 'payment.updated', p.id, { status, workOrderId: p.work_order_id }),
    );
    commands.push(
      statement(
        env.DB,
        "INSERT OR IGNORE INTO notifications(id,user_id,title,message,href,created_at) SELECT 'ntf_payment_'||?||'_'||m.user_id,m.user_id,'Payment status updated','Open your account to review the recorded payment outcome.','/workspaces',? FROM client_memberships m WHERE m.client_id=? AND m.active=1 AND m.role IN('owner','admin')",
        event.id,
        time,
        p.client_id,
      ),
    );
    commands.push(clearGuard(env));
  }
  if (reconciliation)
    commands.push(
      statement(
        env.DB,
        'INSERT INTO payment_reconciliation_items(id,payment_id,event_id,code,created_at) VALUES(?,?,?,?,?)',
        uid('rec'),
        p.id,
        event.id,
        reconciliation,
        time,
      ),
    );
  await env.DB.batch(commands);
  return {
    received: true,
    ...(reconciliation ? { reviewRequired: true } : {}),
    ...(!settled && event.type === 'checkout.session.completed' ? { unpaid: true } : {}),
  };
}
export async function reconciliationData(env: Env, user: Principal, w: Workspace) {
  assert(w.kind === 'staff', 403, 'STAFF_REQUIRED', 'Reconciliation is restricted to Staff.');
  operationsWrite(user);
  return {
    items: (
      await statement(
        env.DB,
        "SELECT r.*,p.description,p.total_cents,p.client_id FROM payment_reconciliation_items r JOIN payments p ON p.id=r.payment_id WHERE r.status='open' ORDER BY r.created_at LIMIT 100",
      ).all()
    ).results,
  };
}
export async function resolveReconciliation(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  await reconciliationData(env, user, w);
  const d = z.object({ reference }).parse(input);
  await env.DB.batch([
    statement(
      env.DB,
      "UPDATE payment_reconciliation_items SET status='resolved',reference=?,resolved_by=?,resolved_at=? WHERE id=? AND status='open'",
      d.reference,
      user.id,
      now(),
      id,
    ),
    guard(env),
    activity(env, user, 'payment.reconciliation_recorded', 'reconciliation', id, null, null, {
      reference: d.reference,
    }),
    clearGuard(env),
  ]);
  return { id, status: 'resolved' };
}
