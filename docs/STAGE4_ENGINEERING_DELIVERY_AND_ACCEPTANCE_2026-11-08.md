# Stage 4 — retained application delivery and remaining acceptance, 8 November 2026

**Repository:** `info-rbp/proinspect`  
**Branch at preparation:** `feature/stage4-report-qc-recovery-20261108`, based on `main` `80457bd09c32472641d66ddd2d4fa65ab873c0b8`  
**Release policy:** Merge only passing exact-head source into the existing Cloudflare `proinspect-platform` Worker. No unreviewed migration, enabling Stripe/WA statutory or restricted-case features, or customer charges.
**Status:** **Stage 4 is not complete or independently accepted.** This is a bounded engineering tranche, not a statement that the 110-task final handbook has been satisfied.

## 1. Implemented in this tranche

| Work package | User-facing/operational implementation | Source | Automated verification |
| --- | --- | --- | --- |
| Reporting saved-draft preflight | New authenticated, revision-bound, read-only GET `/api/w/staff/operations/reports/:id/preflight?revision=N`. Uses exactly the quality evaluator used at submission, exposes blockers and warnings without changing report status. Author/assigned staff editor can inspect before submitting; customer portals cannot. | `apps/platform/worker/features/{reports,report-router}.server.ts`; `apps/platform/app/routes/report-detail.tsx` | `tests/runtime/reporting.mjs`, `tests/browser/reporting.spec.ts` |
| PDF text safety | Native WinAnsi PDF incompatibilities are diagnosed at report QC, by exact area/component field; original non-Latin observations are retained and native report approval is blocked instead of silently rendering damaged text. Accented Latin-1 text remains accepted. | `packages/report-engine/adapter.ts` | `tests/report-contract.test.ts`; pre-existing PDF tests |
| Offline recovery inventory | A staff inspector can check whether the current device holds an encrypted report draft and how many queued encrypted JPEGs remain. Counts are strictly scoped to the signed-in user/workspace/report, do not decrypt photos or expose filenames, refresh after save or erasure, and do not imply a server sync. | `apps/platform/app/lib/report-offline.ts`, `ReportOfflineControls.tsx` | `tests/browser/reporting.spec.ts`; `tests/report-offline.test.ts` |
| Invoice observation review | Landlord/agency/commercial/strata/Staff billing views can identify inconsistent provider invoice snapshots and unmatched reconciliations already returned by their authorised 100-row billing API. Visible rows may be downloaded to a spreadsheet-formula-safe CSV with exact integer cents; no bank, tax, credit or payment mutation occurs. | `packages/finance/invoice-review.ts`, `apps/platform/app/routes/billing.tsx` | `tests/invoice-stage4.test.ts` |
| Retained reporting template matrix | Staff report register now shows **all 25 retained Report Tool template identities** and which of the **23 current services** map to them and the five native report families. Every template remains `pending_visual_acceptance`; a name mapping is not fidelity acceptance. | `packages/report-engine/parity.ts`, `apps/platform/app/routes/reports.tsx` | `tests/report-parity-stage4.test.ts`, `tests/browser/reporting.spec.ts` |

## 2. Existing portal baseline (not new functionality in this PR)
The repository already contains verified-scope implementations for the following. They must be independently tested with the user's actual portal authorities before Stage 4 can be marked accepted:

| Portal | Present in source | Stage 4 retained gaps |
| --- | --- | --- |
| Staff/Admin | Operations queues, schedules, Work Orders, private reporting and QC/issuance, finance ledgers and exceptions, legal/release controls | Consolidated invoicing, credit reversals, actual bank/payout reconciliation, provider failure recovery, acceptance |
| Landlord | Free-account property onboarding, bookings, report/document access, tenancy/bond records, one-off/priced services | Legally approved WA forms and owner/customer evidence, fully accurate paid entitlements and subscription terms |
| Property Manager | Agency portfolio, delegated relationships, 20-item bounded CSV/bulk, recurring bookings and documents | Large-scale/bulk capacities, consolidation and financial exceptions, reviewed role authority |
| Commercial/Asset | Source-linked lease commencement/variation/renewal/expiry, make-good, outgoings, access and record exports | Complete retained lifecycle acceptance, actual contractual/financial interpretation and historical reconciliation |
| Strata Manager | Scheme/lot records, shared works, governance, notices, requests, proposals and reports | Approved real scheme communications, proposals vs actual resolutions, finance and report parity |
| Building Manager | Building facilities, contractor access, requests, operational notices | Fully accepted maintenance schedule, movement supervision, safe authority across buildings |
| Tenant | Verified invitations, restricted tenancy records, inspection access, PCR response, bond/WA form recordkeeping | Statutory acceptance, Form 2 confidentiality, notices, real issue/delivery evidence |
| Resident/Building | Own lot requests, notices, shared works, non-tenancy information | Access/move workflow acceptance, complete scope and tenancy privacy separation |
| Council | Advisory recommendations, governance decisions, scoped documents | Legally valid scheme decision recording and independent authority/role proof |

**Source of baseline:** `docs/BUILD_STATUS.md`, `docs/handbook/implementation-status.md`, current `apps/platform/worker/features/*`. Existing route code does not prove a complete, correctly delivered customer journey.

## 3. Unfinished critical Stage 4 packages — no acceptance or claim of completion

**R01-R09 Reporting:** Template map inventory and earlier QC/report issue flows exist, but native and external Report Tool layouts, photo annotation/provenance, reviewed before/after evidence, high-resolution/large-photo recovery, exhaustive template variations, branding and complex Unicode fonts require further implementation and *visual* goldens. The WinAnsi guard deliberately blocks unsupported scripts; it does not render them. The offline browser queue is device-bound and does not constitute cross-device restore. Generated PDFs must still pass an independent exact-byte review before issue.

**B09-B13 Finance:** Staff can inspect recent invoice statuses and export safe observations. That is not consolidated customer invoice delivery, owner/agency credit-note issuance, complete immutable adjustment/reversal chains, bank statement matching, Stripe Connect recipient reconciliation, payout settlement or live financial authorisation. Existing sandbox/feature gates remain closed.

**L01-L15 Legal and WA statutory:** The system has substantial legal/tenancy implementations, but official Form 1AA versions, final field maps, multi-party authorised signatures, notices/service evidence, confidential Form 2 operating procedures, lawful retention/erasure, application approval and noncustodial bond process need signed operator/legal acceptance and provider proof. Never fabricate official form bytes, signatures, bank or bond receipt, compliance certificate or tenant decision.

**Specialist workspaces:** All nine portal routes exist in source. End-to-end nine-role hosted acceptance and cross-role denial/restore are separate Stage 5/release gates. Some commercial and historical commitments remain subject to exact feature-by-feature reconciliation.

**External providers:** Stripe live tax/code/webhooks, Google Calendar, transactional email, malware scanning, signing, Apps Script and separate reporting integration need live provider proofs. Do not run destructive or chargeable acceptance transactions without explicit authorised scenarios.

## 4. Acceptance requirements before declaring Stage 4 complete
1. Create independent, demonstrably complete requirements and golden fixtures for all retained reporting templates. Implement annotated derivative provenance and a Unicode-aware PDF output; compare full PDFs and images across actual fonts, pages and photo dimensions.
2. Complete offline photo/draft recovery for interrupted/chunked uploads and restored devices with encrypted, consent-safe backups. Document unsafe device loss and shared-device scenarios.
3. Implement approved invoice credits/corrections and unmatched payout/bank evidence with immutable source links; reconcile partial/void/uncollectible/refund and duplicate/out-of-order events.
4. Obtain validated official WA Form 1AA templates and legal/data-processing approvals; maintain separation between advisory observations, signatures, service and statutory determinations.
5. Trace all nine workspaces against explicit role permissions and approved outcomes, including overlapping identities, revocation and confidential documents. Verify negative controls and a real independent hosted acceptance.
6. Assign named operations, security, finance and legal reviewers with source SHA, exact provider version, test evidence and date, and update `config/handbook-tasks.json` according to the generated register workflow; do not manually declare tasks accepted.
7. Verify migration alignment and isolated D1/R2 recoverability before changes to protected production data.

## 5. QA and release checklist for this tranche
- [ ] Exact-head `pnpm check`, `pnpm test:integration`, `pnpm test:browser` and Wrangler dry-runs all green.
- [ ] API preflight rejects tenants/owners/unassigned reviewers, mismatched revisions and no-session clients; no writes.
- [ ] Inspectors can identify report-level QC blockers before submit. Independent reviewer/issuer guards remain server-authoritative.
- [ ] Unsupported non-Latin writing fails early; original draft wording survives.
- [ ] Device recovery count remains per-user/per-report and avoids exposing original JPEG captions and filenames.
- [ ] Invoice observation CSV strips spreadsheet formulas safely and never claims bank/payout reconciliation or uncapped export.
- [ ] All 25 templates remain visible, but none is marked visually accepted without real verified output.
- [ ] Both marketing and private portal flows remain reachable after merge; no acceptance flag or live Stripe setting changed.
- [ ] Cloudflare build source SHA equals merged `main`, and read-only production smoke tests confirm these features' access guards.

## 6. Rollback and operational impact
This change adds **no database migration, provider credential, background job, payment, bond transaction or customer-data update**. Feature behavior is confined to reporting read-only QC and existing Staff/authorised billing pages, offline encrypted device state, and deterministic helper libraries. Cloudflare Worker rollback still does not restore database writes that occurred during normal customer activity.

**Outcome:** New Stage 4 reporting and finance resilience features may be released once tests pass. The stage as a whole remains **open**, with substantial pre-existing and retained technical/legal/provider work; no independent acceptance has been asserted.
