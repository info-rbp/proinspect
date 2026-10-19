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

## Form 18-based residential tenancy applications (extension)

The optional ProInspect application feature is an administrative intake and
handoff service, not a leasing decision engine, a tenancy agreement or an
applicant scoring tool. It is disabled in production pending acceptance.

### Listing configuration and agency-link precedence

Authorised staff choose among:
- External agency portal: the specific approved HTTPS URL is shown on the
  public property page. No ProInspect form is offered.
- ProInspect Form 18: residential only, requires written application-processing
  authority, a named verified recipient, and completed Form 18 Attachment A
  notice configuration.
- Applications unavailable: no Apply action; property inspection registrations
  and general expressions of interest remain separate.

Where an agency-supplied application URL exists, the ProInspect-hosted form
cannot also be enabled. Switching away from ProInspect is prohibited while
active drafts or lodged applications exist, preventing silent abandonment.

### Applicant journey

1. Applicant opens a published residential listing and chooses Apply.
2. The primary applicant enters name/email and gets a unique private email
   link protected by Turnstile and rate limits.
3. A mobile-first Form 18 wizard covers identity/contact details, rental
   history, employment and income, personal references/next of kin/emergency
   contact, supporting documents, and final review/declaration.
4. Sections save as encrypted drafts. Passwordless applicant-specific links
   expire after 30 days; a fresh primary link can be requested.
5. The primary applicant may invite up to nine additional adult applicants.
   Each receives a private email link; co-applicants cannot view each other's
   answers or files. The primary sees only name, masked email and completion
   status. An invitation may be resent, and pre-submission invitees removed.
6. Each applicant declares their own information and acknowledges the
   property-specific tenancy database notice. The primary can submit only
   after every active household member completes the declaration.
7. Submission creates an immutable encrypted Form 18-format household
   snapshot with recorded disclosures and a restricted document manifest.
   Subsequent information requests require a further recorded submission.
8. The authorised operations reviewer may verify completeness and notify
   the named leasing representative via reference-only email. Secure
   transfer of complete records is a separate approved manual process.
   The landlord/agency alone makes a tenancy decision.

### Supporting documents and security

- Supported uploads: PDF, JPEG, PNG, WebP; maximum 8 MB per file and ten files
  per applicant; type and file signature checks, SHA-256 duplicate detection.
- Stored in private RESTRICTED_DOCUMENTS R2, not public marketing storage.
  Applicant answers are encrypted at rest; access links are hashed in D1.
- New files are quarantined. An administrator may only mark them released
  after recording an independently verified malware/security scan reference.
  There is NO built-in malware scanner or automatic approval.
- Authorised downloads are audit logged, forced as attachments and served
  with no-store headers. Public property and inspection routes do not expose
  rental applications or supporting documents.
- Removed pre-submission applicants have their access revoked and uploaded
  documents deleted. Failures in private R2 cleanup require operational review.
- Current retention/deletion rules, access requests and incident-response
  procedures need written approval before handling actual applicants.

### Application states and output

Draft -> Submitted -> Information requested (optional) -> Resubmitted ->
Ready for secure handoff -> Forwarded -> Decision recorded.
Primary applicants can withdraw permitted active applications.
This module does not approve applicants, negotiate tenancy terms or sign a lease.

An authorised staff reviewer can print/save a Form 18-format PDF summary
from the latest immutable encrypted submission snapshot, including applicant
sections and Attachment A notice. The generated document is clearly labelled
as a digital equivalent, not the government-issued Form 18 template.

### Google Apps Script boundary

The existing ProInspect encrypted notification outbox supports application
invitations and receipt/handoff notifications. The future Google Apps Script
adapter remains UNBUILT and INACTIVE. Sensitive applicant answers, identity
documents and financial details are NOT sent as ordinary email attachments.

### Launch gate

The connected environment uses RENTAL_APPLICATIONS_ENABLED=false. Local
development enables the feature for testing. Production activation requires
signed instructions from the authorised leasing representative, appropriate
WA licensing review, reviewed current Form 18 and Attachment A wording,
a privacy/retention schedule and deletion controls, an approved malware scan
process, isolated staging tests (including multiple applicants, document
quarantine, invite renewal, review, submission and secure handoff), and
explicit release approval. Merging code alone does not authorise collecting
actual renter information.
