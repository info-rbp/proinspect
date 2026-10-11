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

This commit implements the migration contracts, taxonomy, pure pricing calculation and automated checks. It does **not** activate a plan, issue customer pricing, carry usage automatically from existing bookings, send notices, authorise statutory functions or migrate customer data. Those steps follow guarded API and administrative integration.
