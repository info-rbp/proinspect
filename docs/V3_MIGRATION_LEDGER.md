# Version 3 migration candidate: production locked

Baseline: main e819659dba660e85b88a013257806e6462f4c38e. The existing 0001-0006 migrations remain byte-identical. This ledger is not a production release approval.

| V3 filename | Imported draft source | Git blob SHA prefix |
|---|---|---|
| 0007_calendar_sync.sql | feature/google-calendar-scheduler-integration-20261019/0008_calendar_sync.sql | 33a88960a9fe |
| 0008_guest_one_off_bookings.sql | feature/guest-one-off-booking-20261018/0010_guest_one_off_bookings.sql | 7596f4903bfe |
| 0009_leasing.sql | Leasing/0007_leasing.sql | 0847dfc2e724 |
| 0010_rental_applications.sql | Leasing/0008_rental_applications.sql | 714d3c7ced89 |
| 0011_rental_application_safeguards.sql | Leasing/0009_rental_application_safeguards.sql | d6608bf7e121 |
| 0012_open_home_checkins.sql | feature/open-home-check-in/0010_open_home_checkins.sql | ab62d6a0d94b |
| 0013_wa_residential_forms.sql | feature/wa-residential-statutory-forms-20261018/0007_wa_residential_forms.sql | 2d5f4791b44a |
| 0014_wa_residential_workflows.sql | feature/wa-residential-statutory-forms-20261018/0008_wa_residential_workflows.sql | cfc17ee6c7f2 |
| 0015_wa_residential_entry_reminders.sql | feature/wa-residential-statutory-forms-20261018/0009_wa_residential_entry_reminders.sql | 8944f4d7e28e |
| 0016_wa_review_requirements.sql | feature/wa-residential-statutory-forms-20261018/0010_wa_review_requirements.sql | f154763c49eb |
| 0017_wa_form_release_approval.sql | feature/wa-residential-statutory-forms-20261018/0011_wa_form_release_approval.sql | 9902e5024f73 |
| 0018_wa_bonds.sql | feature/wa-bond-management-full-20261018/0007_wa_bonds.sql | 58ff5273d691 |

The 12 SQL files have their original bytes and unique additive filenames. Validate all SQL and the deployed D1 d1_migrations ledger before any remote migration. A renamed migration file alone cannot prove compatibility.

PR #3 alternative communications 0004 conflicts with the existing canonical notifications schema and is deliberately excluded. Its payment attempts migration must be adapted separately. WA forms and bonds must share a single authoritative government-evidence, issued-document, reconciliation model. Do not enable statutory functionality, Calendar writes, guest pricing, external Apps Script, Sheets or restricted workflows until approved. Never apply these migrations to production from this branch.
