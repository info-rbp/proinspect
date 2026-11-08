# Migration collision and deployment ledger — Stage 0, 8 November 2026

**Canonical source reference:** `main` at `3e99a560b59a4199957a3b28dcf41e927fa743bf` (GitHub tree SHA; not the branch commit SHA). Source migrations: **52**. Existing immutable hash-baseline files: **48**. Prefix gaps/duplicates found: **0**. Baseline filenames missing: **0**.

Live Cloudflare production DB `proinspect-platform-data` (binding `DB`) was queried read-only. Its `d1_migrations` ledger contains exactly 48 entries with last `0048_rental_reference_checks.sql`, and `pragma_foreign_key_check` returned **0 violations**. These observations are as-of the Stage 0 check and should not be treated as future-time assertions.

## Numbering and release disposition

| Order | Filename | Stage 0 disposition |
| --- | --- | --- |
| `0001` | `0001_core.sql` | Applied to live D1, file in immutable 48 baseline |
| `0002` | `0002_guards.sql` | Applied to live D1, file in immutable 48 baseline |
| `0003` | `0003_connected_operations.sql` | Applied to live D1, file in immutable 48 baseline |
| `0004` | `0004_enquiries_notices.sql` | Applied to live D1, file in immutable 48 baseline |
| `0005` | `0005_account.sql` | Applied to live D1, file in immutable 48 baseline |
| `0006` | `0006_all_inclusive_subscription.sql` | Applied to live D1, file in immutable 48 baseline |
| `0007` | `0007_calendar_sync.sql` | Applied to live D1, file in immutable 48 baseline |
| `0008` | `0008_guest_one_off_bookings.sql` | Applied to live D1, file in immutable 48 baseline |
| `0009` | `0009_leasing.sql` | Applied to live D1, file in immutable 48 baseline |
| `0010` | `0010_rental_applications.sql` | Applied to live D1, file in immutable 48 baseline |
| `0011` | `0011_rental_application_safeguards.sql` | Applied to live D1, file in immutable 48 baseline |
| `0012` | `0012_open_home_checkins.sql` | Applied to live D1, file in immutable 48 baseline |
| `0013` | `0013_wa_residential_forms.sql` | Applied to live D1, file in immutable 48 baseline |
| `0014` | `0014_wa_residential_workflows.sql` | Applied to live D1, file in immutable 48 baseline |
| `0015` | `0015_wa_residential_entry_reminders.sql` | Applied to live D1, file in immutable 48 baseline |
| `0016` | `0016_wa_review_requirements.sql` | Applied to live D1, file in immutable 48 baseline |
| `0017` | `0017_wa_form_release_approval.sql` | Applied to live D1, file in immutable 48 baseline |
| `0018` | `0018_wa_bonds.sql` | Applied to live D1, file in immutable 48 baseline |
| `0019` | `0019_open_home_reports.sql` | Applied to live D1, file in immutable 48 baseline |
| `0020` | `0020_reporting_engine.sql` | Applied to live D1, file in immutable 48 baseline |
| `0021` | `0021_v2_operating_model.sql` | Applied to live D1, file in immutable 48 baseline |
| `0022` | `0022_v2_maintenance_delivery.sql` | Applied to live D1, file in immutable 48 baseline |
| `0023` | `0023_v2_asset_preventive_compliance.sql` | Applied to live D1, file in immutable 48 baseline |
| `0024` | `0024_v2_sector_packs.sql` | Applied to live D1, file in immutable 48 baseline |
| `0025` | `0025_v2_capital_enterprise.sql` | Applied to live D1, file in immutable 48 baseline |
| `0026` | `0026_v2_review_integrity.sql` | Applied to live D1, file in immutable 48 baseline |
| `0027` | `0027_stripe_billing.sql` | Applied to live D1, file in immutable 48 baseline |
| `0028` | `0028_contractor_payment_choices.sql` | Applied to live D1, file in immutable 48 baseline |
| `0029` | `0029_rental_application_completion.sql` | Applied to live D1, file in immutable 48 baseline |
| `0030` | `0030_property_report_bridge.sql` | Applied to live D1, file in immutable 48 baseline |
| `0031` | `0031_wa_rent_and_restricted_review.sql` | Applied to live D1, file in immutable 48 baseline |
| `0032` | `0032_rent_connect_sandbox.sql` | Applied to live D1, file in immutable 48 baseline |
| `0033` | `0033_wa_agreement_signing.sql` | Applied to live D1, file in immutable 48 baseline |
| `0034` | `0034_agency_outsourcing.sql` | Applied to live D1, file in immutable 48 baseline |
| `0035` | `0035_v4_service_requests.sql` | Applied to live D1, file in immutable 48 baseline |
| `0036` | `0036_payment_attempts_and_reconciliation.sql` | Applied to live D1, file in immutable 48 baseline |
| `0037` | `0037_billing_accounts_and_invoices.sql` | Applied to live D1, file in immutable 48 baseline |
| `0038` | `0038_versioned_legal_acceptance.sql` | Applied to live D1, file in immutable 48 baseline |
| `0039` | `0039_building_management.sql` | Applied to live D1, file in immutable 48 baseline |
| `0040` | `0040_notice_and_council_governance.sql` | Applied to live D1, file in immutable 48 baseline |
| `0041` | `0041_approved_service_variants.sql` | Applied to live D1, file in immutable 48 baseline |
| `0042` | `0042_release_approval_integrity.sql` | Applied to live D1, file in immutable 48 baseline |
| `0043` | `0043_commercial_lease_operations.sql` | Applied to live D1, file in immutable 48 baseline |
| `0044` | `0044_agency_owner_invitations.sql` | Applied to live D1, file in immutable 48 baseline |
| `0045` | `0045_pcr_launch_offer.sql` | Applied to live D1, file in immutable 48 baseline |
| `0046` | `0046_pcr_discount_reservations.sql` | Applied to live D1, file in immutable 48 baseline |
| `0047` | `0047_residential_paid_subscription_enrollments.sql` | Applied to live D1, file in immutable 48 baseline |
| `0048` | `0048_rental_reference_checks.sql` | Applied to live D1, file in immutable 48 baseline |
| `0049` | `0049_commercial_source_lifecycle.sql` | Merged source only; **not applied** |
| `0050` | `0050_report_render_independent_review.sql` | Merged source only; **not applied** |
| `0051` | `0051_invoice_delivery_reviews.sql` | Merged source only; **not applied** |
| `0052` | `0052_rental_tenancy_handover.sql` | Merged source only; **not applied** |

### Outstanding source/schema divergence

- `0049_commercial_source_lifecycle.sql` — merged via PR #81; pending controlled production D1 migration.
- `0050_report_render_independent_review.sql` — merged via PR #81; pending controlled production D1 migration.
- `0051_invoice_delivery_reviews.sql` — merged via PR #81; pending controlled production D1 migration.
- `0052_rental_tenancy_handover.sql` — merged via PR #80; pending controlled production D1 migration.
- The previous PR #80 use of `0049` was eliminated by source reconciliation. **No duplicate or missing numeric prefix in the 52-file source manifest.**
- Historical files `0001–0048` must remain byte-identical; `config/handbook-migration-baseline.json` is checked by existing CI. This list comparison alone does not verify their SHA-256 bytes, but successful exact-source CI checks the baseline.
- Source-level guards prevent most new flows with absent tables while flags are OFF; they are **not** a substitute for applying the approved migration to the correct production D1 binding.

### Controlled application prerequisites

Before changing live D1, verify current Worker SHA, exact D1 UUID, time-travel recovery bookmark and available restoration method; review SQL trigger effects on already issued reports, invoicing records and tenancy relations. Apply sequentially in one approved maintenance window using the pinned migration workflow, then query `d1_migrations`, `pragma_foreign_key_check`, `pragma_integrity_check` and operational counts. Never reapply or modify files 0001–0048, never delete historical finance or tenancy evidence, and retain protected flags OFF until independently authorised.

**Conflict status:** No source filename collisions/gaps identified.
**Production deployment status:** four migrations still pending. A clean source manifest is not a production schema certificate.
