# Stripe sandbox integration — staging readiness

## Scope and environment

- Stripe sandbox: `acct_1USumhEv62nbUZok`.
- Staging Worker: `proinspect-v3-staging`, never the production `proinspect-platform` Worker.
- Approved sandbox Prices: Residential $30/week/eligible property (`price_1UUOxKEv62nbUZoksUBo5igf`) and Commercial $250/month/eligible property (`price_1UUOxMEv62nbUZokN7kLvP4B`), **exclusive of GST**.
- The full 162 fixed-price service catalogue is stored as a verified SKU-to-Price map in `integrations/stripe/sandbox-price-map-20261025.csv` on PR #44. The 12 non-fixed-price items are excluded.
- Existing ProInspect D1 service IDs do not directly correspond to all Stripe Product IDs; guest Checkout currently uses the approved immutable payment amount recorded at booking, not the imported Product Price ID. Do not advertise full catalogue-to-booking mapping until individual service scopes are reconciled.

## Secrets and flags

In the isolated staging Worker add `STRIPE_SECRET_KEY` as a **sandbox-only restricted key** with the minimum Checkout Sessions creation/read privileges. The webhook signing secret for the corresponding Stripe test destination is a separate `STRIPE_WEBHOOK_SECRET`. Never store either in GitHub, source files, plaintext Worker variables or logs.

`STRIPE_ACCOUNT_ID=acct_1USumhEv62nbUZok`
`STRIPE_BILLING_ENABLED=false`
`STRIPE_GUEST_CHECKOUT_ENABLED=false`
`STRIPE_TAX_READY=false`

The code rejects live keys and live events in local/staging. It refuses Checkout until the three flags are correctly enabled and webhook verification is installed. Existing inclusive subscriptions and portfolio rights are not changed by a Stripe test payment.

## Stripe Tax gate — must remain closed until verified

The sandbox Tax settings were `pending` with missing head-office information and no active AU tax registration in the 25 October audit. An actual Australian business address and evidence of GST registration must be supplied by the business owner before recording a Stripe Tax registration. Do not invent the business address or claim automatic Tax is enabled. Confirm the Product tax classification and test calculation, including `taxability_reason`, before setting `STRIPE_TAX_READY=true`.

The subscription Checkout flow uses `automatic_tax[enabled]=true` when ready; one-off guest payment records already include a fixed amount and separate GST in D1, so their Checkout must **not** add automatic tax again. Confirm the legal GST treatment of all services before enabling collection.

## Release gates

1. Run `pnpm install --frozen-lockfile`, `pnpm check` and `pnpm test:integration` on PR #44. Verify `tests/runtime/stripe.mjs` produces signed-webhook, replay, event-order and one-off payment checks. Do not merge while CI is red.
2. Confirm D1 staging migration ledger and a point-in-time recovery bookmark. Apply additive migration `0027_stripe_billing.sql` **only to staging**, and validate schema, foreign keys and preserved records.
3. Deploy a matching verified GitHub SHA to the isolated staging Worker with the correct D1/R2 bindings and feature flags off. Never deploy this candidate directly over production or the unrelated older staging Worker without reconciling its assets.
4. Provision the restricted Stripe sandbox key through the authorised Stripe Dashboard, transfer it to the Worker secret store using an approved secure secret channel, and verify that it belongs to the sandbox account. Do not send or paste the key in chat.
5. Register the Stripe test webhook endpoint `https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev/api/webhooks/stripe` with only implemented events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Store the returned signing secret securely in staging.
6. Test guest booking, verified signature, one-off paid and delayed payment, failed/duplicate/out-of-order subscription events, customer ownership and absence of cross-account access. Verify a real test checkout and webhook from Stripe, not only generated fixtures. Record the results and linked Stripe test IDs.
7. Switch `STRIPE_BILLING_ENABLED` and `STRIPE_GUEST_CHECKOUT_ENABLED` only for a controlled test after all gates pass. A completed Checkout must not be taken as proof of invoice settlement or grant entitlements independently from approved contract rules.

## Finance reconciliation

Incoming paid invoices are recorded as `needs_reconciliation=1` until line items, discounts, credits, currency, tax and amount are matched to the correct invoice/Price. Events are recorded in an immutable billing-event table, with monotonic timestamps preventing an older subscription lifecycle event from overwriting the latest state. Neither the billing-event record nor Checkout return grants application entitlements. A separate financial approval is required before production subscription automation.

## Current delivery status

This branch contains the code and local/schema test sources. Full CI, actual Stripe sandbox key/webhook setup, Cloudflare staging deployment and real hosted payment tests require verified results and are **not implied by these files**.