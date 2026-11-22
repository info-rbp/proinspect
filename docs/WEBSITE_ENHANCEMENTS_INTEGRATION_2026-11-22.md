# Website enhancement integration register — 22 November 2026

**Status: DRAFT / NOT RELEASE-ACCEPTED.** Target: `main`. Integration branch: `integration/website-enhancements-20261122`.
No production deployment, feature activation, approved commercial rates, statutory document issuance, paid credit, Stripe settlement or changes to production credentials are authorised by this branch.

## Source pull requests and retained functionality

| Source | Integrated modules | Shared-code reconciliation | Outstanding acceptance |
|---|---|---|---|
| #118 | Client onboarding, inspection booking, customer terms and protected intake | Baseline feature code preserved as ancestor of integration | Financial/legal sign-off, exact-head CI, hosted authentication, Stripe tests |
| #123 | Residential service catalogue, optional unpriced add-ons, Open Home requests, property maintenance and insurance entry | Baseline preserved; new Residential dashboard retains booking categories and property-request links | Add-on terms, 72-hour lead-time/role tests, live pricing kept disabled |
| #121 | Four-step Residential property wizard, private tenancy snapshots, property-centred dashboard, encrypted setup APIs | Wizard and dashboard connected to common owner property flow, shared validation and service APIs reconciled | Exact-head owner/Staff/tenant isolation tests and migration verification |
| #120 | Six-stage Co-Living owner/Staff projects, proposals, reviews, budgets and handover controls | Feature API and owner routes wired to existing shared router | Independent review, statutory/contractual and custody boundaries, hosted role tests |
| #122 | Co-Living public hub, topic routes, calculator, marketing content and CTA | Unified platform public routes, sitemap and marketing support adopted | Pricing and copy approval, responsive/accessibility, human visual sign-off |

Each source PR remains independent and unmerged. This integration branch contains a combined code snapshot; it is not a substitute for exact-head end-to-end verification.

## D1 migration sequence

- `0064_direct_inspection_booking_cash_terms.sql`: existing #118 rate candidates and credit preparation, no published prices.
- `0065_residential_service_intents.sql`: existing #123 service intents/add-on storage.
- `0066_residential_property_profiles.sql`: renamed from #121's conflicting `0064`, not applied to production.
- `0067_co_living_onboarding.sql`: renamed from #120's conflicting `0065`, not applied to production.

Migrations must be applied in this sequence in an **isolated disposable D1** and on a restored staging snapshot before promotion. Never renumber a migration that has already been applied to a deployed database. Rollback/recovery, FK integrity and fresh install checks are required.

## Website Improvement Guide — source-to-change traceability

The guide specifically says **do not change branding or styling**; existing typography, colors, imagery collection, marketing structure and visual identity are retained. Scope is editorial and placement improvements.

- **Page 2, header/footer:** removed redundant `Who We Help` top-level navigation item (the About Us content and anchor remain available). Existing footer legal/account links are preserved.
- **Pages 3–5, Home:** screenshots present the existing desired arrangement; no explicit replacement text or behavioral change is specified. Existing page content, layout, and CTA behavior retained.
- **Page 11, About hero:** retained `Property Support. Designed Around You.`; revised generic introduction; renamed `See What We Offer` to `See Our Residential Services` without changing target; provided a modest additional gap between buttons.
- **Pages 11–12, Our Purpose:** changed the text to plain-language owner-focused content, placed an existing approved brand image beside the copy, preserved the responsibility boundary: ProInspect supports authorised representatives and does not assume statutory property-management decisions.
- **Page 14, Contact:** screenshot is supplied without a specific correction; original secure enquiry processing and branding preserved.
- **Pages 6–10, 13, 15–16:** section headings/screenshots only without implementable change descriptions; **no unstated new requirements have been invented**.

## Acceptance checklist — all required before merging to production-connected main

- [ ] TypeScript, unit, SQL migration and full production builds pass against the **exact integration commit**.
- [ ] D1 `0064–0067` sequence, canonical existing records, FK constraints, fresh install and recovery checks pass.
- [ ] Worker/D1/R2 cross-account tests verify encrypted tenancy info and co-living evidence isolation; no privilege or financial escalation.
- [ ] Residential onboarding wizard -> property -> seven service choices -> booking/add-on/request -> Staff Work Order -> report flow passes.
- [ ] Co-Living owner/Staff multi-stage approvals, financial limits, independent review and tenant handover tests pass.
- [ ] Co-Living marketing routes and calculator test on desktop, 320px mobile and keyboard; no orphan public routes or broken sitemap.
- [ ] Website guide's menu/about changes reviewed visually; no brand drift and existing legal/footer links retained.
- [ ] Approved prices, Form 19 scope, Cash Client credit, GST, privacy, statutory/legal disclosures and Co-Living management statements formally reviewed.
- [ ] Stripe Checkout/webhooks, real provider failure/retry handling and account reconciliations separately accepted before live enablement.
- [ ] Hosted role-based genuine logins, staff, owner, agency and tenant boundaries tested on isolated infrastructure.
- [ ] Independent release approval; only then consider changing status from draft and merging to `main`.

**Important:** A GitHub `mergeable` status or green test run does not itself constitute legal, commercial, security, hosted or production release acceptance.
