# PR-01 implementation and acceptance

## Implementation inventory
- Public editorial navigation: packages/marketing/public-navigation.ts; apps/marketing/app/components/site-chrome.tsx; service-overview.tsx; apps/platform/app/routes.ts; public-routes.ts.
- Client Portal entry and onboarding: client-entry.tsx, signin.tsx (existing), onboarding.tsx, workspaces.tsx.
- Account service preferences: 0054_client_service_interests.sql; packages/validation/index.ts; worker/features/client-service-interests.server.ts; worker/services.server.ts; worker/api.ts.
- Client workspace: ClientDashboard.tsx, ClientServiceTabs.tsx, client-sector.tsx, account-services.tsx, workspace.tsx, workspace-data.server.ts, packages/domain/client-navigation.ts.
- Existing booking, billing, documents and staff routes remain authoritative; no new booking confirmation or Stripe flow is introduced.

## Ownership
`users`, `sessions`, `clients`, `client_memberships` and `client_entitlements`: Identity & Accounts.
`properties`, property links and management relationships: Property Registry.
`tenancies`, tenancy memberships, schemes and scheme memberships: Occupancy & Strata.
`services`, `v2_services`, `v2_markets`, `v2_market_service_rules`: Service Catalogue.
`bookings`, scheduling resources and BookingScheduler DO: Booking & Scheduling.
`work_orders`, `requests`: Operations.
`documents`, reports, restricted evidence and R2 references: Reporting & Documents.
`billing_accounts`, `billing_invoices`, subscriptions and payments: Finance & Billing.
`client_service_interests`: account configuration, owned by Identity & Accounts. These are preferences only.
`v2_assets`, `v2_capital_projects`: Asset & Capital Programmes. Full Construction and Co-Living are future separately reviewed domains.
A source inventory and ownership map must be reviewed before any physical module extraction.

## Readiness
- Branch-only development. No Worker deploy, DNS change, Stripe charge or production migration.
- Run pnpm check, pnpm test:integration, pnpm test:browser and Wrangler dry-run using isolated resources.
- Verify nine role memberships, wrong-account denial, revoked membership, viewer mutation denial, future sector disabled, booking contention and idempotency, legal/privacy and financial regressions.
- Confirm 0054 forward migration in isolated D1, old-version compatibility and rollback by code revert (no destructive migration).
- Require protected main, independent review, exact SHA CI acceptance, controlled Cloudflare deployment approval and hosted role acceptance before production activation.

## Existing routes
Marketing service catalogue and sector deep links remain reachable but no longer dominate navigation. Public site provides no direct checkout CTA; previous guest booking paths remain for backwards compatibility. Client Portal is the preferred authenticated path.
