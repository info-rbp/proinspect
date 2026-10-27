# Final sprint implementation status - 27 October 2026

## Release classification

**Unreleased implementation branch. The 110-task handbook is not complete.**
This record distinguishes implemented engineering from genuine provider validation, independent business/legal acceptance and hosted user acceptance. No production flag, credential, database or deployment has been changed by this branch. No task has been declared independently Accepted or Deferred by decision.

Baseline: `b633b75ce2a75b84848c780eba0a82d559755518` in `info-rbp/proinspect`. Existing draft PR #65 and master issue #54 remain authoritative governance links; G01-G07 reuse issues #58-#64. The new task register is not proof that 103 further GitHub issues have been created. Named acceptance owners remain unassigned rather than fabricated.

## Implemented engineering

### O05-O08: commercial lease lifecycle

The authorised Commercial, Property Manager and Staff workspaces now support independently reviewed, source-linked commencement, variation, renewal and expiry records. Revisions preserve original lease sources, use optimistic version checks and record parties, premises, effective dates, option windows and external notice references. Expiry cannot silently execute a legal notice or option. A closed lease requires reviewed expiry and cleared operational exceptions.

Financial source rules explicitly capture amounts, frequency, tax treatment, effective periods, fixed/actual-day allocation, percentage/index reviews and optional caps/floors. All monetary calculations use integer cents and symmetric half-up rounding. Calendar periods and leap days are validated. Allocations cannot overlap; changed source periods require splitting rather than applying an obsolete rule. Corrections are immutable deltas or full reversals linked to originals. Concurrent adjustments compare the approved balance and cannot over-credit subtotal, tax or total. This operational ledger neither collects rent/bonds nor creates tax invoices.

Make-good and compliance cases record observations, quotations, final condition evidence, responsibility and canonical Work Orders. A different authorised reviewer approves material closure. Reopening creates a linked successor task, preserving the closed original. Exception records cover missed/overlapping options, missing/changed documents and disputed tasks/charges, with accountable ownership, escalation and independent source-backed resolution.

The UI includes proposal/review histories and a formula-safe CSV export with complete source periods, hashes and exact balancing totals. Access is rechecked before reads, exports and idempotent replays. Inspectors cannot browse the financial/source register. Display limits are disclosed; exports reject oversized/partial allocations rather than silently truncating accounting data.

Implementation: `apps/platform/worker/features/commercial-{scope,lifecycle,operations}.server.ts`, `apps/platform/app/components/CommercialLifecycle.tsx`, `packages/commercial/calculations.ts`, `packages/finance/export.ts`, migration `0047_commercial_source_lifecycle.sql`.

### R05: offline photo privacy and recovery hardening (partial task)

New photo queues encrypt filenames, area/component attribution and image bytes in one authenticated payload. Keys remain derived from an explicit passphrase and are not persisted. Existing queued photos are migrated only after successful decryption, with compare-and-swap protection. Server acknowledgement must contain the SHA-256 of the exact uploaded JPEG before local erasure; rejection, mismatch, interruption or revoked access retains unsent encrypted evidence.

Existing server SHA-256 deduplication and report revision checks remain authoritative. This is not completion of all offline device, retention, high-volume or human fieldwork acceptance requirements.

### G01/G02/G05/G06/X08: evidence controls (partial tasks)

`config/handbook-tasks.json` contains all 110 task IDs, exact action/acceptance requirements, dependencies, priority, owner slots and evidence slots from Handbook v1.1. `config/handbook-traceability.json` preserves all F01-F20 work packages. `scripts/handbook-check.mjs` rejects omitted tasks, unresolved implementation/test paths, unsupported acceptance transitions and unapproved deferrals. These are structural checks, not electronic signatures or a release certificate.

`config/handbook-migration-baseline.json` hashes all 46 deployed migration files. The new schema is additive; old migration files are byte-identical. A populated 46-to-current SQLite rehearsal verifies preservation and foreign-key integrity. This does not substitute for the isolated hosted D1/R2 recovery rehearsal.

## Verification boundaries

The local commercial suite performs 15 real Worker/D1/R2/HTTP scenarios with synthetic identities and disallows all outbound provider requests. It covers independent approval, source revocation, stale versions, overlapping options/allocations, concurrent adjustments, disputes, make-good/reopening, lease expiry, CSV control totals, cross-client denials and membership revocation.

Additional suites cover 13 commercial calculation/export cases, 9 actual SQLite schema/migration cases, offline authenticated encryption and acknowledgement checks, and register integrity. The complete local runtime regression passed 205 checks, the unit suites passed 234 tests, all schema suites passed, and both application builds and TypeScript checking passed. The new form-serialization tests exercise the actual TSX conversion function. Local browser execution was blocked by an administrator browser policy before sign-in (ERR_BLOCKED_BY_ADMINISTRATOR), not by a tested application assertion. Browser acceptance therefore remains pending in the normal GitHub CI environment. Use the exact branch-head CI run for final source-specific results; a source-toolchain artifact is not an application verification run.

## Baseline observations (read-only, 27 October 2026)

Production Worker `proinspect-platform` referenced baseline commit above, 46 applied migrations and active D1 `proinspect-platform-data` (`dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea`). Staging `proinspect-v3-staging` referenced `770d24c67d533d5fa7ada2dd755594da44c561d3` and its separate D1 `e66b8ebc-637d-4737-8d47-b0fbec3c082c`. Read-only foreign-key checks returned no violations. The older similarly named production database is not the active binding.

Protected flags were disabled. Stripe secret/signing credentials were absent from both inspected Workers; staging had no genuine provider credentials. Production had configured email/Google integration secret names, which is not proof of genuine delivery or provider acceptance. Secret values were not read or published. The inspected production observability setting did not redact query strings; operational review remains required before treating it as accepted.

## Outstanding engineering and acceptance

The register's Not started state refers to completion of the **full handbook task in this implementation**, not absence of all pre-existing functionality. Existing implementations and historical evidence still require task-specific reconciliation.

Outstanding work includes reporting source/template/photo/annotation parity and complex Unicode PDF fidelity (R01-R04), the remainder of offline/performance recovery (R05/R08), consolidated invoice delivery/credits/financial corrections and settlement/bank reconciliation (B09-B11), any retained historical scope in G03/O09-O11, and publication/accessibility completion. These are not reclassified as external-only blockers.

Separately required: approved service/rate/subscription/PCR policies; operative legal texts, official statutory files and signing/service authority; genuine Stripe/email/Calendar/scanner/Apps Script/signature/bridge evidence; nine independently authenticated hosted role journeys; isolated hosted D1/R2 restoration; named incident/release ownership; and source-specific independent acceptance. No synthetic result fulfils these gates.

## Safe migration and rollback sequence

1. Review this branch and its exact-head CI results. Preserve the 46-file baseline. Obtain independent commercial/operations acceptance using genuine approved lease documents in isolated staging.
2. Identify the actual staging D1 binding, create approved recovery evidence, apply additive migration 0047, then deploy the matching Worker. Keep `COMMERCIAL_OPERATIONS_ENABLED=false` until exact-source acceptance is recorded.
3. Smoke-test authority denials and document grants, lease approvals, allocation balances, reversals and obligation closure before any approved activation.
4. Rollback starts by disabling the feature and stopping mutations. Retain append-only evidence and migration 0047; never delete financial history or rewrite migrations. Older code cannot complete tasks under the new independent-case constraints: use a reviewed roll-forward for remediation rather than removing those safeguards.
5. Offline format 2 is not readable by old clients. Retain the newer recovery-capable client while any unsent format-2 records remain. Do not clear IndexedDB as a rollback shortcut or invent retention consent.

**Full completion and production release are not certified by this branch.**
