# Domain model v1

Accepted baseline: the product discussion of 6 October 2026. This file, ARCHITECTURE.md, AUTHORIZATION.md, PORTALS.md and LAUNCH_SCOPE.md supersede historical architecture documents. Database names use snake_case; the domain vocabulary remains the same. Changes require an additive SQL migration and a documented decision, not an alternate model.

## Identity and relationships

One verified `users` identity can hold multiple `client_memberships`, `tenancy_memberships`, `scheme_memberships` and a separately provisioned `staff_profiles` role. A workspace is a presentation of an active relationship, not a grant of authority. Client types remain landlord, agency, commercial_landlord, strata_company, asset_manager and other. A strata-management firm is a Client acting through an explicit scheme-management link; it is not the strata company merely because it manages a scheme.

Properties are persistent physical records. Ownership (`client_property_links`) and management (`property_management_relationships`) are separate, effective-dated relationships. The Landlord workspace is for private residential landlords who self-manage. A property manager manages on behalf of owners. Changing manager never copies a property or grants the incoming manager all historical documents automatically. A matching address alone never grants access to an existing record. Potential matches require authorised reconciliation.

Tenancies reference properties. Tenant rights derive from dated tenancy membership, not an address, email match, ownership or a client role. Ended tenancies can retain explicitly issued historical documents, but cannot submit ordinary new maintenance requests.

Strata schemes have buildings, lots and common-property areas. A lot may be linked to a canonical property. Scheme membership roles distinguish resident, nonresident owner and council member; these are not interchangeable and can overlap. A tenancy does not automatically grant resident/council authority. Resident access requires an approved scheme membership. A tenant in a strata lot can use both workspaces under one identity. Council terms end independently of resident access.

## Operations

A Booking is an appointment transaction. A Work Order is execution. Creation of a booking, its work order, access envelope, audit event and outbox events is a single D1 batch transaction. All appointment reservations, rescheduling and cancellation pass through a scheduling Durable Object; a database overlap trigger is the final invariant. Single-resource capacity is explicit in the first slice, not presented as multi-inspector optimisation. Request retries carry an idempotency key and payload fingerprint.

Requests may originate from a client, tenant or building relationship. Public marketing enquiries are leads, not bookings. Requests are triaged before becoming chargeable work. Bookings are always authenticated. Pricing is snapshotted in integer AUD cents; absent prices mean quote required, never free.

Approvals refer to specific work and a specific authorised decision-maker. Council member responses are operational recommendations, not statutory voting or proof of a legally valid resolution. An authorised recorder records an outcome with its supporting reference. Financial delegation must be configured and checked; a role label alone does not create spending authority.

## Information and confidentiality

Document bytes live in private R2. Document metadata and individual audience grants live in D1. A grant includes both recipient kind and recipient ID; a global role string is insufficient. Documents are issued to the commissioning client by default only for ordinary service outputs. Drafts, internal notes and restricted tenancy material are never automatically client-visible. Restricted cases and evidence use separate records, grants, encryption and storage. There is no generic path from property membership to restricted evidence.

Document publication follows stored bytes -> D1 metadata/grants/audit/outbox -> issued visibility. Failed metadata writes remove the uncommitted object. Issued versions are immutable. New versions get new object keys. Audit events are append-only. Activity feeds are separate, audience-safe projections, not raw audit dumps.

Outbox payloads are application-encrypted. Queues carry IDs only. Delivery is at least once with deduplication, provider idempotency and visible failure states; exactly-once external email delivery is not promised. A scheduled dispatcher recovers events left pending after a request ends.

## Schema evolution

The initial migration establishes the shared graph, including reserved strata/commercial relationships. Schema presence does not mean a portal is implemented. BUILD_STATUS.md is the capability ledger. Existing production repositories and data remain untouched. Imports are a separate reviewed operation after the new workflows pass acceptance.

## Connected operations extension

Migration 0003 adds explicit client entitlements, reviewed organisation applications, team/portfolio scope, scheme invitation terms, bounded import/bulk/recurrence records, document review/version references, operational approvals, payment receipts, restricted intake and integration delivery records. It preserves all original IDs and relationship definitions. A source-level adapter is not proof that its external counterparty has been deployed or accepted.
