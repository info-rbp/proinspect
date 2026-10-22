# Stripe and guest pricing activation

## Actual current contract
Public one-off rates come from ProInspect D1 `services.price_ex_gst_cents`, `booking_mode` and `active`, not automatically from Stripe. At the 22 October audit all 23 active services were unpriced. The guest property postcode currently records service location; there is no configured postcode-based price engine. Do not create a Stripe Terminal Location to repair online booking prices.

Staff > Services & booking configuration: publish each approved AUD price excluding GST and choose Instant booking for genuinely fixed-scope work. Leave genuinely quoted services in Request mode. The application currently calculates GST at its existing 10% convention; business GST registration/treatment must be confirmed before publishing prices. A blank price is never a free service. Regional surcharges/property-size tiers need an approved rate matrix and an explicit server-side implementation, not assumed Stripe geolocation.

## Stripe setup after approval
1. Use Stripe sandbox/test mode first. Complete legal business verification, settlement bank account, business/support details, approved statement descriptor and tax settings separately for live mode.
2. Current account Checkout uses a server-created AUD `price_data` amount from the immutable payment record. It does not consume Stripe Product/Price IDs. Creating Dashboard Products alone does not make ProInspect services bookable. Catalog-backed recurring plans will require explicit Product/Price mapping and subscription lifecycle handling; included application entitlements are not evidence of a paid subscription.
3. Configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as Worker secrets, never browser variables or chat text. Test and live credentials/signing secrets are different. Existing backend has no need for a publishable key for redirect-only hosted Checkout.
4. Register `https://proinspect.systems/api/webhooks/stripe`. The implemented paid-event handlers are `checkout.session.completed` and `checkout.session.async_payment_succeeded`. The application verifies signatures, time bounds, session identity, currency/amount and idempotent receipts. A success-page visit never settles an order.
5. Verify real test-card success, refusal, duplicate/out-of-order webhooks, expiry, delayed settlement and refund/invoice reconciliation before live collection. The current backend does not implement a complete Stripe Billing subscription/invoice/refund event lifecycle. Do not subscribe to events and assume they are processed just because Stripe delivers them.
6. Current online Checkout is customer-account scoped. Guest orders generate payment-required operational records but do not yet have a guest-token Checkout endpoint. Guest confirmation does not collect money. Complete that adapter and its provider-tested lifecycle before advertising payment at guest booking.
7. For automatic invoices and recurring billing, add reviewed handling for the chosen invoice, payment, subscription and refund events, stable Stripe customer mapping, immutable external IDs, retry/reconciliation jobs, and permissioned staff exception handling. Document which events are active in the deployed handler.

Keep rent, tenancy bonds and trust-money disbursement outside ordinary service Checkout. Government bond actions and any future rent-disbursement provider arrangement require separate approved processes.

Official references: https://docs.stripe.com/products-prices/manage-prices ; https://docs.stripe.com/payments/checkout/fulfill-orders ; https://docs.stripe.com/webhooks ; https://docs.stripe.com/billing/subscriptions/webhooks
