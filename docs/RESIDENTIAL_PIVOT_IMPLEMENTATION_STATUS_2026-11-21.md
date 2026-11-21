# Residential pivot — implementation and release evidence

**Decision: DRAFT / NO PRODUCTION GO. Phase 6 is on hold.** This is substantial implementation of Phases 0–5, not certification that every requirement in the portal specifications is complete. No main merge, live Stripe activation or Google Cloud change is authorised by this evidence.

## Controlling scope and preservation

- Owner decision: one Residential All Inclusive Subscription, AUD 50 ex GST / AUD 55 inc GST, weekly per property, initial 24 months, 60 days written notice, no per-room subscription. Free registration and separately quoted Co-Living operating agreements remain distinct.
- Plan: PR #114, `plan/residential-only-pivot-20261121`, plan commit `802ed4e87bc3cca34dfc3bcd5aec3576d52478ee`. This branch includes a copy with the confirmed decisions above the original text.
- Source and production baseline: `fdb7ef5c3d313397d9bf5cd6b35ce04f89765acf`.
- Preservation: `archive/commercial-strata-pre-pivot-20261121`, commit `c00a285e167fbbfdc8080c28fd2f69092ba62d01`. Its code matches the baseline; additional `docs/retired-products/` files describe builds, reactivation and specification provenance. It was inspected and left unchanged. Restore in a separate checkout; never force-push this archive or reactivate by merging it blindly.
- Implementation branch: `implementation/residential-only-pivot-20261121`.
- Reference review covered the approved plan, completion guide, Residential Portal Build, Operations Portal Build, Portal Engineering Build, fee schedule and Co-Living framework. Original supplied/synced files were read-only. The old fee schedule is not approval of the new plan's allowances or early-exit rules.
- Existing legacy records are retained. No speculative legacy-customer servicing, customer termination, data erasure or historical contract conversion was performed.

## Phase status

| Phase | Implemented in this branch | Acceptance still required |
|---|---|---|
| 0 | Baseline/Worker/bindings/migration ledger inspected; existing preservation branch verified; separate feature branch and guarded staging workflow | Independent archive reproduction/review; exact final PR-head review |
| 1 | Exact nine header entries; one weekly property plan; Residential catalogue/SEO/signup/agency choices; retired routes 410; Student Living redirects to Co-Living; stale monthly/room prices removed from active Residential pages and legal drafts | Owner content/browser sign-off; broader crawl of retained historical content |
| 2 | Server guards on authenticated new sector actions, stale Staff requests and property mutations; domain guards for onboarding/property/organisation/commercial intake; new commercial listing/application acquisition removed; historic scoped reads retained | Complete route-by-route and queued-retry audit, independent security review; old multi-sector test harness migration |
| 3 | Owner/agency property-action dashboard, needs-attention counts, scoped property links, next visits, booking-change guidance, report-progress/issue distinction, billing links; retired Staff tools hidden. Existing tenant/maintenance/Co-Living/leasing/reporting workflows retained and exercised selectively | The full Residential and Operations redesign specifications are NOT complete: unified operational case/exception workbench, all template/Unicode/annotated-photo PDF parity, large-media offline acceptance, all role-authenticated hosted journeys and provider deliveries |
| 4 | Additive 0063 immutable per-property weekly contract; mandatory matching approved terms/consent; fixed quantity one; signed provider commencement; written cancellation notice with conservative earliest date and replay safety; signed invoice amount checks; immediate portal cancellation blocked for the new contract | Real Stripe test-mode Checkout, tax/invoice/provider reconciliation, approved inclusions/extras/renewal/early-exit terms, reviewed payment-method-only portal, independently authorised provider cancellation scheduling. Notice receipt does not stop billing |
| 5 | Local build/domain/schema/security/browser evidence; synthetic R2 recovery; actual local Cloudflare D1 0062→0063 recovery/reapply; guarded staging-only CI/deploy and hosted browser script | Broad CI not green; independent hosted role/provider acceptance; remote restore drill and R2 recovery acceptance; approved production merge/deploy/observation |

## Environment boundaries observed before deployment

| Resource | Production (read-only) | Existing isolated staging target |
|---|---|---|
| Worker | `proinspect-platform`, source baseline above | `proinspect-v3-staging`, prior source `799dfdff981079499d971b45b4c4431b653c9683` |
| D1 | `dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea`, ledger through 0062 | `e66b8ebc-637d-4737-8d47-b0fbec3c082c`, ledger through 0057 before release |
| Documents | `proinspect-production-documents` | `proinspect-v3-staging-documents` |
| Restricted documents | `proinspect-platform-restricted-documents` | `proinspect-v3-staging-restricted` |
| Queue | `proinspect-platform-events` | `proinspect-v3-staging-events` |
| Provider activation | No flags changed | `APP_ENV=staging`, `EMAIL_PROVIDER=local`, all `*_ENABLED=false`, no cron |

A request for another isolated D1 database was rejected by Cloudflare with `System limit reached: databases per account (10)`. No database was deleted to obtain capacity. The workflow therefore reuses the existing staging resources, isolated from production but shared with earlier preview work. Staging migrations are additive 0058–0063; no production migration is requested. Staging Time Travel bookmark observed before deployment: `0000004c-00000000-0000512a-851f3e473c64b54175114b058c28cac4`. A bookmark alone is not recovery proof.

The staging URL is https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev. **Deployment outcome and exact SHA must be read from the PR's workflow run and `/api/health`; the existence of this URL does not prove this branch is deployed.** Deployment results are recorded in the delivery update below.

Hosted signup is intentionally fail-closed while staging email/security providers are uncommissioned. Public review is possible after a successful preview; role-authenticated owner acceptance requires approved staging provider setup and synthetic accounts. Do not expose magic links, add a login bypass, use production credentials or pretend local login tests prove hosted delivery.

## Verification actually run locally

- `pnpm check`: handbook/schema register, TypeScript, 321 domain tests plus 47 additional checks, SQL suites and both application builds passed before the final delivery commit. Later CI must repeat these on exact committed source.
- Updated core `tests/runtime/run.mjs`: owner registration/property/booking, request-to-work-order, tenant privacy, revoked access, service-interest authority and retirement/history checks passed.
- Independent runtime sweep: `open-home-resend`, `rental-journey`, `managed-intake`, `final-pass`, `reporting`, `stripe`, `residential-live`, `pcr-campaign`, `invoice-delivery`, `co-living`, `registered-booking`, `residential-pivot` passed. Provider adapters in these tests are synthetic; these results are not email-delivery or real-payment acceptance.
- `weekly-billing.mjs`: synthetic provider test of legal consent, weekly price/tax/quantity, immutable 24/60 contract, duplicate Checkout, signed commencement and written-notice gate. Exact final result recorded in CI.
- 16 selected Playwright tests passed: 320/390/1440 public flows, retirement/data-route/SEO checks, booking hydration, open-home malformed selection, Staff/client/mobile report permissions, encrypted offline draft/evidence recovery, Staff Today and free owner portal. Screenshots are in workflow artifacts.
- `residential-isolated-d1.mjs`: actual local Wrangler D1 migration to 0063, complete recovery to 0062, historical property equality, reapply, integrity and foreign keys passed. `residential-recovery.py` separately checks full SQLite dump equality. These are not remote Time Travel restore acceptance.
- Synthetic R2 put/backup/delete/restore compares exact bytes in an isolated Miniflare bucket. No customer file or hosted R2 object was deleted.

### Known failing wider regression suites — release blockers

The sweep also ran `connected`, `communications`, `reporting-portals`, `v2`, `sprint`, `commercial`, `commercial-application`. They fail where older fixtures expect retired-sector creation/mutation to succeed. These failures are retained visibly; no CI check is disabled to conceal them. The full `pnpm test:integration` therefore remains red at the first such failure. Adapt these fixtures to historical read-only setup and retirement assertions while preserving shared Residential coverage. The full older browser suite contains obsolete Commercial/Strata acquisition expectations and is not claimed green. A green **targeted preview** job cannot substitute for broad CI or independent acceptance.

## Legal/provider gates

The published source remains a review draft, with all legal approval booleans false. Checkout requires an effective independently approved `subscription-terms` version labelled `residential-all-inclusive-weekly-2026-11`, the complete current document set and explicit recorded consent. The normal source-specific release gate remains in place. No new plan conversion or charge occurs at registration.

The Stripe connector returned an authentication error and requires reauthentication. No Stripe products, prices, tax settings, customers, subscriptions or live payments were created/changed through the connected account. Existing price IDs are validated by the adapter before use; they are not assumed correct solely because they are in source. Real test-mode acceptance and corrected approved tax classification are outstanding.

Written notice records `pending_review` and the later of commencement + 24 calendar months or receipt + 60 days. It is not a provider cancellation request. Legal exceptions, renewal wording and provider scheduling must be approved and independently tested before enabling charges. This implementation does not fabricate an early-exit fee or penalty.

## Rollback and production hold

1. Keep production on baseline until exact-head broad CI, security, legal, provider, recovery and owner acceptance are complete. Main automatically deploys the production Worker.
2. Before a production migration, obtain a fresh private D1 backup/Time Travel bookmark and verified R2 inventory with access/grant evidence. Rehearse restoration to a separate database; the present account quota prevents creating another remote drill database.
3. For preview code rollback, redeploy the previously recorded staging source to the same verified staging bindings. Retain additive tables; do not delete contract/notice records or reverse migrations by dropping shared tables.
4. Any data restore requires a reviewed write freeze, reconciliation of events received since the snapshot and independent approval. Never restore an old backup over real payments blindly.
5. Phase 6 Google Cloud migration and traffic changes remain outside this delivery.

## Delivery update

Pending final PR/CI/preview observation. This section will record actual hosted results without converting pending gates into acceptance.
