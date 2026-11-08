# Leasing operational gaps — implementation and release register
Date: 8 November 2026
Target: ProInspect `main` via PR #77

## Scope and authority
ProInspect advertises and conducts inspections **on behalf of** the instructing landlord, property manager or leasing representative. ProInspect does not make residential letting decisions, issue tenancy offers or assume property-management authority merely because an application is collected. An agency-supplied approved application URL takes precedence over the ProInspect intake.

## What this change delivers
- **Staff Leasing > property > Inspection scheduling**: explicit Perth-time inspection creation, editing, cancellation and completion. Session capacity is enforced by D1; edits and state transitions use the existing version checks. The original email notification and session-reminder workflows remain in force.
- **Private enquiry register**: staff-triggered retrieval of encrypted visitor contact information behind the existing operations role check; default listing detail only returns counts and identifiers.
- **Property application queue**: filtered by the exact listing ID using the existing authorised application queue.
- **Rental release checklist**: each listing's administrator view reports which property approvals, retention configuration, scanning transport, Apps Script transport and feature-specific release approvals are recorded; no secrets are exposed and no flags are switched.
- **Agency-decision handover**: once an agency/landlord decision is recorded after confirmed application delivery, staff can see its outcome and proceed to the existing separate tenancy creation workflow. It **does not** manufacture tenant identity, auto-create tenancy records, issue an offer or bypass Form 1AA signing gates.

## P0 outstanding — required to enable the live rental intake
| Requirement | Existing engineering | What is still required |
|---|---|---|
| Application release approval | Source-specific release-approval checks | Independent administrator approval for the deployed build, after hosted acceptance |
| Processing authority / verified recipient | POST-only single-use recipient verification, immutable authority record | Lighthouse's actual written instruction, recipient inbox challenge completion, privacy/notice approval |
| Private malware scanner | Private R2 quarantine, signed scanner callback, timed outbound dispatcher | Approved private provider, DPA, allowlisted endpoint and distinct secrets; negative/positive hosted tests |
| Live application handoff | Signed, idempotent Apps Script dispatcher and an allowlisted recipient/CC adapter | Approved Apps Script deployment, signed receipt test, documented disclosure security and recipient consent |
| Retention policy | Separate draft, submitted and withdrawn windows; legal hold and privacy controls | Approved values, backup/erasure policy and incident response; configure secrets/variables |
| Full acceptance | Synthetic integration and browser tests | Distinct authenticated roles; isolated staging D1/R2; real email, scanner tests; explicit release acceptance |

Do not enable `RENTAL_APPLICATIONS_ENABLED`, `RENTAL_SCANNER_ENABLED`, `RENTAL_APPS_SCRIPT_ENABLED` or automatic purge solely because code is merged.

## P1 follow-on items
- **Inspection**: user-facing calendar and per-property scheduling implemented in this release; inspector assignment, access arrangements and consolidated cross-property calendar still need operational design and acceptance.
- **Application to tenancy**: the authenticated, successful agency-decision review now links to existing tenancy creation; a canonical, idempotent application-to-tenancy conversion requires permissioned tenancy identity resolution, lessor approval, duplication checks, a new migration and private audit records. Never automatically invite the applicant on submission.
- **Agreement signing**: `WA_AGREEMENT_ESIGN_ENABLED` remains off. The current WA Form 1AA edition must be acquired, source hash and official PDF field placements independently certified, provider account and webhook authenticated, genuine multi-signature acceptance completed and released before enabling.

## Acceptance checks for the present change
1. Staff administrator can load a published listing and view individual readiness checks without secrets. Unauthorised users cannot reach staff leasing endpoints.
2. Create an inspection in AWST; confirm that the D1 start/end values are correctly translated to UTC and public published listing shows the same Perth time.
3. Reject a date that has already passed, an end earlier than its start, a malformed date and editing a completed session.
4. Register a synthetic visitor, confirm that capacity and reminders work, then edit time and confirm an update notification. Cancellation creates a notification and removes the public inspection. A completed event cannot be reopened via staff.
5. Enquiries remain hidden until the authenticated operator requests the private register. Property applicant queue only shows the selected listing.
6. Record a successful *authorised* outcome following provider-acknowledged delivery, display handover instructions, and verify the tenancy cannot be created without independently authorised property relationships and verified tenant access.
7. Verify that all P0 feature flags remain **false** and bookmarked `/apply` URLs remain in unavailable mode for unapproved properties.

## Related code
- `apps/platform/app/routes/leasing-administration.tsx`
- `apps/platform/worker/features/leasing.server.ts`
- `packages/marketing/leasing-operations.ts`
- `apps/platform/worker/features/rental-review.server.ts`
- `apps/platform/app/routes/rental-application-detail.tsx`
- `docs/WA_FORM_1AA_PROVIDER_AND_PDF_ACCEPTANCE.md`

No landlord approvals, official form validation, private provider account setup, legal opinions or real delivery receipts are inferred from code changes.

## Follow-on implementation — PR #80 (8 November 2026)

### New controlled application-to-tenancy lifecycle
Migration 0049_rental_tenancy_handover.sql adds one immutable handover per
rental application, tied to the recorded successful decision and final encrypted
household snapshot. It is distinct from ordinary tenancy creation, which
historically created an immediately active tenancy.

1. Lessor instruction: An authorised operations user records a separate
   tenancy commencement authority reference and agreed Perth dates. The system
   verifies current property management, the recorded decision, application
   delivery acknowledgement, privacy holds and independent feature release.
2. Pending tenancy: One atomic, idempotent D1 transaction creates a
   pending tenancy, sealed terms, one invitation per adult from the immutable
   submitted household and private email invitations. Addresses must match
   the applicant email hashes. Income and identity evidence are not
   copied into tenant-facing records.
3. Verified identities and agreement: Each adult accepts their own invitation
   after email verification. The existing WA Form 1AA centre requires an
   independently approved statutory template, every named signer, a genuinely
   completed signed PDF, independent review and document grants. Captured
   intent alone is not execution.
4. Activation: Staff may activate only after all original adults are verified,
   the independently reviewed Form 1AA is executed and the dates match the
   separately instructed terms. The transition is source-locked and audited.
5. Void: Pending invitations can be revoked before execution. A separate
   existing agreement case must first be voided in its own protected workflow.

The new flag RENTAL_TENANCY_HANDOVER_ENABLED remains false in all checked-in
environments. Migration 0049 must be applied and rehearsed in isolated
staging D1/R2 before enablement. Independent, source-specific approvals
are required for rental_handover, rental and agreement_signing. Merge alone
does not constitute release authorisation.

### Additional P0 protections
- Private-scanner and applicant-email dispatchers now require both the
  independently approved provider release and the main rental release,
  rather than merely a true configuration variable.
- Applicant erasure is blocked where a pending, void or active handover
  would leave an orphaned tenancy or statutory record. Such requests require
  a separate records-retention and privacy review.
- Pending invitations are enabled only for a released handover; normal
  invitations remain active-tenancy-only. Ordinary tenant maintenance
  continues to require active tenancy membership.

### External acceptance still required
- Lighthouse (or the actual lessor/agency) written processing authority,
  verified recipient inbox and approved collection notices.
- Procured private malware scanner, privacy terms, authenticated R2 access,
  signed clean/unsafe callback evidence and independent security acceptance.
- Deployed and authorised application-mail provider, exact recipient/CC
  allowlists, signed receipts, delivery observations and privacy review.
- Business-approved retention windows and backup, legal hold, disclosure,
  erasure and downstream recipient-copy policy.
- Current official WA Form 1AA bytes, source hash, page-perfect PDF
  placements, independent review and required tenant information sheet.
  Official source: https://www.consumerprotection.wa.gov.au/publications/rent-agreement-form-1aa
- Actual multi-party signing acceptance through an approved provider or
  legally accepted external signing method and verified final official PDF.
- Isolated migration and recovery rehearsal, hosted user journeys,
  independent release acceptance and operational sign-off.

All of these conditions are prerequisites to live rental intake and
tenancy commencement. The code implementation does not imply that the
business has supplied these approvals or that provider tests have passed.
