# ProInspect — Stage 3 publication-ready marketing copy and decision register
**Prepared:** 8 November 2026 (AWST)  
**Version:** Stage 3 release candidate 1  
**Scope:** Public marketing website served from the unified Cloudflare Worker; source branch `feature/stage3-marketing-seo-20261108`.  
**Status:** Copy written and incorporated in the website. This document is an operator approval worksheet, **not** a signed legal or commercial approval.

## Publication decision
Release the written, non-contractual marketing information only subject to:
1. The submitted code has passed exact-head CI, browser navigation, security and source checks.
2. Service copy is interpreted as **typical agreed work**, never a guaranteed statutory, specialist or regulated result. Exact scope, price, service area, lawful property access and availability remain dependent on accepted instruction.
3. The residential `$50 + GST per property per week` reference is labelled **proposed**, is not a live payment offer and the page is **noindex**. There is no unauthorised checkout or live Stripe change.
4. Unapproved privacy and terms documents remain visibly labelled **review drafts**, with meta robots and Worker X-Robots-Tag protections and exclusion from the XML sitemap.
5. Illustrative property artwork and demonstration reports remain explicitly labelled. No unidentified real customer property, report, claim, image or personal information is published.
6. The actual business representative and legal reviewer separately sign the exact commercial and operative legal text before any acceptance flags or charging features are enabled. No signature has been supplied in this implementation.

## Release-ready public messaging
The wording below corresponds to authored public pages in this branch. These are proposed final copy lines, not unverified evidence of coverage, company history, credentials or outcomes.

| Page | Main headline | Customer benefit / next step | Source |
| --- | --- | --- | --- |
| Home `/` | **Property inspections. Clear records. Practical support.** | Residential, commercial and strata owners/managers can understand services before booking; browse or sign in. | `apps/marketing/app/routes/home.tsx` |
| Services `/services` | **The right service for the property.** | Browse 23 service types and select by scope, not just a familiar name. | `apps/marketing/app/routes/services.tsx` |
| Service finder `/service-finder` | **Tell us what the property needs.** | Pick sector and task, compare suitable inspection or attendance options. | `apps/marketing/app/routes/service-finder.tsx` |
| Who we help `/who-we-help` | **Property services for the people responsible.** | Choose between six audiences and understand authority and access. | `apps/marketing/app/routes/who-we-help.tsx` |
| Private landlords | **Keep your rental property in view.** | Understand property condition and maintenance follow-up without transferring landlord decisions. | `packages/marketing/audiences.ts` |
| Property management agencies | **Extra inspection capacity, without losing control.** | Commission documented attendances while retaining agency management responsibilities. | Same |
| Commercial property owners | **Clearer oversight of your commercial property.** | Condition/make-good inspection and authorised contractor access. | Same |
| Commercial and asset managers | **Site-level records for portfolio decisions.** | Organise records from multiple sites without implying technical certification or asset management transfer. | Same |
| Strata managers | **Practical support across common property.** | Commission approved shared-area inspections and contractor attendances. | Same |
| Building operators | **Reliable records for everyday building work.** | Document building access, maintenance observations, moves and handovers. | Same |
| Residential support `/residential-property-support` | **Begin with a property account. Choose support as you need it.** | Explains free account, one-off work and unapproved proposed paid plan. | `apps/marketing/app/routes/residential-support.tsx` |
| Leasing `/properties-for-lease` | **Properties for lease.** | Browse published properties, register for advertised open inspections and use the responsible representative's application process. | `apps/marketing/app/routes/leasing-index.tsx` |
| Contact `/contact` | **Tell us what the property needs.** | Consent-based property service/portfolio enquiry without uploading private access codes. | `apps/marketing/app/routes/contact.tsx` |

### All 23 service descriptions: publication source and boundaries
The **unique** human-facing lead, customer audience, preparation, point of difference and one service-specific FAQ for each of the 23 services are stored centrally in `packages/marketing/service-editorial.ts`. The existing detailed inclusions, exclusions and intended deliverables come from `packages/marketing/service-scopes.ts`. They are rendered by `apps/marketing/app/routes/service.tsx` with visible booking/price/area guidance. **Do not copy these into a second drifting document:** sign off the committed source text by exact commit SHA.

The services represented are:
- Residential: Routine Inspection; Property Condition Report; Pre-Vacate Inspection; Final / Exit Inspection.
- Commercial: Commercial Property Inspection; Commercial Pre-Vacate / Make-Good Inspection; Commercial Final / Make-Good Inspection.
- Strata: Common Property Inspection; Building Management Attendance; Damage / Incident Inspection; Cleaning & Presentation Inspection; Defect / Rectification Inspection; Contractor Supervision Attendance; Move-In / Move-Out Attendance; Urgent Building Attendance; Building Handover Attendance.
- Multiple sectors: Maintenance Attendance; Completed Works Inspection; Follow-Up / Reinspection; Property Meeting; Contractor Access Attendance; Key / Fob / Remote Handover; Custom Property Attendance.

For each service, accept or correct: the typical included work; explicit excluded specialist/legal/repair work; intended deliverable; authorised client; suitability of suggested service-finder selection; on-site restrictions; and whether the **actual** public booking path is one-off priced, quote/request or active entitlement.

## Decision register — approvals that are still required
`PENDING` means unapproved, not that evidence has been reviewed. Use `packages/marketing/publication-register.ts` for the machine-readable approval register and `packages/marketing/legal-drafts.ts` for legal-document flags. Never mark an entry approved with a fabricated reviewer, date or evidence location.

| ID | Decision required | Owner who must approve | Evidence before changing website or application | Release treatment while pending |
| --- | --- | --- | --- | --- |
| COM-01 | Confirm provider legal name, trading name, ABN, public address, telephone, privacy contact, customer-support contact and approved operating locations | Business owner | Validated business details; signed branding/contact instructions | No invented street address, telephone, credentials or service area |
| COM-02 | Confirm which of 23 services may be booked immediately vs quote/request; service eligibility by sector | Operations lead | Signed service catalogue and current booking-mode export | Only the existing operational booking/quote flow is offered |
| COM-03 | Confirm genuine WA coverage by town/suburb/postcode, travel limits and availability capacity | Operations lead | Service area map and scheduling acceptance evidence | Say Western Australia focus and confirm address individually; no unverified local suburb pages |
| COM-04 | Sign off actual inclusions, exclusions, report type and turnaround for all 23 services | Business owner + operations lead | Exact source/SHA reference against signed scope schedule | Marketing guidance only; no guaranteed report format/timing |
| COM-05 | Set one-off service prices, GST disclosure, quote acceptance, additional travel/specialist/third-party expenses | Commercial owner + accountant | Approved price list and tax treatment | No made-up fees or zero-dollar promises |
| COM-06 | Set the proposed residential **AUD 50 + GST** per property per week, authorised GST rate, service coverage and excluded/conditional tasks | Commercial owner + accountant + legal reviewer | Signed subscription schedule, final rate card and accountant-reviewed tax code | Informational proposed offer, noindex and no checkout |
| COM-07 | Approve billing trigger, Friday collection timing, failed payment/grace policy, cancellations, refunds, grandfathering and voluntary conversion | Commercial + legal + finance | Legal-approved customer terms; Stripe tax/webhook/portal verification and signed live tests | No automatic customer charge, no transfer from legacy entitlements |
| COM-08 | Confirm which audiences may create accounts and which require organisational authority checks | Product owner | Hosted role journeys and privacy/security sign-off | Generic CTAs cannot bypass role checks |
| COM-09 | Approve open-home inspection representative, leasing handoff and application/decision text | Leasing operations + responsible agent | Approved listing/representative permissions and exact data use disclosures | ProInspect acts only on the representative's instruction, never claims to approve applicants |
| COM-10 | Confirm capacity for urgent attendance and whether any 24-hour commitments or response SLAs are legally offered | Operations lead | Signed service-level policies | No emergency/24-7 guarantee |
| LEG-01 | Approve operative Privacy Policy: data categories, processors, cross-border flows, retention, contact, access/correction and breach handling | Legal reviewer + privacy officer | Signed versioned text, current provider contracts and actual data-flow audit | Draft visible and noindex |
| LEG-02 | Approve Website Terms and Platform Terms, registration, acceptable use, security and access terms | Legal reviewer + business owner | Signed version + effective date and acceptance mechanism | Draft visible and noindex |
| LEG-03 | Approve Services Terms, scopes, legal entity, exclusions, access authority, Australian Consumer Law and complaint pathways | Legal reviewer + business owner | Signed exact text, mapped service schedules | Draft visible and noindex |
| LEG-04 | Approve Booking & Refund Policy, cancellations, property access, rescheduling and quote/payment handling | Legal reviewer + commercial owner | Signed customer-facing version consistent with operational workflows | Draft visible and noindex |
| LEG-05 | Approve Residential Subscription Terms, direct debit/Stripe collection, GST, included work and cancellation | Legal reviewer + finance | Signed version, tax setup, checkout/portal/webhook live acceptance | Paid plan informational and noindex; no live sale |
| LEG-06 | Approve use of WA statutory tenancy references and maintain separation between factual reports and statutory/legal decisions | Legal reviewer + relevant operations expert | Reviewed guidance and report-template acceptance | No legal opinion, tenancy decision or bond-deduction promise |
| MED-01 | Approve public property photographs/illustrations, commercial licences, identifiable persons and consent | Marketing owner + rights holder | Source, licence, property/person consent evidence, approved alt text | Labelled synthetic illustrations only |
| MED-02 | Approve real report/PCR samples and any case study, review or testimonial | Privacy + operations + relevant customer | Redaction, release consent and claim substantiation | Synthetic report previews only |
| SEO-01 | Confirm canonical hostname, Search Console ownership, indexable routes and approved local search strategy | Site owner | DNS/verification, live crawl, sitemap and crawl-source evidence | Technical metadata deployed, unapproved content excluded |
| A11Y-01 | Manual WCAG 2.2 AA review at mobile/tablet/desktop, keyboard, 200/400% zoom and assistive tech | App/product reviewer | Results/screenshots, exception log, named approver/date | Automation only; do not claim certified compliance |
| AN-01 | Decide analytics platform, lawful consent/notice, event retention and conversion definitions | Privacy + marketing + product | Approved privacy notice, tag inventory and reporting specification | Measurement plan only; no unconsented tracking |

### Signature / release evidence template
For each decision record, fill the following **in the approved internal release system** (not by storing signatures, licences or customer documents in this public repository):

- ID and exact content version / Git commit SHA
- Decision: **approved / corrections required / rejected**
- Approver's legal or authorised business role
- Approval timestamp (AWST) and effective date, where applicable
- Private evidence reference and reviewer comments
- Engineering verification run, browser/screenshots, canonical source readback
- Any exception, expiry, rollback condition and replacement owner

**No approval signatures or approvals have been provided here.** The user instruction to merge reviewed code does not represent acceptance of legal policies, payment authorisations or third-party photographic rights.

## Publication process and practical copy QA
1. Check that every route conveys a useful customer outcome in the first visible paragraph, then explains the process, scope and exclusions in plain English.
2. Avoid stock phrases such as 'seamless', 'game-changing', 'AI-powered', 'guaranteed', 'fully compliant' or 'unlimited' unless backed by a signed factual source.
3. Check every CTA routes to a functional, appropriately authorised existing service/booking/enquiry flow; do not turn an enquiry into a confirmed booking.
4. Verify all 23 services, six audiences, footer, desktop/mobile navigation, guide links and the account-first call to action.
5. Check that private photographs, tenancy information, access codes, payment details and report metadata never appear in public markup or SEO fields.
6. Before turning on paid subscriptions or using real media, complete separate approval commits backed by actual evidence. Never flip release flags just to satisfy automated tests.

## Exact next changes after sign-off
- **Approved subscription:** Replace the deliberately provisional price description with reviewed inclusion schedule and checkout disclosure, then independently approve legal version, GST code and Stripe receipt/webhook, change publication flag and verify indexing; do not migrate legacy subscriptions silently.
- **Approved imagery:** Add optimised public-safe assets to the public assets build, register their rights records and correct alt text in `apps/marketing/app/lib/media-approval.ts`; retain illustration for any missing slots.
- **Approved policies:** Publish through the versioned legal workflow; only then modify the legal approval source and assertions to remove noindex for the exact approved document.
- **Approved geography:** Add real service-area pages only where coverage, staff availability and genuinely unique location-specific copy can be substantiated, not by templating hundreds of suburb names.

## Hand-off references
- `docs/STAGE3_MARKETING_SEO_RELEASE_2026-11-08.md` — implementation and quality checklist
- `docs/STAGE3_SEO_ACQUISITION_PLAN_2026-11-08.md` — keyword mapping, acquisition execution and measurement
- `docs/MARKETING_RELEASE_REVIEW.md` — historical release review, legal/media/accessibility gates
- `docs/residential-subscription-commercial-terms-draft.md` — proposed residential commercial terms, not an approved contract
- `packages/marketing/publication-register.ts` — machine-readable approval entries
- `packages/marketing/service-editorial.ts`, `packages/marketing/service-scopes.ts`, `packages/marketing/audiences.ts` — the actual copy sources

**Decision now:** Public factual marketing copy is ready for independent approval/release checks; commercial, legal and media decisions above remain explicitly pending.
