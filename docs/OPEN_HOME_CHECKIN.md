# ProInspect Open Home Check-In

Branch: feature/open-home-check-in (created from Leasing).
Release state: development only. The live Google Sheet and Apps Script do not
exist and no integration has been enabled.

## Public page

URL: /open-home/check-in

- Responsive ProInspect marketing-site check-in form with property, session,
  name, phone, email and explicit attendance-only consent.
- Property and inspection session can be selected manually.
- Session-specific QR-ready URL:
  https://YOUR-PROINSPECT-ORIGIN/open-home/check-in?property=LISTING_ID&session=SESSION_ID
- Check-in is allowed from 30 minutes before the start until 45 minutes
  after the scheduled end, while the listing is published and session scheduled.
- Checks origin, body size, Turnstile action/hostname, honeypot and rate limits.
- Records attendee contact information encrypted in Cloudflare D1.
- Duplicate arrivals for the same session and email do not create new records.
- This form is NOT a rental application and does not opt anyone into marketing.

## Existing property linkage

The implementation does not create a second property directory:

Canonical properties.id -> leasing_listings.property_id ->
leasing_sessions.listing_id -> leasing_checkins.listing_id/session_id.

If the visitor registered online beforehand using the same email, the system
links the check-in to the existing leasing_leads record for that listing and
session. Walk-in guests can check in without an advance registration and do
not consume booking capacity. Neither checkout nor check-in changes the
number of advance registrations.

## Staff register

Page: /w/staff/SCOPE_ID/open-home-checkins

Only authorised administrators and operations managers can select a property
and inspection session, see arrivals, contact information, preregistration
matches, and Sheet sync status. QR-ready property/session links are available
for use on signage. The public API never provides guest contact information.

## Google Sheet to create later

ProInspect D1 remains the authoritative attendance record. Every check-in
queues one durable Sheet event with status pending, rather than directly
submitting data to an unconfigured spreadsheet.

Create a Google Sheet in the approved ProInspect Google Workspace account.
The intended worksheet is called "Open Home Check-Ins". Required column
headers, in order, are:

1. Check-in ID
2. Arrival (Australia/Perth)
3. Property
4. Property ID
5. Listing ID
6. Session ID
7. Session start (Australia/Perth)
8. Name
9. Phone
10. Email
11. Advance registration
12. Leasing representative
13. Consent version
14. Sync event ID

The standalone Google Apps Script template is in:
integrations/open-home-sheet/Code.gs

The design uses a five-minute scheduled pull and acknowledgement rather
than posting directly from the visitor's browser to the Sheet. The Apps
Script checks existing Sync event IDs to prevent duplicate rows after retries.
It also escapes spreadsheet-formula input before saving contact details.

Worker endpoints (disabled until manually approved/configured):
- GET /api/integrations/open-home-sheet/pending
- POST /api/integrations/open-home-sheet/ack
  JSON: { "eventId": "EVENT_ID", "rowNumber": 2 }

Both are authenticated with timestamp, nonce, signed request method/path/body
and HMAC-SHA256 signature. The nonce is stored and protected against reuse.
Required Worker configuration:
- OPEN_HOME_SHEET_SYNC_ENABLED = false until approved
- OPEN_HOME_SHEET_API_SECRET = secret, minimum 32 characters

Required Apps Script Properties:
- PROINSPECT_API_ORIGIN = deployed Worker HTTPS origin
- PROINSPECT_OPEN_HOME_SHEET_ID = Sheet ID when created
- PROINSPECT_OPEN_HOME_API_SECRET = identical private shared secret
- PROINSPECT_OPEN_HOME_TAB = optional tab name

Signing headers:
- X-ProInspect-Timestamp: Unix epoch seconds
- X-ProInspect-Nonce: unique UUID
- X-ProInspect-Signature: lowercase hex HMAC of the concatenation of
  timestamp, nonce, uppercase HTTP method, request pathname and exact raw
  body, separated by newline characters.

The Worker verifies requests within a five-minute clock window.

## Activation procedure

1. Approve the attendance privacy notice, agent/landlord disclosure terms,
   role-based Sheet access and retention/deletion schedule in D1 and Sheets.
2. Create the Sheet and share only with authorised ProInspect staff.
3. Create the standalone Apps Script and copy the tested source file.
4. Set Script Properties and the Worker secret independently; do not put
   secrets in the Sheet, GitHub or public pages.
5. Run migration 0010 in isolated staging, publish an approved test property
   and session, and test check-ins using synthetic attendee details.
6. Test replays, duplicates, malicious formula values, failed network
   acknowledgements, expired sessions and cross-property isolation.
7. Only after acceptance turn on OPEN_HOME_SHEET_SYNC_ENABLED in the Worker
   and run installOpenHomeTrigger() in the Apps Script editor. The five-minute
   script will begin syncing queued attendance. Use stopOpenHomeTrigger() to
   suspend the polling job without deleting D1 attendance.

A completed network request to Google Sheets is not by itself proof the
leasing representative received an email. This integration copies records
to a Sheet; notifications/agency handoff are separate optional workflows.

## Privacy and retention

Contact details are for the named property/session and may be given to its
authorised leasing representative. They are not a marketing mailing list.
Before live use, implement the agreed rights process for viewing, correcting
and erasing attendee data in BOTH D1 and any synchronized Google Sheet copies.
Account for backups and logs. Do not publish the spreadsheet to the web.

## Validation

Run GitHub Actions, TypeScript, SQLite migrations and application builds.
Verify the end-to-end acceptance flow on a staging hostname before merge.
The branch is not merged into Leasing or main and is not deployed.
