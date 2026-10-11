# Connect the existing `proinspect-platform` Cloudflare Worker

## Which repository/build this addresses

`info-rbp/proinspect` is a pnpm monorepo (`apps/platform`, `apps/marketing`). The October 5 log showing `proinspect-booking-portal`, an npm build, `BOOKING_COORDINATOR`, `JOBS`, `SENSITIVE` and an all-zero D1 UUID belongs to the older application generation. Those bindings and build scripts must **not** be copied into the rebuilt Worker. The newer monorepo also fails when the default Wrangler deploy is run from the repository root without selecting a project.

The intended existing Worker name from the log is **`proinspect-platform`** (not `prosinpect-platform`). Connecting the existing Worker replaces its running code and bindings with an **isolated staging** application, so this is an explicit owner action, not an automatic push-to-main action. No production DNS, historic database, or external email recipient is changed by the configuration workflow.

## One-time GitHub configuration action

Go to `info-rbp/proinspect` -> Actions -> **Connect the Cloudflare platform Worker** -> Run workflow on `main`. Enter `proinspect-platform` exactly as the confirmation. This workflow runs repository verification, checks the exact source commit and validates the configured credentials **before** creating resources. It fails safely if configuration, account ownership, Worker identity or connected `main` trigger do not match.

The action then:

1. Finds the existing `proinspect-platform` Worker and exactly one Workers Builds trigger for `main`.
2. Creates or reuses a **separate** `proinspect-v2-staging-data` D1 database, two private R2 buckets, an event Queue and its dead-letter Queue. It never binds the previous `proinspect-local` database, an all-zero UUID or the old `SENSITIVE` bucket.
3. Generates `apps/platform/wrangler.jsonc`'s **`env.connected`** with that actual D1 UUID, `DB`, `DOCUMENTS`, `RESTRICTED_DOCUMENTS`, `SCHEDULER`, `EVENTS`, the required migrations/cron and `APP_ENV=staging`. Local development remains unchanged.
4. Builds the platform for that environment, checks the Wrangler deployment bundle, applies **new-database** migrations, and loads the real shared service catalogue **in request/quote mode without invented prices**.
5. Installs only missing runtime secrets on the existing Worker. Existing secrets, especially `DATA_ENCRYPTION_KEY`, are **not rotated**. No credential values are written to Git.
6. Corrects the Cloudflare **Workers Builds** `main` trigger to build and deploy the platform from the monorepo root using explicit commands. The build uses Node 22.23.2 and stamps the real checked-out source SHA.
7. Commits only the non-secret, actual D1 binding configuration to `main`, and requests Cloudflare to build that exact new commit. The resulting Cloudflare build/deployment must still be checked in the Cloudflare dashboard before declaring hosted acceptance.

A GitHub Actions receipt is retained as `cloudflare-connected-platform-receipt`. A successful action means the build was **requested**, not necessarily that Cloudflare's build or hosted application passed acceptance.

## Required GitHub setup

Use repository Settings -> Environments -> `staging` and put secrets in Environment secrets (repository-level secrets also work), and nonsecret fields in Environment variables.

**Secrets**: `CLOUDFLARE_API_TOKEN` (Workers Scripts, D1, R2, Queues and account lookup), `DATA_ENCRYPTION_KEY`, `ENQUIRY_GATEWAY_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `MARKETING_TURNSTILE_SECRET_KEY`.

**Optional separate Builds API secret**: `CLOUDFLARE_BUILDS_API_TOKEN` must be a **user-scoped** API token with Workers Builds Configuration Edit plus the necessary read access. If omitted, `CLOUDFLARE_API_TOKEN` itself must be a user-scoped token with that permission. Account-scoped tokens do **not** work for the Workers Builds API. Never store a Global API Key in place of a Bearer API token.

**Variables**: `CLOUDFLARE_ACCOUNT_ID`, `EMAIL_FROM`, `EMAIL_SINK`, `OPERATIONS_EMAIL`, `TURNSTILE_SITE_KEY`, `MARKETING_TURNSTILE_SITE_KEY`. `EMAIL_SINK` must be a controlled testing mailbox, not a general forwarding address. The account ID is a nonsecret 32-character hex string; confirm it matches the intended Cloudflare account rather than assuming the ID in an older log is still correct.

See [GITHUB_CONFIGURATION.md](GITHUB_CONFIGURATION.md) for validation formats and optional integrations. Stage encryption keys must be backed up securely before storing data. If a Worker already has an encryption or HMAC secret, the action **preserves** it; reconcile its origin before releasing real users.

## Cloudflare `main` build configuration

The one-time action applies these settings via the Workers Builds API; use the dashboard directly if the builds-config token is not available:

| Setting                        | Value                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Connected Worker               | `proinspect-platform`                                                                                |
| Repository / production branch | `info-rbp/proinspect` / `main`                                                                       |
| Root directory                 | `/` (the pnpm workspace root)                                                                        |
| Build command                  | `node scripts/deploy/stamp-connected.mjs && CLOUDFLARE_ENV=connected pnpm --dir apps/platform build` |
| Deploy command                 | `pnpm --dir apps/platform exec wrangler deploy`                                                      |
| Build variable                 | `NODE_VERSION=22.23.2`                                                                               |

The `CLOUDFLARE_ENV=connected` setting is **build-time** for Cloudflare's Vite plugin; the generated build output contains the selected hosted bindings and Worker name. Do not deploy the default top-level `local` environment, run bare `npx wrangler deploy` at the workspace root, or use `--env connected` to change an _already built_ Vite output.

The marketing application is a **separate deployment**. This connection action only configures the linked platform Worker. It does not silently attach `proinspect.systems` or `app.proinspect.systems` custom domains.

## Release controls

This action can overwrite the existing `proinspect-platform` Worker when run; obtain any required backup or stakeholder approval before typing the confirmation. No historic database is overwritten; the new binding starts empty. It is staging-only and always emits `noindex` headers. The original `.github/workflows/deploy-staging.yml` remains inert. A later production launch requires separate resources, approved pricing/content, provider testing, disaster-recovery validation and deliberate domain cutover.

Sources: https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/ ; https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/ ; https://developers.cloudflare.com/d1/reference/migrations/ .