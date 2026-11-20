# Commercial application readiness (workstream C)

Implements the commercial application requirements in the operator's 15 November 2026 guide. This is separate from public content (PR A), existing residential intake (PR B), general commercial operations, billing, bond management and customer sign-in/up. It does not execute a lease, guarantee or statutory appointment.

## Applicant journey

Nine existing-style application steps cover property and private offer, legal entities, business operations, financial capacity, references, fit-out, security/guarantors, each person's private declarations, and review/submission.

The versioned discriminator supports individuals, sole traders, companies, partnerships, trusts with legal trustees, corporate trustees, associations/not-for-profits, other/overseas entities and joint applicants. Related entities form a validated graph; cycles, unknown people, duplicate profiles/roles and cross-application links are rejected. The same person can be a director, signatory and guarantor without repeating identity collection. Company and trustee fields are conditional; private authority evidence remains subject to staff/registry/legal verification, never an automatic assertion of legal capacity.

Each adult receives a single-use 30-minute email link that exchanges into an eight-hour HttpOnly session. Tokens are hashed, recovery is throttled and generic, old links/sessions are revoked, and corrected email addresses require new private access and declarations. Each person sees their own profile and documents. Leads see invitation labels/completion and shared business information, not another person's confidential answers. A participant may withdraw their own further-assessment consent, immediately blocking assessment and retrieval; household withdrawal, access/correction/erasure requests and staff holds are separate actions.

Financial intake defaults to two accountant-prepared years and four BAS quarters, with explicit periods on evidence. New or missing history requires a reason and alternate evidence, creating a manual-review requirement rather than automatic rejection. Two trade references, optional previous landlord with explanation, and optional accountant are supported. Accountant permission has its own purpose, expiry and append-only consent log. No credit check is inferred.

Proposed alterations conditionally require plans. Security and guarantees are listing-specific; proposed guarantors independently consent to assessment. Identity images are not required by default. Additional personal evidence must be expressly configured in the approved listing scope. Any guarantee requires separate legal review and execution.

## Private offers

Only an application-specific, expressly authorised offer can be attached. It has explicit rent amount/period/tax treatment, term/options, commencement/payment timing, rent reviews, structured incentives, outgoings basis/responsibility, security and leasing-cost responsibility. It expires and identifies permitted participants. A change invalidates declarations and is included in the sealed snapshot. The private Medina example is not seeded, published, calculated or used as another property's default.

## Evidence, review and transport

Sensitive answers and metadata use existing context-bound encryption. Documents use the existing restricted R2 binding under commercial-applications/, with owner/application/entity isolation, size/type/magic/hash checks, duplicate detection and quarantine. An allowlisted authenticated scanner receives bytes without public object URLs. HTTP success alone does not clear quarantine: a fresh signed verdict bound to document/application/hash is required, unsafe verdicts are final, and an authorised reviewer must separately release a clean file. Pending, unsafe or unreviewed files block submission and referral.

Commercial staff permissions and review queue are separate from residential access. Staff can review clean evidence, request information, attach authorised offers, record privacy requests/holds and prepare recipient-bound referral. Submitted revisions and offers are immutable. Reposting a submitted application returns its existing receipt. No automatic scoring, applicant selection, lease, tenant account, bond or charge is created.

Handoff uses an explicit approved HTTPS provider, HMAC requests, stable idempotency keys, short-lived recipient-bound retrieval grants and signed acceptance receipts. Financial/identity files are not emailed as attachments. Provider acceptance is distinct from inbox delivery. An uncertain response is reserved for reconciliation and never automatically resent. Signed reconciliation can record acceptance or a bounce; a bounce blocks processing. Holds, withdrawal, changed authority and expiry revoke further retrieval. Written lessor decisions are recorded only after verified referral.

## Listing, privacy and release controls

The existing leasing_listings.application_mode constraint is preserved. A separate versioned flow supplies proinspect_commercial mode. Safe approved external URLs take precedence. Native forms require a published commercial listing, verified recipient, independent authority review, the exact approved privacy version, matching configured retention, approved provider configuration, three separate disabled-by-default flags and source-specific release acceptance. Changed property/instructing party/representative/external URL revokes the flow. Both GET and POST fail closed; no native button is hard-coded.

Purpose-specific collection/provider disclosures, recipient, policy version, rights contact and approved retention windows are shown before intake and bound to declarations/snapshots. No retention periods or real provider evidence are invented by the application. Policy expiry, legal holds, outstanding delivery reconciliation and operator verification of downstream/backups govern erasure. Deliberate administrator erasure first reserves a closed revision, verifies deletion of restricted objects, redacts application records and retains a minimal audit. General notification/backups/provider retention remains subject to the separately approved policy and documented verification; this code does not claim to erase unverified third-party copies.

## Migration and recovery

0055_commercial_applications.sql is additive. It does not rebuild rental tables, change historical IDs, apply a price, create a subscription or activate anything. The isolated local Wrangler D1 rehearsal upgrades a populated 0054 baseline, verifies every pre-existing schema object's SQL and existing records, and restores an independent SQLite backup to verify recovery. The application runtime additionally exercises the actual Worker, D1, private R2 and signed synthetic providers. No hosted database is created and no production migration is run.

For a later approved release: capture a production D1 Time Travel bookmark and an approved export if required by operations; rehearse the exact migration in the existing staging database with synthetic data; confirm all bindings remain distinct from production. Apply only 0055 to the existing target after review. Keep flags OFF during schema deployment. A Worker rollback leaves additive tables in place; do not drop data or replay unrelated migrations. The backup restoration exercised here is isolated evidence, not a claim of a performed production restore.

## Acceptance and remaining external prerequisites

- Local type/domain/schema/build checks, isolated D1/recovery rehearsal, synthetic Worker/D1/R2 journey, and browser branches/responsiveness are engineering evidence. CI repeats these against the exact PR head. The existing shared staging Worker is the only hosted preview target; its operational flags remain OFF and hosted checks verify closed boundaries.
- Real signed listing authority, mailbox verification, approved privacy/provider/retention disclosures, scanner and handoff processing agreements, positive signed provider receipts, operational incident/reconciliation ownership, and independent exact-source hosted acceptance are required before activation. They are not replaced by synthetic fixtures or the PR author's approval.
- Registry/legal capacity, offer tax/outgoings/cost responsibility, financial alternatives, guarantor requirements and unsupported structures require the appropriate authorised review. No production intake or provider release is accepted by this PR.

No production Worker, D1 data, R2 objects, existing listing, customer identity flow or paid plan is changed during this implementation task. Leave this PR unmerged for operator review.
