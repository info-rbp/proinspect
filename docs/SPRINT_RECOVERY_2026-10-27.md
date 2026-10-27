# Final sprint recovery and hardening - 27 October 2026

## Recovered checkpoint (verified, not reimplemented)

PR #53 already merged the 11 integration workstreams into main `82fe6d236885d18e2baac4a7923272c0d7503762`, tree `8b00244f439ac0853b077072c4d081867fe599e3`. Main verification run `40352421207` succeeded. Production BUILD_SHA matches that source. Staging runs candidate `0e992ae3a8127f0945e8a10295c0a11bf617a5a4` with the same tree. Both D1 environments have 44 migrations through `0044_agency_owner_invitations.sql`, with no foreign-key violations. No original development PRs remain open; their source branches are retained.

The prior execution therefore stopped after a successful integration/deployment, not before the merge. Issue #54 remains the authoritative unresolved acceptance and parity register. No missing-provider or legal approval has been treated as complete.

## This continuation

- Offline acknowledgements delete only the exact encrypted snapshot uploaded, in one IndexedDB transaction. A newer concurrently saved draft is retained and the UI does not reload over it.
- Offline destinations must be the original workspace, redirects are refused, malformed acknowledgements retain local evidence, and photographic queues decrypt one file at a time rather than loading every encrypted image.
- Re-uploading an existing photograph validates the requested area/component and links the same evidence record to that section. Rejected evidence cannot be silently restored. Exact retries do not duplicate references or revisions.
- Native PDFs now include working/test/comparison status, review status, test method, defects, maintenance decisions and area evidence references. A4 typography, measured wrapping, pagination and photographic captions replace fixed character slicing. Latin accented text and typographic punctuation use explicit WinAnsi encoding. Unsupported scripts stop with a clear error rather than silently corrupting text. This is NOT complete multilingual/font or original-tool parity.
- Rendering verifies the approved layout hash as well as content/evidence hashes. Previously issued PDFs and their immutable manifests are untouched; new output records renderer version 2.
- Invoice observations preserve coherent balances and settled states. Invalid amounts, ambiguous same-second changes and contradictory later snapshots create auditable reconciliation exceptions rather than overwriting financial records. Concurrent projections use compare-and-swap inside the existing provider-receipt transaction. No entitlements are modified.
- Refund execution rechecks that its independent approving operator remains active, verified and authorised before making a provider instruction.
- Administrator release readiness identifies missing/invalid provider bindings and incomplete adapters without returning secret values or equating configuration with acceptance. Production billing still reports sandbox-only.

## Verification

Targeted Node tests: 22 passed locally. Existing schema tests: 29 passed; reporting schema tests: 7 passed. Real IndexedDB race/interruption browser cases and Worker evidence/invoice/refund regression cases are added to the full CI suite. A synthetic pre/post PDF was rendered and visually reviewed; no real property evidence was used. Exact-head combined CI and staged deployment evidence must be recorded before merging this continuation.

All 44 existing migrations are unchanged. No new migrations, live charges, transfers, refunds, subscriptions, tax registrations, production test accounts, fake verification flags or legal approvals are created by this source patch.

## Still externally blocked or incomplete

Staging has no Stripe API/webhook credential, no real email/Turnstile acceptance and no approved feature-release records. Stripe sandbox Tax remains pending with missing head-office facts. Production has 23 unpriced service records. Reference SKUs do not themselves approve prices or publication. Contractual plan/frequency conflicts, official WA source bytes and reviewed field maps, signing execution, private scanning, provider handoffs, authentic nine-role acceptance and business/legal approvals remain outstanding. Native full multilingual/media/annotation/offline parity, production financial activation and extended regulated money workflows are not certified by this change.

## Resume rule

Read current main SHA, PR state, full CI, Worker BUILD_SHA, migration ledger and Issue #54 before resuming. Never replay the original branch trees or renumber already-applied migrations. A configuration-only or source-only pass must not claim genuine provider/user acceptance.
