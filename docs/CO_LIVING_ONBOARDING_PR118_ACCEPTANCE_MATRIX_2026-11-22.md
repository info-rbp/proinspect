# Co-Living Onboarding — acceptance and release matrix for PR #118 descendant

**Source:** `docs/CO_LIVING_ONBOARDING_PR118_IMPLEMENTATION_SPEC_2026-11-22.md`  
**Branch:** `feature/co-living-onboarding-pr118-spec-20261122` (forked from draft PR #118 at `12d66cf9`)  
**Scope:** Acceptance *specification* only. None of these future end-to-end scenarios are asserted as passing merely because this file exists.

## Implementation status

The source branch now includes the additive D1 migration, guarded owner/Staff APIs and six-stage portal screens plus isolated schema/Worker tests. These source changes are *not* acceptance evidence by themselves. The existing Leasing model remains one published property-level listing per property; multi-room public advertising needs a separately approved build. Hosted browser accessibility, licensed payment flows, document issuance and full production release must be accepted independently.

## 1. Function and role acceptance

| ID | Scenario | Required result | Test layer |
|---|---|---|---|
| CL-001 | Public visitor reads generic Co-Living information | Can enquire without gaining private property access | Browser + API |
| CL-002 | Existing owner without Co-Living property enters enquiry | Enquiry may be recorded; no duplicate canonical property or auto entitlement | API + D1 |
| CL-003 | Owner starts enquiry linked to unauthorised property ID | Denied; no project created for foreign property | API + D1 |
| CL-004 | Repeated identical enquiry requestKey | One project; same response; no duplicate notification | API + D1 |
| CL-005 | Owner dashboard lists projects | Only current client's projects; pending decisions accurately counted | API + browser |
| CL-006 | Tenant/Resident requests owner onboarding route | Denied; no owner proposal or supplier fields | API |
| CL-007 | Staff with no assignment/authority opens proposal | Denied or appropriately redacted | API |
| CL-008 | Site visit scheduled from existing booking service | Real permitted appointment reference; not a fake new catalogue booking | API + browser |
| CL-009 | Site visit assessment submitted | Versioned findings/evidence recorded; unreviewed suitability marked provisional | API + D1 |
| CL-010 | Existing whole-property tenancy present | Room reconfiguration and public room launch blocked pending review | API + D1 |
| CL-011 | Proposed theatre/study room lacks statutory review | Not marked approved for rent or advertised | API + D1 |
| CL-012 | Owner accesses current proposal | Sees version, room rents, cap formula, setup costs, scenario assumptions and exclusions | Browser |
| CL-013 | Owner accepts current proposal | Exact hash/version and authority evidence stored immutably | API + D1 |
| CL-014 | Owner attempts to accept superseded version | 409 conflict; no stage progression or spend authority | API |
| CL-015 | Owner declines or requests changes | Project remains consistent; staff notified; previous acceptance not overwritten | API + D1 |
| CL-016 | Unauthorised agency member accepts owner's agreement | Denied without explicit current approval delegation | API |
| CL-017 | Staff requests procurement above approved budget | Cannot commit or mark authorised without owner decision | API + D1 |
| CL-018 | Owner authorises a variation | Signed-off amount and reference attached; not blanket approval for later costs | API + D1 |
| CL-019 | Supplier receipt/warranty uploaded | Only authorised owner/staff can view; object grant checked | API + documents |
| CL-020 | Readiness incomplete or blocked | Cannot advance to Advertising; blockers visible with remedy | API + browser |
| CL-021 | Same staff person drafts and independently approves controlled release | Review rejected where separation required | API |
| CL-022 | Property-level listing linked to onboarding | Uses only an already-published property-level Residential listing, no unauthorised public room listing or second active listing | API + browser |
| CL-023 | First verified resident moves in | Stage changes to Tenanted only after tenancy + PCR + inventory + schedules | API + D1 |
| CL-024 | Only one of six rooms occupied | Project in Tenanted stage; remaining five can remain advertised without new project | Browser + API |
| CL-025 | Resident reads own room | No exposure of other resident identity, owner financials or private staff notes | API + browser |
| CL-026 | Change linked canonical property after issue of proposal | Denied without controlled migration, no foreign-document grant | API |
| CL-027 | Blocked project set on hold and resumed | Preserve tasks, approvals, documents and history | API + D1 |
| CL-028 | Project withdrawn | No further advertising or spend; historical issued evidence retained | API + D1 |
| CL-029 | Concurrent stage advances or decisions | Single winner using version/atomic update; duplicate replay safe | D1 race |
| CL-030 | Staff or owner changes their current role mid-project | Next read/write rechecks current authorisation | API |

## 2. Commercial accuracy

| ID | Scenario | Required result |
|---|---|---|
| FN-001 | Six illustrative room rents and car bays full occupancy | $2,050 + $50 = $2,100/week, clearly hypothetical |
| FN-002 | 25% management fee on $2,100/week | $525/week fee excluding GST; $52.50 GST; owner balance before other costs $1,522.50 |
| FN-003 | Annual fee basis at full occupancy | $109,200 potential collected gross, $27,300 fee ex GST, $6,825 annual eligible utility cap |
| FN-004 | Reduced rent actually collected | Management fee and utility cap decrease; no percentage charged on vacant room |
| FN-005 | Utility reimbursement | Only verified electricity, gas and eligible water **over** annual 25%-of-fees cap is allocated to owner; never internet/common cleaning |
| FN-006 | Separate charges | $100+GST per authorised bond administration and $50+GST per permitted tenancy DB check are not silently included in 25% |
| FN-007 | Furnishing budget | Owner-paid amounts, approved variations and recovered furniture sale proceeds shown separately; no automatic ProInspect payment |
| FN-008 | Financial disclosure | Gross vs after management vs after operating costs vs net capital recovery never conflated |
| FN-009 | Existing PR #118 Cash Client rates | No alteration of inspection price candidates, `services.booking_mode`, subscription entitlement or deferred credit controls |
| FN-010 | Price/contract changes | Immutable historical proposal snapshot; new version needs owner approval |

## 3. Privacy, security and regression

| ID | Scenario | Required result |
|---|---|---|
| SEC-001 | Cross-client read by forged project ID | Denied without existence leak; no attachment metadata |
| SEC-002 | Cross-client write by forged property/client ID | Denied; no side effects or audit spoof |
| SEC-003 | Tenant guessing project ID | Denied, no room-level leakage |
| SEC-004 | Owner calling staff advance endpoint | Denied |
| SEC-005 | Reviewer with same identity as author | Denied for controlled review |
| SEC-006 | Stale proposal decision repeated | Idempotent replay, no second authorisation |
| SEC-007 | Document download without grant | Denied regardless of stage status or URL knowledge |
| SEC-008 | Public enquiry spam/PII | Rate limited, data minimised, retention policy applied |
| SEC-009 | Any PDF/attachment before security review | Existing quarantine and document authorisation preserved |
| SEC-010 | Feature disabled in production | New operational endpoints fail closed; existing Client Portal continues |
| SEC-011 | Current PR #118 registration/property-first booking | No regression for free owner signup and existing booking categories |
| SEC-012 | PR #118 payment release flags off | No live charge, Stripe invoice dispatch, rent transfer or bond lodgement occurs via onboarding |
| SEC-013 | Existing room invitation isolation | No double-booked private space and no active whole-property/room overlap |
| SEC-014 | Mobile keyboard and screen reader | Accessible progress, forms, errors, proposal tables, dialogs and notifications |

## 4. Test ownership and phase gates

1. **Domain scaffolding (current branch):** run `node --experimental-strip-types --test tests/co-living-onboarding-contract.test.ts` and `pnpm typecheck` after dependencies installed. Test controls remain pure; they are **not** a DB/permissions acceptance result.
2. **Schema/API phase:** `tests/co-living-onboarding-schema.test.py` and `tests/runtime/co-living-onboarding.mjs` are committed. Run exact-head schema/Worker checks, expand to non-empty upgrade + recovery and simultaneous budget approval/decision races before release.
3. **Client/Staff browser phase:** extend `tests/browser` for Enquiry → Site Visit → Proposal → Implementation → Advertising → first Tenanted transition using separate staff and owner accounts, accessible mobile/keyboard checks and realistic pending states.
4. **Regression:** verify canonical PR #118 owner registration, property-first appointment categories, PCR/Routine/Exit intake, unapproved candidate prices, disabled Cash credit and independent review.
5. **Release:** only after source-head CI, migration rehearsal, external provider and legal sign-off, independent hosted owner/Staff/tenant acceptance and explicit environment-specific release approval. **No direct production deployment from this branch.**

## 5. Handoff checklist

- [x] Reviewed PR #118 integration and exact-head constraints.
- [x] Created separate descendant branch from PR #118 head.
- [x] Prepared development specification and versioned stages/guide scaffold.
- [x] Commit additive 0065 schema and guarded server API (subject to full test acceptance).
- [x] Commit owner and operations screens (subject to browser acceptance).
- [x] Commit versioned proposals and owner spend decision gates; real signed-document issuance/grants remain outstanding.
- [x] Commit reviewable readiness and existing property-level listing/real-tenancy handoff gates; extended public room listing remains outstanding.
- [ ] Run full automated and hosted acceptance.
- [ ] Reconcile updated PR #118 head, open integration review and authorise any release.

Keep a child draft PR targeted at PR #118's branch until code review is complete. Do not treat this checklist as permission to merge PR #118 itself.
