> Current release note (22 October 2026): the V3 baseline was merged via PR #34 and deployed on 21 October, with migrations 0001-0019 confirmed in production. The material below is a historical source-branch snapshot, not current deployment status. See [RELEASE_RECONCILIATION_2026-10-22.md](RELEASE_RECONCILIATION_2026-10-22.md) for this integration candidate and remaining acceptance gates.

# Reporting integration delivery and acceptance ledger

Branch: `integration/report-creation-tool` only. No changes are authorised to the live
`main` branch, production Worker, D1, R2 or DNS. Verify ProInspect on the exact final
branch commit is the release-quality source of acceptance evidence, not individual file existence.

| Phase | Implementation on this branch | Acceptance limitation |
|---|---|---|
| 0. Branch verification | Branch-specific verification trigger and deployment-test repair; old portal regression suite retained | Exact HEAD must pass Actions; no hosted/deployed acceptance |
| 1. Reporting contracts | 23 service output mappings; residential, commercial, strata and attendance profiles; upstream inspection/QC domain types; explicit audiences and Staff separation | Complete original configurable property-layout catalogue and profile-specific business-approved templates not yet ported |
| 2. Upstream link | Pin to `ProInspect-Report-Creation-App@f890584b5759edbf342bceab9db7dde9ce8fa3d2`; selective allowlisted import; propose-only reviewed source-update PR script and branch-selected verification trigger | Only three pure modules in sync allowlist; no unattended upstream notification without separately authorised default-branch event/sender; PR generation has not been acceptance-tested against a new upstream commit |
| 3. D1 and native Staff editor | Additive migration 0006, report drafts/versions/assignments, area/component editor, private evidence, optimistic saves, staff register | Full original Report Creation screen parity, configurable hierarchical property layouts, rich photo annotation and all workflow refinements remain |
| 4. QC/PDF/issue | Independent Staff reviewer, upstream QC gate, immutable versions, hash-verified bounded Worker-native PDF with accepted JPEG evidence, D1 render manifest and existing document grants; Work Order completion requires the correct issued version once native reporting is started | PDF renderer is an initial bounded implementation, **not** the original branded `pdf-lib` renderer. Unicode fonts, rich presentation presets, golden visual regressions, true background rendering/very large reports, advanced archive/retention not accepted |
| 5. Tenant and tenancy | Entry PCR issued to exact tenancy with separate encrypted area/component responses and independent response resolution; immutable Entry baseline required for Exit/Comparison | Statutory response periods, reviewed legacy PCR mapping, evidence attachment by tenant and comprehensive Exit golden examples remain |
| 6. Multiple portals | Tenant, Landlord, Commercial, Strata Council and Building audience-scoped real Worker tests, including one person with council and resident memberships; common-property scheme-only report | Full portfolio reporting filters, agency branding and all Commercial/Strata speciality templates remain; do not equate customer document access with full managerial report-authoring permissions |
| 7. Field and follow-up | Opt-in passphrase-encrypted IndexedDB drafts and JPEG queue, 409 stale-version protection, UI sync and local erasure, accepted evidence hash checks, reviewable maintenance candidates converted into ordinary requests | No resilient large media uploads, automatic malware scanning, verified device-loss recovery, production offline/large-PDF stress testing, or Gemini/AI provider integration. AI is optional and disabled |

## Critical invariants already implemented

- One ProInspect Work Order is authoritative. No duplicate customers, tenancies,
  management grants, calendars, payment systems or Firebase identity.
- A report is inaccessible to customer portals until explicit document issuance.
- Tenant/report/component responses never rewrite an approved report version.
- Council-only documents cannot be obtained through a resident/building workspace,
  even when the same person has both roles.
- Inspectors cannot independently approve their own submitted report.
- A native Work Order cannot be closed by attaching an unrelated issued PDF.
- Evidence is private and remains review-pending until a separate actor accepts it.
- A downstream update creates a reviewable pull request, never an automatic merge.

## Remaining release-quality work

1. Port the original complete reporting template/layout catalogues and presentation
   engine with pinned font/branding identity; approve actual residential, commercial
   and strata templates against service-specific legal/business standards.
2. Finish richer photo evidence capture/annotation, malware/image-safety checks,
   larger asynchronous rendering and repeatable PDF visual regressions.
3. Verify longer interrupted mobile/offline operation, resumable evidence transfer,
   reconnection conflicts and deletion/retention policies in representative browsers.
4. Complete reviewed historical/legacy comparison migration and tenant evidence responses.
5. Expand automated agency-scale portfolio, owner instructions and all 23 service
   outputs beyond mapping coverage. Test every specialised end-to-end service.
6. Exercise the upstream-to-ProInspect sync workflow with an actual upstream
   update and establish authorised push/update notifications; manual trigger alone
   is not unattended integration.
7. Conduct controlled hosted acceptance for final runtime secrets/provider
   integrations and deployment behaviour. Nothing in branch verification
   is evidence that production has received these features.

See [REPORT_TOOL_INTEGRATION.md](REPORT_TOOL_INTEGRATION.md) for the original
integration decision and [REPORT_UPSTREAM_SYNC.md](REPORT_UPSTREAM_SYNC.md)
for the source-update operational workflow.
