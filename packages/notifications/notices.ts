import { statement, type Env } from '../database/types';

/** Pending Strata announcements are historical records. Cancel their dispatch without sending mail. */
export async function dispatchNotices(env: Env) {
  await statement(env.DB, `UPDATE notice_dispatch_jobs
    SET status='cancelled',lease_token=NULL,lease_until=NULL,last_error='SECTOR_RETIRED'
    WHERE status IN('pending','processing','failed')`).run();
}
