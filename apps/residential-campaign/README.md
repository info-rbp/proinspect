# Residential subscription promotional microsite

Dedicated Cloudflare Worker for the ProInspect Residential Property Support Subscription. This campaign deliberately does **not** collect identity data or payments. It hands off to the existing ProInspect verified email sign-in and Residential Landlord onboarding at `https://proinspect.systems/signin?returnTo=%2Fonboarding`.

## Pages
- `/` — home
- `/inclusions` — full subscription schedule and search
- `/getting-started` — customer journey
- `/savings` — per-property pricing and illustrative comparison
- `/sign-up` — secure account handoff

## Commercial controls
Price: AUD $50 plus GST per week per property. Customer total if 10% GST applies: AUD $55/week. No invented standalone pricing or savings promises. Four asterisk-marked schedule items have unresolved conditions. The underlying platform's subscription entitlements are automatically provisioned at account creation, and Stripe Billing is sandbox-only; **do not enable live subscription claims/charges** until payment-to-entitlement linkage and legal/business approvals are independently verified.

The preview is noindexed and robots-disallowed. It must remain so until marketing, tax, legal, accessibility, security and hosted-role release approval.

## Deployment
The Worker uses five static HTML files and two local assets. Run `node apps/residential-campaign/build.mjs` to bundle them as `dist/worker.mjs`, then `cd apps/residential-campaign && npx wrangler deploy --dry-run` before a reviewed deployment. A new GitHub Actions deployment workflow is required before production use. Never attach production customer D1, R2 or Stripe secrets.

For the in-chat preview, Cloudflare's classic-script API can package the page sources as JS strings and serve the matching paths. A repeatable GitHub Actions deploy pipeline should be configured before public release.

## Live subscription policy and release gates
- Stripe live Product `prod_VWXmN5UFyCZhrC`; Price `price_1UVUgqEynzcud8MVLxm1mGRn` (AUD $50 weekly, tax-exclusive through verified account default). No live customer subscriptions created.
- Scheduled weekly invoices: Friday 09:00 Australia/Perth; Checkout uses a future anchor with `proration_behavior=none`, and a stored payment method. No included service access before the initial verified `invoice.paid`.
- Cancellation at paid period end, no automatic partial-week refund except mandatory rights/approved exceptions. Smart Retries must be reviewed in the live Dashboard. Configurable renewal grace defaults to 72 hours pending business approval.
- **Blocking tax classification:** current live Product code `txcd_10203001` is Downloadable Software; accountant must approve and install an appropriate service classification before release. A single live non-customer Tax Calculation returned AUD $5 GST, `standard_rated`, on AUD $50, but this does not authorise the current classification.
- Approved live billing webhook must be registered after signed endpoint rollout. Use a separate restricted live Stripe key in Cloudflare secrets; never check credentials into GitHub.
- Existing live Customer Portal configuration `bpc_1UVo5XEynzcud8MVDJ4cYZ7p` was created for this service; quantity editing disabled, cancellation at period end enabled.
