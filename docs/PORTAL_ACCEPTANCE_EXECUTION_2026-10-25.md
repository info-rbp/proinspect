# ProInspect eight-portal final execution guide

**Status: NO GO until independently verified hosted evidence exists.** This guide is a concrete operating procedure, not an assertion that seven remaining mailbox holders have signed in.

## Q1 — Verify each real test identity without fabricating login data

1. Confirm all eight `*-testing@proinspect.systems` aliases route to test-owner-approved Google Workspace inboxes. The Staff Administrator inbox must be restricted to an authorised tester. The aliases are alternative addresses, not automatically eight Workspace accounts.
2. Run `stage2-live-readonly` (manual GitHub Actions) or `node scripts/portal-testing/stage2-live-readonly.mjs` with read-only Cloudflare credentials. Inspect `identityReadiness.roles`: expected aliases, verification flags and active-session presence; no login tokens or sessions are returned.
3. Get the **actual deployed SHA** from `https://proinspect.systems/api/health`. In a local headed browser with the correct holder present, use `node scripts/portal-testing/hosted-auth-exercise.mjs staff <40-character-deployed-sha>` (repeat `landlord`, `property_manager`, `commercial`, `strata_manager`, `tenant`, `building`, `council`).
4. Complete real Cloudflare Turnstile, request one email link, open it in the browser context, confirm the same alias on `/auth/complete`, then visit `/workspaces`. The runner checks `/api/session`, expected workspace, a negative unrelated workspace request and sign-out; no cookies or tokens are exported. Use a separate clean context for each alias. Do not request multiple links repeatedly (email rate limiting).
5. After sign-out, verify expired, revoked and ended memberships through AT-01/AT-08/AT-10. Signing out alone is **not** proof of membership revocation. A truly new Landlord onboarding must use a separately approved unused test mailbox: existing pre-provisioned aliases do not prove fresh registration.
6. Record only sanitized JSON evidence tied to the source SHA and reviewer. If a tester cannot receive a link or challenge fails, leave the role BLOCKED and diagnose the provider/sender/Turnstile setting without manipulating the user row.

## Q2 — Execute and verify AT-01 to AT-12

- Run `pnpm check`, `pnpm test:integration` and `pnpm test:browser` on the intended SHA. The CI suite then evaluates `isolated-scenario-coverage.mjs`, which maps real local Worker and Chromium pass results to the twelve AT IDs and explicitly says `acceptedForProduction:false`.
- Have the owner approve synthetic properties, scheme, user roles, inboxes, appointment slots and cleanup/retention rules before any live mutation. Never reuse a real client/property, publish a fee, execute a payment, or grant legal council authority to complete testing.
- For each case execute `node scripts/portal-testing/hosted-case-exercise.mjs AT-01 <deployed-sha>` (through AT-12), manually completing the positive and denied paths with the real, appropriately scoped logged-in users. Store the redacted proof and its SHA-256. Do not store user email, mailbox content, session cookies, one-time URLs or payment details.
- The script outputs a *pending-independent-review* case receipt. A separately authorised reviewer checks the live references and changes `reviewStatus` to `approved-independent-review` **only after** personally confirming the positive path, negative denial, cleanup and source identity. Rehash the reviewed receipt.
- If any path is missing or denied incorrectly, open a defect/PR, maintain NO GO, fix the code and retest on the new deployed SHA. Previously observed evidence against the old version cannot be silently carried over.

### Case execution matrix

| Case | Positive hosted journey | Must-deny path |
| --- | --- | --- |
| AT-01 | Eight real magic-link/Turnstile sign-ins and scoped workspace access | Unrelated workspace, replayed/expired link, post-signout session |
| AT-02 | Tenant maintenance -> Landlord -> Staff Work Order | Unrelated tenant/owner and private Staff notes |
| AT-03 | Subscriber booking -> Staff Work Order -> issued report | Duplicate scheduling and outsider file download |
| AT-04 | Agency-managed property and assigned team | Unrelated agency or ended membership |
| AT-05 | Manager escalation -> verified owner's approval -> Staff | Agency/staff owner impersonation |
| AT-06 | Resident common-property request -> Strata -> Staff | Other scheme/private tenancy |
| AT-07 | Council recommendation -> authorised operational outcome | Council self-authorisation or bypass |
| AT-08 | Tenant/Resident/Council single user role switching | Revoked council role while unrelated valid roles remain |
| AT-09 | Restricted draft -> reviewed issue -> recipient | Quarantined or revoked/outsider download |
| AT-10 | Scheme and audience-targeted notices | Withdrawn, revoked and unintended recipients |
| AT-11 | Genuine Turnstile public enquiry -> Staff triage | Forged-origin and unrelated Staff/client access |
| AT-12 | Commercial included booking -> Staff Work Order | Residential/agency cross-account view |

## Q3 — Formal approval checklist and safeguards

1. Exact checked-out `main` SHA, `BUILD_SHA` and `/api/health.source` must all agree; retain the successful GitHub Actions run artifact.
2. Preserve verified database migration identity, foreign-key integrity, D1 Time Travel recovery bookmark and an approved rollback procedure.
3. Attach eight distinct validated sign-in receipts and twelve distinct case receipts with their independent redacted source evidence. Retain independent evidence of real provider inbox delivery, document permission denial, mobile/keyboard accessibility, booking concurrency and correct cleanup.
4. Supply the schema-2 JSON containing all 12 acceptance criteria, 12 AT cases, 8 roles, source and digest references, no unresolved critical/high defects and a reviewer independent of the test identities.
5. Configure GitHub Environment **production-acceptance** with REQUIRED independent reviewers. Only after verifying this protection, set the Environment variable `PROINSPECT_ACCEPTANCE_REVIEWERS_CONFIGURED=true`. Nothing in source code enables it.
6. Collect redacted JSON receipts into `artifacts/portal-acceptance/hosted-evidence.json`, compute `evidenceDigests` SHA-256 for each file, and use the gated `hosted-portal-evidence-bundle.yml` workflow on an `acceptance/evidence-*` branch. This uploads an Actions artifact without creating production transactions.
7. Manually dispatch `hosted-portal-acceptance-review.yml` on `main` with **exact deployment SHA** and the evidence artifact run ID. It requires the GitHub protected Environment reviewer; checks current deployed source, all actual files/digests, identity and case contents, criteria dependencies, defect closure, and real human release approval. The output is an explicit GO/NO GO artifact; no automatic deployment or feature flag activation is performed by this review.
8. Maintain Stage 2 Issue #22 open until the final approved evidence is linked. A failed check or inaccessible inbox means NO GO, without exception.

### What is still not provable automatically

GitHub Actions cannot independently prove that a human physically controlled an alternate Gmail inbox, solved Turnstile, or lawfully authorised a real property or council action. It can verify exact source identity, file hashes, structural/negative-test evidence and review gates; a permitted human tester and independent business reviewer remain necessary. The 12 local CI cases are integration coverage only, not live acceptance.
