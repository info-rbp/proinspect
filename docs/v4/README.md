# Version 4 Guest Booking Finalisation — development branch

This branch starts at the verified `main` SHA `eea7584fc612d3b4d872434165008d0d77dc9b74` and adds a **separate, controlled Version 4 service-request pathway** without changing the existing V3 guest or subscriber booking flow.

## Catalogue and sources

- Residential PAYG: **54** rows from *ProInspect Schedule of Fees - Updated.docx*, pages 1–4.
- Commercial PAYG: **120** rows from *ProInspect Commercial Schedule of Fees - Commercial.docx*, pages 1–10, stated current September 2026.
- **40** reusable workflow definitions from *ProInspect Service Pricing and Workflow Blueprint.xlsx*.
- All **174** PAYG rows include the exact source service name, fee text, pricing unit/rule, scope description, intake guide, Staff steps, proposed output, proposed availability and source reference.
- Source-specific forms are backed by `packages/v4/workflows.ts`; this does not replace legal field specifications for official prescribed forms.

The authoritative source descriptions and workbook classifications have been preserved. **Proposed workflow rules are suggestions, not law or final business policy.** A compressed catalogue payload is used to keep Workers bundles small. Regeneration from the user-supplied workbook must preserve the 174-row, 40-workflow test invariants.

## Architected pathways

1. On-site inspection/attendance — request site details and access; Staff schedule through the existing appointment system **after approval**, then fulfil via a Work Order/report.
2. Document preparation — request parties, dates and approved instructions; Staff review and prepare the current official document, obtain permitted approvals/signatures and issue only to authorised recipients.
3. Administrative case — intake, authority review, information requests, approvals, tasks and status follow-up. No fake appointment.
4. Records, lease abstraction and reporting — collect approved source references, periods, documents, exceptions, register or report outputs.
5. Recurring services — approved frequency, period, service agreement, resource capacity and separate billing policy. No default customer entitlement is created.
6. Quoted/urgent/restricted services — Staff assess scope, legal authority and availability. No automatic promise or charge.

New routes: `/guest/services`, `/guest/request/:serviceCode`, `/guest/request/verify`, `/guest/request/manage`, `/guest/request/quote`; authorised Staff queue: `/w/staff/operations/v4-service-requests`.

## Security and transactional behaviour

- `V4_SERVICE_REQUESTS_ENABLED` is **absent/off by default**; new V4 intake has no live routes active until the release decision.
- Restricted family-violence Form 2 and court filing are not ordinary public guest checkout options.
- No new memberships, tenant rights, property record grants or subscription entitlements are created.
- Customer identity/request data are stored as AES-GCM encrypted envelopes. Public status uses time-limited hashed private tokens and does not return names, contact information, access instructions or underlying evidence.
- Turnstile, origin validation, honeypot, input bounds, rate limiting and per-request idempotency protect public intake.
- Verification and quote acceptance consume tokens with database mutation guards and version checks. Quotation changes revoke existing quote links.
- Staff actions are role-scoped, version-checked and recorded in the audit/event history.
- No guessed legal periods, auto-service of notices, auto-signing, government bond lodgement, court filing, trust-money handling, payment settlement, malware-scan bypass or auto-created appointments.

## Pricing gates

- Residential PAYG schedule explicitly states **payment within seven days after the service**. The commercial schedule does not provide equivalent payment terms; no blanket prepayment assumption is made.
- The residential fee schedule lists **$150 + GST/month/property** subscription pricing, conflicting with the combined inclusions' **$30 + GST/week/property**. Their included services also differ. Preserve both versions; do not automatically map any fee to an entitlement or recurring Stripe product.
- Unit rates are calculated with integer cents (`Invoice Administration`: $25/invoice, minimum $75; storage: $5/key/month); `POA`, `From` and base-plus-cost listings cannot be finalised as a single fixed online charge.
- The general price evaluator is informational only, pending written business approval of effective fee schedule, service area, client authority, GST/fees, booking terms, POA scope, subscription overlap and payment policy.

## Work still gated before production activation

- **Scheduled appointment fulfilment**: integrate approved requests with existing conflict-safe scheduler and lawful entry notice workflows; confirm access and availability.
- **Guest Stripe Checkout**: existing Checkout uses account payment records. Implement guest-specific immutable payment intent/session, delayed payments, webhook/replay handling, cancellation, refunds, invoice terms and reconciliation. Do not mark paid from redirect.
- **Documents**: legally approved current WA template versions, form-specific field mapping, dual QA, permitted signing, recipient-specific access grants, verified service records, secure malware-scanned uploads and retention policies.
- **Recurring plans**: approved property-level inclusion matrix, component/parent billing policy, frequency, expiry, per-property agreements and invoice events.
- **Provider acceptance**: genuine Resend delivery, Google Calendar writes where desired, R2 scanner callbacks, and real authenticated eight-portal cross-access tests.
- **Operational QA**: Staff review and issue processes for all service categories, exceptional area/travel/urgent pricing, partial information, wrong authority, duplicate retries, cancellations and expired quotes.

No deployment, Stripe live charge or domain/secret change is performed by this branch. Acceptance checklist is in `ACCEPTANCE.md`.
