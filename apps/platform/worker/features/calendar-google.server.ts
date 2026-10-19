import type { Env } from '../../../../packages/database/types';
import { AppError } from '../../../../packages/database/types.ts';
import { googleServiceToken } from './google-calendar.server.ts';

/**
 * Google API adapter: a fail-closed availability veto and idempotent event
 * mutation, deliberately independent from D1 and notification side effects.
 * Never log remote event bodies, API tokens or private service account keys.
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
