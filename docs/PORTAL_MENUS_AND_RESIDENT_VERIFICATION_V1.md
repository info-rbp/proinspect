# ProInspect — Portal menu and Resident verification contract

**Specification:** PI-NAV-MASTER · **Version:** 1.0.0 · **Date:** 2026-11-16
**Branch:** `feature/modular-onboarding-resident-invitations-20261116`
**Status:** Development; not independently accepted or deployed.

## Operating model

There are **four customer-facing portal families**: Residential, Commercial, Strata, and Resident & Member. A fifth, ProInspect Operations, is restricted to separately provisioned staff.

One verified identity can have several property/organisation memberships. The navigation displays the underlying *authorised workspace*, not a union of permissions. The original nine workspace permission scopes remain intact. An additional, deliberately narrow `commercial-occupant` scope is introduced, so there are now ten server-side workspace kinds while keeping four customer-facing families.

Every workspace shares account/sign-in security and the My ProInspect workspace switcher. Menus are presentation only; every loader, action, API, document download, and invitation checks current server-side grants and effective dates.

## Menu profiles and primary destinations

Every menu profile has a stable tag so navigation can be revised independently of onboarding and product-booking logic.

| Navigation tag | Workspace user | Primary menu (shown in order) |
| --- | --- | --- |
| `NAV-RES-OWNER` | Residential private landlord | Overview; My properties; Requests; Tenancies & forms; Issued reports; Billing & reconciliation |
| `NAV-RES-AGENCY` | Residential agency/property manager | Overview; My properties; Portfolio operations; Tenancies & forms; Work orders; Issued reports; Approvals & payments |
| `NAV-COM-MANAGER` | Commercial owner/asset manager | Overview; My properties; Lease obligations & dates; Occupants & invitations; Requests; Issued reports; Approvals & payments |
| `NAV-STR-MANAGER` | Strata management organisation | Overview; Schemes & buildings; Work orders; Invite residents & members; Council appointments; Approvals & payments; Issued reports |
| `NAV-STR-BUILDING` | Delegated building/facilities manager | Overview; Building operations; Notice drafts; Authorised building reports |
| `NAV-INV-RES` | Residential tenant | Overview; My tenancy & forms; Inspections; My requests; Documents & reports |
| `NAV-INV-COM` | Commercial occupant/contact | Overview; My premises; My requests |
| `NAV-INV-STR` | Building resident or lot owner | Overview; My building; My requests; Documents & reports; Building operations (only within allowed scope) |
| `NAV-INV-COUNCIL` | Verified strata council member | Overview; Schemes & buildings; Council decisions; Issued reports; Documents & reports |
| `NAV-OPS` | ProInspect Operations | Today; Schedule; Work orders; Reports; Clients & properties; Finance |

**Additional conditional menu items** live under searchable **More tools**, not on the initial navigation:

- Residential owner: inspections/booking history, inspection plans, resident invitations, work orders, documents, service agreements and account tools when authorised.
- Residential agency: resident invitations, property assignment/team access, outsourcing, owner visibility, managed applications, documents, contractor payments, billing and reporting.
- Commercial manager: occupancy invitations and requests, portfolio operations, documents, team access, contractor payments, reports, billing and approved commercial leases.
- Strata manager: facilities, notices and communications drafts, document operations, team access, reporting, billing and scheme administration.
- Resident & Member: strictly membership-specific requests, notices, inspection information and issued documents. No generic landlord, contract, billing or personnel tools.
- Internal Operations: the review queue for council appointments, approved professional applications, documents, restricted operational modules, billing reconciliation and integration diagnostics only for their underlying staff role.

For **commercial occupants**, the only new operational functions are limited premises visibility and personal submitted issues. Other resident features (e.g. shared commercial notices, files, appointment access) require separate explicitly verified data grants and are not displayed as functional links. The commercial occupant cannot open general `/records`, `/bookings`, `/finance`, `/documents` or another client's workspace.

## Commercial occupant invitation and access

**Tag:** `ONB-INV-COM v1.1.0`.

1. An owner or authorised commercial organisation administrator selects **an existing commercial property in their own workspace** and records the precise premises, contact email, relationship type and supporting occupancy/access authority reference.
2. The server verifies the organisation membership and current commercial property relationship. Email address or matching street address alone is never sufficient.
3. An expiring, single-use email invitation is issued. Recipient registration is through the existing ProInspect verified identity flow, with no public Resident self-registration.
4. On acceptance, the server revalidates the inviter's current administrator authority, property sector, property management relationship, invitation expiry and recipient email before creating the occupancy membership.
5. `commercial-occupant` is a distinct authorisation scope. It does **not** become a residential tenancy, a scheme/lot membership, a commercial lease administrator or an owning client.
6. The recipient sees only the associated premises and requests they themselves submitted. An authorised manager may review/close those requests inside their own commercial account.
7. Ending the occupancy or its term revokes workspace access. Pending invitations are revoked and historical request records are retained for the authorised manager's operational history.

The new relationship is independent of any existing commercial lease workflow, so a non-tenant contractor or employee cannot receive a residential tenant grant.

## Strata council appointment verification

**Tag:** `ONB-INV-COUNCIL v1.1.0`.

1. The authorised strata manager nominates a member against an existing scheme, supplying the invited email, term end, optional lot and **appointment evidence reference**.
2. This creates a `pending` council appointment review, **not a council invitation or grant**.
3. An independently authenticated ProInspect administrator or operations manager reviews the appointment record, validates the supporting evidence/term and records an independent approval or decline with their own evidence reference. The requester cannot approve their own nomination.
4. **Only approval** issues the expiring, email-bound council invitation, linked to the exact scheme, lot, term and reviewed appointment.
5. On acceptance, the server verifies the approved review and active authorised reviewer, the original inviter's current scheme authority, matching recipient email and precise effective dates before creating the council membership.
6. Access is time-limited and revocable without removing the person's other resident/tenant memberships. Previously issued council invitations lacking independent approval cannot confer *new* council membership.
7. Council operational recommendations do not constitute a statutory council resolution or vote without the applicable legal process.

Existing accepted/historical council memberships are not silently rewritten by the additive migration. The new verification applies to newly commissioned membership invitations.

## Menu visibility and product bookings

- **Always visible:** authorised primary links, My ProInspect workspace switcher, account/security, sign-out.
- **Conditional:** professional administration, occupant invitations, council verification, notices, bills, documents and specialist functions based on active membership, role, property, lot, effective term and feature release status.
- **Never visible to residents solely by membership:** owner billing, lease terms, another occupant's requests, staff queues, tenant private files, other lots' private records and financial approval functions.
- **Staff-only:** independent appointment reviews, provider administration and release acceptance.

**Product bookings are explicitly out of scope for this phase.** The existing booking routes, service catalogue and transaction logic are not redesigned or expanded by this menu specification. Product booking UX and entitlements are the next separately tagged workstream.

## Acceptance requirements

- Independent role tests for all 10 scopes, including the pre-existing nine.
- Commercial invitation rejects an outsider and a user in a different company, property or sector.
- Recipient cannot claim a commercial occupancy by email/address alone, cannot replay token and loses access immediately when revoked or expired.
- Occupant can only see personal submissions; owner can review only their authorised property’s issues.
- Council without reviewed evidence cannot invite/grant a new council member. Another authorised staff reviewer must approve.
- Council approval rechecks scheme link, lot/term, email and original manager authority. Council access ends with its term or explicit revocation.
- Existing residential tenancy and resident, lot owner, building manager and staff permissions remain unchanged.
- Responsive first-level navigation, More tools, no dead links, direct URL denial and accessible keyboard interaction.
- Isolated D1 migration/restore rehearsal, Cloudflare R2, hosted account journeys and independent acceptance before merge or production release.

The implementation is a reviewable development candidate, not evidence of external approval or production readiness.
