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
| #33 | `feature/open-home-check-in` (base: `Leasing`) | Open Home attendance, QR-ready links, pending Google Sheets event handoff | Dependent on #29; integrate only *incremental changes* beyond Leasing, avoiding double-application of its commits. Sheets sync disabled by default. |
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
9. Validate staged external Google event write/cancel, secure Apps Script/Sheets handoffs, Turnstile, real provider email, malware-scanning and hosted role-scoped UAT. Do not simulate these as complete.
10. Require human security/legal/commercial sign-offs and explicit release approval **before** making V3 ready for merging to main.

## Current integration evidence

- V3 branch created from exact `main` SHA listed above.
- PR #30 documentation blobs integrated without replacing existing application source.
- No other feature code has been merged or certified; existing draft PRs remain unchanged.
- **Do not merge V3 into main yet.** The outstanding work is substantive implementation, not merely Git conflict resolution.
