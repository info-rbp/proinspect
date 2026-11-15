# Public website refresh

The public website retains ProInspect’s deep teal, warm gold and neutral palette. The logo is the Home link; Tenants has its own navigation entry. The homepage introduces seven service areas with local image assets and short, descriptive copy.

Residential, Commercial, Strata, Co-Living, Construction and Maintenance pages now explain the audience, work, practical benefits, process and common questions. Co-Living and Construction continue to identify full management as planned. Their content does not activate a module, grant access or change service availability.

About Us, Who We Help and Contact Us provide clearer service positioning and next steps. The contact form keeps its existing validation, consent, anti-bot verification, signed receiver, encryption and retry protections. Authentication pages are outside this change.

## Leasing

`/leasing` renders the existing published-property catalogue. Existing `/properties-for-lease` URLs, property pages, open-home registration/check-in and rental application routes remain available. Listing media is fetched from the existing property photo endpoints.

On 15 November 2026 the public production catalogue contained two published Cloverdale listings: Units 6 and 16 at 273 Fulham Street. Both records reported application mode `unavailable` and rental approval `pending`. This change preserves those values. Application options continue to follow the existing recipient verification, approval, listing settings and release controls; a design change does not override them.

The catalogue remains excluded from indexing, consistent with existing leasing publication controls. Public service pages and Tenants have canonical URLs and sitemap entries. Legal drafts, pricing proposals, private records and application journeys retain their existing indexing restrictions.

## Image provenance

The seven files under `apps/marketing/app/components/images/` were generated for this refresh on 15 November 2026. They depict generic architectural scenery using a consistent palette and composition. They are not customer photographs, staff portraits, evidence of completed work or photographs of the advertised rental properties. They are used only for brand and service-page presentation.

Visible Illustration captions have been removed at the owner’s request. Descriptive alternative text remains. The existing approval registry for real customer/property marketing media has not been populated with invented approvals.

## Release boundaries

No migration, production database mutation, authentication change, billing change or activation of a planned service is included. The existing staging Worker is the preview target; its isolated database, buckets, queue, local email provider and disabled commercial features remain validated by the staging deployment helper.

The named public-site branch is added to the existing staging preview allowlist. No production deployment command, production binding, repository protection or required check is removed. Main builds continue to upload an inactive version through the existing Cloudflare configuration.
