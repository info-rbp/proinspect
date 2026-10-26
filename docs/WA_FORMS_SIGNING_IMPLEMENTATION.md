# WA Tenancy Forms and Signing Centre — implementation and release specification

**Build target:** `feature/wa-statutory-forms-signing-20261025` against `main` `a72f0382` (25 October 2026).
**Operational owner:** ProInspect; statutory issuer/signatory remains the legally authorised landlord, agent or tenant.
**Jurisdiction:** residential tenancies in Western Australia. This is an implementation contract, **not** an alternative prescribed form or legal certification.

## Purpose and architecture

Keep the canonical tenancy and property record; use existing `wa_residential_form_cases`, private R2 `documents`, explicit `document_grants`, issued PDFs, user and manager relationship checks and audit/notification infrastructure. This change adds an immutable signatory-intent envelope and a workflow register for each ordinary WA form. No new standalone portal, website, general-signature service or extra identity provider is introduced.

**Important activation limit:** `WA_AGREEMENT_ESIGN_ENABLED` is unset/false by default. An approved official WA Form 1AA and its approved field-to-PDF overlay, a supported genuine signature method, valid recipient consent, provider or physical-signature evidence, lawful service rules and live recipient acceptance must be completed and signed off before this flag is enabled in production. Current UX captures **individual authenticated signing intent and verified document review**, not an embedded PAdES signature or a legally executed form in itself. A separately obtained and verified fully signed official PDF is required before the application will distribute an executed copy. This explicitly preserves manual and external signing paths without inventing legal effect.

## Portal UI screen definitions (Task Q1)

| Context and route | Screen | Visible content | Allowed actions |
|---|---|---|---|
| Landlord `.../tenancies/:tenancyId/wa-forms` | Forms & Documents dashboard | Active forms, awaiting actions, completed documents, commencement/active/breach/ending/bond panels, official source URL | Start eligible residential form draft, review own property tenancy records, download granted documents |
| Tenant (same tenancy-scoped route) | My tenancy forms | Tenant-initiated requests, issued Form 28 and individually assigned Form 1AA cases, response/expiry information | Submit request/response, review exact official PDF, sign own intent, download authorised final copies |
| Landlord/Manager Form 1AA case detail | Agreement preparation | Official document version + SHA, signer list, receipt/evidence status | Choose current verified tenant participants and authorised lessor signer; initiate invitations after Staff approval and flag release |
| Tenant Form 1AA case detail | Signatures awaiting me | Locked official PDF download, exact SHA, named signer status, electronic intent/consent checkbox, own typed legal name | Record **own** signing intent for an immutable official PDF only; cannot sign for other tenants |
| Staff form detail | Official source and review | Original official source/edition, independently approved template, signers, separate completed PDF and review references | Verify prerequisites; attach and independently verify completed signed PDF; queue authorised executed-copy notices; record actual delivery evidence |
| Completed form | Tenancy document history | Executed document download, immutable audit, delivery and evidence record, status | Download only with explicit document grant, view own case history; no edits to executed version |
| Restricted Form 2 | Separate confidential case flow | Never appears in ordinary dashboard, normal search, manager notification or signing queue | Separate individually granted reviewer workflow only; remains disabled until special acceptance |

Status is separated into: `draft` → `submitted` → `under_review` → `approved` → `document_issued` (prepared official PDF) → `collecting` individual intents → `all_consented` → `executed` (Staff-verified distinct signed PDF) → `delivery evidence` → `administratively completed`. `void` is terminal and requires a new reviewed case for a replacement; it never erases historical consent. No step by itself certifies effective legal service, tenancy termination or bond release.

## Form 1AA complete intake categories and multi-signatory workflow (Task Q2)

The field groups below reflect the business information categories to map to the actual, current, **unchanged** WA Form 1AA; the application must not publish a new substitute form based on this list. Items marked optional in the draft worksheet can be conditionally mandatory in the selected official form and therefore block signature start until the reviewed mapping and mandatory validation are complete.

### Part A — Lessor, agent and tenant contacts

| Data field | Input | Required for signing |
|---|---|---|
| Legal name of lessor | `lessorName` (text) | Yes |
| Address for lessor | `lessorAddress` (text) | Yes |
| Lessor email | `lessorEmail` (text) | Yes |
| Lessor telephone | `lessorPhone` (text) | Where applicable / template-specific |
| Managing agent name (if applicable) | `agentName` (text) | Where applicable / template-specific |
| Managing agent address | `agentAddress` (text) | Where applicable / template-specific |
| Managing agent email | `agentEmail` (text) | Where applicable / template-specific |
| Managing agent telephone | `agentPhone` (text) | Where applicable / template-specific |
| All tenants — exact legal names | `tenantNames` (textarea) | Yes |
| Each tenant contact details and nominated address/email | `tenantContactDetails` (textarea) | Yes |
| Lessor consent to electronic notices (yes/no) | `lessorElectronicNoticeConsent` (text) | Yes |
| Individual tenant electronic notice preferences | `tenantElectronicNoticeConsent` (textarea) | Yes |

### Part A — Premises and agreement term

| Data field | Input | Required for signing |
|---|---|---|
| Complete premises address | `premisesAddress` (text) | Yes |
| Inclusions (parking, storage, etc.) | `premisesInclusions` (textarea) | Where applicable / template-specific |
| Areas excluded from letting | `premisesExclusions` (textarea) | Where applicable / template-specific |
| Maximum permitted occupants | `maximumOccupants` (number) | Yes |
| Fixed term or periodic | `agreementType` (text) | Yes |
| Tenancy commencement | `startsAt` (date) | Yes |
| Fixed-term end (if fixed term) | `fixedTermEndsAt` (date) | Where applicable / template-specific |

### Part A — Rent, payments and increases

| Data field | Input | Required for signing |
|---|---|---|
| Rent amount (AUD) | `rentAmount` (number) | Yes |
| Rent calculation period | `rentFrequency` (text) | Yes |
| Frequency rent is payable | `paymentFrequency` (text) | Yes |
| First rent due date | `rentFirstDueAt` (date) | Yes |
| Agreed permitted payment method | `rentPaymentMethod` (text) | Yes |
| Payee and payment instructions (review before sharing) | `rentPaymentDetails` (textarea) | Where applicable / template-specific |
| Fixed-term rent increase provisions if applicable | `rentIncreaseMethod` (textarea) | Where applicable / template-specific |
| If applicable, income-based rent calculation terms | `incomeBasedRent` (textarea) | Where applicable / template-specific |

### Part A — Security and pet bond

| Data field | Input | Required for signing |
|---|---|---|
| Security bond amount (AUD) | `bondAmount` (number) | Yes |
| Permitted pet bond, if applicable (AUD) | `petBondAmount` (number) | Where applicable / template-specific |
| Official lodgement and contributor details | `bondLodgementArrangements` (textarea) | Where applicable / template-specific |

### Part A — Utilities, strata, pets and consents

| Data field | Input | Required for signing |
|---|---|---|
| Water consumption and charging arrangement | `waterUsageArrangement` (textarea) | Where applicable / template-specific |
| Separate metering of utilities where applicable | `separatelyMetered` (text) | Where applicable / template-specific |
| Electricity, gas and other services | `electricityGasOtherCharges` (textarea) | Where applicable / template-specific |
| Whether water provider may contact tenant | `utilityProviderContactConsent` (text) | Where applicable / template-specific |
| Applicable strata by-laws and copy-delivery evidence | `strataBylawsProvided` (textarea) | Where applicable / template-specific |
| Existing authorised pets and conditions | `permittedPets` (textarea) | Where applicable / template-specific |
| Assignment/subletting terms under applicable law | `assignmentAndSubletting` (textarea) | Where applicable / template-specific |
| Fixtures and modification terms under applicable law | `fixturesAlterations` (textarea) | Where applicable / template-specific |

### Part C — Permitted additional terms and signing

| Data field | Input | Required for signing |
|---|---|---|
| Additional terms — legal review mandatory | `specialTerms` (textarea) | Where applicable / template-specific |
| Annexures, inventory, by-laws and other prescribed supporting documents | `attachmentsRegister` (textarea) | Where applicable / template-specific |
| Independent version and statutory-content review reference | `reviewReference` (text) | Yes |

### Form 1AA execution steps and state guarantees

1. **Create tenancy and verify participants:** landlord/manager confirms property ownership/management. Tenant membership must exist in the same residential tenancy; invitations and email verification completed for *every* tenant signer. A future/pending tenancy can prepare commencement forms.
2. **Complete full official-form input:** use the six grouped form sections above; user selects fixed/periodic, rent/payment, bond, electronic notice preferences, utility/strata information and reviewed Part C terms. Client-side display assists only; server checks the captured fields and participant count.
3. **Staff-approved official master:** an authorised Staff uploader registers actual official source PDF bytes and SHA-256 in private R2; a different administrator independently reviews and releases the version. Staff prepares/overlays the actual *unaltered* official PDF, uploads it and issues it to the correct tenancy through existing document grants. Unsupported PDF overlay remains manual until template mapping passes.
4. **Invitation:** manager selects all current verified tenants from their tenancy memberships (no free-text signers) and one current owner/admin signer from the property management relationship. A single immutable source-document ID and SHA-256 are locked in `wa_agreement_envelopes`. Invitations are persisted in encrypted notification outbox and individually delivered through the configured email adapter; no passwords or secrets in email.
5. **Individual review and signing intent:** each party signs in using their own verified identity, downloads the exact official PDF, reviews its complete content, enters their name and explicitly consents to that document SHA. Per-user `consent_envelope` is encrypted; event and source are immutable. Revoked/expired tenancy or management authority, mismatched hash, duplicate signature, stale version, wrong portal and wrong signer are rejected.
6. **Externally/physically executed PDF:** current implementation **does not apply an electronic cryptographic signature to PDF bytes**. A permitted signing provider or accepted physical-signing procedure must supply a **different** actually signed and reviewed official PDF. A separate signing-provider adapter is needed for in-app digital PDF signing; never represent the intent checkbox as that provider's completed e-signature. Manual reviewer records verified method and external evidence reference.
7. **Independent finalisation:** an authorised Staff reviewer checks every required signer, the approved template and locked source, the actual completed PDF, document category, signer evidence, correct property and tenancy, and explicit tenancy grant. Only then can it be marked executed and an **access-controlled** copy notification queued atomically for each person. The app does not email a raw signed PDF to uncontrolled addresses.
8. **Service and record keeping:** recipient copies are delivered through permissions, while a separate delivery ledger records actual method/outcome and proof. Email accepted by a provider does not automatically prove inbox delivery or legally effective service; manual alternatives must be available. Ordinary administrative closure is permitted only after the appropriate documented delivery and signature checks.

### Application endpoints

- `GET /api/w/:kind/:scopeId/wa-forms/:id/agreement` — viewer-scoped signing status and assigned identity; no plaintext signatures.
- `POST .../agreement/start` — current verified parties and officially reviewed document required; guarded by `WA_AGREEMENT_ESIGN_ENABLED`.
- `POST .../agreement/consent` — authenticated user's exact SHA-256 version and express intent; never proxy-sign for another user.
- `POST .../agreement/finalise` — Staff review of distinct executed official PDF, evidence, complete signatories and correct grant; queue copies.
- `POST .../agreement/void` — authorised manager/Staff void pending (not executed) envelope. A new case is required to re-prepare another version.

### Data structures

`database/migrations/0027_wa_agreement_signing.sql` adds `wa_agreement_envelopes`, `wa_agreement_signers` and append-only `wa_agreement_events` with residential tenancy, same-property and same-manager/tenant membership triggers, frozen source SHA and executed-PDF requirements. Existing historical migrations and government-facing records are not rewritten.

## All-form implementation register (Task Q3)

The following includes every **ordinary** registered form. The table does not claim that any master edition is approved: every `issuerEnabled` is false until the actual official source edition, mandatory fields, applicable legal grounds, signature method and service evidence undergo independent review. The response timing shown is advisory, not an automatic approval/refusal/termination engine.

| Form | Who initiates | Signature / response path | Required information from existing form worksheet | Time / conditions to verify | Delivery / outcome |
|---|---|---|---|---|---|
| **Form 1AA — Residential tenancy agreement** (`WA_FORM_1AA`) | manager | named lessor + all named tenants; executed PDF | Tenancy commencement, Rent amount (AUD), Rent calculation period, Security bond amount (AUD) | Signed agreement copy distribution timing as prescribed; verify actual signatures and delivery | executed copy |
| **Form 1AC — Information for tenant** (`WA_FORM_1AC`) | manager | issuer approval / lawful issue | Proposed issue date | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | reviewed notice |
| **Form 1AD — Information for non-written agreement** (`WA_FORM_1AD`) | manager | issuer approval / lawful issue | Proposed issue date | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | reviewed notice |
| **Form 1 — Property condition report** (`WA_FORM_1`) | manager | issuer approval / lawful issue | Inspection date, Related inspection or booking reference | Prescribed PCR delivery and tenant response periods — verify report/issue and receipt events | reviewed notice |
| **Form 18 — Application to rent residential premises** (`WA_FORM_18`) | manager | external authorised actor or government outcome | Application reference | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | reviewed notice |
| **Form 18A — Tenancy database notice** (`WA_FORM_18A`) | manager | issuer approval / lawful issue | Database or application reference | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | reviewed notice |
| **Security bond lodgement** (`WA_BOND_LODGEMENT`) | manager | manual pen/stylus or official government process | Bond amount, Date bond received, Bond contributors | Lodgement deadline after actual receipt of bond money — confirm current law | external authority |
| **Form 19 — Notice of proposed entry** (`WA_FORM_19`) | manager | issuer approval / lawful issue | Reason for entry, Proposed entry date | Purpose-dependent entry notice and lawful service window; verify against current WA law | reviewed notice |
| **Form 10 — Rent increase notice** (`WA_FORM_10`) | manager | issuer approval / lawful issue | New rent amount, Proposed effective date, Payment frequency | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | reviewed notice |
| **Form 11 — Income-linked rent increase** (`WA_FORM_11`) | manager | issuer approval / lawful issue | New rent amount, Proposed effective date | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | reviewed notice |
| **Form 24 — Furniture affixing request** (`WA_FORM_24`) | tenant | tenant signs/submits request; lessor written decision | What furniture needs securing?, Proposed position | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | request and written response |
| **Form 25 — Pet request** (`WA_FORM_25`) | tenant | tenant signs/submits request; lessor written decision | Type and description of pet, Proposed arrangements | 14 days from verified receipt; exceptions and Commissioner process apply | request and written response |
| **Form 26 — Minor modification request** (`WA_FORM_26`) | tenant | tenant signs/submits request; lessor written decision | Description of modification, Affected area | 14 days from verified receipt; exceptions and Commissioner process apply | request and written response |
| **Form 27 — Major modification request** (`WA_FORM_27`) | tenant | tenant signs/submits request; lessor written decision | Description of major modification, Affected area | 28 days from verified receipt, subject to prescribed conditions | request and written response |
| **Form 28 — Landlord request to modify** (`WA_FORM_28`) | manager | landlord proposes; tenant written answer | Description of work, Proposed works date | 28 days from verified receipt, subject to prescribed conditions | request and written response |
| **Form 20 — Non-rent breach notice to tenant** (`WA_FORM_20`) | manager | issuer approval / lawful issue | Alleged breach and evidence, Incident date, Proposed remedy | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | reviewed notice |
| **Form 21 — Rent non-payment breach notice** (`WA_FORM_21`) | manager | issuer approval / lawful issue | Verified arrears, Arrears calculated as at, Rent ledger reference | Grounds, payment remedy and service window verified with the current rent ledger | reviewed notice |
| **Form 23 — Tenant notice of lessor breach** (`WA_FORM_23`) | tenant | issuer approval / lawful issue | Alleged breach, Relevant date, Requested remedy | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | reviewed notice |
| **Form 22 — Tenant notice of termination** (`WA_FORM_22`) | tenant | issuer approval / lawful issue | Proposed end date, Grounds or reason | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | reviewed notice |
| **Form 1A — Non-payment termination following Form 21** (`WA_FORM_1A`) | manager | issuer approval / lawful issue | Prior Form 21 notice reference, Proposed termination date | Only where the valid qualifying Form 21 was served and all applicable preconditions met | reviewed notice |
| **Form 1B — Non-payment termination without prior breach notice** (`WA_FORM_1B`) | manager | issuer approval / lawful issue | Verified arrears, Rent ledger reference, Proposed termination date | Separate arrears termination pathway; approved grounds and notice period | reviewed notice |
| **Form 1C — Termination on other prescribed grounds** (`WA_FORM_1C`) | manager | issuer approval / lawful issue | Applicable statutory ground, Evidence for ground, Proposed termination date | Ground-specific expiry and service rules | reviewed notice |
| **Form 12 — Notice of suspected abandonment** (`WA_FORM_12`) | manager | issuer approval / lawful issue | Evidence supporting suspected abandonment, Relevant observation date | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | reviewed notice |
| **Form 13 — Termination following abandonment** (`WA_FORM_13`) | manager | issuer approval / lawful issue | Prior Form 12 reference, Termination date | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | reviewed notice |
| **Form 14 — Mortgagee notice to vacate** (`WA_FORM_14`) | specialist | external authorised actor or government outcome | Mortgagee document reference | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | external authority |
| **Form 17 — Superior title recovery notice** (`WA_FORM_17`) | specialist | external authorised actor or government outcome | Official notice or authority reference | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | external authority |
| **Form CP2 — Disposal of goods to former tenant** (`WA_FORM_CP2`) | manager | issuer approval / lawful issue | Goods left behind, Date goods identified | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | reviewed notice |
| **Form 3 — Notice as to disposal of goods** (`WA_FORM_3`) | manager | issuer approval / lawful issue | Goods left behind, Date goods identified | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | reviewed notice |
| **Variation of security bond** (`WA_BOND_VARIATION`) | manager | manual pen/stylus or official government process | Bonds Administration reference, Change requested | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | external authority |
| **Security Bond Release Application (2026)** (`WA_BOND_RELEASE`) | both | manual pen/stylus or official government process | Bonds Administration reference, Amount proposed for landlord/agent, Proposed allocations and reasons | Use post-March-2026 official bond release process; government deadlines external | external authority |
| **Bond dispute / Commissioner determination** (`WA_BOND_DISPUTE`) | both | external authorised actor or government outcome | Bond release application reference, Dispute and evidence | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | external authority |
| **Legacy bond disposal coordination** (`WA_BOND_DISPOSAL`) | both | external authorised actor or government outcome | Historical bond disposal reference | No automatic deadline: qualified reviewer sets actual grounds, period and receipt rules | external authority |

### Separately restricted / legacy records

- **Form 2** family-violence termination, its prescribed evidence and any affected co-tenant notices are restricted to the pre-existing confidential-case channel. No ordinary landlord visibility or Form2 answers are ever included in standard signing invitations, public routes, staff WA form queue or general email. No automatic release is approved.
- **Former bond disposal** (`WA_BOND_DISPOSAL`) is retained for history, not new applications. Current post-28-March-2026 Security Bond Release Application is an external government process.
- **Commercial premises** are excluded by both APIs and D1 sector constraints; ordinary tenancy forms are not commercial lease documentation.

### Required official master metadata / sign-off per form

| Metadata field | Meaning |
|---|---|
| `form_code` and `edition` | Exact prescribed document identity and source edition, no guessed revision |
| `official_source_url`, bytes and SHA-256 | Retrieved official Consumer Protection master stored privately and immutable |
| `field_map_version` | Reviewed mapping of each permitted field onto unmodified official PDF pages; conditional validation |
| `issued_by_role` and `legal_grounds_version` | Current named authorised issuer, legal prerequisites and legal rule reference |
| `sign_method` | `issuer_review`, verified electronic/PDF provider, permitted wet-ink/stylus, government approval, as legally applicable |
| `send_method`, `service_rule_version` | Actual electronic consent/recipient address or permitted physical method; evidence of lawful service |
| `reviewed_by`, `independent_approved_by`, `released_at` | Two-person source and release controls plus separate qualified legal acceptance |
| `retirement_date` | New cases cannot use superseded editions; historic issued originals remain readable |

## Security, compliance and acceptance

- All actions require current verified authentication and workspace-specific property/tenancy authority; never trust a browser-supplied email, landlord/tenant label or document ID as authority.
- Separate **signature intent**, **completed signed official PDF**, **document issue**, **provider delivery**, **legal service** and **recipient acknowledgement**. None implies another.
- Store encrypted consent and strict event history in D1, actual PDFs privately in R2, no PII in general email/URL query strings or analytics.
- Enforce unique signatory identity and tenancy scope; deny two accounts, unrelated properties, commercial sectors, revoked memberships, duplicate or stale signing attempts, changed PDF digest and outside signing role.
- Form 25/26 and other statutory response clocks use actual verified receipt plus legal exceptions. Never auto-approve solely from an advisory timer.
- Bonds require existing external official route and the applicable pen/stylus or BondsOnline authenticated consent; no generic e-sign service for paper bond forms.
- Testing must include 1 lessor + 2 tenants, pending commencement, unsigned/replaced source, refusal to proxy-sign, competing signing attempts, void, expired tenancy membership, verified performed distribution, intentional email-provider failure, and a document download by an unrelated identity.
- Source migration tests and prior GitHub regression suites must pass against the branch exact SHA; do not merge to `main` until legal source approvals, full independent PDF appearance verification, real signing-provider or physical execution evidence, external delivery and live identity acceptance are recorded.

## Governing sources / verification status

Authoritative WA forms and notices: https://www.consumerprotection.wa.gov.au/rental-forms-and-notices
WA rental agreements: https://www.consumerprotection.wa.gov.au/rental-agreements
WA bond forms: https://www.consumerprotection.wa.gov.au/bonds-manual-forms
Electronic Transactions Act 2011 (WA): https://www.legislation.wa.gov.au/

**Release status:** Source code, screen mechanics, ledger and regression tests implemented on **draft integration branch** only. Official PDF coordinate maps, legally approved editions, a genuine completed-PDF signing provider and provider-recipient legal-service acceptance remain independent release blockers. No statement of lawful statutory issue, completed government transaction or real inbox delivery is implied by an isolated CI pass.