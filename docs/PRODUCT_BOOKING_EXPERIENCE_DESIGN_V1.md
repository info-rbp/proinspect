# ProInspect — Product booking experience (design proposal, NOT implementation)

**Product design:** `UX-BOOK-PROPOSAL` · **Version:** `0.1.0` · **Date:** 2026-11-16
**Status:** Proposed for review. No new product, pricing, booking or payment functionality is authorised by this document.
**Source contract:** `packages/service-catalogue/index.ts`, `apps/platform/app/routes/book.tsx`, `packages/authorization/subscription-booking.ts`, `docs/PORTALS.md`, `docs/LAUNCH_SCOPE.md`.

## Design objective

One recognisable, mobile-first process for discovering and commissioning a ProInspect service, with portal-specific eligibility and no conflation of requests, quotations, payments, appointment holds and confirmed bookings. Booking intent survives authentication and free owner registration. One identity may have many authorised workspaces, but the chosen workspace and property determine the actions and billing authority.

**Current baseline:** The reference catalogue has 23 service IDs across inspections, attendance, maintenance/works, access/contractor support, documentation and ongoing operations descriptions. All seeded services begin as `request` mode with null price. Actual instant-bookable prices and published dates are separately approved operational values. No proposal here invents a live price, GST amount, SLA, appointment slot or included subscription benefit.

## Who may commission versus request

| Journey tag (proposed, independent) | User | Commission a ProInspect service? | First action |
| --- | --- | --- | --- |
| `BOOK-RES-OWNER` | Verified Residential owner | Yes, on their own authorised residential property | Select one-off service, covered service or request a quote |
| `BOOK-RES-AGENCY` | Residential agency | Yes, within effective managed property and assigned permissions | Select assigned property, service and authorised billing party |
| `BOOK-COM-OWNER` | Commercial owner | Yes, for the owned authorised commercial property | Select the approved commercial service scope |
| `BOOK-COM-MANAGER` | Approved commercial asset manager | Yes, within the reviewed managed-property engagement | Select property and contractual billing authority |
| `BOOK-STR-MANAGER` | Strata manager | Yes, for managed scheme/building and within delegated spending authority | Select common-property scheme/building context |
| `BOOK-OPS` | ProInspect operations | Internal service/order handling only within individual staff authority | Link customer, verified context, approval and source |
| `REQ-RES-TENANT` | Invited residential tenant | No independent paid commissioning by tenancy membership | Submit maintenance or inspection/access request to manager |
| `REQ-COM-OCCUPANT` | Invited commercial occupant | No independent paid commissioning by occupancy membership | Submit their own premises issue to authorised manager |
| `REQ-STR-RESIDENT` | Invited building resident / lot owner | No blanket booking authority from lot or resident membership | Lodge common property or own lot issue for triage |
| `REQ-STR-COUNCIL` | Verified strata council member | No unilateral booking instruction from council membership | Review proposals, record recommendations and declared interests |

A user with both owner and resident roles may select their **owner workspace** to book, but the permissions may never be unioned across workspaces. A future delegated-resident payer feature, if desired, must be a **separately approved permission and payment policy**, not an implicit permission.

## Five customer-facing steps

1. **Choose service/product** — Enter from a public service page, a portal service area, an authorised property screen or booking history. Show sector applicability, service purpose, broad deliverables, any prerequisites, and whether the item is instant-bookable, request-for-quote, or entitlement-covered. Preserve the exact service ID through sign-in.
2. **Choose authorised property** — Select only the properties/schemes available inside the current workspace, and verify the property category, management appointment, delegated role and ownership/assignment again on the server. Where no verified property exists, offer free setup or a reviewed association rather than allowing address-based access claims.
3. **Describe scope and site access** — Collect only the fields required for that service: property/premises context, inspection reason, tenancy or occupancy (when authorised), access representative, notice/entry arrangements, date constraints, instructions and optional evidence. An accepted booking is **not** itself a tenancy entry notice. Encrypt sensitive keys and instructions; exclude them from routine emails.
4. **Price or quote and schedule** — Display approved service price, GST, total, any optional approved fees and who pays. Validate subscription inclusion from an active, eligible entitlement for the selected property and service, not from a client plan label. For approved instant bookings, show only real available slots in Australia/Perth local time with a backend expiry/recheck; for request-only services show *Request a scoped quotation* and **no appointment-confirmed wording**. Do not invent an availability calendar for quote-only work.
5. **Review, consent and confirm** — Present the exact property, service, scope, chosen slot or quote request, pricing, cancellation/variation conditions, access responsibility and legal acceptance version. The server rechecks identity, delegated authority, catalogue/price version, availability, payment or inclusion, duplicate request key, and immutable consent. Create durable booking + Work Order exactly once when all prerequisites are satisfied. Show confirmation reference, notifications, report expectations and next steps. A checkout redirect or pending payment is not evidence of a confirmed booking.

### Quote-only pathway

Service selected → scope request submitted → ProInspect reviews scope → versioned quotation prepared → authorised customer accepts/declines → payment or invoicing authority checked → real appointment offered → booking confirmed. All transitions have timestamps, actors and immutable commercial terms. Requests remain visibly **pending**, never shown as confirmed slots.

### Subscription-included pathway

Eligibility uses effective client, authorised property, service ID, active subscription allowance, current settled Stripe invoice where relevant, and existing historic property-specific grandfathering. Failed first invoices, expired grace, void/uncollectible payments and revoked entitlements do not provide an allowance. Inclusion confirmation creates no additional charge only when the backend verifies the exact eligibility; preserve any existing allowance-count/usage policy.

### One-off priced pathway

New account creation remains free. Customer may commission one priced service without automatically enrolling in a plan. Capture approved price version, GST, customer/billing party, legal acceptance and actual server-confirmed payment status before final confirmation when prepayment is required. Failed/cancelled checkout remains a pending request, not a paid booking. Refunds and credits follow a separate, audited financial-correction workflow.

## Portal-specific product discovery

- **Residential owner:** Inspections, property condition reports, pre-vacate/exit, maintenance attendance, follow-up and access/handover. Group by `My properties`, not by general consumer shopping basket.
- **Residential agency:** Same sector-eligible services, plus approved bulk/recurring planning, manager assignments, owner notices and agency billing authorities. Do not infer a tenant's consent from a booking.
- **Commercial owner/asset manager:** Commercial inspection, pre-vacate/make-good, final/make-good, approved maintenance and attendance. Commercial lease/source records and premises access require commercial-specific validation.
- **Strata manager:** Common property inspections, incident, defects, building management, contractor attendance, keys/moves and authorised urgent building requests. Booking approval/limits must reflect the scheme's delegation and applicable council process.
- **Resident & Member:** A *Request help* or *Report an issue* experience, not an owner checkout. The invited recipient sees only own property/premises/scheme context and the resulting request status.

Some catalogue services apply across sectors (maintenance attendance, completed works, reinspection, property meeting, contractor access, key handover and custom attendance), but their forms and eligibility must still reflect the selected portal's authority and context. Urgent building attendance must state its real service coverage and must not imply emergency response.

## Product navigation proposal

The **manager/owner** workspace adds an independently versioned `BOOKINGS` menu family with:
- **Explore services** — available catalogue filtered by authorised property/sector and published state.
- **New booking / Request quote** — mode and entitlement aware.
- **My bookings** — upcoming, pending, completed, changed and cancelled with property and status filters.
- **Quotes & approvals** — requests awaiting price/scope decision and customer authorisation, when applicable.
- **Subscription coverage & billing** — visible only to the actual authorised billing/admin role and only where implemented.
- **History, reports & support** — issued documents and changes within explicit grants.

For Resident & Member, show **My requests** and context-specific inspections/notices, **never** a generic paid booking/checkout link without an explicit new delegated role.

## UX details and failure handling

- Mobile-first stepper, keyboard and screen-reader labels, 320 px baseline, save and resume with verified identity, clear back navigation and no accidental double submission.
- No hidden cost or passive subscription consent; distinguish ex-GST and incl-GST AUD correctly.
- Show exact status: `Request submitted`, `Awaiting quote`, `Payment pending`, `Awaiting scheduling`, `Confirmed`, `Completed`, `Cancelled`; these are **proposed display states**, not a declaration that current database enums implement all of them.
- Slot race/capacity conflicts return an updated slot choice, not duplicate bookings. Network loss instructs the user to inspect the current booking before retrying.
- Service date changes, cancellations, discounts, invoice adjustments, credits and refunds must have distinct permissions and audit trails.
- No sensitive site keys, private contact details or document access tokens in confirmation emails or public URLs.
- All service and pricing summaries render from the approved shared catalogue with no copied marketing prices.

## Engineering acceptance for the *next* booking workstream

1. Every commissioned booking uses a verified identity and an authorised client, property/scheme and service match; no new public guest order route.
2. All relevant 10 permission scopes deny cross-property commissioning and direct API bypasses.
3. One-off, approved subscription allowance, request/quote and authorised recurring variants are separately tested with source-derived pricing and effective dates.
4. Quote-only requests cannot reserve a scheduler slot; payment redirects cannot mark financial settlement.
5. Repeat/idempotent requests, concurrent slots, scheduling provider failures, rebooking, cancellations, entitlements and payment reconciliation are independently tested.
6. Legacy guest orders, issued reports and pre-existing Stripe/subscription agreements remain readable and unchanged.
7. Independent authenticated hosted journeys, real email and payment-provider sandbox tests, isolated D1/R2 recovery and legal/commercial approvals precede release.

## Product decisions still required

Define independently approved price and GST presentation for every published SKU; quote expiry and approval ownership; deposits and invoiced-credit policy; cancellation/reschedule fees; subscription service allowances and fair-use rules; bulk/service bundles; strata spending thresholds; commercial access evidence; and whether any limited delegated Resident commissioning will ever be offered. None should be enabled by assuming values.

**This design is the next phase specification, not a change to active booking APIs, catalogue prices, scheduling, Stripe or release entitlements.**
