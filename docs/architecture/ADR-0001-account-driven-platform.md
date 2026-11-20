# ADR-0001: Account-driven ProInspect client experience

Decision date: 14 November 2026
Status: target product decision accepted; production release not authorised.

## Decision
The ProInspect public website offers high-level Home, Residential, Commercial, Strata, Co-Living, Construction, Leasing, Maintenance, About Us, Who We Help, Sign Up/Sign In and Contact Us navigation. Sign Up / Sign In enters the Client Portal, where customers verify identity and choose accounts.

Portal menus are determined by the selected account's service interests, existing verified relationships, property/sector context, approved services and release gates. Requested interests never activate services, authorise property access or start subscriptions. Customers manage their account interests in Account & Services settings; onboarding records their initial choices.

The proposed future topology is five separately deployable customer applications (Public, Leasing, Client, Unified Booking and Residents) supporting nine business-facing areas, with preserved internal Staff Operations and Inspection/Reporting tools. In PR-01 everything continues to use the existing unified Worker and one authoritative D1 database. No multi-worker, cross-subdomain SSO or provider cutover occurs.

## Identity, account and finance
An individual identity may hold multiple independently authorised `client_memberships`. Account switching does not merge data across memberships. Existing server-side `workspace()`, property/scheme authorisation and document grants remain mandatory for every action. Account sectors are advisory preferences, not `client_entitlements` and not `v2_asset_markets` approvals.

Creating an account is free. Stripe checkout and subscription entitlement are separate approved workflows. Professional portfolios require reviewed organisation approval. Co-Living and Construction remain development-only in this PR.

## Storage and migration
Existing canonical users, clients, properties, tenancies, bookings, work orders, billing and reports remain unchanged. Migration `0054_client_service_interests.sql` adds only advisory per-account service interests. No direct customer Worker receives unrestricted D1 access.

## Delivery and release
The current `main` branch is connected to Cloudflare Workers Builds. Merge is therefore a release-sensitive event: do not merge while required controls or acceptance are unresolved. Perform schema migration rehearsals with isolated D1 and test all existing role journeys, negative access and booking/billing invariants. Retain existing public deep links and guest workflows until a separate approved cutover.
