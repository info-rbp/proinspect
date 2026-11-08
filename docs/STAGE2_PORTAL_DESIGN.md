# Stage 2 — Nine-portal navigation and operational design

**Release scope:** shared portal shell, purpose-specific dashboard, role-scoped navigation and consistent operational UI. This does not authorize new backend permissions, pricing, a Stripe subscription or a new production hostname.

## Product system

ProInspect uses one authenticated React Router application and one production Worker. Every portal uses:
- A compact desktop sidebar, a short routine-task menu, a grouped and normally collapsed **More tools** section, route breadcrumbs, account security and workspace switching.
- Mobile navigation (320px and above) with an accessible open/close button, an explicit overlay, Escape-to-close, 44px controls and visible keyboard focus.
- A restrained visual system: neutral surfaces, shared spacing, status badges, labelled forms, compact tables, useful empty states and only real authorised operational data.
- A role-specific Home, not the entire catalogue of specialist features. All actual authorization remains enforced by existing server routes.

## Nine portals and primary destinations

| Portal | Home | Primary navigation |
| --- | --- | --- |
| Staff | Today: bookings due, reports submitted for review, active work, exceptions, priority actions, schedule and recent records | Today, Schedule, Work orders, Reports, Clients & properties, Finance |
| Landlord | Property overview | Overview, Properties, Bookings, My requests, Issued reports, Billing |
| Property manager | Portfolio overview | Overview, Properties, Portfolio operations, Bookings, Work orders, Reports, Finance |
| Commercial | Commercial portfolio | Overview, Properties, Commercial leases, Bookings, Reports, Finance |
| Strata manager | Scheme operations | Overview, Schemes, Work orders, Requests, Reports, Finance |
| Tenant | My tenancy | Overview, Tenancy & forms, Inspections, My requests, Documents |
| Building resident | Building overview | Overview, My building, My requests, Documents, Building operations |
| Council | Council oversight | Overview, Schemes, Council decisions, Reports, Documents |
| Building manager | Building operations | Overview, Building operations, Notice drafts, Authorised reports |

Specialist screens remain accessible in grouped Records & reporting, Property & tenancy, Service delivery, Financial controls and Administration & settings sections. Entries are filtered by original workspace role, account-owner status, Staff role and restricted-workflow flag. The menu never grants permissions.

Staff **Reports to review** counts submitted reports from the Staff report endpoint, already restricted by staff assignment. **Bookings due** counts confirmed bookings on the current Perth calendar date. **Exceptions** counts emergency active Work Orders plus failed or payment-required records, not an invented audit count. Recent activity shows recently updated Work Orders and requests, not the full system audit. Building managers see assigned-site tool destinations, not fabricated portfolio counts.

## Verification

The acceptance suite is split into two requirements:

1. **Engineering verification:** typechecks, domain tests, SQL invariant checks, Worker+D1+R2 integration tests, both Wrangler upload dry-runs, Playwright at 1440px, 390px and 320px with screenshots for nine authenticated roles, keyboard navigation, grouped menu visibility, permission-denial checks and no overflow.
2. **Hosted acceptance:** appointed business and accessibility reviewers use real email-verified production sessions for each of the nine roles (including Building Manager), check cross-role denial, keyboard and assistive technology, and sign off the exact deployed source SHA. Synthetic CI is not independently accepted hosted access. See docs/STAGE2_LIVE_ACCEPTANCE.md and the acceptance register for remaining prerequisites.

A Staff Inspector must not see legal, integration or financial administrator links. Council does not inherit a resident's requests. A building-manager appointment requires independent authority, not a resident role.

## Deployment

Use a reviewed GitHub PR into main, verify exact-head CI, and allow existing Cloudflare Workers Builds to deploy into the production proinspect-platform Worker. Confirm 100% deployed version, matching BUILD_SHA, unchanged D1 migrations and R2/D1 bindings, and **all paid subscription flags disabled**. This UI release does not create staging, enable Stripe Checkout or change live billing.

Do not rename, delete or recreate D1 databases, Workers, Durable Objects or customer accounts for navigation design. No D1 migration is required.
