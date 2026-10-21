# Version 3 production cutover and recovery runbook

**Status:** Not authorised for production. This is an operating procedure, **not an automated release action**. The current `main` branch auto-deploys to the existing `proinspect-platform` Cloudflare Worker. No source branch merge should be attempted until this document's change controls, hosted acceptance, and [release issue #36](https://github.com/info-rbp/proinspect/issues/36) are complete.

## Verified identities and baselines (21 October 2026)

| Resource | Production baseline | V3 staging |
| --- | --- | --- |
| GitHub branch | `main` | `version-3-enhancements` (draft PR #34) |
| Worker | `proinspect-platform` | `proinspect-v3-staging` |
| D1 | `proinspect-platform-data` | `proinspect-v3-staging-data` |
| Production D1 UUID | `dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea` | Independent identifier in staging CI artifact |
| Migration ledger | `0001`–`0006` | `0001`–`0019` |
| Documents, restricted files, Queues, DO | Existing production resources, preserve | Distinct staging-only named resources |
| Main code baseline | `e819659dba660e85b88a013257806e6462f4c38e` | Revalidate candidate SHA immediately before cutover |

The verified production Time Travel bookmark audit is [GitHub run #39608518568](https://github.com/info-rbp/proinspect/actions/runs/39608518568), **read-only**. This bookmark ages out of its retention period and is *not* the final pre-deployment bookmark. Staging migration replay and synthetic backup restore have passed. Dedicated staging deployment and route checks are reported in the staging workflow artifacts.

## Required approvals and acceptance evidence (before any production writes)

1. ProInspect owner approves exact candidate SHA and date, and confirms PR #33 or other source branches have no later missing changes.
2. A named administrator validates test coverage on the **exact release SHA**: unit, SQL invariants, Worker/D1/R2/DO, both build packages, Wrangler upload dry-run, all Playwright browser cases, staging D1 migrations, noindex and negative/positive access tests.
3. Hosted staging tests include verified identities for every portal relationship; real agency/tenant/client permissions; restricted statutory cases; report and CSV grants; signing and expiry; report-link revocation; Turnstile. Staff/owner/tenant roles must be deliberately separated.
4. Approved real staging test recipients and isolated provider accounts are configured. Validate Resend domain + staging `RESEND_API_KEY` and `EMAIL_SINK` (or nominated provider), Google Calendar dedicated test calendar write/update/cancel, malware scanner verdict and retries. **Never copy production keys into staging by default.**
5. Business owner approves actual service prices, booking/quote paths, marketing claims, and customer-facing assets. Legal and privacy owners approve real privacy terms, rights/retention, WA statutory master templates and bond-handling authority. Defaults stay disabled until the corresponding gate passes.
6. Operations and security owner approves a maintenance window, response owner, rollback criteria, access to Cloudflare and a current retained data recovery method (D1 Time Travel and an appropriately protected independently retained export if required by retention policy).

These approvals are not implied by a green CI status or a user's request to perform engineering work.

## Release preparation: read-only

- Confirm production Cloudflare Worker still deploys the exact currently approved `main` SHA, account and D1 UUID; compare with the latest production read-only GitHub Actions audit.
- Freeze PR #34 and capture `git rev-parse HEAD`, exact merged-source contents and CI run IDs. Require `git rev-parse origin/main` equal the verified base of the PR, or repeat conflict analysis.
- Require `database/migrations/0001*` through `0006*` to be byte-for-byte the same as production baseline; require all thirteen new migration files `0007`–`0019` in strictly increasing order with no gaps and no duplicates.
- Confirm live `d1_migrations` has **exactly six** entries with the accepted last migration. Run read-only foreign-key and integrity checks.
- Read the **fresh** production D1 Time Travel bookmark immediately before migration, using `wrangler d1 time-travel info` or the authenticated API's **GET** `/accounts/{account_id}/d1/database/{database_id}/time_travel/bookmark`. Record bookmark and UTC time in the approved restricted change record, not in public logs.
- Store a separate encrypted database export only under organisation-approved privacy and retention procedures. Never upload customer data as an ordinary GitHub artifact.

## Controlled production migration (requires explicit release approval)

Prepare a **temporary migration-only** Wrangler configuration on the authorised operator machine or approved release runner, using the exact checked production UUID and the existing `database/migrations` directory. This must not declare or deploy any Worker and must not refer to staging resources.

1. Run `wrangler d1 migrations list DB --remote --config <verified migration config>` to preview the pending thirteen migrations. **Stop** if the plan differs, source SHA moved, or another change is in progress.
2. With the named administrator and fresh recovery bookmark, apply `wrangler d1 migrations apply DB --remote --config <verified migration config>`. Wrangler's migration backup and D1 Time Travel are safety nets but do not remove the need for verified recovery planning.
3. Check the production D1 ledger now has exactly 19 entries ending with `0019_open_home_reports.sql`, zero foreign-key violations and the original production customer/property/tenancy/work order counts and live booking history are preserved.
4. Stop if database invariants fail; **do not merge** source into `main` and do not improvise destructive SQL. Use the approved incident response procedure.

## GitHub merge and production deployment

1. Ensure the final exact V3 HEAD has completed CI and required human reviews, staging UAT and verified provider approvals.
2. Merge [PR #34](https://github.com/info-rbp/proinspect/pull/34) into `main` using GitHub's compare-and-swap SHA protection (reject a moved head). **This merge triggers the existing Cloudflare production Worker build immediately.**
3. Confirm Worker `proinspect-platform` deployed the approved source, `APP_ENV=production`, same existing D1 UUID, ordinary and restricted R2, Queue, legacy and new Durable Object class exports. Confirm `/api/health`, public catalogue, session sign-in, role-isolated bookings, work orders and reports.
4. Keep `GOOGLE_CALENDAR_BOOKINGS_ENABLED=false`, `GUEST_BOOKINGS_ENABLED=false`, `RENTAL_APPLICATIONS_ENABLED=false`, `OPEN_HOME_REPORTS_ENABLED=false`, `WA_BONDS_ENABLED=false`, `RESTRICTED_WORKFLOWS_ENABLED=false`, and other external/restricted release controls **off** until individually approved. Historical Apps Script/Open Home Sheets integration is intentionally inactive.
5. Monitor authentication, errors, scheduled jobs, outbox/queue retry states and D1 state; activate individually behind an explicit operator-owned change log, not because the code is merged.

## Recovery limits and incident decisions

- **Safe first response:** disable new flags and prevent new job execution; if only Worker code is faulty, redeploy the previous known-good Worker source while preserving additive V3 schema. This does **not** undo queued emails or other side effects already sent.
- **D1 Time Travel restore is destructive.** Reverting the database to the pre-release bookmark may erase all legitimate writes after the bookmarked moment. Only a named authorised incident commander may initiate it, after pausing writes, evaluating data loss, obtaining business signoff and preserving a fresh current-state recovery point. Never automate the restore on a failed CI run.
- Do not delete/recreate R2 buckets, Durable Objects or Queues during rollback. Preserve legacy `BookingCoordinator`, existing customer storage and migration ledger.
- If actual records were altered or external notifications dispatched, the rollback requires an incident-specific reconciliation plan, not simply a Git revert.

## Current unresolved release gates

At the time this runbook was authored, no named legal/business/privacy approval, authenticated eight-portal hosted staging acceptance, real Resend/Calendar provider transaction, signed service pricing, or production change window was evidenced. Record these in [issue #36](https://github.com/info-rbp/proinspect/issues/36). **The branch remains draft and must not be merged solely on the strength of these scripts or automated tests.**
