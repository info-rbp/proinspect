# ProInspect — final product completion and production deployment sprint
**Prepared:** 8 November 2026 (Australia/Perth)  
**Status:** implementation baseline and release plan, **not** a declaration of operational acceptance  
**Source of truth:** `info-rbp/proinspect`, `main` at `9b4aea9a65506604e3732858f2c31ebeb7445f42` (after PR #81)  
**Related:** #54, #80, #65, #66, `docs/handbook/task-register.md`, `docs/DEPLOYMENT.md`, `docs/PORTALS.md`, `docs/residential-subscription-commercial-terms-draft.md`

## Operating decision: one production environment, controlled live activation
- GitHub `main` -> Cloudflare Workers Builds -> **existing** `proinspect-platform`, serving marketing and authenticated application together. No newly provisioned staging or sandbox Workers, D1 or R2 resources are part of this programme.
- Perform type checks, unit/runtime/browser tests, static source review, SQL migration simulation and deployment dry-run in GitHub CI or ephemeral **local** test runtimes with fixtures. These are automated checks, not persistent deployed test environments. **Do not execute destructive test scenarios in production customer records.**
- Maintain a protected `main` (required CI and code review), small feature PRs, append-only migrations and backwards-compatible releases. Never deploy unreviewed changes to production or apply migrations without a resource identity check, restore point and schema verification.
- Live Stripe configuration belongs to the **existing live Stripe account**. Prepare product/price/webhook/portal settings in live mode without executing chargeable transactions until authorised. Use Stripe-hosted Checkout and signed webhook fulfillment; a Checkout success redirect is not payment evidence.
- Keep operational gates off until source-bound acceptance. Rollout follows **deploy -> migrate -> verify -> approve -> activate**, with zero automatic enrollment/charges from ordinary registration.
- Production validation can use read-only checks and controlled, expressly authorised internal transactions. A zero-customer-impact verification path is required for refunds/disputes, delayed and duplicate webhooks, negative authorisation, device-loss/offline recovery and disaster restore. Where such verification cannot be safely done in production, retain the gate closed rather than imitate completion.

## Stage overview and dependencies
| Stage | Focus | Prerequisite | Tangible exit |
| --- | --- | --- | --- |
| 0 | Freeze, reconcile and consolidate | Current `main` | One numbered backlog, collision-free integrations, protected release baseline |
| 1 | Account registration, plans and live billing | Stage 0 | Account without payment; opt-in later upgrade; approved live billing and entitlement flow |
| 2 | Portal design and navigation | Stage 0 | One design system and tidy role-specific navigation across nine portals |
| 3 | Marketing information and conversion | Stages 1–2 contracts | Accurate published pages, account CTA, service/price terms and lead capture |
| 4 | Core service/reporting/financial/legal completion | Stages 0–2 | Complete canonical Work Order-to-issued-report flow and retained specialist scope |
| 5 | Integrations, security and operational hardening | Stages 1–4 | Verified live configurations, incident/recovery controls and nine authentic role journeys |
| 6 | Production release and commercial readiness | Stages 0–5 | Documented exact-source approvals, feature activation and monitored public launch |

## Stage 0 — source-of-truth foundation and unmerged branches
**Current:** PR #81 already merged into `main`, adding migrations `0049–0051`. PR #80 is open on the latest base and includes its own **`0052`** migration; its exact head `37ba7f63` passed GitHub verification [run 42455463697](https://github.com/info-rbp/proinspect/actions/runs/42455463697). Earlier 0049 collision reports are historical after the PR #80 rebase. Production Worker source readback now matches `9b4aea9a`; this does **not** certify new database migrations.
1. Resolve PR #80 by reviewing its permission checks, lifecycle triggers, exact head CI, production schema reconciliation and feature-gate assumptions. Merge only when confirmed; **do not enable** rental handover/tenancy signing.
2. Treat PR #66 as superseded by merged PR #81 subject to line-by-line retained-feature reconciliation; do not merge stale code. Keep PR #65's governance content as evidence but refresh its 46-migration baseline and approvals before merge.
3. Reconcile historic V2/V3/V4 and reporting branches by **feature ID**, not by blindly merging old commits; record `integrated | superseded | retained pending | excluded by approved decision` in the task register.
4. Re-map all 110 handbook items to specific portal, source path, test, business owner and independent acceptance. No CI result or deployed route automatically changes a task to `accepted`.
5. Add required CI and review controls for `main`, verify exact commit ID before production deployment, retain schema and data recovery checkpoints.

**Exit:** single current `main` candidate, no unresolved duplicate migration numbers, complete scope/branch dispositions, feature flags documented and release owners assigned.

## Stage 1 — register first, subscribe later
**Experience:** `Explore services` -> `Create free account` (email magic link) -> `Choose relationship` -> `Add/verify property` -> `Account dashboard` -> `Compare plans` -> `Subscribe` **only if opted in**.
1. Preserve one verified identity, invitations and independent owner/agency/tenancy/scheme authority; creation of an account does not give access to unverified property records.
2. Split `account_status` (registered/verified/active) from `subscription_status` (none/pending/paid/past_due/cancel_at_period_end/ended) and `property_entitlement`. Do not infer paid access from an active account or a legacy `all_inclusive` row.
3. A new registered account should have **no payment method, invoice, automatic recurring payment, or subscription benefit by default**. Allow free account features, property setup (subject to authority), profile, enquiries, one-off purchases and upgrade visibility; gate paid-included services.
4. Existing `all_inclusive` customers are grandfathered and not migrated, invoiced, suspended or charged by visiting a subscription page. Record origin and approved transition policy, with explicit customer opt-in.
5. After property verification, offer an optional subscription card in Account/Billing and a contextual `Subscribe` CTA for eligible residential properties; keep one-off services possible where eligible. A successful subscription requires explicit terms, live Checkout, verified signed webhook, settled first invoice and accurate paid-through entitlement. Do not rely on redirect, future invoice or customer self-assertion.
6. Draft commercial terms currently describe **AUD $50 ex GST per property per week**, first charge on eligible Friday (AWST), and a proposed 72-hour recovery grace. Obtain signed approval for coverage/limits, tax, cancellation, Friday schedule, historic account rules and coverage of 48 claimed inclusions before presenting as final.
7. Make the pricing/plan page truthful while live billing is gated; if no approved live purchase path, show a clear non-deceptive availability message.
8. Live Stripe: existing `Residential Property Support Subscription` weekly AUD 50 price is present, but currently has an unsuitable `txcd_10203001` product tax code, the price has `tax_behavior=unspecified`, and **no webhook endpoints** were found. Stripe Tax settings are `active`, but verify actual Australian GST registration/tax calculation and adopt an approved service tax code before any live invoices. Use least-privilege credentials in Cloudflare secrets and signed, idempotent webhooks. Configure only authorised destinations and event types.
9. Scope payment handlers to approved account/property, keep direct rent/bonds/trust money separate, and record credits, cancellations, disputes and reconciliations as immutable events.

**Exit:** a real customer can register without buying, add their own property with correct authority, return later, choose a plan voluntarily, pay through live Stripe and receive only actually paid entitlements; cancellation and failure are handled safely.

## Stage 2 — professional visual system and simpler portal menus
**Design direction:** restrained corporate visual language. Neutral ink/white backgrounds, consistent type scale, one primary brand accent, modest radii, consistent tables and forms, compact spacing, no emoji navigation, fictitious icons, excessive gradients or repetitive decorative cards. Genuine inspected photographs only with approval; use real evidence-led reports and clear operational copy.
1. Inventory nine workspaces and build one reusable navigation registry with role, relationship and flag checks; server-side authorisation remains authoritative.
2. Primary left menu targets **5–7 visible destinations** per role: `Overview`, primary entity (`Properties`/`Schemes`), `Bookings/Work`, `Requests`, `Reports & Documents`, `Billing/Decisions`, plus `More` for specialist tools. Staff gets `Today`, `Schedule`, `Work Orders`, `Reports`, `Clients & Properties`, `Finance`, `More`.
3. Place less frequent specialist, compliance, legal, market-pack and integration functions in collapsed groups with clear labels; do **not** remove underlying routes, deep links or accessibility. Selected group opens automatically; keyboard focus and screen reader labels must work.
4. Put account, notifications, workspace switch and sign out in a consistent top header/profile menu, not duplicated across every side rail.
5. Standardise headings, page actions, filtering, status labels, tables, empty states, confirmation dialogs and responsive 320/390/768/1100/1440 views. Dense desktop data tables may use horizontal scroll; mobile uses summaries and row expansion.
6. Verify visible navigation only for authorised capabilities, no leaking unapproved features. No menu-only security.

**Portal navigation mapping:** Landlord (`Overview, Properties, Inspections, Requests, Reports, Billing`); Agency (`Overview, Portfolio, Schedule, Work Orders, Reports, Finance`); Commercial (`Overview, Assets, Lease dates, Inspections, Reports, Finance`); Strata (`Overview, Schemes, Work Orders, Notices, Reports, Decisions`); Tenant (`Overview, My tenancy, Inspections, Requests, Documents`); Building/Resident (`Overview, My building, Requests, Notices, Documents`); Council (`Overview, Proposals, Decisions, Works, Documents`); Building Manager (`Overview, Facilities, Works, Notices, Reports`); Staff (`Today, Schedule, Work Orders, Reports, Clients, Finance`).

**Exit:** consistent professional appearance and responsive behaviour, no loss of portal authority or routes, usability approval for each role.

## Stage 3 — marketing as a product journey
**Deployment:** unified marketing site already resides in the production `proinspect-platform` Worker; do not create a second marketing deployment or duplicate routing.
1. Homepage in plain language: what ProInspect does, for whom, geographic coverage, actual deliverables, one-off vs ongoing, and two clear actions `Explore services` and `Create account`. Give a separate `Request a service` path for non-registered customers.
2. Service pages: retain 23-service catalogue, describe scope, exclusions, required instruction, typical deliverable, turnaround only when approved, photo/document examples only when rights-cleared, and real booking vs quote availability. No arbitrary prices.
3. Residential support: explain AUD $50 + GST weekly *only after contractual/tax approval*; distinguish account registration, separately opted-in subscription, existing grandfathering, eligibility, booking limits and availability. Avoid implying free account includes 48 paid services.
4. Sector pages: landlord, agency, commercial asset, strata/buildings. Show relevant workflows, not every portal in one undifferentiated list.
5. Navigation: `Services`, `Who we help`, `How it works`, `Resources`, `Contact`, with prominent `Sign in` and `Get started`. Avoid duplicate CTAs with conflicting destinations.
6. Leasing: explain that ProInspect attends and collects information on behalf of authorised lessors/agents; property decision remains theirs. Respect agency-approved external application URLs.
7. Publish only reviewed privacy, terms, copyright-cleared property photography, approved client examples and accessible material. Record WCAG 2.2 AA and mobile review. SEO canonical `proinspect.systems`, proper sitemap, page-level descriptions, and consent-safe analytics.
8. Provide HubSpot-ready optional lead adapter schema, not a mandatory HubSpot dependency: lead event UUID, timestamp (AWST/UTC), enquiry type, source/UTM, consent marker, service, account reference (if authorised), dedupe and event receipt. Never automatically upload tenancy, rental applicant or restricted-case personal records. Existing HubSpot account is configured in **US/Eastern, USD** and not onboarded; normalise its time zone/currency to approved Australian settings before any CRM synchronization. Keep existing Staff enquiry queue authoritative until optional CRM handoff is accepted.

**Exit:** marketing copy mirrors actual functionality; visitors can take an honest next action, register, request or later subscribe without misleading promises.

## Stage 4 — finish core and specialist workflows
**Common service transaction:** `service intent -> price/coverage authority -> booking -> canonical Work Order -> assignment -> field evidence -> independent report QC -> issued private document -> signed communications -> billing/reconciliation`.
- **Staff/Admin:** daily action centre, calendar and inspector assignment, grouped operational queues, invoice credits/adjustments, review decisions, provider failures/replay and commercial release controls.
- **Landlord:** property onboarding/identity, own tenants/forms, eligible booking, inspection history, maintenance instructions, reports, clear subscription status and one-off charges.
- **Property Manager:** authority-based owner/agency relationships, property portfolio/team, imports, recurring/bulk bookings, budgets and consolidated invoices.
- **Commercial:** PR #81 lease commencement, variations, renewals, critical dates, outgoings, make-good, disputes and source-linked evidence; accept full representative lifecycle.
- **Strata Manager:** schemes/lots/common property, resident and council separation, works, approved notices, service proposals, invoices and reports.
- **Building Manager:** facilities, access, contractor records, movements, defect tracking, planned maintenance and building notices.
- **Tenant:** verified invitations, private tenancy records, requests, PCR response, approved forms/bond records and confidential cases where authorised.
- **Building/Resident:** own lot and common-property request routing, notices, work status, access/move questions; no cross-tenant disclosure.
- **Council:** proposals, recommendations vs decisions, dated authority and council-only documents.
- **Reporting:** complete original template and layout catalogue, photo annotation, Unicode/branding PDF fidelity, offline resumable capture, large-media recovery, historical PCR mapping, golden visual regression and independent reviewer.
- **Legal:** official WA Form 1AA bytes/field maps and multi-signer acceptance, bond coordination without custody, notice procedure, Form 2 confidentiality, data retention/deletion, signed authority, and rental application scanning/handoff; no feature activation on source-only evidence.

**Exit:** all advertised journeys complete and their actual output/failure states verified.

## Stage 5 — integrations and production hardening
- **GitHub:** required CI, schema sequencing, build source SHA, review, smoke and permission tests; no automatic unchecked `main` merging.
- **Cloudflare:** existing production D1, R2, restricted R2, Queues/DLQ, Durable Objects and scheduled workers. Confirm production binding UUID, backups/bookmarks, append-only SQL, zero FKs, row-count preservation, mail dispatch and rollback. Cloudflare Worker rollback **does not undo** DB migrations.
- **Stripe live:** accepted price/tax mapping, restricted keys, webhook destinations/signatures, customer portal, dunning/retries, payments, invoices, credits, refunds/disputes, reconciliation; collect no payment until signed review. No actual charge/refund/dispute as an unapproved test.
- **Email/Calendar/providers:** Resend live sending and bounce/complaint, Google create/update/cancel/conflict, provider scanner receipts, Apps Script signatures, signing and Report Tool callback. Record provider failure and replay proofs.
- **Security:** all nine hosted, independently authenticated user journeys, overlapping identity and revoked permission checks, R2 document grants, worker logs redacted, rate limiting, Turnstile, financial audit and restricted support.
- **Recovery:** recover exact D1/R2 snapshot and queue state in a local or specially authorised isolated restore exercise; production read-only checks do not demonstrate recovery. When an isolated restoration is prohibited, record the incomplete recovery gate and do not claim full acceptance.

**Exit:** live-ready provider/permission/recovery evidence, named owners for alerts and financial exceptions.

## Stage 6 — controlled release and sign-off
1. Freeze source commit + exact migration manifest + accepted price/service/terms version.
2. Merge approved feature PRs into `main`; let existing Cloudflare Workers Builds deploy. Read back source SHA and Worker bindings; no separate staging infrastructure.
3. Take D1 bookmark and verify R2 inventory; apply the exact pending additive migrations to the correctly identified production database; confirm integrity and retention. Halt activation if migration/restore guard fails.
4. Complete non-invasive smoke tests for public site, registration, sign-in, account/property, cross-role denial and current features. Paid provider live actions require separately documented authorisation.
5. Obtain product, legal, security, finance and operations sign-off per capability. Turn on only the associated flag after the evidence is captured. Other flags remain off.
6. Monitor error rates, payment/webhook reconciliation, failed emails, queue depth, bookings/report issuance and revenue support queue. Keep rollback instructions and schema forward-fix ready.
7. Reconcile all `docs/handbook/task-register.md` entries and #54 with direct evidence; independently accepted only when actual approval exists. Distinguish `market-ready scope` from `full retained product`.

## Definition of done (per work package)
- Requirement and accepted scope, owning portal and user, permission boundary and UX specification.
- Reviewed implementation, exact-head CI, migration integrity, production-safe rollout/rollback.
- Positive/negative/edge case coverage, real provider evidence where needed.
- Marketing and customer contractual copy agrees with implemented entitlement.
- Business owner + independent acceptance evidence at exact source commit.
- Observability, operational support process and known exclusions recorded.

## Immediate executable backlog
1. Review / merge #80 on latest `main` after verifying schema `0052`; do not enable handover.
2. Resolve #65 (refresh governance), close #66 as superseded after auditing changed features.
3. Make `main` branch protected; enforce CI and reviews.
4. Decouple account creation from paid subscriptions, retain grandfathered accounts; add account Billing/Upgrade action.
5. Reconcile live Stripe product tax code and existing recurring price; establish webhook endpoint and restricted Worker secrets after approval.
6. Build compact role-specific nav and consistent design tokens; run browser navigation tests.
7. Revise homepage, onboarding, 23 service pages, subscription copy and media approvals.
8. Finish original report template/photo/PDF/offline parity, Staff action centre, finance corrections, WA legal handoff.
9. Prepare HubSpot adapter but leave CRM synchronisation off.
10. Prove production-source/DB/role/provider/recovery gates and activate only signed-off features.

## Explicit non-goals in this sprint
Do not provision new staging/sandbox infrastructure; do not manually alter existing customer records to simulate acceptance; do not auto-charge users at registration; do not operate trust/rent/bond custody; do not silently change grandfathered terms; do not publish unapproved statutory documents or commercial claims; do not declare source-only CI as provider or release acceptance.
