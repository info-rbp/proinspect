import { statement, now, type Env } from '../database/types';
export type NoticeWorkspace = 'building' | 'council';
/** Shared by notice rendering, notifications and the last check before sending email. */
export function noticeAudienceSql(kind: NoticeWorkspace) {
  return kind === 'council'
    ? "m.role='council_member' AND n.audience IN('council','all_members')"
    : "m.role IN('resident','owner') AND (n.audience='all_members' OR (n.audience='residents' AND m.role='resident') OR (n.audience='owners' AND m.role='owner'))";
}
export async function noticeRecipientAllowed(
  env: Env,
  noticeId: string,
  version: number,
  userId: string,
  kind: NoticeWorkspace,
) {
  const time = now();
  return Boolean(
    await statement(
      env.DB,
      `SELECT n.id FROM building_notices n JOIN scheme_memberships m ON m.scheme_id=n.scheme_id JOIN users u ON u.id=m.user_id LEFT JOIN strata_lots l ON l.id=m.lot_id WHERE n.id=? AND n.version=? AND n.withdrawn_at IS NULL AND n.starts_at<=? AND (n.expires_at IS NULL OR n.expires_at>?) AND u.id=? AND u.active=1 AND u.verified_at IS NOT NULL AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?) AND (${noticeAudienceSql(kind)}) AND (n.lot_id IS NULL OR n.lot_id=m.lot_id) AND (n.building_id IS NULL OR n.building_id=l.building_id) LIMIT 1`,
      noticeId,
      version,
      time,
      time,
      userId,
      time,
      time,
    ).first(),
  );
}
