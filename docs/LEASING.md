# Public Leasing: marketing launch contract (draft branch Leasing)

## Boundary and claims
- Public property advertisements are a marketing capability only. ProInspect is an inspection/attendance provider **on behalf of** an explicitly identified landlord, leasing agent or property manager; it is not the landlord, managing agent or leasing agent.
- The commercial/property manager retains leasing decisions and application responsibility. Public forms accept contact details only and explicitly reject identity documents, bank statements, access codes or other sensitive material.
- Distinct indexable pathways: `/properties-for-lease/residential`, `/properties-for-lease/commercial`, and their property detail pages.
- Empty-state directories stay useful; no synthetic properties are seeded or presented as live opportunities.
- Marketing header, mobile menu, homepage CTA and footer link to public leasing, without changing authenticated portal navigation.

## Data provenance and permissions
- `leasing_listings.property_id` references the canonical property; `instructed_by_client_id` references the commissioning client; optional `owner_client_id` references the actual owner. Do **not** conflate the commissioning landlord, listing agent and ProInspect.
- A staff operator may create an advert only for a client currently linked to the property through a property/client link or a current management relationship. Optional owner references must also be currently linked to the same property.
- Listing `kind` must match `properties.sector`, limiting Residential/Commercial leakage.
- `agent_name`, `agent_role`, displayable address, price, availability, photo rights, listing copy, application provider URL and inspection session must be approved by the instructing party before publication.
- Draft and withdrawn listings, all lead contact details, cancellations and applicant information must not appear in public responses, search indexes or URL query strings. Photos are stored under non-guessable private R2 keys and served only while the listing is published.
- Staff leasing API: `GET /api/staff/leasing`, `POST /api/staff/leasing`, `GET /api/staff/leasing/:id`, `POST /api/staff/leasing/:id/status`, `POST /api/staff/leasing/:id/photos`, `POST /api/staff/leasing/:id/sessions`, `POST /api/staff/leasing/:id/session-status/:sessionId`, `GET /api/staff/leasing/:id/registrations`. All require authenticated active operations staff, not landlord/tenant roles.
- Contact information is AES-GCM encrypted at rest; email equality is stored as a one-way keyed hash, never the email address. Submit idempotency is based on a UUID and fingerprint.
- Inspection capacity is claimed atomically with the registration write; a cancelled session or full capacity must reject the operation.
- Public Turnstile uses action `leasing` and the active hostname. This is a distinct action from the existing contact form.
- Rental application links must be independently verified HTTPS URLs nominated by the responsible representative. The public site does not accept application documents.

## Customer journeys
1. Property discovery: marketing header → residential/commercial directory → property detail and verified images.
2. Open inspection: choose session → name/email/phone + explicit event consent → Turnstile → receipt and reference → email confirmation where delivery is configured.
3. No session: select register interest → lead receipt and representative review; does not imply a booking.
4. Cancel: unique unpredictable link in the confirmation email → confirmation page → POST cancellation; freed capacity.
5. Apply: labelled external handoff to the representative's application provider; no application decisions on ProInspect.

## Google Apps Script integration preparation, NOT activated
- `leasing_email_events` is an append-only durable, encrypted business-event table. Each event references a lead ID and type:
  `registration.received`, `interest.received`, `registration.cancelled`, `session.updated`, `session.cancelled`, `session.reminder`.
- Event encryption uses context `leasing-event:<event-id>`; avoid including raw contact information in unauthenticated APIs. The future adapter will resolve authorised contact details inside the Worker, issue minimal signed HTTPS payloads to a reviewed Apps Script Web App endpoint, track attempts and acknowledgements in a future delivery table, and be gated by an explicit feature flag.
- No Apps Script Web App URL, shared secret, token or script has been added in this branch. `status=pending_integration` means **not sent**, not a functioning Apps Script connection.
- The existing ProInspect notification outbox and email provider can send confirmation notifications independently when configured. Later Google Apps Script transport must not duplicate those messages; pick one delivery authority per event.

## Launch acceptance checklist
- [ ] Approve marketing claims, representative attribution, media rights and privacy text
- [ ] Apply 0007 D1 migration to isolated staging first, validate reversibility/recovery
- [ ] Configure encryption and Turnstile for the actual production hostname
- [ ] Verify outbound email sender, suppression and safe cancellation links
- [ ] Publish only explicitly approved test listing(s) with real rights-cleared photos
- [ ] Test mobile cards/gallery/form keyboard and screen-reader use
- [ ] Test residential/commercial routing and unauthenticated draft/photo isolation
- [ ] Test capacity contention, retry idempotency, cancellations and session update delivery
- [ ] Verify staff curation and owner/client linkage
- [ ] Run source/test/build/Worker integration/browser suites, including migrations
- [ ] Reconcile branch against newest main without overwriting existing Google Calendar integration
- [ ] Merge only after accepted checks; production Worker deployment remains managed by main
