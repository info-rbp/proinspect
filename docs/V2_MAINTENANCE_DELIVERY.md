# ProInspect V2 — Work Package 2: maintenance delivery

Additive migration 0007_v2_maintenance_delivery.sql extends the existing work order, booking, customer approval, scheme and document contracts without replacing the canonical relationships or public default booking resource.

## Implemented

- Work orders contain scoped tasks with asset, trade, priority, budget, task version, evidence requirement and guarded transitions. Open tasks prevent closing parent work orders.
- Verified supplier insurance and licence, competency or induction requirements are checked at assignment; credential expiry and revocations preserve history. ProInspect remains a contractor/operations service, not a statutory appointee or licensed trade merely because a supplier is recorded.
- Separate staff, contractor, equipment, vehicle and space capacity resources have verified trades, weekly AWST rosters, unavailable blocks and immutable allocation history. Database overlap guards prevent competing reservations and protect against conflicting staff legacy-booking allocations.
- Submitted actual labour time has start/end, activity, notes, source de-duplication and non-overlap. Only an independent operations reviewer approves time at an effective immutable cost rate. When a task is linked to an active eligible subscription, approval posts immutable milli-hour usage in the same database batch subject to contractual limits.
- Contractor invoices and other external costs are reviewed separately and checked against task spending ceilings. Task evidence can be submitted and explicitly verified; non-note evidence requires an issued document belonging to the same property or scheme.
- Task closeout needs verified evidence, reviewed labour and costs, finished/released allocations, nonexpired contractor qualifications and an explicit completion summary. All mutations create audit records.
- Staff UI: /w/staff/operations/maintenance-delivery. The API is restricted to authenticated ProInspect operational roles; assigned inspectors can submit their own time/evidence but cannot approve it. Customers cannot inspect internal labour rates or rosters.

## Boundaries

The calendar does not automatically optimise routes or sync to external contractor diaries. Timesheets are not GPS-based and are not payroll. The contractor credential register does not independently license a supplier. Existing customer bookings remain independent. Document permissions and customer approvals are not bypassed. Supplier notifications, legal contract execution, subcontractor payments, invoicing, procurement and production rollout require further integration.

Tests: pnpm check, pnpm test:integration (including full tests/runtime/v2.mjs maintenance scenarios), Wrangler dry-runs and browser acceptance. Review the exact commit's GitHub Actions run before accepting this package.
