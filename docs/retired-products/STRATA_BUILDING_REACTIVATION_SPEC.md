# Strata, Building Management and Council — future build/re-activation specification

**Sources:** owner-provided `Strata Portal Build.docx`, `Building Management Portal.docx`, and `Strata Services.docx` (Nov 2026); master `Portal Engineering Build.docx`. Historical source branch main @ `fdb7ef5c3d31`. Spec describes future functionality, NOT production availability.

## Distinct backend authority scopes
- `strata-manager`: verified scheme management mandate, common-property operations, notices, financial instructions within actual delegation. Manager is not automatically statutory decision-maker.
- `building-manager`: separately requested and independently approved building-specific professional assignment, dated/revocable, limited to facilities items, access/moves, authorised draft notices and explicitly granted building reports. Cannot gain client billing, council vote, unrelated building, private tenant/lot files or appointment verification.
- `building`: invited/verified building/lot resident or member, private own issue and authorised building updates only.
- `council`: independently reviewed council appointment and term-limited membership, advisory/appropriate delegated actions only. Online recommendation is NOT a statutory vote or final approval.
- `staff`: actual operational assignments, independent document/notice review and authorised release functions.

## Strata Manager experience
1. Scheme-centred dashboard showing verified schemes, due common-property work, overdue notices, approvals, communications and decision boundaries; fix `overview.tsx` early-return that serves generic `ClientDashboard` instead of intended scheme view.
2. Scheme > buildings > lots/common areas as immutable context; schemes and scheme detail with service/activity tabs, linked work and member-specific views.
3. Common-property vs inside-lot request triage with explicit human review where classification ambiguous; no automatic cost liability or contractor instruction.
4. One canonical Request, Booking, Work Order, evidence, independent QC and issued report chain through Staff.
5. Council appointment, recommendation, conflict, delegated spending and statutory action remain different stages; verify relevant authority, time window and independent decision.
6. Draft > independent review > published notices, target audience, delivery/expiry/retry tracker. Keep publication separate from creating a draft.
7. Facilities: asset register, planned works, contractor checks, keys/fobs, moves and amenities only in approved, scoped releases; transparent approval and audit.
8. Issued documents only to proper recipient grants. Do not infer access from scheme address or current resident status.

## Building Manager experience
- Replace structurally empty overview projections: generic `expandedWorkspaceData` returns `schemes:[]`, `requests:[]` and `workOrders:[]` while `overview.tsx` derives three misleading headline counts. Use a verified `buildingDashboard` read model, not broad-scope cross-scheme arrays.
- Create `BuildingManager Today`: assigned buildings with effective dates, daily issues, due contractor attendance, scheduled maintenance, upcoming moves and draft notices awaiting independent approval.
- Partition oversized Facilities page into daily item queue, planned works, shared assets, access/moves, physical key/fob handovers, notices and granted issued reports. Show human-readable states, not just raw IDs.
- Link work commission to canonical Request/Work Order with actual delegation and spend approval; cannot approve own notices or reveal unrelated resident data.
- Approved assignment requested/reviewed/revoked in Staff; date, authority provenance and effective scope visible read-only in Building Manager.

## Resident & council experience
- Verification of exact lot/building relationship; invitation and revocation safe against wrong recipient and expiry.
- Personal issue/request, notices and published updates share only allowed audience. Family, tenancy, finance, restricted cases and other members' details remain inaccessible.
- Council appointment period and decision context are explicit; member recommendation is not a formal scheme outcome; final notices require reviewed publication.

## Future commercial catalogue
The proposed `Strata Services.docx` presents **three tiers** (Essential, Managed, Complete) and building services including building management, presentation/cleaning, landscaping, pool and system coordination, asset care, safety/security, maintenance/capital works and resident services. These are **draft proposals**, not active plans, certified trades, licenses or approved response guarantees. Keep catalogue, legal delegation, qualified-provider roles, actual labour/material costs and acceptance independent from marketing copy.

## Source map / implementation work
- `/w/strata-manager/:scopeId`, `/w/building-manager/:scopeId`, `/w/building/:scopeId`, `/w/council/:scopeId` and matching APIs with exact guards.
- `apps/platform/app/routes/schemes.tsx`, `scheme.tsx`, `facilities.tsx`, `building-communications.tsx`, `council-appointments.tsx`, `community-updates.tsx`, `amenities.tsx`.
- `apps/platform/worker/features/strata.server.ts`, building operations/assignment services; `database/migrations/0039_building_management.sql`, `0040_notice_and_council_governance.sql`, `0060_resident_occupancies_and_council_appointments.sql`.
- Backlog identifiers from source: `STR-*` Strata, `BLD-*` Building Manager, `RMM-*` Resident & Member, `SYS-*` shared shell/release; retain original task register correspondence for future issues.

## Reactivation test and release gates
- Independently authenticated positive and negative journeys for Strata Manager, Building Manager, building Resident and Council with multiple unrelated schemes/buildings/lot assignments.
- No access via forged scope or expired assignment; no draft/financial/private leakage; no self-approval; no notice automatically legally served by booking.
- Scheme-specific and building-specific read models backed by actual records; linked controlled work case and immutable issued evidence.
- Product/licensing/insurance/legal approval, provider acceptance, recovery of D1/R2/DO/queues, privacy/retention and exact-SHA signed independent acceptance.

**Residential pivot:** stop new Strata/Building/Council public acquisition and related customer actions through server-enforced retirement gates after existing-customer inventory and lawful case closure. Keep historical records behind restricted legacy access/export per retention rules. No dropping applied schema or object storage.
