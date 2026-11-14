# PR-01 merge and production release

Merging PR #97 does not authorise production activation or a production D1 migration.
On 14 November 2026, the repository owner expressly waived independent PR review and
authorised use of the existing staging D1 database. Record that owner decision as a
policy change, never as an independent approval. Production activation remains separate.

## Required merge evidence

- The current PR head passes the complete Verify ProInspect workflow, including the
  isolated local 0053-to-0054 rehearsal, Worker integration tests and browser journeys.
  Verification checks out the PR head explicitly and records its source SHA.
- Main requires the GitHub Actions checks `verify` and `staging-preview`, an up-to-date branch, a pull
  request and resolved discussions. The owner selected zero required reviewer approvals.
  Administrators are subject to these controls. Force pushes and deletion are disabled.
- Actual Worker tests cover identity/account scope, revoked and restricted memberships,
  service preferences, booking invariants and finance safeguards.
- Migration 0054 is rehearsed with synthetic data on the existing hosted staging database,
  after a recoverable export and verification that it is distinct from production.
- The owner authorises the source merge. Hosted production journeys and applicable
  provider/legal/recovery evidence remain requirements for later production activation.

The repository currently lists only the author as a collaborator. No independent review
has been submitted or implied. Preserve business-level independent approval requirements
inside billing, reporting and operational workflows; the waiver concerns PR review only.

## Local migration rehearsal

Run `pnpm test:pr01-d1` with Node 22 and locked dependencies.
The script uses an OS temporary directory and explicitly local Wrangler D1 operations.
It checks the complete migration sequence, preservation of an existing synthetic account,
preference constraints, foreign keys and the absence of automatically created billing or
entitlements. It checks physical SQLite integrity through a read-only connection after
Wrangler exits; D1's SQL authorizer does not allow `PRAGMA integrity_check`.
Miniflare metadata databases are excluded from the application database selection.

Evidence is written to `artifacts/pr01-isolated-d1-rehearsal.json`, and temporary state is
removed even on failure. This artifact always records that production is untouched and
that production acceptance has not been granted.

## Cloudflare build controls and Previews

The production branch is main. Its build command remains:

    CLOUDFLARE_ENV=connected pnpm --dir apps/platform build

Its deploy command must remain:

    pnpm --dir apps/platform exec wrangler versions upload

Uploading an inactive version does not approve a deployment. Do not substitute
`wrangler deploy` or invoke `wrangler versions deploy` during PR verification or merge.

The main-only production preparation guard stays intact. The PR-01 GitHub Actions preview uses the existing
shared staging Worker through `scripts/deploy/staging-preview.mjs`, with these commands:

    node scripts/deploy/staging-preview.mjs build
    node scripts/deploy/staging-preview.mjs deploy

The script checks both source and compiled resource bindings before deployment. It
rejects production resources, unspecified database IDs, enabled commercial/provider
features, external email and scheduled execution. It cannot provision a replacement DB.
Cloudflare's incompatible automatic branch Preview is replaced by this required staging
check. Production Workers Builds stays enabled with inactive version uploads only.
This is a shared staging preview, not a new branch-isolated environment. Its D1, private
buckets, queue and secrets belong to the existing staging Worker.

The hosted rehearsal uses `proinspect-v3-staging-data`, UUID
`e66b8ebc-637d-4737-8d47-b0fbec3c082c`. The existing database was at migration 0048;
committed migrations 0049–0053 established its baseline before testing 0054. Existing
records were preserved and synthetic rehearsal records removed. Evidence identifies
the exact migration checksum. The staging backup is retained outside the repository.

## Manual production sequence after release approval

1. Record the approved source and merge SHAs, passing CI/artifact links, independent
   owner acceptance and the separately authorised production release decision. Recheck the live
   Cloudflare build controls and all production resource bindings.
2. Record the active Worker deployment/version. Record a fresh D1 Time Travel bookmark,
   export the live schema and data into restricted backup storage, verify the export,
   and verify the recovery procedure on an isolated hosted target. A bookmark alone is
   not a tested restore or a durable backup.
3. Confirm the bound production database is `proinspect-platform-data`,
   UUID `dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea`. Use a reviewed migration-only
   configuration. Stop if the pending migration list differs from the approved list.
4. Under the separate release approval, apply only the approved additive migration
   before activating the new Worker. Retain pre/post schema and migration evidence.
   Do not run remote migrations from a main-push verification workflow.
5. Activate the specific approved uploaded Worker version manually. Preserve existing
   Durable Object migration history and namespaces, private R2 bindings, queues,
   operational flags, secrets and billing settings.
6. Check hosted sign-in, account switching, all nine workspaces, cross-account denial,
   revoked/viewer access, booking contention/idempotency and financial safeguards.
   Monitor logs and stop activation on failed acceptance.

For a code rollback, restore the recorded previous Worker version and leave the additive
0054 table in place. Do not drop the table or delete customer preferences as rollback.
Use a D1 restore only as a separately authorised incident action, with write coordination
and reconciliation of changes since the bookmark. A Worker rollback is not a database
restore, and PR verification must not execute either production operation.
