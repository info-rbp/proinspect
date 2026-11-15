# Interim rental supporting documents

The owner requested uploads while retaining current Cloudflare hosting, landlord sharing with ProInspect copied, and deletion after seven days. Both live Fulham Street listings remain ProInspect managed. The confirmed destination is `Lighthousepropertygroup@mail.com`, copied to `info@proinspect.systems`; inbox possession must still be verified through the existing recipient-confirmation workflow.

## Storage and application experience

Files use the existing private `RESTRICTED_DOCUMENTS` R2 bucket, with application-level AES-GCM encryption and opaque object keys. D1 holds encrypted file metadata, security-review records, exact-source release approval and delivery/expiry state. D1's 2 MB per-row limit makes it unsuitable for the accepted 5 MB files. No new bucket, database, paid scanner or hosting upgrade is required. Current usage limits and charges still apply.

Only new applications carrying the v3 interim collection notice can upload. Previous details-only applications cannot silently acquire new evidence-sharing consent. Each adult uploads only into their own private section. PDF, JPEG, PNG and WebP are bounded to 5 MB per file, ten active files per adult and 50 MB per household. Format checks are not described as malware scanning. The server, storage records and SQL guards independently enforce state, management and quota constraints.

Files enter quarantine. An application may be submitted with quarantined temporary evidence, but these files cannot enter the existing independently scanned document pipeline or be shared with a landlord. The original trusted-scanner and download protections remain unchanged.

## Staff workflow

1. Open the restricted rental application queue as an administrator.
2. Explicitly acknowledge that a quarantined download is unscanned and will be handled only on a managed device. Run a current local antivirus check; do not upload applicant evidence to a public scanning website.
3. Record the actual engine/version, scan time, definitions time, exact file SHA-256 and internal evidence reference. A scan must be within 24 hours and definitions within 72 hours. Record rejection for an unsafe file. The application never invents a scan or treats an upload as clean.
4. Confirm the current property-management authority, applicant sharing declarations, verified landlord inbox and configured ProInspect copy address. All included documents must have approved manual security evidence.
5. Stage the private application package. The durable existing Resend outbox sends to the verified landlord with a real CC to ProInspect. It contains a private expiring link, never file attachments or complete applicant answers. The package includes the immutable submitted application and approved evidence.
6. Queue consumption and every package/download access recheck the current release, management version, recipient configuration, privacy holds, application state, latest submission, file approvals and expiry. Withdrawal, management change, an active hold or a changed recipient closes access. A queued email is not disclosure authority.

## Expiry and deletion

Only a successful provider send receipt starts the seven-day package access window. It records provider acceptance, not inbox delivery or reading. Sending is idempotent through the existing outbox key. Failed sends remain visible and establish no successful-send timestamp.

Unsent documents expire 14 days from upload. Once the approved package is sent, included documents expire seven days after the recorded send time. Package and download endpoints enforce expiry immediately; the existing two-minute scheduled job then deletes private file bytes and clears encrypted identifying storage metadata/security evidence. Failed object deletion leaves a tracked retry, rather than deleting the tracking row first. Disabling new uploads does not disable this cleanup. Documented legal holds delay physical deletion but do not keep expired links open. Application answers retain their separately disclosed 14/90/30-day policy; a downloaded recipient copy is outside ProInspect's storage deletion control.

## Safe release

1. Complete protected PR CI, isolated runtime tests, browser checks and local migration/recovery rehearsal. Required repository protections remain enforced.
2. Capture the live Worker version, resource bindings, D1 recovery bookmark, existing schema and key counts. Verify that restricted R2 public access and custom domains remain disabled.
3. Apply the empty additive 0057 and 0058 migrations to the existing production D1 in a guarded atomic batch, recording both migration names. They preserve the prior schema and data and seed no scanner, release or recipient verification.
4. After final main CI, upload an inactive Worker version through the existing build process. Insert the source-bound v3 temporary release disabled, using the exact policy hash and truthful owner instruction; enable it only for the tested final source.
5. Preflight that candidate at zero traffic, retaining the current live version at 100%. Check both property links, enabled start forms, the v3 privacy notice, existing private boundaries and broad public-site behaviour without creating production applications or sending test applicant data.
6. Promote only after candidate verification. Recheck live source, links, privacy notice, expected schema additions and unchanged customer counts. Keep the old version and prior details-only release for immediate rollback.
7. Once real temporary files exist, any rollback must preserve the temporary retention job, or a compatible cleanup version must be deployed. Worker rollback does not undo D1/R2 data. Do not restore the database merely to roll back code, and never restore erased evidence for ordinary use.

## Evidence and references

- `tests/runtime/managed-intake.mjs --temporary`: isolated D1/R2/Resend fixtures cover encryption, quarantine, type/size limits, consent, manual evidence, verified recipients, CC, send failures, access revocation, expiry and erasure. No real applicant data or live provider is used.
- `tests/temporary-rental-schema.test.py`: local 0056 to 0058 upgrade and recovery rehearsal, preserving all existing schema/data with empty default release tables.
- Existing details-only and private-scanned runtime suites remain required.
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [R2 public-access controls](https://developers.cloudflare.com/r2/buckets/public-buckets/), [OWASP upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
