# Modular onboarding and simplified customer workspaces (branch implementation)

**Document ID:** PI-ONB-MASTER · **Version:** 1.0.0 · **Date:** 2026-11-16  
**Branch:** `feature/modular-onboarding-resident-invitations-20261116`  
**Status:** Development; independent hosted acceptance and release approval outstanding.

## What changes

The public account experience is organised as four customer-facing portal families plus an internal Operations workspace: Residential, Commercial, Strata, Resident & Member, and ProInspect Operations. They are **presentation groups**; all nine previously accepted workspace kinds remain in the domain and on the server. No role, relationship or document permission may be inferred from a family label.

Onboarding definitions live in `packages/onboarding/registry.ts`. Each definition has a permanent tag, its own version, field staging, entry policy and ordered screen steps. New changes increment only the affected tag. `ONB-AUTH` is shared. The IDs are contract identifiers, never authorisation credentials.

### Registration: required now vs. later

| Tag | Required for first step | Gather only after necessary | Access |
| --- | --- | --- | --- |
| `ONB-RES-OWNER` | Verified email, name, account name, ownership/self-management confirmation, legal acceptance | Residential property address/type, verified owner relationship, tenancy, service terms | Free owner account |
| `ONB-RES-AGENCY` | Verified email, business/legal name, engagement reference | ABN, business contact, management appointment, portfolio assignments | Professional review required |
| `ONB-COM-OWNER` | Verified email, name, account name, ownership/self-management confirmation, legal acceptance | Commercial premises, owning entity, lease and compliance details | Free owner account |
| `ONB-COM-MANAGER` | Verified email, organisation name, engagement reference | ABN, third-party authority, asset assignments | Professional review required |
| `ONB-STR-MANAGER` | Verified email, organisation name, engagement reference | Strata plan, address, appointment, delegated authority | Professional review required |
| `ONB-STR-BUILDING` | Verified user and authorised building assignment | Delegations and effective dates | Separate internal/approved assignment, no public privilege |
| `ONB-INV-RES` | Inviter authority, approved tenancy, invited email | None until tenancy workflows need them | Invitation only |
| `ONB-INV-COM` | Inviter authority, *commercial tenancy* and invited email | Premises-specific operations | Invitation only; not a general occupant model |
| `ONB-INV-STR` | Inviter authority, scheme and applicable lot, invited email | Dated membership | Invitation only |
| `ONB-INV-COUNCIL` | Inviter authority, scheme, invited email and term | Independent council appointment verification evidence | Invitation only; term-scoped |
| `ONB-STAFF` | Separately provisioned verified staff identity | Assignment scope | Internal only |

Do not request financial details at initial registration. New owner accounts remain free by default. Property address matches do not create an ownership or tenancy grant. Legal acceptance is not replaced or inferred by the onboarding registry.

### Implemented UI integration points

- `/onboarding?flow=ONB-RES-OWNER` and `/onboarding?flow=ONB-COM-OWNER`: distinct tagged owner paths backed by existing checked owner onboarding API.
- `/organisation?flow=ONB-RES-AGENCY`, `ONB-COM-MANAGER`, `ONB-STR-MANAGER`: progressive professional applications backed by the existing staff review.
- `/workspaces`: My ProInspect groups active, authorised workspaces by four customer families, plus Operations. No additional authorisation derived from the grouping.
- `/w/:kind/:scopeId/resident-invitations`: new entry screen for invitation to an *existing* tenancy, or the existing authorised scheme-invitation UI.
- `/invitations/accept?token=...`: signed-in user previews their invited property/role, then accepts using the pre-existing single-use invitation processing.
- `/book/:serviceId?`: account-first booking. Old `/guest/book/:serviceId?` and `/guest/request/:serviceCode` entry URLs redirect to the registered booking route.

In hosted environments (`APP_ENV !== 'local'`), new `/api/guest/requests` and `/api/v4/requests` POST operations return HTTP 410 with a sign-in destination. Existing historical order links, status, report downloads, quotation management and payment completion are retained so previously issued guest records are not orphaned. Local compatibility suites continue to exercise isolated legacy fixtures. This local exception must not become a public launch bypass.

### Resident invite policy

Resident & Member cannot be selected at public signup. User identity is independent of tenancy membership, property ownership and scheme membership. Invitation to a resident or tenant workspace requires a real pre-existing relationship and the current inviter's server-verified authority; forwarded links must not give a different identity access. The preview is available only after authentication, filtered by the verified email and unconsumed/unexpired token. It never performs an authorisation grant.

The existing tenancy invitation endpoint requires active tenancy, manager authority, and a verified recipient; the scheme invitation endpoint checks client admin, active scheme authority, lot membership and a future council end date. Council access is not statutory voting. Existing restricted documents require explicit issue grants regardless of membership.

**Implemented in ONB-INV-COM v1.1.0:** A new, deliberately narrow `commercial-occupant` scope supports invited commercial tenants' contacts, employees, contractors and other authorised occupants. It requires an existing commercial property, a verified manager, an authority reference, an email-bound single-use token and active membership. It does not create residential tenancies or lease administration rights. Occupants can view only their premises and personal requests. `0058_resident_occupancies_and_council_appointments.sql` is the additive migration.

**Implemented in ONB-INV-COUNCIL v1.1.0:** Council nominations are pending requests until an independent ProInspect administrator/operations manager reviews the appointment evidence reference and term. Only approved nominations generate an email-bound invitation linked to the reviewed scheme, lot and term. Unreviewed legacy council invitation tokens cannot grant new membership. External documentation review and independent hosted acceptance remain release prerequisites.

See `docs/PORTAL_MENUS_AND_RESIDENT_VERIFICATION_V1.md` for all primary and conditional portal menus. Product bookings remain a separate later phase.

### Change/version process

- Each feature change references one `ONB-...` or `UX-...` tag.
- Increment its independent semantic version and amend only its own fields/steps unless shared dependencies also change.
- Preserve historic invitation, tenancy, document, organisation and property IDs.
- Future per-instance audit persistence requires an additive migration and release-gated version capture. Registry metadata alone must not be represented as a complete audit trail.
- Verify the original nine underlying role journeys plus the new narrow commercial-occupant scope, invitation email binding/replay/expiration, cross-account property isolation, building manager boundaries, payment entitlements, booking intent and mobile flows.
- No deployment to `main` or production until the staged acceptance and legal, security, accessibility and data-retention checks are complete.

## Release status

The development branch is an integration candidate, not an approved production release. It preserves existing workspaces and legacy guest records. Historical guest booking and scheme/tenancy security tests may require migration to the new registered-booking policy; tests must not be silently deleted or treated as passed without running.
