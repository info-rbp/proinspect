# Google Calendar — read-only Cloudflare connectivity test

This implementation validates the currently configured production Worker bindings
without creating any Google Calendar event, customer booking, Work Order, payment,
subscription, property, or D1 audit record.

## Cloudflare configuration

The deployed `proinspect-platform` Worker must have:

| Binding | Type | Required |
|---|---|---|
| `GOOGLE_CALENDAR_ENABLED` | plaintext variable | `true` for test |
| `GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL` | variable or secret | service account email |
| `GOOGLE_CALENDAR_PRIVATE_KEY` | **encrypted secret** | PKCS#8 PEM; escaped newlines supported |
| `GOOGLE_CALENDAR_ID` | variable | fully qualified target calendar ID |
| `GOOGLE_CALENDAR_TIMEZONE` | variable | IANA zone, e.g. `Australia/Perth` |

No private key, calendar identifier, or OAuth token belongs in GitHub source,
Wrangler plaintext vars, or Cloudflare diagnostic logs.

## Manual authenticated check

An authenticated **operations manager or administrator** can call
`GET /api/staff/calendar-diagnostic` with their existing staff session.

- Unauthorized/anonymous users receive 401/403 before any Google request.
- Responses expose `ok`, `phase`, a fixed diagnostic `code`, a UTC
  `checkedAt` timestamp, and optionally upstream HTTP response status.
- Never display OAuth tokens, JWT assertions, private-key material, calendar IDs,
  event details, or untrusted Google error strings.
- Read-only Google calls: OAuth token issuance and
  `POST https://www.googleapis.com/calendar/v3/freeBusy` only, scoped to
  `https://www.googleapis.com/auth/calendar.events.freebusy`.
- Google can return HTTP 200 and still return a *per-calendar* error. The
  diagnostic correctly treats those responses as failures.

### Diagnostic codes and remediation

| Code | Meaning / action |
|---|---|
| `GOOGLE_CALENDAR_FREEBUSY_OK` | OAuth and authorised calendar availability both succeeded |
| `CALENDAR_DISABLED` | Set `GOOGLE_CALENDAR_ENABLED=true` only for intended test/use |
| `CONFIGURATION_INCOMPLETE` | One or more required bindings missing |
| `IDENTIFIER_INVALID` | Correct service account email/calendar ID formatting |
| `TIMEZONE_INVALID` | Use an IANA zone, e.g. `Australia/Perth` |
| `PRIVATE_KEY_INVALID` | Check PEM formatting, escaped newlines, revoked key |
| `OAUTH_REJECTED` | Check enabled Calendar API, service account identity, key and Google Cloud policy; HTTP status included |
| `OAUTH_TOKEN_MISSING` | OAuth server did not return expected token |
| `OAUTH_NETWORK_ERROR` | Cloudflare outbound connection/timeout to OAuth |
| `FREEBUSY_REJECTED` | Google Calendar HTTP rejection; check OAuth scope/API enablement and sharing |
| `CALENDAR_NOT_FOUND_OR_UNSHARED` | Share the **exact** operations calendar with service account, at least free/busy access |
| `CALENDAR_ACCESS_DENIED` | Service account lacks required calendar permissions |
| `CALENDAR_RESPONSE_MISSING` or `CALENDAR_RESPONSE_INVALID` | Unexpected Free/Busy response |
| `FREEBUSY_NETWORK_ERROR` | Google Calendar API connectivity or timeout |

## One-time production smoke test

The existing `*/2` Worker cron runs a diagnostic at most once every 10 minutes
within the **fixed release window from 19 October to 21 October 2026 UTC**.
There is no permanent polling after the window.

Each test produces one sanitized Workers Observability event:
`google_calendar.readonly_probe`. Inspect Workers Logs for
`proinspect-platform`; only aggregate result fields are recorded.
This temporary probe should be removed after the first confirmed live result.

Google OAuth requests have a 10-second timeout; Free/Busy has its own
10-second timeout. Google API failures do not block the Worker's existing
notifications or other scheduled integrations.

## Security and acceptance

Test in GitHub CI with generated test-only RSA keys and mocked outbound Google
endpoints; never call Google with production secrets in CI. CI verifies one
OAuth POST, one Free/Busy POST, no event-modifying methods, success, failure,
bad configuration, and secure staff-only routing.

Before calling production connectivity **verified**, independently confirm the
live Workers Observability result from the deployed Worker. A valid binding name
or successful isolated test alone is not proof of Google account/calendar access.

Do not use Free/Busy results as ProInspect's authoritative booking schedule.
Live bookings still require the Durable Object's conflict checks, an approved
payment policy, and retry-safe event sync.
