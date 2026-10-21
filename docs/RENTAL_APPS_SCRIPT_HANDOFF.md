# Future Google Apps Script residential application handoff — interface contract

**Status: design contract only, deliberately not implemented or enabled.**

This contract describes the next integration stage. It does not send emails,
issue URLs, expose applicant data, enable a webhook or create credentials.

## Ownership and authority

ProInspect collects a residential rental application as an administrative
processor on the written instruction of the named landlord or leasing agency.
That party selects the tenant. Only the verified application recipient saved
on the listing is an authorised destination. The script is intended to email
the application data to that recipient using a structured, branded message.

The Western Australian Form 18 is only an optional template that informed
field selection. The outgoing report will be a **ProInspect Residential Rental
Application Summary**, not an official Form 18 or residential lease.

## What the Leasing branch already stages

1. On household submission the Worker seals an immutable revision containing
   the property, reference, applicant-specific answers/declarations, notices
   and document metadata.
2. Staff verify completeness. Uploaded documents can only be marked released
   after a trusted external scanner reports a clean result.
3. Staff select **Ready for handoff**. D1 creates a
   `rental_application_handoffs` record for that exact submission with a
   sealed destination and a unique idempotency key:
   `rental-email-v1:<application-id>:<submission-version>`.
4. The current status remains `awaiting_script`. The agency receives no
   email and the application is not marked forwarded. This remains true even
   when an unrelated applicant or operations confirmation email is sent.
5. An applicant withdrawal cancels staged undelivered handoffs.

## Proposed v1 payload to be produced by the Worker later

The future secure transport contract should be versioned and include:

- `contractVersion`: `proinspect-rental-email-v1`
- `handoffId`, `idempotencyKey`, `submissionId`, `submissionVersion`
- `recipient`: verified destination, authoritative client and authority ref
- `application`: reference, address, submitted timestamp, status
- `applicants`: each applicant's separately declared responses and date of
  declaration. Only agreed collection fields may be supplied.
- `notices`: the exact database notice acknowledged by the applicants
- `documents`: filename, category, size, scan status, checksum and a secure
  authorised retrieval identifier, **never** an open/public R2 URL
- `expiresAt`, `nonce` and a keyed message authentication value

No delivery endpoint is present today. The payload MUST be generated from
the stored immutable snapshot, never from an editable draft or public listing.
Before generating a payload, confirm the application has not been withdrawn,
no privacy hold prevents disclosure and every included document is either
released (trusted clean scan) or explicitly rejected/excluded.

## Google Apps Script email

A future Apps Script Web App can verify the authenticated message and, where
approved, compose a readable responsive HTML email with:
- ProInspect branding, property title/address, application reference and
  submission/revision dates;
- a separate clearly labelled section for every adult applicant;
- submitted contact, rental history, employment, income and reference answers
  that are necessary for the authorised review;
- each applicant's signed declaration/consent and applicable notice;
- an inventory of supporting files plus a secure reviewed retrieval pathway,
  or approved encrypted attachments where a separate security assessment
  permits them;
- a notice that ProInspect does not select tenants or create a lease.

Scripts must HTML-escape all applicant-controlled values; refuse HTML or
JavaScript injection; avoid BCC/copies to unverified addresses; and redact
access tokens, identity document numbers, bank account credentials and
other unnecessary sensitive details.

**Security choice is not yet final.** Sending complete applications and
identity/income attachments in ordinary cleartext email is a privacy risk.
Before the later implementation, approve whether encrypted attachments,
passwords conveyed out of band, or a protected time-limited document portal
are appropriate. The script must never read an R2 public bucket.

## Authentication, idempotency and acknowledgements

- Use an approved dedicated HTTPS transport and a secret available only to the
  Worker and the Google Apps Script's protected Script Properties.
- Include signed timestamp, nonce, version and body digest. On Apps Script
  `doPost`, verify before parsing operational data. Validate replay window,
  recipient allowlist/authority, max payload size and the contract version.
- Deduplicate by `idempotencyKey` in a durable store; no duplicate agency
  email on network retries. Use the destination and snapshot version as
  immutable delivery inputs.
- Apps Script sends via approved authorised sender with an audited per-message
  correlation identifier, delivery/error metadata and a restricted failure log.
- Send a signed acknowledgement back to an authenticated Worker receiver.
  Confirm the exact request key, digest, recipient, timestamp and submission
  version before marking a handoff `delivered` and the application
  `forwarded`. Mere HTTP 200 or a queued message is not proof of delivery.
- Rate-limit and retry transient errors with backoff. Alert staff after
  permanent failures; never resend to a changed or withdrawn recipient.
- Limit logging and Google Sheet records to non-sensitive operational
  references, outcome, timestamps, retry status and error codes.
  **Do not store applicant answers or attachments in Google Sheets.**

## Acceptance before activation

1. Complete an approved privacy, data-transfer and Google Workspace security
   assessment including mailbox access/retention and Australian hosting/privacy.
2. Obtain agency authority to email applicant data to the exact address and
   applicant consent for that disclosure.
3. Specify retention, recipient changes, data-subject requests, incident
   response and secure document access.
4. Implement the Apps Script, its Worker outbound adapter and authenticated
   inbound acknowledgement in separate reviewed commits.
5. Remove `GOOGLE_SCRIPT_DELIVERY_NOT_YET_IMPLEMENTED` D1 protection only in
   the reviewed integration migration that actually verifies acknowledgements.
6. Demonstrate success, timeout, replay, duplicate, bad signature, changed
   recipient, withdrawal, rejected/unsafe document and partial-delivery tests.
7. Keep the entire integration disabled until a separate production go-live
   decision. The current stage must never claim an agency email was sent.
