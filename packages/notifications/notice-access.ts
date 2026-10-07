import { statement, now, type Env } from '../database/types';
/** The same membership predicate governs fan-out, email delivery and portal alerts. */
export const noticeMemberPredicate = `u.active=1 AND u.verified_at IS NOT NULL
 AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?)
 AND (n.audience='all_members' OR (n.audience='residents' AND m.role='resident')
 OR (n.audience='owners' AND m.role='owner') OR (n.audience='council' AND m.role='council_member'))
 AND (n.lot_id IS NULL OR m.lot_id=n.lot_id)
 AND (n.building_id IS NULL OR l.building_id=n.building_id)`;
export async function noticeRecipient(env: Env, noticeId: string, userId: string) {
  const time = now();
  return statement(env.DB,`SELECT DISTINCT u.id,u.email FROM building_notices n
 JOIN scheme_memberships m ON m.scheme_id=n.scheme_id JOIN users u ON u.id=m.user_id
 LEFT JOIN strata_lots l ON l.id=m.lot_id
 WHERE n.id=? AND u.id=? AND n.withdrawn_at IS NULL AND n.starts_at<=?
 AND (n.expires_at IS NULL OR n.expires_at>?) AND ${noticeMemberPredicate}`,
    noticeId,userId,time,time,time,time).first<{ id: string; email: string }>();
}
export function workspaceNoticeRoles(audience: string, kind: string) {
  const roles = audience === 'all_members' ? ['resident', 'owner', 'council_member'] : [audience === 'residents' ? 'resident' : audience === 'owners' ? 'owner' : 'council_member'];
  return roles.filter((role) => kind === 'council' ? role === 'council_member' : role !== 'council_member');
}
