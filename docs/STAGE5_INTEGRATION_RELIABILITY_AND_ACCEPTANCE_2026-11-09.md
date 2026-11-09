# Stage 5 — Production integrations, security and operational reliability
**Date:** 9 November 2026 AWST  
**Scope:** `info-rbp/proinspect` unified Worker, `proinspect-platform` at `https://proinspect.systems`  
**Release rule:** Exact GitHub verification + Cloudflare build SHA readback. A source merge is not provider acceptance or a D1/R2 recovery rehearsal.

## Responsibilities and implemented source changes
| System | Responsibility | Engineering work in this change | Independent acceptance required |
| --- | --- | --- | --- |
| GitHub | Truthful source, tests, approvals | Added operational, configuration and Worker permission tests. Existing CI, build and migration tests retained. | Full nine-role hosted journeys and named independent release acceptance |
| Cloudflare Worker | Canonical public site and private application | Sampled errors/traces, deliberately disabled invocation logs, query-string redaction, read-only admin operations summary | Actual log capture/privacy review; deployed readback |
| D1 | Transactional authority, audit, outbox, finance | Aggregate health counts for email, projections, calendar, scanning, finance; absent schema is visible rather than silently interpreted as healthy | Database UUID checks, migration count, integrity/FK review, row counts and isolated restore |
| R2 private/restricted | Durable documents and separate sensitive evidence | Existing private bindings unchanged; no delete or copy operations | Exact bucket identities, object retention, full snapshot/restore and negative document-grant tests |
| Queues/DLQ | Asynchronous message delivery | Existing bounded retry/leases retained. Admin dashboard highlights failed mail; no automatic replay or customer messages on deployment | Queue/backlog and DLQ inspection; legitimate failure/replay tests |
| Stripe live | Billing, settled financial status, entitlements | New redacted live configuration inventory identifies invalid account/key/webhook/tax-code shapes. Existing source-bound release gates unchanged | Active AU GST registration, approved non-software tax code, exclusive weekly price, webhook endpoint/replay, cancellation, refund/dispute and reconciliation; no charges before approval |
| Resend | Transactional email | Existing encrypted outbox; new administrator failed/pending aggregate visibility | Genuine delivery/bounces/complaints, approved sender and safe retry |
| Google Calendar | Schedule projection only | Existing fail-closed booking/Calendar sync and exception queue; new aggregate monitor | Genuine create/reschedule/cancel/conflict authorisation and readback |
| Scanner, Apps Script, signatures, Report Tool | Restricted evidence processing and source-linked handoff | Existing adapters and gates remain; new failed-projection and exhausted-scanner signals | Provider privacy/legal terms; genuine signed callback, quarantine, replay and revocation validation |
| Nine workspaces | Server-authorised portal access | Operations endpoint remains administrator-only and is exercised in Worker/D1 integration tests | Nine independently authenticated hosted role paths, overlapping permissions, revocation, confidential denial |

## Verified deployment inventory — read-only Cloudflare API
**Worker:** `proinspect-platform`, same unified public and private Worker.  
**Production D1 binding:** `DB` → `proinspect-platform-data` (`dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea`).  
**Ordinary private R2:** `DOCUMENTS` → `proinspect-production-documents`.  
**Restricted private R2:** `RESTRICTED_DOCUMENTS` → `proinspect-platform-restricted-documents`.  
**Events producer:** `proinspect-platform-events`; configured dead-letter queue `proinspect-platform-events-dlq`.  
**Durable Object:** `BookingScheduler`.  
**Existing hosting:** Cloudflare Workers Builds on `main`, no new persistent staging environment.

**Security finding:** Prior to this change Cloudflare's observed Worker setting was `observability.redact_query_string=false` and `traces.enabled=false`. The repository now requests query redaction and sampled tracing. After automatic deployment, independently read back **actual** settings and compare the build SHA. Do not claim changed production state from repository configuration alone.

## Admin operational health counters
Access via existing **Staff → Release acceptance** (`/w/staff/operations/release-readiness` where authorised). Source: `/api/staff/release-readiness`. Role: **verified administrator only**, existing auth/session/origin controls. Data returned:
- failed and pending mail outbox record counts;
- failed allowlisted external projections;
- calendar jobs requiring attention;
- scanner jobs exceeding attempts;
- open payment reconciliation items;
- independently reviewed invoice delivery exceptions.

All results are **read-only aggregates**. This endpoint never returns email addresses, event envelopes, attached documents, lease tokens, bank details, Stripe identities, webhook signatures or URLs. Missing migration tables return `not_available`, never `healthy`. A zero count is *not* provider delivery or payout evidence.

## Read-only verification and deploy checklist
1. Confirm GitHub main SHA, existing branch protections/reviews, full CI, nine-role negative tests, SQL migrations `0001–0053`, code versions and permissions. Do not merge a failing head.
2. Verify Cloudflare Worker build/deployment source SHA and exact Worker binding identities; no local or historical D1 target should be used.
3. Confirm deployed `redact_query_string=true` and `traces.enabled=true`, no logging of request bodies, sign-in tokens, financial data or unrestricted document paths. Investigate actual log/traces records without opening secrets.
4. Read `/api/health` publicly; never expose secret values or internal subscriber data. Fetch administrator operational signals using a genuine authenticated admin session and test non-admin 403/no-session 401.
5. Review D1 migration ledger, foreign-key integrity, approximate data volume and last bookmark with **read-only** API. A bookmark is not an independently verified full D1+R2+Queue restore.
6. Check both R2 inventory locations, bucket protections and any public domains; do not download restricted personal documents into diagnostic attachments.
7. Inspect real queues and DLQ, live Calendar binding, email sender, Stripe restricted key/webhook endpoint and provider failure/replay evidence. Record separately; shape checks do not constitute provider verification.
8. Obtain independent operational, finance, legal, privacy and security release approval with immutable evidence. Keep all unapproved payment/signing/regulated workflows disabled.

## Known blockers that remain after this engineering tranche
- Full retained Stage 4 work, including template/photo/Unicode parity, financial corrections, bank/payout reconciliation and statutory forms, remains open.
- Live Stripe product tax classification, GST setup and webhook delivery must be validated with the **actual connected Stripe account**; a restricted key binding and production Worker are not sufficient. No live charge, refund or dispute is an appropriate unapproved test.
- Nine separately authenticated hosted role journeys and cross-role permission denial require distinct real-user acceptance.
- Isolated D1/R2 recovery exercise, Queue replay scenario and independent RPO/RTO acceptance cannot be replaced by a database bookmark existence check or Worker rollback. If the isolated restore exercise is not authorised, report it **not accepted**.
- Sign-off requires named business/legal/privacy/operations owners and provider counterparties. No such approvals are fabricated.

**Engineering tranche:** safe to deploy once exact CI passes. **Stage 5 full acceptance:** not yet achieved; live-provider and independent recovery gates remain outstanding.
