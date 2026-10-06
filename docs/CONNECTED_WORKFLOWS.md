# Connected workflows and operator review

This extends the frozen domain with migration `0003_connected_operations.sql`; it does not replace the original model or rewrite applied migrations.

## Residential service and tenancy

A self-managing Landlord registers a property, books an enabled service and receives its issued report through the established work-order engine. Future appointment changes pass through the same scheduling Durable Object and D1 exclusion guard as new reservations. Changing a visit withdraws old tenant inspection publication; the manager must reconfirm access and record the new notice reference before republishing. Cancellation does not pretend that an external refund occurred.

The current property manager can add tenancy metadata, invite additional tenants and record a tenancy end. Tenant invitations are email-bound and the issuer's authority is rechecked on acceptance. A tenant request can receive comments and attachments. Staff-only comments remain hidden; uploads remain quarantined until an operational reviewer records a release. New ordinary requests stop when tenancy authority ends, while previously issued documents can remain accessible.

A reviewed PDF is uploaded against a property or scheme, then issued to an explicit account, tenancy or scheme audience. A successor receives a new object and version; it never overwrites the historical file. PCR comments are linked to the issued PCR and the tenant; acknowledgement is recorded by the current manager. A document request cannot close as completed without an actual issued output for its property and client.

## Professional portfolios

An organisation applies for Property Manager, Strata Manager or Commercial access. Staff reviews the engagement before granting an entitlement. Organisation owners/admins administer their team. Property Manager and Commercial members operate only assigned properties. An owner contact imported with a property is not a login grant or an automatically verified ownership relationship.

CSV import previews validation and duplicate/existing-address conflicts before applying an atomic bounded batch. Bulk booking creates real individual bookings/work orders and returns per-property outcomes. Accepted bookings survive partial batch failure; the batch retry key prevents accepted items from being booked again. Recurring plans advance only when the matching occurrence is booked successfully; plans can pause/resume without inventing visits.

A management handover uses the existing canonical property, ends the old relationship and establishes the reviewed incoming manager. Open work and requests block this simple handover until reconciled. It does not automatically copy private historical files to a new manager.

## Strata operations

The managing firm creates a scheme and its building/property hierarchy. Lots and common areas are attached to that scheme; linking a previously existing property is a Staff-reviewed operation. Residents, owners and council members receive independent dated memberships. Council invitations require an end date.

A resident's inside-lot issue can route to their active tenancy. Common-property or uncertain issues become building requests for the scheme; this is routing, not a legal boundary determination. A manager dispatches the request into a canonical work order. The work has a separate resident-visible summary. Notices target a specific audience and optionally a building or lot. Residents do not receive quote/payment data or another resident's private request feed.

## Authority and money

A cost proposal puts work into awaiting approval. Financial authority is checked against a current property/scheme delegation, not merely a portal label. A private self-manager approves within their own account. An agency exceeding authority nominates a separately verified owner representative. A strata proposal can require council consideration.

Council members record recommendations. These remain advisory and never turn a work order into approved work. Staff must record the authorised outcome with its supporting reference. A database trigger prevents generic work-order updates from bypassing the approval gate. Decision notifications link to the appropriate authorised workspace.

Payment records and payment processing remain distinct. Manual outcomes need an external reference and an immutable event. Stripe Checkout uses server-stored totals and a server-recorded session; only a valid matching webhook can record processor payment. No UI query parameter is payment evidence. Live fund movement is outside repository acceptance.

## Review boundaries

The repository offers operational coordination rather than a replacement for legal services, statutory strata governance, trust accounting or full property-management accounting. Ordinary form screens collect instructions and track reviewed official PDFs and actual references; they do not certify legal service. Confidential intake uses a disabled-by-default separate case permission system and encrypted storage. Keep it disabled until operating procedures and release controls are accepted.

See BUILD_STATUS.md for limits and INTEGRATIONS.md for external contracts. Source tests, hosted service tests and final business acceptance are separate gates.
