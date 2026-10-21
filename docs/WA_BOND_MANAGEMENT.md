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

## October 2026 completion extension (branch-only)

The updated implementation includes the following additional protections and workflows:

- A **complete B01–B23 scenario catalogue** in `packages/validation/wa-bonds.ts` maps each process to its official WA form, external process, required preparation checklist, eligibility notes and allowed tenant initiation. The UI links users to official WA form pages. An encrypted, form-specific preparation worksheet is mandatory **before** an external transaction can be marked submitted; it does not create a legally binding substitute document or send anything to Bonds Administration.
- Residential **general bond caps** are checked for weekly rent up to $1,200; pet bonds cannot exceed $350. General/pet variations are separate and have documented 60-day notice/effective dates and evidence references. Unusual high-rent or exceptional categories remain subject to legal/human review; the software does not invent additional statutory caps.
- Bond **tenant-party identities** must link to authenticated tenancy relationships where applicable. The manager records a pending bond party, an independent Staff reviewer checks official supporting documents, and the manager records the externally confirmed party update. Contributions are recorded against actual receipts; shares cannot exceed recorded funds received.
- Each release must have an **allocation ledger** recording exact general/pet cents for permitted tenant, landlord-claim, housing loan or linked new bond recipients; amounts must sum to the requested release. Landlord deductions require one of the nine supported claim categories, issued evidence and exact equality between claim totals and landlord allocations.
- A submitted release can receive a separately recorded **Staff-reviewed external government decision**. Approval changes the register to `payout_pending` without reducing the recorded held amounts. Only an independently verified and **separate payout confirmation document** permits a Staff-recorded matched payout reconciliation that reduces the balance. Failed/short-paid payments are tracked as exceptions without falsely showing money released.
- **Official-government verification** is a human Staff attestation, with the official external reference, issued PDF, independently named reviewer, source channel, method, outcome and encrypted notes. Source-document reviewers must differ from the PDF uploader. This is **not a government integration** and must never be represented as one.
- Official **government response reminders** are dispatched only for notice deadlines tied to an independently reviewed official notice; receipt-based lodgement deadlines also generate reminders. Existing Worker cron + outbox handles safe-message delivery; a unique deadline/person/phase receipt prevents duplicate sends. Integration tests use only synthetic identities and mocked dispatch.
- Estate/deceased-party and other administrative exceptions have restricted Staff case records and audit history. Family-violence bond instructions (B20) remain explicitly blocked from ordinary bond records and require the separately protected case system. New legacy disposal applications (B23) are blocked.
- Existing Workspace APIs and the tenancy Bond Management page now provide form preparation, contributions, participant changes, recipient allocations, independent evidence checks, dispute notices/case milestones, payout reconciliation and staff exception handling.
- Controlled GitHub CI exercises regulatory amount/date validation, scoped client access, lodgement/payment/document confirmation, tenant release eligibility, partial release allocations, scheduled reminder privacy/de-duplication, receipt reconciliation and actual Worker/D1 execution.

### Before government-facing release

1. Obtain current WA professional legal review of each form, interpretation, exception pathway, statutory timeline, and form workflow mapping; the software cannot supply that review itself.
2. Validate official templates, wet signatures/BondsOnline eTransactions, user identity and actual government references in controlled UAT with Bonds Administration. No BondsOnline/eCourts APIs or government-side payment actions are implemented.
3. Reconcile real correspondence and payout evidence using two authorised reviewers and strict operational policies; synthetic CI deliberately cannot prove government authenticity or actual funds transferred.
4. Obtain legal/privacy/security approval before enabling the restricted family-violence/estate workflows or accepting private evidence in production. Automated malware scanning and attachment retention rules remain a platform-level release dependency.
5. Test actual email delivery, rejected and bounced email, response deadlines and incident procedures using authorised test recipients; synthetic no-send tests cover the internal queues but cannot prove receipt in an actual inbox.
6. Run additive D1 migration rehearsal, restore/backups, current full GitHub Actions CI, and manual cross-portal accessibility/UAT before any production merge or D1 changes.

**Never equate:** a worksheet with a prescribed form; a recorded submission with government acceptance; a government decision with completed payment; a Staff attestation with direct BondsOnline verification; an all-inclusive ProInspect subscription with payment of a rental bond.
