# V2 business foundation — initial internal contract

The V2 schema is additive to immutable migrations 0001-0005. Migration `0006_v2_operating_model.sql` establishes the foundation for **eleven markets**, **69 draft service definitions** (including references to the 23 legacy booking identities), the canonical property/scheme asset hierarchy, service engagements, subscription plans and immutable usage, and cost-based quote snapshots.

**Commercial approval gate:** All V2 markets, services, market-service eligibility entries, 33 plan versions and new rate cards start **unapproved**. The V2 seed is a structurally useful draft, **not a verbatim import of the prior business workbook**. A signed-off catalogue/entitlement matrix and rate card are required before customer activation. Existing booking prices, public marketing services, property manager licences and live operations remain unchanged.

## Contracts

- `v2_assets` links each node to a single canonical property **or** scheme and rejects cross-scope parentage and cycles. Roots for existing and future properties/schemes and nodes for existing and future buildings, lots and common areas are linked without duplicating the canonical graph.
- `v2_markets` separates 11 operating models from the legacy three-value `properties.sector` constraint. A property/scheme can have more than one proposed market assignment, but activation needs a manually approved assignment.
- `v2_services` holds stable service identity, operating role and revision references. `v2_market_service_rules` is the independent, manually approved eligibility decision. **The 23 public booking service IDs are not replaced.**
- `v2_engagements` represents ProInspect's operational appointment, independently of a property-management appointment. A verified current service authority and an approved market are required before activation.
- `v2_plan_versions`, `v2_plan_services` and `v2_subscription_periods` preserve the agreed fee and limits from the approved plan version; approved plan versions cannot be edited.
- `v2_usage_ledger` contains only immutable consumption entries. A database trigger rejects unapproved services, mismatched work orders/bookings and consumption above the plan's annual hours/visits/tickets/report caps. One subscription period is used per contract-year period and renewals require explicit new records.
- `v2_rate_cards` and `v2_quote_snapshots` separate approved cost assumptions from immutable quote calculations. Calculations use **integer AUD cents, basis points and milli-hours**; external pass-through costs do not generate ProInspect labour margin.
- Each future API mutation requires authenticated staff workspace, server-side RBAC and audit events; other portals must not use the draft tables.

## Delivery boundaries

## Implemented Staff and customer workflows

- **Staff V2 console:** `/w/staff/operations/v2-business` provides market and service review, asset trees and classifications, service engagement setup and authority verification, versioned plan inclusions and limits, rate-card approval, internal quote generation, subscription-period creation, usage recording, and lifecycle controls.
- **Customer entitlement view:** `/w/:kind/:scopeId/service-agreements` displays only reviewed, activated service engagements that pass existing workspace/portfolio permissions. It shows agreed monthly charges and recorded hours, visits, tickets and report consumption; internal labour cost cards and draft quotes remain Staff-only.
- **Protected APIs:** `GET /api/w/staff/operations/v2?market=RES`, authenticated `POST /api/w/staff/operations/v2/... `, and `GET /api/w/:kind/:scopeId/v2-account`. All writes require an operations_manager or administrator, and immutable approvals/quotations and tenant/customer scope boundaries remain database-enforced.
- **Verification:** SQL constraint tests, pure integer pricing checks and a real Miniflare Worker/D1 integration workflow (`tests/runtime/v2.mjs`) run as part of the GitHub verification suite. Always check the exact commit's CI result.

## Still deliberately gated

The 69 services and market associations are draft sector proposals, not a line-by-line import of the separate business workbook. The 613 suggested market-service rule rows and 33 draft package versions require comparison with business-approved content before publishing. All V2 market availability defaults disabled; all service, plan and rate records are draft. Approval requires review references, a legitimate client-property/scheme relationship, verified authority, and matching market classification.

The new entitlement ledger is **manual and evidence-linked** to a booking or work order. Existing customer bookings do not automatically debit V2 subscription allowances until an accepted accounting workflow is added. Approved rate cards generate **immutable internal draft quotes only**; formal customer quote issuance, contractual rate negotiation, subscription invoicing and Stripe settlement remain separate implementation work. None of this is a hosted deployment.
