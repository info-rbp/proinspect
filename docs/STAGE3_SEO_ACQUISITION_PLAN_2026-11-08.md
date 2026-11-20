# ProInspect — SEO and organic customer-acquisition operating plan
**Version:** 1, 8 November 2026, Australia/Perth  
**Status:** Actionable strategy and implemented on-page foundations. Not a claim of existing rankings, demand volumes, genuine business-profile eligibility or conversion baseline.  
**Canonical website:** https://proinspect.systems (unified platform and marketing site).

## Executive objective and guardrails
Acquire qualified property service enquiries and authorised new-account registrations in Western Australia. Prioritise high-intent inspection/attendance search queries and content that helps the right customer understand the service boundary. Convert into genuine service requests or account journeys without creating unapproved subscriptions, statutory claims, false appointment confirmations, misleading local-location claims or privacy-intrusive tracking.

**Do not buy or fabricate backlinks, keyword-stuff title tags, buy reviews, make up suburb pages, publish fake report photos or optimise customer-restricted portal routes for search.** Index only truthful public marketing information. This is a commercial discovery site, not a public rental-applicant or restricted-document index.

## 1. Keyword-to-page map and target intent
These are *keyword hypotheses*, not verified traffic/ranking volumes. Start with real impressions, customer language, qualified enquiry logs and Search Console query data. A page targets one primary customer need and a small set of natural secondary phrases without exact-match repetition.

| Priority | Primary demand theme / wording to assess | Search intent | Existing canonical page | Primary conversion |
| --- | --- | --- | --- | --- |
| P0 | property inspection services Perth / property inspections WA | commercial | `/` or `/services` | Service browse -> finder -> enquiry |
| P0 | rental property routine inspection Perth / WA | transactional | `/services/routine-inspection` | Book/service enquiry |
| P0 | property condition report Perth / incoming PCR WA | transactional | `/services/property-condition-report` | Book or request |
| P0 | final inspection rental property Perth / exit inspection | transactional | `/services/final-exit-inspection` | Book or request |
| P0 | pre-vacate rental property inspection | transactional | `/services/pre-vacate-inspection` | Book or request |
| P0 | commercial property inspection Perth | transactional | `/services/commercial-property-inspection` | Quote or booking |
| P0 | commercial make good inspection / handover inspection | transactional | `/services/commercial-pre-vacate-make-good-inspection` + `commercial-final-make-good-inspection` | Service request |
| P0 | strata common property inspection Perth | transactional | `/services/common-property-inspection` | Service request |
| P1 | outsourced rental inspections for property managers | B2B commercial | `/who-we-help/property-management-agencies` | Portfolio enquiry |
| P1 | inspection services for private landlord Perth | B2C commercial | `/who-we-help/private-landlords` | Account/sign-in / service |
| P1 | commercial property owners inspection support | commercial | `/who-we-help/commercial-property-owners` | Request scope |
| P1 | building inspection reporting for asset managers | B2B commercial | `/who-we-help/commercial-asset-managers` | Portfolio enquiry |
| P1 | strata manager contractor attendance / inspections | B2B commercial | `/who-we-help/strata-managers` | Portfolio enquiry |
| P1 | building management attendance Perth | B2B commercial | `/services/building-management-attendance` and `/who-we-help/building-operators` | Service/portfolio enquiry |
| P1 | contractor access service property Perth | transactional | `/services/contractor-access-attendance` | Booking/request |
| P1 | completed works inspection Perth | transactional | `/services/completed-works-inspection` | Booking/request |
| P1 | property maintenance attendance Perth | transactional | `/services/maintenance-attendance` | Booking/request |
| P1 | strata defect rectification inspection | transactional | `/services/defect-rectification-inspection` | Service request |
| P2 | damage incident strata inspection | issue-led | `/services/damage-incident-inspection` | Scoped request |
| P2 | key handover / fob collection property | issue-led | `/services/key-handover-collection` | Scoped request |
| P2 | property handover attendance / move-in support | issue-led | `/services/building-handover-attendance`, `/services/move-in-move-out-attendance` | Scoped request |
| P2 | routine inspection versus PCR | informational -> service | `/resources/routine-inspection-vs-pcr` | Cross-link to both |
| P2 | what is a commercial make-good inspection | informational -> service | Existing commercial service pages; new distinct guide after approval | Scope request |
| Hold | residential property support subscription 50 dollars a week | commercial research | `/residential-property-support` | **NOINDEX pending legal/commercial approval** |
| Hold | suburb + service keyword and 'near me' variations | local | Existing service + verified service-area information | Only create geo content after actual coverage evidence |
| Hold | listings and application applicant queries | property-specific personal data | `/properties-for-lease/*` | Keep non-indexed until dedicated listing/privacy acceptance |

**Cannibalisation rule:** Do not create a second page for the same service intent merely to insert 'Perth' or 'Western Australia'; use the existing 23 canonical service pages. Write sector-specific copy when scope, audience, operations and reporting genuinely differ. Keep titles helpful and natural; there is no exact-match keyword quota.

## 2. Implemented technical foundations — verify in production after merge
| Component | Implementation | Acceptance check |
| --- | --- | --- |
| Canonical origin | `apps/marketing/app/lib/seo.ts` | SSR has exactly one absolute canonical on the correct primary host |
| Unique title and meta description | Per-route `seo()` plus service-specific `SERVICE_EDITORIAL` | Distinct, accurate title/description across all 23 services |
| Social metadata | Open Graph and Twitter card/description | Share inspection does not promise unavailable media or pricing |
| JSON-LD | WebPage or CollectionPage, Service, BreadcrumbList, Organization provider | Valid JSON; breadcrumb URLs resolve; no unverifiable review/price/address |
| Audience pages | Six unique segments at `/who-we-help/:audience` | Strong contextual intro, true service links and enquiry CTA |
| Guided discovery | `/service-finder` | Accessible selection -> relevant services -> booking/request |
| Crawl control | `shouldIndexPublicPage`, `robots.txt`, sitemap | Production domain allowed; preview disallowed; private/legal/draft offer non-indexed |
| XML sitemap | Canonical static public marketing URLs only | HTTP 200 XML; no unapproved legal/subscription/listing/customer records |
| Internal links | Home -> category/service/audience/finder -> booking/contact | No dead ends or keyword-stuffed anchor text |
| Mobile/accessibility | Responsive CSS, native controls, keyboard-tested mobile menu | Real device/assistive technology review still needed |
| Performance | Existing Worker SSR; no unnecessary extra data fetch for sitemap | Verify field Core Web Vitals and response/cache headers after publication |

**Technical blockers:** Do not enable robots index flags on draft legal/offer pages until explicit approval; do not add WebSite SearchAction unless actual site search is implemented; do not invent FAQ rich results, star ratings, aggregate scores or testimonials. Breadcrumb and service markup may help machines understand the site but do not guarantee result enhancements.

## 3. Editorial content calendar: 12 weeks
Execution owner can be marketing/operations with subject-matter review. These items extend the existing website only with accurate, substantive editorial, not automatically generated near-duplicate content.

| Period | Deliverable | Search intent and link path | Evidence needed |
| --- | --- | --- | --- |
| Weeks 1–2 | Finish QA, canonical host/index readiness, sitemap, all 23 service pages, 6 audience journeys; Search Console ownership and first baseline | High-intent transactional | Signed service scope and actual live reachability |
| Weeks 3–4 | Revise existing 'Routine inspection vs PCR' guide to answer practical WA questions and distinguish tenancy obligations | Informational to PCR/routine | Operations and WA legal source check |
| Weeks 3–4 | Publish 'What happens at a final rental inspection?' when reviewed | Pre-vacate/exit information | Legal review of liability/bond language |
| Weeks 5–6 | Publish 'Preparing a commercial property for handover and make-good observations' | Commercial make-good | Operations + lease boundary review |
| Weeks 5–6 | Add examples of report structures using synthetic, clearly labelled data; glossary of observations vs certifications | Evaluation/consideration | Approved reporting engine output; no customer data |
| Weeks 7–8 | Publish 'How strata managers can scope a common-property inspection' | Strata common property | Strata/operational approval |
| Weeks 7–8 | Build 'Contractor access vs contractor supervision' comparison | Transactional support | Safety/authority scope review |
| Weeks 9–10 | Add 'When to arrange a completed-works follow-up visit' guide | Post-maintenance inspection | Operational scope approval |
| Weeks 9–10 | Review six audience FAQs from real customer questions and accepted published service terms | Role + commercial | De-identified validated enquiries |
| Weeks 11–12 | Consolidate underperforming/duplicate guides; refine internal links and CTAs; performance and usability review | Ranking and conversion improvements | Search Console/click data; no guessed rank or traffic |
| Every month | Update inaccurate fee/coverage/service claims and recheck indexation and 404/redirect errors | Trust/accuracy | Release approval log |

Never use generic geography appendages as a substitute for useful local experience. Content should explain: *why this visit is needed, what it observes, what it deliberately does not do, what the client must prepare, what record results and what action follows.*

## 4. Local search and reputation plan (conditional on genuine eligibility)
1. **Eligibility first.** Verify that the actual business is eligible for a Google Business Profile (in-person customer interaction as defined by Google), and use its real legal/trading identity, categories, customer contact methods and authorised premises/service-area rules. Do not fabricate a Perth shopfront, rental office, opening hours or additional locations.
2. If a service-area business without a customer-facing office, use the provider's supported address-hiding and actual staffed service-area settings. A listing cannot be created merely because a website serves Western Australia.
3. Publish a truthful service area overview with only confirmed suburbs/regions and service restrictions. Do not represent every WA postcode as immediately bookable without scheduling coverage.
4. Maintain matching genuine business identity/contact details between the marketing website, Google Business Profile and legitimate industry directories. Do not create multiple duplicate business profiles or fictional local pages.
5. Collect reviews only from actual completed, authorised customers without gating, compensation, fabricated reviewer identities or selective review-solicitation tactics. Reply without revealing tenant, landlord or property information.
6. Where practical and approved, add actual operational photographs or examples with rights and consent; never present synthetic art or generic stock photos as completed ProInspect work.
7. Evaluate local performance via Search Console queries that genuinely include locations, legitimate Google Business Profile performance reports and qualified enquiries; do not measure only map impressions.

## 5. SEO and conversion measurement
No actual baseline numbers are verified. Establish these before setting targets. Use privacy-approved analytics only; no personally identifying URL/query values, private report IDs, property addresses, tenant/applicant fields or unconsented tracking.

### Event and outcome definitions
| Event name / metric | Trigger | Value for the business | Privacy boundary |
| --- | --- | --- | --- |
| `marketing_page_view` | Public non-private route viewed (only with lawful analytics basis) | Landing page engagement | Route template / group only; no person or full query parameters |
| `service_finder_complete` | Visitor chooses a sector and need and sees recommendations | Discovery usage | Aggregate sector and task category, not identity |
| `service_detail_open` | Visitor navigates to canonical service page | Commercial consideration | Service code only |
| `service_booking_start` | Visitor follows `/book/:serviceId` CTA | Booking intent | Service code, source page group; never session data |
| `public_enquiry_submit_success` | Server issues a valid enquiry receipt, not a button click | Qualified lead entry | Aggregate service/sector, non-identifying event count |
| `account_registration_complete` | Verified authorised account created, not a sign-in click | Account conversion | Aggregate customer sector and source where consent/governance allow |
| `authorised_booking_confirmed` | Actual app booking accepted under authorised scope | Bookings generated | Aggregate service/sector only |
| `qualified_lead` | Operations marks request qualified (not simply received) | Sales-quality demand | Aggregate source and service, with permissioned CRM records private |
| `won_opportunity` | Accepted paid one-off service or signed agreement | Revenue attribution | Restricted financial data stays in the proper app; only anonymised aggregate |
| `new_paid_subscription` | Stripe-substantiated actual paid plan after explicit opt-in | Paid recurring acquisition | **Do not measure inferred charges or count free signup as paid** |

Only instrument after `AN-01` privacy/product approval, a first-party event schema, consent/legal basis, retention decision and tests for data leakage. Prefer server-side aggregate receipts for actual outcomes over third-party browser trackers that might collect property/customer data.

### Funnel definitions
- **Organic impression -> visit:** Search Console impressions/clicks/CTR and query mix by true landing page. No invented traffic.
- **Visit -> service engagement:** Unique sessions viewing service detail or completing finder ÷ eligible public landing sessions, after lawful measurement.
- **Service detail -> intent:** Visitor opening actual booking/quote/enquiry workflow ÷ eligible service page sessions.
- **Intent -> confirmed booking:** Accepted bookings divided by initiated flows, segmented by priced one-off vs authorised subscription; never count unaccepted requests as confirmed.
- **Lead -> qualified:** Enquiries formally qualified ÷ valid enquiries received.
- **Qualified -> accepted work:** Accepted Work Orders or commercial agreements ÷ qualified enquiries.
- **Account -> paid:** Actual settled first subscription invoices ÷ eligible voluntarily opted-in new accounts (only after plan approval).
- **Value and cost:** Accepted jobs, margin per service, staff utilisation and organic cost per qualified lead — aggregated from authorised commercial records.

### Initial operating thresholds
These are *proposed operational targets*, **not factual ProInspect results**. Review after collecting 30 days of reliable baseline and adjusting for sample size.

- Search crawl: 0 unintended indexable draft/legal/private paths, 0 incorrect canonical targets, 100% of deliberately indexable public marketing routes reachable as HTTP 200.
- Metadata: 100% of 23 services and 6 audience pages have a usable unique title, H1, clear description and appropriate CTA.
- Field Core Web Vitals at the 75th percentile: **LCP <= 2.5s, INP <= 200ms, CLS <= 0.1**; monitor actual mobile sample coverage rather than claiming a pass from a fast developer machine.
- UX and safety: 0 private customer/property information leaks in search-visible metadata; 0 booking/request link destinations bypassing authorisation.
- Qualified lead metrics: Record baseline conversion and growth *after* valid source tracking exists. Never use an arbitrary '50% improvement' claim without evidence.
- Weekly monitoring: URL inspection failures, coverage/canonical exclusion changes, form failures, page-level click-through, high-intent enquiries and completed bookings.

## 6. Owners, workflow and change management
| Responsibility | Primary owner | Data / review |
| --- | --- | --- |
| Technical SEO, canonical, robots, sitemap and structured data | ProInspect engineering | CI, verified production SSR, crawl reports |
| Service and suburb eligibility | Operations lead | Accepted scheduling region/capacity and exact catalogue |
| Public copy, audience/guide updates | Marketing/editorial owner | Exact draft, claim substantiation and internal linking |
| Privacy notice, analytics/legal publication | Legal/privacy owner | Signed current provider audit, approval and retention |
| Residential subscription price and contract | Commercial/finance/legal owners | Accountant tax review, approved schedule and Stripe proof |
| Media licence and report-example consent | Media/property rights owner | Rights ledger, actual consent, de-identification |
| Performance and enquiries | Product/operations owner | Aggregate privacy-safe operational outcomes |

### Reporting cadence
**Weekly:** Track indexed/excluded new pages and any critical indexing errors, top impressions and URLs, booking/contact failures and high-intent qualified enquiries.

**Monthly:** Compare pre/post query pages, organic click-quality mix, conversion by sector, service finder effectiveness, device CWV and site-change effect. Keep monthly changelog of site releases and business promotions to avoid false attribution.

**Quarterly:** Reprioritise service topics based on qualified work and coverage, prune/rewrite truly weak pages, approve new genuine local proof and renew policies. Review site taxonomy if actual service catalogue changes.

## 7. Search property and implementation checklist
- Verify `https://proinspect.systems` (and only legitimately owned host variants) in Google Search Console using authorised business ownership. Do not claim the site is already verified.
- Submit `https://proinspect.systems/sitemap.xml` after production merge and smoke test. Keep all draft/secret routes excluded; sitemap inclusion does **not** override noindex.
- Inspect representative `/services/property-condition-report`, `/services/commercial-property-inspection`, `/services/common-property-inspection`, `/who-we-help/private-landlords`, `/service-finder` for canonical URL, reachable status, rendered content and permitted indexing.
- Review Google Search Console page indexing and Core Web Vitals reports; resolve canonical duplication, redirect loops, 4xx links and mobile usability.
- Check direct traffic segmentation and the distinct outcomes of one-off booking, enquiry and account registration; verify existing Stripe flags remain unaltered.
- Audit DNS and correct domain canonicalisation; avoid redirecting a working authenticated route onto public marketing pages.
- Verify social sharing cards with actual HTML; do not create og:image until approved rights-cleared media exists.

## 8. Current execution status and future gates
**Implemented in Stage 3 branch:** 23 unique service leads/FAQs, six segment pages, a finder, service booking guidance, consistent canonical/OG/Twitter/JSON-LD metadata, sitemap filtering and tests.

**Not executed by this plan itself:** Google Search Console ownership or sitemap submission, live keyword-volume research, live local profile changes, analytics script addition, event instrumentation, real photo publication, commercial acceptance, legal approval or paid subscription activation. Those actions require actual account/ownership permissions, substantiated business facts, privacy/consent decisions and valid production checks.

### Reference sources
- [Google Search Central: SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Google: Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google: Canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google: Sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)
- [Google: Breadcrumb structured data](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [Google Business Profile eligibility and representation](https://support.google.com/business/answer/3038177)
- [Web.dev: Core Web Vitals](https://web.dev/articles/vitals)
- [Google Search Console](https://search.google.com/search-console/about)

**No ranking, search demand, conversion, service availability or Business Profile eligibility claims have been fabricated.**
