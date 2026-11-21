import { z } from 'zod';
import { assert, statement, now, type Env } from '../../../../packages/database/types';
import { earliestResidentialCancellation } from '../../../../packages/domain/residential-policy';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { clientAdmin } from '../../../../packages/authorization/server';
import { activity } from '../../../../packages/operations/core';

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
    activity(
      env,
      user,
      'subscription.cancellation_notice_received',
      'stripe_billing_link',
      d.billingLinkId,
    ),
  ]);
  return statement(
    env.DB,
    'SELECT received_at,earliest_end_at,status FROM residential_cancellation_notices WHERE billing_link_id=?',
    d.billingLinkId,
  ).first();
}
