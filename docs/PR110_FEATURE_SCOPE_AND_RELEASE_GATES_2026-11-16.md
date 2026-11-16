# PR #110 implementation and release gate register — 16 November 2026

**Repository:** info-rbp/proinspect
**Dependent branch:** feature/registered-booking-coliving-experiences-20261116
**Base:** feature/unified-portals-resident-invites-coliving-20261116 (draft PR #107)
**Related draft work:** PR #109 (versioned onboarding and invitation flows); PR #89 (professional portal UI).
**Integration note (16 November):** The combined integration includes PRs #107, #109 and #110, preserving their commits and the existing temporary-upload migration. Canonical new migration numbers are 0059 portal/co-living, 0060 occupancies/council, 0061 registered workflows/preferences and 0062 finance/annotations. The original branch scope below is historical; see `SUBSCRIPTION_WORKBOOK_RECONCILIATION_2026-11-16.md` for the reconciled source and release boundaries. PR #89 is outside this integration.

**Policy:** Draft development only. No production migration, charges, real tenants or external provider activation by branch merge alone.

## Development changes committed

| Scope | Code paths | Verified boundary / still missing |
| --- | --- | --- |
| Registered one-off appointment | worker/scheduler.ts; features/{payment-lifecycle,bookings,finance}.server.ts; customer booking and Finance pages | Price snapshot and payment ledger created once with booking; Work Order held until signed amount-bound Stripe settlement; production paid reservations disabled while existing sandbox-only Checkout awaits approved live flow. No claim of live provider acceptance |
| Co-living lifecycle | co-living-operations.server.ts; residential co-living screens; 0059 | Individual occupancy, operational rent/bond reference values, shared utility basis, private check-in/out events, transfer-request log and independent Staff review. **No rent collection, bond lodgement, automatic transfer or executed agreement** |
| Private common-area condition | co-living.server.ts; co-living-operations.server.ts; Resident My residence | Private encrypted draft; separately reviewed, resident-safe published summary; no distribution of other residents’ room records or raw photos. Does not replace complete inspection templates |
| Experience tags and preferences | packages/domain/portal-experience.ts; features/experience-preferences.server.ts; workspace shell | Client tags change presentation, not permissions; per-user density and preferred landing subject to whitelist; revised Resident membership excludes ended tenancy |
| Reporting evidence | packages/report-engine/pdf.ts; features/{report-annotations,report-issue}.server.ts; 0060 | Original JPEG SHA-256, independently reviewed numbered vector overlay, exact native PDF manifest. Existing WinAnsi renderer deliberately rejects unsupported complex Unicode; no glyph substitution |
| Financial exception register | features/finance-reviews.server.ts; Staff UI; 0060 | Auditable, independently reviewed **proposals and observations only**, no provider credit notes, transfers, refunds, bank receipt certification or payout settlement |
| Strata amenity pilot | features/amenities.server.ts; Resident and Strata UI; 0059 | Disabled unless STRATA_AMENITIES_ENABLED=true and separately approved. Current scheme relationship required, no double-approved time slot. Does not collect money or provide statutory governance |
| Community information | community-updates.tsx | Reuses individually authorised notice/notification delivery. No open chat, event charges or member directory |

## Draft PR source alignment
- PR #107 supplies the four portal families, invitation-only Resident access, account-level experience labels and co-living rooms/spaces (migration 0058). This PR **depends** on #107; it must not merge independently into main.
- PR #109 supplies the versioned onboarding flow registry used as source for packages/onboarding/registry.ts, adapted to the requested **Resident** portal name. Do not assume PR #109’s commercial-occupant invitation API, flow-specific screens or hosted acceptance have been ported here. Reconcile both branches in a separate integration review.
- PR #89 contains professional portal navigation and role-specific screens. It is not merged into this branch; reconcile its route naming and authority rules before claiming unified professional portal parity.

## Independent acceptance gates (all NO GO until evidenced)
1. **Exact SHA:** pnpm check, schema migration and Worker tests, Wrangler isolated D1 rehearsal, browser journeys, accessibility and responsive review all pass at the same current commit. A prior successful run on main or any draft PR is insufficient.
2. **Hosted roles:** Nine separately authenticated users genuinely complete their email-link and Turnstile flows, operate the authorised workspace, are denied unrelated records and prove membership revocation. The proposed Building Manager alias requires owner approval.
3. **D1/R2 safety:** Verify the actual bound production D1 UUID and migration ledger; rehearse 0058–0060 in an isolated Cloudflare D1 clone and separately verify ordinary/restricted R2 object retrieval, Queue behaviour, backup/restore and audit integrity. Synthetic local SQLite is necessary but insufficient.
4. **Stripe and finances:** Obtain approved service price, GST/tax class, customer terms, live connected Stripe account, restricted API key, signed webhooks, retry/reversal/dispute and one-off checkout proof. The current one-off code deliberately blocks live priced booking creation until a separate authorised live checkout implementation exists. Credit proposals and bank observations cannot be marketed as posted credit notes or reconciled payouts.
5. **Email/Turnstile:** Real sender domain, deliverability, webhook retry, invitation expiry/revocation, consent and privacy checks. Test delivery to approved identities rather than changing verified_at in D1.
6. **Reporting:** Retained 25 Report Tool template golden PDFs, complete photo markup provenance, offline recovery, approved Unicode font/embed/rendering strategy, reviewed output and author/reviewer/issuer separation; do not infer completion from mapping 23 service IDs to templates.
7. **WA residential/commercial legal:** Official Form 1AA/version templates, per-room/co-living agreement type and statutory terminology, appropriate bond authority, Form 2 restricted processing, authorised signing and actual notice/delivery evidence need independent legal and operator decisions. No simulated signature or bond receipt.
8. **Optional strata:** Levies, actual strata accounting, AGM, scheme statutory voting, insurance reconciliations and unmoderated community functions are **not implemented**. Existing notice, common-property requests and opt-in amenity requests are not substitutes.
9. **Enterprise scale:** Existing bulk intake remains bounded and scheduling uses limited capacity. Multi-inspector optimisation, uncapped imports and full cross-provider automation remain unimplemented.

## Suggested integration sequence
A. Independently fix and accept #107, then rebase this PR onto its approved source commit.
B. Reconcile onboarding/invitation modules from #109 without turning a general account sign-up into a Resident role.
C. Review professional UI differences from #89, preserving management relationship checks, then decide which screens to port.
D. Run migrations 0058–0060 on **isolated** D1 with preserved historical records, recover backup, test role denials. Production schema application remains separately authorised.
E. Obtain provider/legal/finance acceptance for the exact SHA before toggling live Stripe or amenities. Keep unsupported public claims off marketing.

## Explicit limitations
This development tranche cannot demonstrate live payment, Unicode PDF fidelity, statutory agreement validity, complete bank reconciliation or authenticated hosted role acceptance merely by committing source. Claims of those results require real independently reviewed evidence tied to the deployed SHA.
