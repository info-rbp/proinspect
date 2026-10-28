# Residential subscription promotional microsite

Dedicated Cloudflare Worker for the ProInspect Residential Property Support Subscription. This campaign deliberately does **not** collect identity data or payments. It hands off to the existing ProInspect verified email sign-in and Residential Landlord onboarding at `https://proinspect.systems/signin?returnTo=%2Fonboarding`.

## Pages
- `/` — home
- `/inclusions` — full subscription schedule and search
- `/getting-started` — customer journey
- `/savings` — per-property pricing and illustrative comparison
- `/sign-up` — secure account handoff

## Commercial controls
Price: AUD $30 plus GST per week per property. Customer total if 10% GST applies: AUD $33/week. No invented standalone pricing or savings promises. Four asterisk-marked schedule items have unresolved conditions. The underlying platform's subscription entitlements are automatically provisioned at account creation, and Stripe Billing is sandbox-only; **do not enable live subscription claims/charges** until payment-to-entitlement linkage and legal/business approvals are independently verified.

The preview is noindexed and robots-disallowed. It must remain so until marketing, tax, legal, accessibility, security and hosted-role release approval.

## Deployment
The bundled Worker uses five static HTML files and two local assets. The JavaScript module is the authoritative router; no dynamic storage is required. To deploy a production Worker, bundle the HTML/CSS/JS text from the repository, publish on a dedicated Worker and verify the five routes plus `/api/health`. Never bind the production customer D1, R2 or Stripe secrets to this microsite.

For the in-chat preview, Cloudflare's classic-script API can package the page sources as JS strings and serve the matching paths. A repeatable GitHub Actions deploy pipeline should be configured before public release.
