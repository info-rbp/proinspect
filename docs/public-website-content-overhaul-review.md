# Public website content overhaul — implementation and release register

Branch: `feature/public-site-content-overhaul-2026-11-15`  
Review PR: #104  
Target: marketing website at `proinspect.systems`  
Scope: public marketing, sector, service, audience, guide, informational and navigation content. Authenticated Sign Up/Sign In, billing, guest bookings, leasing workflows, production bindings and database are intentionally unchanged.

## Implementation map

| Audit requirement | Implemented source | Status |
| --- | --- | --- |
| Homepage three-plan comparison and engagement routes | `apps/marketing/app/routes/home.tsx`, `components/plan-comparison.tsx` | Implemented as indicative focus, not guaranteed entitlements |
| Residential/Commercial/Strata sector outcomes, deliverables, onboarding | `packages/marketing/sector-programmes.ts`, `routes/service-overview.tsx` | Implemented |
| Co-Living, Construction and Maintenance delivery programmes | Same shared source and sector pages | Implemented |
| Distinct Student Living offering | `packages/marketing/sector-overviews.ts`, `routes.ts`, navigation, sitemap | Implemented |
| Expanded customer-specific audience content | `packages/marketing/audiences.ts`, `routes/audience.tsx`, `routes/who-we-help.tsx` | Implemented; four new audiences |
| One-off, Inspection Only, All-Inclusive and outsourced mobilisation guidance | `packages/marketing/content.ts` | Implemented |
| Distinguish individual service catalogue vs ongoing services | `routes/services.tsx`, `routes/content.tsx` | Implemented |
| Concrete use cases and context-driven recommendations for all 23 detailed services | `packages/marketing/related-services.ts`, `routes/service.tsx` | Implemented |
| Expand six educational resource articles | `packages/marketing/content.ts` | Implemented |
| Why ProInspect, Client Experience, How It Works and Areas We Service | `routes/information.tsx` | Implemented |
| About page explains business operating model | `routes/about.tsx` | Implemented |
| Service Finder covers shared living, student accommodation, construction and ongoing programmes | `routes/service-finder.tsx` | Implemented |
| Duplicate sector route consolidation | `routes/sector-redirect.tsx`, `routes.ts`, `routes/sitemap.ts` | 301 canonical redirects |
| Responsive plan layout | `packages/ui/marketing-public-refresh.css` | Implemented |
| Preserve current public leasing and tenant application workflows | No leasing data or applicant workflow changes | Deliberately retained |
| New content regression tests | `tests/public-site-content-overhaul.test.ts` | Added; CI execution still required |
| Public legal documents | Existing `packages/marketing/legal-drafts.ts` and approval lock | **Awaiting approval**; no legal publication/activation |

## Confirmed commercial facts retained

- Residential Inspection Only: $20 + GST per property/month.
- Residential All-Inclusive: $150 + GST per property/month.
- Commercial All-Inclusive: $150 + GST per property/month; sole commercial subscription.
- Each plan has a 24-month initial term; thereafter month-to-month with 60 days' written cancellation notice.
- Individual PAYG prices remain available only to authorised signed-in clients.
- Standard scheduled service coverage uses approved Perth and Peel suburb/postcode pairs; other Western Australian locations are by request.

## Required decisions before publication / enabling checkout

1. **Approved inclusion matrices:** Exact inspections, schedules, visit counts, tenant administration and contractor coordination items for each plan; every exclusion and billable overage.
2. **Early termination:** The operator's confirmed principle is payment of remaining initial-term obligations after voluntary cancellation, but the binding formula, timing, exceptions, statutory rights and fairness review require approval. This belongs in the pre-acceptance legal disclosures, not a misleading marketing headline.
3. **Additional charges:** Weekend, after-hours, public holiday, urgent booking, failed access, travel, specialist trades, materials and cancellations need approved amounts and applicable rules; the legal drafts' illustrative amounts are **not** current published fees.
4. **Privacy and legal:** Approve each of seven legal documents separately with effective dates, controller/operator identity, provider disclosures, record retention, statutory and consumer protections. Their current review drafts remain noindex and not operative.
5. **Regulated work:** Confirm approved WA licence, appointment and subcontractor arrangements before promises about leasing/management, prescribed notices, certification and technical services.
6. **Service standards:** Agree staffed hours, ordinary response standards, report delivery and on-site capacity before publishing quantified promises.
7. **Supporting evidence:** Publish only verified testimonials, sample reports, project photos and approved case studies.
8. **Leasing:** The previously deferred listing information, prices, application activation and open-home session content remain outside this PR.

## QA and deployment gates

- Run `pnpm check`, including TypeScript, node tests, schema tests and build.
- Run `pnpm test:integration` and marketing desktop/mobile responsive and keyboard checks, particularly expanded navigation and new Student Living route.
- Verify the 301 legacy sector redirects, sitemap canonical pages, metadata/noindex and all contact/service links in a staging deployment.
- Verify no changes to service pricing API, entitlement logic, checkout, guest booking, leasing state, database schema, legal approval flags or production bindings.
- Obtain commercial and legal approval to publish operative documents before release; review and manually approve the final PR; do not merge to production automatically.

This PR delivers the substantive public marketing content possible with the operator-confirmed facts. It does not treat unresolved legal or commercial terms as approved.
