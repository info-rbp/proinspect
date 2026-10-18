# Western Australian residential statutory forms — implementation contract

**Branch:** `feature/wa-residential-statutory-forms-20261018` (draft PR #25)
**Jurisdiction:** Western Australia, residential tenancy relationships only.

## Invariant: no commercial statutory forms

- Ordinary WA residential forms may be viewed or created only in `landlord`, `property-manager`, `tenant` or authorised `staff` workspaces **with a residential property linked to the tenancy**.
- Commercial workspace `kind=commercial` is rejected by the API irrespective of subscription, user roles or linked accounts.
- A D1 trigger rejects `wa_residential_form_cases` for non-residential sectors. A second trigger rejects attempts to mutate the tenancy, property, form code, initiator or stage to another scope.
- Restrict *legacy* `/forms` endpoints to residential workspaces/property as well; the Commercial tenancy detail must not request that API.
- Deny other tenants' unissued cases; tenant document issue is controlled through existing `document_grants`, not merely access to a property.

## Catalogue and stages

- **Commencement:** Form 1AA, Forms 1AC/1AD, Form 1 PCR, Forms 18/18A where appropriate, bond lodgement.
- **Active tenancy:** Forms 10/11, 19 and 24–28.
- **Breach:** Forms 20, 21 and 23.
- **Ending tenancy:** Forms 22, 1A, 1B, 1C, 12, 13, 14, 17, CP2 and Form 3 where applicable.
- **Bond:** lodgement, variation, current Security Bond Release Application and dispute/determination references.
- **Restricted:** Form 2 family-violence termination is NOT in the ordinary catalogue and must continue to use the separately encrypted restricted-case channel only. Never route Form 2 to general notices or landlord communications.
- `WA_BOND_DISPOSAL` is a legacy archival code and must not appear as a new application choice.

The catalogue entries are candidate workflow definitions. Form identities, statutory conditions, exact mandatory fields, signature requirements, timing and approved official versions need an authoritative WA legal/document review before a form becomes issuer-enabled. Source: https://www.consumerprotection.wa.gov.au/rental-forms-and-notices.

## Current draft PR implementation

- Typed stage/audience-specific catalogue and generic structured fields, with default special review.
- New additive D1 schema for encrypted cases, registered official-template provenance, immutable case events, immutable delivery records and encrypted responder records.
- Case draft, submission, staff review, evidence record endpoints.
- Official-template metadata registration and issued-document linkage require an authorised Staff role, active reviewed official source, immutable existing PDF, and existing tenancy-specific document grant.
- UI for form selection, structured draft preparation, current status and review actions in a standalone Residential Forms Centre linked from residential tenancy detail.
- Deliberately **no automatic legal service, no government transaction, no unapproved generation of substitute official forms**.

## Remaining to fully implement Phases 1–4 (release-blocking)

1. **Legally approved source documents and field specifications.** Acquire each current PDF/template, verify edition and official provenance; legal owner signs off application conditions, mandatory fields, signature modes, exceptions, fixed/periodic tenancy decision trees and corresponding official URL. Verify source hashes against R2 stored master.
2. **Document preparation and signatures.** Safely overlay data into the official prescribed document without altering statutory content; validate layout and required attachments; add consent/signature tasks and adequate signed evidence; separate prescribed PDF preparation from optional documentation.
3. **Deadline engine.** Store receipt-aware, timezone-sensitive statutory clock triggers, calculated due dates, exception rules, permitted notice periods and sourced legal-rule versions; scheduled reminders and escalations must be conditional on actually valid evidence. No automatic approval by simply timing out until legal review confirms applicable logic.
4. **Correct responder-authority workflow.** Separate request / approval / refusal / tribunal / termination outcomes by form; ensure only authorised parties can respond, require statutory reasons when applicable, and provide review channels.
5. **Formal delivery/service records.** Separate app publication, provider delivery receipts, recipient acknowledgement, legally effective service, alternative method and failed delivery; Staff need a retry/exception work queue. A recorded email attempt is not legal proof by default.
6. **Bonds.** Current Security Bond Release Application and verified lodgement/variation/dispute process; external Bonds Administration submissions/confirmation tracking. No claim of government lodgement from an internal record.
7. **Initial and final PCR integration.** Connect Form 1 to Inspector Work Order, Report Builder, issued PDF/version, tenant review responses and authorised deadlines.
8. **Confidential Form 2.** Separate privacy/security/legal/operational acceptance: safe contact, evidence isolation, required notices without inadvertent disclosure, dedicated reviewer, retention and redaction.
9. **Automated tests.** Worker, D1, R2, queue, email provider doubles, browser journeys with two landlords, two tenants, property-manager and Staff; negative tests on commercial account/sector, unrelated property/tenant, stale versions, invalid responses, duplicate send, revoked memberships, signature tampering and confidential-case leakage.
10. **Live acceptance.** Controlled production verified emails, official document review, legally approved test transactions, failure/rollback evidence; must not send genuine statutory notices, charge rent or lodge bonds in test mode.

**Release gate:** Do not merge this draft PR into production until official-template provenance, legal review, end-to-end real-world legal-service controls, safety and CI acceptance are completed. Passing CI on an incomplete workflow cannot certify a statutory process.

---

## October 2026 implementation continuation — actual code on this branch

The four-stage engine now includes these implemented and testable components:

| Phase | Working application behaviour | Deliberate legal limitation |
|---|---|---|
| Commencement | All forms catalogued, structured encrypted intake, Staff review, master official PDF upload to private R2, SHA-256, **independent administrator release approval**, separately issued tenancy-PDF link, signed-document evidence register, Form 1 PCR report-category gate | No template-field coordinate mapping or prescription-safe auto-filling until official master editions are reviewed. No automatic legal signatures |
| Active tenancy | Form 25/26 actual received timestamp, advisory deadline/version, atomic landlord inbox/email notification without tenant answers, audited written decision, scheduled idempotent reminders, Form 19 same-property scheduled booking and Perth date validation, notice invalidation on cancellation/reschedule, issued Form 28 visible to recipient with explicit document grant | A recorded receipt, emailed decision or dispatch is not deemed legally effective service. No automatic approval/refusal on timeouts |
| Breaches and ending | Form 20/21/23/22/1A/1B/1C & specialist catalogue, distinct reviewed prerequisites, Form 1A linked to an actually issued and delivered Form 21 in the same tenancy, ledger and grounds attestations, immutable case history | Legal grounds and notice periods require current WA counsel-approved rules and a reliable rent ledger. No termination is performed by a case record |
| Bonds and specialist processes | 2026 bond release / lodgement / variation / dispute registry, append-only submission/confirmation/determination/appeal events, prior-event gating, signed PDF evidence, administrative closeout only following external confirmation. Legacy bond-disposal intake disabled but records preserved | Does not lodge, receive, refund or release bond funds; government confirmation is recorded by Staff from external source only; manual form signature rules still need acceptance |

**Security:** D1 rejects forms attached to commercial properties; APIs reject both Commercial Landlords and tenants of commercial properties. Confidential Form 2 remains behind the existing disabled restricted-feature flag, its own encryption and reviewer grant model. D1 independently prohibits confidential Form 2 cases for commercial tenancies. No Form 2 case data appears in ordinary WA forms, email reminders or Staff form queues.

**Document integrity and two-person release:** Uploaders must be authorised operational Staff; they upload actual official PDF bytes to private R2. The server calculates SHA-256 and retains the source, edition and originating URL. Another Staff member with `administrator` authority (not the uploader) must attest a second review of the stored digest/size and source/version before the template is eligible for issued-document linkage. This **does not substitute for qualified legal sign-off or independent verification against the authoritative WA PDF**. A separate issue action only links an already issued PDF granted to the same tenancy.

**Automated tests added:** WA forms registry and advisory rule unit tests; D1 sector and confidentiality triggers; real isolated Worker/D1/R2 tests of encrypted intake, role-scoped approvals, Form 25 receipt and decision, atomic manager notifications, booking-notice invalidation, two-person template release and tenancy-specific PDF, bond submission/confirmation, administrative closure, commercial Landlord and commercial Tenant denial; browser-created Form 25 with Landlord case visibility. GitHub Actions results should be reviewed on the **current branch head**, not an older green commit.

### Release gate remains closed

This is a working application engine on a draft integration branch, **not a legally complete statutory form/issuance service**. Before merging/deploying, ProInspect needs actual latest WA approved official documents, a legally reviewed prescribed field mapping, source hash verification, a supported PDF filling/appearance/signing mechanism with visual and legal QA, current deadline/grounds and notice-service rules (including exceptions), qualified approval of restricted Form 2 practices, external government/service-provider acceptance, and end-to-end live recipient/recovery tests.

The engine intentionally marks deadline calculations as advisory, legal-service status false, records external bond events without executing them, and guards against unreviewed prescribed form issuance.
