import type { Env } from '../../../../packages/database/types';
import { now, statement, uid, AppError } from '../../../../packages/database/types';
import { mailEvent } from '../../../../packages/notifications/server';
import type { BookingForCalendar } from './calendar-google.server';
import { calendarEventId, calendarSchedulingEnabled, syncGoogleEvent, GoogleCalendarFailure } from './calendar-google.server';
export { assertCalendarSlot, calendarEventId, calendarSchedulingEnabled, googleBusy, overlaps } from './calendar-google.server';

/** Versioned D1 sync projection. Never contact Google inside a D1 batch. */
/** One deterministic external ID per booking: retries cannot create duplicate appointments. */
export function calendarSyncStatement(env: Env, bookingId: string, targetVersion: number) {
  const time = now();
  return statement(env.DB,
    "INSERT INTO booking_calendar_sync(booking_id,event_id,target_version,status,next_attempt_at,updated_at) VALUES(?,?,?,'pending',?,?) " +
    "ON CONFLICT(booking_id) DO UPDATE SET target_version=excluded.target_version,status='pending',attempts=0," +
    "next_attempt_at=excluded.next_attempt_at,updated_at=excluded.updated_at,lease_token=NULL,lease_until=NULL,error_code=NULL " +
    "WHERE excluded.target_version>booking_calendar_sync.target_version",
    bookingId, calendarEventId(bookingId), targetVersion, time, time,
  );
}
export async function dispatchCalendarSync(env: Env, maxJobs = 4): Promise<void> {
  if (!calendarSchedulingEnabled(env)) return;
  const candidates = await statement(env.DB,
    "SELECT booking_id FROM booking_calendar_sync WHERE (status='pending' AND next_attempt_at<=?) " +
    "OR (status='processing' AND lease_until<?) ORDER BY updated_at LIMIT ?",
    now(), now(), maxJobs,
  ).all<{ booking_id: string }>();
  for (const candidate of candidates.results) {
    const lease = uid('calendar_lease');
    const item = await statement(env.DB,
      "UPDATE booking_calendar_sync SET status='processing',lease_token=?,lease_until=?,attempts=attempts+1 " +
      "WHERE booking_id=? AND ((status='pending' AND next_attempt_at<=?) OR (status='processing' AND lease_until<?)) " +
      "RETURNING booking_id,event_id,target_version,attempts",
      lease, new Date(Date.now() + 120000).toISOString(), candidate.booking_id, now(), now(),
    ).first<{ booking_id: string; event_id: string; target_version: number; attempts: number }>();
    if (!item) continue;
    try {
      const booking = await statement(env.DB,
        "SELECT b.id,b.reference,b.starts_at,b.ends_at,b.reserved_start,b.reserved_end,b.status,b.version," +
        "s.name AS service_name,p.address,p.suburb FROM bookings b JOIN services s ON s.id=b.service_id " +
        "JOIN properties p ON p.id=b.property_id WHERE b.id=?",
        item.booking_id,
      ).first<BookingForCalendar>();
      if (!booking) throw new GoogleCalendarFailure('CALENDAR_BOOKING_MISSING', false);
      if (booking.version !== item.target_version)
        throw new GoogleCalendarFailure('CALENDAR_STALE_JOB');
      await syncGoogleEvent(env, booking, item.event_id);
      await statement(env.DB,
        "UPDATE booking_calendar_sync SET status='synced',synced_version=?,synced_at=?,error_code=NULL," +
        "lease_token=NULL,lease_until=NULL,updated_at=? " +
        "WHERE booking_id=? AND lease_token=? AND target_version=?",
        item.target_version, now(), now(), item.booking_id, lease, item.target_version,
      ).run();
    } catch (error) {
      const failure = error instanceof GoogleCalendarFailure ? error :
        new GoogleCalendarFailure('CALENDAR_SYNC_UNEXPECTED');
      const attention = !failure.retryable || item.attempts >= 6;
      const updated = await statement(env.DB,
        "UPDATE booking_calendar_sync SET status=?,error_code=?,next_attempt_at=?,lease_token=NULL,lease_until=NULL,updated_at=? " +
        "WHERE booking_id=? AND lease_token=? AND target_version=? RETURNING booking_id",
        attention ? 'attention' : 'pending', failure.code,
        new Date(Date.now() + Math.min(3600000, 60000 * 2 ** item.attempts)).toISOString(),
        now(), item.booking_id, lease, item.target_version,
      ).first();
      if (updated && attention && env.OPERATIONS_EMAIL) {
        // Do not expose Google error bodies or confidential property access.
        const notice = await mailEvent(env, 'operations.calendar_sync_attention', {
          to: env.OPERATIONS_EMAIL,
          subject: 'ProInspect calendar synchronisation needs review',
          heading: 'Calendar appointment needs attention',
          body: 'An operational booking could not be synchronised with Google Calendar. Review its sync status in the Staff portal.',
          href: env.APP_ORIGIN + '/w/staff/operations',
          facts: { 'Sync error code': failure.code },
        });
        await notice.run();
      }
    }
  }
}
export async function calendarSyncSummary(env: Env) {
  if (!calendarSchedulingEnabled(env)) return { enabled: false, counts: [], alerts: [] };
  const counts = await statement(env.DB,
    'SELECT status,COUNT(*) AS count FROM booking_calendar_sync GROUP BY status ORDER BY status',
  ).all<{ status: string; count: number }>();
  const alerts = await statement(env.DB,
    "SELECT booking_id,status,error_code,updated_at FROM booking_calendar_sync WHERE status='attention' " +
    'ORDER BY updated_at DESC LIMIT 25',
  ).all<{ booking_id: string; status: string; error_code: string; updated_at: string }>();
  return { enabled: calendarSchedulingEnabled(env), counts: counts.results, alerts: alerts.results };
}

/** Explicit, privileged retry after operators resolve a calendar conflict. */
export async function retryCalendarSync(env: Env, bookingId: string, actorId: string) {
  if (!calendarSchedulingEnabled(env))
    throw new AppError(409, 'CALENDAR_SYNC_DISABLED', 'Operational calendar synchronisation is not enabled.');
  if (!/^bkg_[0-9a-f]{32}$/.test(bookingId))
    throw new AppError(422, 'BOOKING_INVALID', 'Choose a valid booking.');
  const time = now();
  const row = await statement(env.DB,
    "UPDATE booking_calendar_sync SET status='pending',attempts=0,error_code=NULL," +
    "next_attempt_at=?,updated_at=?,lease_token=NULL,lease_until=NULL " +
    "WHERE booking_id=? AND status='attention' RETURNING booking_id",
    time, time, bookingId,
  ).first();
  if (!row) throw new AppError(409, 'CALENDAR_RETRY_UNAVAILABLE', 'This booking is not awaiting calendar review.');
  await statement(env.DB,
    "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) " +
    "VALUES(?,?,'booking.calendar_sync_retry','booking',?,'{}',?)",
    uid('aud'), actorId, bookingId, time,
  ).run();
  return { queued: true, bookingId };
}
