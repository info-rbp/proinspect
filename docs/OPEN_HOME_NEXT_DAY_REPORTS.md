# ProInspect Open Home Report — 9:00 AM Perth the Next Day

Branch: feature/open-home-check-in (draft PR targeting Leasing).
Release state: implemented in feature branch, not deployed. Does not require
Google Apps Script or Google Sheets.

## Workflow

1. Authorised ProInspect operations staff select an advertised property in
   Staff > Open home attendance, enable next-day reports, select a verified
   ProInspect account from the instructing agency or recorded landlord, and
   record the written authority reference for attendance report sharing.
   Arbitrary addresses cannot be entered.
2. Visitors check in at the property using the normal public website or
   property/session QR-ready URL. Their contact records remain encrypted in
   D1, linked to the approved listing, inspection and optional preregistration.
3. When the inspection finishes, no automatic report is sent immediately.
   A staff member may also mark the session completed earlier without
   triggering an early email. Cancelled sessions never receive a report.
4. At 09:00 Australia/Perth on the day after the inspection ENDS, a
   dedicated Cloudflare Worker Cron selects yesterday's inspection sessions,
   marks them completed, computes attendance totals and creates one
   immutable report + encrypted outbox job per session.
5. Cloudflare Queues drives the existing outbox processor. The report email
   includes the property, inspection time, total checked-in visitors,
   preregistered arrivals, walk-ins and advance registrations. It links to
   a login-protected ProInspect report and attendee CSV.
6. ProInspect operations staff can review each report's pending/processing,
   sent or failed delivery status. Sent means provider accepted the message,
   not that the recipient read or received it in their inbox.

## Precise date and schedule

Cloudflare Cron is UTC. Perth is UTC+08:00 year-round, so the exact
configured daily trigger is:

    0 1 * * *

01:00 UTC = 09:00 in Australia/Perth.

The Worker uses the Cron event's scheduledTime, not wall-clock execution
time, to choose the previous Perth calendar day. It selects inspection
sessions with end time between that day's 00:00 AWST inclusive and the
following day's 00:00 AWST exclusive.

Example: an inspection ending at 1:30 PM AWST on 21 October is scheduled
for a report at 9:00 AM AWST on 22 October. A session ending immediately
after midnight counts against that new end-date, not its start-date.

Cron dispatch, queue consumption and external email delivery can be delayed;
09:00 is the automatic dispatch trigger, not a guarantee of inbox delivery.

## Data and security

- Leasing property source of truth: canonical properties -> leasing_listings
  -> leasing_sessions -> leasing_checkins.
- Migration 0011 adds open_home_report_settings and
  open_home_inspection_reports. session_id is unique in the latter,
  ensuring one logical report per inspection.
- Report setup requires a currently active, verified ProInspect user with
  an active owner/admin membership in the property's instructing client or
  recorded owner client. These memberships are checked on setup, report
  generation and email delivery.
- Revocation or changing the configured recipient prevents pending emails
  from going to a stale mailbox.
- The email never includes raw visitor names, numbers or email addresses.
  /open-home/report/:sessionId requires an authenticated ProInspect account.
  Nonstaff users must be the report's original recipient, still selected
  in property report settings, and still authorised under their client.
- The CSV is served through the same protected API with formula-escaping,
  no-store responses and no publicly accessible file link.
- Attendance data may only be used for inspection administration and
  authorised client reporting, not a marketing mailing list. Privacy
  reviews, retention/erasure procedures, backup handling and written
  landlord/agency authority must be approved before production activation.

## Cloudflare setup

Existing Worker: apps/platform/worker/app.ts
Report module: apps/platform/worker/features/open-home-reports.server.ts
Notification outbox: packages/notifications/server.ts
Worker configuration: apps/platform/wrangler.jsonc
Database migration: database/migrations/0011_open_home_reports.sql
Staff page: apps/platform/app/routes/open-home-checkins.tsx
Recipient report: apps/platform/app/routes/open-home-report.tsx

Connected Wrangler environment has both the existing two-minute scheduled
job and the new 0 1 * * * daily trigger.

Feature flags:
- OPEN_HOME_REPORTS_ENABLED=false (OFF in production by default)
- OPEN_HOME_REPORT_EMAIL_PROVIDER=cloudflare (native email sender)
- EMAIL_FROM=info@proinspect.systems (already present in connected config)

The code supports a Cloudflare Email Sending Worker binding called EMAIL,
but the native binding is NOT attached in the connected production
environment. Onboard the ProInspect sender domain with Cloudflare Email
Service, confirm the required DNS records and sending availability, and
then add the following property to the connected Wrangler environment:

    "send_email": [
      {
        "name": "EMAIL",
        "allowed_sender_addresses": ["info@proinspect.systems"]
      }
    ]

Do not add this binding before the sender domain is properly onboarded,
because deployment can fail even while the reporting flag is disabled.
Cloudflare Email Sending can be used without Apps Script or Google
credentials. The existing Resend adapter remains configured for other
ProInspect transactional messages. A report-only optional fallback is
OPEN_HOME_REPORT_EMAIL_PROVIDER=resend if explicitly approved.

## Validation and release

1. Apply D1 migrations 0010 and 0011 in a controlled staging environment.
2. Configure approved recipients, then create synthetic check-ins and test
   reports at the 9:00 Perth boundary, including end-of-month/year cases.
3. Verify zero-attendance reports, cancelled sessions, authority revocation,
   tenant/client boundaries, duplicate scheduled runs and outbox retries.
4. Verify that no real visitor data is accidentally sent to test inboxes.
5. Onboard Cloudflare Email Sending and test the restricted EMAIL binding.
6. Approve privacy/retention, sharing instructions and incident procedures.
7. Enable OPEN_HOME_REPORTS_ENABLED=true only after operational and legal
   review, approved migrations, correct bindings and staging UAT.

The draft feature branch does not merge, deploy or activate this workflow.

Note: the historic Google Sheets connector files and tables remain in the
branch as inert compatibility artifacts. The new attendance/reporting code
never posts visitor data to Google, and the Apps Script API endpoints were
removed. They can be removed through a separate migration cleanup later.
