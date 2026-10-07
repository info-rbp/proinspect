import { statement, now, uid, type Env } from '../database/types';
import { mailEvent } from './server';
import { noticeMemberPredicate } from './notice-access';
import { guard, clearGuard } from '../operations/core';

/** Resumable, bounded fan-out. A committed page advances the cursor in the same D1 batch. */
export async function dispatchNotices(env: Env) {
  const time = now();
  await statement(env.DB,`UPDATE notice_dispatch_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL
 WHERE status IN('pending','processing','failed') AND EXISTS(SELECT 1 FROM building_notices n
 WHERE n.id=notice_id AND (n.withdrawn_at IS NOT NULL OR (n.expires_at IS NOT NULL AND n.expires_at<=?)))`,time).run();
  const jobs = (await statement(env.DB,`SELECT j.notice_id FROM notice_dispatch_jobs j JOIN building_notices n ON n.id=j.notice_id
 WHERE ((j.status='pending' AND j.available_at<=?) OR (j.status='processing' AND j.lease_until<?))
 AND n.starts_at<=? AND n.withdrawn_at IS NULL AND (n.expires_at IS NULL OR n.expires_at>?)
 ORDER BY j.available_at,j.notice_id LIMIT 5`,time,time,time,time).all<{ notice_id: string }>()).results;
  for (const job of jobs) {
    const lease = uid('lease');
    const claim = await statement(env.DB,`UPDATE notice_dispatch_jobs SET status='processing',lease_token=?,lease_until=?
 WHERE notice_id=? AND ((status='pending' AND available_at<=?) OR (status='processing' AND lease_until<?))
 RETURNING cursor_user_id,attempts`,lease,new Date(Date.now() + 120000).toISOString(),job.notice_id,time,time).first<{ cursor_user_id: string; attempts: number }>();
    if (!claim) continue;
    try {
      const recipients = (await statement(env.DB,`SELECT DISTINCT u.id,u.email FROM building_notices n
 JOIN scheme_memberships m ON m.scheme_id=n.scheme_id JOIN users u ON u.id=m.user_id
 LEFT JOIN strata_lots l ON l.id=m.lot_id WHERE n.id=? AND u.id>? AND n.withdrawn_at IS NULL
 AND n.starts_at<=? AND (n.expires_at IS NULL OR n.expires_at>?) AND ${noticeMemberPredicate}
 ORDER BY u.id LIMIT 25`,job.notice_id,claim.cursor_user_id,time,time,time,time).all<{ id: string; email: string }>()).results;
      const batch: D1PreparedStatement[] = [statement(env.DB,`UPDATE notice_dispatch_jobs SET cursor_user_id=?,status=?,
 lease_token=NULL,lease_until=NULL,attempts=0,last_error=NULL,available_at=?,completed_at=?
 WHERE notice_id=? AND status='processing' AND lease_token=? AND EXISTS(SELECT 1 FROM building_notices n
 WHERE n.id=notice_id AND n.withdrawn_at IS NULL AND (n.expires_at IS NULL OR n.expires_at>?))`,
          recipients.at(-1)?.id ?? claim.cursor_user_id,recipients.length < 25 ? 'completed' : 'pending',time,
          recipients.length < 25 ? time : null,job.notice_id,lease,time),guard(env)];
      for (const user of recipients) {
        const notificationId = `ntf_${job.notice_id}_${user.id}`,eventId = `evt_${job.notice_id}_${user.id}`;
        batch.push(await mailEvent(env,'building.notice_available',{
              to: user.email,subject: 'A building notice is available',heading: 'An update for your building',
              body: 'Sign in to your authorised Building or Council workspace to read the current notice.',
              href: `${env.APP_ORIGIN}/workspaces`,noticeAccess: { noticeId: job.notice_id, userId: user.id },
            },eventId));
        batch.push(statement(env.DB,`INSERT INTO notifications(id,user_id,title,message,href,created_at)
 VALUES(?,?,'Building notice available','Open your authorised workspace to read the current notice.','/workspaces',?)
 ON CONFLICT(id) DO NOTHING`,notificationId,user.id,time));
        batch.push(statement(env.DB,`INSERT INTO notice_deliveries(notice_id,user_id,notification_id,outbox_id,created_at)
 VALUES(?,?,?,?,?) ON CONFLICT(notice_id,user_id) DO NOTHING`,job.notice_id,user.id,notificationId,eventId,time));
      }
      batch.push(clearGuard(env));
      await env.DB.batch(batch);
    } catch {
      await statement(env.DB,`UPDATE notice_dispatch_jobs SET status=?,attempts=attempts+1,last_error='DISPATCH_FAILED',
 available_at=?,lease_token=NULL,lease_until=NULL WHERE notice_id=? AND lease_token=?`,
        claim.attempts >= 4 ? 'failed' : 'pending',new Date(Date.now() + 120000).toISOString(),job.notice_id,lease).run();
      // Other schemes still make progress; a failed job remains visible for review.
    }
  }
}
