# Subscription workbook reconciliation — 16 November 2026

Source: `ProInspect_Subscription_Legal_Decision_Workbook_Updated_2026-11-16.docx` (working edition 2), SHA-256 `a77f47ff658cbc1bec5985d2f012275f770e7025eb681893cbffbc46f581366c`.

The workbook is a decision register, not an executed agreement. Blank approval boxes, proposed wording and source “Included” classifications do not establish accepted entitlements. This reconciliation updates advertised facts and draft wording without activating billing, retrospectively converting accounts or claiming legal/provider acceptance.

## Incorporated facts

- Residential Inspection Only: $20 + GST monthly. Residential All-Inclusive: $150 + GST monthly. Each applies to a whole property leased as a whole, or to each separately leased room.
- Commercial All-Inclusive: $150 + GST monthly per commercial unit; the sole commercial plan.
- Initial 24 months, then month-to-month with 60 days written cancellation notice. No invented early-exit payout formula.
- Inspection Only identifies five service types: quarterly routine inspection, incoming PCR, exit inspection, ProInspect Platform report generation and tenant communication. Event quotas, communication scope, notice responsibility and report delivery require the accepted schedule.
- Ordinary WA residential routine inspections require lawful access and no more than four in a rolling 12 months. Unused visits do not roll over. Tenants versus boarders/lodgers require the correct occupancy model; these rules are not represented as universal commercial or accommodation terms.
- Client quote approval is required before maintenance expenditure. Coordination does not automatically include labour, materials or specialist costs. No default $500/$1,000 spending authority.
- A separately leased room is distinct from a bed allocation. Shared-area tasks must be separately scoped to avoid duplicate billing; room configuration and experience tags do not create billable plans.

## Outstanding workbook decisions retained

| Workbook decisions | Application treatment |
|---|---|
| S01–S03: units, five Inspection Only services, quotas | Confirmed units and service types published; PCR/exit quotas and detailed communication/access responsibilities remain for an approved schedule. No broad entitlement grants seeded. |
| S04–S06: Residential/Commercial matrices and PAYG rates | 106 residential service rows and 52 commercial candidates remain review references. Historical included flags do not grant services. Commercial frequency conflict and 65-hour allowance are not advertised; old $250 price is superseded. PAYG rates stay private, subject to approval. |
| S07–S10: allowances, maintenance authority, fees and responsibility | Plan-specific allowances and exceptional charges remain unapproved. Quote approval precedes expenditure. Licensed/statutory decisions stay with authorised parties. |
| S11–S13: service standards, onboarding, subscription changes | No response SLA, automatic plan election or retrospective conversion. Verified property access is distinct from service entitlements. Changes need the applicable accepted schedule. |
| C01–C04: exit, notice, access/cancellation and urgency | 60-day notice after initial term is displayed. Remaining-term payout, 25%/50% charges and urgent rates are not activated. |
| C05–C07: billing, price changes, liability | Seven-day versus end-of-month terms, $50 late fee, 15% interest, 45-day change notice, grace periods and liability elections remain review decisions. |
| C08–C10: declined work and regulated responsibilities | Respect lawful access, safe scope and licensed functions. No automatic authority to collect trust money, decide tenancy rights or certify technical work. |
| L01–L07: seven legal documents | Reconciled draft terms are versioned separately; approval flags stay false. Existing approved rental collection/privacy notices keep their own runtime versions. No wholesale policy replacement. |
| I01–I06: comparison, unit schedules, entitlements, acceptance, legal publication and release | Shared public plan facts and comparisons updated. New paid schedules require separately versioned agreement, remaining entitlement checks, approved extras and provider acceptance before activation. Not represented as a completed monthly billing engine. |

## Branch integration

PRs #107, #109 and #110 are combined with real merge commits so their original heads remain ancestors. Four customer portal families use independently enforced workspaces, including the new narrow commercial-occupant relationship. Resident invitations, council appointment review and private room scope remain distinct from presentation preferences and experience labels. Registered one-off payments retain the production checkout block pending provider release; amenity reservations remain disabled by default. Financial observations and credit proposals do not move money. Report overlays preserve originals and require independent evidence/annotation acceptance.

The existing 0001–0058 migrations are immutable. New source migrations are 0059 (portal/co-living), 0060 (occupancies/council), 0061 (registered workflows/preferences), and 0062 (finance/annotations). Merge approval does not apply them to production. Existing Worker activation and upload-only build controls must be preserved.

## Verification scope

Run complete type/domain/schema/build checks, Worker integration, isolated D1 upgrade/recovery, browser acceptance and exact-head existing staging preview. Record the final combined source and checks in the integration PR. Main merge is separate from production deployment, migration approval, statutory/provider acceptance or live charges.

Primary legal reference checks: WA Consumer Protection, [Property condition reports](https://www.consumerprotection.wa.gov.au/property-condition-reports) and [Landlord guide, April 2026](https://www.consumerprotection.wa.gov.au/system/files/documents/2026-04/landlordsguide0426.pdf). These sources inform access/report boundaries; they are not legal approval of this workbook or the proposed contracts.
