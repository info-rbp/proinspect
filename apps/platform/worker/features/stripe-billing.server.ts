import { assert, statement, uid, now, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { clientAdmin, propertyAccess } from '../../../../packages/authorization/server';
import { digest } from '../../../../packages/auth/crypto';

/** Sandbox-only implementation. Do not reuse this allowlist as a live billing switch. */
const SANDBOX = 'acct_1USumhEv62nbUZok';
export const RESIDENTIAL = 'price_1UUOxKEv62nbUZoksUBo5igf';
export const COMMERCIAL = 'price_1UUOxMEv62nbUZokN7kLvP4B';
const BILLING_TYPES = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

export function billingReady(env: Env, feature: 'subscription' | 'guest' = 'subscription') {
  assert(env.APP_ENV === 'staging' || env.APP_ENV === 'local', 503, 'SANDBOX_ONLY', 'Sandbox Billing is not available in production.');
  assert((feature === 'guest' ? env.STRIPE_GUEST_CHECKOUT_ENABLED : env.STRIPE_BILLING_ENABLED) === 'true', 503, 'BILLING_DISABLED', 'Sandbox payment collection is not enabled.');
  assert(env.STRIPE_ACCOUNT_ID === SANDBOX, 503, 'ACCOUNT_MISMATCH', 'Incorrect Stripe sandbox account.');
  assert(env.STRIPE_TAX_READY === 'true', 503, 'TAX_CONFIGURATION_REQUIRED', 'Verify Australian tax registration and a Stripe Tax calculation before enabling Checkout.');
  assert(env.STRIPE_SECRET_KEY && /^(rk|sk)_test_/.test(env.STRIPE_SECRET_KEY), 503, 'SANDBOX_KEY_REQUIRED', 'A sandbox-only restricted Stripe API key is required.');
  assert(env.STRIPE_WEBHOOK_SECRET && env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_'), 503, 'WEBHOOK_REQUIRED', 'Webhook signature verification must be configured before Checkout.');
}

export function priceForSector(sector: string) {
  if (sector === 'residential') return RESIDENTIAL;
  if (sector === 'commercial') return COMMERCIAL;
  throw new Error('Unsupported subscription sector');
}

// Values in the connected Stripe sandbox are exclusive of GST.
// Never silently add both a fixed 10% GST and automatic Stripe Tax.
export function checkoutForm(params: {
  origin: string; linkId: string; clientId: string; priceId: string;
}): URLSearchParams {
  const { origin, linkId, clientId, priceId } = params;
  const suffix = Array.from(linkId.replace(/[^a-f0-9]/g, '').slice(0, 8), c => 'abcdefghijklmnop'[parseInt(c, 16)]).join('').padEnd(8, 'a');
  return new URLSearchParams({
    mode: 'subscription',
    success_url: origin + '/workspaces?billing=returned',
    cancel_url: origin + '/workspaces?billing=cancelled',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'metadata[billing_link_id]': linkId,
    'subscription_data[metadata][billing_link_id]': linkId,
    'subscription_data[metadata][client_id]': clientId,
    client_reference_id: linkId,
    'automatic_tax[enabled]': 'true',
    integration_identifier: 'proinspect-' + suffix,
  });
}

export async function createSubscriptionCheckout(env: Env, user: Principal, w: Workspace, propertyId: string) {
  billingReady(env);
  assert(['landlord', 'commercial'].includes(w.kind), 403, 'SUBSCRIPTION_OWNER_REQUIRED', 'Only an authorised landlord may subscribe.');
  await clientAdmin(env, user, w);
  const property = await propertyAccess(env, user, w, propertyId);
  assert(property && (w.kind === 'landlord' ? property.sector === 'residential' : property.sector === 'commercial'), 422, 'PROPERTY_SECTOR', 'Select a property in this landlord account.');
  const price = priceForSector(property.sector);
  const previous = await statement(env.DB,
    "SELECT id,checkout_url,session_id,status FROM stripe_billing_links WHERE client_id=? AND property_id=? AND status NOT IN('canceled','expired') ORDER BY created_at DESC LIMIT 1",
    w.scopeId, propertyId,
  ).first<{ id: string; checkout_url: string | null; session_id: string | null; status: string }>();
  assert(!previous || previous.status === 'pending', 409, 'SUBSCRIPTION_EXISTS', 'A subscription for this property already exists.');
  if (previous?.checkout_url) return { checkoutUrl: previous.checkout_url, replayed: true };
  const id = previous?.id ?? uid('sbl');
  if (!previous) {
    // Claim the property BEFORE calling Stripe. Unique index prevents duplicate checkout races.
    await statement(env.DB,
      "INSERT INTO stripe_billing_links(id,client_id,property_id,sector,price_id,status,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?)",
      id, w.scopeId, propertyId, property.sector, price, now(), now(),
    ).run();
  }
  const form = checkoutForm({ origin: env.APP_ORIGIN, linkId: id, clientId: w.scopeId, priceId: price });
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2026-08-26.dahlia',
      'Idempotency-Key': 'proinspect-subscription-' + id,
    },
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  assert(response.ok, 502, 'STRIPE_CHECKOUT_FAILED', 'Stripe Checkout did not open; no subscription access has been granted.');
  const session = await response.json() as { id?: string; url?: string; livemode?: boolean; mode?: string };
  assert(session.id?.startsWith('cs_test_') && session.livemode === false && session.mode === 'subscription' && session.url?.startsWith('https://checkout.stripe.com/'), 502, 'STRIPE_RESPONSE_INVALID', 'Invalid subscription Checkout response.');
  await statement(env.DB,
    "UPDATE stripe_billing_links SET session_id=?,checkout_url=?,updated_at=? WHERE id=? AND status='pending' AND (session_id IS NULL OR session_id=?)",
    session.id, session.url, now(), id, session.id,
  ).run();
  return { checkoutUrl: session.url };
}

type StripeEvent = {
  id: string; created?: number; type: string; livemode: boolean;
  data?: { object?: Record<string, any> };
};

export async function billingEvent(env: Env, event: StripeEvent, signedPayload: string) {
  assert(BILLING_TYPES.has(event.type), 422, 'EVENT_TYPE', 'Unsupported billing event.');
  assert(event.livemode === false && env.APP_ENV !== 'production', 400, 'SANDBOX_ONLY', 'Only sandbox billing events may be recorded.');
  const object = event.data?.object ?? {};
  const prior = await statement(env.DB,
    "SELECT payload_hash FROM webhook_receipts WHERE provider='stripe' AND event_id=?",
    event.id,
  ).first<{ payload_hash: string }>();
  const hash = await digest(signedPayload);
  if (prior) {
    assert(prior.payload_hash === hash, 409, 'EVENT_REPLAY_MISMATCH', 'A different payload reused an existing Stripe event ID.');
    return { received: true, replayed: true };
  }
  const time = now();
  const type = event.type;
  const created = Number.isSafeInteger(event.created) && event.created! > 0 ? event.created! : 0;
  let lookupId = '';
  let subscriptionId = '';
  if (type === 'checkout.session.completed') {
    assert(object.mode === 'subscription' && typeof object.id === 'string' && object.id.startsWith('cs_test_'), 422, 'SESSION_INVALID', 'Invalid subscription session.');
    lookupId = String(object.client_reference_id ?? '');
    subscriptionId = String(object.subscription ?? '');
  } else if (type.startsWith('customer.subscription.')) {
    subscriptionId = String(object.id ?? '');
    lookupId = String(object.metadata?.billing_link_id ?? '');
  } else {
    subscriptionId = String(object.subscription ?? object.parent?.subscription_details?.subscription ?? '');
  }
  const link = await statement(env.DB,
    `SELECT * FROM stripe_billing_links WHERE stripe_subscription_id=? OR (id=? AND (stripe_subscription_id IS NULL OR stripe_subscription_id=?)) LIMIT 1`,
    subscriptionId, lookupId, subscriptionId,
  ).first<Record<string, any>>();
  const owned = !!link && !!subscriptionId;
  if (owned) {
    assert(!link.stripe_subscription_id || link.stripe_subscription_id === subscriptionId, 409, 'SUBSCRIPTION_MISMATCH', 'Subscription ID changed unexpectedly.');
    if (type === 'checkout.session.completed') {
      assert(link.session_id === object.id && object.customer && (link.stripe_customer_id === null || link.stripe_customer_id === object.customer), 409, 'SESSION_MISMATCH', 'Subscription Checkout does not match the stored customer/session.');
    } else if (type.startsWith('customer.subscription.')) {
      assert(object.customer && (link.stripe_customer_id === null || link.stripe_customer_id === object.customer), 409, 'CUSTOMER_MISMATCH', 'Subscription customer differs from the stored customer.');
      assert(Array.isArray(object.items?.data) && object.items.data.some((item: any) => item.price?.id === link.price_id), 409, 'PRICE_MISMATCH', 'Subscription is not linked to its authorised Price.');
    } else {
      assert(object.customer && link.stripe_customer_id === object.customer, 409, 'CUSTOMER_MISMATCH', 'Invoice does not belong to this subscription customer.');
      assert(object.currency === 'aud', 409, 'CURRENCY_MISMATCH', 'Unexpected invoice currency.');
    }
  }
  let status = 'unmatched';
  if (owned) {
    if (type.startsWith('customer.subscription.')) {
      status = type.endsWith('deleted') ? 'canceled' : String(object.status ?? '');
      assert(['active', 'trialing', 'incomplete', 'past_due', 'unpaid', 'canceled', 'paused'].includes(status), 422, 'STATUS_INVALID', 'Unknown Stripe subscription status.');
    } else if (type === 'checkout.session.completed') {
      status = 'checkout_observed';
    } else if (type === 'invoice.paid') {
      status = object.paid === true && object.status === 'paid' && object.amount_remaining === 0 ? 'invoice_paid_observed' : 'needs_reconciliation';
    } else {
      status = 'payment_failed_observed';
    }
  }
  const steps = [
    statement(env.DB, "INSERT INTO webhook_receipts(provider,event_id,payload_hash,created_at) VALUES('stripe',?,?,?)", event.id, hash, time),
    statement(env.DB,
      "INSERT INTO stripe_billing_events(event_id,link_id,event_type,stripe_object_id,status,currency,amount_cents,needs_reconciliation,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      event.id, link?.id ?? null, type, String(object.id ?? ''), status,
      object.currency ?? null,
      Number.isSafeInteger(object.amount_paid) ? object.amount_paid : null,
      type.startsWith('invoice.') || !owned ? 1 : 0,
      time,
    ),
  ];
  if (owned && type === 'checkout.session.completed') {
    // Checkout alone never unlocks the subscription or overrides a later lifecycle event.
    steps.push(statement(env.DB,
      "UPDATE stripe_billing_links SET stripe_subscription_id=?,stripe_customer_id=?,status=CASE WHEN status='pending' THEN 'incomplete' ELSE status END,updated_at=? WHERE id=? AND session_id=?",
      subscriptionId, object.customer, time, link.id, object.id,
    ));
  }
  if (owned && type.startsWith('customer.subscription.') && created > link.last_subscription_event_created) {
    steps.push(statement(env.DB,
      'UPDATE stripe_billing_links SET stripe_subscription_id=?,stripe_customer_id=?,status=?,last_subscription_event_created=?,updated_at=? WHERE id=? AND last_subscription_event_created<?',
      subscriptionId, String(object.customer), status, created, time, link.id, created,
    ));
  }
  await env.DB.batch(steps);
  // Invoice line items/proration must be reconciled against the relevant Price before financial clearance.
  return { received: true, matched: owned, needsReconciliation: type.startsWith('invoice.') || !owned };
}