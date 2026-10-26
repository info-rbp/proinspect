# Property Report Tool integration (reviewed but staging acceptance pending)

This branch adds the matching platform side for `info-rbp/Property-Report-Tool` at source commit `4350033d087c37eaae3a8ea9857efc2e12a11079`.
The older `REPORT_TOOL_ORIGIN` / `REPORT_TOOL_SECRET` callback remains available; do not remove it until genuine hosted acceptance.

## Configuration (encrypted secrets only)
- ProInspect Worker `REPORT_TOOL_V2_HANDOFF_KEY` must equal Report Tool Worker `PROINSPECT_HANDOFF_SIGNING_KEY`.
- ProInspect Worker `REPORT_TOOL_V2_INGEST_TOKEN` must equal Report Tool Worker `PROINSPECT_INGEST_TOKEN`.
- ProInspect Worker `REPORT_TOOL_V2_ORIGIN=https://report.creation.proinspect.systems` (text variable).
- Report Tool Worker `PROINSPECT_INGEST_URL=https://proinspect.systems/api/integrations/property-report-tool/ingest` (text variable).
- Keep all Worker secrets server-side, never in GitHub, browser code or support logs.

Apply migration `0027_property_report_bridge.sql` to an isolated D1 before enabling. The new launch route is `POST /api/staff/work-orders/:id/property-report-tool`; ingestion is `POST /api/integrations/property-report-tool/ingest`. Both are independent of legacy reporting APIs.

The signed token is a short-lived report creation authority. An existing completed report may be published/retried until the handoff publication deadline if the original Staff assignment remains active. Only a currently assigned Staff inspector may publish through a registered handoff. Each source handoff is bound to one source report ID; a byte-identical replay can return the existing review document.

**The uploaded PDF enters `documents.status='review'` with no customer grants or notifications.** It is not issued automatically. Staff must review and issue it using existing recipient-scoped document controls.

Current constraints:
- Original V1 tool engine and all 23 selectable templates remain in their own Worker. The current lightweight native ProInspect editor remains available independently.
- Only property-backed booking Work Orders with explicit service mappings can launch this bridge.
- Maximum PDF transport size is 10 MiB, consistent with existing ProInspect document limits; larger reports must use a separate chunked/direct-R2 accepted design.
- Statutory Form 1 mandatory-item locking, professional templates, real mobile/offline, large-device photos, inbox delivery, signing and source-to-target synchronization require separate acceptance.
- Current target bridge does not implement a report revision/replacement workflow: a reviewed PDF is immutable for a given handoff; issue a new approved Work Order/report request for corrections.

CI gate: `pnpm check`, `pnpm test:integration`, `pnpm test:browser`, deployment dry-runs. Stage a synthetic assigned Work Order; launch from Staff, complete a V1 report at the Access-protected tool, verify the staged R2 PDF returns to ProInspect as an unissued review document, deny unrelated client/tenant access, and independently issue only to correct recipients. Do not deploy or merge merely because code review passes.
