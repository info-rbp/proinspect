# Eight-portal authenticated production acceptance

This is an additional **fail-closed evidence gate**, not a shortcut to a production acceptance certificate. The main branch already has broad isolated Worker/D1/R2 and browser coverage. No production users, authentication tokens, sessions, accounts, records or grants may be fabricated to satisfy this checklist.

## Execution

1. Run existing `pnpm check`, `pnpm test:integration`, and `pnpm test:browser` against the reviewed source. Save exact-sha CI artifacts.
2. Confirm `/api/health` Worker SHA equals the reviewed main SHA; capture read-only D1 migration/foreign-key and recovery evidence. The Stage 2 read-only script is observational only.
3. Through legitimate mailbox control and real Turnstile, have each of the eight role identities authenticate. Never export magic links, session cookies or tokens. Use owner-approved synthetic properties/transactions.
4. Run the 12 Stage 2 cases AT-01 through AT-12 in `docs/STAGE2_LIVE_ACCEPTANCE.md`, each with positive and negative permission assertions and redacted reference to actual evidence.
5. Record mobile/keyboard/accessibility assessment, external email receipt, unauthorised document denial, and critical/high defects independently. A queue marked sent is not inbox-delivery evidence.
6. Supply a sanitised JSON record with schema 1, environment production, dataMode approved-synthetic, current observation time and exact SHA. Criteria each require status, observedAt, caseIds and an Actions run URL or artifact path; case records likewise. Eight identities require unique *opaque* identityRef, authenticated, authorisedScope, accessRevocationChecked, observedAt and evidenceRef. Defects and deployment/recovery verification are mandatory.
7. Execute `node scripts/portal-testing/acceptance-gate.mjs evidence.json <full-40-character-reviewed-sha>`. NO GO exits non-zero and writes `artifacts/portal-acceptance-result.json`. Missing evidence can never silently pass. Current production acceptance remains NO GO until genuine hosted sign-ins and transactions have been observed.

## Sources and non-goals

[Stage 2 register](STAGE2_LIVE_ACCEPTANCE.md), [Portal contract](PORTALS.md), [Authorization contract](AUTHORIZATION.md), [V3 activation](https://github.com/info-rbp/proinspect/issues/36).

**This branch does not enable disabled services, change billing, activate restricted statutory workflows, alter Cloudflare routing, or deploy to production.** Independent business/legal approvals and provider tests remain separate release gates.