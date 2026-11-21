# Commercial Portal — future build/re-activation specification

**Source:** owner-provided `Commercial Portal Build.docx` (20 Nov 2026), original repository `info-rbp/proinspect` main @ `fdb7ef5c3d31`. This is preserved future work, not release approval.

## Product and roles
- One Commercial family, with different authorised experiences for (a) self-managing commercial landlord and (b) reviewed/approved professional asset manager. No duplicated commercial asset or tenant/occupant database.
- Primary object: an authorised commercial asset/premises with source-backed lease history and effective date. Carry selected premises context through work.
- An invited `commercial-occupant` is a narrow personal-issue/occupancy workspace, not a manager: no owner finance, landlord lease rights, arbitrary documents or tenancy permissions.
- Staff Operations is the only system for assignment, delivery, independent QC/issuance, payment exception monitoring and release decisions.
- Verify commercial client-property mandate, date windows, occupant relationship, approved source evidence, release gate and service entitlement on every API action; UI labels confer no rights.

## Customer information architecture
1. **Today / decision centre**: impending option, rent review and expiry windows; owner actions; open operational issues; pending approvals; due attendances; document/report issuance; error and overdue states backed by real source data.
2. **Assets & premises**: verified portfolio selector, asset hub with occupancy, service history, compliance, costs and clearly labelled authorised instructions.
3. **Leases**: approved cited lease-source versions only, critical date/calendar, option/exercise review, obligations, separate reviewer workbench and immutable revision history. No inferred legal effect.
4. **Occupants**: named-premises invitation, acceptance/expiry/revocation; private scoped issues; review and explicit idempotent conversion into canonical Request/Work Order when commissioned by an authorised customer.
5. **Work & inspections**: linked Booking > Work Order > approved scope > assignment/evidence > independent report QC > recipient-safe issued document. Make-good references are condition evidence, not conclusive lease liability.
6. **Approvals/finance**: client/manager financial authority and spend thresholds; separately show ProInspect invoices, proposal review, exceptions, tenant lease charges and source-rule interpretation. Do not treat Stripe success as bank reconciliation or ProInspect invoice as rent.
7. **Reports & communications**: immutable issued version, correct audience grants, timestamps, lease/premises context and outbound delivery failures. No unissued draft or staff-private notes on customer surfaces.

## Engineering work packages retained
- P0 (from COM-001–014): distinct commercial dashboards; contextual navigation; asset hub; source-backed critical-date view; source version state; occupant roster; issue-to-work linkage; approval/finance eligibility; bookings and work progress; cross-client and cross-premises negative tests.
- P1: source-review wizard and financial rule explanation; obligation tasks; managed occupancy change; specialist make-good; multi-asset professional management; controlled recipient-safe documents and status communication.
- P2: advanced lease/portfolio insights only after authoritative history, accepted legal basis and actual usage data.
- Maintain consistent common `PortalShell` and `WorkOrder` contracts rather than forking Staff, authentication, finance or reports.

## Preserved implementation references
- Workspace kind `commercial`, `commercial-occupant`; current `/w/commercial/:scopeId` and `/api/w/commercial/:scopeId` contracts.
- `apps/platform/app/routes/commercial-operations.tsx`, `commercial-occupancies.tsx`, `commercial-applications.tsx`, `commercial-application-detail.tsx`, `occupant-requests.tsx`, `occupant-premises.tsx`, `apps/platform/app/components/CommercialLifecycle.tsx`.
- `apps/platform/worker/features/commercial-operations.server.ts`, `commercial-lifecycle.server.ts`, `commercial-scope.server.ts`, `resident-commercial.server.ts`; commercial public application routes.
- `database/migrations/0043_commercial_lease_operations.sql`, `0049_commercial_source_lifecycle.sql`, `0055_commercial_applications.sql`, `0060_resident_occupancies_and_council_appointments.sql`.
- Relevant tests: `tests/runtime/commercial.mjs`, `tests/runtime/commercial-application.mjs`, `tests/browser/commercial-application.spec.ts`, `tests/commercial-schema.test.py`.

## Reactivation acceptance
- Separate owner and professional role journeys against genuinely authorised premises; no cross-client disclosures; old/ended management denied; commercial occupant negative cases, replay/expiry/revocation covered.
- No automatic commissioning from personal issue, no auto exercise of lease option and no legal/financial action from unreviewed source.
- Source-version lineage, lease rules/critical dates, work, media, immutable issued report and recipient grants evidenced through Staff return journey.
- Provider and legal release approvals, priced product catalogue, finance reconciliation, controlled migrations and isolated data restoration all independently accepted on an exact deployed SHA.

**Pause boundary:** no public Commercial marketing, new commercial signup, new commercial paid subscriptions, new commercial listings/applications or specialist-sector dispatch in the Residential launch. Pre-existing records/cases require audited access/retention and a case-by-case offboarding plan rather than destructive deletion.
