import { z } from 'zod';
import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import {
  propertyAccess,
  operationsWrite,
  managesProperty,
} from '../../../../packages/authorization/server';
import {
  recordId,
  isoDate,
  reference,
  version,
  activity,
  guard,
  clearGuard,
} from '../../../../packages/operations/core';
import { email } from '../../../../packages/validation/index';
import { digest, randomToken, unseal } from '../../../../packages/auth/crypto';
import { mailEvent } from '../../../../packages/notifications/server';
export async function tenancyAccess(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  write = false,
) {
  const t = await statement(env.DB, 'SELECT * FROM tenancies WHERE id=?', id).first<
    Record<string, any>
  >();
  assert(t, 404, 'TENANCY_NOT_FOUND', 'Tenancy not found.');
  if (w.kind === 'tenant')
    assert(!write && w.scopeId === id, 403, 'TENANCY_FORBIDDEN', 'This tenancy is not available.');
  else {
    assert(
      managesProperty(w) || w.kind === 'staff',
      403,
      'TENANCY_PRIVACY',
      'Building relationships do not grant tenancy management.',
    );
    await propertyAccess(env, user, w, t.property_id, write);
    if (write && w.kind === 'staff') operationsWrite(user);
  }
  return t;
}
export async function tenancyDetail(env: Env, user: Principal, w: Workspace, id: string) {
  const t = await tenancyAccess(env, user, w, id);
  const members = (
    await statement(
      env.DB,
      `SELECT m.id,m.user_id,m.starts_at,m.ends_at,u.display_name,u.email FROM tenancy_memberships m JOIN users u ON u.id=m.user_id WHERE m.tenancy_id=? ${w.kind === 'tenant' ? 'AND m.user_id=?' : ''}`,
      id,
      ...(w.kind === 'tenant' ? [user.id] : []),
    ).all()
  ).results;
  const pcr = (
    await statement(
      env.DB,
      `SELECT r.id,r.document_id,r.status,r.created_at,r.response_envelope FROM pcr_responses r WHERE r.tenancy_id=? ${w.kind === 'tenant' ? 'AND r.user_id=?' : ''}`,
      id,
      ...(w.kind === 'tenant' ? [user.id] : []),
    ).all<Record<string, any>>()
  ).results;
  return {
    tenancy: t,
    members,
    pcrResponses: await Promise.all(
      pcr.map(async (r) => ({
        id: r.id,
        documentId: r.document_id,
        status: r.status,
        created_at: r.created_at,
        ...(await unseal<object>(env.DATA_ENCRYPTION_KEY, `pcr:${r.id}`, r.response_envelope)),
      })),
    ),
  };
}
export async function updateTenancy(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  const t = await tenancyAccess(env, user, w, id, true);
  const d = z
    .object({
      version,
      status: z.enum(['active', 'ended']),
      endsAt: isoDate.optional(),
      reference,
      bondReference: z.string().max(100).optional(),
      rentCents: z.number().int().min(0).max(10000000).optional(),
    })
    .parse(input);
  assert(
    t.version === d.version && t.status !== 'ended',
    409,
    'TENANCY_CHANGED',
    'This tenancy has ended or changed.',
  );
  const end = d.status === 'ended' ? (d.endsAt ?? now()) : (d.endsAt ?? t.ends_at);
  assert(!end || end > t.starts_at, 422, 'TENANCY_DATES', 'End must be after the tenancy start.');
  if (d.status === 'ended')
    assert(end <= now(), 422, 'FUTURE_END', 'Keep the tenancy active until the recorded end date.');
  const commands = [
    statement(
      env.DB,
      'UPDATE tenancies SET status=?,ends_at=?,reference=?,bond_reference=COALESCE(?,bond_reference),rent_cents=COALESCE(?,rent_cents),version=version+1 WHERE id=? AND version=?',
      d.status,
      end,
      d.reference,
      d.bondReference ?? null,
      d.rentCents ?? null,
      id,
      d.version,
    ),
    guard(env),
  ];
  if (d.status === 'ended')
    commands.push(
      statement(
        env.DB,
        'UPDATE tenancy_memberships SET ends_at=? WHERE tenancy_id=? AND starts_at<? AND (ends_at IS NULL OR ends_at>?)',
        end,
        id,
        end,
        end,
      ),
    );
  commands.push(
    activity(env, user, 'tenancy.updated', 'tenancy', id, t.property_id, null, {
      status: d.status,
      reference: d.reference,
    }),
    clearGuard(env),
  );
  await env.DB.batch(commands);
  return { id, status: d.status };
}
export async function inviteAdditionalTenant(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  const t = await tenancyAccess(env, user, w, id, true);
  assert(t.status === 'active', 409, 'TENANCY_ENDED', 'This tenancy is not active.');
  const d = z.object({ email }).parse(input),
    token = randomToken(),
    url = `${env.APP_ORIGIN}/invitations/accept?token=${token}`;
  await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO invitations(token_hash,email,tenancy_id,role,expires_at,created_by,created_at) VALUES(?,?,?,'tenant',?,?,?)",
      await digest(token),
      d.email,
      id,
      new Date(Date.now() + 7 * 86400000).toISOString(),
      user.id,
      now(),
    ),
    await mailEvent(env, 'tenancy.invited', {
      to: d.email,
      subject: 'Your ProInspect tenancy invitation',
      heading: 'You have been invited',
      body: 'Sign in with the invited email to access your tenancy workspace.',
      href: url,
      sensitive: true,
    }),
    activity(env, user, 'tenancy.member_invited', 'tenancy', id, t.property_id),
  ]);
  return { invited: true, ...(env.APP_ENV === 'local' ? { localInvitationUrl: url } : {}) };
}
export async function publishInspection(env: Env, user: Principal, w: Workspace, input: unknown) {
  const d = z
    .object({ tenancyId: recordId, bookingId: recordId, noticeReference: reference })
    .parse(input);
  const t = await tenancyAccess(env, user, w, d.tenancyId, true);
  const b = await statement(
    env.DB,
    "SELECT * FROM bookings WHERE id=? AND property_id=? AND status='confirmed'",
    d.bookingId,
    t.property_id,
  ).first<Record<string, any>>();
  assert(
    b && b.starts_at >= t.starts_at && (!t.ends_at || b.starts_at < t.ends_at),
    422,
    'INSPECTION_CONTEXT',
    'Choose a confirmed booking within the tenancy dates.',
  );
  const prior = await statement(
    env.DB,
    'SELECT booking_id FROM tenant_inspections WHERE booking_id=? AND tenancy_id=?',
    d.bookingId,
    d.tenancyId,
  ).first();
  if (prior) return { published: true, replayed: true };
  await env.DB.batch([
    statement(
      env.DB,
      'INSERT INTO tenant_inspections(booking_id,tenancy_id,published_by,published_at,notice_reference) VALUES(?,?,?,?,?)',
      d.bookingId,
      d.tenancyId,
      user.id,
      now(),
      d.noticeReference,
    ),
    activity(env, user, 'inspection.published_to_tenancy', 'booking', b.id, t.property_id, null, {
      tenancyId: t.id,
      noticeReference: d.noticeReference,
    }),
  ]);
  return { published: true };
}
