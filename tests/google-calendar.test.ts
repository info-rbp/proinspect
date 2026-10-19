import test from 'node:test';
import assert from 'node:assert/strict';
import { readOnlyCalendarDiagnostic, shouldRunCalendarReleaseProbe } from '../apps/platform/worker/features/google-calendar.server.ts';

const base = {
  GOOGLE_CALENDAR_ENABLED: 'true',
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL: 'calendar-test@proinspect-test.iam.gserviceaccount.com',
  GOOGLE_CALENDAR_ID: 'synthetic-calendar@group.calendar.google.com',
  GOOGLE_CALENDAR_TIMEZONE: 'Australia/Perth',
};
async function fakePrivateKey() {
  const pair = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
  }, true, ['sign', 'verify']);
  const data = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  return '-----BEGIN PRIVATE KEY-----\n' +
    Buffer.from(data).toString('base64').match(/.{1,64}/g)?.join('\n') +
    '\n-----END PRIVATE KEY-----\n';
}
function replacement(callback: (request: Request) => Promise<Response>) {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    urls.push(request.url);
    return callback(request);
  }) as typeof fetch;
  return { urls, restore: () => { globalThis.fetch = original; } };
}

test('missing or disabled configuration performs no network calls', async () => {
  const mock = replacement(async () => { throw new Error('should not fetch'); });
  try {
    assert.deepEqual(
      (({ ok, phase, code }) => ({ ok, phase, code }))(
        await readOnlyCalendarDiagnostic({ ...base, GOOGLE_CALENDAR_ENABLED: 'false' }),
      ),
      { ok: false, phase: 'configuration', code: 'CALENDAR_DISABLED' },
    );
    assert.equal(
      (await readOnlyCalendarDiagnostic(base)).code,
      'CONFIGURATION_INCOMPLETE',
    );
    assert.equal(mock.urls.length, 0);
  } finally { mock.restore(); }
});

test('invalid timezone, email and private keys fail closed without Google calls', async () => {
  const mock = replacement(async () => { throw new Error('network must not be called'); });
  try {
    assert.equal((await readOnlyCalendarDiagnostic({
      ...base, GOOGLE_CALENDAR_TIMEZONE: 'Not a timezone',
      GOOGLE_CALENDAR_PRIVATE_KEY: 'invalid',
    })).code, 'TIMEZONE_INVALID');
    assert.equal((await readOnlyCalendarDiagnostic({
      ...base, GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL: 'attacker@example.invalid',
      GOOGLE_CALENDAR_PRIVATE_KEY: 'invalid',
    })).code, 'IDENTIFIER_INVALID');
    assert.equal((await readOnlyCalendarDiagnostic({
      ...base, GOOGLE_CALENDAR_PRIVATE_KEY: 'invalid',
    })).code, 'PRIVATE_KEY_INVALID');
    assert.equal(mock.urls.length, 0);
  } finally { mock.restore(); }
});

test('real RSA signature, OAuth exchange, then read-only FreeBusy; no secrets returned', async () => {
  const privateKey = await fakePrivateKey();
  let exchangeCount = 0;
  let freebusyCount = 0;
  const mock = replacement(async (request) => {
    assert.equal(request.method, 'POST');
    if (request.url === 'https://oauth2.googleapis.com/token') {
      exchangeCount++;
      assert.equal(request.headers.get('content-type'), 'application/x-www-form-urlencoded');
      const params = new URLSearchParams(await request.text());
      assert.equal(params.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const jwt = params.get('assertion') ?? '';
      const [header, payload, signature] = jwt.split('.');
      const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString());
      assert.deepEqual(decode(header), { typ: 'JWT', alg: 'RS256' });
      assert.equal(decode(payload).iss, base.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL);
      assert.equal(decode(payload).scope, 'https://www.googleapis.com/auth/calendar.events.freebusy');
      assert.equal(decode(payload).aud, request.url);
      assert.ok(decode(payload).exp > decode(payload).iat);
      assert.ok(signature.length > 60);
      return Response.json({ access_token: 'secret_test_access_token', expires_in: 3600 });
    }
    assert.equal(request.url, 'https://www.googleapis.com/calendar/v3/freeBusy');
    freebusyCount++;
    assert.equal(request.headers.get('authorization'), 'Bearer secret_test_access_token');
    const requestBody = await request.json() as { items: { id: string }[]; timeZone: string };
    assert.deepEqual(requestBody.items, [{ id: base.GOOGLE_CALENDAR_ID }]);
    assert.equal(requestBody.timeZone, 'Australia/Perth');
    return Response.json({
      kind: 'calendar#freeBusy', calendars: {
        [base.GOOGLE_CALENDAR_ID]: {
          busy: [{ start: '2026-10-19T00:00:00Z', end: '2026-10-19T01:00:00Z' }],
        },
      },
    });
  });
  try {
    const status = await readOnlyCalendarDiagnostic({
      ...base, GOOGLE_CALENDAR_PRIVATE_KEY: privateKey.replaceAll('\n', '\\n'),
    });
    assert.equal(status.ok, true);
    assert.equal(status.phase, 'complete');
    assert.equal(status.code, 'GOOGLE_CALENDAR_FREEBUSY_OK');
    assert.equal(exchangeCount, 1);
    assert.equal(freebusyCount, 1);
    assert.equal(mock.urls.length, 2);
    assert.ok(!JSON.stringify(status).includes('secret_test_access_token'));
    assert.ok(!JSON.stringify(status).includes(base.GOOGLE_CALENDAR_ID));
    assert.ok(!JSON.stringify(status).includes(privateKey.slice(0, 32)));
  } finally { mock.restore(); }
});

test('Google OAuth denial is redacted and does not call FreeBusy', async () => {
  const key = await fakePrivateKey();
  const mock = replacement(async () =>
    Response.json({ error: 'invalid_grant', error_description: 'DO NOT LOG GOOGLE PRIVATE DETAILS' }, { status: 400 }),
  );
  try {
    const diagnostic = await readOnlyCalendarDiagnostic({ ...base, GOOGLE_CALENDAR_PRIVATE_KEY: key });
    assert.equal(diagnostic.ok, false);
    assert.equal(diagnostic.phase, 'oauth');
    assert.equal(diagnostic.code, 'OAUTH_REJECTED');
    assert.equal(diagnostic.oauthStatus, 400);
    assert.equal(mock.urls.length, 1);
    assert.ok(!JSON.stringify(diagnostic).includes('DO NOT LOG'));
  } finally { mock.restore(); }
});

test('HTTP 200 with Google calendar-level notFound error is NOT a success', async () => {
  const key = await fakePrivateKey();
  const mock = replacement(async (request) => {
    if (request.url.includes('/token')) return Response.json({ access_token: 'test-token' });
    return Response.json({ calendars: {
      [base.GOOGLE_CALENDAR_ID]: {
        errors: [{ reason: 'notFound', domain: 'global' }],
      },
    } });
  });
  try {
    const result = await readOnlyCalendarDiagnostic({ ...base, GOOGLE_CALENDAR_PRIVATE_KEY: key });
    assert.equal(result.ok, false);
    assert.equal(result.phase, 'freebusy');
    assert.equal(result.code, 'CALENDAR_NOT_FOUND_OR_UNSHARED');
    assert.equal(mock.urls.length, 2);
  } finally { mock.restore(); }
});

test('production probe is short-lived and cannot run indefinitely', () => {
  assert.equal(shouldRunCalendarReleaseProbe(new Date('2026-10-19T10:20:00Z')), true);
  assert.equal(shouldRunCalendarReleaseProbe(new Date('2026-10-19T10:22:00Z')), false);
  assert.equal(shouldRunCalendarReleaseProbe(new Date('2026-10-21T00:10:00Z')), false);
});
