# Release reconciliation - 22 October 2026

## Evidence and boundaries
Baseline main: `5c7034262bc29c99be6144bc09c198c0033838b6` (PR #34). Live read-only Cloudflare checks found 19 applied migrations, zero foreign-key violations, 23 active services, zero approved one-off prices, and three outbox records marked sent. Sent records are not inbox-delivery evidence. The custom domain is proinspect.systems, but the live application origins still referenced workers.dev at audit time. Guest flag false was not enforced in source.

This document describes a **release candidate**, not proof of deployment. Use the merged PR's exact-SHA Verify ProInspect result and Cloudflare deployment/build SHA to establish delivery. No live payment, business/legal sign-off, real-user Turnstile token, malware-provider callback, or calendar-write acceptance is asserted by source tests.

## Implemented repairs
- Consistent marketing shell and header on guest routes; private routes remain noindex. Dropdown alignment, outside click and Escape dismissal, narrow-screen two-row layout retained.
- New guest requests respect the feature switch. Existing private management/report links are not disabled by intake closure.
- Quotation preview shows service, exact price, GST and expiry before explicit acceptance. Requoting revokes previous tokens; verification and acceptance claim tokens transactionally and reject races/replays.
- Empty catalogue prices remain NULL, not free. Instant mode requires an explicit price. Staff > Services & booking configuration is the rate-publishing location. No invented customer charges or changes to included subscription entitlements.
- Production application/marketing/platform origins converge on the existing custom domain. Turnstile hostname membership and actual protected login remain deployment checks.
- Unified Residential/Commercial owner portfolio with current relationship filtering and cross-account denial tests.
- Native report draft/editor, private JPEG evidence, separate reviews, immutable versions, bounded PDF, recipient-scoped issuance, tenant responses and encrypted offline controls selectively incorporated. A competing PDF render cannot delete another render's file.
- V2 business registers, maintenance delivery, assets/preventive/compliance, capital and portfolio intelligence selectively incorporated. Specialist market modules and commercial catalogues remain draft/unapproved; no new qualifications or trust-money powers are granted.

## Migration and branch decisions
0001-0019 are byte-for-byte preserved and checked by an exact Git-blob manifest. Additions are 0020 native reporting and 0021-0026 V2 operations. A synthetic non-empty 19-to-26 upgrade rehearsal is part of CI. Apply only after full combined CI; retain a production Time Travel bookmark and verify every migration and foreign-key check before switching the Worker.

PRs #24, #25, #26, #29, #31, #32 and #33 are historical feature branches already reconciled into V3; do not merge their stale full trees over current routes or migrations. PR #30 is an incorporated planning snapshot. #13/#14 are historical audit branches; current combined tests and current hosted acceptance replace their old-baseline results. Close superseded PRs only after checking combined verification; preserve all branches/history.

PR #3 is **not safe to merge wholesale**. It has incompatible 0004/0005 migrations and legacy authorization. Its genuinely unported payment/notice enhancements remain a separate tracked task; closing it as fully delivered would be incorrect. No arbitrary branch merge is a substitute for implementing those remaining features.

The frozen Report Creation and ProInspect-V2 branches are preserved unchanged. Their useful work is incorporated through this new authorized integration branch, with additive migration renumbering and semantic shared-route merges.

## Not completed merely by merging code
- Approved one-off rates, cancellation terms, service-area rules, privacy/service terms and exact statutory form versions remain business inputs. The audit did not find an approved live rate card. Unpriced services remain quote-only.
- All eight portal roles need actual authenticated hosted acceptance. Synthetic local sessions are not evidence of real email/Turnstile completion.
- Stripe keys/webhook setup, provider-tested payments/refunds/invoices/settlement; existing included plan entitlements are not recurring billing. See STRIPE_ACTIVATION_2026-10-22.md.
- Google Calendar writes/cancellation and genuine Resend recipient delivery, scanner integration and restricted-data retention sign-off require provider acceptance. No fake successful provider responses are used in production.
- Native reports are the branch's bounded initial implementation, not complete parity with every original layout, annotation, branded Unicode PDF or high-volume offline scenario. Report templates and representative PDFs require business review before operational adoption.
- Government bond lodgement/refunds, statutory service, automated tenancy decisions, rent/trust disbursement and specialist/clinical activities are not activated by this release.

## Acceptance commands
`pnpm check`; `pnpm test:integration`; both Wrangler dry runs; isolated fixture initialization; `pnpm test:browser`. All historic suites remain and report-authoring/multi-portal/V2 plus guest/header/owner/upgrade regressions are appended. A green build never proves every historical merge or every possible production workflow is defect-free.
