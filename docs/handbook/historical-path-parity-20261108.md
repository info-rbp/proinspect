# Historical source-path parity — Stage 0 (8 November 2026)

Compared selected source-rich historical branch Git trees to current `main` using *file path presence and Git blob SHA*, not commit ancestry. For squash-merged branches, an old GitHub compare's `added` status does not mean the file is missing from current `main`.

| Branch | Source files | Paths absent from main | Different existing blobs | Exclusive files (sample) |
| --- | ---: | ---: | ---: | --- |
| `ProInspect-V2` | 223 | 6 | 88 | `database/migrations/0006_v2_operating_model.sql`, `database/migrations/0007_v2_maintenance_delivery.sql`, `database/migrations/0008_v2_asset_preventive_compliance.sql`, `database/migrations/0009_v2_sector_packs.sql`, `database/migrations/0010_v2_capital_enterprise.sql`, `database/migrations/0011_v2_review_integrity.sql` |
| `feature/owner-portfolio-20261017` | 201 | 0 | 82 | — |
| `integration/report-creation-tool` | 220 | 2 | 99 | `.github/workflows/sync-report-engine.yml`, `database/migrations/0006_reporting_engine.sql` |
| `version-4-guest-booking-finalisation` | 410 | 1 | 116 | `database/migrations/0027_v4_service_requests.sql` |
| `feature/final-sprint-handbook-20261027` | 594 | 6 | 74 | `apps/marketing/app/routes/pcr-offer.tsx`, `apps/marketing/app/routes/pcr-sample.ts`, `database/migrations/0047_commercial_source_lifecycle.sql`, `database/migrations/0048_report_render_independent_review.sql`, `database/migrations/0049_invoice_delivery_reviews.sql`, `packages/ui/pcr-offer.css` |
| `feat/continuity-acceptance` | 150 | 15 | 85 | `.github/workflows/deploy-staging.yml`, `apps/platform/app/routes/payment-reconciliation.tsx`, `apps/platform/worker/features/communications.server.ts`, `apps/platform/worker/features/directory.server.ts`, `apps/platform/worker/features/payments.server.ts`, `database/migrations/0004_communications.sql`, `database/migrations/0005_payment_attempts.sql`, `docs/CONTINUITY_ACCEPTANCE.md` |
| `integration/property-report-tool-20261023` | 404 | 1 | 110 | `database/migrations/0027_property_report_bridge.sql` |
| `feature/google-calendar-scheduler-integration-20261019` | 207 | 1 | 82 | `database/migrations/0008_calendar_sync.sql` |
| `version-3-enhancements` | 324 | 0 | 107 | — |
| `ops/sprint-recovery-20261027` | 554 | 11 | 100 | `.github/workflows/final-review-live-observation.yml`, `.github/workflows/final-sprint-live-observation.yml`, `.github/workflows/final-sprint-pinned-production.yml`, `.github/workflows/final-sprint-production-schema.yml`, `.github/workflows/final-sprint-staging.yml`, `.github/workflows/pcr-completion-production-schema.yml`, `.github/workflows/pcr-completion-staging.yml`, `.github/workflows/recovery-hardening-staging.yml` |
| `feature/marketing-home-service-ui-20261019` | 213 | 0 | 77 | — |
| `feature/wa-forms-rent-connect-20261025` | 423 | 2 | 109 | `database/migrations/0027_wa_rent_and_restricted_review.sql`, `database/migrations/0028_rent_connect_sandbox.sql` |

## Disposition

An old branch with zero exclusive paths is not proof of complete functional parity: existing files may have materially evolved. A branch with exclusive paths is not authorisation to merge its dated SQL, old UX or test workflows. Reconcile specifically retained missing behaviour under canonical G03/O09–O11, R01–R09, I02–I10 and M01–M09 with current-source evidence. No blanket merges.

All 78 historical refs and PR dispositions are recorded in `branch-census-20261108.md`. Human release and sector-specific parity approval remains outstanding.
