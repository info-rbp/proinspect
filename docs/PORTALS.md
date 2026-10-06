# Portal contract

All portals share identity, domain services and UI primitives. Separate workspace navigation does not mean separate databases or user accounts. Only implemented and authorised actions appear in navigation; planned modules are not represented as working screens.

| Workspace | Purpose | Required product capabilities |
| --- | --- | --- |
| Landlord | Self-manage privately owned residential rentals | Properties, tenancy, booking, maintenance, documents/forms, approvals, payments, history |
| Property manager | Operate an agency's managed residential portfolio | Owners, portfolios, teams/scopes, imports, bulk bookings, recurring inspections, requests, authority limits, reporting |
| Strata manager | Operate a portfolio of schemes | Schemes/buildings/lots, common areas, residents, requests, contractors, inspections, works, notices, approvals, reports |
| Tenant | Participate in an authorised tenancy | Requests/attachments, inspections, issued documents, WA statutory forms, PCR/bond, restricted support, past-tenancy access |
| Building | Participate as resident/occupant/owner | Notices, works, common-property issues, own requests, building documents, access/move requests |
| Council | Understand and decide | Decision packets, member recommendations, recorded authorised outcomes, works oversight, reports, term-based access |
| Commercial | Operate commercial/asset portfolios | Ownership/management, commercial inspections, make-good, contractor attendance, work verification, documents and reporting |
| Staff | Deliver ProInspect services | Action centre, clients, properties, schemes, scheduling, work orders, assignments, requests, documents, approvals, payments, communications, audit, integrations |

The marketing application uses service, sector, problem and engagement-model content. It is public and crawlable. Booking and document requests continue into authenticated operational workflows; a marketing enquiry is permitted without a portal account. Selected service intent survives authentication. The application domain is app.proinspect.systems; domain activation and legacy redirects are release operations, not automatic consequences of committing code.

## Shared interaction rules

Property/scheme context is always visible. Use business names rather than raw IDs. One primary action per screen. Responsive navigation, labelled fields, keyboard focus, error summaries, accessible progress indicators, usable empty states and plain-language next steps are required. Customer activity excludes internal notes and raw security audit metadata.
