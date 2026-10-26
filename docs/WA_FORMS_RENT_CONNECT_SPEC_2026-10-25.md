# ProInspect WA Residential Forms, Bond Cases and Financial Routing

**Implementation contract — 25 October 2026.** Source branch `feature/wa-forms-rent-connect-20261025` is a draft integration, not permission to perform statutory service, government submissions, collections or payouts. Applies to WA residential tenancies only. Retain the existing V3 forms and bond implementations; the changes in migration `0027_wa_rent_and_restricted_review.sql` are additive and do not alter the first 26 migrations.

## Sources, approvals, and operational boundary

- WA official forms and notice guidance: https://www.consumerprotection.wa.gov.au/rental-forms-and-notices (prescribed forms must not be altered; Form 2 is sensitive).
- WA Bonds manual forms: https://www.consumerprotection.wa.gov.au/bonds-manual-forms ; Lodgement, Variation, **Security Bond Release Application** (2026). Agents generally use BondsOnline; private landlords may use permitted manual forms.
- WA rent collection: https://www.consumerprotection.wa.gov.au/paying-rent ; third-party platform warning: https://www.consumerprotection.wa.gov.au/publications/warning-when-using-third-party-payment-platforms-real-estate-transactions-real-estate . Agents' receipts must follow the nominated trust-account arrangement. No tenant payment fees above rent.
- Stripe restriction and Connect products: https://stripe.com/legal/restricted-businesses ; https://docs.stripe.com/connect/direct-charges ; https://docs.stripe.com/connect/charges-transfers ; https://docs.stripe.com/connect/account-onboarding . Escrow, money transmission, aggregation and rent collection arrangements require specific provider/legal clearance, not a generic Stripe API key.
- WA family-violence bond cases: https://www.consumerprotection.wa.gov.au/publications/new-bonds-process-faqs . Removing someone from an ongoing bond needs the approved variation or court procedure, not a Stripe payout.

ProInspect's role is **non-custodial coordination**. Where the system prepares a record, it is not automatically a government form, legal signature, proven service, verified remittance, government decision, or cleared payout. Only independently evidenced external events can advance those corresponding operational states. No company subscriptions or inspection fees are charged to tenant bond principal.

## Shared screens and navigation

| Audience | Path | Screen responsibilities | Negative permission |
|---|---|---|---|
| Tenant | `/w/tenant/:tenancyId/tenancies/:tenancyId/wa-forms` | Applicable tenant instructions, Form 25/26 requests, Form 22, bond request drafts and status | Cannot see another tenant's unissued case; cannot issue landlord notices |
| Tenant | `/w/tenant/:tenancyId/tenancies/:tenancyId/bonds` | Bond shares, externally confirmed balances, tenant-initiated release, allocations, government notice references | Cannot confirm government payments or alter landlord claims |
| Tenant | `/w/tenant/:tenancyId/confidential` | Restricted Form 2 draft, safe contact, explicitly chosen reviewers, encrypted evidence | Never visible to landlord, agency, council, building or unrelated Staff |
| Tenant / restricted reviewer | `/w/:kind/:scopeId/confidential/:caseId` | Case stages, encrypted supporting evidence, manual Form 2 preparation and independent reviewer sign-off | No automatic service; no general notifications or public PDFs |
| Landlord / Property Manager | `/w/:kind/:scopeId/tenancies/:tenancyId/bonds` | Lodgement, variation, deductions, approved payout evidence, response deadlines | Cannot decide government dispute or pay a bond from Stripe |
| Staff | `/w/staff/:staffId/bond-review-queue` | Cross-tenancy operational dates, review tasks and reconciliation exceptions | No Form 2 detail or tenant safe-contact information |
| Staff | `/w/staff/:staffId/wa-form-queue` | Residential form review, official-template provenance and controlled issuance | Cannot edit prescribed source content or bypass second review |
| Authorised tenancy parties / Staff | `/w/:kind/:scopeId/tenancies/:tenancyId/rent-routing` | Proposed rent route, external receipt/payout evidence, independent verification | No Checkout, Connect account creation, bank entry, charge, transfer or payout |

Each screen must show property and tenancy context, outstanding stage, actor and time, official source, action eligibility, a separate external-confirmation state and an audit receipt. Financial amounts are integer AUD cents. Show Perth local times but persist offset-aware UTC timestamps. All POSTs require existing authenticated principal, origin protection, current property/tenancy authority, idempotency key and domain validation.

## Form-by-form field contract (source is the existing `WA_RESIDENTIAL_FORMS` registry)

The *worksheet fields* below are the application preparation fields, **not** a claim to reproduce every field of the prescribed official PDF. Each issuer-approved form requires a current official PDF, edition, SHA-256 digest, verified source URL, legal rule version, approved field mapping, review and signature/service evidence. The current template library and review engine already enforce a second authorised template review.

| Form / stage | Intake fields currently modelled | Review / delivery decision and owner |
|---|---|---|
| 1AA — commencement | `startsAt`, `rentFrequency`, `rentAmount`, `bondAmount`, `specialTerms?` | Manager; approved current agreement, signatures and prescribed tenant information |
| 1AC — commencement | `issueDate` | Manager; tenant information with written residential agreement |
| 1AD — commencement | `issueDate` | Manager; non-written agreement tenant information |
| Form 1 PCR — commencement | `inspectionDate`, `inspectionReference` | Manager and Staff; issue correct immutable reporting PDF, preserve tenant response rights |
| Form 18 — commencement | `applicationReference` | Authorised agency/landlord; external agency application URL takes precedence; separate applicant privacy |
| Form 18A — commencement | `databaseName` | Manager; required tenancy database notices where used |
| Bond Lodgement — commencement | `bondAmount`, `receivedAt`, `bondContributors` | Manager; actual general/pet receipts, all bond parties, 14-day lodgement clock and government certificate |
| Form 19 — active | `entryPurpose`, `entryDate`, `appointmentReference?` | Manager; matching booking and purpose-specific notice window; cancellation invalidates prior notice |
| Form 10 — active | `newRentAmount`, `effectiveDate`, `frequency` | Manager; lawful rent increase review and service evidence |
| Form 11 — active | `newRentAmount`, `effectiveDate` | Manager; income-linked rent adjustment only when applicable |
| Form 24 — active | `proposal`, `location` | Tenant request; recipient and outcome recorded |
| Form 25 — active | `animal`, `arrangements` | Tenant request; independently verified receipt and reviewed written response, no automatic timeout decision |
| Form 26 — active | `proposedWork`, `location` | Tenant request; response and exceptions reviewed, not auto-approved on timeout |
| Form 27 — active | `proposedWork`, `location` | Tenant request; major modification requires actual landlord consideration |
| Form 28 — active | `proposedWork`, `proposedDate` | Manager request; tenant-specific issued document and recipient grant |
| Form 20 — breach | `breachDetails`, `incidentDate`, `remedy` | Manager; substantiated non-rent breach, appropriate prescribed notice |
| Form 21 — breach | `arrearsAmount`, `arrearsAsAt`, `ledgerReference` | Manager; reconciled arrears, applicable notice and statutory grounds |
| Form 23 — breach | `breachDetails`, `incidentDate`, `remedy` | Tenant notice of landlord breach; receipt evidence |
| Form 22 — ending | `proposedEndDate`, `reason` | Tenant instruction; ground and service review |
| Form 1A — ending | `breachFormReference`, `proposedEndDate` | Manager; linked **issued and served** prior Form 21, not merely a draft |
| Form 1B — ending | `arrearsAmount`, `ledgerReference`, `proposedEndDate` | Manager; correct alternative non-payment pathway and independent review |
| Form 1C — ending | `statutoryGround`, `evidence`, `proposedEndDate` | Manager; specific permitted ground and validated required notice |
| Form 12 — ending | `grounds`, `observedAt` | Manager; abandonment evidence and notice checks |
| Form 13 — ending | `form12Reference`, `proposedEndDate` | Manager; link actual preceding step and service evidence |
| Form 14 — ending | `mortgageeReference` | Specialist; external mortgagee process; no auto issue |
| Form 17 — ending | `authorityReference` | Specialist; superior-title process; external legal authority |
| CP2 — ending | `goodsDescription`, `discoveryDate` | Manager; appropriate abandoned-goods procedure |
| Form 3 — ending | `goodsDescription`, `discoveryDate` | Manager; applicable goods-disposal notice |
| Bond Variation — bond | `bondReference`, `variationDetails` | Manager; official party/currency adjustment with government receipt; tenant changes do not automatically move a share |
| Bond Release 2026 — bond | `bondReference`, `claimAmount`, `allocation` | Both parties where allowed; tenant can apply without landlord permission; exact general/pet allocation reconciliation |
| Bond Dispute — bond | `bondReference`, `disputeDetails` | Applicant/respondent; actual government notices, Commissioner evidence deadline and appeal tracking |
| Legacy bond disposal | `legacyReference` | Historical records ONLY; blocked for new cases |
| **Form 2 — family violence** | Restricted case: `details`, `safeContact`, authorised reviewer; reviewer worksheet `officialEdition`, `plannedNoticeDate`, `servicePlan`; private evidence | Separate restricted encrypted workflow; approved official form, safe disclosure, required notice/service rules and any related court/bond decisions must be externally completed |

### Bond operation codes and state machines

Existing `B01`–`B23` business rules in `packages/validation/wa-bonds.ts` and `bonds.server.ts` cover initial lodgement, general/pet top-ups, parties/owner/agent changes, partial/full/tenant-requested releases, landlord claims, new-bond transfers, assistance loans, external dispute milestones, Commissioner submissions, appeals, deceased estate exceptions, restricted Form 2, missed deadlines and payout mismatch. `B20` is restricted to confidential case handling; `B23` is archival. Do not replace the 2026 release application with a former joint disposal form.

Lodgement: `draft -> payment_received_unverified -> awaiting_lodgement -> external_submitted -> government_confirmed -> active`. 14 days after actual receipt is a reminder/exception, never an auto-lodgement.

Release: `draft -> allocation_review -> submitted -> government_notice -> agreed | disputed | unanswered -> commissioner_pathway -> externally_approved -> payout_pending -> verified_government_payout -> reconciled`. Approval **never** decrements held balance; only independently reviewed payout evidence can do that. Case dates derive from actual government notices, not guessed response periods.

Form 2: `draft -> tenant_submitted -> assigned_reviewer -> under_review -> encrypted_worksheet -> independent_review -> separately executed legal notice -> external evidence of service (future controlled acceptance) -> case closure`. Current implementation ends at preparation/review and does not perform statutory service. Neither the restricted worksheet nor the evidence is part of ordinary email notifications or a bond ledger.

## Database contracts

Reuse the deployed tables (`tenancies`, `tenancy_memberships`, `wa_residential_form_*`, `bonds`, `bond_parties`, `bond_receipts`, `bond_transactions`, `bond_preparations`, `bond_allocations`, `bond_claims`, `bond_notices`, `bond_cases`, `bond_payout_reconciliations`, `restricted_form_cases`, `restricted_case_grants`, `restricted_evidence`, `restricted_audit`). Do **not** create a second bond ledger or attach Form 2 evidence to a generic document grant.

Migration `0027` adds:

- `rent_route_plans` — immutable draft payment routes scoped to verified residential tenancy/property; constrained agency trust vs self-managed landlord routing.
- `rent_external_money_records` — immutable evidence of a rent receipt or an **already executed externally authorised** owner disbursement; never a request to disburse.
- `rent_external_verifications` — independent Staff reviewer, evidence source, separate verified event; D1 prevents self-review or verified disbursement exceeding verified receipts, including concurrent review attempts.
- `restricted_form2_preparations` — restricted encrypted worksheets accessible only to the applicant and their approved confidential reviewers, never an approved prescribed form.
- `restricted_form2_reviews` — immutable second-review record; reviewer must differ from preparer; no legal issuance side effects.

All five tables use immutable history or guarded foreign keys. The rent-plan schema deliberately contains **no BSB, bank account, card details, Stripe connected account, balance, charge or transfer ID**. No rent or bond money is credited to ProInspect's service billing accounts.

## API contracts and permission matrix

| Method and path suffix after `/api/w/:kind/:scopeId` | Who may call | Result; security boundary |
|---|---|---|
| `GET /tenancies/:id/wa-forms` | Verified residential tenant, manager, Staff | Role-limited form catalogue and cases; excludes confidential Form 2 |
| `POST /wa-forms`, `POST /wa-forms/:id/{receipt,decision,verify,issue,delivery,external}` | Valid actor for form stage | Encrypted draft/review/event and recipient-specific issued document; not statutory service |
| `GET /tenancies/:id/bonds`, `GET /bonds/:id` | Verified residential tenancy relationship or Staff | Bond register and permitted redacted details |
| `POST /bonds/:id/{receipts,transactions,parties,...}` | Authorised manager, limited tenant release initiation, Staff official verification | Existing scoped bond process; government money movement never happens locally |
| `GET /bond-review-queue` | Staff operations manager or administrator | No confidential cases, no identities or Form 2 evidence |
| `GET /confidential`, `POST /confidential` | Applicant on own residential tenant workspace; designated reviewer read | Private case draft with applicant-chosen reviewer |
| `GET /confidential/:id`, `POST /confidential/:id` | Applicant or expressly granted active reviewer | Details, encrypted evidence and versioned stages; access audited privately |
| `POST /confidential/:id/reviewers` | Applicant only | Explicit consent to grant another active reviewer; private audit only |
| `POST /confidential/:id/form2-preparations` | Active designated reviewer, case under review | Encrypted **manual** official-form worksheet; no legal service |
| `POST /confidential/:id/form2-preparations/:prepId/review` | Different designated reviewer with applicant grant | Independent manual handling review; no document issuance |
| `GET /tenancies/:id/rent-routing` | Verified residential tenant, authorised landlord/agency or Staff | Safe rent route and status. Tenant sees no external transaction reference |
| `POST /tenancies/:id/rent-routing` | Current authorised manager only | Immutable planning proposal. Incorrect agent/landlord route rejected |
| `POST /rent-plans/:id/external-records` | Current authorised manager only | Unverified evidence of already executed outside payment, not transfer |
| `POST /rent-plans/:id/external-records/:eventId/verify` | Independent administrator/operations Staff | Verified external event; never a Stripe operation |

All new rent endpoints require `RENT_PAYMENT_PLANNING_ENABLED=true`; all restricted Form 2 endpoints require `RESTRICTED_WORKFLOWS_ENABLED=true`. Both are **off by default** and must remain off until consent/approval/security/live acceptance passes. Ordinary `WA_BONDS_ENABLED` controls scheduled reminder processing, not government custody.

## Future Stripe Connect design: lawful rent collection, not simulated escrow

### Proposed self-managing landlord route (NOT implemented as money movement)
1. Determine that the landlord is genuinely self-managing and owns the identified property; obtain legal/provider approval that Stripe supports the exact Australian residential rent use case, including merchant-of-record, fees, refunds, disputes, ACH/direct debit or bank-transfer requirements and payment frequency.
2. Collect explicit, versioned tenant payment-method consent and provide fee-free arrangements required by WA rules. Do not require tenant participation in Stripe without a lawful basis.
3. Onboard the **landlord's own** eligible Stripe connected account through Stripe-hosted onboarding; store only the connected account ID, approved status and reversible link, never full bank details. For an approved direct-charge design, payment should belong to the connected account, with Stripe's applicable webhook and liability terms clearly documented.
4. Apply a locked tenancy obligation and independently confirmed payee details; never accept a beneficiary bank account from an untrusted client-side form. Keep ProInspect's commercial subscription/service charges separate.
5. Implement payment intents/payment methods in the approved connected context; webhook-signature verification, dedupe, refund/chargeback handling, settlement reconciliation, receipts, arrears correction and Stripe-tenant-fee rules are required before any live checkout.
6. Only activate an approved payment rail in a separate release. A `landlord_connect_candidate` in the current code is a **proposal only**. No calls to Stripe are made by the rent-planning module.

### Agency-managed route
The only supported current routing choice is `agency_trust_external`. The tenant uses the agency's nominated trust process; ProInspect can store externally recorded receipts, agency-reviewed trust statements, owner-disbursement evidence and an immutable audit trail, but **does not receive, control or move** agency trust money. Stripe Connect platform balances, destination charges or arbitrary separate transfers must not replace a legislatively compliant agency trust arrangement. Any future bank/trust-system API requires independent legal review, technical agreement with the authorised agent and regulated trust-ledger reconciliation.

### Rent/bond/operational accounting boundaries

| Funding stream | Data-of-record | Actual recipient | Payment rail / boundary |
|---|---|---|---|
| ProInspect one-off service | ProInspect service invoice | ProInspect operating account | Existing Stripe service checkout, separately tested |
| Paid recurring inspection plan | ProInspect billing account | ProInspect operating account | Stripe Billing, not a rent mandate |
| Self-managed residential rent | Tenancy rent ledger and bank/processor confirmations | Lawful landlord-controlled receiving account | External initially; Connect only after formal approval |
| Agency-managed rent | Agency trust ledger and bank statement | Agency nominated trust | External, not a Stripe platform settlement wallet |
| Tenancy security bond | Bonds Administration registered bond | Government Bond Administrator | Government payment/lodgement and government release; never ordinary Checkout |
| Contractor invoices | Approved service Work Order | Independently contracted supplier | Separate supplier payment or approved Connect scope; no automatic rent deductions |

## Release and testing gates

- Confirm actual WA form editions, mandatory fields, signature/service rules and exceptions against **current official PDFs**; review source hash and preview the final completed prescribed document. Draft field schemas are not equivalent to completed statutory documents.
- Controlled Form 2 threat-model review: cross-tenant/cross-manager denial, selected reviewer grant/revocation process, no general case search/email/log exposure, safe contact, evidence isolation, staff incident management and an independently approved human notice procedure. Two-person worksheet review is not legal-service approval.
- Rent: deny agency Connect proposal, landlord trust-route impersonation, commercial property, unrelated tenant, viewer writes, self-review, replay and concurrent over-disbursement reconciliation. Confirm every app view says collection and disbursements are disabled.
- Test current production-migration history, non-empty 26-to-27 upgrade, D1 constraints, R2 privacy, form/evidence permissions, browser 320px/mobile, no automatic government or financial side effects, and operational rollback from a Time Travel bookmark.
- Supplier/onboarding approval gates: Australian operating entity and Stripe restricted-business acceptance, agency trust advice, merchant/fees/chargeback disclosure, real external provider testing, authorised operational recipients and data-retention approval. Do not use synthetic Stripe or government data to claim production settlement.

**Definition of done:** Q1 forms have documented stage/field/actor/source and independently reviewed templates; Q2 rent plans and external evidence are audit-safe without falsely claiming custody, while Connect remains a separate approved payment release; Q3 Tenant/Staff bond and confidential Form 2 screens provide role-specific, auditable review without leaking protected cases or moving funds.
