# Report Creation Tool integration branch

## Purpose and source baselines

This branch is the isolated integration line for bringing reusable inspection/report-authoring capabilities from
[`info-rbp/ProInspect-Report-Creation-App`](https://github.com/info-rbp/ProInspect-Report-Creation-App)
into the Cloudflare-native [`info-rbp/proinspect`](https://github.com/info-rbp/proinspect) application.

- **Target branch:** `integration/report-creation-tool`
- **Preserved ProInspect starting point:** `35d37f77bc4ac779baa52e9dd3356501b315c8fd` (`main` at branch creation, 2026-10-11).
- **Source Report Creation App reviewed baseline:** `f890584b5759edbf342bceab9db7dde9ce8fa3d2` (`main`, 2026-08-29).
- **Deployment policy:** never deploy this branch to production or merge it into `main` merely because a source copy/build succeeds. Existing production resources, customer data, DNS and credentials must remain unchanged.

The new branch began with the **identical commit/tree** as ProInspect `main` (zero ahead/behind and zero changed files). All existing portal, booking, Work Order, document, access, notification, payment, communications, and integration features therefore remain present. Only additive, verified report functionality may be introduced here.

**Important status:** branching preserves all current `proinspect` functionality; it **does not by itself port** the original Report Creation App. The latter is a distinct migration and has not been claimed complete.

## Existing functionality that must not regress

The following `proinspect` contracts must remain operational while report authoring is introduced:

1. Unified marketing and authenticated platform on Cloudflare Workers.
2. One verified identity and independent dated client/property/tenancy/scheme/workspace authority.
3. Landlord account, property, booking, appointment changes, Work Order and issued-document journeys.
4. Property Manager/Commercial organisation approval, portfolio/team/assignment, imports and recurring workflows.
5. Tenant invitations, requests/attachments, tenancy documents, inspection publication and PCR responses.
6. Strata/Building/Council scheme relationships, requests, notices, proposals and recorded outcomes.
7. Staff/Admin assignment, approvals, financial ledger, document issue, audit and search.
8. Private R2 documents, explicit D1 recipient grants, immutable issued document revisions and notifications.
9. Report Tool signed handoff/callback and manual PDF issuance as backward-compatible fallbacks.
10. Apps Script projection, encrypted email/outbox, and existing other integration contracts.

See [BUILD_STATUS.md](BUILD_STATUS.md), [DOMAIN_MODEL.md](DOMAIN_MODEL.md),
[AUTHORIZATION.md](AUTHORIZATION.md), and [INTEGRATIONS.md](INTEGRATIONS.md) for their actual authority, remaining limits, and test evidence.

## Integration design: one app, shared report engine

The **ProInspect platform** remains canonical for verified identity, Work Orders, bookings, properties,
tenancies, client and scheme relationships, Staff assignments, audits, document grants, email and operational records.
The **upstream Report Creation repository** remains the origin of portable reporting logic; its Firebase/
Firestore, Google Cloud, Appwrite, standalone authentication, generic booking, and overlapping Client/Tenant/Admin
runtime services are **not** imported.

| Capability | Upstream owner / likely source | ProInspect target |
|---|---|---|
| Report aggregate, assessments, validation, review and quality control | `packages/domain`, `packages/validation` | Isolated report engine/domain modules, backed by D1 records |
| Five report types: Entry PCR, Routine, Exit, Comparison, Maintenance/Follow-Up | `packages/templates` | Versioned templates bound to ProInspect Work Orders, property layouts and legal/business rules |
| Area/component editor and photographic evidence | `apps/web/components/inspection`, `apps/web/components/reports` | Native Staff reporting route, ProInspect identity and scoped API |
| Evidence upload and controlled offline queue | `apps/web/services/photoUploadCoordinator.ts`, `offlineWorkspace.ts` | Restricted R2 originals, explicit upload grants, checksums, conflict detection and sync |
| Review, comparison, responses and maintenance candidates | `packages/domain`, API report routes | Server-validated lifecycle and ProInspect maintenance/tenant links |
| Report presentation and PDF | `packages/report-presentation`, `apps/pdf-worker/src/rendererV2.ts` | Version-pinned renderer, output hashes, private R2 PDF, authorised issue |
| AI assistance (optional) | `apps/ai-worker`, `apps/api/src/services/geminiAnalysisService.ts` | Provider-separated worker task; no automated report approval |

The current platform provides `POST /api/w/staff/operations/work-orders/:id/report-handoff`
and `POST /api/integrations/report-tool/callback` plus manual PDF issue. Keep these pathways working until
end-to-end native report creation is accepted.

### Authority and security rules

- The Work Order and ProInspect property remain canonical. Do not create a second customer/property/identity authority.
- Recheck Staff assignment and scoped authorisation on **every** report and evidence endpoint.
- Create reports against a pinned published inspection template and an immutable property-layout snapshot.
- Maintain editable drafts and separate approved/issued immutable report versions; corrections create superseding versions.
- Do not infer operational functionality from photographs alone. AI recommendations require human review.
- Preserve evidence provenance, file hashes, source linkage, author/reviewer decision trails and append-only audit.
- Only explicitly issued recipient grants can expose a PDF or tenant response. No automatic exposure by property access.
- Never import or expose confidential access instructions, restricted cases, secrets or legacy customer data.
- Do not silently overwrite offline edits; use server version checks and block issue until all evidence is uploaded.

## Implementation stages and evidence

1. **Reusable core and source-version tracking:** extract/port framework-independent report models, type policies, templates, QC and presentation models with isolated tests. Track the exact reviewed upstream source commit and permit updates only through allowlisted, reviewed PRs.
2. **Canonical persistence:** add additive D1 tables for report aggregate/drafts, templates and versions, area/components, evidence references, review decisions, PDF/render manifests and issued document linkage. Enforce tenant/assignment isolation in Worker APIs.
3. **Staff authoring:** introduce a native report workspace with area/component assessments, evidence capture, draft recovery, offline sync/reconciliation and no change to existing Work Order semantics.
4. **Issuance:** add role-separated QC/review, reproducible PDF rendering and existing R2/D1 grants, outbox and audit integration; preserve manual upload/handoff fallback until validated.
5. **Specialised reporting:** implement Entry/Exit baselines, comparison, maintenance extraction, tenant response and policy-controlled optional AI.

### Minimum acceptance gate for every integration PR

- `pnpm check` (typecheck, tests, schema checks and both builds).
- `pnpm test:integration` against actual local Worker/D1/R2/DO behaviour.
- `pnpm test:browser` for currently supported portal journeys and new reporting journeys.
- Worker dry-runs, security/cross-tenant denial tests, file-grant tests, idempotency and immutable-version tests.
- Five-type report fixtures and repeatable PDF output/manifest checks before the reporting engine is called fully migrated.
- A clear mapping of upstream source SHA, copied/modified modules and intentionally deferred capabilities.
- Hosted acceptance is a separate release gate; synthetic tests are not evidence of live integration or delivery.

The integration branch verification workflow runs on branch pushes and pull requests, but does not deploy.
Do not merge report integration into production until the accepted slice and its no-regression evidence are recorded.

## Executed first integration step

- Pure upstream inspection policies, report aggregate types and QC evaluator are now copied at the pinned source SHA under `packages/report-engine/upstream/` (see `packages/report-engine/upstream-lock.json`).
- The 23 service IDs have an explicit draft report/output profile contract in `packages/report-engine/policy.ts`.
- This is not yet the native editor, PDF delivery or upstream update automation. Do not claim phase 3-7 acceptance from this foundation.
