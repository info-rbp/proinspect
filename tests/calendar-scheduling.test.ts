import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCalendarSlot, calendarEventId, calendarSchedulingEnabled, googleBusy,
  syncGoogleEvent, overlaps, GoogleCalendarFailure,
} from '../apps/platform/worker/features/calendar-scheduling.server.ts';

const BOOKING_ID = 'bkg_' + 'a'.repeat(32);
const EVENT_ID = calendarEventId(BOOKING_ID);
const CALENDAR_ID = 'synthetic-operations@group.calendar.google.com';
const start = '2026-10-27T01:00:00.000Z';
const end = '2026-10-27T02:00:00.000Z';
const base = {
  GOOGLE_CALENDAR_ENABLED: 'true',
  GOOGLE_CALENDAR_BOOKINGS_ENABLED: 'true',
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL: 'calendar-test@proinspect-test.iam.gserviceaccount.com',
  GOOGLE_CALENDAR_ID: CALENDAR_ID,
  GOOGLE_CALENDAR_TIMEZONE: 'Australia/Perth',
};
const booking = {
  id: BOOKING_ID, reference: 'PI-TESTBOOK', status: 'confirmed', version: 1,
  starts_at: start, ends_at: end, reserved_start: start, reserved_end: end,
  service_name: 'Property Condition Report',
  address: '123 Synthetic Road', suburb: 'Perth',
};
async function fakePrivateKey() {
  const pair = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
  }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  return '-----BEGIN PRIVATE KEY-----\\n' +
    Buffer.from(raw).toString('base64').match(/.{1,64}/g)?.join('\\n') +
    '\\n-----END PRIVATE KEY-----';
}
async function withGoogle(
  action: (request: Request, calls: string[]) => Promise<Response>,
  run: (env: typeof base & { GOOGLE_CALENDAR_PRIVATE_KEY: string }, calls: string[]) => Promise<void>,
) {
  const original = globalThis.fetch;
  const calls: string[] = [];
  const env = { ...base, GOOGLE_CALENDAR_PRIVATE_KEY: await fakePrivateKey() };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push(request.method + ' ' + request.url);
    if (request.url === 'https://oauth2.googleapis.com/token') {
      const assertion = new URLSearchParams(await request.text()).get('assertion') || '';
      const payload = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString());
      assert.ok([
        'https://www.googleapis.com/auth/calendar.events.freebusy',
        'https://www.googleapis.com/auth/calendar.events',
      ].includes(payload.scope));
      return Response.json({ access_token: 'synthetic-test-token' });
    }
    return action(request, calls);
  }) as typeof fetch;
  try { await run(env, calls); }
  finally { globalThis.fetch = original; }
}
const response = (busy: { start: string; end: string }[]) =>
  Response.json({ calendars: { [CALENDAR_ID]: { busy } } });
const event = (id = EVENT_ID) => ({
  id, extendedProperties: { private: { proinspectBookingId: BOOKING_ID } },
  start: { dateTime: start }, end: { dateTime: end },
});

test('calendar scheduling is independently gated; event IDs are valid and stable', async () => {
  assert.equal(calendarSchedulingEnabled({ ...base, GOOGLE_CALENDAR_BOOKINGS_ENABLED: 'false' }), false);
  assert.equal(calendarSchedulingEnabled(base), true);
  assert.match(EVENT_ID, /^[0-9a-v]{5,1024}$/);
  assert.equal(calendarEventId(BOOKING_ID), EVENT_ID);
  assert.throws(() => calendarEventId('bkg_invalid'), GoogleCalendarFailure);
  assert.equal(overlaps({ start, end }, { start: end, end: '2026-10-27T03:00:00.000Z' }), false);
});

test('Google FreeBusy slots exclude external conflicts and preserve privacy', async () => {
  await withGoogle(async (req) => {
    assert.equal(req.url, 'https://www.googleapis.com/calendar/v3/freeBusy');
    assert.equal(req.method, 'POST');
    assert.equal(req.headers.get('authorization'), 'Bearer synthetic-test-token');
    const body = await req.json() as { items: { id: string }[]; timeZone: string };
    assert.deepEqual(body.items, [{ id: CALENDAR_ID }]);
    assert.equal(body.timeZone, 'Australia/Perth');
    return response([{ start: '2026-10-27T01:30:00Z', end: '2026-10-27T02:30:00Z' }]);
  }, async (env, calls) => {
    const busy = await googleBusy(env, start, end);
    assert.equal(busy.length, 1);
    assert.equal(busy[0].start, '2026-10-27T01:30:00.000Z');
    await assert.rejects(assertCalendarSlot(env, { reservedStart: start, reservedEnd: end }),
      (err: any) => err?.status === 409 && err?.code === 'CALENDAR_CONFLICT');
    assert.equal(calls.filter(x => x.includes('/freeBusy')).length, 2);
  });
});

test('Google FreeBusy errors fail closed and do not expose Google response text', async () => {
  await withGoogle(async () => Response.json({
    calendars: { [CALENDAR_ID]: { errors: [{ reason: 'notFound', description: 'DO NOT LEAK PRIVATE INFO' }] } },
  }), async (env) => {
    await assert.rejects(googleBusy(env, start, end),
      (err: any) => err?.code === 'CALENDAR_ACCESS_REJECTED' && !String(err).includes('DO NOT LEAK'));
    await assert.rejects(assertCalendarSlot(env, { reservedStart: start, reservedEnd: end }),
      (err: any) => err?.status === 503 && err?.code === 'CALENDAR_UNAVAILABLE');
  });
});

test('rescheduling does not collide with its existing calendar event', async () => {
  await withGoogle(async (req) => {
    assert.ok(req.url.includes('/calendars/' + encodeURIComponent(CALENDAR_ID) + '/events?'));
    return Response.json({ items: [
      event(),
      { ...event('external-event'), start: { dateTime: '2026-10-27T05:00:00Z' },
        end: { dateTime: '2026-10-27T06:00:00Z' } },
    ] });
  }, async (env) => {
    await assertCalendarSlot(env, { reservedStart: start, reservedEnd: end }, EVENT_ID);
  });
  await withGoogle(async () => Response.json({ items: [
    { ...event('external-occupied'), start: { dateTime: start }, end: { dateTime: end } },
  ] }), async (env) => {
    await assert.rejects(assertCalendarSlot(env, { reservedStart: start, reservedEnd: end }, EVENT_ID),
      (err: any) => err?.status === 409 && err?.code === 'CALENDAR_CONFLICT');
  });
});

test('Google event insertion uses deterministic ID, no sensitive access and detects conflicts', async () => {
  await withGoogle(async (req) => {
    if (req.method === 'GET' && req.url.endsWith('/' + EVENT_ID)) return new Response(null, { status: 404 });
    if (req.method === 'GET' && req.url.includes('?')) return Response.json({ items: [] });
    assert.equal(req.method, 'POST');
    const body = await req.json() as { id: string; description: string; extendedProperties: { private: { proinspectBookingId: string } } };
    assert.equal(body.id, EVENT_ID);
    assert.equal(body.extendedProperties.private.proinspectBookingId, BOOKING_ID);
    assert.ok(!JSON.stringify(body).includes('lockbox'));
    assert.ok(!JSON.stringify(body).includes('synthetic-test-token'));
    return Response.json({ id: EVENT_ID });
  }, async (env, calls) => {
    await syncGoogleEvent(env, booking, EVENT_ID);
    assert.equal(calls.filter(x => x.startsWith('POST https://www.googleapis.com/calendar/v3/calendars/')).length, 1);
  });
});

test('rescheduling patches existing event; cancellation deletes that exact event', async () => {
  const methods: string[] = [];
  await withGoogle(async (req) => {
    if (req.url.endsWith('/' + EVENT_ID) && req.method === 'GET') return Response.json(event());
    if (req.method === 'GET' && req.url.includes('?')) return Response.json({ items: [event()] });
    methods.push(req.method);
    if (req.method === 'PATCH') return Response.json({ id: EVENT_ID });
    if (req.method === 'DELETE') return new Response(null, { status: 204 });
    return new Response(null, { status: 500 });
  }, async (env) => {
    await syncGoogleEvent(env, { ...booking, version: 2, starts_at: '2026-10-27T01:15:00Z' }, EVENT_ID);
    await syncGoogleEvent(env, { ...booking, status: 'cancelled', version: 3 }, EVENT_ID);
  });
  assert.deepEqual(methods, ['PATCH', 'DELETE']);
});

test('event ownership collision is never overwritten or deleted', async () => {
  await withGoogle(async (req) => {
    if (req.method === 'GET') return Response.json({
      ...event(), extendedProperties: { private: { proinspectBookingId: 'other-booking' } },
    });
    throw new Error('should not attempt calendar mutation');
  }, async (env) => {
    await assert.rejects(syncGoogleEvent(env, booking, EVENT_ID),
      (err: any) => err?.code === 'CALENDAR_EVENT_ID_COLLISION' && err.retryable === false);
    await assert.rejects(syncGoogleEvent(env, { ...booking, status: 'cancelled' }, EVENT_ID),
      (err: any) => err?.code === 'CALENDAR_EVENT_ID_COLLISION');
  });
});
