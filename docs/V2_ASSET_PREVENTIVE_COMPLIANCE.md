# V2 WP3 — Asset lifecycle, preventive maintenance and compliance

**Development only** on ProInspect-V2. Migration `0008_v2_asset_preventive_compliance.sql`, Staff `asset-compliance` route and `v2-estates` API.

## Operational contracts

- Canonical `v2_assets` from WP1 remains the authoritative asset tree: one property or scheme scope per node, no duplicate addresses. Asset profiles add equipment references, manufacturer, serial, replacement estimate in AUD cents, condition and lifecycle status, criticality and review version.
- Verified condition observations are append-only, optionally link to an **issued** document at the same property/scheme, and update the most recent condition score; rejected evidence never changes that score. Warranty evidence follows the same document-scope rule.
- Preventive plans bind a specific asset, active commissioning engagement and approved market-service combination, with months-based recurrence, next due, issue lead days, operating instruction and authority reference. Staff must explicitly approve/activate a plan. Each due cycle can **issue one work order and its scoped maintenance task atomically** or record an independently authorised skip. Duplicate issue/retry does not produce a second visit. The next recurrence moves forward without occupying a public booking slot or an internal capacity resource. Staff must schedule the task and obtain any necessary customer approval using existing work-order controls.
- Compliance obligations bind the accountable external legal party (owner, appointed manager, operator, qualified service provider or authority), jurisdiction, source and review date. Provider certificates, inspection records and other evidence are independently reviewed; due, overdue, missing and expired evidence can be reported. This register **does not certify legal compliance** and does not appoint ProInspect to statutory functions.
- Compliance follow-up actions and asset risks are tracked with owners, dates, mitigation, evidence-backed closure and non-editable review history. Risk scores are internal prioritisation, not engineering determinations.
- Access is restricted to operational Staff/Admin. Customer-facing document distribution continues only through the established document grants, never because an asset appears in a register.

## Boundaries and release gates

Do not activate preventive plans or compliance obligations without a real, approved ProInspect operations engagement and service scope. Actual inspection/compliance obligations, authorities, statutory deadlines, testing frequencies and sign-off responsibilities must be validated individually. The system does not invent jurisdictional frequencies or automatically issue notices to clients. Issue cycles are staff-controlled; external calendar sync, reminders, contractor dispatch and automated regulatory compliance certification are **not delivered** in this work package.

Acceptance: additive migrations 0001–0008, Python schema invariants, Worker/D1/R2 task creation and document-scope tests, authenticated mobile/desktop Staff screens, and a passing GitHub Actions run on the exact final V2 commit.

## Independent-review hardening

Additive migration 0011 requires a condition reviewer to differ from the observer and a compliance evidence reviewer to differ from the submitter. The Worker also returns 403 on self-review. Runtime/schema tests attempt direct database bypass and verify the distinct-user gates.
