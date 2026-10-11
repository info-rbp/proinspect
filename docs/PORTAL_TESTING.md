# Google Admin email aliases: ProInspect portal testing

## Requested identity assignments

One email sign-in screen at `/signin` on the existing `proinspect-platform` Worker. After a one-time email link and explicit confirmation of the **same alias**, the application reads `users` and its active scoped memberships from D1. Email aliases can route to one Google inbox while remaining **distinct ProInspect identities**; do not assume that Google aliases are independent Google Workspace user accounts.

| Requested email alias | Workspace | Test relationship |
| --- | --- | --- |
| `landlord-testing@proinspect.systems` | Landlord | Owner of one **TEST** self-managed residential property |
| `property-manager-testing@proinspect.systems` | Property Manager | Owner of a **TEST** agency account with one agency-managed property |
| `strata-manager-testing@proinspect.systems` | Strata Manager | Owner of a **TEST** firm that manages a **TEST** strata scheme |
| `tenant-testing@proinspect.systems` | Tenant | Active **TEST** tenancy at the Landlord's test property |
| `building-resident-testing@proinspect.systems` | Building / Resident | Resident membership in a **TEST** building and lot |
| `building-council-testing@proinspect.systems` | Council | Current council-member term of the **TEST** strata scheme |
| `commercial-testing@proinspect.systems` | Commercial | Owner of a **TEST** commercial portfolio and property |
| `staff-testing@proinspect.systems` | Staff / Administration | Explicitly owner-authorised **TEST** `administrator` role |

The seed creates 8 identities, 4 synthetic clients, 5 synthetic properties, 1 synthetic scheme/building/lot, 1 tenancy, 2 dated scheme memberships, and the 23 standard catalogue services if missing. It does **not** invent approved prices, real inspections, actual spending authority or statutory council resolutions. A new identity's `verified_at` is **NULL** until that mailbox completes a genuine magic-link sign-in. It does not create login tokens or sessions.

## Apply to the actual deployed D1 database - explicitly, once

The source script is [seed-google-admin-aliases.sql](../scripts/portal-testing/seed-google-admin-aliases.sql). It is **not** a numbered migration, automatic deployment hook, or privileged public API. Review the eight email addresses and synthetic data before execution. Do not run it against an unrelated database, legacy property records, or another Cloudflare account.

1. In Cloudflare Dashboard, open **Workers & Pages -> `proinspect-platform` -> Bindings** and identify the exact `DB` D1 database. Follow that specific binding to D1 **`proinspect-platform-data`**, and confirm its UUID and current database contents. Do not assume a database with a similar name is the one bound to the Worker.
2. Check the `users`, `clients`, `client_entitlements`, `scheme_memberships`, `services` and `d1_migrations` tables exist. The source database migrations `0001_core.sql` through `0005_account.sql` **must already be applied**. An empty database must be migrated first; Cloudflare creating a D1 binding does not create application tables. If using Wrangler's migration command, the local `env.connected` config may need the **real D1 UUID** (not a placeholder) because a binding auto-provisioned during Cloudflare Builds is not necessarily resolvable by remote Wrangler subcommands.
3. After reviewing the target database, open its **D1 Console**, run the SQL in `scripts/portal-testing/seed-google-admin-aliases.sql` (or upload/execute that file using an authenticated Wrangler CLI against the verified DB). Cloudflare can accept multiple SQL statements in one D1 query; no GitHub Actions connection workflow is required.
4. Run the read-only `scripts/portal-testing/verify-google-admin-aliases.sql` in the same D1 Console. All eight accounts should show `ACCESS_ASSIGNED`; any `EXTRA_WORKSPACE_REVIEW`, `STAFF_ROLE_MISMATCH`, or `CLIENT_ROLE_MISMATCH` requires investigation before testing. `EMAIL_NOT_YET_VERIFIED` is normal before first successful magic-link login.
5. Verify email authentication configuration on the existing Worker: `DATA_ENCRYPTION_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` and the public `TURNSTILE_SITE_KEY` must be valid for its active hostname; `EMAIL_FROM` must be a verified sender. The Cloudflare `GET /api/health` endpoint's `authenticationConfigured` must be `true`. Confirm the catalogue endpoint `GET /api/catalogue` succeeds before booking tests. Secrets set in **GitHub** do not automatically appear in Workers built using Cloudflare's native Git connection.
6. Open the common `/signin` URL, request a link separately for each alias, and enter **that same alias** on the `/auth/complete` confirmation page. Sign out or use a fresh browser profile/incognito window between accounts. Verify `/workspaces` lists the assigned portal only, and cross-portal URLs deny access.

### Important safeguards

- The script uses reserved `*_pi_test_*` IDs, synthetic addresses, and insert-if-missing statements. It does not overwrite existing service configuration, previously verified email identities, memberships, legal records or customer data. Reapplying it is idempotent. It must not be automatically run on every GitHub push.
- **Staff Administrator** is a highly privileged application role. Because Google Admin lists the addresses as *Alternative email*, anyone with access to the underlying mailbox can receive the `staff-testing@...` magic link. Restrict that mailbox to authorised testers and remove/revoke the test Staff role after acceptance testing. The separate [revoke-staff-administrator.sql](../scripts/portal-testing/revoke-staff-administrator.sql) disables only that test Staff profile if the owner chooses to revoke it.
- The test Council membership does not grant legal voting or spending authority. Existing restricted statutory workflows remain disabled.
- This provisions test **access** and relationships, not real verified property ownership or customer authority. Never point these identities at real client accounts to make tests pass.
- Do not mark test identities email-verified in SQL. An email alias must complete the live one-time-link process itself.

## Status / verification

The SQL and regression tests are verified against a fresh in-memory copy of the complete committed schema, including idempotent reruns, role isolation, schema constraints, and first-sign-in verification semantics. That does **not** establish that the SQL has been executed on Cloudflare D1. Until remote execution is independently confirmed, the eight accounts must be reported as **prepared, not live-provisioned**.

## GitHub API-based one-time Cloudflare D1 provisioning (11 October 2026)

The owner has asked to configure the eight test logins **through GitHub**, using the API key already added to the GitHub repository, rather than signing into a separate Cloudflare browser or running the old manual GitHub-to-Worker connection workflow. The GitHub-only provisioning job in `.github/workflows/portal-test-provision-once.yml` runs from `main` **only when** `scripts/portal-testing/provision-once-2026-10-11.intent` changes. It is not a deployment workflow, does not edit the Worker, and does not automatically rerun on subsequent normal pushes.

The job reads a GitHub repository-level `CLOUDFLARE_API_TOKEN` secret (token needs **Workers Scripts Read**, **D1 Read** and **D1 Write**) and `CLOUDFLARE_ACCOUNT_ID` (GitHub Actions variable or secret; otherwise the Cloudflare account ID observed in the prior ProInspect deployment log). It fetches the **deployed `proinspect-platform` Worker settings**, verifies that `APP_ENV=production` and that its bound D1 UUID belongs to **`proinspect-platform-data`**, and refuses to write to a mismatch. It writes the verified UUID only into an ephemeral per-run Wrangler config, applies the existing `0001`–`0005` schema migrations using Wrangler's D1 migration ledger, seeds the eight owner-provided Google aliases and test relationships, and queries the live D1 to verify all eight permissions.

GitHub Actions secrets are not retrievable by the assistant or GitHub's repository-file connector. If the token is stored only in a different GitHub Environment, or lacks the required Cloudflare API scopes, the job will fail with an explanation; **it will not write to an unverified target**. The GitHub repository's normal Cloudflare Workers Builds deploy continues separately and is unchanged.

The role records do not verify email ownership or make sign-in available by themselves. For real magic links, configure the existing Worker's Resend and Turnstile secrets and sender settings in Cloudflare; `/api/health` must report `authenticationConfigured: true`. A GitHub Cloudflare API token is *not* the `RESEND_API_KEY` or the encryption key. The Staff testing alias is an administrator-level account; disable that role after acceptance using the separately committed revocation SQL.