# Stage 6 — Controlled production deployment and market-launch acceptance
**Initiated:** 9 November 2026, Australia/Perth  
**Repository / Worker:** `info-rbp/proinspect` → `main` → existing `proinspect-platform` at `https://proinspect.systems`.  
**Scope:** Release-governance code and evidence tooling, not automatic activation of previously unapproved services.

## Critical distinction
**Production deployment** means verified source code is serving traffic through the existing Worker. **Market launch GO** means that the marketed scope, live customer journeys, operational/support responsibility, legal/commercial terms and hosted provider/role evidence have been independently accepted at that *exact* deployment SHA. A build, CI badge, synthetic fixture, D1 bookmark, R2 bucket listing or completed web page is not a substitute.

This release implements the **Stage 6 controls and review system**, not all of the uncompleted Stage 4/5 provider/legal engineering. The Stage 6 decision remains **NO GO** until separate protected human evidence reviews pass. Existing safe public pages, free accounts and approved scoped services can remain available without claiming a full product launch.

## Implemented Stage 6 engineering
1. **Administrator preflight:** `Staff → Release acceptance` displays eight clear gate findings, actual Worker `BUILD_SHA`, runtime binding presence, Wrangler migration ledger and service catalogue count. `NO_GO` is explicit until independent acceptance; no customer data, secrets, aliases or external payloads are returned. Missing `d1_migrations` is blocked rather than silently passed.
2. **Nine-portal acceptance:** extend the existing source-bound hosted gate from **eight to nine** distinct authenticated user roles, now including Building Manager. Ninth role must independently redeem a real email link, show its approved building assignment and be denied an unrelated tenancy. Tests, evidence bundle and protected review workflow require all nine. The eight pre-existing approved Google aliases are retained; **`building-manager-testing@proinspect.systems` is only a proposed ninth alias, not a claim that mailbox, user, building assignment or approval exists.** Do not auto-provision it, fake `verified_at`, copy other roles' sessions or widen unrelated building/tenant access.
3. **Final protected review workflow:** `.github/workflows/stage6-protected-release-review.yml` verifies current `main` SHA, live public `/api/health` and critical Worker bindings, plus a successfully completed **nine-role** independently protected production portal run for the same SHA. It downloads separately captured, redacted review evidence. A human-protected `production-launch` GitHub environment and explicit reviewer-configuration variable are required. No automatic activation or production writes.
4. **Evidence integrity:** `scripts/stage6-market-launch-gate.mjs` checks eight *distinct* JSON evidence files under `artifacts/stage6` with SHA-256 digests, source/environment/time bindings, independent owner/reviewer references, absence of obvious credential tokens and complete nine-role hosted evidence. This is a **necessary structural validation, not cryptographic proof of a human signature or the truth of an external provider claim**. Only a separate independent reviewer can check authenticity and decision authority.
5. **Private evidence bundle:** `.github/workflows/stage6-evidence-bundle.yml` scans files for secrets and accepts only bounded JSON documents before uploading an artifact for protected review. Evidence must not contain magic links, authentication cookies, payment-method details, tenant applications or unredacted reports.
6. **Regression tests:** schema manifest (53 migrations, 23 service definitions), nine-role test completeness, missing migration/critical binding, commercial unapproved flags, no-session/non-admin launch-readiness denial, wrong source and withheld/forged launch evidence. The normal GitHub verification suite remains mandatory.

## Eight Stage 6 release gates

| Gate | Minimum technical evidence | Independent approval evidence to mark GO |
| --- | --- | --- |
| 1. Source freeze | Exact `main` commit; branch/PR/code review; migration manifest | Reviewed SHA and approved **feature + marketing** scope, including exclusions |
| 2. Deployment | Cloudflare build result, deployed `BUILD_SHA`, 100% traffic and existing Worker bindings; public `/api/health` | Independent confirmation at canonical host; rollback and on-call owner |
| 3. Database | Correct `DB` UUID, 53 ordered migrations through `0053`, pre/post row-count evidence, FK/integrity check | Documented non-destructive backup and **isolated** D1+R2+Queue restore; no old database replacement |
| 4. Customer journeys | Free registration, real email/Turnstile, property authority, request and booking, Staff review, issued PDF | Actual hosted proof; paid subscription opt-in creates **no** customer payment until accepted |
| 5. Nine portal journeys | Nine *distinct* authenticated mailbox holders; direct URL cross-role denials, revocation and session expiry | Protected `Nine-portal hosted production acceptance` decision with all nine identities and twelve scenarios |
| 6. Commercial/legal | Signed 23-service definitions, pricing and subscription terms, GST/tax category, WA form versions, website claims vs permitted actions | Approved finance, commercial, legal/privacy and customer-facing copy for this exact version |
| 7. Operations | Worker query redaction/tracing, email and queue monitoring, open reconciling items, independent support processes | Named incident/support owner, real delivery/retry/reconciliation and full disaster-recovery rehearsal |
| 8. Activation | Every enabled feature flag has valid `feature_release_approvals` for exact SHA | Independent reviewer with proper authority; unapproved/unfinished capabilities remain OFF |

### Technical preflight contract
- `/api/staff/release-readiness` is existing authenticated administrator-only API. New `launch` section is **read-only**, `decision='NO_GO'` and includes the eight gate rows with preflight state and next evidence.
- An exact 40-character production SHA and correct binding presence are only **technical preflight** observations, not an independent deployment review.
- `d1_migrations` must match exactly **53** applied numbered migrations, latest `0053_account_first_free_registration.sql`. If a later numbered migration is approved, update the source-bounded expectation and re-test; a higher count is not silently accepted. A test fixture without Wrangler's ledger is expected to be blocked.
- The expected public service baseline is **23** catalogue entries. Presence in the catalogue is not proof that online paid booking is enabled; keep enquiries and quotations as the available public path when the live payment feature is off.
- Any configured flag without a valid source-specific approval blocks final activation. Even zero exceptions and all flags OFF cannot by themselves produce market GO.
- **Do not** add Stage 6 acceptance records or enable features in a source migration. Current additive schema is unchanged.

## How to make an independent GO decision
1. Independently review source, legal, commercial, hosted users, integrations, payments, restore and support coverage for the exact production Worker SHA. Record redacted, real, time-bounded evidence and **different** owner and reviewer references per gate.
2. Obtain nine real authorised identities. The proposed Building Manager alias needs mailbox approval and a legitimate `building_manager_assignments` record independently approved under migration 0039; never infer authority from resident scheme membership.
3. Capture each gate file at `artifacts/stage6/<gate>.json`, with fields `gate`, `sourceSha`, `environment:'production'`, `outcome:'approved-independent-review'`, `reviewerRef`, `executionComplete:true`, `observedAt`. Omit personal data and secrets.
4. Prepare `artifacts/stage6/market-launch-evidence.json` with `schema:1`, exact `sourceSha`, `environment:'production'`, `dataMode:'approved-real-hosted'`, `observedAt`, `reviews` for all eight gates (each `status:'approved'`, `sourceSha`, `reviewedAt`, `ownerRef`, distinct `reviewerRef`, `evidenceRef`, correct SHA-256 `evidenceDigest`), `defects` (no unresolved critical/high), and `hostedPortalAcceptance` with exact SHA, `acceptedForProduction:true`, nine of nine identities, twelve of twelve cases/criteria, current `observedAt` and a `protectedReviewRun` pointing to the independently protected nine-portal GitHub run.
5. Push only **redacted JSON** evidence to a reviewed `acceptance/evidence-*` branch; the evidence-bundle workflow uploads the artifact. Never commit customer documents, tokens or payment receipts. Referenced source/proof authenticity is separately checked by the independent reviewers.
6. Configure required independent reviewers on the GitHub **`production-launch`** environment and only then set its variable `PROINSPECT_LAUNCH_REVIEWERS_CONFIGURED=true`. Do not set the variable to bypass missing protection.
7. Manually dispatch **Stage 6 market launch independent acceptance** on `main` with the exact deployed SHA, the redacted evidence bundle workflow run ID and a successful independently protected nine-portal review run ID. A GO decision is recorded as a private GitHub Actions artifact; **the workflow does not enable feature flags or perform payment actions**.
8. Review and activate only specifically approved feature flags through existing restricted release-authorisation and Cloudflare operations. Re-verify the Worker source SHA and all critical bindings after any change. An activation changes production behaviour and requires separate acceptance of price, tax, provider and statutory terms.

## Production verification known as of 9 November 2026
- Existing Worker and Cloudflare D1/R2/Queue identities verified in Stage 5; Worker was deployed at `8ae4f6173e467f27bd25c9fd117d1b9aa76adb01` with sampled logs/traces and query-string redaction.
- Cloudflare read-only D1 reports **53** migrations, `0053` latest and **zero foreign key violations**. D1 Time Travel bookmark available, but **full isolated restore not performed** and separate integrity-check API request failed. Do not mark recovery accepted.
- Both private R2 managed `r2.dev` domains were disabled; event and DLQ metric backlogs were zero at last observed check. Neither proves restored object integrity or successful message replay.
- Stage 5 found dedicated restricted `STRIPE_RESIDENTIAL_LIVE_KEY` missing from Worker configuration, plus unresolved GST, tax-code and signed webhook/provider acceptance. **Do not enable live residential subscriptions or assume advertised prices are chargeable.**
- Nine independent hosted roles are **not** accepted, and old eight Google alias records are not automatically upgraded by this code.
- Substantive Stage 4 reporting, invoice correction, bank reconciliation and WA statutory form/provider work remains open, and PR #89 Stage 2 is still draft as of the initial audit.

## Rollback and availability
The existing `main` → Cloudflare Workers Builds route remains the only normal production deployment. This Stage 6 tranche has **no D1 migration**, no new Cloudflare resource, no Stripe/live provider mutation, and no customer-record write. Preserve source rollback capability but remember: rolling back Worker code does not reverse database writes or provider actions. Never roll back to a version incompatible with current D1 schema. For incidents, disable only the affected approved capability; retain safe free registration and public enquiry where operationally possible.

## Recorded release classification
- **Stage 6 release controls implemented in source:** testable and mergeable after exact-head CI.
- **Technical deployment:** requires actual Cloudflare merged SHA and public smoke readback.
- **Market launch GO:** **not asserted** without source-matched protected nine-role acceptance, legal/finance/product sign-offs, exact data restore and actual provider evidence.
- **Full retained product completion:** remains separately gated by the 110-task handbook and outstanding Stage 4/5 work. A technical release does not close that work.
