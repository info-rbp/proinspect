import { statement, now, type Env } from '../database/types';
import { mailEvent } from './server';
import { noticeAudienceSql, type NoticeWorkspace } from './notice-policy';
import { guard, clearGuard } from '../operations/core';

/** Bounded, repeatable fan-out. Publication never depends on the mail provider. */
export async function dispatchDueNotices(env: Env) {
  const time = now();
  const rows = (
    await statement(
      env.DB,
      `SELECT n.id,n.version,n.scheme_id,n.email_enabled,u.id AS user_id,u.email,CASE WHEN MIN(CASE WHEN m.role IN('resident','owner') THEN 0 ELSE 1 END)=0 THEN 'building' ELSE 'council' END AS workspace_kind
    FROM building_notices n JOIN scheme_memberships m ON m.scheme_id=n.scheme_id JOIN users u ON u.id=m.user_id LEFT JOIN strata_lots l ON l.id=m.lot_id
    WHERE n.withdrawn_at IS NULL AND n.starts_at<=? AND (n.expires_at IS NULL OR n.expires_at>?) AND u.active=1 AND u.verified_at IS NOT NULL
    AND m.starts_at<=n.starts_at AND (m.ends_at IS NULL OR m.ends_at>?)
    AND (n.audience='all_members' OR (n.audience='residents' AND m.role='resident') OR (n.audience='owners' AND m.role='owner') OR (n.audience='council' AND m.role='council_member'))
    AND (n.lot_id IS NULL OR n.lot_id=m.lot_id) AND (n.building_id IS NULL OR n.building_id=l.building_id)
    AND NOT EXISTS(SELECT 1 FROM notice_deliveries x WHERE x.notice_id=n.id AND x.notice_version=n.version AND x.user_id=u.id)
    GROUP BY n.id,n.version,u.id ORDER BY n.starts_at,n.id,u.id LIMIT 30`,
      time,
      time,
      time,
    ).all<{
      id: string;
      version: number;
      scheme_id: string;
      email_enabled: number;
      user_id: string;
      email: string;
      workspace_kind: NoticeWorkspace;
    }>()
  ).results;
  let created = 0;
  for (const row of rows) {
    const id = `ntf_${row.id}_${row.version}_${row.user_id}`;
    const href = `/w/${row.workspace_kind}/${row.scheme_id}/schemes/${row.scheme_id}`;
    const commands = [
      statement(
        env.DB,
        `INSERT OR IGNORE INTO notice_deliveries(notice_id,notice_version,user_id,workspace_kind,notification_id,created_at)
      SELECT n.id,n.version,?,?,?,? FROM building_notices n WHERE n.id=? AND n.version=? AND n.withdrawn_at IS NULL AND n.starts_at<=? AND (n.expires_at IS NULL OR n.expires_at>?)
      AND EXISTS(SELECT 1 FROM scheme_memberships m JOIN users u ON u.id=m.user_id LEFT JOIN strata_lots l ON l.id=m.lot_id WHERE m.scheme_id=n.scheme_id AND m.user_id=? AND u.active=1 AND u.verified_at IS NOT NULL AND m.starts_at<=n.starts_at AND (m.ends_at IS NULL OR m.ends_at>?) AND (${noticeAudienceSql(row.workspace_kind)}) AND (n.lot_id IS NULL OR n.lot_id=m.lot_id) AND (n.building_id IS NULL OR n.building_id=l.building_id))`,
        row.user_id,
        row.workspace_kind,
        id,
        time,
        row.id,
        row.version,
        time,
        time,
        row.user_id,
        time,
      ),
      guard(env),
      statement(
        env.DB,
        'INSERT INTO notifications(id,user_id,title,message,href,created_at,workspace_kind,scope_id,source_notice_id,source_notice_version) VALUES(?,?,?,?,?,?,?,?,?,?)',
        id,
        row.user_id,
        row.version === 1 ? 'Building notice available' : 'Building notice updated',
        'Open this workspace to read the current notice.',
        href,
        time,
        row.workspace_kind,
        row.scheme_id,
        row.id,
        row.version,
      ),
      clearGuard(env),
    ];
    if (row.email_enabled)
      commands.push(
        await mailEvent(env, 'building.notice_available', {
          to: row.email,
          subject: 'ProInspect building notice',
          heading: 'A building notice is available',
          body: 'Sign in to your authorised workspace to read the current notice. Email does not contain private building or council details.',
          href: env.APP_ORIGIN + href,
          notice: {
            id: row.id,
            version: row.version,
            userId: row.user_id,
            workspace: row.workspace_kind,
          },
        }),
      );
    try {
      await env.DB.batch(commands);
      created++;
    } catch (error) {
      // A concurrent dispatcher or a revoked/edited audience loses the conditional insert.
      if (!(error instanceof Error) || !/CHECK constraint failed: changed_rows/.test(error.message))
        throw error;
    }
  }
  return { created, hasMore: rows.length === 30 };
}
