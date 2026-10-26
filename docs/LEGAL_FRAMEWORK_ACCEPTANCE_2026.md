# ProInspect legal acceptance architecture — review implementation
Status: **PRE-APPROVAL / NOT LIVE**. Source reference: operator-supplied 43-page *Universal Terms of Engagement Legal Review 2026*, negotiation draft dated 21 October 2026. Final contract and policy approval is separate from this code review.

## Versioned document inventory
Routes: /privacy, /website-terms, /platform-terms, /terms (master service terms), /booking-policy, /service-scopes, /subscription-terms. All seven currently have approval=false, must carry draft notices and be noindexed. Current /privacy and /terms links remain compatible. No code publishes the source's negotiated rates.

## Contractual hierarchy and boundaries
A publicly readable privacy notice is not itself agreement to be marketed to. Portal use should reference Platform Terms; purchasing services references master Service Terms plus service scope and booking rules. For separate signed subscriptions, the signed Key Facts, Engagement Particulars, property-specific inclusions and approved fee rates control the transaction where legally valid. New terms are not automatically substituted into pre-existing agreements.

The reference contains a material conflict: Key Facts calls the residential routine allowance quarterly; clauses 1.4 and 8.2 state two annually. Resolve before contract acceptance. The proposed AUD 150 + GST monthly residential subscription is *not* currently a live payable subscription: account subscriptions are existing application entitlements. Commercial subscriptions require individual matrix and negotiated fee; Strata is quoted PAYG. Do not enable payments, new limits or cancellation fees by merging these documents.

No generic online checkbox creates PPSA security, land charges, personal guarantees, interest elections or statutory delegation. Those require distinct reviewed and valid execution. Do not incorporate such security fields into ordinary signup.

## Required transactional acceptance model (phase-gated; no forced consent while drafts)
Use additive D1 migration with:
- legal_document_versions(document_key,version,sha256,effective_at,approved_by,approved_at,archived_at, immutable snapshot), unique key/version
- legal_acceptance_events(id,actor_user_id nullable, guest_order_id nullable, client_id nullable, document_key,version,sha256,context, action, accepted_at, request_id, source_channel), immutable, minimal metadata and unique idempotency key
- legal_authority_declarations(id,actor,customer,property,asserted_relationship, declared_at, source and any revoked_at)
- optional marketing_choice recorded independently with explicit opt-in/out and timestamp; never bundle with required contractual agreement.

Draft/no-approval mode: do not require binding acceptance; allow viewing and collection notices. When approved, server verifies the exact currently approved document version and SHA-256 before any relevant contractual action, stores the linked acceptance in the SAME successful database transaction, and rejects mismatched or withdrawn versions. Both frontend and backend must enforce; plain HTML checkbox without server verification is insufficient. Return terms-changed response with the current document link and do not create a Booking, quote acceptance or client account.

## Acceptance events and role-specific triggers
- Public website browsing: Website Terms link only; no mandatory blanket clickwrap.
- Public enquiries: just-in-time privacy collection notice; optional marketing consent separate.
- Guest request: disclose privacy collection notice and transaction documents before sending; store record tied to guest order after successful verified request, not at unverified entry alone. A quote acceptance should record precise agreed price and relevant document versions; appointment confirmation needs actual terms version and access authority.
- Self-managed residential/commercial landlord onboarding: affirm identity and lawful property authority separately from acceptance of approved Platform Terms; changing all-inclusive entitlements requires a separate commercial election.
- Professional agency/strata/commercial: require organisational authority review, signed service schedule and proper identified payer; council member buttons are not statutory resolutions.
- Invited tenants/residents: Platform Terms do not override statutory tenancy rights; no service-charge or landlord-contract acceptance is implied.
- Staff/contractors: staff confidentiality, internal permissions and supplier agreement are distinct from public user terms.
- Document issue, statutory notice, bond and restricted cases: record the actual authorised issuer, service method, evidence and access grants; a portal notification alone does not constitute legal service.

## Privacy, evidence and operational controls
Document snapshot must remain immutable (store content or stable secure object copy); record hash, version, user identity or verified guest token reference, account/property, timestamp, channel and purpose. Idempotency protects against duplicated form submissions. Retain no full access token, Stripe secrets, raw browser fingerprint or unnecessary sensitive evidence in acceptance logs. Data retention periods, incident response, transborder disclosures and privacy complaints process require approval. Provide an admin approval workflow with two-person policy review (business owner and legal reviewer), audit event and staged activation, plus rollback by withdrawing an approved version without deleting historical evidence.

## Launch acceptance tests
1. Seven public legal draft routes render and send noindex; old /privacy and /terms work and no false approved assertions.
2. Every published catalogue service has one matching schedule (currently 23), with no legal price seeded into operational catalogue.
3. Draft documents cannot create enforced acceptance or activate Stripe, booking, subscription or statutory features.
4. Once approved: reject missing/stale/modified document versions server-side for onboarding and booking; correctly accept and store immutable version/hash upon successful transaction; retry is idempotent.
5. Tenant, owner, agency and Staff permissions remain isolated and no tenant accepts landlord commercial duties.
6. Confirm operator, ABN, approved pricing, disputed routine visit allowance, term, cancellation fees, insurance, retention/provider facts and statutory authority with qualified Australian legal review.
7. CI including integration, browser and production/noindex smoke tests passes on exact PR SHA before merging; main deploys automatically and should not be changed before sign-off.

## Source comparison / proposed rates not activated
The source contains a larger residential and commercial catalogue (including many services beyond 23 currently exposed online), PAYG amounts, a draft AUD 150 residential subscription, proposed cancellation bands, optional annual CPI, business credit interest and separate optional property/security elections. None is authoritative for the live 23-service catalogue without operator-approved, scope-matched migration and corresponding customer disclosure. The reference is preserved outside the live site; reproduce only approved final public text.
