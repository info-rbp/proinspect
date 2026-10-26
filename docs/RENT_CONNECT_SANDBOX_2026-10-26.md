# Stripe Connect sandbox onboarding — ProInspect self-managed residential landlords
This change **does not** charge rent, hold tenant funds, transfer funds, or disburse bonds. All real-money paths remain disabled.
## Routes
- GET /api/w/landlord/:scopeId/rent-plans/:planId/connect-summary — account onboarding status with money gates false.
- POST /api/w/landlord/:scopeId/rent-plans/:planId/connect-onboard — authenticated and origin-protected Stripe Express account creation/reuse and hosted onboarding link, **only** with staging + `sk_test_` + deliberately approved feature flag.
- Only currently authorised owner/admin for an active residential tenancy with the newest self-managed `landlord_connect_candidate` rent plan may call. Agencies and unrelated landlords are denied.
- Stripe is only given a purpose and opaque internal plan reference, never tenant Form 2 details, account numbers, sensitive tenancy evidence or bond contents.
- A return redirect from Stripe is not proof that onboarding is complete, and `charges_enabled` is not permission to collect rent.
## Remaining before any actual rent payment
Legal and Stripe product approval for the rental use case; signed Connect `account.updated` webhooks; owner/tenant identity and fee-free payment option acceptance; chargeback/refund and payout/reconciliation workflows; provider-tested sandbox direct charges where legally allowed. Never route agency trust money or bonds through the ProInspect platform.
