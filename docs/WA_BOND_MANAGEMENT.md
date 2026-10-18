# WA residential security-bond workflows — branch implementation and acceptance

## Scope and legal boundaries
- Applies **only to Western Australian residential tenancies**. Commercial and residential-park processes must not silently share these policies.
- Three current Bonds Administration paper forms: Lodgement of Security Bond Money, Variation of Security Bond, Security Bond Release Application. ProInspect is a **non-custodial coordination system**. No deposit, lodgement, electronic signature, legal service, determination, bank transfer or BondsOnline/eCourts transaction is performed by this software.
- Normal release uses the post-28 March 2026 Security Bond Release Application. B23 is retained only as a historical/transitional category and new B23 requests are blocked.
- B20 family/domestic-violence matters require the separate restricted-case process, which remains disabled pending legal/safety acceptance. Never enter protected evidence into a normal bond transaction, document or notification.

## Implemented feature branch contracts
- `0007_wa_bonds.sql`: typed bond records, confidential party envelope column, receipts, external transactions, claims, evidence links, deadlines, notices, dispute cases and append-only event history. Existing D1 tables are untouched; this migration must be applied before using the new routes.
- `bonds.server.ts`: authenticated, tenancy-scoped register; roles verified by existing authorisation; immutable payment receipts; 14-day receipt-to-lodgement deadline; B01–B23 workflow identifiers (B20/B23 blocked from ordinary creation); reviewed document linking, official-submission reference and human confirmation gates, claims in nine categories, government notices/case transitions, idempotent POST request receipts, financial and chronology checks.
- `router.server.ts`: workspace API routes under `/api/w/:kind/:scopeId`:
  - `GET /tenancies/:tenancyId/bonds` — authorised register
  - `POST /bonds` — create for tenancy
  - `GET /bonds/:bondId` — bond detail
  - `POST /bonds/:bondId/receipts` — record money received and deadline
  - `POST /bonds/:bondId/transactions` — start workflow
  - `POST /bonds/:bondId/transactions/:transactionId/status` — record external submission, confirmation, rejection or draft cancellation
  - `POST /bonds/:bondId/transactions/:transactionId/claims` — draft release claims
  - `POST /bonds/:bondId/transactions/:transactionId/notices` — external notices and official due dates
  - `POST /bonds/:bondId/transactions/:transactionId/case` — case stages and determinations
  - `POST /bonds/:bondId/evidence` — link previously issued tenancy PDF
- `tenancy-bonds.tsx`: Landlord/Property Manager/Tenant bond register with workflow preparation, transaction/receipt controls, claims, notices and cases. Linked from tenancy detail.
- `tests/runtime/connected.mjs`: synthetic end-to-end submission, evidence, access isolation, deadline, notice and case acceptance.

## Workflow catalogue
| ID | Workflow | Government process and module behaviour |
|----|----------|-----------------------------------------|
| B01 | Initial bond | Lodgement form or BondsOnline; payment receipt, deadline, external reference, confirmation |
| B02 | General top-up | Variation; positive change with documentary confirmation |
| B03 | Pet top-up | Variation; separate pet principal and confirmation |
| B04 | Add tenant | Variation; support draft and recorded external outcome; tenancy membership update remains a separately authorised operation |
| B05 | Remove tenant | Variation; government-confirmed outcome does not automatically revoke tenancy identity |
| B06 | Landlord change | Variation; current property ownership/management changes are separately controlled |
| B07 | Agent change | Variation; management relationship changes require organisation approval |
| B08 | Contact details | Government update; retain change evidence without claiming money movement |
| B09 | Deceased tenant variation | Restricted estate evidence and manual caseworker review required |
| B10 | Partial release | Release application; negative balance deltas; balance must remain nonnegative |
| B11 | Full agreed return | Release application; actual externally confirmed payout |
| B12 | Release with claims | Release application and categorised, evidenced deductions |
| B13 | Tenant initiated release | Tenant may draft an application; no landlord approval to start; external government route |
| B14 | Transfer to new lodgement | Paired release and independent new lodgement record / confirmation |
| B15 | Housing bond assistance | Release allocation and external loan repayment evidence |
| B16 | Release dispute / no response | Government referral and notice deadline tracking |
| B17 | Commissioner submissions | Evidence preparation and official submission tracking |
| B18 | Appeal | Court filing proof and government notice tracking |
| B19 | Deceased tenant release | Estate/unclaimed bond documents and legal review |
| B20 | Family/domestic violence | **Restricted and blocked in ordinary bond module** |
| B21 | Missed deadline | Exception record and human escalation |
| B22 | Failed payout or mismatch | Reconciliation exception, never silently mark released |
| B23 | Former disposal procedure | **Legacy-only**; not offered for new requests |

## Release blockers / acceptance requirements
The source branch is **not automatically legally compliant or externally integrated**. Prior to declaring complete and merging:
1. Obtain a WA-qualified legal/operational review of current official form versions, lodgement and release rules, exceptional cases, bond amount limits and applicable timeframes. The software records source-provided deadlines; it does not automatically decide contested legal entitlements.
2. Implement a safe verified, per-bond participant identity/authorisation review and amendment process, including Government party reconciliation and estate authority. A generic transaction description is not a completed official variation.
3. Confirm actual government documents and references with authorised BondsOnline/manual parties. ProInspect cannot submit to BondsOnline, verify credentials, or move funds through an unpublished or unsupported API.
4. Integrate reviewed notification templates and scheduled reminders with explicit send/failed/retry state, respecting tenant privacy, opt-outs and notification recipients. Current deadline records are not proof of outgoing reminder delivery.
5. Complete deduction allocation reconciliation, tenant share-of-bond ledger, transfer pairing, assistance-loan handling, conditional refund/release, and response-period verification.
6. Complete genuine portal acceptance using controlled test identities, including former tenants, shared tenancies, revoked rights, case handling, revised release/deadline paths, and disputes; verify full cross-account access isolation.
7. Add production-ready malware scanning and safe document handling for government evidence before public release.
8. Conduct full D1 schema upgrade/recovery rehearsal, backup/restore and current GitHub CI; do not deploy or migrate live data without a release decision.

## Operational guardrails
- A PDF issued to the tenancy is necessary but insufficient to prove authenticity of a government confirmation. Human verification remains mandatory.
- Government decisions and payouts are recorded, never determined or executed by ProInspect.
- Landlord account subscriptions do not pay, lodge or guarantee tenants' security bonds.
- Never publish private estate/family-violence evidence via ordinary bond records.
- The branching work should stay in a draft PR until the outstanding release gates are met.
