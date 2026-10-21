# ProInspect Public Open Home Check-In and Reporting

Branch: feature/open-home-check-in (draft PR into Leasing).
Release status: development only. Not live or merged.

The implementation covers:
- Public check-in page /open-home/check-in (name, phone, email, consent)
- Canonical property/session linkage and optional matched registration
- Restricted operations attendance register
- Automatic next-day report email scheduled for 9:00 AM Australia/Perth
- Verified agency/landlord account access to protected reports and CSV
- Delivery status tracking in the existing Cloudflare D1 outbox

Full report architecture, mail provider setup and activation checklist:
docs/OPEN_HOME_NEXT_DAY_REPORTS.md

## Existing property linkage

No duplicate property directory is created:

  properties.id
  -> leasing_listings.property_id
  -> leasing_sessions.listing_id
  -> leasing_checkins.session_id / leasing_checkins.listing_id

Only properties with approved published leasing advertisements and scheduled
inspection sessions appear in the public visitor check-in. The address,
representative and inspection session always come from existing records.

QR-ready per-inspection link:

  https://YOUR-PROINSPECT-ORIGIN/open-home/check-in?property=LISTING_ID&session=SESSION_ID

The URL contains public IDs, not contact details or credentials. The server
checks the listing/session relationship and available arrival window,
30 minutes before the published start until 45 minutes after the end.
Visitors can check in without advance registration. When the same name
and email match an existing advance registration for the same session,
the attendance links to it. Different household members sharing an email
are still recorded as distinct visitors.

The public POST uses a Turnstile action, origin verification, request limits,
an invisible honeypot, rate limiting, encrypted contact storage, and request
deduplication. Nothing in this form creates a rental application, grants a
tenancy, or constitutes marketing consent.

## Staff access

Authorised operations managers and administrators use:

  /w/staff/operations/open-home-checkins

They can filter by the advertised property and session, view arrivals, access
QR-ready session URLs, choose an authorised verified account to receive a
report, and see report dispatch/acceptance status. The public API exposes no
visitor names or contact information. The authorised client report is
available via an authenticated URL linked in the recipient's email.

## Daily automatic email timing

At 09:00 AWST on the day AFTER each inspection ends, Cloudflare Cron
(0 1 * * * in UTC) prepares a unique session report and queues a branded
email to the selected, authorised, verified leasing representative account.
The report contains attendance totals and a login-protected full register,
with CSV export from ProInspect itself. Cancelled sessions are excluded.
If the session is manually marked completed earlier, the email still
waits until the scheduled next-day 09:00 AWST job.

No Google Workspace authorization or Apps Script project is required.

## Retired Google Sheets path

The earlier future Google Sheet sync/API proposal has been superseded
by Cloudflare D1 reporting. The new visitor submission no longer writes
Sheet sync events. The Apps Script API endpoints are no longer exposed.
Some legacy table definitions and source files remain inert on this
development branch solely for compatibility and possible future export
workflows; there is no active data transfer to Google Sheets.

## Release prerequisites

- Apply D1 migration 0011 after 0010 and run full schema tests.
- Verify ProInspect's existing Resend sender domain, RESEND_API_KEY Worker
  secret, EMAIL_FROM address and a restricted staging delivery test.
  No paid Cloudflare Email Sending binding is required.
- Approve authorised client recipient accounts, written property reporting
  authority, data privacy/retention and deletion procedures.
- Test cross-client access, cancelled sessions, zero visitors, missing
  recipients, errors and duplicate Cron invocations in staging.
- Enable OPEN_HOME_REPORTS_ENABLED only after successful controlled UAT.
- Keep the feature branch draft until reviewed and deliberately merged.

See docs/OPEN_HOME_NEXT_DAY_REPORTS.md for precise instructions, especially
the existing Resend integration and 9:00 AWST scheduling behavior.
