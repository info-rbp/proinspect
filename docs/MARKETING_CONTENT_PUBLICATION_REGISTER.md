# Marketing content and publication register

## Scope and current approval
This release establishes homepage messaging, 23 service-page editorial outlines, and version-controlled approval records in `packages/marketing/publication-register.ts`. **No business, legal, photographic or accessibility approval is asserted by code.** Every record starts pending.

## Review steps
1. Assign an accountable business reviewer to each content and service record. Compare displayed copy with the service actually sold, geographic coverage, portal access, scope and accepted terms.
2. Verify service inclusions, exclusions and deliverables in `packages/marketing/service-scopes.ts`. This is marketing guidance, not a price, certification, customer contract, statutory form or service entitlement.
3. For photographs, independently verify rights, public-commercial use, consent for people/property, alt text, source and revocability. Keep evidence confidential and refer only to safe document identifiers. The approved image registry at `apps/marketing/app/lib/media-approval.ts` stays empty until legitimate assets are supplied.
4. For report examples, use fictional-property output from the native report engine or suitably authorised and comprehensively redacted genuine documents. Remove hidden metadata. Never point a public page at a private R2 report.
5. Verify legal documents with the responsible operator and legal reviewers. Only after approval should `PUBLIC_LEGAL_APPROVAL` in `packages/marketing/legal-drafts.ts` be updated and tested.
6. Run WCAG 2.2 AA manual keyboard, 200/400% zoom, screen reader (VoiceOver/NVDA), mobile/tablet, contrast, touch and form-error review, record defects and retest.
7. Review SEO titles/descriptions, sitemap, canonical URLs, illustrations, links, guest-booking feature state and enquiry functionality against the release.
8. For any approved register item, enter `status: 'approved'`, reviewer, ISO approval date and auditable evidence reference. The software validates structure only; it does not verify the truth of an approval. Record revocation as `withdrawn` and remove relevant public media immediately.

## Current limitations and business inputs
- No one-off rate card is approved. Do not invent prices or promise instant bookings.
- Guest intake may be disabled. Do not imply that merely clicking a booking button completes a reservation.
- Subscription inclusion applies only to eligible signed-in customer accounts; no public one-off customer receives a subscription by entering an enquiry.
- Publication of Privacy/Terms pages as final policies remains blocked.
- Original photographs and real issued customer reports are not approved by this code.
- WCAG manual review and formal release sign-off remain outstanding.

## Files
- `apps/marketing/app/routes/home.tsx`: homepage messages, audience and CTA paths.
- `apps/marketing/app/routes/service.tsx`: common 23-service template.
- `packages/marketing/service-scopes.ts`: descriptive service specifics.
- `packages/marketing/publication-register.ts`: approval register.
- `tests/marketing-publication-register.test.ts`: coverage and approval guard tests.

### Suggested commands
`pnpm check`; `pnpm test:integration`; `pnpm test:browser`. Review exact commit CI and manual approval before any merge to a production-connected branch.
