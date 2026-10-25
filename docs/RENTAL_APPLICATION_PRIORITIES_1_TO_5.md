# Residential Rental Applications — priorities 1–5 implementation

Development branch: `feature/rental-applications-priorities-1-5-20261025`

The implementation remains **unmerged and disabled in production**. Database migration `0027_rental_application_completion.sql` is additive and must be rehearsed before release.

## Priority 1: listing authority and verified recipient

An administrator sends a single-use private email verification link to the nominated landlord/agency inbox. The recipient confirms with a POST action; merely viewing the email does not verify the destination. The administrator separately records the written instruction reference, a description of the evidence checked, and the approved privacy notice version. The listing is available for internal ProInspect application intake only after both steps. Changing the represented party, destination, notice or application mode revokes approval. A pre-existing external agency application link takes precedence. Old approvals are immutable.

## Priority 2: restricted document scanning

Uploading a document to `RESTRICTED_DOCUMENTS` creates a pending scanner job. With `RENTAL_SCANNER_ENABLED=true`, a scheduled Worker reads the private R2 object, verifies its digest and sends bytes over HTTPS to a configured, allowlisted private scanner. The scanner authenticates the outbound request and posts a **separate HMAC-signed result** to `/api/internal/rental-document-scan` using `RENTAL_SCANNER_WEBHOOK_SECRET`. Only a signed clean result followed by an administrator review allows download. Failures retry with capped backoff; no HTTP response to the upload request is taken as proof of safety. An approved scanner implementation and contracts are **not** provided or provisioned here.

## Priority 3: Google Apps Script agency delivery

The Worker sends an HMAC-signed timestamped message to a dedicated Google Apps Script Web App. Because Apps Script `doPost` does not reliably expose arbitrary request headers, signature and payload are in the JSON envelope. Its source is `integrations/apps-script/rental-application-handoff.gs`. That script verifies the signature, enforces an exact-recipient allowlist and uses `MailApp.sendEmail` with HTML-escaped applicant answers. Identity/income files are **not** attached, and no public R2 URL is generated. The script records `sending` before dispatch so a crash in the uncertain window fails closed rather than silently duplicating the message. Operations must manually reconcile ambiguous sends. A valid acceptance response is recorded as `delivered` in the legacy handoff database state; it means **email-service acceptance, not verified inbox arrival**. Set `RENTAL_APPS_SCRIPT_ENABLED=true` only after the sender/recipient, mailbox retention, legal grounds and disclosure scope are approved. Live Script deployment and sender account setup are still required.

## Priority 4: retention, access and correction

Current draft/submitted/withdrawn retention windows are configured business choices, not statutory claims. Purge includes scanner jobs, handoff receipts, outcomes, documents and immutable evidence under existing legal-hold and privacy-request guards. Applicants may request a new private link using reference + their own verified email even if a previous token has expired. The recovery response is generic regardless of account existence and uses Turnstile and rate limiting. No automatic purge is activated until privacy policy, backup lifecycle and recipient-copy handling are approved.

## Priority 5: agency outcomes

An authorised Staff operator can record an explicit `successful` or `unsuccessful` instruction from the agency/landlord only after the application is forwarded. Source references and encrypted notes are retained. Applicant notices describe the agency's decision without ProInspect assessing applicants or making an offer of tenancy. The state is immutable except through an authorised privacy purge.

## External activation and acceptance

Require an independently reviewed written collection/agency authority, approved privacy collection notices, written tenancy-database notice where applicable, operational retention periods, allowed scanning provider, verified Script sender and allowlist, controlled staging recipient, real Turnstile settings, and a successful integration suite with genuine negative security cases. Keep `RENTAL_APPLICATIONS_ENABLED`, `RENTAL_SCANNER_ENABLED`, `RENTAL_APPS_SCRIPT_ENABLED`, and `RENTAL_RETENTION_AUTOPURGE_ENABLED` disabled until separately approved.

The WA Form 18 is a useful optional field reference. The customer-facing document is the **ProInspect Residential Rental Application**, not a prescribed government form.
