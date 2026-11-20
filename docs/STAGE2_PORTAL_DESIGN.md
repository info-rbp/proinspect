# Stage 2 portal design — PR #89 reconciled against current main

PR #89 originally proposed a compact nine-portal navigation model, shared operational
UI, purpose-specific dashboards and mobile keyboard controls. The repository has since
evolved. This reconciliation preserves the current `main` architecture rather than
replacing later customer dashboards, portal family navigation or permissions with the
8 November branch versions.

## Current architecture

- One authenticated React Router application and Worker with ten workspace kinds:
  Landlord, Property Manager, Commercial, Strata Manager, Tenant, Building Resident,
  Council, Building Manager, Staff, and Commercial Occupant.
- Five visual portal families provide shared UI while relationship-specific server
  authorisation continues to govern every API request and document access.
- Versioned role-specific primary destinations and grouped More tools live in
  `packages/domain/portal-navigation.ts`. The earlier branch-local menu module is
  superseded and is intentionally not copied into production.
- The latest `ClientDashboard`, client service tabs, account experience settings,
  co-living routes, commercial occupancy and invitation capabilities remain intact.
- Staff Today uses permitted operations data, including a role-scoped report register
  for submitted reports awaiting review.

## Changes carried forward from PR #89

- Responsive navigation with an explicit scrim, a visible mobile Close menu control,
  Escape-to-close, focus return to the menu toggle and route-change dismissal.
- Hierarchical breadcrumbs that reflect the current authorised workspace destination.
- Regression tests for responsive Staff/Landlord navigation and the current ten-kind
  versioned menu registry.
- Existing Stage 2 compact panels, tables and navigation styling retained from the
  newer main branch. Obsolete `PortalPanel`/`PortalStat` replacements and the original
  single 90-second nine-role browser test were not copied over because newer production
  implementations and scoped CI checks supersede them.

## Verification and release constraints

The merge does not change D1 migrations, R2 bindings, billing rules, Stripe
configuration, live customer data or Cloudflare environments. Source changes require
exact-head GitHub verification and independent hosted release acceptance. Existing
hosted role sign-in, security and accessibility approvals remain separate from
synthetic browser checks. See [Portal contract](PORTALS.md) and
[Stage 2 hosted acceptance register](STAGE2_LIVE_ACCEPTANCE.md).
