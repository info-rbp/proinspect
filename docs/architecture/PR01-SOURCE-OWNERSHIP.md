# ProInspect source and D1 logical ownership inventory

Generated from main at 49791b082e5cd48e98911121904b1a0dfe4af009 and live **read-only** D1 table names, 14 November 2026.

Counts: 95 platform route modules; 81 backend feature modules; 23 marketing route modules; 275 production D1 tables. New PR-01 files and migration 0054 are tracked separately.

Complete per-file, per-table proposed owners are in [PR01-SOURCE-OWNERSHIP.json](PR01-SOURCE-OWNERSHIP.json).

**Important:** classifications are provisional based on module/table names, not yet independently verified source analysis. They do not confer permissions or warrant physical relocation. Each domain owning migration must review each source's imports, server API usage, SQL mutations, target app consumers, tests and rollback before extracting code or splitting deployment. A `reviewRequired` flag is set on overtly ambiguous cases, but every mapping still requires an owner's review.

Physical data source of truth remains `proinspect-platform-data` regardless of logical domain. Only existing backend holds D1 access during PR-01; no new customer-facing Worker is deployed.
