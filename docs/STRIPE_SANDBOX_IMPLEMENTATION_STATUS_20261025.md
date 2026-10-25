# Stripe sandbox integration status — 25 October 2026

Stripe sandbox account: `acct_1USumhEv62nbUZok` (not the live account).

## Verified

- 162 fixed one-off AUD prices and products created and verified against the supplied fee schedule. Source-to-Stripe mapping: [`integrations/stripe/sandbox-price-map-20261025.csv`](../integrations/stripe/sandbox-price-map-20261025.csv).
- Two recurring sandbox subscription Prices: Residential `price_1UUOxKEv62nbUZoksUBo5igf` (AUD 30 + GST per week per enrolled property), Commercial `price_1UUOxMEv62nbUZokN7kLvP4B` (AUD 250 + GST per month per property).
- Zero observed amount/currency/tax-behaviour mismatches in the fixed-price catalogue.
- 12 variable/quote/minimum/complimentary entries deliberately omitted from fixed pricing.

## Deployment gates (NOT complete)

1. Sandbox Stripe Tax status is pending; no active AU tax registration is recorded. Do not enable automatic tax until head-office details, tax registration, and a real tax-calculation test are verified.
2. Current `proinspect-v3-staging` Cloudflare Worker is an older build and has no Stripe restricted test API key or webhook signing secret. Do not aim test webhooks at the production Worker.
3. A local staging Checkout/webhook integration candidate has been prepared and tested at schema/source level, but is not yet submitted as verified code or deployed. Its code package is retained separately for review, not represented as deployed.
4. Before deployment: review the new financial reconciliation flows, run full CI (typecheck, browser and Worker/D1 integration), apply additive migration `0027` to an isolated staging database, install write-only sandbox secrets, register the staging test webhook, and test real sandbox event delivery.
5. Keep all new Stripe billing and guest checkout feature flags disabled until actual provider acceptance. The existing subscription entitlements must not be removed or elevated automatically.

No customer subscriptions, invoices, charges, refunds or payouts were created. No live Stripe or production Cloudflare settings were changed.
