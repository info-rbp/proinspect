# WA statutory forms — phased approval and production activation

**Status:** all forms are OFF; no form is approved to auto-issue, sign, serve, lodge or determine. This document is the release register (26 October 2026).

## Sources, legal ownership and evidence
WA official forms: https://www.consumerprotection.wa.gov.au/rental-forms-and-notices
WA bonds/manual forms: https://www.consumerprotection.wa.gov.au/bonds-manual-forms
2026 bond transition: https://www.consumerprotection.wa.gov.au/publications/new-bonds-process-faqs
Current prescribed Form 1AA source identified: https://www.consumerprotection.wa.gov.au/system/files/documents/2026-04/form1AArentalagreement2026.docx

Actual legal parties remain the landlord, authorised managing agent and tenant. ProInspect prepares and records a process, not a government outcome or automatic legal service. Independent legally qualified approval of each edition and workflow is required.

## Evidence required per form
Each form must have: verified official edition/source URL and SHA-256; independently reviewed application-to-document field map; legally permitted issuer/signature/decision method; current authorised property/tenancy scope; relevant notice, receipt and response rules; privacy and retention approval; real authenticated portal acceptance; representative signed/issued sample checked page by page; private R2 tenancy grants; accurate email/post/physical delivery evidence; named owner and reviewer; rollback/retirement procedure; and a signed release decision.

The machine-readable checklist is `packages/wa-residential/rollout.ts`. All records start `blocked` and `deployment: off`. Promotion must be recorded against a release decision, not inferred from a passed test.

## Four activation phases

| Phase | Release items | Acceptance exit |
|---|---|---|
| **1. Foundation** | Form 1AA agreement; Form 1 PCR; Form 19 entry notice; Form 25 pet request | Approved source/form mapping; multi-party execution; linked inspection/PCR; legal notice/service method; accurate landlord response/receipt clock |
| **2. Ordinary requests** | Forms 1AC, 1AD, 18, 18A, 24, 26, 27, 28 | Information provision, applicant privacy, tenant and landlord written responses, response-time exceptions, legal review of changes |
| **3. Notices and disputes** | Forms 10, 11, 20, 21, 23, 22, 1A, 1B, 1C | Verified grounds and rent ledger, prior-notice prerequisites, grounds-specific periods, legal service and retention |
| **4. Specialist and bonds** | Forms 12, 13, 14, 17, CP2, 3; bond lodgement, variation, release, disputes, historical disposal | Qualified-case review, actual external authority/BondsOnline outcome, current bond-release process and separate physical-signature requirements |

Form 2 is an **excluded restricted family-violence workflow**. It requires a separate risk, privacy, disclosure and safeguarding review and must never enter the standard forms/signing dashboard.

### Phase 1 — implementation by form

**Form 1AA:** source edition/hash; all parties' identities; full lessor, tenant, premises, fixed/periodic, rent, bond, utilities and additional-term entries; official PDF mapping; one lessor and each named tenant; DocuSign demo sign tests or approved wet-ink fallback; immutable executed PDF; approved distribution and service records. Lead: Legal + Staff Operations + Engineering. Blocked until official 2026 document and real signing acceptance.

**Form 1 (PCR):** connect actual inspection, pre-existing native report, attachments/photos and the statutory tenant comment/return window. Staff verifies correct official PCR edition and actual recipient. Landlord/manager preparation, tenant response, follow-up and no false deemed approval. Lead: Inspections Operations + Legal. Blocked.

**Form 19 (entry):** booking purpose, date/time, statutory period and permissible reason, actor, service method and exact effective notice. Reschedule and cancellation invalidates stale notices; new notice required if necessary. Lead: Property Operations + Legal. Blocked.

**Form 25 (pets):** tenant request and animal/supporting details; actual receipt and legally applicable 14-day response rules; landlord approval/conditions/refusal with appropriate Commissioner procedure. No automatic legal result based solely on an advisory timer. Lead: Tenancy Operations + Legal. Blocked.

### Phase 2 — ordinary forms
- **1AC / 1AD:** correct information sheet, tenancy context, authorised delivery and proof of provision; do not require invented signature.
- **18 / 18A:** applicant privacy, agency priority, approved application/tenancy database notices, restricted supporting evidence and deletion controls.
- **24:** tenant furniture-affixing request, suitable lessor written response and any legally valid conditions.
- **26:** minor modification request, 14-day review, relevant conditions/grounds and Commissioner exception path.
- **27:** major modification request, documented scope, legally reviewed 28-day response where applicable.
- **28:** landlord-proposed works; **tenant** decision, 28-day response requirements and written evidence.

### Phase 3 — notices
- **10 / 11:** verify eligibility, previous rent, permissible effective date, applicable adjustment pathway and delivery.
- **20 / 21 / 23:** verify alleged breach, rent ledger if relevant, correct remedy, issuers and actual service evidence.
- **22 / 1A / 1B / 1C:** authorised initiator, correct statutory grounds, previous Form 21 where applicable and permitted notice/termination dates. Never equate notice dispatch with physical possession or completed termination.

### Phase 4 — specialist
- **12 / 13:** independently review abandonment evidence, prerequisites and prescribed notice path.
- **14 / 17:** record external mortgagee/superior-title action, not automated ProInspect issuance.
- **CP2 / 3:** goods descriptions, owner notifications, statutory holding/disposal process and evidence.
- **Bond lodgement / variation:** authorised government process and confirmed receipt/reference.
- **Bond release:** current 2026 security bond release and dispute procedure; paper pen/stylus and government authenticated processes are not replaced by DocuSign.
- **Bond dispute:** record external decision and appeal, not ProInspect's determination.
- **Legacy bond disposal:** history only; not a current customer option.

## Role-specific acceptance matrix

| Actor | Permitted action | Must be refused |
|---|---|---|
| Landlord / authorised PM | Prepare agreement, select verified tenancy signers, submit forms for review; decide landlord-side requests | View unrelated tenancy; proxy-sign for tenant; bypass Staff/legal issue gate |
| Tenant 1 | Review and consent only to their assigned exact PDF and own task; submit appropriate tenant requests | Sign for tenant 2; access unrelated tenancy; view restricted Form 2 of another party |
| Tenant 2 | Same independent task with separate identity and evidence | Reuse tenant 1 token; sign an updated/unreviewed PDF |
| Staff legal/operations | Review form editions, official masters, actual evidence, issue approved documents | Approve own unreviewed official source; treat sent email as served; fabricate external outcome |
| Anonymous / ex-tenant / other portfolio | No private access | All case, signing, PDF and evidence endpoints, even when an ID is guessed |

**Verification state:** pure and database tests plus Worker-level disabled-gate role tests can be exercised in GitHub CI. Full real authenticated multi-signer provider and delivery acceptance remains **blocked** until credentials, approved exact official PDF and independent reviewer are available. Production switches must remain OFF.

## Safe rollout change control
1. Preserve current live schema; rehearse additive migration 0027 on populated non-production D1.
2. Deploy code without enabling signing. Prove all prior portal workflows still pass.
3. Register and independently approve one official master and map at a time, with sha256 and the signed review reference.
4. Use test identities and sink mail in staging. Verify negative permissions and all state transitions with real signed PDF evidence.
5. Enable just the approved form/process, not all 32. Monitor failed callbacks, retries, identity reversals and legal-service issues.
6. If revoked or failed, immediately disable the relevant feature; preserve immutable signed records and revert feature activation without deleting legal evidence.
