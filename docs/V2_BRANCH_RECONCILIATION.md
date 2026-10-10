# ProInspect-V2: accepted baseline and branch reconciliation

**Recorded:** 10 October 2026 (Australia/Perth)  
**Repository:** `info-rbp/proinspect`  
**Working branch:** `ProInspect-V2`  
**Parent and accepted source:** `main` at `113e931896edc23c7c324be6f9d3b5f703a4dbbb`  
**Main verification:** [Verify ProInspect — successful source acceptance](https://github.com/info-rbp/proinspect/actions/runs/37710009117) (8 October 2026).

## Decision

Start V2 from the **exact verified `main` source**, not from an older feature branch. Preserve all existing identity, role/asset authorisation, marketing enquiries, scoped document downloads, notices, work-order approvals, invoice/payment records, deployment locks, and test coverage.

A feature branch with a successful historical test is **not** a compatible replacement for the newer source. Do not merge it by copying its tree or replacing numbered database migrations.

This step preserves the accepted source and records what can be reused safely. It does **not** claim that the still-open continuity PR has been integrated or that new property-market features have been implemented.

## Branch reconciliation register

| Existing branch | Current relation to accepted main | V2 disposition |
| --- | --- | --- |
| `main` | Accepted baseline `113e931896ed`; CI success 8 October 2026 | Source of truth; preserve unchanged. |
| `feat/final-scope-config-review` | **Same 172 source blobs as `main`** at review; different commit ancestry | Functionally already present. Do not replay commits. |
| `feat/communications-acceptance` | Older implementation; 51 path differences versus `main` | Superseded by accepted main communications and final-scope changes. No blanket merge. |
| `feat/connected-portal-workflows` | Older foundation; 74 path differences versus `main` | Superseded by accepted connected-workflow implementation. Do not regress. |
| `feat/property-operations-core` | Older foundation; 121 path differences versus `main` | Historical reference only; protect current domain contracts. |
| `feat/enquiries-scheduled-notices` | Older source plus a temporary source-transfer workflow | Do not introduce `.github/workflows/development-bundle.yml` into V2. |
| `feat/continuity-acceptance` — [draft PR #3](https://github.com/info-rbp/proinspect/pull/3) | Validated in isolation on 6 October; diverges from newer `main`; 13 files changed independently on both sides | **Defer direct merge.** Integrate only reviewed, rebased feature slices through new additive migrations and V2 acceptance. Keep PR #3 open/unchanged. |

### Continuity PR #3 — concrete compatibility findings

1. **Migration numbers collide.** Accepted `main` already owns `0004_enquiries_notices.sql` and `0005_account.sql`. PR #3 introduces different `0004_communications.sql` and `0005_payment_attempts.sql`. Do not leave two files using the same migration version.
2. **The proposed notice schema is incompatible.** `main` already adds `building_notices.withdrawn_at` and creates `notice_deliveries` with `outbox_id`, delivery status and a `notice_id/user_id` key. PR #3 adds the same column again and defines a *different* `notice_deliveries` table keyed by notice version. Combining these migrations would fail or invalidate existing notice code. Preserve main's bounded, resumable dispatch and delivery-time checks.
3. **Document visibility has already advanced on `main`.** Current `packages/authorization/documents.ts` and scoped document endpoints must remain authoritative; do not overwrite them with the PR's alternate `document-scope.ts` implementation without validating identical multi-role isolation.
4. **Property records already have scoped pagination.** `main` implements the generic `records.server.ts` browser; evaluate whether PR #3's dedicated property directory materially improves UX before importing a parallel route.
5. **Payment retry/reconciliation remains a separate improvement.** Port payment checkout-attempt state and reconciliation UI from PR #3 with a new additive migration prefix (starting **0006** after the accepted five). Preserve existing payment and webhook receipts; validate delayed, duplicate and superseded settlements.
6. **Notices and resident communications need targeted feature review.** If versioned notice revisions are adopted, adapt them to `main`'s dispatch/outbox schema rather than replacing existing tables. Check cancellation/rescheduling messages, withdrawn audience access and current memberships.
7. **Single-digit lot numbers should be fixed in the canonical strata handler.** Revisit the `shortText` validation for lot labels and add a real request-level regression test before declaring this transferred.
8. **CI counts cannot be added together without running the combined suite.** The latest accepted `main` verification includes 76 local runtime checks and 11 browser journeys; PR #3 has overlapping earlier tests. Consolidate cases without dropping existing tests.

## Enforced guardrails on ProInspect-V2

- `.github/v2-migration-baseline.json` records the content-addressed blob SHA for all five accepted migrations. Existing migration bytes must not change; use a new file.
- `tests/schema.test.py` fails if migration prefix numbers are duplicated/gapped, or if any accepted migration changes.
- `.github/workflows/verify.yml` now runs the existing **verification suite on pushes to `ProInspect-V2`**, in addition to `main` and pull requests. No deployment automation is enabled.
- Work stays exclusively on `ProInspect-V2` until a separate, authorised coordinated merge. `main`, open PRs, secrets, deployed infrastructure and live domains are untouched.

## Next integration gate

Before making V2 functional changes: (1) pass Verify ProInspect for the V2 baseline commit; (2) reconcile PR #3 functionality as reviewed, bite-sized changes with non-colliding SQL migrations, preserving every successful main test; (3) only then begin V2 market/asset/service/subscription model changes.

Full design scope is the agreed 11-market property-operations business model, but this baseline step deliberately contains **no new services, pricing assumptions or production changes**.
