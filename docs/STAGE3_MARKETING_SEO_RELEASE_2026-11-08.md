# Stage 3 — Marketing website, editorial content and technical SEO release
**Date:** 8 November 2026, Perth (AWST)  
**Source:** `feature/stage3-marketing-seo-20261108` -> existing Cloudflare `proinspect-platform` when reviewed and merged  
**Release:** Feature implementation committed; awaiting exact-head CI/browser review, editorial/commercial approval, legal publication approvals, media rights and final production checks.

## 1. Delivered in source
| Area | Engineering outcome | Publication boundary |
| --- | --- | --- |
| Home | Direct service discovery, free registration CTA and service finder | Verify site positioning and coverage |
| Services | All 23 real service identities receive distinct customer-centred purpose, likely audience, preparation, exclusions, FAQ and detail page | Service-scope review against signed service schedule |
| Service Finder | Accessible sector/need selector; recommends existing canonical service pages without collecting information | Validate task-to-service mappings with operations |
| Who we help | Overview and six distinct pages for private landlords, agencies, commercial owners, asset managers, strata managers and building operators | Confirm sector/authority claims |
| Residential support | Explicit free account vs one-off vs proposed paid plan; $50 ex-GST per property/week *proposed* | NO subscription activation; `noindex` until exact terms accepted |
| Leasing | Clear role split; registrations vs expressions of interest vs responsible representative's nominated application destination | No independent new listing/right-to-use publication approval |
| Navigation | Desktop and mobile audience links, service discovery, leasing, contact; privacy/service footer | Keyboard/assistive technology and compact viewport review |
| SEO | Canonicals, one page title/description, OpenGraph/Twitter, `en-AU`, structured WebPage/Service/BreadcrumbList, eligible sitemap | Verify after production release through Search Console / rich-result testing |
| Media and samples | Existing approved-media registry stays the only source of approved public photography; illustrative report remains clearly labelled | Genuine rights-cleared photos or redacted reports not yet supplied |
| Legal | Unapproved terms and privacy remain `noindex` and visibly labelled drafts | Formal operator/legal approval and versioned publication required |

## 2. Editorial principles
Use plain Australian English and explain customer outcomes before technical features. Give each service a distinct use case, scope boundary and next step. Do not imply an observed condition is a legal decision, a building certification, a trade repair or an entitlement to make a statutory determination.

Do not publish promises about completion times, coverage suburbs, rates, inspection allowances, agent representation, case-study results, staff credentials, customer reviews or report formats unless verified and approved. One-off requests are not appointments until accepted. ProInspect may conduct open inspections **on behalf of** the instructing agent, manager or landlord but is not their leasing agent or property manager.

## 3. Search intent and internal-link strategy
| Search intent | Canonical destination | Supporting links |
| --- | --- | --- |
| Property inspections WA | `/`, `/services` | Six service categories |
| Residential routine inspection | `/services/routine-inspection` | PCR comparison guide, Landlord and Agency audiences |
| Property Condition Report WA | `/services/property-condition-report` | Incoming condition and final exit service |
| Property handover/exit | `/services/pre-vacate-inspection`, `/services/final-exit-inspection` | Residential audience pages |
| Commercial make-good inspection | `/services/commercial-pre-vacate-make-good-inspection`, `/services/commercial-final-make-good-inspection` | Commercial owners/asset managers |
| Common property inspection WA | `/services/common-property-inspection` | Strata managers and building operators |
| Completed works / contractor access | Respective single canonical service page | Guided finder, audience pages |
| Strata & building attendance | `/sectors/strata-building` | Relevant services |
| Find service by customer need | `/service-finder` | Direct service links |
| Private landlord, agency, asset, strata search | `/who-we-help/:audience` | Sector overview and services |
| Residential support subscription | `/residential-property-support` | Draft/not indexed until approved; do not link directly to live charge |

Avoid duplicate suburb pages, mass-generated near-identical articles and keyword stuffing. Do not assert service availability in a named suburb without operations evidence. Create local landing pages only for genuinely covered areas with first-hand distinct material.

## 4. Release and QA gates
1. Build and typecheck both marketing and unified platform apps on the exact PR head.
2. Run `pnpm test`, `pnpm test:integration`, `pnpm test:schema`, `pnpm test:browser` and the repository's deploy dry-runs (GitHub CI or local/ephemeral checks, not a new deployed staging service).
3. Verify 23 unique service pages, 6 audience pages, `/service-finder`, `/who-we-help`, `/residential-property-support` and all retained leasing/contact routes at mobile 320/390 and desktop.
4. Validate active links and signed one-off/registration handoffs, including the difference between a service request and confirmed booking; do not create live customer charges or false appointments as tests.
5. Inspect SSR source for a single canonical/title/description, truthful structured JSON-LD, discoverable heading hierarchy and noindex on unapproved paths. Verify sitemap contains only approved indexable canonical URLs.
6. Complete manual keyboard, zoom and assistive-technology review. Automated Playwright checks and screenshots do not establish independent WCAG 2.2 AA certification.
7. Obtain business owner sign-off on scope, price, region, claims and leasing disclaimer; legal owner sign-off on operative publication terms.
8. Verify that image/report proof uses rights-cleared, consent-appropriate approved media. If no assets are approved, retain explicitly labelled illustrations; do not fabricate authentic-looking examples.
9. Merge only the reviewed marketing-only PR. Read back Worker source SHA and canonical hostname before submitting the sitemap to Google Search Console.

## 5. Organic search post-release measurements
- Google Search Console: verify the canonical property, submit `https://proinspect.systems/sitemap.xml`, inspect representative service and audience pages, monitor indexing exclusions and individual search queries.
- Google Rich Results Test: validate breadcrumb data, consistent page metadata and supported schema. Structured data is not a guarantee of a rich result.
- Real user Core Web Vitals (75th percentile): target LCP <= 2.5s, INP <= 200ms and CLS <= 0.1. Distinguish lab and field results; remediate slow hero assets before publishing heavy photos.
- Conversion: measure consent-compliant `service detail -> enquire/book`, `finder -> detail`, `audience -> contact`, and `homepage -> sign-in`. Use aggregate event counters; do not embed sensitive tenancy or property-access details in analytics.
- Monthly editorial review: genuine customer questions, SEO query mismatch, service availability accuracy and approved media performance.

## 6. Pending external decisions — not converted to software claims
- Business-approved subscription price (including actual GST configuration), inclusions, eligibility, grandfathering, start, cancellation, weekly billing and fair usage.
- Official approved public legal/collection notices. Current documents are substantive review drafts and must not be treated as legal approvals.
- Public use rights and property/person consent for original images, case studies, actual inspection report samples and testimonials.
- Service-area coverage mapping, booking prices, turnaround and operational capacity.
- Search Console verification and first-party analytics consent/governance, if not already configured.

**Verification references:** [Google Search Central SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [React Router meta descriptors and JSON-LD](https://reactrouter.com/how-to/meta), [Google Breadcrumb structured data](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb), [web.dev Core Web Vitals](https://web.dev/articles/vitals).

This register tracks engineering versus evidence. Do not mark the Stage 3 feature independently accepted merely because GitHub CI is green.
