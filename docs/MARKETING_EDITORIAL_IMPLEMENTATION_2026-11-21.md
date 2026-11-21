# ProInspect — Residential Marketing Website: Page-by-Page Implementation Specification

**Repository:** `info-rbp/proinspect`  
**Development branch:** `feature/marketing-residential-content-ux-20261121`  
**Draft pull request:** https://github.com/info-rbp/proinspect/pull/117  
**Source commentary:** `ProInspect Website Improvements.docx` (23 pages)  
**Controlling strategy:** Residential-only new acquisition; existing authorised Commercial/Strata data remains available through sign-in.

## 1. Project objective

Bring the public website’s information architecture, marketing language and conversion experience up to the level of the ProInspect application and the November Residential strategy. Keep the existing design language and approved photography. Replace old generic operational labels with plain-language customer needs, service examples and clear next actions.

The marketing website is a **public discovery and conversion layer**. The authenticated platform controls identities, properties, appointments, work orders, document permission, reporting and payments. Website copy must never imply that visiting a page grants authority or that signing up activates a paid contract.

## 2. Page map and navigation

```text
Home /
├── Residential /residential
│   ├── Residential Services /residential/services
│   │   ├── Property Inspections /residential/services/property-inspections
│   │   ├── Open Homes /residential/services/open-homes
│   │   ├── Leasing Support /residential/services/leasing-support
│   │   ├── Maintenance Management /residential/services/maintenance-management
│   │   ├── Access Control /residential/services/access-control
│   │   ├── Exit Inspections /residential/services/exit-inspections
│   │   ├── Bond Administration /residential/services/bond-administration
│   │   └── Everything Else /residential/services/other-property-support
│   └── Residential Subscriptions /residential/subscriptions [noindex, pending approval]
├── Co-Living /co-living
├── Leasing /leasing (Properties Available)
├── Tenants /tenants
├── Maintenance /maintenance
├── About Us /about
│   └── Who We Help /about#who-we-help
├── Contact /contact
├── Help Centre /help-centre
├── Example Reports /example-reports
├── Individual Services /services and /services/:slug
└── Sign Up / Sign In /client [authenticated entry]
```

**Header:** Residential · Co-Living · Leasing · Tenants · Maintenance · About Us · Who We Help (anchors into About) · Contact; visually separated **Sign Up / Sign In** account action.

**Footer:** retain ProInspect logo; update descriptor; use a concise set of links to Contact, Help Centre, Residential Services and account entry. Keep seven legal/policy links under a compact legal navigation.

**Footer descriptor, approved editorial text for branch review:**  
“Providing Innovative Property Inspection and Outsourcing Solutions to Private Landlords and Property Managers across Western Australia.”

**Service coverage qualifier:** Standard scheduling is for approved Perth and Peel suburbs. Other Western Australian destinations are considered by arrangement. The broad footer positioning does not promise statewide availability of every service.

## 3. Homepage (/) — exact proposed and implemented text

### Hero

- Eyebrow: ProInspect Property Services · Western Australia
- H1 (forced two lines): **Your Property.** / **Our Practical Support.**
- Description: “Whether you need one Routine Inspection or everyday support for several rental properties, ProInspect helps with the practical work and keeps your property records connected.”
- CTA 1: **See What We Offer** → `/#property-services`
- CTA 2: **Get Started Today** → `/client`
- Image: retain existing Residential artwork, existing brand styling and split layout.

### Property support

- H2: **The right support for your Residential property.**
- Lead: “From a one-bedroom apartment to a portfolio of rental homes or shared accommodation, choose practical services that fit your property.”
- Residential card: “From advertising and incoming condition reports to routine inspections, maintenance and vacate support, find help across the life of your rental.” CTA: **Explore Our Residential Solutions** → `/residential`.
- Co-Living card: “Keep rooms, shared spaces and resident turnovers organised through tailored inspections, maintenance coordination and agreed property support.” CTA: **Explore Our Co-Living Solutions** → `/co-living`.
- Secondary discovery: **Explore all Residential service areas** → `/residential/services`; **find a service** → `/service-finder`.
- Commercial, Strata, Student Living and Construction cards are not reintroduced.

### Separate feature sections

- **Properties Available** — “Find your next place with ProInspect Property Services. Browse available homes, see advertised open-home times and follow the application option chosen by the responsible landlord or agent.” CTA: **See What's Available** → `/leasing`. Image left, copy right.
- **Maintenance Support** — “From a minor maintenance concern to a larger project requiring approved specialist contractors, ProInspect can help document the issue, coordinate the next steps and keep the outcome in view.” CTA: **See Our Maintenance Solutions** → `/maintenance`. Copy left, image right.

### Approach

- Eyebrow: **More than another site visit**.
- H2: **Practical Work. / Innovative Solutions. / Focused on You.**
- Lead: “We do more than attend and leave. Our team combines property inspections, agreed administration and practical follow-up with a connected platform for bookings, work records and authorised reports.”
- Supporting statement: “Less time chasing updates. More visibility over what has happened and what needs attention.”
- CTA: **Discover the ProInspect Approach** → `/about`.
- Visual: labelled synthetic report illustration; no claim it is a genuine issued customer report.

### Subscription

Display one Residential All Inclusive card, not a carousel for a single product. Price **AUD $50 + GST per property per week** (AUD $55 including GST); proposed initial 24-month term and 60 days' written cancellation notice. Keep material disclosures about scope, inclusions and extras. The primary CTA is **See Our Subscription Offers** → `/residential/subscriptions`.

### Three-step explanation

Heading **Design With You In Mind.**; three illustrated steps **Tell us what you need**, **Agree the details**, **Keep a useful record**. Retain the existing common design pattern while adding approved photography. Remove the duplicative lower “Looking for Your Next Home” section.

### Final action

Heading **Let’s make property work easier.**  
Copy: “No long calls or waiting for an email reply to create an account. Sign up for free, add your authorised property and explore the services available to you.”  
Only CTA: **Sign Up Today** → `/client`.

## 4. Residential landing (/residential)

- H1: **Innovative Support for Every Stage of Your Rental**
- Hero description: “Whether you need one inspection or practical support throughout a tenancy, ProInspect helps you manage the work and keep the right records together.”
- CTAs: **See Our Services** → `/residential/services`; **See Our Subscription Options** → `/residential/subscriptions`.
- Built around your property: **Less Coordination. / Better Records. / More Time For You.** — retain existing Residential image.
- Introduce **Services Designed to Support You** with eight category cards linking to dedicated service-area pages. Remove the previous four dense operational groups as primary navigation.
- Explain ProInspect’s connected bookings, work orders and reviewed/issued reports without making blanket compliance claims.
- CTA: **View Example Inspection Reports** → `/example-reports`; synthetic sample only until genuine approved examples exist.
- Customer outcomes: before lease, during tenancy, tenancy end and follow-up; genuine service obligations follow agreements.
- Keep a single subscription presentation linked to details rather than duplicating generic process blocks.
- FAQ topics: individual vs subscribed service, coverage, tenant communications, booking; link to `/help-centre`.
- Closing CTA: **Sign Up Today** → `/client`. No redundant contact-only button.

## 5. Residential Services index (/residential/services)

- H1: **Services Designed to Support You**
- Lead: “From a Property Condition Report to everyday property support, find help for one rental or a wider portfolio. Choose a service or discuss a tailored scope.”
- Eight image-led customer categories (see below). Cross-link to subscriptions and the authenticated entry.
- CTA placement: service-card name and action go to the corresponding category page.
- Safety: category pages describe support but do not create an unapproved price, allowance or automatic appointment.

## 6. Eight Residential service-area pages

All eight use a consistent responsive hero and category-specific introduction, featured full-width alternating media/content blocks, supporting service tiles, links to the rest of the Residential directory and a Help Centre handoff.


### /residential/services/property-inspections — Property Inspections

**H1:** Property Inspections

**Hero text:** From your first Property Condition Report to routine visits and exit inspections, get a clearer picture of what is happening at your rental.

**Featured offerings:**

- **Property Condition Report (PCR):** An incoming photographic record of visible property condition for the beginning of a tenancy. CTA → `/services/property-condition-report`.
- **Routine Inspections:** Document visible condition, maintenance concerns and follow-up during a tenancy, with lawful access. CTA → `/services/routine-inspection`.
- **Final / Exit Inspection:** Record outgoing property condition and compare available incoming records. CTA → `/services/final-exit-inspection`.

**Additional offerings:**

- **Pre-Vacate Inspection:** Identify visible cleaning, maintenance and rectification items ahead of a final inspection. CTA → `/services/pre-vacate-inspection`.
- **Follow-Up Inspection:** Revisit issues previously identified and document their current condition. CTA → `/services/follow-up-reinspection`.

**Commercial/authority boundary:** a detailed service link is available only when it matches the canonical current Residential service catalogue. Enquiry-only offerings require a separately agreed scope. Relevant landlord, tenant, agency, specialist and statutory decisions remain with the properly authorised person.

### /residential/services/open-homes — Open Homes

**H1:** Open Homes

**Hero text:** Help prospective renters inspect a published home. We facilitate agreed inspection sessions on behalf of the responsible landlord or leasing representative.

**Featured offerings:**

- **Scheduled Open Homes:** Arrange approved inspection dates, lawful access and ProInspect attendance with the responsible leasing representative. CTA → `/contact?topic=open-homes`.
- **Register for an Open Home:** Visitors can register for a published inspection. Registration does not submit a rental application. CTA → `/leasing`.

**Additional offerings:**

- **Visitor Check-in:** Support session check-in and keep attendance information restricted to authorised people. CTA → `/leasing`.
- **Private Property Viewings:** Discuss separately instructed viewings, scheduling and follow-up. CTA → `/contact?topic=private-viewings`.

**Commercial/authority boundary:** a detailed service link is available only when it matches the canonical current Residential service catalogue. Enquiry-only offerings require a separately agreed scope. Relevant landlord, tenant, agency, specialist and statutory decisions remain with the properly authorised person.

### /residential/services/leasing-support — Leasing Support

**H1:** Leasing Support

**Hero text:** From advertising to handover, coordinate practical leasing tasks while the landlord or appointed agency retains approval and tenancy decisions.

**Featured offerings:**

- **Residential Tenancy Agreements:** Coordinate authorised tenancy documentation, subject to review and the prescribed form requirements. CTA → `/contact?topic=tenancy-agreements`.
- **Rental Applications:** Follow the agency's nominated application link or another approved pathway. ProInspect does not decide who is accepted. CTA → `/leasing`.

**Additional offerings:**

- **Property Advertising and Viewings:** Prepare approved listings and coordinate advertised inspections with authorised instructions. CTA → `/leasing`.
- **Tenancy Commencement Support:** Discuss condition records, keys and handovers for a new tenancy. CTA → `/residential/services/access-control`.

**Commercial/authority boundary:** a detailed service link is available only when it matches the canonical current Residential service catalogue. Enquiry-only offerings require a separately agreed scope. Relevant landlord, tenant, agency, specialist and statutory decisions remain with the properly authorised person.

### /residential/services/maintenance-management — Maintenance Management

**H1:** Maintenance Management

**Hero text:** From a small maintenance concern to larger approved contractor works, keep requests, decisions and follow-up connected to the property.

**Featured offerings:**

- **Maintenance Requests and Contractor Works:** Record reported issues, obtain quotations and arrange approved contractor attendance. Trade costs require separate approval. CTA → `/maintenance`.
- **Maintenance Attendance:** Arrange an inspection of a reported issue and get factual observations for the next decision. CTA → `/services/maintenance-attendance`.

**Additional offerings:**

- **Preventative Care and Monitoring:** Plan condition checks and identify matters needing maintenance follow-up. CTA → `/maintenance`.
- **Completed Works Inspections:** Record visible completion and outstanding issues; specialist certification remains with qualified providers. CTA → `/services/completed-works-inspection`.
- **Insurance and Incident Support:** Document visible damage and coordinate separately approved specialist follow-up. CTA → `/contact?topic=incidents`.

**Commercial/authority boundary:** a detailed service link is available only when it matches the canonical current Residential service catalogue. Enquiry-only offerings require a separately agreed scope. Relevant landlord, tenant, agency, specialist and statutory decisions remain with the properly authorised person.

### /residential/services/access-control — Access Control

**H1:** Access Control

**Hero text:** Keys, authorised property attendance, contractor entry and handovers need clear instructions and reliable records.

**Featured offerings:**

- **Key, Fob and Remote Handovers:** Arrange authorised access-device collection, delivery and custody records. CTA → `/services/key-handover-collection`.
- **Contractor Access Attendance:** Attend a property for an authorised contractor's access and document the visit. CTA → `/services/contractor-access-attendance`.

**Additional offerings:**

- **Property Meetings:** Meet an owner, property manager or contractor at the property as instructed. CTA → `/services/property-meeting`.
- **Move-In and Move-Out Access:** Discuss keys, access, handovers and agreed attendance on occupancy changes. CTA → `/contact?topic=access`.

**Commercial/authority boundary:** a detailed service link is available only when it matches the canonical current Residential service catalogue. Enquiry-only offerings require a separately agreed scope. Relevant landlord, tenant, agency, specialist and statutory decisions remain with the properly authorised person.

### /residential/services/exit-inspections — Exit Inspections

**H1:** Exit Inspections

**Hero text:** Prepare for vacate, record outgoing condition and maintain clear supporting evidence for the authorised parties.

**Featured offerings:**

- **Pre-Vacate Inspection:** Note apparent cleaning, repairs and follow-up before the tenancy ends. CTA → `/services/pre-vacate-inspection`.
- **Final / Exit Inspection:** Document outgoing condition alongside available incoming records. CTA → `/services/final-exit-inspection`.

**Additional offerings:**

- **Follow-Up Inspection:** Return to identified issues where a further factual record is commissioned. CTA → `/services/follow-up-reinspection`.
- **Vacate Coordination:** Discuss key return, site attendance and handover tasks. CTA → `/contact?topic=vacate`.

**Commercial/authority boundary:** a detailed service link is available only when it matches the canonical current Residential service catalogue. Enquiry-only offerings require a separately agreed scope. Relevant landlord, tenant, agency, specialist and statutory decisions remain with the properly authorised person.

### /residential/services/bond-administration — Bond Administration

**H1:** Bond Administration

**Hero text:** Keep bond-related records and outgoing condition evidence organised, without treating ProInspect as the holder of bond money or decision-maker.

**Featured offerings:**

- **Bond Documentation:** Discuss instructed administrative support with prescribed documents and reviewed records. CTA → `/contact?topic=bond`.
- **Exit Condition Evidence:** Arrange the outgoing condition record required for the authorised tenancy process. CTA → `/services/final-exit-inspection`.

**Additional offerings:**

- **Disputes and Differences:** Organise factual documents; any claim or dispute remains with the responsible parties and lawful process. CTA → `/contact?topic=bond-disputes`.

**Commercial/authority boundary:** a detailed service link is available only when it matches the canonical current Residential service catalogue. Enquiry-only offerings require a separately agreed scope. Relevant landlord, tenant, agency, specialist and statutory decisions remain with the properly authorised person.

### /residential/services/other-property-support — Everything Else

**H1:** Everything Else

**Hero text:** Not every property requirement fits an ordinary inspection. Tell us what you need and we can assess a tailored scope.

**Featured offerings:**

- **Property Meetings:** Arrange authorised attendance with an owner, agency or nominated contractor. CTA → `/services/property-meeting`.
- **Custom Property Support:** Describe the property, task and desired outcome for a tailored response. CTA → `/contact`.

**Additional offerings:**

- **Ongoing Residential Support:** Explore an optional residential subscription for agreed inspections and operations. CTA → `/residential/subscriptions`.
- **Browse Individual Services:** See the existing catalogue for other supported property tasks. CTA → `/services`.

**Commercial/authority boundary:** a detailed service link is available only when it matches the canonical current Residential service catalogue. Enquiry-only offerings require a separately agreed scope. Relevant landlord, tenant, agency, specialist and statutory decisions remain with the properly authorised person.

## 7. Other main public pages — exact replacement direction

| Page | Hero title and primary framing | Destination and content treatment |
|---|---|---|
| **Co-Living** `/co-living` | “Shared living, supported from room to common space.” | Room inspection, shared areas, resident communication and turnover. Student accommodation is included as an audience within Co-Living, not an independently marketed new-acquisition sector. This is separately scoped and quoted. |
| **Maintenance** `/maintenance` | “Property care that follows the issue through.” | Address Residential owners, professional agencies and Co-Living operators. Explain issue → quote approval → contractor/access coordination → visible completion. No blanket renovation or specialist-certification claims. |
| **Properties Available** `/leasing` | **Find Your Next Place.** | “See what is available, when inspections are advertised and how to apply through the process selected by the responsible landlord or leasing agent.” Existing dynamic property listings and inspection flows remain intact. |
| **Tenants** `/tenants` | “A little more clarity, wherever you are in your rental journey.” | Preserve three separate stages: property discovery, inspection registration and rental applications; then tenant maintenance/inspection information. Tenant portal access requires verified invitation/relationship. Add Help Centre handoff and clearer account CTA. |
| **About Us** `/about` | **Property Support. Designed Around You.** | Replace obsolete sector sales language. Explain purpose, business responsibilities, ProInspect platform, service value, four audiences and Co-Living scope. Who We Help is anchored at `#who-we-help`. |
| **Who We Help** `/who-we-help` | “Practical support for your property and your role.” | Legacy compatibility page retained for existing links but marked noindex, with substantive audience information consolidated into About Us. |
| **Contact** `/contact` | “Let’s talk about your property.” | “Need an inspection, maintenance support or help with a Residential property? Tell us what you need and we will confirm the appropriate next step.” Preserve secure form. Scoped category CTA links prefill the message from a whitelist. |
| **Client entry** `/client` | **One secure account. The right workspace for you.** | Four sign-in guidance areas: Residential landlords, Residential property managers, Tenants/Co-Living residents, existing Commercial/Strata clients. New customer sign-up only where allowed; historic sector users retain sign-in, not new acquisition. |
| **Help Centre** `/help-centre` | **Practical answers for your property.** | Browse booking/services, coverage, accounts/subscriptions, reporting/renting and property records. Do not promise instant appointments for request-only services. |
| **Example Reports** `/example-reports` | **A clearer view of your property.** | An illustrative report, prominently labelled synthetic and not a statutory document. Genuine, rights-cleared customer material can replace it only after approval. |
| **Residential Subscriptions** `/residential/subscriptions` | **One subscription. Ongoing property support.** | One optional Residential weekly subscription, material commercial disclosures and separate plan acceptance. Noindex until published offer and legal conditions are approved. |
| **Individual Services** `/services`, `/services/:slug` | Canonical existing catalogue | Keep distinct published service definitions, eligibility, scope and pricing controls. New customer-facing categories provide discovery, not duplicate booking SKUs. |
| **Services / resources / engagement pages** | Existing indexed guides and catalogue | Preserve existing routes and service explanations; direct Residential discovery through the new eight categories and avoid retired acquisition links. |
| **Legal and policies** | Existing policies | Keep links and review-draft/noindex controls. Legal approval is outside the scope of a copy or design update. |

## 8. Copy and architecture constraints

1. **Residential-only acquisition.** No new Commercial, Strata or Construction marketing pages, new signup paths or sellable plans. Student Living is part of the Co-Living offer. Existing authorised historic access remains.
2. **Free signup vs subscription.** No text can imply creating an account starts a paid plan. Residential All Inclusive is an optional separate agreement.
3. **Pricing.** Use the new weekly AUD $50 + GST per property model, not obsolete per-room or monthly charges. Maintain 24-month initial term, 60-day notice and agreed-scope conditions.
4. **Property-management boundaries.** ProInspect facilitates agreed site work and authorised administration; it does not automatically become the landlord, leasing agent, regulated property manager, bond holder or applicant decision-maker.
5. **Genuine service links.** Maintain the approved canonical service catalogue and its booking/quotation constraints. New headings are editorial groupings, not additional confirmed products.
6. **Reports.** Distinguish an illustrative screenshot from an actual issued PDF or an official WA statutory template. Report-creation and PDF parity remain subject to separate verification.
7. **Legal/publication gates.** Preserve noindex rules for unapproved legal/commercial content; review and approve the real contracts and privacy notices before public activation.
8. **Permissions.** No site copy, menu or service-directory change may alter role authorization, document recipients or booking access.
9. **Imagery.** Reuse existing brand artwork. Replace with genuine photography or redacted reports only when rights and approval are documented.
10. **Accessibility.** Test at 320, 390, 800 and 1440 pixels; no horizontal overflow, meaningful headings and alt text, keyboard navigation and sufficient focus visibility.

## 9. Traceability to the supplied 23-page commentary

| Document section | Treatment |
|---|---|
| Menu Header | Student Living remains absent from primary navigation; rename Contact Us → Contact and position with Who We Help |
| Menu Footer | Keep logo, use requested WA-focused descriptor, remove three bulky link menus and retain seven policy links |
| Home page: first element | Preserve approved hero styling; force deliberate line break, simplify subtitle and update the two CTAs |
| Home page: property support | Keep Residential and Co-Living, remove retired sector cards, separate Properties Available and Maintenance |
| Home page: approach | Replace confusing three-part operational list with platform/report visual and clearer positioning |
| Home page: subscription | One Residential offering; clearer CTA; do not create an auto-rotating one-card carousel |
| Home page: process | Better three-step copy and appropriate branded illustrations |
| Home page: duplicate renting and closing CTA | Remove redundant rental section; simplify sign-up action |
| Residential hero/intro | New heading, shorter body, service and subscription destinations, enhanced split section |
| Residential Support | Replace four generic groups with eight customer-facing categories and individual pages |
| Residential approach | Explain connected proprietary workflows and report visibility; use synthetic example pending real approval |
| Residential FAQ and last CTA | Four customer-oriented answers, Help Centre link, direct free signup |
| Commercial, Strata, Construction | Superseded by Residential-only acquisition restriction; not rebuilt |
| Co-Living, Leasing, Tenants, Maintenance | Active-page editorial and role clarity updates |
| About and Who We Help | Full audience content embedded in About; old audience URL remains for compatibility |
| Legal pages | Keep approved-control boundaries, do not fabricate legal sign-off |
| Client sign-in/onboarding | Adapt four legacy role choices to active Residential/agency/invited tenants/historical sector use |

## 10. Verification and acceptance

**Engineering / automated:** TypeScript, marketing build, unified platform build, domain and SQL tests, Worker/integration checks, route SSR and 320/390/800/1440 responsive browser tests. Test all eight categories, dynamic links, signup, help, sample reports, absence of retired acquisition links and noindex for unapproved subscription information.

**Editorial:** Review every replacement heading and paragraph against this document. Verify that the homepage contains exactly two property-sector cards and that Properties Available and Maintenance are separate alternating features.

**Commercial and legal:** Approve exact service scopes, subscription conditions, contract language, privacy collection notices and rights-cleared imagery before release. Draft legal pages and illustrative records cannot be represented as final.

**Operations:** Test actual customer journeys independently on hosted environments, including real account sign-in, booking, report issuance and authorised access, without using production customer data for fixtures.

**Release:** This branch and PR #117 are intentionally separate from `main`. Passing CI verifies tested code, not independent owner approval. Production remains unchanged unless a separately authorised merge and deployment take place.

## 11. Implementation file map

| Change | Main source |
|---|---|
| Homepage | `apps/marketing/app/routes/home.tsx` |
| Residential landing | `apps/marketing/app/components/residential-landing.tsx` and `apps/marketing/app/routes/service-overview.tsx` |
| Service category data | `packages/marketing/residential-categories.ts` |
| Residential index and category pages | `apps/marketing/app/routes/residential-services.tsx` and `residential-service-category.tsx` |
| Help, reports and subscriptions | `apps/marketing/app/routes/help-centre.tsx`, `example-reports.tsx`, `residential-subscriptions.tsx` |
| Shared navigation/footer | `packages/marketing/public-navigation.ts`, `apps/marketing/app/components/site-chrome.tsx` |
| About/Who We Help, Co-Living/Maintenance, contact, tenants and leasing | `apps/marketing/app/routes/` and `packages/marketing/sector-overviews.ts` |
| Account entry | `apps/platform/app/routes/client-entry.tsx` |
| Styling | `packages/ui/marketing-editorial-20261121.css` |
| Dual routes, sitemap and indexing | `apps/marketing/app/routes.ts`, `apps/platform/app/routes.ts`, `apps/platform/app/lib/public-routes.ts`, `apps/marketing/app/routes/sitemap.ts` |
| Test coverage | `tests/residential-marketing-20261121.test.ts` and `tests/browser/marketing-editorial-20261121.spec.ts` |

