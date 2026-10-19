# Landlord–Tenant completion — integration and implementation plan

**Baseline:** `main` at `965ea40bd333cfcbb47cb4037a94a506c68d0e71`.
**Status:** planning-only development branch. This plan does not authorise merge of draft legal, financial or confidential workflows.
**Evidence:** [Status audit](LANDLORD_TENANT_STATUS_AUDIT_2026-10-19.md); active [PR #25](https://github.com/info-rbp/proinspect/pull/25), [PR #26](https://github.com/info-rbp/proinspect/pull/26), independent `integration/report-creation-tool` and `feature/owner-portfolio-20261017`.

## 0 — Integration policy: no automatic cherry-pick of migrations

**Verified collision:** `main` contains migrations `0001`–`0006_all_inclusive_subscription.sql`. Multiple draft branches independently introduce a `0007`:
- PR #25: `0007_wa_residential_forms.sql` + `0008`–`0011` forms/notice/review migrations.
- PR #26: `0007_wa_bonds.sql`.
- PR #24: `0007_guest_one_off_bookings.sql`.
- `Leasing`: `0007_leasing.sql`.
- Legacy report branch: `0006_reporting_engine.sql` **also collides** with already-applied `0006_all_inclusive_subscription.sql`.

**Critical:** D1 migration numbering and `d1_migrations` history are production contracts. Copying migrations unchanged may execute them in the wrong order, break dependencies, or leave history inconsistent. Renaming files in a GitHub branch does not make previously applied database history safe automatically.

### Required before any integration

1. Confirm **read-only** current production D1 `d1_migrations` table and schema, and reconcile with `main` at the selected release SHA. Back up DB and rehearse recovery; never assume a branch's migration number is free.
2. Establish one canonical migration sequence starting after the highest actually deployed migration. Assign new, distinct names/IDs to all planned migrations after analysing each migration's table, trigger and referenced-column dependencies.
3. Choose an *authoritative ownership* for overlapping bond and WA form tables and events. PR #25's bond case/event coverage must share the PR #26 bond register, not create parallel government transaction truth.
4. Combine overlapping router/UI/test modifications manually with explicit decisions: `apps/platform/app/routes.ts`, `tenancy-detail.tsx`, `app.ts`, `features/router.server.ts`, `OperationForm.tsx`, `tests/runtime/connected.mjs`.
5. Protect existing `clients`, `tenancies`, `document_grants`, `subscriptions`, `bookings` and `work_orders` IDs, permissions, backfills and history. Adopt additive migrations only, with versioned forward recovery.
6. Test new-empty-D1 and upgrade-from-actual-current-schema paths. Validate `PRAGMA foreign_key_check`, trigger compatibility, no duplicated records/notifications, and unchanged all-inclusive entitlement provisioning.
7. Merge/deploy modules only when their legal/privacy/provider acceptance is complete, or keep them behind disabled feature gates where zero public exposure is provable. No simulated external actions presented as real ones.

## 1 — Integration sequence and dependency graph

| Sequence | Work package | Source of implementation | Depends on | Exit criterion |
|---|---|---|---|---|
| P0-A | Legal/form and delivery contract approval | PR #25; current official WA source documents | Approved current legal review; sample official PDFs; service-method matrix | Per-form version, grounds, recipient, due-basis, signature, release and service rules accepted |
| P0-B | File security platform | **New implementation** against `main` document and R2 pipeline | Scan vendor/architecture and allowed content policy | Quarantine->scan->review->release fail-closed; restricted files never escape |
| P0-C | Common notice/communications and deadline primitives | PR #25 and #26 plus current email outbox | P0-A; timestamp/timezone validation; authorised recipients | Delivery attempt != provider delivery != legally effective service; deduplicated reminders/exception queue |
| P1-A | WA residential statutory lifecycle | Integrate PR #25 | P0-A/B/C and migration reconciliation | Completed official-template-aware preparation, review, evidence, form-specific recipient-safe issue and realistic tests |
| P1-B | Residential bond register, release and reconciliation | Integrate PR #26, reuse PR #25 form service evidence | P0-A/B/C, P1-A shared artifacts, migration reconciliation | Bond parties, receipts, variations, notices, allocations and payout proofs reconcile; no custodial claim |
| P1-C | Native reporting engine | `integration/report-creation-tool` behind controlled release | P0-B, migration reconciliation, current Worker/Staff authorisation | Work Order -> inspector editor -> independent QC -> bounded PDF -> authorised grant -> tenant PCR response and comparison |
| P1-D | Inspection entry notices and PCR response deadlines | PR #25 notice bridge + reporting | P1-A/P1-C, active booking & tenancy | Revised bookings invalidate old notice; legally reviewed timing/service proof; tenant access only after issuance |
| P1-E | Rent ledger and controlled arrears | **New module** | tenancy lifecycle identity, P0-C, approved accounting boundary | Due schedule/receipts/adjustments/balances/reconciliation; no conflation with service payments or money custody |
| P1-F | Maintenance notifications and urgent escalation | Extend `services.server.ts` + current notifications | P0-C, operational rota/responsible party | Correct owner notification; urgent cases escalated with audited acknowledgement; privacy and negative-access tests |
| P2-A | Full tenancy lifecycle and vacate | **New orchestration** over already merged modules | P1-A/B/C/D/E/F | Commencement -> tenancy -> renewal/change -> exit PCR -> keys -> bond coordination -> past-tenancy authorisation |
| P2-B | Property compliance obligations | **New module** | documents/notifications/tenancy relationships | Verified certificate, responsible actor, expiry, overdue notices and audit; booking != compliance |
| P2-C | Combined owner portfolio | Finish `feature/owner-portfolio-20261017` | Current sector/ownership permissions | Scoped combined read-only UI; no managed-portfolio leakage; independent subscriptions and actions |
| P2-D | Separate commercial leasing | `Leasing` branch is **schema only** | Explicit commercial specifications and distinct legal rules | Approved commercial listing/leasing workflows; never reuse residential statutory notices |
| P3 | External integration and production acceptance | Staff, providers and responsible reviewers | All applicable packages | Real sign-ins/delivery, cross-account denials, accessibility, operational recovery, backup/restore, current CI and approval |

P0, P1, P2, P3 are **delivery priorities, not dates or statements that modules are complete**. Some technical work can be developed concurrently with controlled migrations; releases cannot bypass dependencies.

## 2 — New work packages not currently covered by a near-complete branch

### LT-04 Rent ledger (P1)

Implement separate `rent_schedules`, `rent_obligations`, immutable `rent_receipts`, `rent_adjustments`, `rent_reconciliations` and versioned `rent_rule_evidence` keyed to canonical tenancy/property and verified actors. Distinguish due/received/reconciled/allocated/credited/refunded and partial payments; avoid any per-tenant amount leaking to unrelated landlords or tenants. Use tenant and Landlord read-only ledger pages plus manager adjustment/reconciliation workflows. Attach proofs, export an audited rent statement, and generate reviewed rent-increase requests with change-effective-date gates. Money movement, bank connectivity and trust custody are separate regulated/provider projects.

**Acceptance:** monthly/fortnightly schedules; partial/overpayment; reversal/correction; simultaneous retry; arrears calculation; member revoke; ended tenancy; multiple tenants; historical statement; bank mismatch; no service-payments impact.

### LT-06 Malware scanning and retention (P0)

Extend R2 document/attachment/inspection evidence pipeline with durable `pending_scan`, `clean`, `quarantined`, `rejected`, `scanner_error` states; an independently configured scanner provider or supported isolated scanning service; hash/metadata verifications; fail-closed download/issue checks; bounded retries and Staff exception UI. Ordinary D1 grants are not scan overrides. Restricted files must use the same safety standard without sending decrypted evidence to an unapproved third party. Add retention classifications, legal holds, disposal audit, key-rotation and restore rehearsal.

**Acceptance:** safe PDF, wrong MIME, EICAR test fixture in controlled isolation, oversized/zip-bomb/polymorphic samples where safely supported, scanner timeout/unavailability, re-upload, cancelled cases, expired grants, protected evidence no-leak.

### LT-09/10 Direct tenant-request handoff and urgent repairs (P0)

Resolve current effective-dated `property_management_relationships` to notify exactly the correct verified management/owner recipients on tenant request; do not duplicate to prior managers. Restrict content by recipient relationship; record outbox/delivery/error/retry. Introduce acknowledgment/resolution owners, response clocks, escalation tier and per-priority operational SOP with business calendar/Perth time. Do not promise emergency services. Keep request->Work Order conversion idempotent.

**Acceptance:** current vs former manager, nonmanager denial, urgent unresolved escalation, bounced emails, duplicate notifications, tenant comment, staff-only notes, out-of-hours processing and role revocation.

### LT-08/12/14 Tenancy lifecycle and auditable communications (P1/P2)

Add tenancy lifecycle milestones/events, links to issued official documents, key/occupant/renewal/exit tasks, shared **audience-filtered** communication timeline, failure/expiry/reminder states and an explicit historical-access policy. Avoid auto-terminating the tenancy or disbursing bond on an advisory form response. Changes must atomically update dated memberships and the appropriate grants.

**Acceptance:** 2 tenants, invite one later, commencement / renewal / fixed-to-periodic / end, final inspection, bond-disposal handoff, historic document access and blocked new ordinary repairs after tenancy end, confidential evidence invisible throughout.

## 3 — PR #25/#26 combined review checklist

- **Workflow overlap:** Bond lodgement/release/variation cases exist in both form catalogue and bond module. Choose single `bond_id` / `bond_transaction_id` authority; statutory form case links to bond event with explicit evidence, not its own bond payment/confirmation mirror.
- **Official documents:** Template registry is owned by the WA form engine; bond workflows consume approved official versions and issue actual PDF evidence by existing document-grant path. Conflicting mutable template metadata or dangerous double approvals must be reconciled.
- **Service and timing:** `notice_reference` must not be treated as proof of lawful service. One canonical delivery record tracks actual external evidence and form version; bond reminders must not multiply forms reminders for the same event.
- **Privacy:** Residential-only enforced at API and D1; commercially scoped tenancies denied statutory residential workflows. Form 2/family violence stays in isolated encrypted storage, ordinary queues and emails carry zero protected details.
- **Audit and money:** Human-recorded government decisions are not proof of payout, signature or lodgement. Preserve held balances until externally verified payout reconciliation; never blend with Stripe service-payment ledger.
- **Regression:** Exact branch heads have green tests, but combined tree **must rerun all source/integration/browser/D1 upgrade tests**. Old branch green CI cannot certify the merge.

## 4 — Release gates and evidence required

**Gate A — Product/legal contract:** current WA sources, original form templates, reviewed descriptions, scope, signers, statutory service and deadline rules, exception routes, responsible reviewer and documented version. Changes to official wording require reapproval.

**Gate B — Security architecture:** D1 row/relationship guards, deny-by-default grants, restricted-case protection, safe uploads, audit immutable histories, no cross-tenant messages, secrets and key management.

**Gate C — Integration candidate:** unique ordered migration chain, reconciled router/route/UI code, versioned data contracts, isolated connected Worker/D1/R2/DO tests and browser tests, staging or strictly isolated acceptance, reviewed PR.

**Gate D — External acceptance:** approved real mail recipients and delivery/bounce checks; official government-source evidence or explicit manual handoff where no public API exists; validated real Report Tool/provider connection; no fabricated signatures, money movement or government acknowledgments.

**Gate E — Production go/no-go:** backup/restore exercise, live D1 preflight, provider configuration and rollback path, security/privacy/legal approvals, human Staff + Landlord + Tenant tests, successful exact-commit CI, deployment evidence and post-release monitoring. **No production writes** merely to satisfy this planning exercise.

## 5 — Recommended next engineering actions

1. Make PR #25 and PR #26 joint release candidates only after a **migration and feature reconciliation design** is agreed. Do not merge either as-is.
2. Complete the common security/document scanning and notice/evidence contract. These are upstream release gates for forms, bonds and native reporting.
3. Bring the older report integration onto current main via a new integration/reconciliation branch (not an automatic fast-forward); migrate `0006_reporting_engine.sql` to a new, checked migration sequence.
4. Implement rent-ledger and urgent-maintenance slices as separate PRs so they can be verified without entangling statutory/government data.
5. Integrate lifecycle and final PCR only once WA forms, bond register, native report and communications are compatible.
6. Keep guest one-off booking, external Google Calendar writes, commercial leasing, combined owner UI and unrestricted financial services out of the legal-workflow release critical path unless separately approved.
7. Track [Issue #22](https://github.com/info-rbp/proinspect/issues/22) for real authenticated Staff/new Landlord acceptance; revalidate [Issue #15](https://github.com/info-rbp/proinspect/issues/15) against current sign-in evidence before making changes.

## 6 — Current branch status and non-goals

This planning branch is created from current main, intentionally includes **none** of the unmerged functional changes and touches documentation only. A draft planning PR should stay **unmerged** until owners of statutory forms, bonds, reporting, finance and security have reviewed sequencing.

**No claim:** legal certification, approved government integration, report-engine completion, live email delivery, direct rent collection, secured malware-scanning implementation, or full end-to-end tenancy life-cycle delivery.
