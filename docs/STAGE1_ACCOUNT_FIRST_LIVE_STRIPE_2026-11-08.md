# Stage 1 — Account-first onboarding and live Stripe integration record

**Date:** 8 November 2026, Australia/Perth. **Source PR:** #85. **Status:** implementation candidate; **NOT approved for live billing activation**.

## Customer contract

1. Verified email identity creates a free ProInspect account. No Stripe customer, payment method, subscription or recurring invoice is created.
2. A self-managing owner can open a Residential/Commercial workspace and add a property subject to authority. This action does not contact Stripe or enroll the property.
3. Account > Properties and subscriptions shows `free / grandfathered / pending / active / past_due / canceled` separately from the authenticated account.
4. A residential owner without a grandfathered property grant can explicitly choose to review and accept a versioned plan and open Stripe-hosted Checkout.
5. **The Checkout success URL never grants included services.** Active Stripe subscription + signed paid invoice with current paid-through period + no risk holds + explicit approved service allowance are all required.
6. Existing historical all-inclusive subscriptions are not removed or changed. Migration 0053 freezes their property-level coverage at the relationships that existed before free registration began. New properties added later are not silently included; existing properties cannot be converted into live paid customers by visiting a subscription page.

## Migration 0053 and deployment ordering

**Required remote order:** Apply 0049, 0050, 0051, 0052, 0053 to the actual production D1 database *before* deploying Stage 1 source code. The 0053 migration drops automatic all-inclusive client creation triggers and snapshots old grants before it permits new free registrations. There must be a reviewed migration rehearsal, D1 time-travel bookmark, recovery evidence, production schema identification, integrity checks and old customer/property record comparison. A Worker rollback does **not** undo these D1 changes. Do not deploy new `onboard()` source with migration 0053 missing: it writes the new preference table.

No stage 1 migration has been applied to production by this PR. Do not manually mark migrations as applied or run ad hoc SQL against the live ledger.

## Live Stripe source of truth (read through official live Stripe connector)

- Merchant: `acct_1USumSEynzcud8MV` — ProInspect Property Services, **live mode**.
- Product: `prod_VWXmN5UFyCZhrC`, Residential Property Support Subscription.
- Existing price: `price_1UVUgqEynzcud8MVLxm1mGRn`, **AUD 5000 cents weekly**, `tax_behavior=exclusive` **successfully corrected in live Stripe on 8 November**. No new price, subscription, customer, payment or charge was created.
- Product `tax_code=txcd_10203001` identifies downloadable software and is **incorrect** for property inspection/support. Candidate `txcd_20060053` is Stripe's `Home Inspection Services` classification (from canonical en-AU search); the final code needs approved classification for the actual bundled services. Do not update the product to an unapproved code.
- Tax Settings are `active`, but **Australian tax registration `taxreg_1USv62Eynzcud8MV1oa4NwJT` is expired**, not collecting. Do not infer GST compliance or reactivate/create a tax registration without confirmation of the merchant's existing ATO GST registration. Inactive registration blocks activation even with automatic_tax enabled.
- Live Billing Portal `bpc_1UVo5XEynzcud8MVDJ4cYZ7p` is active, has period-end cancellation without proration, history/payment method updates and no customer-controlled quantity or plan changes. Existing subscribers' self-service cancellation must remain available even when new signup is paused.
- Live webhook endpoint `we_1UZRUnEynzcud8MV7AoSNvhZ` at `https://proinspect.systems/api/webhooks/stripe/residential-live` was created with the 20 relevant Checkout, Subscription, Invoice, risk/refund/dispute events, pinned to API 2026-09-30.endive and **disabled** while prerequisites remain unresolved. A generated signing secret was not installed in Cloudflare due to cross-service secret transfer being blocked; do not copy secrets into GitHub, tools or files.
- Production Worker requires `STRIPE_RESIDENTIAL_LIVE_KEY` as a **least-privilege restricted live key** and `STRIPE_RESIDENTIAL_LIVE_WEBHOOK_SECRET` as a write-only secret. Both were absent in readback at this review. Production `RESIDENTIAL_LIVE_BILLING_ENABLED=false`, `STRIPE_PAYMENTS_ENABLED=false`. No feature flags activated.

### Exact live activation sequence

1. Business/accountant confirms registered AU GST status, bundled on-site service tax classification and whether every claimed included service is eligible. Record the approval and update the active Stripe Tax registration and Product tax code in **live mode**. Verify tax with a non-chargeable Stripe live invoice preview, inspecting `taxability_reason` (a live Tax Calculation endpoint may incur a fee).
2. Review and approve current operative terms (including Friday 9 AM AWST billing, cancellation, 72-hour possible grace, service/visit inclusions). Publish versioned documents in ProInspect and turn on legal acceptance **only after document-specific acceptance**. Production Checkout explicitly requires `LEGAL_ACCEPTANCE_ENABLED=true`.
3. Populate `residential_paid_service_allowances` with signed independently approved exact `service_id`, approver and approval reference. **The table is deliberately empty by default**; no unrestricted service entitlement is assumed merely from payment.
4. Install the restricted live Stripe key and the endpoint signing secret using secure Cloudflare Worker secret bindings (do not commit values). Verify key's `/account` matches `acct_1USumSEynzcud8MV`.
5. After migration and deployed exact-source CI, enable the existing Stripe webhook endpoint; confirm signature and idempotent event processing, replay/out-of-order handling, failed/paid renewal state, refund/dispute holds and correct client-property mapping without unauthorised customer charges.
6. Obtain independent business, legal, accounting, security, operations and recovery acceptance, verified legal version, and source-specific release approval; only then enable `RESIDENTIAL_LIVE_BILLING_ENABLED=true`. Do not enable general financial custody or Stripe Connect.
7. Confirm that free signup creates neither Stripe customer nor subscription or wildcard coverage, subscribed service access starts only after verified settled Friday invoice, and existing approved grandfathered properties remain unchanged.

## Current blockers to full activation

Expired AU Stripe Tax registration; Product tax classification unapproved; restricted live API key and webhook signing secret not installed; disabled webhook; no approved live service inclusion schedule/legal texts; pending D1 migrations 0049–0053; independent live/recovery acceptance and proper GitHub main protection remain open.

**Release state:** engineered and reviewable; commercial charging remains OFF. Source-level CI and a disabled webhook endpoint are not live-payment acceptance.
