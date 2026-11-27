# Simple Booking Enhancement

Status: proposed implementation scope; branch established, no production activation.
Base: main at 19bc68493200d44e20d7e02551b3bbd752c6e850.

## Objective

Deliver a simple, responsive public Book Now journey using the established ProInspect marketing design and the familiar Google Calendar appointment-selection pattern, with service-specific property details, an agreed price, invoicing and secure Stripe payment. Use the existing application as the foundation rather than create a parallel property or booking system.

## Customer journey and proposed sitemap

The route names below are design targets, not assertions of existing implementations. Reconcile these with the existing route registrations; reserve static paths before dynamic segments or use equivalent unambiguous routing.

| Page or step | Proposed path |
| --- | --- |
| Select a service | /book |
| Service-specific entry | /book/:serviceId |
| Customer/property details | /book/details |
| Appointment selection | /book/appointment |
| Booking review | /book/review |
| Hosted invoice payment | Stripe-hosted invoice page |
| Payment processing status | /book/payment-status |
| Booking confirmation | /book/confirmation |
| Request a quotation | /book/request |
| Recover a booking | /booking/recover |
| Sign in | existing /signin |
| Sign up | existing /signup |
| Account routing | existing /client and /start, as appropriate |

Booking steps may be stateful stages of a single interface. Service-specific marketing CTAs should preserve the service identifier. Customers may start the service selection before signing in; preserve the booking intent and nonsensitive draft data through verified authentication and account setup. Offer an existing-client sign-in and new-client sign-up path within the booking journey. Reuse verified identity, account onboarding, permissions and authorised property selection; new customers can provide a property through the approved property-creation workflow. Avoid exposing unrelated property/customer records or inferring authority from an address match.

The base application requires a verified account for a new direct booking. Preserve that policy until an explicit decision authorises a no-account guest pathway. Account creation must not silently purchase a subscription or override existing entitlement, pricing, activation or approval rules. Existing entitled customers must not be charged again for included services. Determine the exact account creation versus optional guest UX before release. Keep previously issued guest-management links functioning under existing restrictions.

## Service and appointment configuration

Use the current residential-focused catalogue and public retirement rules. Provide configurable direct booking, conditional booking, review/request and quotation paths. Reuse service metadata and add only necessary service-specific fields. Capture contact details, payer/organisation where applicable, property address and characteristics, occupancy, lawful access arrangements, service-specific instructions and optional secure evidence as needed. Use progressive disclosure; avoid unnecessary data collection.

Use Australia/Perth, approved service areas, duration, capacity, notice, buffers and travel rules. Reuse scheduling and Google Calendar integration subject to verification. A calendar selection is not a confirmed reservation; hold capacity temporarily during payment and prevent concurrent double booking. Open-home requests requiring review must not be represented as confirmed appointments. Approved pricing, weekend surcharges, key/travel charges, tax treatment, refund/cancellation rules and appointment durations must be configured and approved, not inferred from illustrative examples.

## Review, invoicing and payment

Display a final server-calculated price snapshot, applicable service scope, privacy collection notice, authority declaration and versioned booking/service terms before commitment. Create a pending booking intent and reservation; generate/finalise the invoice using the existing billing infrastructure and redirect to the Stripe Hosted Invoice Page, subject to reconciliation with current Stripe implementation. Do not treat a browser return as payment evidence. Verify and deduplicate signed Stripe events; reconcile payment amount, currency and invoice/booking references. Confirm the appointment and create the canonical Booking and Work Order once, after verified payment and valid reservation, or approved subscription/account billing. Handle failed/abandoned payments, expired holds/invoices, delayed payments, duplicate callbacks, refund and reschedule/cancellation exceptions without duplicate charges or double bookings. Use test mode and isolated data until provider and commercial acceptance.

## Booking management and operations

Provide scoped booking access (authenticated or secure verified transaction links as appropriate), appointment details, rescheduling, cancellation, access updates, invoice/receipt and approved report access. Reuse staff scheduling, operations, private documents, notifications and audit logs. Encrypt sensitive access instructions and avoid disclosure in normal email, URLs or logs. Preserve existing account/role permissions and historical data. Add confirmation/reminder/delivery messages and operational handling for exceptions.

## Navigation and deployment boundary

Target the primary marketing header CTA as Book Now. Retain usable account sign-in/sign-up links within the booking experience and distinct portal entry pathways. The previously discussed separate marketing/portal repository and Cloudflare Worker separation remains deferred; do not split repositories, change production domains, deploy, or alter live provider settings as part of establishing this branch. Preserve a clean service/API boundary for later separation.

## Implementation and acceptance sequence

- Audit existing routes, authentication, pricing/entitlements, scheduler, guest legacy workflows, billing/Stripe adapters and Staff Work Orders; document reuse versus gaps.
- Build mobile/desktop booking UI and preserve service selection through authentication and account creation.
- Implement validated service-specific forms, authoritative pricing, appointment holds and review.
- Integrate invoicing, verified payment processing and exception handling with the canonical operational records.
- Provide customer confirmation, recovery and authorised booking management, including report delivery.
- Verify customer journeys for new and existing clients, included-service eligibility, quote-only requests, failed payments, expiry, concurrent reservations, retries, access controls, accessibility, responsive layout and regressions. Obtain approved commercial/legal inputs and isolated provider acceptance before release.

No application code, production configuration, migrations or live transactions are changed by this planning document. Release requires explicit acceptance and merge approval.
