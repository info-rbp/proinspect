# Build status: first vertical slice

This is the capability ledger, not a production acceptance certificate. Schema presence, planned navigation and dry-runs are not completed deployments.

## Implemented in source

- Two Cloudflare-native React Router applications, locked pnpm dependencies and shared UI/domain foundations.
- Public server-rendered marketing, 23 service descriptions, three sectors, engagement information, canonical metadata, sitemap and preview noindex.
- Unified identity, expiring hashed single-use sign-in tokens, server sessions, origin checks, Turnstile integration and Resend adapter.
- Self-managing residential Landlord onboarding, property setup, ownership/management checks and secure duplicate-address handling.
- Selected-service handoff through sign-in, account setup and first-property creation.
- Native single-capacity booking with duration, buffers, notice/horizon rules, database conflict exclusion and idempotency.
- Atomic Booking + Work Order + encrypted access + audit/outbox creation.
- Staff queues, assignment, controlled transitions, version checks and audited sensitive access.
- Manual report issuance to private R2, scoped document grants, content-hash retry deduplication, downloads and notification events.
- Tenant invitation/acceptance, active/past tenancy views, requests, manager-safe visibility and Staff request-to-work-order conversion.
- Encrypted outbox, Queue consumer/retries, scheduled dispatcher and staging-only deployment tooling.

## Verification

The latest Verify ProInspect run is authoritative for its exact source. Tests cover domain/security rules, SQL constraints, production builds, actual local Worker/D1/R2/DO business APIs and browser journeys. A failed run is not acceptance. Real external email and hosted authentication remain unverified until configured.

## Deployment

Cloudflare credentials were absent at the initial check. No hosted staging, production data migration or DNS change is claimed. DEPLOYMENT.md documents the new staging workflow and required inputs.

## Remaining product slices

| Area | Remaining work |
| --- | --- |
| Landlord | Self-service cancellation/rescheduling, richer tenancy administration, guided document requests and approvals |
| Tenant | Attachments, Staff inspection publication, tenancy document issuance, WA forms/PCR/bond and restricted Form 2 |
| Property Manager | Professional onboarding, assignments, imports, bulk bookings, recurring planning; disabled |
| Strata Manager / Building / Council | Shared domain exists; three operational workspaces, notices, requests and decisions remain disabled |
| Commercial / Asset | Shared contract exists; dedicated portfolio workflow disabled |
| Documents | Version-management UI, scanning/quarantine, Report Tool automation and restricted evidence workflows |
| Payments / approvals | Schema only; no collection or approval-decision feature claimed |
| Staff | Full client/scheme/staff administration, global search, audit UI and reporting |
| Integrations | Actual email delivery verification, Report Tool and Sheets/Apps Script |
| Marketing | Approved pricing/legal pages, enquiry pipeline, analytics, deeper original content and final visual approval |
| Release | Production resources, restore rehearsal, live acceptance, optional import and domain cutover |

Only Landlord, Tenant and Staff workspaces are enabled. Restricted-case tables are reserved; no unreviewed sensitive workflow is exposed. The previous repositories remain untouched.
