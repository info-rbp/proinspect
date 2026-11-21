import { z } from 'zod';
import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import { earliestResidentialCancellation } from '../../../../packages/domain/residential-policy';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { clientAdmin, operationsWrite } from '../../../../packages/authorization/server';
import { stripeApi, verifySandboxAccount } from './stripe-client.server';
import { requireReleaseApproval } from './release-governance.server';

function noticeAudit(env: Env, user: Principal, id: string, action: string) {
  // Run immediately after the notice mutation in the same D1 batch.
  return statement(
    env.DB,
    `INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at)
    SELECT ?,?,?,'stripe_billing_link',?,'{}',? WHERE changes()=1`,
    uid('aud'),
    user.id,
    action,
    id,
    now(),
  );
}

/** Record written notice without promising provider cancellation or deleting history. */
export async function requestResidentialCancellation(
  env: Env,
  user: Principal,
  w: Workspace,
  input: unknown,
) {
  assert(
    w.kind === 'landlord',
    403,
    'OWNER_REQUIRED',
    'Use the authorised property owner account.',
  );
  await clientAdmin(env, user, w);
  const d = z
    .object({
      billingLinkId: z.string().min(4).max(100),
      reason: z.string().trim().min(3).max(2000),
    })
    .parse(input);
  const contract = await statement(
    env.DB,
    `SELECT c.starts_at FROM residential_subscription_contracts c
    JOIN stripe_billing_links b ON b.id=c.billing_link_id WHERE b.id=? AND b.client_id=? AND b.sector='residential'`,
    d.billingLinkId,
    w.scopeId,
  ).first<{ starts_at: string | null }>();
  assert(contract, 404, 'CONTRACT_NOT_FOUND', 'Subscription contract not found in this account.');
  assert(
    contract.starts_at,
    409,
    'CONTRACT_START_PENDING',
    'The subscription start is awaiting provider verification. Contact ProInspect to record an exception.',
  );
  const received = now(),
    end = earliestResidentialCancellation(contract.starts_at, received);
  await env.DB.batch([
    statement(
      env.DB,
      `INSERT INTO residential_cancellation_notices(billing_link_id,requested_by,received_at,earliest_end_at,reason)
      VALUES(?,?,?,?,?) ON CONFLICT(billing_link_id) DO NOTHING`,
      d.billingLinkId,
      user.id,
      received,
      end,
      d.reason,
    ),
    noticeAudit(env, user, d.billingLinkId, 'subscription.cancellation_notice_received'),
  ]);
  return statement(
    env.DB,
    'SELECT received_at,earliest_end_at,status FROM residential_cancellation_notices WHERE billing_link_id=?',
    d.billingLinkId,
  ).first();
}

// Read-only provider reconciliation. Recording a notice cannot change a Stripe subscription.
export async function reconcileResidentialNotice(
  env: Env,
  user: Principal,
  w: Workspace,
  input: unknown,
) {
  assert(w.kind === 'staff', 403, 'STAFF_REQUIRED', 'Use Staff billing to review a cancellation.');
  operationsWrite(user);
  const { billingLinkId } = z
    .object({ billingLinkId: z.string().min(4).max(100) })
    .strict()
    .parse(input);
  const row = await statement(
    env.DB,
    `SELECT n.requested_by,n.earliest_end_at,n.status,n.provider_reference,
    b.stripe_subscription_id,b.stripe_customer_id,b.price_id FROM residential_cancellation_notices n
    JOIN residential_subscription_contracts c ON c.billing_link_id=n.billing_link_id
    JOIN stripe_billing_links b ON b.id=n.billing_link_id WHERE b.id=? AND b.sector='residential'`,
    billingLinkId,
  ).first<{
    requested_by: string;
    earliest_end_at: string;
    status: string;
    provider_reference: string | null;
    stripe_subscription_id: string | null;
    stripe_customer_id: string | null;
    price_id: string;
  }>();
  assert(row, 404, 'NOTICE_NOT_FOUND', 'This cancellation notice is unavailable.');
  assert(
    row.requested_by !== user.id,
    403,
    'INDEPENDENT_REVIEW_REQUIRED',
    'A different staff reviewer must verify the provider outcome.',
  );
  assert(row.status !== 'withdrawn', 409, 'NOTICE_WITHDRAWN', 'This notice was withdrawn.');
  assert(
    row.stripe_subscription_id &&
      /^sub_[A-Za-z0-9_]+$/.test(row.stripe_subscription_id) &&
      row.stripe_customer_id,
    409,
    'SUBSCRIPTION_UNVERIFIED',
    'The contract does not yet have a verified Stripe subscription.',
  );
  assert(
    env.STRIPE_BILLING_ENABLED === 'true',
    503,
    'BILLING_DISABLED',
    'Sandbox billing is not enabled.',
  );
  await requireReleaseApproval(env, 'stripe_billing');
  await verifySandboxAccount(env);
  const observed = await stripeApi(env, '/subscriptions/' + row.stripe_subscription_id);
  const item = observed.items?.data?.[0];
  assert(
    observed.livemode === false &&
      observed.id === row.stripe_subscription_id &&
      observed.customer === row.stripe_customer_id &&
      observed.metadata?.billing_link_id === billingLinkId &&
      observed.items?.data?.length === 1 &&
      !observed.items.has_more &&
      item?.price?.id === row.price_id &&
      item.quantity === 1,
    409,
    'SUBSCRIPTION_MISMATCH',
    'The sandbox subscription must match this property contract.',
  );
  const ended = observed.status === 'canceled';
  const end = ended ? observed.ended_at : observed.cancel_at;
  assert(
    Number.isSafeInteger(end) &&
      end >= Math.ceil(Date.parse(row.earliest_end_at) / 1000) &&
      (ended ? end * 1000 <= Date.now() : end * 1000 > Date.now()),
    409,
    'END_DATE_UNVERIFIED',
    'Stripe has not confirmed an end date that meets this notice.',
  );
  const status = ended ? 'completed' : 'provider_scheduled',
    reference = observed.id + '@' + new Date(end * 1000).toISOString();
  if (row.status === status && row.provider_reference === reference)
    return { status, providerReference: reference };
  assert(
    row.status !== 'completed',
    409,
    'NOTICE_ALREADY_COMPLETED',
    'Review this completed notice independently.',
  );
  const [change] = await env.DB.batch([
    statement(
      env.DB,
      `UPDATE residential_cancellation_notices SET status=?,provider_reference=?,reviewed_by=?,reviewed_at=?
      WHERE billing_link_id=? AND status=? AND provider_reference IS ?`,
      status,
      reference,
      user.id,
      now(),
      billingLinkId,
      row.status,
      row.provider_reference,
    ),
    noticeAudit(env, user, billingLinkId, 'subscription.cancellation_verified_in_sandbox'),
  ]);
  assert(
    change.meta.changes === 1,
    409,
    'NOTICE_CHANGED',
    'The notice changed. Reload and review the latest provider observation.',
  );
  return { status, providerReference: reference };
}
