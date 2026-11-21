# Commercial and Strata preservation branch — 21 November 2026

**Status: ARCHIVED SPECIFICATION / CODE SNAPSHOT — NOT ACTIVE PRODUCT, NOT A RELEASE**

This branch was forked from production-linked `main` at commit `fdb7ef5c3d313397d9bf5cd6b35ce04f89765acf` (20 November 2026, merged PR #89). It preserves the **entire source tree**, including existing Commercial, Strata Manager, Building Manager, Resident/Member, Council, supporting legal/operations/billing APIs, D1 schema/migrations, UI, tests, and public assets as they existed immediately before the Residential-only product pivot. Future changes to main are intentionally not copied here.

The product owner has decided to focus ProInspect's active customer offering on Residential, Co-Living, Residential Leasing, Tenants, Maintenance and Staff Operations. **Creating this archive does not retire any live route, disable any account, alter Stripe, or deploy a Worker.** Retirement is a separate, tested change set on a Residential branch.

## Build specifications retained in this branch
- [COMMERCIAL_REACTIVATION_SPEC.md](COMMERCIAL_REACTIVATION_SPEC.md): Commercial owner/asset-manager/occupant experience, asset and lease lifecycle, authority and financial controls, implementation phases, source mapping and release tests.
- [STRATA_BUILDING_REACTIVATION_SPEC.md](STRATA_BUILDING_REACTIVATION_SPEC.md): Strata manager, professional building manager, resident/lot owner, council, facilities, governance, notices and safe issuance; scoped delivery and release requirements.

## Uploaded specification provenance (not committed as binary attachments)
The original owner-supplied DOCX specifications are externally held project inputs, not previously versioned in this public repository. Their file hashes are recorded for reliable future retrieval:
- `Commercial Portal Build.docx` — SHA256 `8ef8a6fb44e9b75dc7374f43d14994bf6772a850154ccf4c391ee6937bc3ab49`
- `Strata Portal Build.docx` — SHA256 `e51d2db0237ecb180760f9b4948bef8f1c578e6db639b5e76452b0e4c63a195c`
- `Building Management Portal.docx` — SHA256 `f478fef6caeec17a428621df36db0cd69f3ab1a434eed117fa5052a73fd493ae`
- `Strata Services.docx` — SHA256 `25e04597232df8ebf09d6f8129950325d0d7d5ceaacf32cf485d4511b58554c3`
- `Portal Engineering Build.docx` — SHA256 `44a8e48d2fba822881809079034560f53271da0476216fa6acc050384a9868a3`
- `Google Cloud and Stripe Integration Guide.docx` — SHA256 `63869942492af3d7268b43d550ecce9125e259067f8d1b6f8000887bc03da56a`

## Preservation and reactivation policy
1. Protect this branch from deletion and automated deployment; do not merge it back wholesale after main diverges.
2. Do not reset, rewrite or delete applied migrations 0001–0062 or production D1/R2/DO/Queue history merely because sector work is paused.
3. Keep old customer grants, accepted documents, invoices, reports, occupancy and audit records available under controlled retention/export decisions. An archive branch is NOT a customer-data backup.
4. On any future restart, cherry-pick or reimplement scoped components against the then-current main, reconcile identity and authority interfaces, and use **new, additive migrations**.
5. Commission new commercial/legal/provider/operational approval, independent hosted role tests, cross-account denial tests, reconciliation and recovery evidence before reactivation.
6. Remove external marketing and new sign-up/checkout only in the separately staged Residential pivot, accounting for any actual live customers or open cases.

Related current-state source includes `apps/platform/app/routes.ts`, `packages/domain/portal-navigation.ts`, `packages/marketing/sector-overviews.ts`, `apps/platform/worker/features/commercial-*.server.ts`, `apps/platform/worker/features/strata.server.ts`, `database/migrations/0039_*.sql`, `0040_*.sql`, `0043_*.sql`, `0049_*.sql`, `0055_*.sql` and `0060_*.sql`. These are pointers, not a deletion list.
