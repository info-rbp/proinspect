# Residential subscription promotional microsite

Dedicated Cloudflare Worker for the ProInspect Residential Property Support Subscription. This campaign deliberately does **not** collect identity data or payments. It hands off to the existing ProInspect verified email sign-in and Residential Landlord onboarding at `https://proinspect.systems/signin?returnTo=%2Fonboarding`.

## Pages
- `/` — home
- `/inclusions` — expanded 48-service Residential Subscription catalogue with custom inline SVG house and category illustrations, four benefits, a tenancy lifecycle, searchable service cards, price transparency, FAQs and explicit included/conditional-scope boundaries.
- `/getting-started` — customer journey
- `/savings` — transparent two-year traditional agency vs ProInspect cost comparison (including GST), adjustable agency fees, 12/24/36/48-month tenancy, portfolio size, service-scope matrix and self-management costs
- `/sign-up` — secure account handoff

## Commercial controls
Price: AUD $50 plus GST per week per property. Customer total if 10% GST applies: AUD $55/week. No invented standalone pricing or savings promises. Four asterisk-marked schedule items have unresolved conditions. The underlying platform's subscription entitlements are automatically provisioned at account creation, and Stripe Billing is sandbox-only; **do not enable live subscription claims/charges** until payment-to-entitlement linkage and legal/business approvals are independently verified.

The preview is noindexed and robots-disallowed. It must remain so until marketing, tax, legal, accessibility, security and hosted-role release approval.

## Deployment
The Worker uses five static HTML files and four local assets (shared CSS and navigation JS plus the separately tested, browser-importable savings model/controller). Run `node apps/residential-campaign/build.mjs` to bundle them as `dist/worker.mjs`, then `cd apps/residential-campaign && npx wrangler deploy --dry-run` before a reviewed deployment. A new GitHub Actions deployment workflow is required before production use. Never attach production customer D1, R2 or Stripe secrets.

For the in-chat preview, Cloudflare's classic-script API can package the page sources as JS strings and serve the matching paths. A repeatable GitHub Actions deploy pipeline should be configured before public release.

## Live subscription policy and release gates
- Stripe live Product `prod_VWXmN5UFyCZhrC`; Price `price_1UVUgqEynzcud8MVLxm1mGRn` (AUD $50 weekly, tax-exclusive through verified account default). No live customer subscriptions created.
- Scheduled weekly invoices: Friday 09:00 Australia/Perth; Checkout uses a future anchor with `proration_behavior=none`, and a stored payment method. No included service access before the initial verified `invoice.paid`.
- Cancellation at paid period end, no automatic partial-week refund except mandatory rights/approved exceptions. Smart Retries must be reviewed in the live Dashboard. Configurable renewal grace defaults to 72 hours pending business approval.
- **Blocking tax classification:** current live Product code `txcd_10203001` is Downloadable Software; accountant must approve and install an appropriate service classification before release. A single live non-customer Tax Calculation returned AUD $5 GST, `standard_rated`, on AUD $50, but this does not authorise the current classification.
- Approved live billing webhook must be registered after signed endpoint rollout. Use a separate restricted live Stripe key in Cloudflare secrets; never check credentials into GitHub.
- Existing live Customer Portal configuration `bpc_1UVo5XEynzcud8MVDJ4cYZ7p` was created for this service; quantity editing disabled, cancellation at period end enabled.

## Residential agency comparison and defensible marketing claims
- Source: user-supplied **Perth Property Management Costs — Adjusted for Average Tenancy Length** (Oct 2026), not audited agency transaction data.
- Starting scenario: 24-month tenancy, 104 weeks, one property at $750/week unchanged rent. Agency management 9% **excluding GST**; 2-week letting, $400 ex GST advertising, $200 ex GST entry PCR, 3 × $100 ex GST routine visits/year, one $250 ex GST renewal, $200 ex GST exit, $75 ex GST annual financial statements. All agency service fees grossed up 10% GST; monthly admin defaults to $0. Calculated agency total $11,352 including GST. ProInspect $55 × 104 = $5,720 incl GST; $5,632 / 49.6% is an **illustrative difference in modelled service-fee spending, not a proven like-for-like saving**.
- 24 months is a **modelling benchmark**, not a verified current average WA tenancy length. $750 weekly Perth median house rent was supported by REIWA September 2026 (https://reiwa.com.au/the-wa-market/perth-metro/). WA Consumer Protection confirms a maximum of four routine inspections a year: https://www.consumerprotection.wa.gov.au/choosing-property-manager.
- ProInspect does **not** automatically replace complete property management, rent collection, tenant selection, financial statements or regulated activities. Landlords must account for their time and any uncovered services. The alternative arrangement can either replace agency fees (self-managed) or retain them (subscription becomes an additional expense); a user-entered amount can be added for uncovered activities. Agency fee checkboxes prevent double-counting where fees are already included/waived.
- No guaranteed savings claims; the figures are examples for informational marketing and cannot substitute for reading the actual agency authority and approved ProInspect scope/terms. GST income-tax deductibility, repairs, vacancy, mortgage, strata, insurance and statutory costs are not modelled.
- Module: `apps/residential-campaign/assets/savings-model.mjs` contains the pure integer-cent calculation tested via `tests/residential-agency-savings.test.ts`. The controller `savings-calculator.js` progressively enhances the HTML; no customer data is transmitted.

## Inclusions page — scope and content safety (October 2026)
- Maintains **48 previously listed named services** across 6 groups, in the same groups as the original microsite. **Four starred services** remain explicitly conditional: Prospective Tenant Reference Checks, Key Safe Installation, Urgent Maintenance / Make Good Works, and Insurance Claims Management and Facilitation. Neither the marketing description nor the weekly price changes those conditions.
- Expands every listed item with an operational explanation and a customer benefit without promising unlimited attendance, free third-party invoices, statutory outcomes, legal services, rent collection or a full-service agency replacement. Statements are marketing descriptions to be checked against the final approved Residential Subscription agreement, authorisation and applicable law.
- Adds no external graphics CDN or remote trackers. Inline SVG house and simple icon symbols share ProInspect's existing colour tokens; all information remains in semantic HTML without JavaScript. Search is progressively enhanced by the existing local `site.js`, with live result counts and clear controls.
- Price remains AUD **$50 plus GST weekly per residential property**; the page illustrates **$55 including 10% GST**. Live billing and access remain governed by independently approved controls; the microsite does not collect credentials, property information or payments.
- Source control checks in `tests/residential-campaign.test.ts` assert all six categories, 48 items, four asterisked conditions, graphics and noindex. Browser tests in `tests/browser/residential-inclusions.spec.ts` exercise service filtering, the mobile layout and layout overflow. Reconcile copy with legally approved WA form references before public indexing.
