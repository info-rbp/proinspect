> Implementation update, 21 November 2026: the owner confirmed **AUD $50 + GST/week/property**, **24-month initial term**, **60 days written cancellation notice**, and **no per-room subscription**. Commercial/Strata customer servicing is not a work package without evidence of an actual need; authorised historical records remain protected. These decisions supersede unresolved-term and legacy-service inventory wording below. The original approved plan is retained for traceability. See [actual implementation status](RESIDENTIAL_PIVOT_IMPLEMENTATION_STATUS_2026-11-21.md) and [browser acceptance checklist](RESIDENTIAL_PIVOT_BROWSER_ACCEPTANCE_2026-11-21.md). Unchecked gates are not completed by this implementation.

# ProInspect Residential-only pivot — controlled implementation and release plan

**Prepared:** 21 November 2026 (Australia/Perth)
**Repository:** `info-rbp/proinspect`
**Verified baseline:** `main` at `fdb7ef5c3d313397d9bf5cd6b35ce04f89765acf` (PR #89 merged 20 Nov).
**Status:** Product pivot plan only. No app code, production D1/R2 data, Stripe products, runtime flags, Cloudflare deployments or Google Cloud resources changed by this document.
**Preservation:** `archive/commercial-strata-pre-pivot-20261121`, copied from the exact baseline and supplied with reactivation documentation.
**Source inputs:** Residential Portal Build; Operations Portal Build; Portal Engineering Build; Onboarding Workflow; Co-Living All-in-One End-to-End Framework; revised Schedule of Fees; 21 Nov Application Completion Guide; Google Cloud and Stripe Integration Guide; Improvement and Expansion Blueprint; Commercial/Strata/Building companion specs. This pivot supersedes contradictory marketing and plan proposals; it does not silently amend executed customer agreements.

## 0. Approved direction vs items still requiring signed input

**Owner-directed strategy, 21 Nov:**
- Offer Residential only; retain marketing top-level `Residential`, `Co-Living`, `Leasing`, `Tenants`, `Maintenance`, `About Us`, `Who We Help`, `Sign Up / Sign In`, `Contact Us`, in this order.
- Remove `Commercial`, `Strata`, `Student Living`, `Construction` as independent sectors and menu options. Student/shared accommodation stays under Residential Co-Living.
- One new standard Residential plan: `All Inclusive Subscription` at AUD 50 + GST per **property per week** (AUD 55 inc 10% GST, where applicable). Remove new-sales Residential Inspection Only AUD 20/month and All-Inclusive AUD 150/month offers. Do not transpose the old monthly billing interval or misapply a draft 24-month commitment.
- Continue one-off PAYG services, free sign-up, role-appropriate Landlord/Property Manager/Tenant access, Residential leasing, Co-Living site-specific engagement, maintenance, Staff operations and reporting.
- Cloudflare-first, demonstrate functionality/hosted acceptance prior to any Google Cloud operational cutover.
- Preserve Commercial/Strata work and its build specifications on a distinct archive branch for future optional reactivation.

**Commercial/legal decisions not supplied by pivot instruction (block charging/publication until approved):**
1. Whether the 16 Nov initial 24-month term / 60-day notice persists with the new weekly plan; whether existing grandfathered/signed contracts convert only by explicit consent; precise cancellation/refunds/grace.
2. Signed per-property plan inclusion matrix and frequencies, service volume/fair use, geographic coverage, exclusions, trades/materials, statutory/form delivery, after-hours services, pricing of optional extras; the revised fee document contains many `Included` and `Additional charge` classifications but is marked at AUD 150/month.
3. Definition of "property" vs separately leased room in a shared house. Owner instruction says **per property**, overriding proposed `per property or separately leased room` pricing until agreement clarifies room handling. Do not create $50/week subscription for every room by default.
4. Co-Living contract/pricing: uploaded framework proposes a **separately quoted all-in-one operating agreement**, indicative target 25% + GST of agreed actual gross collected receipts and site-specific minimum; NOT automatically $50/property/week. Licensed management/rent workflows need separate authorisation.
5. Who is payer for agency properties, consolidated weekly invoices, renewal dates, tax invoice detail, credit treatment and exact Stripe live-mode product ID / price IDs.
6. Truthful service/coverage claims, reviewed statutory forms, prescribed legal notices, privacy/terms and published approvals. Do not enable direct rent collection, bonds/trust custody, statutory service or specialist providers merely because a plan is called all inclusive.

## 1. Target product architecture

Public website (single canonical `proinspect.systems`, one unified production Worker):
- `/` Home: Residential proposition; property operations, service finder and valid service CTAs; explicitly state free account ≠ paid plan.
- `/residential`: for private self-managing owner and approved residential agencies, property support, inspection/reporting, maintenance, subscription and one-off service choice.
- `/co-living`: shared houses, room records, student accommodation as a subsection only; site feasibility → mobilisation → accommodation operations; explain separately scoped agreement and authorisation.
- `/leasing` and `/properties-for-lease`: **residential only** listings, open homes, attendance, applications, existing approved agency destination, tenant handovers and next-day attendance reports.
- `/tenants`: invited resident access, tenancy support, requests, PCR responses, authorised tenancy documents and contact routing.
- `/maintenance`: residential issue reporting, maintenance assessment, approved contractor handoff, work/order reporting and separate specialist/trade cost distinctions.
- `/about`, `/who-we-help`, `/contact`, `/client`: residential-only copy and explicit consent/correct signup; no disabled-sector promotion.

Authenticated operating environment:
- Residential Owner (workspace kind `landlord`): own authorised properties; property-centred home; bookings, tenancy, reports, owner approvals and individual plan status.
- Residential Property Manager (`property-manager`): verified professional organisation, approved delegated portfolio, owner authority and organisation billing; no implied authority from self-selection.
- Tenant (`tenant`): invitation/verified tenancy scope; own requests, PCR responses, document grants and statutory safeguards, with no owner finance or unauthorised tenant records.
- Staff (`staff`): triage, schedule, inspect, independent QC, approved issue, maintenance coordination, finance exceptions, provider readiness and recovery.
- Co-Living is a Residential configuration and operating engagement, not a new security role, distinct account silo or automatic $50/week plan. Special room confidentiality preserved.

Lifecycle: public service selection → verified free account / registered one-off → authorised residential property → accepted quote or approved paid-through property entitlement → Booking + Work Order → Staff assignment + evidence → independent QC + issued report → correct client/resident notification + invoice/financial status. Retain canonical record IDs and restricted grants.

## 2. Retirement matrix (marketing, user access, server and data)

| Family / capability | Target | Public/UX | API/finance/security | Historical data |
|---|---|---|---|---|
| Commercial public sector, plans, service pages and commercial properties-for-lease | Retire new sales | Remove nav/home tiles, internal links, sitemap, structured metadata and CTA; old URLs send truthful 301 to relevant Residential/Services only if semantically valid, otherwise 410 | Reject new commercial registration, listing, application, checkout, service/booking initiation, invitation/occupancy and provider dispatch under a server-side rollout gate | Retain audit, approved issuance, invoices and controlled legacy case read/export where required |
| Commercial `commercial` and `commercial-occupant` workspaces | Legacy support only, then dormant | Hide from new account choice and workspaces menu except verified existing legacy support | Do not use menu hiding as authorisation. Authenticate exact existing relationship and gate mutations while retaining read-only/export / closure paths if required | Never delete commercial leases, applications, money history or document grants based solely on pivot |
| Strata Manager `strata-manager`, Building Manager `building-manager`, Building Resident `building`, Council `council` | Retire new acquisition/actions | Hide sector nav/entry, scheme signup and public offer; show accurate legacy path for approved cases | Disable new scheme assignments, invites, councils, notices, amenities, reservations and sector-specific orders; preserve historical grants and safe export | Retain scheme/lot/facilities/notice/decision logs, and approved records consistent with law/retention |
| Construction/specialist market programmes | Remove from Residential marketing | No dedicated sector route or CTA; specialist construction stays archive or request-only after explicit future review | Disable new speciality dispatch/pack activation; do not strip shared maintenance services | Preserve historic records |
| Student Living | Fold under Residential Co-Living | 301 `/student-living` → `/co-living`, update meta/canonical/sitemap | No standalone account or per-student plan | Keep room/tenancy data and privacy |
| Residential leasing/tenants/maintenance/Staff/reporting/approved WA forms | Retain and improve | Prominent, scoped entry with tested CTA | Preserve security, lawful notices, status updates, price and approval guards | Preserve all related state |

**Pre-retirement release gate:** inventory active Commercial/Strata accounts, queued works, bookings, future appointments, unpaid invoices, disputes, outstanding notices, effective property mandates and issued documents. No mass disable before owner review of exceptions, client communication and contractual duties. Replace hard 404/410 for authenticated historic access only after migration/export agreements and statutory retention decisions. Explicitly distinguish pausing new sales from extinguishing existing rights.

**Do not delete** `WorkspaceKind` variants, existing D1 tables, migrations 0001–0062, archived report templates, R2 evidence or queue/DO records during Phase 1. Generalised authorised property / work / billing functions are shared with Residential; isolate feature access and remove sector-facing UI instead of deleting shared domain code.

## 3. Source change map (verified at baseline; actual patch paths subject to code review)

| Component | Specific change |
|---|---|
| `packages/marketing/public-navigation.ts` | Replace 13 entries with exact nine owner-selected labels/links. |
| `packages/marketing/public-facts.ts` | Remove 3-plan public offer and replace with one weekly Residential item; explicit interval/price per property; do not mislabel room or `monthlyExGst`; review scope and term claims. |
| `packages/marketing/content.ts`, `sector-overviews.ts`, `sector-programmes.ts`, `audiences.ts`, `service-areas.ts`, `public-catalogue.ts`, `packages/marketing/pricing-publication.ts` | Remove old residential comparison, Commercial/Strata/Construction sales copy, audience choices and false automatic service inclusions; retain residential service and Co-Living content. |
| `apps/marketing/app/components/site-chrome.tsx`, `plan-comparison.tsx`, `home/*`; `apps/marketing/app/routes/{home,service-overview,information,who-we-help,audience,service-finder,residential-support,tenants,sitemap,robots}.tsx` where applicable | Ensure header, footer, landing, comparison, FAQ, sitemap/canonical/social metadata and contact copy agree across breakpoints. |
| `apps/marketing/app/routes.ts` AND `apps/platform/app/routes.ts` | Maintain both source route tables; production serves shared marketing modules via the platform Worker. Explicit legacy responses/redirects, do not let generic `:page` fallback silently serve retired content. |
| `apps/platform/app/routes/{signup,start,onboarding,organisation,client-entry,workspaces,workspace,book,bookings,leasing-administration,pricing-administration,billing,stripe-subscribe}.tsx` where applicable | Residential-only new account choices, no commercial/strata professional intake, correct free signup and subscription status; retain invited Tenant and role-safe Staff access. |
| `packages/domain/{client-navigation,portal-navigation}.ts`, workspace and role-resolver modules | Remove retired sector entry and new acquisition. Preserve server-side legacy permission boundaries, historical read/export, and Staff operations. |
| `apps/platform/worker/features/{service-pricing,stripe-billing,co-living,leasing,commercial*,strata*,reports}.server.ts` and corresponding API routes | Central product eligibility gate; correct weekly entitlement and checkout mapping; deny new sector mutations; scoped reporting remains shared. Specific server entrypoints must be discovered/verified before edits. |
| `database/migrations/0063_*.sql` **or next available number after latest main recheck** | Additive plan version / per-property weekly price / entitlement and status/retired-product gate mapping if existing schema cannot express it. No renumbering/editing applied migrations. Do not infer a live Stripe charge from local subscription status. |
| `docs/*`, `tests/*`, `.github/workflows/*` | Update architecture, supported-role matrix, approved prices and release gates; retain archived specs and negative-role/regression tests; add exact-head Cloudflare acceptance + Google handoff checklist. |

## 4. Weekly subscription engineering contract

**Offer:** `residential-all-inclusive-weekly-2026-11` (stable versioned internal key, not an assumed Stripe ID), `AUD`, price `5000` minor units ex GST, recurring `week`, interval count 1, quantity 1 per approved chargeable residential property. If Australian GST rate of 10% applies, customer total is AUD 55/week per property. Public copy must explicitly state +GST and per property. Actual tax configuration must be verified in Stripe test/live catalogue.

- One approved current standard Residential subscription product only. Keep a legacy plan identifier **readable** for historic invoices/contracts, even if hidden from new sale.
- Identity and property registration remain free; never auto-charge upon creating a Landlord account or adding a property. Distinguish application record, proposed plan, completed checkout, Stripe active state and actual `paid_through` from reconciled invoice/event.
- Apply paid coverage to the **exact contracted residential property**, not every property in a client's account. Check account ownership or agency delegation, approved agreement version, service catalogue/allowance, property coverage, current paid-through state and scheduling/operational gate before marking `included`.
- Stripe: approved product/price in test first, webhook signature, idempotency and replay, invoice/payment states, failed collection grace only if approved, cancellation, credits/refunds, GST, proration, quantity/property adjustments, invoice/payout reconciliation. Keep old Stripe prices for existing customer audit; retire them from new Checkout rather than deleting history.
- No promise of unrestricted unlimited bookings. Included vs additional costs follow the signed revised Schedule of Fees after new $50/wk schedule approval. In the attachment: PCR, routine, exit, vacancy, common tenancy administration, standard open homes and maintenance coordination are marked included; private open homes, video walk-throughs, key services, urgent works and outsourced full maintenance are additional/POA. Court/statutory services and specialist forms remain separately governed. A displayed `Included` cell does not waive legal/provider gates.
- PAYG stays available for residential one-off requests without a subscription. Existing account-first guest design remains; unauthenticated guest checkout is not assumed to be active.
- Co-Living contracted operations remain a separate site-scoped agreement/quote (different fee model) and must not accidentally inherit weekly plan charge or entitlements.
- Do not enable rent direct debit, security-bond custody, trust accounts, unsanctioned contractor expenditure or automatic issue of statutory documents.

## 5. Implementation work packages, in order

### P0 — Freeze, inventory and repository preservation
- [ ] Record exact main SHA, PR merge status, connected Worker/production SHA, current D1 migration ledger, all R2 bucket bindings, DO/queue and Stripe product/price IDs read-only.
- [x] Create immutable-reference archive branch at pre-pivot SHA and write build/reactivation specifications.
- [ ] Identify existing Commercial/Strata clients, jobs, issued records, unsettled payments and retention/termination obligations; no access removal until safe dispositions signed.
- [ ] Establish separate Residential feature branch(s) from freshest main, linked PRs and safe Cloudflare staging/preview with **isolated D1/R2**.
**Gate:** archive is independently reproducible from Git and active customer/case register is signed.

### P1 — Marketing and acquisition: Residential only
- [ ] Exact nine-item desktop/mobile navigation; home, sectors, service finder, footer, SEO, sitemaps, canonical and 301/410 policy; remove orphaned links and Commercial/Strata/Construction CTA.
- [ ] One $50 + GST weekly per-property plan card. Retire new monthly plan comparison. Keep PAYG, free signup and Co-Living custom quote clearly separate.
- [ ] Restrict new signup/onboarding/professional organisation selector to Residential (and existing invitation-based Tenant). Preserve email sign-in and correct existing-role guidance.
- [ ] Retire commercial leasing and commercial application public entry; test malformed, legacy and direct URLs; no private applicant files leak through redirects.
**Gate:** source test + 320/390/desktop keyboard/mobile checks; all marketing CTAs use real allowed routes; legal/content owner sign-off before publishing.

### P2 — Server-side product retirement
- [ ] Versioned server-side allowlist for new product registrations, commercial/strata requests, booking, invitation, checkout, forms, publications and writes; default deny new retired-sector actions and issue meaningful legacy status.
- [ ] Allow only audited, explicitly scoped legacy case completion/export when required, not new business. Verify R2/document/finance access remains exact-grant-based.
- [ ] Retain sector modules in archive; update active code where warranted but do NOT drop shared schema or weaken `WorkspaceKind` authorisation.
**Gate:** role-crossover denial suite: direct API calls, old session, forged IDs, stale membership, modified client/sector field, mixed role identities, queued retries.

### P3 — Residential property and operations UX
- [ ] Apply `Residential Portal Build.docx` RES-001–RES-055: owner/agency action dashboard, persistent authorised property context, property setup, tenancy links and invitations, booking and change views, maintenance approval, report-progress and permissioned issuance, finance and plan overview.
- [ ] Staff Operations remains mandatory: daily queue, scheduler/capacity, Work Order case, independent inspector vs QC, issued report and recipient-safe updates, invoice/exception review. Shared only one canonical case chain.
- [ ] Preserve WA tenancy notices/forms/secret cases with source-specific approval and audience gates; improve genuine native report/PDF/photo annotation and offline reliability per completion guide.
- [ ] Residential Leasing/Open Home: residential-only listings, verified agency applicant destination, attendee privacy, cancellation and post-session attendance report with sender/retry evidence. Co-Living: distinct property/room assignment and authorised operating scope; no new standalone sector role.
**Gate:** real and negative role journeys across owner, agency, tenant, inspector, reviewer/ops; payment/service coverage checks; no mismatched report or applicant audience.

### P4 — Weekly billing implementation and provider acceptance
- [ ] Obtain versioned approved contract/fees/inclusions, 24-month/cancellation decision and legacy conversion rules **before** enabling new Checkout.
- [ ] Add versioned weekly plan DB model and Stripe test product/price mapping (external live IDs supplied by Stripe), server-signed checkout and safe webhook event processing; audit idempotent retries and duplicate checkouts.
- [ ] Validate paid-through property allowance, pricing display, correct tax invoice, failed/late payment, cancellation, refund/credit, updated property count, grandfathering and agency invoice payer.
- [ ] Keep live subscription creation disabled until test provider evidence and independent approval; no automatic conversion of existing users.
**Gate:** Stripe test-mode acceptance + isolated ledger reconciliation + live configuration review.

### P5 — Cloudflare acceptance and controlled release
- [ ] Run CI: locked dependency/typecheck, domain/SQL, both builds, Worker/D1/R2/DO/Queue integration, portal role/permission, security, user journeys, responsive browser and deploy dry-run on **exact PR head**.
- [ ] Run isolated D1/R2 recovery drills; ensure migrations 0001–0062 still replay and new migrations are additive; verify previous reports/billing/document grants after restore.
- [ ] Verify preview cannot connect to production DB/R2/queues or use production Stripe, email or cron. Test actual provider email, Stripe mode, Google Calendar readback (if enabled), report creation and cancellation/reschedule on safe fixtures.
- [ ] Compare release diff against live main; record rollback (code **and** data); do a guarded, explicitly accepted main merge. **main triggers production Cloudflare Workers Builds; do not merge prematurely.**
- [ ] Observe prod Worker identity/SHA, metrics, sign-in, single service end-to-end, negative legacy routes and privacy/finance exception queues. Record explicit independent release decision.
**Gate:** Cloudflare Residential-only hosted GO from named owner, exact SHA, role-authenticated evidence, provider/recovery proofs and no unmitigated severity 1–2 defects.

### P6 — Google Cloud transition (later, separate programme)
- [ ] Keep Cloudflare source of truth and single writer until an approved Google migration plan, clear data ownership and complete release baseline.
- [ ] Adapt Worker runtime to Cloud Run Node SSR/APIs (HTTPS LB/Cloud Armor as appropriate), D1/SQLite→Cloud SQL PostgreSQL with deliberate schema transform/record ID mapping, private R2→Cloud Storage with hashes/recipients, Queue/cron/outbox/DO schedule semantics to Cloud Tasks/PubSub/Scheduler and transactional holds.
- [ ] Preserve one canonical user, property, tenancy, Bookings/Work Orders, document, audit, billing and entitlement history. Stripe remains processor; do not create a second money ledger. Google Calendar is projection only.
- [ ] Rehearse full snapshot export/import and checksum/row/relation reconciliation, access grants, private evidence hashes, tenant legal retention, immutable report versions, replay-safe events and end-to-end parity across all active roles.
- [ ] Run one controlled single-writer cutover with frozen writes, incremental reconciliation, traffic switch and documented reversal. No live dual-writer database/ledger period.
**Gate:** a second independent Google Cloud operational GO, not implied by Cloudflare acceptance.

## 6. Test matrix (minimum)
| ID | Positive acceptance | Failure/denial/edge |
|---|---|---|
| RES-M01 | Nine-item header on 320/390/desktop and accessible keyboard menu | No Commercial/Strata/Student/Construction path to a new purchase |
| RES-M02 | Weekly AUD 50 ex / AUD 55 inc GST copy at every new-plan touchpoint | No old monthly price, no `per room` surprise and no false 24-month term |
| RES-A01 | Free residential owner signup; add authorised property | No automatic paid Stripe subscription or included-service grant |
| RES-A02 | Professional residential agency application and approved assignment | Rejected/pending agency cannot manage unrelated portfolio |
| RES-T01 | Correctly invited Tenant view/maintenance/PCR response | No owner finance, private forms, unissued drafts or other tenancy |
| RES-B01 | Paid-through property + covered service makes single Booking/Work Order | Unpaid/wrong property/extra service cannot book as `included` |
| RES-S01 | Staff inspection/QC/report and client document issue | Self-approval, unissued version and guessed document IDs denied |
| RES-L01 | Residential listing, open-home check-in, applicant routing/report | Commercial listings/applications blocked, applicants kept confidential |
| RES-C01 | Co-Living site/room work under correct signed agreement | No automatic $50 weekly charge on room configuration |
| RES-F01 | Stripe sandbox weekly invoice, fail/retry, refund, cancel, replay | Event success redirect alone never unlocks entitlements |
| RET-01 | Existing legacy case allowed read/export only where approved | Forged/stale Commercial/Strata new bookings, invitations and financial mutations fail closed |
| OPS-01 | Scheduler, queue, provider retries and recovery restored | Queued sector writes blocked after retirement; no duplicate money/jobs |
| REL-01 | Exact-SHA hosted acceptance and rollback | Never claim Cloudflare CI means Google Cloud readiness |

## 7. Git delivery and deployment controls

Recommended PR sequence (one verified scope per PR, all against fresh main, no auto-merge):
- **PR-A:** snapshot inventory, archival pointers and product policy/acceptance register (docs only; this plan).
- **PR-B:** shared marketing links and no-index/redirect policy, Residential signup choices, new price display **behind publication approval**.
- **PR-C:** backend new-sector retirement gates and legacy controlled view/export, with strict direct-URL/API negative tests.
- **PR-D:** Residential dashboard/property/tenant/operations and report journey improvements, split into limited PRs by canonical workflow.
- **PR-E:** versioned weekly billing/Stripe test integration and the entitlement/legacy transition; feature disabled in production until approved.
- **PR-F:** isolated hosted migration and acceptance evidence, independently approved release, then main merge/Cloudflare observation.
- **PR-G:** Google Cloud adapters, isolated migration/rehearsal, parity and independent infrastructure cutover, only after Cloudflare GO.

**Cloudflare deployment hazard confirmed:** `docs/DEPLOYMENT.md` says `main` automatically deploys the existing `proinspect-platform` Worker through Cloudflare Workers Builds; the public marketing site is served inside that Worker. A GitHub main merge can publish code even if GitHub Actions is green. Branch/preview isolation, billing fail-closed configuration and release approval are mandatory.

**No destruction order:** This pivot does not authorise deleting users, contracts, tenancy history, Commercial/Strata D1 data or R2 objects; disabling existing customer commitments; initiating charges; or switching Google Cloud traffic.

## 8. Document and implementation notes
- Uploaded `ProInspect_Schedule_of_Fees_Revised.docx` says **AUD 150 + GST per month** for Property Support and includes mixed Included/Additional charge/POA rows; it must be versioned/reapproved for AUD 50 + GST per week, with legal/ops schedule updated accordingly.
- November source `packages/marketing/public-facts.ts` has Residential Inspection Only 20/month, All-Inclusive 150/month, Commercial 150/month; `packages/marketing/content.ts`, `sector-overviews.ts` repeat obsolete copy. The exact owner-selected price replaces **all** those marketing references.
- Source includes ten backend kinds, but only four active launch categories are in scope: Residential owner, Property Manager, Tenant, Staff; Co-Living is a configuration. Other kinds can remain for controlled legacy records; required launch acceptance matrix must be revised rather than falsely described as ten active customer portals.
- Current unified marketing routes appear in both `apps/marketing/app/routes.ts` and `apps/platform/app/routes.ts`; the latter is production. Avoid changing only the standalone marketing build.
- `packages/marketing/pricing-publication.ts` currently has `RESIDENTIAL_SUPPORT_COMMERCIAL_APPROVED=false`; this is a publication gate, not a service allowance or price-approval policy.
- Older proposed **24-month plus 60-day** terms and weekly historical draft **Friday billing** are not automatically compatible. Explicitly decide term and billing anchor before code publication or Stripe setup.

## 9. Completion criteria
The pivot is complete only when Residential marketing, signup, property scope, PAYG and approved weekly contract flows are consistent and verified; Commercial/Strata new work is genuinely blocked on the server while existing duties/records remain safe; Co-Living custom engagement is correctly separate; Staff operations, reports and permissions work in authenticated hosted journeys; Cloudflare recovery/provider evidence and live SHA are independently accepted; and the archival branch is preserved with specifications. **Google Cloud completion is a later independent release.**
