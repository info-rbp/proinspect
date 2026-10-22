# V2 WP4 — Specialist markets and progressive rollout

**11 draft specialist market packs; 55 module definitions; 77 independent release checks.** Migration `0009_v2_sector_packs.sql`, Staff `market-packs` UI, `v2-sectors` authenticated API and `packages/v2/sectors.ts`.

## What is implemented

Each of RES, COM, STR, CTS, STA, SOC, SDA, RET, AGE, RUR and INS has an isolated **version 1 draft** pack with five operational module definitions. These are reusable structured coordination/evidence workflows, **not 55 pre-certified professional services or 55 bespoke portals**. Per-module review decisions either approve the safe operations scope or explicitly exclude it.

Every pack requires evidence that all seven release gates are verified: governance, service scope, pricing, insurance, credentials, privacy, and workflow acceptance. All five module decisions must be reviewed, at least one operational module must be approved, and a final authorised pack review reference is required. Modules classed `reserved_external` require a currently independently checked qualified provider clearance even for inclusion; ProInspect does not thereby become the statutory, clinical, NDIS, strata-governance or trust-account service provider.

A pack does not by itself go live. Deployment of a market is a **client-specific engagement rollout**: a signed verified service engagement matching the market, a reviewed property/scheme-market classification, enabled market setting, approved pack and valid clearances. A rollout starts `draft`, progresses to `pilot`, and can move to `live` only after the pilot. Each active rollout permits controlled, validated module evidence keyed to a scoped asset, source key, and approved non-sensitive `facts` fields. Recorded evidence needs an independent reviewer to be accepted.

## Activation policy

No new markets, modules or releases are activated by migration. Legacy public booking services and prices remain untouched. Do not change the live website, client subscriptions or legal responsibilities merely by setting a pack to `approved`. Real-world signed service scopes, qualified provider clearances and regulator-sensitive safeguards must be reviewed before each pilot. The generic module record intentionally refuses arbitrary keys and patient/case-management fields. Specialist customer-facing designs, clinical/NDIS functions, reserved statutory service execution and external supplier integrations are **not** presented as complete.
