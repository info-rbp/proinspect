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