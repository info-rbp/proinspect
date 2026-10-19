import type { Env } from '../../../../packages/database/types';
import { now, statement, uid, AppError } from '../../../../packages/database/types';
import { mailEvent } from '../../../../packages/notifications/server';
import { googleServiceToken } from './google-calendar.server';

/**
 * ProInspect/D1 owns reservations. Google is an external busy-time veto and
 * eventually-consistent operational calendar, never the booking authority.
 * Do not log response bodies, access tokens, credentials or event descriptions.
 *
 * The separate BOOKINGS flag is deliberately off by default so the existing
 * read-only calendar diagnostic can remain enabled without enabling writes.
 */
const FREEBUSY_SCOPE = 'https://www.googleapis.com/auth/calendar.events.freebusy';
const EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GOOGLE = 'https://www.googleapis.com/calendar/v3';
type CalendarEnv = Pick<Env,
  'GOOGLE_CALENDAR_ENABLED' | 'GOOGLE_CALENDAR_BOOKINGS_ENABLED' |
  'GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL' | 'GOOGLE_CALENDAR_PRIVATE_KEY' |
  'GOOGLE_CALENDAR_ID' | 'GOOGLE_CALENDAR_TIMEZONE'>;

export interface ReservedWindow {
  reservedStart: string;
  reservedEnd: string;
}
export interface BusyPeriod { start: string; end: string; }

export class GoogleCalendarFailure extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, retryable = true) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}
export function calendarSchedulingEnabled(env: CalendarEnv): boolean {
  return env.GOOGLE_CALENDAR_ENABLED === 'true' &&
    env.GOOGLE_CALENDAR_BOOKINGS_ENABLED === 'true';
}
export function calendarEventId(bookingId: string): string {
  // Base32hex event IDs accept lowercase 0-9 and a-v. Booking UUIDs are hex.
  if (!/^bkg_[0-9a-f]{32}$/.test(bookingId))
    throw new GoogleCalendarFailure('CALENDAR_BOOKING_ID_INVALID', false);
  return 'pi' + bookingId.slice(4);
}
export function overlaps(a: BusyPeriod, b: BusyPeriod): boolean {
  return a.start < b.end && a.end > b.start;
}
function calendarId(env: CalendarEnv): string {
  const id = env.GOOGLE_CALENDAR_ID?.trim();
  if (!id || !env.GOOGLE_CALENDAR_TIMEZONE)
    throw new GoogleCalendarFailure('CALENDAR_CONFIG_MISSING', false);
  return id;
}
function googleStatus(status: number): GoogleCalendarFailure {
  if (status === 401 || status === 403) return new GoogleCalendarFailure('CALENDAR_PERMISSION_DENIED', false);
  if (status === 404) return new GoogleCalendarFailure('CALENDAR_NOT_FOUND', false);
  if (status === 429) return new GoogleCalendarFailure('CALENDAR_RATE_LIMITED');
  if (status >= 500) return new GoogleCalendarFailure('CALENDAR_GOOGLE_UNAVAILABLE');
  return new GoogleCalendarFailure('CALENDAR_REQUEST_REJECTED', false);
}
async function token(env: CalendarEnv, scope: string): Promise<string> {
  try {
    return await googleServiceToken(env, scope);
  } catch {
    throw new GoogleCalendarFailure('CALENDAR_OAUTH_UNAVAILABLE');
  }
}
async function googleFetch(url: string, accessToken: string, method = 'GET', body?: unknown): Promise<Response> {
  try {
    return await fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + accessToken,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new GoogleCalendarFailure('CALENDAR_NETWORK_UNAVAILABLE');
  }
}
function validPeriod(p: unknown): p is BusyPeriod {
  if (!p || typeof p !== 'object') return false;
  const item = p as Record<string, unknown>;
  return typeof item.start === 'string' && typeof item.end === 'string' &&
    Number.isFinite(Date.parse(item.start)) && Number.isFinite(Date.parse(item.end)) &&
    Date.parse(item.start) < Date.parse(item.end);
}
function utcPeriod(p: BusyPeriod): BusyPeriod {
  return { start: new Date(p.start).toISOString(), end: new Date(p.end).toISOString() };
}
export async function googleBusy(env: CalendarEnv, start: string, end: string): Promise<BusyPeriod[]> {
  const id = calendarId(env);
  const accessToken = await token(env, FREEBUSY_SCOPE);
  const response = await googleFetch(GOOGLE + '/freeBusy', accessToken, 'POST', {
    timeMin: start, timeMax: end, timeZone: env.GOOGLE_CALENDAR_TIMEZONE,
    items: [{ id }],
  });
  if (!response.ok) throw googleStatus(response.status);
  let responseBody: { calendars?: Record<string, { busy?: unknown; errors?: unknown[] }> };
  try { responseBody = await response.json(); }
  catch { throw new GoogleCalendarFailure('CALENDAR_RESPONSE_INVALID'); }
  const c = responseBody?.calendars?.[id];
  if (c?.errors?.length) throw new GoogleCalendarFailure('CALENDAR_ACCESS_REJECTED', false);
  if (!Array.isArray(c?.busy) || !c.busy.every(validPeriod))
    throw new GoogleCalendarFailure('CALENDAR_RESPONSE_INVALID');
  return c.busy.map(utcPeriod);
}

type EventItem = {
  id?: string; status?: string; transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: { proinspectBookingId?: string } };
};
async function calendarEvents(env: CalendarEnv, start: string, end: string, accessToken: string): Promise<EventItem[]> {
  const url = GOOGLE + '/calendars/' + encodeURIComponent(calendarId(env)) + '/events';
  const result: EventItem[] = [];
  let page = '';
  for (let attempt = 0; attempt < 6; attempt++) {
    const params = new URLSearchParams({
      timeMin: start, timeMax: end, singleEvents: 'true', maxResults: '250',
    });
    if (page) params.set('pageToken', page);
    const response = await googleFetch(url + '?' + params.toString(), accessToken);
    if (!response.ok) throw googleStatus(response.status);
    let body: { items?: EventItem[]; nextPageToken?: string };
    try { body = await response.json(); }
    catch { throw new GoogleCalendarFailure('CALENDAR_RESPONSE_INVALID'); }
    if (!Array.isArray(body.items)) throw new GoogleCalendarFailure('CALENDAR_RESPONSE_INVALID');
    result.push(...body.items);
    if (!body.nextPageToken) return result;
    page = body.nextPageToken;
  }
  // Never infer an empty slot from an incomplete pagination response.
  throw new GoogleCalendarFailure('CALENDAR_RESULTS_TRUNCATED');
}
function eventPeriod(event: EventItem): BusyPeriod | null {
  const start = event.start?.dateTime ?? (event.start?.date ? event.start.date + 'T00:00:00Z' : '');
  const end = event.end?.dateTime ?? (event.end?.date ? event.end.date + 'T00:00:00Z' : '');
  if (!validPeriod({ start, end })) throw new GoogleCalendarFailure('CALENDAR_RESPONSE_INVALID');
  return utcPeriod({ start, end });
}
export async function assertCalendarSlot(
  env: CalendarEnv, window: ReservedWindow, excludingEventId?: string,
): Promise<void> {
  if (!calendarSchedulingEnabled(env)) return;
  try {
    const block = { start: window.reservedStart, end: window.reservedEnd };
    let conflicts: BusyPeriod[];
    if (excludingEventId) {
      // FreeBusy cannot distinguish the booking's existing event. List events
      // so moving an appointment does not conflict with itself.
      const accessToken = await token(env, EVENTS_SCOPE);
      const events = await calendarEvents(env, block.start, block.end, accessToken);
      conflicts = events
        .filter(e => e.id !== excludingEventId && e.status !== 'cancelled' && e.transparency !== 'transparent')
        .map(eventPeriod).filter((p): p is BusyPeriod => p !== null);
    } else {
      conflicts = await googleBusy(env, block.start, block.end);
    }
    if (conflicts.some(period => overlaps(period, block)))
      throw new GoogleCalendarFailure('CALENDAR_EXTERNAL_CONFLICT', false);
  } catch (error) {
    if (error instanceof GoogleCalendarFailure && error.code === 'CALENDAR_EXTERNAL_CONFLICT')
      throw new AppError(409, 'CALENDAR_CONFLICT', 'This time is busy on the ProInspect operations calendar. Choose another.');
    throw new AppError(503, 'CALENDAR_UNAVAILABLE', 'Calendar availability cannot be verified right now. Please retry.');
  }
}

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
type BookingForCalendar = {
  id: string; reference: string; starts_at: string; ends_at: string;
  reserved_start: string; reserved_end: string; status: string; version: number;
  service_name: string; address: string; suburb: string;
};
function eventBody(b: BookingForCalendar, eventId: string) {
  return {
    id: eventId,
    summary: 'ProInspect | ' + b.service_name.slice(0, 100),
    description: 'ProInspect booking ' + b.reference + '. See the ProInspect Staff portal for access details.',
    location: b.address + ', ' + b.suburb + ', WA',
    start: { dateTime: b.starts_at, timeZone: 'Australia/Perth' },
    end: { dateTime: b.ends_at, timeZone: 'Australia/Perth' },
    extendedProperties: { private: { proinspectBookingId: b.id, proinspectVersion: String(b.version) } },
  };
}
export async function syncGoogleEvent(env: CalendarEnv, booking: BookingForCalendar, eventId: string): Promise<void> {
  const accessToken = await token(env, EVENTS_SCOPE);
  const url = GOOGLE + '/calendars/' + encodeURIComponent(calendarId(env)) + '/events';
  const eventUrl = url + '/' + encodeURIComponent(eventId);
  const existingResponse = await googleFetch(eventUrl, accessToken);
  if (!existingResponse.ok && existingResponse.status !== 404) throw googleStatus(existingResponse.status);
  let existing: EventItem | null = null;
  if (existingResponse.ok) {
    try { existing = await existingResponse.json(); }
    catch { throw new GoogleCalendarFailure('CALENDAR_RESPONSE_INVALID'); }
    if (existing?.id !== eventId || existing?.extendedProperties?.private?.proinspectBookingId !== booking.id)
      throw new GoogleCalendarFailure('CALENDAR_EVENT_ID_COLLISION', false);
  }
  if (booking.status === 'cancelled') {
    if (!existing) return;
    const response = await googleFetch(eventUrl, accessToken, 'DELETE');
    if (!response.ok && response.status !== 404 && response.status !== 410)
      throw googleStatus(response.status);
    return;
  }
  // Event writes are additionally vetoed by external events, excluding our
  // own existing event on reschedule. A conflict requires operational review.
  const nearby = await calendarEvents(env, booking.reserved_start, booking.reserved_end, accessToken);
  const block = { start: booking.reserved_start, end: booking.reserved_end };
  const conflicting = nearby
    .filter(e => e.id !== eventId && e.status !== 'cancelled' && e.transparency !== 'transparent')
    .map(eventPeriod).filter((p): p is BusyPeriod => p !== null)
    .some(p => overlaps(p, block));
  if (conflicting) throw new GoogleCalendarFailure('CALENDAR_EXTERNAL_CONFLICT', false);
  const body = eventBody(booking, eventId);
  const method = existing ? 'PATCH' : 'POST';
  const response = await googleFetch(existing ? eventUrl : url, accessToken, method, body);
  if (!response.ok) {
    if (!existing && response.status === 409)
      // Another attempt may have inserted the deterministic ID. A subsequent
      // retry validates ownership and patches it without creating a duplicate.
      throw new GoogleCalendarFailure('CALENDAR_EVENT_ALREADY_EXISTS');
    throw googleStatus(response.status);
  }
  let updated: { id?: string };
  try { updated = await response.json(); }
  catch { throw new GoogleCalendarFailure('CALENDAR_RESPONSE_INVALID'); }
  if (updated?.id !== eventId) throw new GoogleCalendarFailure('CALENDAR_RESPONSE_INVALID');
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
