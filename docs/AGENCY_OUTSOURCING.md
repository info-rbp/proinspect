# Agency outsourcing: implementation and activation boundaries

This extension is additive to ProInspect's existing management, ownership, tenancy and document relationships.

## Owner access
Only an authenticated ProInspect Staff operations administrator can create an agency-managed owner grant, after checking a verified user identity, an active approved agency entitlement, the agency's current management appointment, and an independent external authority reference. The owner receives **no landlord account, subscription, manager role or tenancy access**. Owner pages show property address, the permitted agency inspection history, and only explicitly shared, issued service PDFs. Report downloads recheck the exact management appointment, agency document grant, owner grant and R2 object; revoking or terminating access blocks downloads.

Agency administrators may revoke access or explicitly share an issued report, but may not approve an owner identity or issue management permissions. Management handover ends the old owner's grant because its management relationship ID changes.

## Outsourcing operations
The existing approved Property Manager workspace gains an outsourced services dashboard showing its own authorised properties, recurring inspection plans, work orders, approved agreements and approved internal statements. Existing booking, bulk booking and assignment access controls remain authoritative. ProInspect completes Work Orders; the agency retains its management and statutory responsibilities.

## Pricing and billing
Commercial tiers are 50–149, 150–499, 500–1000, or custom managed properties. These are administrative bands, **not approved prices or entitlements**. Draft agreements specify separately approved monthly base, GST basis points, and per-service rates (included or additional). Independent Staff approval is required. Do not automatically enable live agency billing because an application subscription exists.

Monthly statements should snapshot a closed period's independently approved retainer and completed chargeable service events, keep per-property references, enforce single-billing/idempotency, and require a second person to approve. This release does not transmit Stripe invoices, collect money, or book trust/rent/bond payments. External invoicing, refunds, reconciliation and commercial terms require a separate release gate.

## Required live acceptance
Before enabling real owners: verify management appointment and property ownership evidence, owner identity, actual consent/notice wording, staff review, report sharing, revocation, handover and cross-account access denial. Before financial collection: sign off rates, GST treatment, billing entity and payment terms, provider integration, duplicate event/retry testing, and settlement reconciliation.

The migration `0027_agency_outsourcing.sql` contains no customer data, seeded prices or live charges. Historical migrations remain unchanged.
