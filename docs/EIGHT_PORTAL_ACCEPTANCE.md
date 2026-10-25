# Eight-portal authenticated production acceptance — execution contract

> **Status: NO GO** until actual sign-in, scoped transaction, negative authorisation and provider evidence is observed. This document and its tests do **not** establish a live acceptance certificate.

## What is automated

The existing isolated test suites provide extensive Worker/D1/R2, scheduling, document and browser workflow coverage. Additional release coverage includes:

- `tests/runtime/connected.mjs`: eight **separate** identities and workspace boundaries (64 role/scope evaluations, with a deliberately independent Tenant/Building multi-role user), cross-scheme denial, subscriber-booking Staff handoff, council advice vs authorised decision, tenancy expiry, notice isolation, restricted document grants, optimistic concurrency, maintenance routing, and report issuance.
- `tests/browser/connected.spec.ts`: genuine rendered UI in local isolated Chromium for Landlord, Tenant, Property Manager, Commercial, Strata Manager, Resident, Council and Staff, plus negative cross-account/cross-role API checks, maintenance/PCR handoff and responsive screenshots.
- `tests/runtime/run.mjs`: onboarding subscription, automatic scheduling, one Work Order per booking, idempotence/conflict checks, single-use auth, inspector assignment, report grants, and tenancy expiry.
- `tests/runtime/communications.mjs`: notices, multi-role recipient suppression, withdrawal, retries, duplicate delivery prevention and signed enquiry.
- `tests/portal-acceptance-gate.test.mjs`: explicit NO GO regression for missing/stale/fabricated-looking evidence, denied-access gaps, secret contamination, unresolved defects and source mismatch.

Run `pnpm check`, `pnpm test:integration` and `pnpm test:browser` in the pinned GitHub verification workflow, then inspect its exact SHA, screenshots and JSON logs. Isolated local sign-in shortcuts **never** count as genuine production email/Turnstile acceptance.

## Live observational baseline — 25 October 2026

- `main` and Cloudflare production `BUILD_SHA`: `eea7584fc612d3b4d872434165008d0d77dc9b74` before merging this branch.
- Cloudflare D1 read-only aggregate: **8** named test identities, **1** has a `verified_at` value; **0** currently active sessions; **0** foreign-key violations.
- These aggregate observations do not establish which role completed a real sign-in or any successful hosted business transaction.
- Existing Stage 2 historical records use the old Workers.dev hostname and describe a pre-cutover baseline. The current canonical origin is `https://proinspect.systems`. The observational script has been updated accordingly.

No production identity, session, customer, membership, booking, payment, document or permission was created or modified during this review. The eight mailbox aliases must be legitimately controlled and test sessions redeemed by their intended account holder. Do not alter `users.verified_at`, token hashes or production session rows to obtain a passing gate.

## Hosted Stage 2 execution — AT-01 through AT-12

| Case | Who performs it | Observations to capture, including denial |
| --- | --- | --- |
| AT-01 | All eight roles | Real Turnstile + email-link redemption, role-scoped workspace, unrelated role denied, sign-out/revocation |
| AT-02 | Tenant, Landlord, Staff | Tenant request once, Landlord/manager review, Staff Work Order, outsider request denied |
| AT-03 | Landlord/agency, Staff, client | Included-service booking, one scheduled Work Order, reviewed PDF issuance, outsider download denied |
| AT-04 | Property Manager, Staff/team | Management authority, assigned property lists, unauthorised agency client denied |
| AT-05 | Property Manager, verified owner, Staff | Authority escalation and explicit owner decision, agency/staff impersonation denied |
| AT-06 | Resident, Strata Manager, Staff | Common-property request, staff dispatch, unrelated scheme and private-lot access denied |
| AT-07 | Strata Manager, Council, Staff | Council recommendation recorded, unauthorised direct decision denied, authorised outcome recorded |
| AT-08 | Multi-role Tenant/Resident/Council identity | Separate workspaces, role-specific notices, council term revoked without ending tenancy/resident rights |
| AT-09 | Staff, document recipients | Draft quarantine, correct issued recipient download, outsider and revoked grants denied |
| AT-10 | Strata Manager, resident, Council | Targeted notices, withdrawn/ended recipients suppressed, other audience denied |
| AT-11 | Public enquiry, Staff | Contact signed/Turnstile checked, Staff triage, unauthorised client creation and staff view denied |
| AT-12 | Commercial owner/client, Staff | Commercial property/inspection and subscription, unrelated residential/agency view denied |

Use owner-approved **synthetic** fixtures and dedicated recipient mailboxes. Capture redacted screenshots, request IDs, expected/actual statuses, timestamp and exact Worker source SHA for each case. Do not store passwords, access tokens, magic links, raw cookies, or personal/financial/medical content in evidence.

## Production acceptance evidence contract

The gate uses **schema 2** (supersedes the previous schema 1 draft). Every pass must have actual reviewed evidence and a matching full 40-character deployed source SHA. Criteria must name the *specific* dependent AT cases, not just AT-01 for everything.

1. Supply `schema: 2`, `environment: production`, `dataMode: approved-synthetic`, `sourceSha`, and fresh UTC `observedAt`.
2. Supply eight `identities` objects named `landlord`, `property_manager`, `commercial`, `strata_manager`, `tenant`, `building`, `council`, `staff`. Each requires a unique opaque `identityRef`, `authenticated`, `emailLinkRedeemed`, `turnstileChecked`, `authorisedScope`, `accessRevocationChecked`, exact `sourceSha`, fresh `observedAt`, and redacted `evidenceRef`.
3. Supply all `cases` `AT-01` through `AT-12`, each with `status: pass`, matching `sourceSha`, `positiveAccessChecked: true`, `negativeAccessChecked: true`, fresh `observedAt`, and `evidenceRef`.
4. Supply each `criteria` name shown in `scripts/portal-testing/acceptance-gate.mjs` with `status: pass`, matching `sourceSha`, fresh `observedAt`, `evidenceRef`, and `caseIds` containing every dependency in `REQUIRED_CASES`.
5. Supply `deployment` with matching `workerSha`, `recoveryVerified: true`, `observedAt`, `evidenceRef`; `releaseReview` with `decision: approved`, a non-secret `reviewerRef`, fresh `observedAt`, `evidenceRef`; and a `defects` array with no unresolved high/critical items.
6. Evidence references must be sanctioned GitHub Actions run URLs or paths under `artifacts/`; the acceptance reviewer must independently verify each referenced item is genuine and tied to the right source SHA. The script verifies schema and linkage **only**, not the truth of external evidence.

Run `node scripts/portal-testing/acceptance-gate.mjs evidence.json <reviewed-40-char-sha>`. A NO GO exits non-zero and reports blocked areas. It must not run against fabricated completed evidence in production.

## Release decision and rollout procedure

1. Verify PR branch CI green at exact head SHA; do not auto-merge known defects or incomplete tests.
2. Review sensitive permissions and any D1 migrations for forward-only safety. Keep a Cloudflare recovery bookmark and production-bound database checksum/record-count evidence before any schema change. This acceptance-only PR has **no new migration**.
3. Merge only reviewed source. Verify `main` SHA and Cloudflare `BUILD_SHA` after Git-triggered deployment. An application source match is not a completed hosted-acceptance certificate.
4. Run the **read-only** Stage 2 observation script and external provider health checks. Never create production test identities through SQL or import sessions into browser automation.
5. Have authorised mailbox holders execute the twelve hosted cases. Fix discovered defects in separate reviewed PRs with regression tests, repeat affected cases and negative checks, and check notifications/attachments for misdelivery.
6. Require all case/criteria evidence, an independent reviewer approval and zero unresolved P0/P1 defects before changing the overall stage to GO. Otherwise retain NO GO while the application remains operational within its previously approved scope.
7. If any verified production regression occurs, halt further feature activation, use the existing deployment rollback mechanism, recheck DB identity and record integrity, and record the incident against the exact source SHA.

Source contracts: [Stage 2 historical register](STAGE2_LIVE_ACCEPTANCE.md), [Portal contract](PORTALS.md), [Authorisation](AUTHORIZATION.md), and [V3 activation issue](https://github.com/info-rbp/proinspect/issues/36). No changes here activate guest payments, restricted statutory handling, clinical workflows or disabled third-party services.
## 25 October 2026 — three-task executable acceptance update

**Task 1 — genuine eight-role authentication:** Run the read-only Stage 2 audit to identify *which* role aliases remain unverified. The resulting `identityReadiness` includes only role names and booleans, never magic-link URLs, user IDs, cookie or session values. With the authorised Google Workspace mailbox holder physically present, execute `node scripts/portal-testing/hosted-auth-exercise.mjs <role> <currently-deployed-sha>` in a desktop terminal. The headed browser requires the user to complete actual Turnstile and redeem the one-time email link. The runner tests a fresh anonymous context, matching `/api/session` user/role, an unrelated restricted workspace and real sign-out. It never claims membership revocation was tested merely because the user signed out. Repeat with a fresh context for all eight roles. At the 25 October read-only audit, only the Landlord identity was verified and zero active sessions existed. No password, cookie, magic link, email message or live session was inserted or copied to the repository.

**Task 2 — twelve synthetic production scenarios:** `scripts/portal-testing/acceptance-manifest.mjs` is the shared set of AT-01 through AT-12 actors, success requirements, denial requirements, cleanup and corresponding isolated CI checks. For approved *production* synthetic fixture IDs, run `node scripts/portal-testing/hosted-case-exercise.mjs AT-02 <deployed-sha>` (repeat AT-01–AT-12). It requires an interactive tester and explicit fixture approval, opens genuine sign-in contexts for the relevant real email alias holders, and records the human-observed positive/negative results, cleanup and SHA-256 of a **redacted proof**. It does not silently create public bookings, collect money or export credentials. Local CI now generates `artifacts/portal-scenario-coverage.json` after the Playwright and Worker/D1/R2 suites, referencing actual passing local checks. A local CI case is **not** a live passing hosted case.

**Task 3 — formal GO/NO GO:** Create the default blocked `artifacts/portal-acceptance/hosted-evidence-template.json` using `node scripts/portal-testing/acceptance-evidence-template.mjs <deployed-sha>`. Only after real hosted observations and independent review fill `hosted-evidence.json` with all eight identities, twelve AT cases, twelve criteria, exact SHA, cleanup, deployment recovery and critical/high defect review. Add SHA-256 `evidenceDigests` entries for every referenced file. `scripts/portal-testing/verify-launch-evidence.mjs` rejects missing files, duplicate identity/case proofs, tampered hashes, incomplete positive/negative checks, missing real sign-in proof and absent independent review. It never grants permission or deploys a Worker. The `hosted-portal-acceptance-review.yml` workflow additionally requires a deliberately configured `production-acceptance` GitHub protected Environment with required independent reviewers and an explicit `PROINSPECT_ACCEPTANCE_REVIEWERS_CONFIGURED=true` environment variable. This variable is **not** set by the code. The review job also checks `main` and the deployed Worker match the exact requested SHA before evaluating evidence. Without all requirements, the result is NO GO.

**Evidence transfer:** Only sanitize **JSON receipts** (no screenshots, personal data, cookies, access links, or unredacted logs) may be force-added under `artifacts/portal-acceptance/` on an ephemeral `acceptance/evidence-<date>` branch. `hosted-portal-evidence-bundle.yml` rejects oversized, symlinked or secret-shaped content and uploads a separate short-lived `proinspect-portal-hosted-evidence` Actions artifact. Use its run ID as the manual review workflow input. This procedure does not itself make an account verified, an evidence record truthful or an environment reviewer independent; the release administrator must inspect the underlying source and real consented observations before approval. A temporary Git branch retains its commits in Git history, so never upload private screenshots or raw customer evidence even if the branch will be deleted.

**Do not enable** unapproved guest pricing, Stripe charges, restricted WA forms/bonds, Google Calendar writes or scanner bypasses merely to satisfy a portal acceptance case. The correct outcome of an unapproved case is BLOCKED, not a fake pass.
