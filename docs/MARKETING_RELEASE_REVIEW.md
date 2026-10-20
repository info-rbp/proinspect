# ProInspect marketing release review — PR #31

**Status: code remediation in progress; operator approvals remain outstanding.**

This is the marketing-only release checklist for the unified Cloudflare Worker. Merge to `main` is a deployment action: Cloudflare Workers Builds automatically builds and deploys from `info-rbp/proinspect:main`. A green PR is not evidence of a signed privacy policy, genuine service photography or production provider readiness.

## 1. Architecture and safety contract

- Public routes share the unified Worker and existing site chrome; private auth, booking, staff, tenant, strata, finance and property routes remain outside the redesign.
- The public enquiry form continues using the signed, rate-limited, consent-aware, Turnstile-protected in-process receiver. Do not duplicate that logic in marketing routes.
- All actual reports and restricted property files remain private in R2 and subject to verified relationship/recipient grants. **Never use private document URLs, client report images or customer data as public marketing assets.**
- Marketing descriptions are editorial scope guidance. Accepted service, authority, access, price, appointment and exceptions are resolved by the authenticated application, not invented by the homepage.
- External domain, email, provider and operational readiness must be confirmed separately under `docs/UNIFIED_SITE.md`.

## 2. Privacy / legal approval — REQUIRED before merge/public release

The `/privacy` and `/terms` routes now contain **substantive draft documents**, sourced from the actual repository workflows. They are not represented as approved business policies.

The single source of approval state is `packages/marketing/legal-drafts.ts`. While the status is false:
- Both pages show a visible pre-release/draft warning.
- React Router renders `robots: noindex, nofollow`.
- `apps/platform/app/lib/public-routes.ts` instructs the Worker to send `X-Robots-Tag: noindex, nofollow` even from the canonical domain.
- Automated tests assert these protections.

### Privacy: operator/counsel must verify and enter

- [ ] Correct Australian operating legal entity, ABN/ACN if applicable, business postal address, phone and named privacy contact.
- [ ] Legal applicability, approved effective date and version owner.
- [ ] Actual forms and collected categories (enquiry, account, organisation, property, tenancy, resident, council, staff, file metadata, authentication, financial, restricted cases).
- [ ] Data purpose and authorised recipient categories, including Staff, invited parties, approved contractors and service providers.
- [ ] Actual vendors and locations: Cloudflare, payment/communications providers, any subcontractors, and whether/where overseas disclosure occurs. No unsupported “Australia-only data” promise.
- [ ] Validated access/correction and complaint channel, identity verification, escalation and turnaround.
- [ ] Approved retention, secure disposal, de-identification, backup and incident/breach processes.
- [ ] Consistency with relevant Australian privacy obligations and any privacy notices presented at data collection.

### Service terms: operator/counsel must verify and enter

- [ ] Contracting legal entity, business details, effective date, version and relationship to customer-specific agreements.
- [ ] Scope and exclusions for inspections, maintenance attendance, access, completed works, documents and ongoing operational models.
- [ ] Booking acceptance, identity, access and lawful entry requirements.
- [ ] GST/fee presentation, applicable entitlements, quotes, confirmation, deposits and payment/reconciliation practices (if applicable).
- [ ] Reschedule, cancellation, no-access and refund policy aligned to actual workflows and Australian Consumer Law.
- [ ] Contractor instruction, specialist reports, property hazards, insurance/indemnity language and dispute handling, subject to review.
- [ ] No unfair contract clauses, no exclusion of non-excludable statutory consumer guarantees or remedies.
- [ ] Attorney or legally responsible operator signs off the **final** text before changing `PUBLIC_LEGAL_APPROVAL` to approved.

**No policy effective date, regulator compliance certification, retention timetable, provider country or refund fee should be invented in code.** The draft wording is for owner/counsel review, not a signed legal deliverable.

## 3. Media rights / visual quality — REQUIRED before replacing illustrative visuals

The marketing components now use the explicitly gated registry at `apps/marketing/app/lib/media-approval.ts`. `APPROVED_PUBLIC_MARKETING_IMAGES` intentionally starts empty; original illustrations remain visible and labelled as illustrations.

To publish a real property photo:
- [ ] Obtain the original asset from a legitimate source and verify copyright licence, permitted commercial use and attribution requirements.
- [ ] Confirm the property owner and identifiable occupiers permit this specific public marketing use; remove personally identifying information, address plates, access information and vehicle registrations.
- [ ] Obtain an approved public-safe local image asset. Optimise dimensions and encoding (AVIF/WebP/JPEG), avoid tracking URLs and external dynamic asset hosts.
- [ ] Provide alt text that actually describes the image without implying it depicts a ProInspect job unless verified.
- [ ] Record source, rights evidence, property/person consent evidence, reviewer and approval date. Place the asset in both application builds through the documented static asset process.
- [ ] Only then register it in `APPROVED_PUBLIC_MARKETING_IMAGES` with `approvedForPublicUse: true`. Approvals must be auditable and revocable.
- [ ] For real issued report samples, obtain explicit authorised release; redact all names, addresses, photos of occupants, access codes, document IDs and metadata. Check against private R2 access controls. Do not expose a report URL directly.

**A generated/stock image is not a genuine ProInspect property inspection photo or real service evidence.** No current repository asset has been represented as a customer job.

## 4. Accessibility and visual quality

Implemented in this branch:
- Shared semantic headings, breadcrumbs, native details/summary FAQ, keyboard-operable menus and skip-to-main link.
- Light-background small label colours darkened; focus outlines strengthened; 1100px navigation breakpoint aligned with the legacy CSS.
- Mobile touch/keyboard target and forced-colour/reduced-motion styles.
- Node contrast assertions for representative design-system colour pairs.
- Playwright keyboard, 320/390/768/1100/1440 reflow checks, public asset safety checks, draft legal indexing checks.
- Representative screenshot evidence produced for desktop and mobile, stored in CI artifacts under `artifacts/screenshots/marketing-release-review/`.

Remaining human acceptance:
- [ ] Review CI screenshot matrix at desktop/mobile, all hero/callout/cards, scroll and responsive navigation.
- [ ] Verify 200%/400% browser zoom, landscape/tablet layout and contrast against actual computed surfaces.
- [ ] Keyboard-only navigate header dropdown, mobile nav, contact form, validation feedback, FAQs and booking handoff, checking focus order and visibility.
- [ ] VoiceOver (macOS/iOS) and NVDA (Windows) sample checks; ensure headings/landmarks, descriptive link text, meaningful image text and form errors are announced.
- [ ] Review reduced motion, high-contrast/forced colour and touch targets in supported browsers.
- [ ] Confirm legitimate property photos and genuine redacted report examples display safely and look consistent if supplied.

**Automated testing does not constitute a complete WCAG 2.2 AA conformance audit.** Record manual reviewer/date and any remaining exceptions.

## 5. Decision register

| Gate | State | Evidence / required reviewer |
| --- | --- | --- |
| 53 marketing routes and responsive page families | Implemented | Browser suite in GitHub Actions |
| Branch typecheck, worker/API integrations and dry-run | Verify exact final SHA | `Verify ProInspect` workflow |
| Legal documents | **Awaiting operator/legal approval** | Approval and effective dates required |
| Original photography / real report samples | **Awaiting rights-cleared assets** | Consent and permitted-use evidence required |
| Accessibility | Automated remediation implemented; **manual review pending** | Screenshot/keyboard/AT sign-off |
| Copy and claims | **Awaiting business content sign-off** | Commercial model, service-area and scope verification |
| Production hosting | **Do not deploy from this PR without release sign-off** | Cloudflare build variables, Turnstile hostname, production domain and enquiry provider acceptance |

The pull request should remain **draft** until every required gate has evidence. If an owner explicitly chooses an interim marketing release using clearly labelled illustrations, document that exception and keep it distinct from a claim that genuine customer photography has been supplied. Do not silently treat missing approvals as completed.

## 6. Release process

1. Review final desktop/mobile screenshot bundle and source diff.
2. Approve legal copy and enter verified operational facts; update approval flags and associated tests in a separate reviewed commit.
3. Confirm real marketing assets or record the decision to retain illustrative art with explicit labels.
4. Verify actual marketing booking/enquiry UX on the intended domain, including the service-to-sign-in handoff, Turnstile hostname and response handling.
5. Re-run the exact-commit full CI suite. Ask for a human final accessibility review.
6. Mark PR ready for review only after required approvals, then merge via standard repository process. Expect Cloudflare Workers Builds to deploy automatically from `main`; verify that build and smoke-test all marketing routes.
