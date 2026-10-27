# Final-sprint continuation: independent rendered-report review and sandbox invoice dispatch

**Status:** Unreleased engineering changes. **Not a full 110-task completion, provider acceptance, legal approval, operational sign-off or authority to merge to `main`.** The exact GitHub feature-branch SHA and its CI checks must be recorded after publishing. The previous PR description referred to an unverified 52-file head; always use the actual Git branch ref and immutable tree, not prose claims.

## Engineering changes made in this continuation

| Task ID | Status | Implementation and evidence |
| --- | --- | --- |
| R07 | In progress | Immutable, independently reviewed exact rendered PDF SHA; review (accept/reject), download, rejection-to-new-draft workflow, issue and generic-document grants blocked until current authorised reviewer and identical R2 bytes. `0048_report_render_independent_review.sql`, report issue/router/document APIs, Staff report UI, isolated D1/R2/HTTP tests. This does not establish field-inspector golden-template acceptance. |
| B09 | In progress | Verified sandbox-only, separately reviewed billing recipient, immutable recipient history, one recorded dispatch per approved statement/invoice, Stripe provider customer email match, durable pre-send reservation and fail-closed delivery uncertainty, Staff interface and synthetic provider tests. `0049_invoice_delivery_reviews.sql` plus billing API/UI. This does not establish real provider delivery, consolidated multi-scheme acceptance or inbox receipt. |
| WS00/WS09 | In progress | `scripts/handbook-release-readiness.mjs` checks all ten workstreams and fails a full-release decision unless all 110 retained tasks and all 20 F-packages have exact-source independent acceptance; the source-bound test suite verifies fail-closed behaviour. This is an audit aid, not independent approval. |

The earlier development branch retains O05-O08 source-linked lease obligations and R05 encrypted offline evidence. It has **not** incorporated the additional 52-file finance/render continuation claimed by an earlier narrative: its actual head and tree must be checked via GitHub. The current changes are a narrower verified subset and **do not** include complete credits/bank payout reconciliation, full PDF parity, external services or any unauthorised approval.

## New guardrails and rollback boundaries

1. Migration `0048` requires the pre-existing report tables from the feature branch and only adds new review evidence and checks. The report API must not be deployed before its schema. Existing issued documents and their grants are not retrospectively rewritten.
2. Migration `0049` adds independently approved invoice recipients and irreversible dispatch history. An uncertain provider response is placed in `needs_reconciliation` and never automatically retried; a support operator must obtain authentic provider evidence, document the disposition and initiate a separately reviewed remediation. A provider HTTP 2xx confirms acceptance for processing only, not inbox delivery.
3. The new code checks the **current** recipient/reviewer authority on use. Revoke and replace a contact rather than mutating existing authority evidence. Reviewed reports are hash-bound to the actual private R2 bytes and prior rendered history is retained.
4. Preserve every deployed migration from `0001` through `0046` exactly; apply migrations `0047`, then `0048`, then `0049` to an isolated restored staging D1 before any authorised runtime rollout. Don't attempt rollback by deleting financial or report audit history. Existing production/staging D1 bindings must be confirmed against Worker settings, never guessed from database name.
5. Protected finance, commercial, reporting and external-provider feature flags stay disabled. No live Stripe, official statutory form, customer data or production resource is used in local fixture tests.
6. **Merge is not safe as a full-release claim** until formal scope, provider, nine-role, isolated restore, security, privacy, operations, publication and independent release gates pass. `node scripts/handbook-release-readiness.mjs <exact-git-sha>` deliberately exits nonzero until accepted evidence is recorded.

## Verification and operating limitations

- Source tests: `tests/runtime/reporting.mjs`, `tests/runtime/reporting-portals.mjs`, `tests/runtime/invoice-delivery.mjs`, `tests/finance-delivery-schema.test.py`, `tests/handbook-release-readiness.test.mjs`.
- Full regression: `npm run test`, `npm run test:schema`, `npm run test:integration`, `npm run typecheck`, marketing and platform build, plus exact-branch GitHub CI after publishing.
- Negative cases: wrong user/role, self-review, stale/missing review, altered PDF, revoked reviewer, wrong invoice email, duplicate send, lost provider response, replaced/revoked contact, incomplete evidence and missing independent release sign-off.
- Current fixture `APP_ENV=local` with a simulated Stripe endpoint and in-memory D1/R2 is **not** a genuine Stripe, Resend, browser-hosted, legal or independent-human acceptance test.

## Workstream blockers requiring independent owners

| Stream | Exact missing decision/proof |
| --- | --- |
| WS00 | Signed F01-F20/historical scope; real product, finance, legal, QA and release owners. |
| WS01 | Signed 23-service catalogue, prices/GST, subscription entitlements, schedules and PCR campaign terms. |
| WS02 | Genuine Stripe sandbox positive/negative/recovery transactions, tax, credit/refund and bank settlement evidence, Connect only if approved. |
| WS03 | Actual provider delivery, Calendar OAuth/events, malware scan, signing, agency handoff, Open Home next-day Perth email and replay/outage recovery. |
| WS04 | Original report-template golden samples, full Unicode/layout/media/offline high-volume parity, independent inspector acceptance. |
| WS05 | Seven operative legal documents, 23 service scopes, 32 official WA forms, privacy/retention rules, restricted Form 2 and funds-custody policy. |
| WS06 | Nine genuine hosted identities, cross-portal positive/negative/revocation evidence, role owner and QA sign-offs. |
| WS07 | Strata/building/council/agency operational proof, original source-backed commercial scenarios and decisions on unified owner, commercial tenant, V4. |
| WS08 | Rights-cleared media, approved copy and legal content, working public/Staff leasing, next-day report recipient approval, manual WCAG 2.2 AA audit. |
| WS09 | Isolated D1 and private/restricted R2 restore; queue replay; observability, responders, performance/security thresholds and independent release/handover. |

All unresolved tasks remain open in `config/handbook-tasks.json`. Only real named owners can accept or formally defer; none are silently presumed.
