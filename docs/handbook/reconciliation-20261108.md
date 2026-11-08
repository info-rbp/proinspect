# Commercial, reporting and finance reconciliation — 8 November 2026

## Source of truth and scope

This integration reconciles draft PR #66 (`1263085e32ec3c13e41663d10078624ebca18c3d`) with the independently advanced ProInspect `main` branch (`373ce9459d9f7d72d3892c175cc2203ce12b9662` at branch creation). It retains newer residential billing, rental-applicant reference checks and Staff property operations. The former PR description is a historical engineering record and **not** a certificate of completion for the 110-task handbook.

Implemented code covers guarded commercial lease revisions/financial calculation/obligations/exception registers, encrypted offline photo recovery, exact-PDF independent reviewer evidence and issuance controls, and independently approved **sandbox-only** invoice recipients and one-time dispatch attempts. An ambiguous or mismatched Stripe send response is recorded as needing reconciliation, never treated as delivered. All work is guarded by current staff/recipient authorization and immutable evidence checks.

## Non-overlapping migration reconciliation

Production D1 was inspected read-only on 8 November 2026 and had `0001`–`0048` applied. **Never replace or reissue these filenames.**

| New migration | Purpose |
| --- | --- |
| `0049_commercial_source_lifecycle.sql` | Source-bound lease revisions, charges, make-good, exceptions and independent approvals |
| `0050_report_render_independent_review.sql` | Immutable reviewer decision bound to exact PDF/R2 hashes; issue/grant triggers |
| `0051_invoice_delivery_reviews.sql` | Independent recipient register, immutable sandbox send reservation/evidence and initial-state guards |

The hash baseline now checks all 48 pre-existing applied migration files. Python rehearsals apply all three additions to a populated, isolated SQLite copy with unchanged existing rows, foreign-key and integrity checks. Isolated Worker/D1/R2 tests exercise real access and rejection behaviour under synthetic identities. A successful local rehearsal **does not prove** hosted Cloudflare D1/R2 restore, legitimate provider integration or human acceptance.

## Deployment and release sequence

1. Retain all protected flags **OFF** until approved. In particular: commercial operations, Stripe invoicing/sends, refund/Connect or settlement activity, legal signing and rental applications are independently gated. No release approval is created by a schema migration or source merge.
2. Confirm the target staging D1 binding by ID, take an independently verifiable recovery snapshot and restore to an isolated database (separate D1, Documents R2 and Restricted Documents R2). Do **not** reuse production resources for testing.
3. Apply `0049`, `0050`, `0051` **in filename order using the project's pinned Wrangler migration workflow**, verify `d1_migrations`, `PRAGMA foreign_key_check`, `PRAGMA integrity_check` and the immutable audit/recipient/document denial tests. Capture a reversible operational point-in-time restore before any remote deployment.
4. Deploy the exact source to isolated staging; test commercial approvals, multi-property statements, Stripe sandbox provider acceptance/uncertainty, reporting PDF exact bytes, revoked reviewers, cross-client denial and nine independently authenticated portal journeys. The source-level backend guards make new features unavailable if the corresponding schema is missing; they do not substitute for applying the migrations.
5. Only after independent commercial, accounting, legal, security, QA, financial-custody and recovery sign-off, apply the same reviewed additive migrations to production before enabling any corresponding feature flag. Record exact build SHA and genuine provider observations. Do not mutate legacy financial history or attempt a destructive SQL rollback.

## Outstanding: no independent acceptance implied

Still open: full reporting template/Unicode/photo and offline device parity; consolidated credit/refund/correction and bank/payout reconciliation; actual Stripe/Resend/Calendar/scanner/document signing integrations; signed WA legal templates; nine hosted role journeys; isolated hosted D1 and R2 restoration; accessibility/publication and independent release decision. The structural task register deliberately does not mark these accepted.

## Rollback and incident boundary

Stop new workflows and turn off their protected flags first; retain immutable accounting, reviewer, recipient and dispatch events for reconciliation. D1 changes are append-only and not reverted by rolling back Worker code. Follow the reviewed roll-forward recovery plan rather than deleting a migration or ledger record. When a dispatch may have reached Stripe, the `needs_reconciliation` state bars automatic repeat sends; authentic provider evidence and separately reviewed remediation are required.
