# Reporting implementation — development integration candidate

Date: 25 October 2026  
Platform PR: https://github.com/info-rbp/proinspect/pull/39  
Report Tool PR: https://github.com/info-rbp/Property-Report-Tool/pull/41

## Delivered in the development branches

**Large PDFs:** Replace the original 10 MiB intake with bounded 6 MiB R2 multipart parts and a maximum PDF size of 90 MiB. Compute SHA-256 incrementally as the authenticated Worker receives each byte. Validate the PDF prefix, Work Order, staff assignment, signed handoff, source report ID and expected service template. R2 and D1 remain private. Identical upload retries return the reviewed document; divergent bytes are rejected.

**Template parity:** Map each of the 23 ProInspect service IDs to one of the specialist tool's recognised report types with a test asserting complete catalogue coverage. The source Report Tool sends its immutable report type with the completed PDF. This verifies service-to-template compatibility; it is **not** a business/legal certification that every statutory clause in all 23 output templates has been signed off.

**Field mode:** The ProInspect Staff report editor now has a mobile-first one-component workflow with touch controls, area navigation, condition and cleanliness inputs, progress, maintenance flags and direct camera capture. Images are browser-compressed, stripped of camera metadata and uploaded as JPEG to the existing private evidence API. When offline, the existing encrypted device draft/photo queue remains the supported path. Photo acceptance and report review still require a separate actor.

**Historical comparison:** A staff-only and read-only comparison endpoint selects an earlier issued, immutable report version for the same canonical property (or scheme) and tenancy context. Reports with duplicate item labels do not receive fabricated matches. Comparisons use documented categorical severity values and label matching; they never infer causes from photographs. Repeated maintenance flags are displayed for review. No work orders, liability decisions, grants or fees are created automatically.

## Acceptance and release controls

1. Check paired PRs on their exact head SHAs, require both CI checks green, SQL/migration rehearsal 0001-0027, Worker/D1/R2 integration, 90 MiB limit and structured report-type denials, mobile Playwright and native reporting regressions.
2. Set up **isolated staging** for both Workers, with staging-only D1/R2, Cloudflare Access, all report bridge secrets and the `staging` origin. Do not share production resources.
3. Exercise the real Staff email/Access authentication, launch from a genuinely assigned Work Order, a completed PDF with device JPEGs, retry and hash mismatch, private review, independent acceptance, explicit grant and recipient-only download. The integration fixture is **not** a hosted Cloudflare acceptance run.
4. Verify a representative printed PDF for Entry, Exit, Routine, Commercial, Common Property, Building Management and Custom; complete WA Form 1 mandatory item locking and human legal/content approval before designating the reporting template fully production ready.
5. Stress test several 30-90 MiB PDFs, interrupted upload, mobile offline/outbox reconnect, low storage, unsupported HEIC images, concurrency, and version conflicts. Check actual Cloudflare Worker request-size/CPU limits for the configured plan.
6. Keep `Property-Report-Tool` hosted with its existing approved Access controls until the native authoring migration reaches exact feature parity; avoid deploying this integration merely because CI passes.
7. Track upstream updates through reviewed compatibility PRs. Source template versions, renderer changes and historical approval decisions must remain pinned and reproducible.

## Deliberate exclusions

- No automatic statutory service, bond actions or legal causation inference.
- No unsolicited emailing/signature invitations for ProInspect-linked reports.
- No automatic ticket/work-order creation from changes detected in historical reports.
- No extension of tenant, council or landlord permissions to raw draft/photo evidence.
- No production migration or Worker deployment has been performed by this integration work.
