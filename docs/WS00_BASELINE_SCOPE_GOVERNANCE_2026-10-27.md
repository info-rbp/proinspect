# WS00 — Baseline, scope reconciliation and governance
Audit date: 2026-10-27 (Australia/Perth). Status: evidence gathered; independent scope and acceptance approvals outstanding.
Repository: info-rbp/proinspect. Protected baseline: `b633b75ce2a75b84848c780eba0a82d559755518`.
This document records **read-only live observations** and historical source claims separately. It is not a production launch approval.

## G01 — Reverified live baseline
- GitHub main: `b633b75ce2a75b84848c780eba0a82d559755518` (verified live).
- Open PRs: zero (verified live). Historical branches remain; branches alone do not imply unmerged functionality.
- Cloudflare production Worker `proinspect-platform`: last deployment 2026-10-27T04:15:24.603541Z, 100% traffic; BUILD_SHA matches main.
- Cloudflare staging Worker `proinspect-v3-staging`: last deployment 2026-10-27T04:11:23.83134Z, BUILD_SHA `770d24c67d533d5fa7ada2dd755594da44c561d3`; historical review established identical Git tree to production.
- Production Worker DB binding: `proinspect-platform-data` (`dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea`). **Do not confuse with** legacy `proinspect-platform-production` database, which has only two migrations.
- Staging Worker DB binding: `proinspect-v3-staging-data` (`e66b8ebc-637d-4737-8d47-b0fbec3c082c`).
- Read-only SELECT of each deployed D1 database: 46 entries in `d1_migrations`; newest `0046_pcr_discount_reservations.sql`. `PRAGMA foreign_key_check`: zero rows on both.
- Earlier postmerge verification `40448615320` (47/47 browser passes) and read-only production observation `40450157938` remain **historical recorded evidence**; not re-run in this audit.
- No schema, production switches, sensitive settings, payment transactions or customer records were modified.

## G02 — F01–F20 source-to-acceptance ledger
“Integrated” means present in reviewed source / recorded CI, not provider/operational acceptance.

| ID | Integrated baseline | Remaining gate | Classification |
|---|---|---|---|
| F01 | Canonical D1/API, collision-free additive migrations through 0046 | Preserve migration controls | Integrated; monitor |
| F02 | Exact-source staging, D1/R2/queue foundations | Real credentials and hosted restore/recovery | Acceptance blocked |
| F03 | Guest verification, quotes, price checks, Work Orders, PCR benefit lifecycle | Approved services, areas, capacity, real transactions | Commercial/provider gate |
| F04 | Sandbox billing, subscriptions, signed events, refunds/disputes | Live provider acceptance; credit/settlement/accounting completion | Engineering + acceptance |
| F05 | 9 workspace structures, isolated regressions | Genuine hosted role logins/positive/negative/revocation | Acceptance blocked |
| F06 | Native editor, draft/evidence/QC/issue, bounded PDF/offline | Full upstream templates/layout/annotations/media/font parity and bridge | Engineering required |
| F07 | Strata scheme/assets/works/approvals foundations | Multi-scheme accepted journey | Acceptance blocked |
| F08 | Professional Building Manager portal/delegation | Genuine delegated-role acceptance | Acceptance blocked |
| F09 | Council/Resident notices and recommendations | Audiences, revocation, approved communications | Acceptance blocked |
| F10 | Agency owner invitations and statement foundation | Real handoff, approved agreements and billing | Acceptance blocked |
| F11 | Rental intake, restricted records, scanner/handoff adapters | Actual scan/provider delivery and retention policy | Provider/legal gate |
| F12 | Seven legal drafts, 23 scopes, receipt enforcement | Authoritative approved publication and conflict resolution | Business/legal gate |
| F13 | 32-form specification, Forms Centre, signing draft | Official form bytes/mapping, real signing/lawful service | Engineering/legal/provider gate |
| F14 | Noncustodial bond/restricted cases, rent evidence | Confidential governance; direct custody is NOT implemented | Legal/scope decision |
| F15 | Resend/Calendar/scanner/Apps Script/signing/report adapters | Genuine provider acceptance and failure flows | Provider gate |
| F16 | Direct-payer records, guarded Connect sandbox | Onboard recipients, reversals, payout-failure tests | Provider/commercial gate |
| F17 | Marketing UI and publication register | Media rights, accurate published terms, accessibility | Publication gate |
| F18 | Commercial critical dates/obligations/make-good | Lease renewal/accounting and agreed specialist flows | Engineering required |
| F19 | Agency billing accounts/statements/invoice previews | Credits, settlements, accounting and finance acceptance | Engineering required |
| F20 | Exact-source CI, migration safeguards, audit evidence | Hosted restore, alerts, owner assignment, handover | Operations gate |

Basis: `docs/FINAL_SPRINT_EXECUTION_2026-10-26.md`, `docs/BUILD_STATUS.md` (its older sections are historical), `docs/PORTALS.md`, PRs #53/#55/#57/#56, Issue #54, and the 2026-10-27 final sprint review. Next stage must attach exact code path/API/test links per F-ID for implementation-level traceability.

## G03 — Historical commitment disposition, subject to product approval
| Item | Historical evidence | Current assessment | Decision needed |
|---|---|---|---|
| V4 advanced catalogue | `ProInspect-V2` branch, 174 SKU references / 40 request routes in `version-4-guest-booking-finalisation`; source review shows 23 public service descriptions | Reference/SKU catalogue is NOT an approved 174-service public catalogue; advanced features may be frozen | Decide subset retained, superseded or deferred; do not publish prices by assumption |
| Unified Residential/Commercial owner portfolio | `feature/owner-portfolio-20261017` historically had backend aggregation, UI placeholder | Not certified integrated or complete at current head | Retain, defer, or supersede; if retained build and acceptance required |
| Open Home next-day report | `feature/open-home-check-in` recorded 09:00 Australia/Perth next-day automation; deployed `OPEN_HOME_REPORTS_ENABLED=false`, provider `resend` | Deployed automation not accepted for actual delivery | Verify incorporated code, one-per-session dispatch and live authorised recipient |
| Leasing management UI | `Leasing` branch recorded staff APIs but missing dedicated UI | Current UI parity unverified | Determine whether retained; inspect actual route and build UI if missing |
| Residential vs Commercial Tenant journeys | `docs/PORTALS.md` lists common Tenant experience; historical commercial differences discussed | Independent Commercial Tenant parity unverified | Define and approve explicit requirement matrix |
| Nine-portal vs narrowed scope | Current `docs/PORTALS.md` lists original eight; final scope includes Building Manager ninth | Nine are currently the recorded engineering/acceptance target, not blanket authorisation for launch | Product owner affirm nine-portal full scope vs explicitly narrower phased launch |
| Open Home transport | Historic Cloudflare Email Sending proposal; later deployed `OPEN_HOME_REPORT_EMAIL_PROVIDER=resend` | Email transport choices evolved | Approve Resend as canonical; don't recreate Apps Script for the Open Home attendance report |

## G04 — Decision register (no decisions manufactured)
D01: Full nine-portal scope and whether phased activation is allowed — Product owner.
D02: Active 23-service catalogue vs legacy 174 reference/SKU/40 request catalogue — Product/finance.
D03: All-inclusive automatic entitlements vs paid property subscription and quarterly vs twice-yearly rights — Business/legal.
D04: Unified owner portfolio and Commercial Tenant experience — Product.
D05: Leasing Staff UI and next-day Open Home report — Product/operations.
D06: Direct custody of rent/trust/bond and V4 specialist operations — Business/legal.
D07: Official legal docs/forms, pricing and media — Approved human owners.
No approval has been represented as given; tracked tasks remain open.

## G05 — Production and staging feature flag inventory
Live read-only Cloudflare settings show production and staging default OFF for guest bookings, agency owner invites, building operations, commercial operations, council governance, contractor payments, legal acceptance, notice lifecycle, Open Home reports/Sheet sync, reconciliation, PCR launch/discount/sample, rental applications/Apps Script/scanner/retention, restricted workflows, WA signing/bonds, sale variants, Stripe Checkout/billing/Connect/refunds/portal and other financial switches.
Production `GOOGLE_CALENDAR_ENABLED=true` is read-only connectivity; `GOOGLE_CALENDAR_BOOKINGS_ENABLED=false`. Staging `EMAIL_PROVIDER=local`; production `EMAIL_PROVIDER=resend`. Open Home email provider configured `resend` while delivery gate OFF. Production and staging preserve encryption/key bindings; never disclose or rotate during WS00.
Activation authority for EVERY OFF flag: named independent release owner upon documented business/legal/provider/UAT acceptance. Rollback: revert corresponding feature flag to OFF using approved guarded procedure; do not change live switches in WS00.

## G06 — Tracking
Master: Issue #54. Individual WS00 G01–G07 tracking issues and linked acceptance evidence in GitHub, with subsequent workstream tracking after G04. Preserve original F IDs. Each task needs owner function, dependencies, acceptance evidence, environment, source SHA, reviewer and state.
Known related issues: #22 hosted acceptance, #40 reporting, #36 release activation.

## G07 — Required independent governance, not yet signed
Product owner: scope & priorities; Engineering lead: source/code/CI; QA lead: independent test evidence; Finance: pricing, payments, tax; Legal/privacy: agreements, statutory forms, disclosure; Cloudflare operations: runtime/restoration; Provider owners: live sandbox credentials; Release owner: separate feature-level activation.
Names, accountable identities, approvals and sign-off timestamps are **pending**. GitHub authenticated user `info-rbp` is a technical account identity, not proof of any of those independent business roles.

## WS00 exit
G01 live baseline evidence collected. G02 F-level mapping documented, but path-level links not complete. G03 historical commitments classified provisionally. G04 business decisions pending. G05 live flag inventory captured, per-flag formal activation/rollback owners pending. G06 task tracking in progress. G07 approvals pending.
**WS00 remains OPEN until independently approved and exact-code-path traceability completed.**