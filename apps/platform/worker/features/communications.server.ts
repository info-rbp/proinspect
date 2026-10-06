import { z } from 'zod';
import { assert, statement, now, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { schemeAccess } from '../../../../packages/authorization/server';
import {
  version,
  shortText,
  isoDate,
  reference,
  activity,
  guard,
  clearGuard,
} from '../../../../packages/operations/core';
import { dispatchDueNotices } from '../../../../packages/notifications/notices';

/** Revisions retain their previous wording and never silently broaden the audience. */
export async function changeNotice(
  env: Env,
  user: Principal,
  w: Workspace,
  schemeId: string,
  id: string,
  input: unknown,
) {
  await schemeAccess(env, user, w, schemeId, true);
  const d = z
    .object({
      version,
      action: z.enum(['revise', 'withdraw']),
      reason: reference,
      title: shortText.optional(),
      body: z.string().trim().min(10).max(5000).optional(),
      startsAt: isoDate.optional(),
      expiresAt: isoDate.optional(),
      emailEnabled: z.boolean().optional(),
    })
    .parse(input);
  const n = await statement(
    env.DB,
    'SELECT * FROM building_notices WHERE id=? AND scheme_id=?',
    id,
    schemeId,
  ).first<Record<string, any>>();
  assert(n, 404, 'NOTICE_NOT_FOUND', 'Notice not found.');
  assert(
    n.version === d.version && !n.withdrawn_at,
    409,
    'NOTICE_CHANGED',
    'This notice was changed or withdrawn. Reload it before saving.',
  );
  const time = now(),
    start = d.startsAt ?? (d.action === 'revise' ? time : n.starts_at),
    expiry = d.expiresAt ?? n.expires_at;
  assert(!expiry || expiry > start, 422, 'NOTICE_DATES', 'Expiry must be after publication.');
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE building_notices SET title=?,body=?,starts_at=?,expires_at=?,email_enabled=?,withdrawn_at=?,version=version+1 WHERE id=? AND version=? AND withdrawn_at IS NULL',
      d.title ?? n.title,
      d.body ?? n.body,
      start,
      expiry,
      d.emailEnabled === undefined ? n.email_enabled : Number(d.emailEnabled),
      d.action === 'withdraw' ? time : null,
      id,
      d.version,
    ),
    guard(env),
    statement(
      env.DB,
      'INSERT INTO notice_revisions(notice_id,version,snapshot_json,actor_id,created_at) VALUES(?,?,?,?,?)',
      id,
      n.version,
      JSON.stringify(n),
      user.id,
      time,
    ),
    activity(
      env,
      user,
      `notice.${d.action === 'withdraw' ? 'withdrawn' : 'revised'}`,
      'notice',
      id,
      null,
      schemeId,
      { version: n.version + 1, reason: d.reason },
    ),
    clearGuard(env),
  ]);
  await dispatchDueNotices(env).catch(() => console.error('notice.fanout_deferred'));
  return { id, version: n.version + 1, withdrawn: d.action === 'withdraw' };
}
