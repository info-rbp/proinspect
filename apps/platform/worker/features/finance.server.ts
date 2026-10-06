import { z } from 'zod';
import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import {
  operationsWrite,
  clientMembership,
  propertyAccess,
  workOrderAccess,
  schemeAccess,
  booksServices,
} from '../../../../packages/authorization/server';
import {
  activity,
  projection,
  recordId,
  shortText,
  reference,
  version,
  isoDate,
  guard,
  clearGuard,
  replay,
  receipt,
} from '../../../../packages/operations/core';
import { mailEvent } from '../../../../packages/notifications/server';
import { digest } from '../../../../packages/auth/crypto';

async function authorityLimit(
  env: Env,
  clientId: string,
  propertyId: string | null,
  schemeId: string | null,
) {
  const a = schemeId
    ? await statement(
        env.DB,
        'SELECT spending_limit_cents,authority_reference FROM scheme_authority_profiles WHERE client_id=? AND scheme_id=? AND valid_until>?',
        clientId,
        schemeId,
        now(),
      ).first<{ spending_limit_cents: number; authority_reference: string }>()
    : await statement(
        env.DB,
        'SELECT spending_limit_cents,authority_reference FROM management_authorities WHERE client_id=? AND property_id=? AND valid_until>?',
        clientId,
        propertyId,
        now(),
      ).first<{ spending_limit_cents: number; authority_reference: string }>();
  return a;
}
export async function proposeApproval(
  env: Env,
  user: Principal,
  w: Workspace,
  workOrderId: string,
  input: unknown,
) {
  const d = z
    .object({
      version,
      amountCents: z.number().int().min(0).max(100000000),
      summary: shortText,
      reference,
      targetUserId: recordId.optional(),
      requestKey: z.string().min(16).max(100),
    })
    .parse(input);
  const order = await workOrderAccess(env, user, w, workOrderId, true);
  if (w.kind === 'staff') operationsWrite(user);
  else
    assert(
      ['property-manager', 'strata-manager'].includes(w.kind),
      403,
      'PROPOSAL_FORBIDDEN',
      'An operational manager must prepare the proposal.',
    );
  const prior = await replay(env, user, `proposal:${workOrderId}`, d.requestKey, d);
  if (prior.result) return { ...prior.result, replayed: true };
  assert(
    order.version === d.version &&
      ['triage', 'quote_required', 'approved', 'scheduled', 'assigned'].includes(order.status),
    409,
    'WORK_ORDER_CHANGED',
    'The work order has changed or work has started.',
  );
  assert(order.client_id, 409, 'CLIENT_REQUIRED', 'Record the commissioning client first.');
  let scope = 'client';
  const client = await statement(
    env.DB,
    'SELECT client_type FROM clients WHERE id=?',
    order.client_id,
  ).first<{ client_type: string }>();
  const authority = await authorityLimit(env, order.client_id, order.property_id, order.scheme_id);
  if (order.scheme_id && (!authority || d.amountCents > authority.spending_limit_cents))
    scope = 'council';
  else if (
    client?.client_type !== 'landlord' &&
    (!authority || d.amountCents > authority.spending_limit_cents)
  )
    scope = 'named_user';
  if (scope === 'named_user') {
    assert(
      d.targetUserId && order.property_id,
      422,
      'OWNER_APPROVER_REQUIRED',
      'Select a verified owner representative because this exceeds delegated authority.',
    );
    assert(
      await statement(
        env.DB,
        `SELECT m.user_id FROM client_property_links l JOIN client_memberships m ON m.client_id=l.client_id JOIN users u ON u.id=m.user_id WHERE l.property_id=? AND l.role IN('owner','landlord') AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?) AND m.user_id=? AND m.active=1 AND m.role IN('owner','admin') AND u.active=1`,
        order.property_id,
        now(),
        now(),
        d.targetUserId,
      ).first(),
      422,
      'APPROVER_UNVERIFIED',
      'The owner representative does not have an active verified ownership relationship.',
    );
  }
  const id = uid('apv'),
    result = { id, decisionScope: scope };
  const targetSql =
    scope === 'named_user'
      ? 'SELECT id AS user_id FROM users WHERE id=? AND active=1'
      : scope === 'council'
        ? "SELECT DISTINCT m.user_id FROM scheme_memberships m JOIN users u ON u.id=m.user_id WHERE m.scheme_id=? AND m.role='council_member' AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?) AND u.active=1"
        : "SELECT m.user_id FROM client_memberships m JOIN users u ON u.id=m.user_id WHERE m.client_id=? AND m.active=1 AND m.role IN('owner','admin') AND u.active=1";
  const targets =
    scope === 'named_user'
      ? [d.targetUserId!]
      : scope === 'council'
        ? [order.scheme_id, now(), now()]
        : [order.client_id];
  const notification = statement(
    env.DB,
    `INSERT INTO notifications(id,user_id,title,message,href,created_at) SELECT 'ntf_'||?||'_'||user_id,user_id,'Approval requires attention','Review the operational proposal in your authorised workspace.',?,? FROM (${targetSql})`,
    id,
    scope === 'named_user' ? '/owner-decisions' : '/workspaces',
    now(),
    ...targets,
  );

  await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO approvals(id,work_order_id,requested_by,client_id,scheme_id,amount_cents,summary,status,authority_reference,created_at,decision_scope,target_user_id) VALUES(?,?,?,?,?,?,?,'pending',?,?,?,?)",
      id,
      workOrderId,
      user.id,
      order.client_id,
      order.scheme_id,
      d.amountCents,
      d.summary,
      d.reference,
      now(),
      scope,
      scope === 'named_user' ? d.targetUserId! : null,
    ),
    statement(
      env.DB,
      "UPDATE work_orders SET status='awaiting_approval',approval_required=1,version=version+1,updated_at=? WHERE id=? AND version=?",
      now(),
      workOrderId,
      d.version,
    ),
    guard(env),
    activity(env, user, 'approval.requested', 'approval', id, order.property_id, order.scheme_id, {
      workOrderId,
      decisionScope: scope,
    }),
    receipt(env, user, `proposal:${workOrderId}`, d.requestKey, prior.fingerprint, result),
    notification,
    clearGuard(env),
  ]);
  return result;
}
export async function approvalAccess(env: Env, user: Principal, w: Workspace | null, id: string) {
  const a = await statement(
    env.DB,
    'SELECT a.*,wo.property_id,wo.title AS work_title FROM approvals a JOIN work_orders wo ON wo.id=a.work_order_id WHERE a.id=?',
    id,
  ).first<Record<string, any>>();
  assert(a, 404, 'APPROVAL_NOT_FOUND', 'Approval not found.');
  if (a.decision_scope === 'named_user' && a.target_user_id === user.id) {
    assert(
      await statement(
        env.DB,
        "SELECT m.user_id FROM client_property_links l JOIN client_memberships m ON m.client_id=l.client_id WHERE l.property_id=? AND l.role IN('owner','landlord') AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?) AND m.user_id=? AND m.active=1 AND m.role IN('owner','admin')",
        a.property_id,
        now(),
        now(),
        user.id,
      ).first(),
      404,
      'APPROVAL_NOT_FOUND',
      'The ownership relationship is no longer active.',
    );
    return a;
  }
  assert(w, 404, 'APPROVAL_NOT_FOUND', 'Approval not found.');
  await workOrderAccess(env, user, w, a.work_order_id);
  return a;
}
export async function decideApproval(
  env: Env,
  user: Principal,
  w: Workspace | null,
  id: string,
  input: unknown,
) {
  const d = z
    .object({
      version,
      decision: z.enum(['approved', 'declined', 'changes_requested']),
      comment: z.string().max(2000).default(''),
      reference: reference.optional(),
    })
    .parse(input);
  const a = await approvalAccess(env, user, w, id);
  assert(
    a.status === 'pending' && a.version === d.version,
    409,
    'APPROVAL_CHANGED',
    'This proposal was already decided or changed.',
  );
  if (a.decision_scope === 'council') {
    assert(
      w?.kind === 'staff',
      403,
      'COUNCIL_OUTCOME_REQUIRED',
      'Council members record recommendations. An authorised operator must record the council outcome.',
    );
    operationsWrite(user);
    assert(
      d.reference,
      422,
      'DECISION_REFERENCE_REQUIRED',
      'Record the authorised council decision reference.',
    );
  } else if (a.decision_scope === 'named_user')
    assert(
      a.target_user_id === user.id,
      403,
      'APPROVER_REQUIRED',
      'Only the nominated owner representative can decide this proposal.',
    );
  else {
    assert(
      w && booksServices(w) && w.scopeId === a.client_id,
      403,
      'CLIENT_APPROVAL_REQUIRED',
      'The commissioning client must decide this proposal.',
    );
    const m = await clientMembership(env, user, a.client_id, true);
    assert(
      ['owner', 'admin'].includes(m.role),
      403,
      'FINANCIAL_AUTHORITY_REQUIRED',
      'An authorised account administrator must decide.',
    );
    if (w.kind !== 'landlord') {
      const authority = await authorityLimit(env, w.scopeId, a.property_id, a.scheme_id);
      assert(
        authority && a.amount_cents <= authority.spending_limit_cents,
        403,
        'AUTHORITY_EXCEEDED',
        'Delegated authority has expired or is insufficient. Prepare an escalated proposal.',
      );
    }
  }
  const time = now();
  await env.DB.batch([
    statement(
      env.DB,
      "UPDATE approvals SET status=?,decision_user_id=?,response_comment=?,decided_at=?,version=version+1,authority_reference=COALESCE(?,authority_reference) WHERE id=? AND status='pending' AND version=?",
      d.decision,
      user.id,
      d.comment,
      time,
      d.reference ?? null,
      id,
      d.version,
    ),
    guard(env),
    statement(
      env.DB,
      "UPDATE work_orders SET status=?,version=version+1,updated_at=? WHERE id=? AND status='awaiting_approval'",
      d.decision === 'approved' ? 'approved' : 'quote_required',
      time,
      a.work_order_id,
    ),
    guard(env),
    activity(env, user, 'approval.decided', 'approval', id, a.property_id, a.scheme_id, {
      decision: d.decision,
    }),
    projection(env, 'approval.decided', id, { status: d.decision, workOrderId: a.work_order_id }),
    statement(
      env.DB,
      "INSERT INTO notifications(id,user_id,title,message,href,created_at) VALUES(?,?,'Operational decision recorded','Review the authorised outcome before proceeding with work.','/workspaces',?)",
      uid('ntf'),
      a.requested_by,
      time,
    ),
    clearGuard(env),
  ]);
  return { id, status: d.decision };
}
export async function councilResponse(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  assert(w.kind === 'council', 403, 'COUNCIL_REQUIRED', 'Use the Council workspace.');
  const a = await approvalAccess(env, user, w, id);
  assert(
    a.decision_scope === 'council' && a.status === 'pending',
    409,
    'DECISION_CLOSED',
    'This proposal is not accepting council responses.',
  );
  await schemeAccess(env, user, w, a.scheme_id);
  const d = z
    .object({
      response: z.enum(['support', 'oppose', 'information']),
      comment: z.string().max(2000).default(''),
    })
    .parse(input);
  const m = await statement(
    env.DB,
    "SELECT id FROM scheme_memberships WHERE user_id=? AND scheme_id=? AND role='council_member' AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)",
    user.id,
    a.scheme_id,
    now(),
    now(),
  ).first<{ id: string }>();
  assert(m, 403, 'TERM_ENDED', 'Council membership has ended.');
  await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO council_responses(approval_id,user_id,membership_id,response,comment,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM approvals WHERE id=? AND status='pending') ON CONFLICT(approval_id,user_id) DO UPDATE SET response=excluded.response,comment=excluded.comment,membership_id=excluded.membership_id,created_at=excluded.created_at",
      id,
      user.id,
      m.id,
      d.response,
      d.comment,
      now(),
      id,
    ),
    guard(env),
    activity(
      env,
      user,
      'council.recommendation_recorded',
      'approval',
      id,
      a.property_id,
      a.scheme_id,
      { response: d.response },
    ),
    clearGuard(env),
  ]);
  return { ok: true };
}
export async function paymentAccess(env: Env, user: Principal, w: Workspace, id: string) {
  const p = await statement(env.DB, 'SELECT * FROM payments WHERE id=?', id).first<
    Record<string, any>
  >();
  assert(p, 404, 'PAYMENT_NOT_FOUND', 'Payment record not found.');
  if (w.kind === 'staff') {
    assert(
      user.staffRole !== 'inspector',
      403,
      'PAYMENT_FORBIDDEN',
      'Billing is not part of inspector access.',
    );
  } else {
    assert(
      booksServices(w) && p.client_id === w.scopeId,
      404,
      'PAYMENT_NOT_FOUND',
      'Payment record not found.',
    );
    if (p.work_order_id) await workOrderAccess(env, user, w, p.work_order_id);
    else if (p.property_id) await propertyAccess(env, user, w, p.property_id);
  }
  return p;
}
export async function createPayment(env: Env, user: Principal, w: Workspace, input: unknown) {
  assert(w.kind === 'staff', 403, 'STAFF_REQUIRED', 'Staff prepares payment requests.');
  operationsWrite(user);
  const d = z
    .object({
      workOrderId: recordId,
      description: shortText,
      amountExGstCents: z.number().int().min(0).max(100000000),
      gstCents: z.number().int().min(0).max(10000000),
      dueAt: isoDate.optional(),
      requestKey: z.string().min(16).max(100),
    })
    .parse(input);
  const o = await workOrderAccess(env, user, w, d.workOrderId);
  assert(o.client_id, 409, 'CLIENT_REQUIRED', 'Record the commissioning client.');
  const old = await replay(env, user, 'payment.create', d.requestKey, d);
  if (old.result) return { ...old.result, replayed: true };
  const id = uid('pay'),
    result = { id };
  await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO payments(id,client_id,property_id,work_order_id,description,amount_ex_gst_cents,gst_cents,total_cents,status,created_at,due_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'payment_required',?,?,?)",
      id,
      o.client_id,
      o.property_id,
      o.id,
      d.description,
      d.amountExGstCents,
      d.gstCents,
      d.amountExGstCents + d.gstCents,
      now(),
      d.dueAt ?? null,
      now(),
    ),
    statement(
      env.DB,
      "INSERT INTO payment_events(id,payment_id,actor_id,to_status,reference,created_at) VALUES(?,?,?,'payment_required',?,?)",
      uid('pe'),
      id,
      user.id,
      'Payment request created',
      now(),
    ),
    activity(env, user, 'payment.requested', 'payment', id, o.property_id, o.scheme_id),
    receipt(env, user, 'payment.create', d.requestKey, old.fingerprint, result),
  ]);
  return result;
}
export async function recordPayment(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  assert(w.kind === 'staff', 403, 'STAFF_REQUIRED', 'Staff reconciles payment records.');
  operationsWrite(user);
  const p = await paymentAccess(env, user, w, id);
  const d = z
    .object({ version, status: z.enum(['paid', 'failed', 'refunded', 'waived']), reference })
    .parse(input);
  assert(p.version === d.version, 409, 'STALE_VERSION', 'Payment record has changed.');
  assert(
    p.provider === 'manual',
    409,
    'PROVIDER_MANAGED',
    'Provider payments must be reconciled from verified provider events.',
  );
  const transitions: Record<string, string[]> = {
    payment_required: ['paid', 'failed', 'waived'],
    pending: ['paid', 'failed', 'waived'],
    failed: ['paid', 'waived'],
    paid: ['refunded'],
  };
  assert(
    transitions[p.status]?.includes(d.status),
    422,
    'PAYMENT_TRANSITION',
    'This payment state change is unavailable.',
  );
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE payments SET status=?,external_reference=?,version=version+1,updated_at=? WHERE id=? AND version=?',
      d.status,
      d.reference,
      now(),
      id,
      d.version,
    ),
    guard(env),
    statement(
      env.DB,
      'INSERT INTO payment_events(id,payment_id,actor_id,from_status,to_status,reference,created_at) VALUES(?,?,?,?,?,?,?)',
      uid('pe'),
      id,
      user.id,
      p.status,
      d.status,
      d.reference,
      now(),
    ),
    activity(env, user, 'payment.reconciled', 'payment', id, p.property_id, null, {
      status: d.status,
    }),
    projection(env, 'payment.updated', id, { status: d.status, workOrderId: p.work_order_id }),
    clearGuard(env),
  ]);
  return { id, status: d.status };
}
export async function verifyHmac(secret: string, payload: string, hex: string) {
  if (!/^[a-f0-9]{64}$/i.test(hex)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16))),
    new TextEncoder().encode(payload),
  );
}

export { checkout, stripeWebhook } from './payments.server';
