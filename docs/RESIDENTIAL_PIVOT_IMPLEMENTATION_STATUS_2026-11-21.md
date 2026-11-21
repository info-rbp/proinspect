# Residential pivot — implementation and release evidence

**Decision: DRAFT / NO PRODUCTION GO. Phase 6 is on hold.** This is substantial implementation of Phases 0–5, not certification that every requirement in the portal specifications is complete. No main merge, live Stripe activation or Google Cloud change is authorised by this evidence.

## Controlling scope and preservation

- Owner decision: one Residential All Inclusive Subscription, AUD 50 ex GST / AUD 55 inc GST, weekly per property, initial 24 months, 60 days written notice, no per-room subscription. Free registration and separately quoted Co-Living operating agreements remain distinct.
- Plan: PR #114, `plan/residential-only-pivot-20261121`, plan commit `802ed4e87bc3cca34dfc3bcd5aec3576d52478ee`. This branch includes a copy with the confirmed decisions above the original text.
- Source and production baseline: `fdb7ef5c3d313397d9bf5cd6b35ce04f89765acf`.
- Preservation: `archive/commercial-strata-pre-pivot-20261121`, commit `c00a285e167fbbfdc8080c28fd2f69092ba62d01`. Its code matches the baseline; additional `docs/retired-products/` files describe builds, reactivation and specification provenance. A clean checkout installed the locked dependencies and built the archived application successfully. Restore in a separate checkout; never force-push this archive or reactivate by merging it blindly.
- Implementation branch: `implementation/residential-only-pivot-20261121`.
- Reference review covered the approved plan, completion guide, Residential Portal Build, Operations Portal Build, Portal Engineering Build, fee schedule and Co-Living framework. Original supplied/synced files were read-only. The old fee schedule is not approval of the new plan's allowances or early-exit rules.
- Existing legacy records are retained. No speculative legacy-customer servicing, customer termination, data erasure or historical contract conversion was performed.

## Phase status

| Phase | Delivered | Open acceptance |
| --- | --- | --- |
| 0 | The Commercial and Strata preservation branch contains the source and both reactivation specifications. | Independent archive sign-off |
| 1 | The nine requested header entries, Residential-only account and agency choices, catalogue, single weekly offer, sitemap and retired route responses are implemented. | Owner content and accessibility review |
| 2 | Server guards cover retired acquisition, stale submissions, bookings, invitations and notifications. Historical grants and recorded evidence are retained. | Independent security review |
| 3 | Owner and agency portfolios, property booking, invited tenant maintenance, Co-Living rooms, Residential leasing and Staff operations are available for testing. Staff case details join the booking, source request, report review history and authorised financial records. The assigned inspector cannot issue a final PDF directly. | Owner browser journeys, separate inspector/reviewer identities and representative PDF visual, photo and complex-script acceptance |
| 4 | One contract per property records AUD 50 plus GST weekly, a 24-month initial term and 60 days’ written notice. Notices have a durable receipt and appear in Staff billing. A separate Staff reviewer can reconcile an existing sandbox cancellation against the exact subscription, property contract and permissible end date. | Signed terms, inclusions, final-week and early-exit treatment, independent legal approval and real Stripe sandbox acceptance |
| 5 | Dedicated Cloudflare staging sign-in, synthetic fixtures, full regression runs, browser acceptance checklist, database export recovery and two hosted R2 restore exercises. | Owner mailbox and role journeys, restoration to a second hosted D1, independent PR and release approval |

## Environment boundaries observed before deployment

| Resource | Production (read-only) | Existing isolated staging target |
|---|---|---|
| Worker | `proinspect-platform`, source baseline above | `proinspect-v3-staging`, prior source `799dfdff981079499d971b45b4c4431b653c9683` |
| D1 | `dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea`, ledger through 0062 | `e66b8ebc-637d-4737-8d47-b0fbec3c082c`, ledger through 0057 before release |
| Documents | `proinspect-production-documents` | `proinspect-v3-staging-documents` |
| Restricted documents | `proinspect-platform-restricted-documents` | `proinspect-v3-staging-restricted` |
| Queue | `proinspect-platform-events` | `proinspect-v3-staging-events` |
| Provider activation | No flags changed | `APP_ENV=staging`, `EMAIL_PROVIDER=local`, all `*_ENABLED=false`, no cron |

A request for another isolated D1 database was rejected by Cloudflare with `System limit reached: databases per account (10)`. No database was deleted to obtain capacity. The workflow therefore reuses the existing staging resources, isolated from production but shared with earlier preview work. Staging migrations are additive 0058–0063; no production migration is requested. Staging Time Travel bookmark observed before deployment: `0000004c-00000000-0000512a-851f3e473c64b54175114b058c28cac4`. A bookmark alone is not recovery proof.

The preview workflow checks the deployed source revision against the staging health endpoint. The dedicated sign-in application uses Cloudflare Access email codes for the three authorised browser testers. Other staging business email uses the local outbox. [Staging health](https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev/api/health)

## Staging and recovery evidence

- The staging-only Access application protects `/auth/staging`. Its allow policy contains exactly the three owner-nominated addresses. Verified access creates a normal expiring ProInspect session. Staff, owner/agency and tenancy privileges come from the staging database. The hosted browser reached Cloudflare’s email-code screen through the staging sign-in form. The provider challenge and receipt of an actual email code are separate observations.
- The three accounts have one Staff administrator, two client workspace grants on synthetic properties, and one resident tenancy. The resident has one room allocation and no Staff or client membership. The staging database contains 11 Residential catalogue services and a separately labelled zero-price practice visit. A synthetic Residential listing is visible on the staging leasing page. No paid contract was provisioned for these tests.
- A complete Cloudflare staging D1 export restored into a fresh local SQLite database. The snapshot was 595,391 bytes, SHA-256 `5d53a07f67f9426be04e75b2aa66a939c39d3b983cc99c4208bba5bc6c010fa2`. All 322 tables, 63 migration entries and sampled test grants were recovered, integrity passed and foreign-key violations were zero. This snapshot preceded the change to the three owner-nominated identities. A staging Time Travel bookmark was available. Cloudflare returned quota error 7406 on creation of a separate hosted recovery database.
- The hosted R2 drill used unique synthetic keys in both staging buckets. Each exercise copied the file, removed the synthetic original, restored it, compared all bytes, removed the drill keys and checked that they were gone. The files contained 126 and 127 bytes. Drill reference `47f59db5-a339-49eb-9500-f2c6ed029f72`.
- The full local integration suite passed. A fresh dependency installation and synthetic database passed all 96 browser tests with zero retries or skips. Coverage includes allowed Residential journeys, denied retired actions, scoped historical reads, consent, invoice events, replay and report issue. The hosted preview workflow additionally checks its own source revision and the real Access challenge. The final PR comment links the exact-head CI and hosted evidence.

## Legal, provider and release decisions

The contractual product is approved at the owner-confirmed price and term. Legal publication, final service allowances and provider activation require separate evidence. The Stripe connection asked for reauthentication. Provider tests used deterministic sandbox responses. Reconciliation of a cancellation reads Stripe, and the notice records a provider outcome only after a matching, independently reviewed observation. Staff cannot initiate a provider cancellation or determine final-week charges from the receipt.

A fresh staging build can be rolled back to the previous verified source with its original staging bindings. Preserve the additive contract and notice tables. Data rollback requires a private backup and reconciliation of subsequent events. The protected production decision belongs to the release owner after independent acceptance. Phase 6 remains on hold.

[Delivery PR and current checks](https://github.com/info-rbp/proinspect/pull/115) · [Owner browser checklist](RESIDENTIAL_PIVOT_BROWSER_ACCEPTANCE_2026-11-21.md)
