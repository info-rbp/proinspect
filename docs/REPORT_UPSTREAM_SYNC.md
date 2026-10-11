# Upstream reporting source updates

The upstream project is `info-rbp/ProInspect-Report-Creation-App`.
Portable, audited source is pinned by `packages/report-engine/upstream-lock.json`; only
three framework-independent modules are currently allowlisted. This is not a mirroring
of the entire Report Creation application or its Firebase/GCP services.

## Trigger without modifying the production main branch

The separate `sync-report-engine.yml` file on this integration branch is **not** registered
for direct manual invocation until it also exists on the default branch. GitHub requires
a workflow to exist on the default branch for `workflow_dispatch` and `schedule` events.
We must not quietly change `main` just to register this workflow.

Instead use the **already registered** `Verify ProInspect` workflow:

1. Open GitHub → Actions → **Verify ProInspect** → **Run workflow**.
2. Select `integration/report-creation-tool` as the branch, then run it.
3. After the full branch verification passes, the integration-branch-only
   `propose-report-engine-update` job checks the upstream `main` SHA.
4. If new, it imports only reviewed-portable modules into a branch
   `sync/report-engine-<upstream SHA>` and creates a PR **targeting
   `integration/report-creation-tool`**. It does not merge or deploy.
5. Review the proposed changed modules, run security and portal regression
   tests, and approve only after the adaptation remains compatible.

The normal branch `push` and `pull_request` verification jobs never invoke the
proposal helper. GitHub Actions must be permitted to create pull requests for this
to succeed; otherwise an administrator must enable that repository action or create
the PR manually. Source code changes are still pinned until review.

## Automatic upstream notifications

Continuous/unattended polling cannot be enabled exclusively from this non-default
branch with native GitHub schedules. A future approved workflow registration on the
default branch **or** an authorised upstream-to-target workflow dispatch would be
required. Neither has been configured, and none is claimed active. The manual
branch-selected proposal above is functional independently of an external provider
but should be acceptance-tested with an upstream change.

No fallback to an unreviewed package version, automatic merge, or Cloudflare
deployment is permitted. Version-pinned reports must continue using their
recorded template, renderer and content hashes.
