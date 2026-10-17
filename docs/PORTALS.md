# Portal contract

All portals share identity, domain services and UI primitives. Separate workspace navigation does not mean separate databases or user accounts. Only implemented and authorised actions appear in navigation; planned modules are not represented as working screens.

| Workspace        | Purpose                                           | Required product capabilities                                                                                                                                    |
| ---------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landlord         | Self-manage privately owned residential rentals   | Properties, tenancy, booking, maintenance, documents/forms, approvals, payments, history                                                                         |
| Property manager | Operate an agency's managed residential portfolio | Owners, portfolios, teams/scopes, imports, bulk bookings, recurring inspections, requests, authority limits, reporting                                           |
| Strata manager   | Operate a portfolio of schemes                    | Schemes/buildings/lots, common areas, residents, requests, contractors, inspections, works, notices, approvals, reports                                          |
| Tenant           | Participate in an authorised tenancy              | Requests/attachments, inspections, issued documents, WA statutory forms, PCR/bond, restricted support, past-tenancy access                                       |
| Building         | Participate as resident/occupant/owner            | Notices, works, common-property issues, own requests, building documents, access/move requests                                                                   |
| Council          | Understand and decide                             | Decision packets, member recommendations, recorded authorised outcomes, works oversight, reports, term-based access                                              |
| Commercial       | Operate commercial/asset portfolios               | Ownership/management, commercial inspections, make-good, contractor attendance, work verification, documents and reporting                                       |
| Staff            | Deliver ProInspect services                       | Action centre, clients, properties, schemes, scheduling, work orders, assignments, requests, documents, approvals, payments, communications, audit, integrations |

The marketing application uses service, sector, problem and engagement-model content. It is public and crawlable. Booking and document requests continue into authenticated operational workflows; a marketing enquiry is permitted without a portal account. Selected service intent survives authentication. The application domain is app.proinspect.systems; domain activation and legacy redirects are release operations, not automatic consequences of committing code.

## Landlord types

Landlord account setup allows an authenticated owner to choose **Residential** or
**Commercial**. These are account categories with different property sectors and
workspace experiences, not new staff roles or subscription prices:

- **Residential Landlord** creates a `clients.client_type='landlord'` account
  entitled to the `landlord` workspace. Self-owned properties use sector
  `residential`, management mode `self_managed` and residential property
  types, including House and Apartment.
- **Commercial Landlord** creates a
  `clients.client_type='commercial_landlord'` account entitled to the
  existing `commercial` workspace. A self-owned property uses sector
  `commercial`, management mode `commercial_managed` and commercial
  property types, including Office, Retail and Warehouse. Self-management
  requires explicit ownership attestation during account and property setup.
  A separate *professional organisation* workflow remains available for
  asset managers representing third-party owners; these applications still
  require operational review.
- An identity may hold one account of each type, with independent property
  and workspace permissions. Legacy residential sign-up API callers default
  to `residential`; existing client records are unchanged.
- Both active account types automatically receive the all-inclusive
  subscription through the existing Cloudflare D1 trigger (migration 0006).
  This does not grant unrelated portfolio, staff, tenancy or scheme access.
- The same service catalogue is filtered by the property's sector. A
  residential PCR cannot be booked against a commercial property, and a
  commercial inspection cannot be booked against a residential property.
  Both can book eligible included services without a separate visit charge.
- A property already recorded elsewhere requires relationship review. A
  self-attestation does not grant an owner automatic access to an existing
  unrelated client property.

## Shared interaction rules

Property/scheme context is always visible. Use business names rather than raw IDs. One primary action per screen. Responsive navigation, labelled fields, keyboard focus, error summaries, accessible progress indicators, usable empty states and plain-language next steps are required. Customer activity excludes internal notes and raw security audit metadata.
