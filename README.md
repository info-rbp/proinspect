# ProInspect

Clean Cloudflare-native rebuild. This repository is the new source of truth; legacy application and marketing repositories are reference material only.

## Architecture contract

- Two deployables: public marketing website and authenticated platform.
- One verified identity, relationship-scoped workspaces, and one canonical domain model.
- Landlord means a private residential owner who self-manages; ownership alone does not grant management access.
- Property Manager, Strata Manager, Tenant, Building, Council, Commercial and Staff are workspaces, not separate databases.
- Ownership, management, tenancy, residence and council authority are distinct, time-bounded relationships.
- Every new customer booking requires authentication and an authorised property or scheme relationship.
- Booking is the appointment transaction; Work Order is execution. Writes include immutable audit and durable outbox events.
- D1 holds canonical data; private R2 holds documents; restricted evidence uses a separate bucket and explicit authorization.
- Documents are private until issued to explicitly selected recipients. A property relationship never grants every document.
- Tenant/resident requests do not require a commercial client membership.
- No Firebase, Express or Google Calendar runtime. No production migration or DNS cutover during the initial rebuild.

## Delivery sequence

1. Deployable Workers skeleton and verification pipeline.
2. Versioned domain schema, identity and authorization contracts.
3. Complete service -> account -> property -> booking -> work order -> report workflow.
4. Tenancy and request/approval workflows.
5. Portfolio and strata workspaces built on the same services.
6. Production acceptance after live integration and security checks.

The initial repository bootstrap does not assert production readiness. Implementation and test evidence will be recorded in `docs/BUILD_STATUS.md`.
