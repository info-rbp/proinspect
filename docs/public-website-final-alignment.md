# Final public website alignment

Source: operator implementation guide and final decisions register dated 15 November 2026; residential expanded service portfolio; building services detailed brochure. The Medina letter is a private example for application requirements, never a public offer or fixture.

This is workstream A. Existing page templates, section order, navigation, CSS, colours and image bytes are retained. No sign-in/up implementation, production deployment, database migration, entitlement or Stripe change is included. Workstreams B (residential readiness) and C (commercial application) are separate pull requests.

## Approved facts and boundaries

Residential Inspection Only: $20 + GST/property/month. Residential All-Inclusive: $150 + GST/property/month. Commercial All-Inclusive: $150 + GST/property/month, the sole commercial subscription. All have 24 initial months, then month-to-month continuation with 60 days written cancellation notice. Property-specific inclusions, allowances, extra charges and early-exit mechanics must be agreed before contract acceptance; no new checkout is activated. Legal drafts remain noindex and unapproved. Signed historical agreements are unchanged.

Public APIs return descriptive catalogue projections with no one-off rates. Authorised workspace pricing and internal calculation data remain intact. The inactive guest campaign no longer advertises a launch offer through a query parameter alone. Legacy standalone residential campaign source and authenticated billing contracts are separate, inactive products and have not been republished or rewritten.

The confirmed public entity is ProInspect Property Services Pty Ltd, ABN 52 703 550 609, ACN 703 550 609, info@proinspect.systems. No unapproved address, phone, opening hours, insurance, licence, testimonial or performance claim is added.

## Content brief mapping

| Brief | Existing location / implementation |
| --- | --- |
| G1 | Home: three pillars, seven existing sector cards, approved plans, existing process and CTA |
| R1 | Residential: fourteen service groups within four existing service blocks; two plans and authority boundaries |
| R2 | Existing inspection detail pages: distinct PCR/routine/follow-up/vacant/inventory/pre-leasing/final purposes; existing catalogue identities retained |
| R3 | Residential property support and agency audience: individual, subscription and tailored engagement |
| R4 | Residential tailored work in sector, custom appointment and contact proposal route |
| C1 | Commercial: inspections, operations, leasing support, building work, sole subscription |
| C2 | Commercial service blocks and existing owner/asset-manager audience pages |
| C3 | Commercial custom scope in existing blocks and contact route |
| S1 | Strata: all eight building service groups within four existing service blocks |
| S2 | Building operations and existing building-management-attendance detail |
| S3 | Tailored building scope, frequency, extras and specialist boundaries |
| CL1 | Co-Living and Student Living offered for tailored enquiry |
| CL2 | Existing shared-living management block: operations, privacy, authority |
| CL3 | Existing resident onboarding and turnover blocks |
| CN1 | Construction offered for tailored project support |
| CN2 | Existing project setup, coordination, progress and handover blocks |
| A1 | About: purpose, three pillars, audiences, coverage and corporate facts |
| A2 | Who We Help: existing audience routes plus shared living, students, construction and tenants |
| A3 | Existing sector and tenant FAQs; no duplicate FAQ route |
| L1 | Existing leasing catalogue, live approved listings, postcode search, separate browse/view/apply steps |
| L2 | Existing residential list; approved property data only |
| L3 | Existing commercial list; truthful empty state, no invented listing |
| L4 | Existing property details, representative, photos, sessions and gated application action |
| L5 | Existing open-home registration, interest, confirmation/cancellation and notices retained |
| L6 | Existing open-home check-in retained; not an application |
| L7 | Existing private residential flow completed in B; distinct commercial flow in C |
| L8 | Tenants: inspections/evidence, ordinary requests, pets/modifications/keys, maintenance and urgent routing |
| G2 | Maintenance: assessment, coordination, safe minor work, preventative care, completion and specialist limits |
| G3 | Existing service catalogue and all 23 detail pages; private pricing and quote CTAs, coverage and extras |
| G4 | Existing how-it-works and engagement routes; single service, subscription and tailored operations |
| G5 | Contact: company/email/coverage, detailed enquiry categories and suburb/postcode; existing signed encrypted delivery and anti-bot controls |

Old sector URLs remain routable and use current descriptions with canonical links to the corresponding main sector page. No redirects or route removals are introduced.

## Location reference verification

The operator supplied the companion ProInspect_Perth_Peel_Service_Areas_Reference.json. All 589 unique suburb/postcode pairs match the CSV after case normalisation: 443 standard_reference and 146 manual_review entries. The lookup preserves every supplied exception reason and normalises case, spaces and punctuation only in suburb names; postcode remains an exact four-character string. A standard reference match still requires service, access and appointment confirmation; other WA locations remain by request. The dataset is a reference, not an automatic live service allowlist.

## Review and release

Run pnpm check, integration tests and browser acceptance. Existing shared staging only; the three task branches are explicitly allowlisted without enabling any operational feature. CI captures exact source and desktop/mobile screenshots. Compare CSS/image hashes and existing layouts with main. No production bindings, database or active Worker is changed. Do not merge or publish until the operator reviews the work.
