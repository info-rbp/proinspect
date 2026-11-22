# Co-Living property onboarding module — PR #118-based development specification

## Implementation update — 22 November 2026 (PR #120, draft)

The branch now includes migration `0065_co_living_onboarding.sql`, guarded Worker APIs, Residential owner and Staff Operations screens, revised owner fee/utility financial illustrations, document/evidence **references**, independent proposal/assessment/checklist review, project task/asset/approved-variation tracking, and focused migration plus isolated Worker/D1 tests. This is functional source code, not a production release, final legal agreement/e-signature, working Stripe rent routing, full document upload, room-by-room public leasing, or certified hosted role acceptance.

**Verified upstream leasing limitation:** `database/migrations/0009_leasing.sql` creates `leasing_one_live_per_property`, allowing **one draft/published listing per canonical property**. Co-Living advertising handover currently links a published **property-level** listing to the onboarding project; resident room assignment remains independently scoped in `co_living_spaces` and `co_living_occupancies`. Six simultaneous public room-level advertisements require a separate leasing schema / API / UX change and approval. This implementation does not manufacture unsupported room listings or silently bypass leasing release gates.

**Current core integration:** `apps/platform/worker/features/co-living-onboarding.server.ts` handles owner/staff actions under the established workspace/API permissions, and the onboarding routes render inside the existing `/w/:kind/:scopeId` Client/Staff Portals. An external enquiry may still use the existing public marketing channel; the authorised property-onboarding record is created after an owner's verified property relationship.

**Release boundary:** Existing PR #118 inspection rates, booking categories, candidate fee migration `0064`, Stripe credit flags, bond handling and rent custody are untouched. All operations remain branch-only until full exact-head and hosted acceptance. Supplier procurement updates record progress; they do not place orders or pay trades. Owner decisions record an approved scope but are not substitute digital signatures or independent legal verification.

---

**Status:** IMPLEMENTATION SPECIFICATION / non-production  
**Prepared:** 22 November 2026 (Australia/Perth)  
**Upstream integration PR:** [#118](https://github.com/info-rbp/proinspect/pull/118), draft, head `12d66cf91b1fbb8d99268168248bd0c918d98908` at branch creation  
**Work branch:** `feature/co-living-onboarding-pr118-spec-20261122`, forked from that exact PR head  
**Target:** Stack a separate draft PR against `feature/direct-inspection-booking-cash-terms-20261121`; integrate into PR #118 only after review. No direct merge into `main`.

## 1. Objective, scope and non-goals

Build one property-specific onboarding journey in the **Residential Client Portal** and a corresponding **Co-Living Establishment** queue in **ProInspect Operations**. Preserve one canonical residential property and existing relationship-scoped permissions. The six customer stages are:

1. **Enquiry** — assess initial interest and gather initial property details.
2. **Site Visit** — physically assess room suitability, current tenancy, utilities, furnishings, compliance and potential.
3. **Proposal** — deliver a versioned, property-specific investment proposal, service agreement and scoped costs for owner approval.
4. **Implementation** — organise approved compliance/alterations, procurement, furniture resale/removal, delivery, contractors, inventories, internet and cleaning arrangements.
5. **Advertising** — publish only approved rooms, manage leads and applications through the existing authorised leasing workflow.
6. **Tenanted** — move the first resident in, complete their PCR and room inventory, establish the approved operational schedules; later vacant rooms remain in leasing.

This is not a sixth customer portal, a new authentication flow, a subscription enrolment, or an invitation to bypass licensing, cash custody, statutory forms or release approval.

**In scope:** client education, status/progress, pre-property enquiries, staff intake/assignment, site visit evidence, feasibility/proposal records, immutable approval snapshots, furnishing/project and spend tracking, readiness, handoff links and notifications.

**Out of scope until separately accepted:** live rent collection/owner disbursement, bond collection, executed e-signature provider, unapproved advertising publication, actual supplier payment, Stripe Connect or Cash Client invoice activation, legal confirmation of room use, statutory compliance certification. All such actions must be real provider-/authority-backed operations, not simulated statuses.

## 2. Specific integration findings from draft PR #118

PR #118 is an **unmerged draft**, based on main after PR #116 and subsequent Residential marketing integration. It introduces property-first four-category booking navigation, PCR/Routine/Exit-specific secure intake, candidate fee migration `0064_direct_inspection_booking_cash_terms.sql`, and separately reviewed Cash Client deferred terms. Candidate prices are not published and live credit, checkout or invoice issuance are not released.

Do **not** change PR #118's four booking categories, `services.booking_mode`, published service prices, cash credit flags, `cash_invoice_batches`, Stripe activation, licence assumptions or existing authorisation boundaries.

Reuse upstream:
- `apps/platform/app/routes/property.tsx` property-centred action card and existing `properties/:propertyId` route;
- `apps/platform/app/routes/co-living-directory.tsx` and `co-living.tsx` for Co-Living entry and canonical room/shared-area operations;
- `apps/platform/app/routes/finance.tsx` approval UI patterns, **not** its work-order financial approval object as automatic approval of a Co-Living agreement;
- `apps/platform/app/components/OperationForm.tsx` and UI primitives, preserving explicit POST, idempotency and server authority;
- `apps/platform/worker/features/co-living.server.ts` for room/tenancy safeguards, including refusal of concurrent whole-property and room tenancy;
- `packages/domain/portal-navigation.ts` and `client-navigation.ts` for role-aware navigation;
- documents, canonical bookings/work orders, audit events and authorised leasing capabilities.

A site visit is a **project activity**. Link an existing authorised booking/work order if appropriate, but do not invent a chargeable service ID or force Site Visit into the four appointment booking categories without catalogue approval.

**Branch rule:** Future changes to PR #118 require reconciling/rebasing this branch against its new head. The current spec is anchored to head SHA above; never silently merge stale code into production.

## 3. Commercial and service contract (owner-approved proposal snapshot)

These are the agreed modelling inputs, **not activated live pricing**:

| Subject | Proposal/owner-facing rule |
|---|---|
| Recurring Co-Living fee | 25% **plus GST** of **gross rental income actually collected**, including room and car-bay rent |
| Fee period | Contract-specific; express calculations in weekly and annual equivalents, disclose occupancy assumption |
| Annual utility allowance | ProInspect funds eligible electricity, gas and water-consumption bills up to **25% of management fees actually collected excluding GST**, over each 12-month agreement year |
| Utility overage | Owner reimburses verified excess; expenditure/cap reconciliation and notification must be recorded |
| Utility exclusions | Internet and standard shared cleaning are separately funded by ProInspect, not deducted from the utility allowance; rates, capital and maintenance remain owner costs |
| Internet | ProInspect supplies plan appropriate to property |
| Shared cleaning | ProInspect supplies **fortnightly** common-area cleaning and agreed standard consumables |
| Private cleaning | Optional resident-paid room cleaning, with separate consent/quote |
| Marketing/leasing | Ordinary services and ordinary advertising paid by ProInspect |
| Bond administration | Proposed separate owner fee **$100 + GST per bond**; no automatic resident levy |
| Tenancy database search | Proposed separate owner fee **$50 + GST per permitted check** |
| PCRs and inventories | On each initial private-room tenancy; include exit records as agreed |
| Routine inspections | Quarterly subject to lawful notice/access arrangements |
| Maintenance | ProInspect organises quotes; owner must approve and fund agreed repairs, unless lawful emergency/contract authority applies |
| Furnishing, replacements, property rates and insurance | Owner-funded. ProInspect holds relevant inventory/warranty and coordinates claims |
| Client reporting | ProInspect invoices, receipts and transaction records; **not** full landlord accounting/EOFY tax statements |

In proposal snapshots include:
- baseline whole-property rent vs proposed room and car-bay rents;
- occupancy assumptions, gross vs after-fee and after-operating-expense figures;
- initial furniture purchases, setup labour, alterations, approvals, existing-item resale credit and contingency;
- maintenance reserve and owner operating expenditure, with explicit exclusions;
- 25% fee basis, GST, annual utility cap definition and reimbursement worked example;
- non-binding nature of room use and rent projections until approvals/market verification;
- agreement version, applicability/effective dates and owner authority.

The provided six-room **illustrative** sample totals $2,050/week rooms + $50/week car bays = $2,100/week gross at full occupancy. It is **not** an authorised quotation or an automatic property configuration. Theatre/study room use must be reviewed before advertisement.

**Annual cap calculation:** At $2,100/week, gross potential rent $109,200/year; illustrative fee $27,300/year before GST, so maximum ProInspect utility contribution $6,825/year. The allowance is 25% of the **fee**, not 25% of rent, and is not a guaranteed amount if rent is not collected. Round monetary amounts in cents at explicit invoice/reconciliation boundaries; represent underlying figures as integers. Define pro-rata first/last agreement year, credits, reversed rent, supplier adjustments and final reconciliation before financial activation.

## 4. Entry points and UX / information architecture

**Before verified property relationship:** public Co-Living service CTA may create an enquiry through an existing marketing contact/intake pathway, and registered owner may initiate a preliminary interest record. This **does not** grant property access. Store supplied address as *prospect text* pending relationship review; do not create a duplicate canonical property.

**After authorised property relationship:** expose the onboarding project from:
- Residential dashboard: pending decision and active onboarding progress card;
- Residential > Co-Living: cards for Enquire, In progress, Operational;
- Property > Co-Living: `Onboarding & Setup` link;
- Staff Operations: `Co-Living Establishments` pipeline.

Proposed UI routes, all nested under existing authorised `/w/:kind/:scopeId`:
- `/co-living` existing directory extended with onboarding status;
- `/co-living/enquiry` enquiry wizard for eligible owners;
- `/properties/:propertyId/co-living/onboarding` six-step guide and progress;
- `/properties/:propertyId/co-living/onboarding/proposal` immutable proposal/approval view;
- `/properties/:propertyId/co-living/onboarding/establishment` budget, purchases and works;
- `/properties/:propertyId/co-living/onboarding/readiness` owner-visible approved readiness summary;
- `/co-living-establishments` staff-only operations index;
- `/co-living-establishments/:projectId` staff project workbench.

**Client progress component:** six stages, distinct Not started / In progress / Waiting for owner / Blocked / Completed statuses; progress determined by server-reviewed evidence, not editable percentage. Show *What ProInspect is doing*, *What we need from you*, *Documents*, *Next action*, and dated updates; accessible at narrow mobile widths. Do not mark the entire property fully tenanted just because the first room becomes occupied.

### 4.1 Client Portal screens

| Screen | Owner sees | Owner can do | Explicitly withheld |
|---|---|---|---|
| Co-Living overview | Owned properties, enquiries, active establishment statuses | Request assessment, open project | Other owners' projects |
| Enquiry | Property contact, intent, photos/floor-plan and consent fields | Save/submit enquiry | Automatic property/management grant |
| Site assessment | Appointment, uploaded evidence, recommendations, proposed layout, blockers | Supply documents, confirm access | Staff-only raw notes, unreviewed compliance claims |
| Proposal | Itemised budget, owner income sensitivity, service inclusions, management terms, agreement version | Request changes / accept / decline after authority verification | Change prices or contractual text |
| Establishment | Room-by-room furnishing, approved vs committed vs spent, ETA, progress and exceptions | Approve changed scopes and costs | Supplier private information without necessity |
| Readiness | Completed checks, outstanding blockers and final approval | View evidence meant for owner; request clarification | Self-certify statutory compliance |
| Advertising & move-in | Published room statuses, approved rent, occupancy count, linked listings | Review approved pricing decisions | Other residents' personal records |

**Owner-facing guide** is generated from the same canonical stage registry as internal task labels. Offer optional downloadable guide, but the portal is the source of current status.

### 4.2 Staff Operations screens

- **Pipeline:** filter by stage, blocker, property, assigned operator, next action and overdue date. Aggregate statuses from actual project records; no invented sample counts.
- **Enquiry triage:** link existing prospect/owner, verify duplicate address and management relationship; assign coordinator.
- **Assessment:** checklist, lawful space-use issues, whole-property tenancy conflicts, visit evidence and proposed room layout; mark authoritative vs provisional.
- **Proposal builder:** version and compare room rent schedule, car bays, utility cap assumptions, budgets, excluded works, financial sensitivities and service agreement; stage for independent review and owner issue.
- **Implementation board:** procurement and resale ledger, delivery/assembly, contractor milestones, cash-cost evidence, warranty inventory, quote approvals and dependencies.
- **Readiness sign-off:** evidence per safety/authorisation, owner-facing summary, separate reviewer; no staff-only checkbox can legalise use.
- **Handover:** create approved `co_living_sites` and spaces only after tenancy review and configuration approval; link to leasing/tenancy processes that already enforce identity/room access.

## 5. Stage machine, exit gates and exception paths

All stage changes occur server-side through atomic, version-checked commands. Each stage has an exit gate; the domain registry supplies labels only. The project can also be `on_hold` or `withdrawn` without deleting historic evidence. No auto-advance from marketing activity.

| Stage | Required exit evidence | Authorised action |
|---|---|---|
| Enquiry -> Site Visit | Contact and property reference, consent, named staff owner, assessment visit agreed | Operations coordinator |
| Site Visit -> Proposal | Completed on-site assessment, reviewed existing tenancies, preliminary legal/room suitability notes, furnishing/works estimate, reviewed feasibility | Assigned staff + reviewer where mandated |
| Proposal -> Implementation | Correct verified owner/delegated authority; current proposal and service agreement executed; budget and scope authorised; proposal version unexpired | Verified owner/admin or evidenced delegated authority; server confirms |
| Implementation -> Advertising | Approved conversion/room use evidence; defined works completed; room inventory, internet/cleaning arrangements, photographs and independent readiness sign-off; no blocking defects | Staff reviewer distinct from author |
| Advertising -> Tenanted | At least **one** verified active tenancy in an approved private space with completed PCR, inventory and move-in checks; appropriate operating schedules active | Authorised operations handover |
| Tenanted ongoing | Continue vacancies and move-ins in standard leasing + tenancy flows; do not regress project stage for a single vacancy | Standard owner/operations processes |

Proposal changes after acceptance require a new version and renewed approval for *material* changes. Approval of an extra furnishing quote does not amend the recurring management terms. Decline and cancellation retain audit; avoid deleting historic documents.

**Blocking conditions:** unresolved whole-property tenancy, unclear property authority, missing space-use approval, incomplete statutory checks, missing executed agreement, exceeded approved budget, stale proposal version, unreviewed owner quote, security concerns, or unapproved leasing publication. A blocker should include a responsible owner, remedy and timestamp.

## 6. Planned additive D1 schema (reserve migration 0065, confirm at integration)

PR #118 currently ends at `0064_direct_inspection_booking_cash_terms.sql`. Reserve the next available additive migration (currently `0065_co_living_onboarding.sql`); re-check the repository's migration ledger at implementation/merge time.

Use `STRICT` SQLite tables, foreign keys, bounded fields, explicit indexes, local UTC timestamps, immutable documents, transaction/audit events and version columns for optimistically locked writes. Proposed data model:

| Table | Principal fields and integrity |
|---|---|
| `co_living_onboarding_projects` | `id`, `client_id` FK, nullable `property_id` FK, nullable existing `enquiry_id` reference (only if compatible), stage enum, lifecycle status, workflow version, assigned staff FK, `version`, created/updated timestamps; unique active project for client/property |
| `co_living_onboarding_stages` | `project_id` + `stage` PK, status enum, assigned reviewer, started/completed timestamps, evidence reference, completed-by; reject stage skips |
| `co_living_onboarding_tasks` | `id`, `project_id` FK, stage, task key, title, assignee, due date, status, blocker code, evidence document ID, version, timestamps |
| `co_living_onboarding_assessments` | `id`, project FK, monotone version, booking/work-order links if real, encrypted notes reference, proposed rooms and suitability findings, author/reviewer and review state |
| `co_living_onboarding_proposals` | `id`, project FK, monotone version, currency, commercial snapshot JSON or normalised line items, projected weekly rent, expenditure totals, management basis points 2500, utility-allowance basis points 2500, snapshot hash, document/grant reference, issue/expiry/status |
| `co_living_onboarding_decisions` | `id`, project/proposal FK, immutable exact version + hash, verified actor and authority basis, accept/decline/request-change, timestamp; no self-authorising staff action |
| `co_living_onboarding_establishment_items` | `id`, project/space reference, item category, qty, budget cents, approved limit cents, committed/actual cents, supplier reference, procurement status, warranty/receipt document links, version |
| `co_living_onboarding_spend_approvals` | `id`, establishment item/scope, requested cents, proposed variation, targeted verified owner, decision, approver/evidence, exact version and timestamps |
| `co_living_onboarding_readiness_checks` | `project_id` + check key, status, evidence reference, assessor, reviewer, review date; independent sign-off for release-critical checks |
| `co_living_onboarding_events` | immutable event ID, project, actor, action, from/to stage or decision, metadata, timestamp and idempotency key |

Suggested DB guards: prevent duplicate active property projects; prevent approval on superseded proposal versions; enforce increasing versions on update; preserve accepted proposal snapshots; require actor/role at service layer **as well** as constraint gates; prevent cross-property attachment; prohibit stage advancement without required reviewed evidence. Do not auto-cascade-delete records with financial/contractual decisions. Retain a durable project event history.

**Document model:** use existing authorised document records and issue/grant controls. Never make uploaded floor plans, owner budgets, tenant applications or staff inspection notes public merely because a project is linked to an advertised property. Retention schedule and sensitive upload scanning must match the existing private-document controls.

**Separate operational financial records:** eventual rent receipts, utility bill proofs and owner reimbursements require a licensed/compliant payment and accounting design. This onboarding migration must **not** write to `cash_booking_charges`, `cash_invoice_batches` or imply Stripe funds are cleared.

## 7. Proposed API contract

Add a module `apps/platform/worker/features/co-living-onboarding.server.ts`, registered through the existing guarded worker router. Never use a general-purpose endpoint that trusts client-provided `clientId` or `propertyId` as authority.

| Method / proposed route suffix | Purpose | Permission / constraint |
|---|---|---|
| GET `/co-living/onboardings` | List client projects by verified relationship | Owner/admin, permitted agency scope |
| POST `/co-living/onboardings` | Initiate property/prospect enquiry | Verified client; submitted property is a claim until verified; idempotency required |
| GET `/co-living/onboardings/:id` | Return owner-safe summary, statuses and actions | Current client/property relationship; no private staff notes |
| POST `/co-living/onboardings/:id/owner-decision` | Decide on exact proposal/spend version | Verified owner/admin or independently evidenced delegate, freshness/version check |
| GET `/co-living/onboardings/:id/proposals/:version` | Read immutable approved/issued proposal snapshot | Project relationship and document grants |
| GET `/co-living-establishments` | Staff pipeline | Staff operations role |
| POST `/co-living-establishments/:id/assessment` | Save/review visit evidence | Assigned operations role; reviewers distinct as required |
| POST `/co-living-establishments/:id/proposals` | Draft/issue revised proposal version | Staff writer; independent release reviewer |
| POST `/co-living-establishments/:id/items` | Procurement/inventory and supplier updates | Assigned operations role; extra spend has approval gate |
| POST `/co-living-establishments/:id/readiness` | Submit independent readiness review | Separate authorised reviewer; supporting evidence required |
| POST `/co-living-establishments/:id/advance` | Request state transition | Server recomputes gate from trusted records; atomic compare-and-swap |
| GET `/co-living-establishments/:id/events` | Audit/history register | Authorised staff, separately scoped owner summary |

Suffixes above are relative to the existing `/api/w/:kind/:scopeId` pattern; route layout and staff scope must match PR #118's existing router. Contractual approval is not synonymous with a financial ledger payment or legal signature; record actual reference and provider evidence.

**Response conventions:** GET 403 for denied scope (or 404 to avoid existence leaks), 409 for stale version/conflict, 422 for missing gate/invalid state, 503 for feature not released; no successful confirmation on external payment/email initiation alone. Mutating POSTs require request keys, CSRF/session protections as applicable, and event/audit records. Do not accept mutable proposal totals from the owner-decision request; load the immutable server snapshot.

## 8. Privacy, permissions and segregation of duties

- **Owner/admin:** can read authorised project and issue decisions, not staff-only notes or other owners' expenditure.
- **Verified agency delegate:** view/act only within current property delegation; management scope alone is not permission to sign an owner's capital or engagement agreement.
- **Staff coordinator:** assess, draft, procure within approved scope, record progress. No unilateral owner budget consent.
- **Independent staff reviewer:** independently verify readiness, room suitability documentation and issued proposal version; cannot approve their own controlled review where separation required.
- **Resident/tenant:** no access to prospect, proposal, procurement, owner utility cap, staff notes or other residents' tenancy data.
- **Public visitor:** only generic Co-Living marketing and optional enquiry; never private stage status.

Preserve existing `co_living_sites` room isolation, tenancy invitation controls and D1 overlap triggers. Access always checked server-side at every read, attachment and action. User-controlled account tags and navigation labels never grant permission.

## 9. Notifications, system interfaces and accessibility

Notifications: enquiry received, assessment scheduled, proposal issued, owner response requested, budget variation requested, implementation milestone achieved, readiness blocked/cleared, room listing published, first tenancy activated. Each includes a scoped portal link and a truthful event status; never send private attachments or applicant PII in general email. Revalidate audience at send time and use existing notification queue rather than calling email from rendering.

Use existing `Property` as canonical entity, `Booking/WorkOrder` for genuinely authorised visits and works, `Documents` for issued reports, `Leasing` for public approved listings, `co_living_spaces` for approved room allocations, `Tenancy` for actual occupancy. No direct mutations to upstream Cash Client invoice tables.

Accessibility: usable at 320px+, keyboard-only modal/form navigation, stage progress text not colour alone, accessible task state, screen-reader status announcements, mobile proposal tables with readable scroll, print/download accessible owner guide. Forms must preserve drafts and present validation errors without exposing financial or resident data.

## 10. Engineering implementation work packages

| Package | Proposed files / extension | Completion evidence |
|---|---|---|
| P0 — Domain contract (on this branch) | `packages/domain/co-living-onboarding.ts` plus focused unit tests | Stable stages/guide, gate terminology and no new entitlements |
| P1 — Schema + API | `database/migrations/0065_co_living_onboarding.sql`; `worker/features/co-living-onboarding.server.ts`; guarded router handlers | Local additive D1 upgrade/rollback rehearsal, permission denial tests |
| P2 — Client experience | new route files `co-living-onboarding-*.tsx`; extend `co-living-directory.tsx`, `property.tsx`, navigation and dashboard | Owner can submit enquiry, inspect progress, read immutable proposal and respond |
| P3 — Operations experience | Staff pipeline, assessment, versioned proposal builder, task and establishment screens | Staff roles restricted; audited and independently reviewed readiness |
| P4 — Integration | Approved leasing/tenancy handoff, docs/notifications, rental fee and utility disclosures | First tenancy only after guards; partial occupancy; no duplicate listing |
| P5 — Release | tests, hosted role acceptance, legal/service sign-off, explicit release governance | Independent environment-specific release approval before any production changes |

Do not add PR #118-like Cash Client pricing or modify global Residential subscription terms while implementing this Co-Living module. A Co-Living proposal is a distinct site-specific engagement.

## 11. Dependencies / remaining business decisions

Before issuing legally binding agreements or activating financial flows, resolve:
1. Licensed entity/agency handling leasing, bond, rent collection, direct debit, Stripe settlement and landlord funds; tested fallback if payment method fails.
2. Utility account holder and supplier-bill settlement, annual allowance timing/pro-rating, owner reimbursement consent and abnormal-bill intervention.
3. Formal Co-Living terms, approved separate $100/$50 charges, cancellation, agreement expiry, scope changes and statutory status of each tenancy.
4. Contractor cleaning scope, included visit limit and approved procurement budget per property.
5. Room use, occupancy/fire requirements and planning/building checks for theatre/study conversions before advertising.
6. Internal independent sign-off authority and when owner delegates limited spending approval.
7. Data/document retention schedule and operational provider readiness.

These are explicit gates, **not** justification to display unverified services as live or charge unapproved rates.

## 12. Merge and acceptance strategy

- Work branch is a **stacked descendant** of PR #118 head. A draft child PR should target `feature/direct-inspection-booking-cash-terms-20261121`, not `main`.
- No direct modifications to PR #118 booking, Cash Client credit, invoice tables, flags or published rates in the specification step.
- When PR #118 advances, inspect comparison for upstream changes to property, booking, router, finance, migrations and testing. Integrate upstream changes intentionally; revalidate exact head.
- Run `pnpm typecheck`, focused Node tests, the applicable `pnpm test`/`pnpm test:schema` and browser/isolated D1 acceptance once implementation exists, followed by independent hosted role testing.
- Production deployment, live provider activation, D1 migrations and client billing require separate approvals.

**Deliverable status on this branch:** proposed functional schema/API/Portal screens, original specification and acceptance matrix, and focused tests are committed. Full multi-room public advertising, integrated document issuance, contractual e-signature, rent/bond/payment processing, completed hosted role acceptance and production release are **not** included.
