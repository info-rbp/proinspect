# Details-only rental application release

The owner confirmed on 16 November 2026 that the current proof of concept should
use existing hosting and accept application details without document uploads.
Secure scanning, file uploads, a hosting upgrade and production migration 0057
remain deferred. This release does not change Sign In / Sign Up or the design.

## Review and defect

Main already contains the public website content updates, service and audience
pages, service-area reference, leasing listings/open homes, explicit property
management tags, landlord display suppression, private application workflow and
the separately gated future scanner implementation. The live Worker was still
the PR #103 release; subsequent merged website changes were uploaded inactive.

Both published Fulham Street properties are tagged as ProInspect-managed and
accept native applications. The approved production intake is details-only,
using privacy-managed-intake-2026-11-15-v1 and 14/90/30-day operational retention
limits. Scanner and external application forwarding flags remain off.

The property-page availability helper checked raw Worker retention variables
before loading the approved request-scoped policy. Production deliberately uses
that policy instead of extra plaintext bindings. As a result, the property page
said applications were unavailable while its direct application form was enabled.
The helper now uses the complete start-page check, including its policy setup.
No authority, management, notice, source approval or feature gate is removed.

The regression test reproduces the production configuration without explicit
retention bindings and checks the property link and form agree: disabled before
release/management confirmation, enabled for an approved managed listing, and
disabled again after management changes to an external party. Existing external
application links retain precedence and listing privacy/disclaimer rules remain.

## Controlled release on current hosting

1. Pass required CI on the final PR head and the existing shared staging preview.
   Staging operational flags, external mail and scheduled execution remain off.
2. Merge with the expected head SHA and pass final main CI. Preserve the existing
   Cloudflare production upload-only build command; it creates an inactive version.
3. Capture fresh production Worker/deployment metadata, D1 recovery bookmark,
   existing application-schema hash and key record counts. Verify the current
   source's enabled details-only release, privacy hash and both management tags.
4. Prepare a disabled managed_rental_intake_releases record for the exact new main
   SHA, carrying forward the owner-approved v1 policy/hash and details_only mode.
   Record the current owner instruction truthfully; no independent reviewer or
   recipient verification is fabricated. Enable only that source's record in an
   atomic guarded batch after CI and configuration review. No schema migration,
   new database, new storage bucket or scanner deployment is required.
5. Register new0%/old100% and use the existing Worker version override for read-only
   preflight. On both property pages, assert the application panel is open, both
   native application links point to the right form, the form submit button is
   enabled, privacy v1/retention is visible and no file input appears. Verify the
   complete merged public website, external-link precedence and staff boundaries.
6. Promote only after preflight passes. Keep the previous Worker version at 0%
   for rollback. Recheck the live links/forms and unchanged D1 schema/key counts.
   Run application creation/submission tests with synthetic local D1/R2/mail;
   do not create production test applications or send test email to applicants.

Every future promoted source needs its own approved intake record. A merge or an
inactive upload alone cannot carry an approval to a new source. If preflight
reports an unavailable application, correct that source-specific configuration
before promotion. Rolling back the Worker keeps prior records and real data;
do not restore or delete production D1 as part of a normal Worker rollback.
