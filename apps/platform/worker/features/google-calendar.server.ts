import type { Env } from '../../../../packages/database/types';

/**
 * Read-only Google Calendar connectivity check.
 *
 * Token requests use only the 'calendar.events.freebusy' scope. The sole
 * Google Calendar API request is freeBusy.query; no event endpoints, database
 * writes, or ProInspect bookings are touched.
 *
 * This module MUST NOT log credentials, access tokens, response bodies,
 * calendar IDs, private event details or untrusted Google error descriptions.
 */
export interface CalendarDiagnostic {
  ok: boolean;
  phase: 'configuration' | 'oauth' | 'freebusy' | 'complete';
  code: string;
  checkedAt: string;
  oauthStatus?: number;
  calendarStatus?: number;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FREEBUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.freebusy';

function result(
  ok: boolean, phase: CalendarDiagnostic['phase'], code: string,
  checkedAt: string, status?: number,
): CalendarDiagnostic {
  const out: CalendarDiagnostic = { ok, phase, code, checkedAt };
  if (status && phase === 'oauth') out.oauthStatus = status;
  if (status && phase === 'freebusy') out.calendarStatus = status;
  return out;
}

function base64url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function assertion(email: string, privateKey: string): Promise<string> {
  // The secret may be pasted as a PEM with real line breaks or JSON-escaped
  // newlines. Never include its contents in exception messages.
  const pem = privateKey.trim().replaceAll('\\n', '\n').replaceAll('\r', '');
  const match = /^-----BEGIN PRIVATE KEY-----\s+([a-zA-Z0-9+/=\s]+?)\s+-----END PRIVATE KEY-----$/.exec(pem);
  if (!match) throw new Error('KEY_FORMAT');
  const raw = atob(match[1].replace(/\s/g, ''));
  const der = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );
  const stamp = Math.floor(Date.now() / 1000);
  const encoded = (v: unknown) => base64url(new TextEncoder().encode(JSON.stringify(v)));
  const unsigned = encoded({ typ: 'JWT', alg: 'RS256' }) + '.' +
    encoded({
      iss: email,
      scope: CALENDAR_SCOPE,
      aud: TOKEN_URL,
      iat: stamp,
      exp: stamp + 900,
    });
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  );
  return unsigned + '.' + base64url(signature);
}

function calendarErrorCode(reason: unknown): string {
  // Only recognise predefined, non-sensitive Google error categories.
  if (reason === 'notFound') return 'CALENDAR_NOT_FOUND_OR_UNSHARED';
  if (reason === 'forbidden') return 'CALENDAR_ACCESS_DENIED';
  if (reason === 'internalError') return 'GOOGLE_CALENDAR_INTERNAL_ERROR';
  return 'CALENDAR_QUERY_REJECTED';
}

export async function readOnlyCalendarDiagnostic(
  env: Pick<Env,
    'GOOGLE_CALENDAR_ENABLED' |
    'GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL' |
    'GOOGLE_CALENDAR_PRIVATE_KEY' |
    'GOOGLE_CALENDAR_ID' |
    'GOOGLE_CALENDAR_TIMEZONE'>,
): Promise<CalendarDiagnostic> {
  const checkedAt = new Date().toISOString();
  const end = (phase: CalendarDiagnostic['phase'], code: string, status?: number) =>
    result(false, phase, code, checkedAt, status);

  if (env.GOOGLE_CALENDAR_ENABLED !== 'true')
    return end('configuration', 'CALENDAR_DISABLED');
  const email = env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL?.trim();
  const calendarId = env.GOOGLE_CALENDAR_ID?.trim();
  const key = env.GOOGLE_CALENDAR_PRIVATE_KEY;
  const timezone = env.GOOGLE_CALENDAR_TIMEZONE?.trim();
  if (!email || !calendarId || !key || !timezone)
    return end('configuration', 'CONFIGURATION_INCOMPLETE');
  if (!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(email) ||
      /\s/.test(calendarId))
    return end('configuration', 'IDENTIFIER_INVALID');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    return end('configuration', 'TIMEZONE_INVALID');
  }

  let jwt: string;
  try {
    jwt = await assertion(email, key);
  } catch {
    return end('configuration', 'PRIVATE_KEY_INVALID');
  }

  let accessToken: string;
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return end('oauth', 'OAUTH_REJECTED', response.status);
    const body = (await response.json()) as { access_token?: unknown };
    if (typeof body.access_token !== 'string' || !body.access_token)
      return end('oauth', 'OAUTH_TOKEN_MISSING', response.status);
    accessToken = body.access_token;
  } catch {
    return end('oauth', 'OAUTH_NETWORK_ERROR');
  }

  try {
    // The test window does not disclose or reserve appointment slots.
    const start = new Date();
    const finish = new Date(start.getTime() + 60 * 60 * 1000);
    const response = await fetch(FREEBUSY_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: start.toISOString(),
        timeMax: finish.toISOString(),
        timeZone: timezone,
        items: [{ id: calendarId }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return end('freebusy', 'FREEBUSY_REJECTED', response.status);
    const body = (await response.json()) as {
      calendars?: Record<string, { busy?: unknown; errors?: { reason?: string }[] }>;
    };
    const calendar = body?.calendars?.[calendarId];
    if (!calendar) return end('freebusy', 'CALENDAR_RESPONSE_MISSING', response.status);
    if (calendar.errors?.length)
      return end('freebusy', calendarErrorCode(calendar.errors[0]?.reason), response.status);
    if (!Array.isArray(calendar.busy))
      return end('freebusy', 'CALENDAR_RESPONSE_INVALID', response.status);
    return result(true, 'complete', 'GOOGLE_CALENDAR_FREEBUSY_OK', checkedAt);
  } catch {
    return end('freebusy', 'FREEBUSY_NETWORK_ERROR');
  }
}

/**
 * Short-lived production smoke test only. Logs one redacted result at most
 * every 10 minutes during the 2026-10-19 / 2026-10-20 release window.
 * This condition auto-expires; there is no permanent polling burden.
 */
export function shouldRunCalendarReleaseProbe(date: Date): boolean {
  return date.getTime() >= Date.parse('2026-10-19T00:00:00.000Z') &&
    date.getTime() < Date.parse('2026-10-21T00:00:00.000Z') &&
    date.getUTCMinutes() % 10 === 0;
}
