# ProInspect-V2 — Reconciliation, continuity decisions and source-freeze handoff

Recorded: 11 October 2026, Australia/Perth.
Scope: development-only. Keep the V2 branch; do not merge it into main, deploy Cloudflare Workers, alter live D1, or commercially activate specialist services.

## Main baseline and merge

V2 retains the original immutable 0001–0005 migration blobs and adds 0006–0011 in sequence.

The newer main unified-site source at 35d37f77bc4ac779baa52e9dd3356501b315c8fd was reconciled in two-parent commit 8b8757a39d54e8e162b9d6c19a96931d198f6b47. This preserves public marketing and platform routes on one Cloudflare Worker; main's direct Cloudflare Builds and connected binding architecture; original portal-security tests and test identities; and all V2 operations routes and migrations.

Main's one-time production D1 test-provisioning workflow is guarded to main and its exact path filter, not V2. Source CI dry runs are not deployments. Changes made to main *after* this merge are outside the frozen snapshot.

## Fixed defects

1. Enterprise reporting filters: distinct inner SQL aliases prevent outer engagement shadowing, and client/market restrictions are applied to the correct source records. Cross-client and same-property cross-market regression scenarios exercise compliance and capital totals.
2. Independent evidence reviews: V2 condition observations and compliance evidence cannot be verified/rejected by the person submitting them. The API returns 403, and additive D1 migration 0011 enforces the same at the database boundary. Both schema and Worker negative tests prevent direct SQL bypass.
3. Strata lot numbers: a single-digit lot such as 1 is allowed without weakening common-area/building-name validation. Included in connected-workflow acceptance.
4. Unified Cloudflare build: main's one-site React Router routes, deployment configuration, portal provisioning tests and docs are retained, while V2 routes are added without overwriting main's public and authenticated navigation.

## Review of the still-open draft continuity PR #3

Draft PR: https://github.com/info-rbp/proinspect/pull/3

The PR remains open and is NOT merged. Its alternative 0004/0005 migrations conflict with the accepted 0004/0005 schema and must never be copied or replayed into V2.

| Proposed feature | Frozen-V2 decision |
| --- | --- |
| Workspace-scoped documents | Preserve newer main's accepted document RBAC, avoid duplicate scope modules |
| Scheduled notice dispatch, retries, withdrawal suppression | Preserve main's canonical bounded dispatch, do not import incompatible notice tables |
| Proposed notice version editing and inspection rescheduling mail | DEFERRED for a separate change and acceptance |
| Keyset property directories | Existing scoped records implementation retained; do not duplicate |
| Single-digit strata lots | Targeted fix and real runtime test INCLUDED |
| Delayed Stripe settlements, checkout attempts, payment reconciliation UI | DEFERRED. Rebuild in a later branch with a new additive migration, receipt/idempotency tests and provider review |
| Historical browser tests | Main's accepted tests retained, V2 tests added; unique PR cases can be adopted later |

Deferral is a formal scope decision, NOT a claim of delivery. The draft PR and its branch are unchanged.

## Business and statutory approvals that remain pending

The 11 markets, 69 draft V2 service definitions (including 23 legacy mappings), 33 proposed plan versions, 613 suggested market-service rules, 55 specialist module definitions and pricing/rate cards are development candidates, not a line-by-line signed-off master catalogue. Tests do not approve commercial terms.

The business owner must separately verify and sign off the exact service/market matrix, legal exclusions, pricing/margins/GST and customer package allowances; appointment boundaries; supplier qualifications, insurance and credentials; statutory/privacy safeguards; each seven-check specialist release gate; and customer pilot outcomes.

No master workbook or provider authorisation is declared approved by this document. All new market packs remain gated and no new regulated/clinical, NDIS, trust-money or formally appointed property-management authority is implied. Compliance dashboards are not statutory certificates, and capital commitments are not supplier payments.

## Freeze policy

After the final exact-SHA V2 CI run passes, stop all commits, rebases and force pushes on ProInspect-V2. Preserve the Git commit SHA and GitHub Actions URL as the frozen source reference. Future main reconciliation and deferred continuity work must occur on a *new* authorised branch. Do not merge, deploy, enable services or move live data under this source-freeze instruction.

The available GitHub connector does not support writing repository-administrator branch rulesets or branch protection. This freeze is an explicitly documented change-control restriction, **not** a technically enforced lock. An administrator must configure a GitHub ruleset preventing direct pushes, force pushes and deletion of ProInspect-V2 to enforce immutability.

The definitive freeze SHA is the final verified branch HEAD (this file cannot embed its own resulting commit SHA).
