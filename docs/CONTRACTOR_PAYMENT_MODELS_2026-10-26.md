# ProInspect contractor payments — both client payment models

## Scope and release boundary

This is a **stacked review branch based on Stripe sandbox PR #44**. It introduces two auditable choices for authorised **property work orders with assigned, active contractors**. It is **not** a bond, rent, strata trust, escrow, landlord rent disbursement or general-purpose custodial money platform. No production Stripe credentials or real transfers should be used.

### 1. Direct payer: landlord or agency pays contractor

- Operations or an authorised client administrator creates a plan from a work order with an approved cost authority that covers the full contractor invoice.
- The client administrator chooses/authorises `payer_direct` with a verifiable authority reference.
- The client pays outside ProInspect using their own authorised arrangements. No ProInspect charge or Stripe transfer is created.
- The client records an external transaction reference; authorised operations staff independently verifies payment evidence.
- The plan records `external_reported` and then `external_verified`. Only the external payer/bank can establish actual legal settlement. ProInspect records confirmation, not custody.

### 2. ProInspect-managed marketplace collection and later transfer

- The plan is expressly `platform_collect`; ProInspect is the merchant of record and owns processing fees, refunds, disputes and negative-balance exposure. **Stripe and Australian legal approval are prerequisites.**
- Each plan has a client/owner approved work order, contractor, quote and invoice reference, gross cents including the approved invoice tax, and an explicit ProInspect retained fee.
- Client admin authorisation is distinct from operations. Stripe-hosted Checkout collects into the platform's account with `transfer_group` tied to the plan. The payment does **not** auto-transfer; no destination charge is used.
- Only a verified, signed Stripe payment event can mark the collection funded.
- Work order completion and client release approval are required before a separate operations officer can initiate a transfer.
- Before transfer, the server checks the intended connected recipient's **v2 active recipient capabilities** and verifies the Stripe PaymentIntent, amount, currency, transfer group, metadata and Charge ID.
- Transfers use separate charges and transfers with `source_transaction`; net transfer equals approved gross minus explicitly agreed platform fee. No `application_fee_amount` is used.
- A transfer is marked `transfer_initiated` **before** calling Stripe. If Stripe times out or reconciliation fails, the plan remains in a review state. Never automatically retry or send a second transfer without manually reconciling the original Stripe request.
- `transfer_created` means transfer to a connected Stripe account, **not verified receipt in the contractor's bank account**. Payout failure, dispute and transfer-reversal events require an explicit financial review.

### Feature gates (all default false)

- `CONTRACTOR_PAYMENTS_ENABLED` — guarded feature approval for application UI/workflows.
- `STRIPE_CONNECT_MARKETPLACE_APPROVED` — Stripe's written acceptance of this exact business model and legal/payment custody review.
- `STRIPE_CONNECT_COLLECTION_ENABLED` — guarded test Checkout.
- `STRIPE_CONNECT_TRANSFERS_ENABLED` — stronger separate gate for transfer requests.
- `STRIPE_TAX_READY` — verified relevant tax treatment; Checkout uses approved invoice gross with no additional Stripe automatic tax.
- `STRIPE_ACCOUNT_ID` must be sandbox `acct_1USumhEv62nbUZok`; credentials must be `sk_test_` or preferably a restricted `rk_test_` key. Production is **always blocked** by this implementation.

Required secret bindings, separate from the normal Stripe subscription Checkout secret:

- `STRIPE_SECRET_KEY` — test-only restricted key with only needed permissions.
- `STRIPE_WEBHOOK_SECRET` — signed service/Checkout webhook secret.
- `STRIPE_CONNECT_PLATFORM_WEBHOOK_SECRET` — signature for Connect platform transaction/reversal webhook.
- `STRIPE_CONNECT_RECIPIENT_WEBHOOK_SECRET` — signature for Connect connected-recipient webhook.

These are not to be stored in source code or pasted into chat. The two Connect webhook destinations created in Stripe sandbox are currently **disabled** and must not be enabled until the deployed Worker matches the handlers and their separate secrets are installed.

### Interfaces

- `/w/:kind/:scopeId/contractor-payments` — the finance page for allowed customer/property manager/commercial and staff operations workspaces.
- Workspace API under `/api/w/:kind/:scopeId/contractor-payments` — list, draft, authorise, external payment report/verification, sandbox Checkout, release approval and controlled transfer request.
- Operations may link an existing `acct_...` account to an active contractor as a **pending reference**, not as a verified payee. A **different** operations reviewer must record independent legal-identity evidence, while Stripe v2 recipient transfer and payout capabilities are confirmed active, before the reference can be marked verified. Recipients must complete Stripe-hosted/embedded KYC onboarding. Any replacement account reverts to pending review.
- `/api/webhooks/stripe/connect-platform` and `/connect-recipients` — signed, separately configured webhooks; no arbitrary public caller may change financial status.

### Release gates

1. Run schema, typecheck, worker runtime and browser acceptance tests on the stacked PR.
2. Prove both models in an isolated staging D1 database upgraded to `0028`, with role and cross-client access tests.
3. Confirm client authority, contractor identity, marketplace fee economics, Australian tax and Stripe agreement in writing. The platform is responsible for negative balances and Stripe fees; a low or zero retained fee can produce a loss. Review https://stripe.com/pricing.
4. Obtain Stripe-approved recipient onboarding; verify v2 `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status==='active'` and payout capability before any transfer.
5. Install sandbox API key and three webhook signing secrets through Cloudflare's secrets store; enable events only after signed delivery and idempotency acceptance.
6. Test real sandbox Checkout/PaymentIntent -> approved release -> controlled transfer, failed funds, retry ambiguity, refund, dispute, transfer reversal, payout failure, incorrect recipient and duplicate webhook recovery. No production live-mode release until separately reviewed.
7. Preserve bonds, agency rent and strata trust money outside ordinary Stripe holding balances.

## Existing payment paths

No changes to the subscription and one-off service price catalogue, existing service Checkout, existing entitlement logic or WA bond custody. This is a **new, explicitly approved contractor-specific flow**.