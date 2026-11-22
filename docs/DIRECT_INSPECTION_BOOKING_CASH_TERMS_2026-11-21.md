# Direct inspection booking and Cash Client terms — branch delivery

Source branch: `feature/direct-inspection-booking-cash-terms-20261121`
Originally based on `main` at `9385710d7a5a683a8bd7a34ed9c6546ceab2985e`; subsequently integrated current `main` at `632dbdbc901ba34a710ec90d63e09de8a58e2695`, including merged Client Portal PR #116 and marketing fixes.
**Not approved for production deployment.** Do not merge until source prices and contractual terms are signed off and provider integration is accepted.

## Price provenance
The Project file **ProInspect - Residential Property Support - Schedule of Fees (All Services).docx** lists:
- Row 01.01 Property Condition Reports (Form 1): **AUD 200 ex GST** per report
- Row 01.02 Routine Property Inspections: **AUD 60 ex GST** per inspection
- Row 11.04 Exit Inspections & Condition Comparisons: **AUD 100 ex GST** per exit inspection.

These are candidate source rates, not automatically approved production prices. Migration 0064 stores the unapproved amounts in `inspection_price_candidates` for unconfigured service IDs. It **does not** update `services.price_ex_gst_cents` or `services.booking_mode`; published pricing, quote-versus-instant booking and pre-existing rates remain unchanged. A separate versioned approval and release migration is required before any candidate price can be used for a charge. Staff must verify schedule version, applicability, GST, inclusions, travel extras, contract and cancellation policy before release. The alternative V4 fee schedules are versioned independently and contain conflicting subscription assumptions; do not map them blindly into entitlements.

## Cash terms
- No approved Cash Client credit profile: `upon_booking` (prepaid).
- `net_7`: invoice must be issued at/after service completion; due 7 calendar days after actual issue.
- `eom_7`: accumulate completed service charges by Australia/Perth service month; invoice on/after closing the month, due at 23:59:59 AWST on the 7th of the next month.
- Credit terms are Staff-requested, separately Staff-approved, and versioned in booking snapshots. A finite, positive credit limit is required for deferred bookings; an unbounded or missing limit fails closed. Unapproved requests do not change effective billing.
- A client can have eligible subscription coverage for one property and Cash bookings for another: eligibility is per property/service.

## Staged billing infrastructure
Cash credit bookings create a canonical Booking and Work Order plus a pending payment ledger entry, with no prerequisite card settlement. Work completion marks the charge ready for invoice preparation. An authorised Staff user can prepare a durable invoice batch with immutable line links. **Batch preparation is not invoice issuance, dispatch or settlement.** A live, signed and independently reconciled Stripe invoice delivery adapter must be accepted before granting invoice-sent status. The existing prepaid path remains production-guarded until hosted Stripe collection is accepted.

## Security
Structured booking intake is encrypted under `DATA_ENCRYPTION_KEY`; access is read-only through authorised Staff work-order scope with an audit record. Tenant notices must be lawful and distinct from booking confirmation. No tenant is automatically billed or granted client privileges.

## Required acceptance
- New migration upgrade and restoration on a non-empty isolated D1 copy.
- Hosted authenticated owner, agency and Staff booking flows for all three services.
- Included coverage vs Cash Client credit classification, idempotency, dual-review approvals.
- Payment failure/replay, schedule conflict and invoice arithmetic/date boundary tests.
- Genuine Stripe test Checkout and invoice delivery with signed webhook reconciliation and cancelled/failed scenarios.
- Approved prices, legal terms, screen-reader and mobile accessibility review.
- Production remains unchanged until explicit acceptance and release.

## Release flag
`CASH_CLIENT_CREDIT_ENABLED` is absent/off by default. Production refuses new deferred-credit bookings until this flag is set to `true` after approved legal terms, invoicing, reconciliation and hosted acceptance. Local/staging tests may exercise the workflow without affecting production. The flag does not enable live Stripe Checkout or invoice delivery.

## Client Portal and booking integration (PR #116 + draft PR #118)

- The existing secure email registration, owner onboarding and first-property selection from PR #116 are retained from `main`. A selected service flows from signup through onboarding and property creation to the same authenticated property-scoped booking screen.
- The draft booking step adds PCR, Final/Exit and Routine prioritisation; service-specific inspection information; confidential Staff-only intake; and Cash Client status / invoice preparation.
- An ordinary free-account owner without an approved published instant-booking rate must remain on the existing **request/quote** route. Staged schedule candidates do not convert requests into chargeable or confirmed direct bookings.
- Confirmed subscription inclusions remain property/service-scoped. An account can have paid and free properties; neither a signup selection nor a candidate price creates entitlement.
- If production credit is not released, customer booking terms display **pay upon booking** even if Staff has separately approved a future credit profile. The booking scheduler still blocks unreleased prepaid or deferred collection.
- Independent acceptance remains outstanding for source rate approval, reviewed legal/credit terms, true provider payment/invoice reconciliation, production release flags, accessible full journeys and hosted authentication. This PR stays **draft** until all gates pass.
