> Current release note (22 October 2026): the V3 baseline was merged via PR #34 and deployed on 21 October, with migrations 0001-0019 confirmed in production. The material below is a historical source-branch snapshot, not current deployment status. See [RELEASE_RECONCILIATION_2026-10-22.md](RELEASE_RECONCILIATION_2026-10-22.md) for this integration candidate and remaining acceptance gates.

# Version 3 Enhancements — Integration and Release Register

Status: **IN PROGRESS / NOT MERGE-READY**. Baseline: `main` at `e819659dba660e85b88a013257806e6462f4c38e` (21 October 2026 review). Branch: `version-3-enhancements`.

## Scope and preservation

The integration target is the current, unified Cloudflare Worker, existing D1 and R2 contracts, canonical identity, tenancy/property/scheme memberships, recipient-scoped documents, Work Orders, bookings, all-inclusive subscriptions and already-merged Google Calendar read-only diagnostics. Do not alter `main`, deploy, apply migrations to live D1, change Cloudflare bindings, or enable customer-facing features merely by creating this branch.

There are ten open PRs based on `main`, plus one newly open dependent PR #33 targeting `Leasing`. All eleven PRs are draft. **An open PR is not evidence of approval or production readiness.**

## Workstream register

| PR | Source | Intended functionality | V3 disposition |
|---|---|---|---|
| #30 | `planning/landlord-tenant-completion-audit-20261019` | Delivery and dependency audit | Two documentation files incorporated in commit `478d4d24cdac96b6ac0cededbe405a6638691d0e`. Documentation only. |
| #13 | `audit/cross-portal-stage1-20261011` | Cross-role authorization regressions | Rebase test cases onto current runtime harness; its older `tests/runtime/connected.mjs` must not overwrite current tests. |
| #14 | `audit/stage2-live-readonly-20261015` | Hosted eight-portal acceptance checks | Revalidate against current production/preview URLs and current session configuration before importing workflows; never execute synthetic production mutation unintentionally. |
| #3 | `feat/continuity-acceptance` | Notices, inspection publication, payment reconciliation, documents | Feature-by-feature port. Alternative 0004/0005 migrations and older RBAC conflict with established main. |
| #32 | `feature/google-calendar-scheduler-integration-20261019` | Google event synchronization and conflict checking | Reconcile with guest booking and current canonical DO/D1 scheduling. Keep writes disabled pending real calendar edit-permission test. |
| #24 | `feature/guest-one-off-booking-20261018` | Guest quote, booking, report and reminder workflow | Adapt to approved service/pricing and calendar synchronization. No live paid-status assertion. |
| #31 | `feature/marketing-home-service-ui-20261019` | Marketing UI, accessibility, legal and media gates | Reconcile public routes with Leasing and Open Home. Legal/media sign-off and Cloudflare preview mismatch unresolved. |
| #29 | `Leasing` | Leasing listings and multi-applicant rental application | Keep applicant documents private, release gated and future Apps Script handoff marked unsent. |
| #33 | `feature/open-home-check-in` (base: `Leasing`) | D1 check-in, 09:00 AWST next-day reports, Resend outbox, authorised protected report/CSV | Latest reviewed source `f22aa6d`; reconciled D1/Resend/report recipient security and imported synthetic Miniflare tests. Google Sheets/Apps Script is superseded for this feature. Production reporting disabled until approvals. |
| #25 | `feature/wa-residential-statutory-forms-20261018` | WA residential forms, issuance, reviews, notices | Requires official master PDF approvals, legal rules and protected Form 2 review. No automatic government service/lodgement claim. |
| #26 | `feature/wa-bond-management-full-20261018` | Residential bond tracking, release and reconciliations | Integrate with #25's bond-related workflow without duplicate authoritative records; government payouts remain external. |

## Verified source conflicts

* `main` already owns prior migrations. #3 adds incompatible `0004_communications.sql` and `0005_payment_attempts.sql`; do **not** adopt those numbering prefixes or replace existing tables.
* #25 uses `0007`–`0011`. #26 uses `0007`. #29 uses `0007`–`0009`. #32 uses `0008`. #24 uses `0010`; #33 adds `0010_open_home_checkins.sql` on top of #29. A single additive, gap-free prefix series must be assigned **after reviewing the current production migration ledger**. Renaming source files alone is not sufficient: verify internal references, assumptions and schema dependencies.
* Shared routes/handlers modified by multiple branches include `apps/platform/app/routes.ts`, `apps/platform/worker/api.ts`, `apps/platform/worker/app.ts`, `apps/platform/worker/scheduler.ts`, tenancy screens and `tests/runtime/connected.mjs`. Perform semantic merges, preserving branch-specific feature gates and authorization. Do not use last-writer-wins.
* #29 and #31 overlap public navigation, marketing components, routes and styling; #33 extends #29 and must not be merged independently without the parent.
* #24 and #32 both modify scheduling; verify overlapping appointments, cancellation, external busy intervals, event versioning and idempotent retries.
* #25 and #26 both address bonds and tenancy forms; decide a single source of authority for claims, government evidence, issuance, and restricted data before integrating.
* Earlier #3 material is substantially behind current main; preserve main's document isolation, bounded notice dispatch, reconciliation protection and subscription enforcement.

## Reconciliation sequence

1. Freeze source SHA references, review exact-head CI and capture full changed-path sets for each PR.
2. Define canonical migration map and one consolidated schema graph; use new additive migrations and independent production replay/backup exercises.
3. Port regression/audit cases into current tests; preserve all existing acceptance coverage.
4. Reconcile shared routes, role permissions, property/tenancy and document authority before exposing any feature.
5. Merge scheduling, guest and leasing flows with all changes behind independent default-off flags.
6. Merge WA forms/bonds only after domain overlap and independent external legal/privacy approval.
7. Integrate public marketing and dependent Open Home changes, with explicit preview-vs-production isolation.
8. Run one *combined* dependency installation, TypeScript, SQL migration replay, domain, Worker/D1/R2/DO, Cloudflare dry-run and browser acceptance suite on exact V3 HEAD.
9. Validate staged Google Calendar event writes/cancels, rental-application Apps Script handoff where separately approved, Resend Open Home delivery (no Sheet needed), Turnstile, malware scanning and hosted role-scoped UAT. Do not simulate these as complete.
10. Require human security/legal/commercial sign-offs and explicit release approval **before** making V3 ready for merging to main.

## Current integration evidence — 21 October 2026

- `main` remains at `e819659dba660e85b88a013257806e6462f4c38e`, and V3 was created from this exact baseline.
- PR #30 planning files, cross-portal regression and live-read-only audit harness, the integrated scheduling/guest/marketing/leasing/open-home/form/bond modules, their shared routes and database migration candidates are present on V3. Presence and an isolated PR test pass are **not** proof of live readiness.
- Unified numbered D1 migration files `0001`–`0019` exist on V3. The successful **read-only** production audit verified the actual `d1_migrations` table contains exactly six rows ending at `0006_all_inclusive_subscription.sql`, with no foreign-key violations; it did not execute `0007`–`0019` in production.
- PR #33 latest reviewed head `f22aa6d1331a242a0f613aa5ba782ab046b767fe` uses 09:00 Perth next-day reports and Resend via the existing encrypted outbox, not Google Sheets. V3 includes a strict original-recipient access check and deterministic Resend/Miniflare integration tests. Existing historic Sheets tables/files are inert and must not be treated as live delivery.
- Combined V3 `pnpm check`, Worker/D1/R2/DO integration and Wrangler dry-run checks passed on the first PR33-reconciled verification candidate. Browser acceptance **failed 2 of 31 tests** at that candidate: guest invalid-report-link HTTP 500 and mobile workspace test timeout. Corrections are under verification on a newer V3 head. Never quote an older run as proof of success on later commits.
- The live read-only acceptance probe still has **five blockers**: incomplete verified test identities (1/8), no authenticated test sessions, missing cross-portal transaction evidence, unpriced request-mode service catalogue, and unresolved canonical domain. Tests only observed the current `main` deployment.
- No independently verified V3 hosted staging Worker, staged D1 migration upgrade, rollback/restore rehearsal, genuine Resend recipient send or Google Calendar write acceptance has been established. WA legal/form/privacy/commercial signoffs remain required.
- Production Cloudflare Worker deployment is connected to `main`. **Do not merge V3 into main until its exact head passes all checks, an independent staging migration and service-provider acceptance succeed, and the owner approves the migration/deployment order.** Some scheduled handlers require V3 schema tables; a code deploy onto production's six-migration database is not accepted.
