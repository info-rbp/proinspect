# Unified ProInspect portals, invitation-only Resident access, account tags and co-living
Prepared 16 November 2026. This document describes the proposed feature branch, not a production release or external-provider acceptance.

## Customer-facing workspace contract
One verified ProInspect identity exposes four portal families:

| Family | Existing backend workspace kinds | Audience |
| --- | --- | --- |
| Residential | landlord, property-manager | Private owners, authorised residential property agencies |
| Commercial | commercial | Commercial owners and asset-management organisations |
| Strata | strata-manager, building-manager | Strata management firms, assigned facilities managers |
| Resident | tenant, building, council | Invited tenants, building occupants/lot owners, active council members |
| ProInspect Operations (internal) | staff | Administrators, operations managers, inspectors, authorised read-only staff |

**Nine permission scopes remain distinct.** Grouping the UI never unions a tenant, council, manager, staff or building membership. The backend `/w/:kind/:scopeId` and `/api/w/:kind/:scopeId` paths remain authoritative, and existing deep links continue working. The new `/workspaces` interface groups only scopes already returned by the verified session and shows individual account/property choices within a family.

## Resident Portal is invitation-only
- There is no public `Create Resident account` path. Self-service account creation remains for commissioning customers who own and manage their properties.
- A person invited as tenant, resident, lot owner or council member first proves access to the invited email, then accepts a time-bounded invitation or approved membership.
- Being able to create a general login identity for a service purchase does **not** grant Resident Portal membership. Existing verification, active tenancy, lot, scheme, term and document-grant restrictions remain.
- An existing customer's email identity may subsequently accept an invitation; a second account or shared password is not needed.
- Co-living occupant invitations reuse the existing tenancy invitation flow. An invitation belongs to exactly one privately scoped tenancy; it cannot be used to enumerate the other occupants.

## Account experience tags
Source: migration `0058_portal_experience_coliving.sql`, table `account_experience_tags`.

Allowed labels: `co_living`, `student_living`, `professional_portfolio`, `multi_site`, `priority_operations`. Only Staff administrator/operations-manager actions can manually add/remove tags with an audit reference. A co-living setup by an authorised owner/agency automatically adds the presentation tag to that account. Verified workspace kind, account type and relationship also provide derived labels, such as Residential landlord, Agency manager, Commercial landlord, Tenant or Council member.

**Tags are not role grants, management authorities, service entitlements, payments or data-access permissions.** Client membership, property management, tenancy and scheme assignment checks remain the source of permissions. Tags affect explanatory text and grouping, not privileged API routing.

## Co-living in the Residential Portal
- An authorised residential property owner/agency administrator configures a canonical existing residential property for room-based **or** bed-based allocation. Commercial and strata-building properties cannot be configured.
- One property contains named private rooms/beds and separately named common areas. Space configuration does not create tenancy or sharing permission.
- Occupancy creates a separate canonical tenancy, linked to precisely one private space, followed by a tokenised, expiring resident invitation.
- Multiple active tenancies may overlap **within the property**, but the same private space cannot be allocated for overlapping periods. Both application checks and an atomic SQLite trigger enforce this.
- A whole-property tenancy cannot coexist unnoticed with new room-based invitations. Existing tenancy records require review before site conversion. This change does not migrate historic leases automatically.
- The Resident Portal's My residence page returns **only the signed-in tenant's assigned room/bed and shared-area names**, never other occupants, tenancy IDs, phone numbers or private files.
- Tenant maintenance requests can target only their allocated private space or a shared area in the same co-living property; manager-created requests are property-scoped. Request allocations are linked to the shared Work Order flow.
- The normal forms, bond, reporting and service workflow remain in their existing tenancy records; final tenancy/legal acceptance must address the actual room/bed agreement type and lawful information-sharing.

## Registered-only service purchasing
- The public `/book` and historical `/guest/book` and `/guest/request` entry routes lead to the authenticated booking journey and preserve service intent where a service slug exists.
- New public `POST /api/guest/requests` and `POST /api/v4/requests` return HTTP 410 with an account requirement; do not present a public quote or booking as a completed registered purchase.
- Existing verified historical guest references, documents, management and quote states are retained; old data is **not deleted**.
- Logged-in customers without a paid entitlement still have free account/property setup and existing service request/approved pricing options, subject to their contractual scope. Live one-off checkout requires separate verified price/Stripe release gates.
- Public leasing applications, open-home check-ins and ordinary marketing enquiries are not service commissioning and are deliberately outside this retirement scope.

## Implementation and acceptance
- Schema: `database/migrations/0058_portal_experience_coliving.sql` is additive and must be applied only after review and backup on the exact verified D1 target. Do not apply automatically from a draft PR.
- API: `apps/platform/worker/features/co-living.server.ts` and `account-tags.server.ts`; guarded `/api/w/:kind/:scopeId` endpoints.
- UI: grouped `/workspaces`, updated workspace headers/navigation, `properties/:propertyId/co-living`, Resident `my-room`, Staff `account-tags`, Resident request location.
- Security gates: wrong-user invitation redemption, no self-granted Resident membership, cross-account property access, room conflict, cross-room request denial, council/tenant role separation, Staff inspector denial, document grants, historical rights.
- Verify all nine independently authenticated hosted roles even though there are now only five visible portal families. A navigation redesign cannot replace the existing nine-role acceptance standard.
- Marketing content, approved resident communications and legal tenancy documents need separate business/operational approval. No live billing, tenant conversion, migrations, domain changes or production activation is performed by branch creation.

## Remaining product decisions
- Whether student/co-living operators need custom agreements, capacity plans, occupancy fees or room-level rent/bond ledgers.
- How communal inspection reporting should distinguish common areas from private bedrooms and preserve per-occupant evidence grants.
- Whether short-stay/licensed lodging is separately authorised or excluded from the residential tenancy workflow.
These are not inferred from a `co_living` presentation tag and are not represented as live features.
