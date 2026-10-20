# Public Leasing: marketing launch contract (draft branch Leasing)

## Boundary and claims
- Public property advertisements and inspection-registration forms are marketing capabilities. The optional private rental application is a separately gated intake workflow. ProInspect is an inspection/attendance provider **on behalf of** an explicitly identified landlord, leasing agent or property manager; it is not the landlord, managing agent or leasing agent.
- The landlord/agency retains leasing decisions. Public inspection and interest forms accept contact details only; confidential application documents are accepted solely through the separately protected residential application workflow.
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
- External agency application links must be independently verified HTTPS URLs. Application documents are accepted only through ProInspect's gated, private residential application route, never public inspection registration.

## Customer journeys
1. Property discovery: marketing header → residential/commercial directory → property detail and verified images.
2. Open inspection: choose session → name/email/phone + explicit event consent → Turnstile → receipt and reference → email confirmation where delivery is configured.
3. No session: select register interest → lead receipt and representative review; does not imply a booking.
4. Cancel: unique unpredictable link in the confirmation email → confirmation page → POST cancellation; freed capacity.
5. Apply: use the approved agency HTTPS link, the gated ProInspect residential application, or no Apply action depending on the authorised listing settings. ProInspect never decides whether to offer a tenancy.

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

## Optional ProInspect residential application workflow

### Legal scope and field reference

The WA Consumer Protection Form 18 is listed as **helpful / not mandatory**.
It is a design/reference template, not the document ProInspect must use.
The ProInspect Rental Application is an original digital intake with conditional
fields and separate applicant-specific disclosures. This workflow does not
replace mandatory tenancy agreements, prescribed notices or other legal forms.
Official guidance: https://www.consumerprotection.wa.gov.au/rental-forms-and-notices

The tenancy-database disclosure is a distinct responsibility. If a landlord or
agent typically uses tenancy databases, the legally required written notice
must still be given to applicants. Form 18A is a useful example of that notice:
https://www.consumerprotection.wa.gov.au/tenancy-databases

Staff must confirm authority, responsibility, the collection purpose, and the
correct notice details. No applicant scoring, auto-selection, lease execution or
property-management authority is implied.

### Listing-level application modes

A listing chooses exactly one application route:
- External: use only the agency's independently approved HTTPS application URL.
- ProInspect: residential only; requires an explicit written processing authority,
  designated agency/landlord recipient and tenancy-database notice settings.
- Unavailable: no Apply action.

External URL precedence is enforced in validation and D1. Active drafts and
submissions cannot be silently moved to a different provider. Changing an
authorised recipient while applications are active is blocked.

### Applicant experience

The application uses a six-step mobile-friendly wizard for personal/contact
information, rental history, income/employment, references, documents and
review/declaration. Questions adapt to prior rental and employment circumstances.
The primary applicant can invite up to nine additional applicants. Each has
their own 30-day private access link, encrypted draft, supporting documents and
personal declaration. Co-applicants cannot view other applicants' detailed
answers or files.

Every applicant must complete their declaration. Declarations are bound to the
property's exact tenancy-database notice. A changed notice requires a new
acknowledgement. The primary applicant submits only when the household is
ready. Each submission or revision is stored as an immutable encrypted snapshot.
The applicant receives a reference and confirmation. Submission is not an
offer or approval of tenancy.

Applicant requests for access, correction and erasure are available from the
private application. An approved administrator reviews privacy requests and may
apply an expiring legal/privacy hold before any irreversible purge.

### Documents: scanning and release

Documents: PDF, JPEG, PNG or WebP, up to 8 MB each and 10 per applicant.
The Worker checks file size, file header and duplicates. Files are stored only
in the restricted Cloudflare R2 bucket and start quarantined.

New migration 0009 requires a **trusted clean malware scan result** before a
file can be released. An internal callback contract verifies a timestamped
HMAC-SHA256 signature and event idempotency; it records the scanner's verdict,
document digest and encrypted evidence. An administrator cannot manually invent
a clean result by entering a text reference. Unsafe files are rejected, and
quarantined/unsafe files cannot be downloaded from the ordinary staff UI.
The scanner itself is **NOT provided** by this branch. An approved private scanner
must be procured/integrated, with a data processing agreement and a private
quarantine access mechanism; public scanning services are unsuitable for
confidential application documents without explicit assessment.

### Retention, privacy and erasure

Three retention periods are explicit operational configuration settings:
RENTAL_RETENTION_DRAFT_DAYS, RENTAL_RETENTION_SUBMITTED_DAYS and
RENTAL_RETENTION_WITHDRAWN_DAYS. Missing or out-of-range settings stop the
application workflow from enabling. The Wrangler local values are **examples**,
not claims of a legislated retention period.

An approved administrator can hold records, handle access/correction/deletion
requests and purge closed applications. Purging deletes restricted R2 objects
before D1 metadata, private answers, events, snapshots and tokens. A minimal
non-personal irreversible audit receipt remains. Deletion is blocked when a
legal/privacy hold or pending agency handoff exists. Errors leave records
available for retry, rather than silently orphaning files.

Scheduled expired-record cleanup is separately gated by
RENTAL_RETENTION_AUTOPURGE_ENABLED (false in connected production). It only
purges eligible closed or abandoned drafts; active submissions require review.
Policies for legal holds, backups, erasure, correction requests and incident
response must be approved before the automation is enabled.

### Google Apps Script agency/landlord email handoff

**Intended handoff: Google Apps Script sends the application data in a
professionally formatted email to the verified agency/landlord recipient.**
That script is intentionally left for the later integration stage.

The Leasing branch now stages a recipient-bound, idempotent handoff referencing
the precise immutable household submission. Its state is awaiting_script;
no sensitive payload is sent and no agency delivery is claimed.
The database prohibits a delivered handoff or forwarded application until a
future audited integration and delivery acknowledgement are implemented.
Applicants and operational staff receive only separately authorised lifecycle
notices through the existing notification outbox.

The future script must use authenticated, signed, expiring Worker-to-Script
messages; deduplicate deliveries; escape HTML; send only to the verified
recipient; respect withdrawal and scanned-document status; and return an
authenticated acknowledgement. Personal financial/identity information and
supporting files require a separately approved delivery-security decision
before email sending is enabled. This is not a generic unsecured email dump.
See docs/RENTAL_APPS_SCRIPT_HANDOFF.md for the proposed technical contract.

### Production release prerequisites

Connected production remains **RENTAL_APPLICATIONS_ENABLED=false**, with
scanner credentials unconfigured and automatic retention purging disabled.
No rental data should be collected through this new workflow until:

- The instructing landlord or licensed agency's written authority and service
  boundary have been independently reviewed.
- The privacy notice, data collection/consent, third-party processing, retention
  timeframes, deletion and incident-response procedure are approved.
- The tenancy-database notice is supplied where legally required and checked.
- A private malware scanner is connected to the signed scan callback and
  demonstrated to reject malicious/non-scanned files.
- A secure Google Apps Script email handoff, recipient verification, idempotent
  receipt and privacy controls have been implemented and accepted.
- Migration 0009 is verified in an isolated staging database and a full mobile,
  co-applicant, scan, withdrawal, privacy and delivery-acknowledgement UAT runs.
- The release owner explicitly approves activation; branch merge is not itself
  authorisation to begin taking applications.

This module does not perform a legal licensing assessment and should not be
described as a fully operational leasing agency service.
