# WA Form 1AA — official PDF mapping and DocuSign acceptance

**State: not approved for public issue or electronic execution (26 October 2026).**

## Selected provider and why
Recommended first provider: **DocuSign eSignature REST API v2.1**. It supports multiple named signer recipients, independent signature tabs, draft creation, webhook envelope-status events, signed document retrieval and certificate/evidence retention. This is a recommendation, not evidence of a funded account or signed supplier contract. Use DocuSign demo for test transactions, production only after API plan, account verification, go-live, legal approval and real recipient acceptance. Alternatives (Adobe Acrobat Sign and a physical-signature process) remain available; do not design dependence on one provider’s account URL.

Official reference: https://developers.docusign.com/docs/esign-rest-api/how-to/ and https://developers.docusign.com/platform/webhooks/connect/implement/.

## Authoritative master edition
The latest Consumer Protection form source inspected in October 2026 is:
https://www.consumerprotection.wa.gov.au/system/files/documents/2026-04/form1AArentalagreement2026.docx

The preceding searchable PDF is an older edition. **Do not use that older PDF for coordinates.** The official DOCX could not be retrieved as usable bytes through the available execution environment, so no current page count, actual coordinates, master hash or layout certification is claimed. A genuine approved mapping still requires obtaining those bytes, converting via a reproducible pipeline, preserving the prescribed text, rendering every PDF page and independently reviewing placement/overflow at the current form edition.

## Machine-readable map delivered
- `packages/wa-residential/form1aa-official-map.ts` enumerates all field categories from `FORM_1AA_SECTIONS`, pins the 2026 official source URL and defines source DOCX SHA-256, converted PDF SHA-256, edition, verified page count, each field's official page and rectangle, independent reviewer, and one signature location per tenant plus lessor.
- `validateOfficialMap` rejects missing required placements, duplicate placements, unrecognised keys, invalid pages/rectangles, missing source provenance and absent signer tabs.
- **No guessed coordinates, SHA-256, legal approval or current edition verification are committed.** `WA_AGREEMENT_ESIGN_ENABLED` remains false.

## Field-to-PDF review method
1. Retrieve current official DOCX from Consumer Protection; retain original bytes, publish date and URL in a sealed master register.
2. Render unchanged official DOCX to PDF using a pinned converter; record actual conversion build/version, PDF SHA-256, page sizes and page count.
3. Visually inspect every page (including footer, blank signature spaces and prescribed instructions) using both a rendered page image and extracted text where available.
4. Associate every required application field with an actual **official printed label**, page, rectangle and conditional display rule. Validate the respondent's values against the correct tenancy and the prescribed agreement.
5. Register one distinct signature tab per verified tenant and the actual authorised lessor/agent; check for coordinate collision and multi-page amendments.
6. Produce at least three sample agreements (one tenant fixed-term, two tenants periodic, two tenants fixed-term with complex additional terms). Render and inspect all output pages; compare source statutory wording without alteration.
7. Independently approve the frozen hash and mapping; replacement editions must invalidate prior approval, not silently inherit field coordinates.
8. Permit production activation only after all other legal/signature/service/notification gates pass.

## Provider integration contract
- `packages/wa-residential/docusign-sandbox.ts`: constructs one draft envelope per reviewed official PDF, with distinct signer recipients and signature tabs; locks the local case ID, PDF digest and edition as hidden custom fields.
- The adapter only calls the **demo** DocuSign API and submits `status: created`, never `sent`. It rejects production sending and unapproved maps. Its OAuth access token is supplied by the calling server and must be stored as a Worker secret.
- **Not yet wired to an authenticated production route.** Actual signing requires an approved OAuth flow, provider account, envelope delivery, webhook HMAC validation, case-linked envelope table, immutable provider event replay handling, completed PDF download, byte/hash verification, certificate of completion, R2 tenancy-specific grants, and appropriate document delivery/service records. Do not treat a provider webhook event alone as proof of legal service.
- Provider credentials must never appear in source files, GitHub CI logs, browser state, URLs or ordinary audit events.
- Do not use DocuSign to sign WA government paper bond forms where pen/stylus or BondsOnline rules require a different process.

## Integration acceptance scenarios
| Case | Expected result |
|---|---|
| One lessor and two verified tenants on one WA residential tenancy | Exactly three separate recipient IDs and signature fields; no shared signing token |
| Tenant removed after invitation | Original task cannot be completed with revoked portal authority; review/void the envelope |
| Unrelated landlord, wrong tenancy, commercial workspace or anonymous visitor | Deny access and document download without disclosing contents |
| Stale version, changed approved PDF hash, missing official template | Reject signing/invitation; no provider call |
| One signer ignores invitation or declines | Do not issue executed copy; track incomplete state and staff resolution |
| Duplicate webhook, wrong account/envelope, invalid HMAC | Reject or idempotently ignore; never silently mark executed |
| Provider unavailable or returns 5xx | Preserve pending state, retry safely, no duplicate envelope or queued delivery |
| Provider completes all three signatures | Retrieve signed PDF and completion evidence, verify source provenance, grant explicitly and notify each authorised signer |
| Email accepted by provider but undelivered | Separate dispatch evidence from delivery and statutory service outcome |
| Form 1AA replaced by new edition | New review/mapping/hashes; historic executed PDF remains immutable |

## Hosted acceptance still outstanding
Real authenticated Landlord, two Tenant and Staff identities, an actual 2026 official template and reviewed PDF output, real DocuSign sandbox envelopes, Connect HMAC and signed-document retrieval, provider-delivery evidence, and privacy/legal acceptance are **not supplied by code tests**. These remain hard launch blockers and must be documented with exact source, operator, reviewer and evidence references before enabling `WA_AGREEMENT_ESIGN_ENABLED`.

Do not merge or activate this integration merely because isolated local/CI tests pass.
