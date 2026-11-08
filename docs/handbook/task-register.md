# Authoritative final sprint register — Stage 0 routing

**As of 8 November 2026.** This is a *rendered index* of [the canonical JSON task contracts](../../config/handbook-tasks.json), not a second approval record. [Package traceability](../../config/handbook-traceability.json) is the canonical F01–F20 source. The human-readable routing is also retained in each JSON task's `stage0Routing` field.

**Source snapshot:** `3e99a560b59a4199957a3b28dcf41e927fa743bf`; production Worker `proinspect-platform`; production D1 verified `0001–0048` (48 applied) while GitHub source has `0001–0052` (52 source). Source merge does not apply production D1 migrations or confer approval.

**Counts:** 110 task IDs (77 P0 / 30 P1 / 3 P2); 97 not started, 9 in progress, 4 engineering verified, **0 independently accepted**, 0 approved deferrals. 20 packages, all not accepted. Engineering state is *task-level overall*, not an assertion that every pre-existing function is absent.

**Stage map:** 0 Foundation/governance; 1 account/subscription policy; 2 portal experience (new Stage 0/2 UX scope in [product plan](../FINAL_PRODUCT_COMPLETION_PRODUCTION_SPRINT_2026-11-08.md)); 3 marketing/service catalogue; 4 reporting/legal/specialist engineering; 5 live providers, finance and role acceptance; 6 launch/recovery.

| ID | Stage | Primary surface | Priority | Remaining requirement | Source state | Responsible role (not named owner) | Tracking |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| **G01** | 0 | Governance / All portals | P0 | Verify production baseline | In progress | Engineering lead / Cloudflare administrator | [#58](https://github.com/info-rbp/proinspect/issues/58) |
| **G02** | 0 | Governance / All portals | P0 | Reconcile F01-F20 | In progress | Product owner / Engineering lead | [#59](https://github.com/info-rbp/proinspect/issues/59) |
| **G03** | 0 | Governance / All portals | P0 | Audit historical feature commitments | In progress | Product owner / Engineering lead | [#60](https://github.com/info-rbp/proinspect/issues/60) |
| **G04** | 0 | Governance / All portals | P0 | Approve scope and exclusions | Not started | Product owner / Business sponsor | [#61](https://github.com/info-rbp/proinspect/issues/61) |
| **G05** | 0 | Governance / All portals | P0 | Map feature flags and environments | In progress | Engineering lead / Cloudflare operations | [#62](https://github.com/info-rbp/proinspect/issues/62) |
| **G06** | 0 | Governance / All portals | P0 | Establish task-level tracking | In progress | Delivery lead / Engineering lead | [#63](https://github.com/info-rbp/proinspect/issues/63) |
| **G07** | 0 | Governance / All portals | P0 | Approve acceptance governance | Not started | Business sponsor / Product owner | [#64](https://github.com/info-rbp/proinspect/issues/64) |
| **C01** | 3 | Marketing / Commercial catalogue | P0 | Finalise the service catalogue | Not started | Product / Service operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **C02** | 3 | Marketing / Commercial catalogue | P0 | Map services to commercial products | Not started | Engineering / Finance | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **C03** | 3 | Marketing / Commercial catalogue | P0 | Approve service prices | Not started | Finance / Product owner | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **C04** | 3 | Marketing / Commercial catalogue | P0 | Approve scheduling and geographic rules | Not started | Operations / Scheduling lead | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **C05** | 1 | Marketing / Commercial catalogue | P0 | Resolve subscription-policy conflicts | Not started | Business / Legal / Finance | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **C06** | 1 | Marketing / Commercial catalogue | P0 | Resolve inspection frequencies and transitions | Not started | Business / Operations / Engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **C07** | 3 | Marketing / Commercial catalogue | P0 | Approve PCR launch offer | Not started | Product / Finance / Legal | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **C08** | 4 | Marketing / Commercial catalogue | P0 | Revalidate booking journeys | Not started | Engineering / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **C09** | 3 | Marketing / Commercial catalogue | P0 | Reconcile customer-facing information | Not started | Product / Engineering / Legal | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **B01** | 5 | Billing / Finance | P0 | Configure Stripe sandbox | Not started | Stripe administrator / Engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **B02** | 5 | Billing / Finance | P0 | Complete Stripe Tax setup | Not started | Finance / Stripe administrator | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **B03** | 5 | Billing / Finance | P0 | Confirm payer and billing-account authority | Not started | Engineering / Finance | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **B04** | 5 | Billing / Finance | P0 | Test genuine guest and account Checkout | Not started | QA / Integration engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **B05** | 5 | Billing / Finance | P0 | Test asynchronous and failed payments | Not started | QA / Engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **B06** | 1 | Landlord / Subscription | P0 | Test paid subscription lifecycle | Not started | QA / Finance | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **B07** | 5 | Billing / Finance | P0 | Verify restricted Billing Portal | Not started | Engineering / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **B08** | 5 | Billing / Finance | P0 | Test refunds and disputes | Not started | QA / Finance | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **B09** | 4 | Agency / Strata finance | P1 | Complete agency and strata invoicing | In progress | Finance engineering / Operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **B10** | 4 | Agency / Strata finance | P1 | Complete credits and financial corrections | Not started | Finance engineering / Finance | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **B11** | 4 | Finance / Staff | P1 | Complete settlement and bank reconciliation | Not started | Finance engineering / Finance | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **B12** | 4 | Billing / Finance | P1 | Verify Stripe Connect recipient onboarding | Not started | Finance / Stripe administrator | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **B13** | 4 | Billing / Finance | P1 | Complete Connect lifecycle | Not started | QA / Finance | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **B14** | 5 | Billing / Finance | P0 | Approve production financial execution | Not started | Finance / Independent release owner | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **I01** | 5 | Provider integrations | P0 | Validate transactional email delivery | Not started | Integrations / Email administrator | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **I02** | 5 | Provider integrations | P0 | Validate Google Calendar connectivity | Not started | Engineering / Calendar owner | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **I03** | 5 | Provider integrations | P0 | Complete calendar event synchronisation | Not started | Engineering / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **I04** | 5 | Provider integrations | P0 | Connect malware scanner | Not started | Security engineering / Provider owner | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **I05** | 5 | Provider integrations | P0 | Test agency Apps Script handoff | Not started | Integrations / Agency operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **I06** | 5 | Provider integrations | P0 | Connect digital signing provider | Not started | Legal engineering / Provider owner | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **I07** | 5 | Provider integrations | P1 | Verify paired Report Tool bridge | Not started | Reporting integration / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **I08** | 5 | Provider integrations | P0 | Harden notification/event processing | Not started | Engineering / Operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **I09** | 5 | Open Home / Staff | P1 | Verify next-day Open Home reports | Not started | Integrations / Leasing operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **I10** | 5 | Provider integrations | P0 | Prove negative integration controls | Not started | Security QA / Integrations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **R01** | 4 | Reporting / Inspections | P1 | Create reporting parity matrix | Not started | Reporting lead / Inspection operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **R02** | 4 | Reporting / Inspections | P1 | Complete report-template fidelity | Not started | Reporting engineering / Operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **R03** | 4 | Reporting / Inspections | P1 | Complete photo and annotation parity | Not started | Reporting engineering / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **R04** | 4 | Reporting / Inspections | P1 | Complete complex PDF fidelity | Not started | Reporting engineering / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **R05** | 4 | Reporting / Inspections | P1 | Complete offline resilience | In progress | Reporting engineering / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **R06** | 4 | Reporting / Inspections | P1 | Verify comparisons and tenant PCR responses | Not started | Reporting / Tenancy QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **R07** | 4 | Reporting / Inspections | P1 | Validate independent QC and report issuance | In progress | Reporting lead / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **R08** | 4 | Reporting / Inspections | P1 | Complete reporting performance and recovery | Not started | Performance QA / Engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **R09** | 4 | Reporting / Inspections | P1 | Obtain operational reporting acceptance | Not started | Inspection operations / Independent QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L01** | 4 | Legal / Tenancy | P0 | Approve legal documents and service scopes | Not started | Legal / Product owner | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L02** | 4 | Legal / Tenancy | P0 | Resolve legal/commercial policy conflicts | Not started | Legal / Business owner | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L03** | 4 | Legal / Tenancy | P0 | Validate legal acceptance | Not started | Engineering / Legal QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L04** | 4 | Legal / Tenancy | P0 | Obtain official WA statutory forms | Not started | Legal / Property operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L05** | 4 | Legal / Tenancy | P1 | Complete form generation and mappings | Not started | Document engineering / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L06** | 4 | Legal / Tenancy | P0 | Complete statutory signing acceptance | Not started | Legal operations / Engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L07** | 4 | Legal / Tenancy | P0 | Validate statutory notice preparation and service | Not started | Legal / Tenancy operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L08** | 4 | Legal / Tenancy | P0 | Complete Form 2 confidential processes | Not started | Privacy / Security / Legal | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L09** | 4 | Legal / Tenancy | P0 | Approve privacy, retention and deletion | Not started | Privacy / Engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L10** | 4 | Leasing / Rental | P0 | Complete rental application governance | Not started | Legal / Leasing operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L11** | 4 | Leasing / Rental | P0 | Verify agency application precedence | Not started | Engineering / Leasing QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L12** | 4 | Landlord / Tenant | P0 | Validate noncustodial bond coordination | Not started | Legal / Tenancy operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L13** | 4 | Legal / Tenancy | P0 | Resolve direct funds-handling scope | Not started | Business sponsor / Legal / Finance | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L14** | 4 | Finance / Property | P1 | Build approved direct-funds workflows (conditional) | Not started | Regulated finance engineering / Legal | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **L15** | 4 | Legal / Tenancy | P0 | Approve authority and disclosure arrangements | Not started | Legal / Operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **U01** | 5 | Authenticated portal acceptance | P0 | Prepare nine-role hosted acceptance | Not started | QA lead / Portal operators | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **U02** | 5 | Authenticated portal acceptance | P0 | Verify real authentication | Not started | Security QA / Identity owner | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **U03** | 5 | Residential Landlord | P0 | Accept Residential Landlord portal | Not started | Residential operations / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **U04** | 5 | Property Manager | P0 | Accept Property Manager portal | Not started | Agency operations / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **U05** | 5 | Commercial | P0 | Accept Commercial portal | Not started | Commercial operations / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **U06** | 5 | Strata Manager | P0 | Accept Strata Manager portal | Not started | Strata operations / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **U07** | 5 | Tenant | P0 | Accept Tenant portal | Not started | Tenant testers / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **U08** | 5 | Building / Resident | P0 | Accept Building/Resident portal | Not started | Resident testers / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **U09** | 5 | Strata Council | P0 | Accept Strata Council portal | Not started | Council representative / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **U10** | 5 | Staff / Admin | P0 | Accept Staff/Admin portal | Not started | Operations QA / Staff supervisor | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **U11** | 5 | Building Manager | P0 | Accept professional Building Manager portal | Not started | Building manager testers / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **U12** | 5 | Authenticated portal acceptance | P0 | Run cross-portal permissions | Not started | Security QA / Engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **U13** | 5 | Authenticated portal acceptance | P0 | Obtain independent portal acceptance | Not started | Independent QA / Role owners | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **O01** | 4 | Strata Manager | P1 | Complete multi-scheme strata acceptance | Not started | Strata engineering / Operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **O02** | 4 | Building Manager | P1 | Complete Building Manager operations | Not started | Building engineering / Operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **O03** | 4 | Strata Council / Building Resident | P1 | Complete Council/Resident communications | Not started | Communications engineering / Strata operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **O04** | 4 | Property Manager | P1 | Complete agency outsourcing and owner handoff | Not started | Agency engineering / Operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **O05** | 4 | Commercial | P1 | Complete commercial lease lifecycle | Engineering verified | Commercial engineering / Operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **O06** | 4 | Commercial | P1 | Complete commercial financial obligations | Engineering verified | Commercial finance engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **O07** | 4 | Commercial | P1 | Complete make-good and compliance workflows | Engineering verified | Commercial operations / Reporting | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **O08** | 4 | Commercial | P1 | Complete commercial exception handling | Engineering verified | Commercial engineering / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **O09** | 4 | Landlord / Commercial | P2 | Resolve unified owner portfolio | Not started | Product / Engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **O10** | 4 | Tenant | P2 | Resolve sector-specific Tenant journeys | Not started | Product / Tenancy engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **O11** | 4 | V4 / Specialist | P2 | Reconcile V4 specialist capabilities | Not started | Product / Engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **M01** | 3 | Marketing website | P0 | Audit public service content | Not started | Product / Marketing | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **M02** | 3 | Marketing website | P0 | Approve photography and report examples | Not started | Marketing / Privacy / Rights owner | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **M03** | 3 | Marketing website | P0 | Publish approved legal content | Not started | Product / Legal / Engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **M04** | 3 | Marketing website | P0 | Control PCR campaign publication | Not started | Marketing / Finance / Legal | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **M05** | 3 | Leasing marketing | P1 | Complete public leasing acceptance | Not started | Leasing operations / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **M06** | 3 | Staff leasing | P1 | Verify staff leasing-management interface | Not started | Engineering / Leasing operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **M07** | 3 | Open Home / Staff | P1 | Accept Open Home reports and recipients | Not started | Leasing operations / Integrations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **M08** | 3 | Marketing website | P0 | Complete accessibility/usability audit | Not started | Accessibility QA / Product | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **M09** | 3 | Marketing website | P0 | Complete publication acceptance | Not started | Product / Marketing / Operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **X01** | 5 | Release / Cloudflare operations | P0 | Resolve hosted recovery capacity | Not started | Cloudflare administrator / Operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **X02** | 5 | Release / Cloudflare operations | P0 | Complete isolated D1 restore rehearsal | Not started | Cloudflare operations / Engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **X03** | 5 | Release / Cloudflare operations | P0 | Complete R2 evidence recovery | Not started | Cloudflare operations / Security | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **X04** | 5 | Release / Cloudflare operations | P1 | Verify asynchronous recovery | Not started | Operations engineering / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **X05** | 5 | Release / Cloudflare operations | P0 | Complete secrets/configuration audit | Not started | Security / Cloudflare operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **X06** | 5 | Release / Cloudflare operations | P0 | Implement observability | Not started | SRE / Engineering | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **X07** | 6 | Release / Cloudflare operations | P0 | Assign incident owners and escalation | Not started | Operations owner / Security | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **X08** | 6 | Release / Cloudflare operations | P0 | Retain release/migration safeguards | In progress | Engineering lead / Release owner | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **X09** | 6 | Release / Cloudflare operations | P0 | Complete non-functional acceptance | Not started | Security / Performance / Accessibility QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **X10** | 6 | Release / Cloudflare operations | P0 | Complete release risk register | Not started | Delivery lead / QA | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **X11** | 6 | Release / Cloudflare operations | P0 | Execute controlled activation | Not started | Independent release owner / Cloudflare operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **X12** | 6 | Release / Cloudflare operations | P0 | Perform production post-release checks | Not started | QA / Operations | [#54](https://github.com/info-rbp/proinspect/issues/54) |
| **X13** | 6 | Release / Cloudflare operations | P0 | Complete operational handover | Not started | Operations owner / Product owner | [#54](https://github.com/info-rbp/proinspect/issues/54) |

## F01–F20 package acceptance

| Package | Outcome | Workstreams | Acceptance state |
| --- | --- | --- | --- |
| F01 | Integrated database/API baseline | WS00, WS09 | Not accepted |
| F02 | Staging and recovery | WS03, WS09 | Not accepted |
| F03 | Guest booking | WS01, WS08 | Not accepted |
| F04 | Stripe billing | WS01, WS02 | Not accepted |
| F05 | Portal acceptance | WS06 | Not accepted |
| F06 | Native reporting | WS04 | Not accepted |
| F07 | Strata Manager | WS06, WS07 | Not accepted |
| F08 | Building Manager | WS06, WS07 | Not accepted |
| F09 | Council and Resident | WS06, WS07 | Not accepted |
| F10 | Agency outsourcing | WS06, WS07 | Not accepted |
| F11 | Rental applications | WS03, WS05, WS08 | Not accepted |
| F12 | Legal framework | WS01, WS05 | Not accepted |
| F13 | WA statutory forms | WS03, WS05 | Not accepted |
| F14 | Bond/rent/restricted cases | WS05 | Not accepted |
| F15 | External integrations | WS03 | Not accepted |
| F16 | Contractor payments | WS02 | Not accepted |
| F17 | Marketing publication | WS01, WS08 | Not accepted |
| F18 | Commercial specialist operations | WS07 | Not accepted |
| F19 | Consolidated agency invoicing | WS02, WS07 | Not accepted |
| F20 | Release governance | WS00, WS09 | Not accepted |

## Evidence, ownership and non-acceptance rules

- Every task includes source actions, dependencies, acceptance contract, retained-evidence requirements, current implementation file paths, verification references, independent reviewer/acceptance owner placeholders and external evidence lists. See its `id` in the canonical JSON, never infer from a short row here.
- `implementationOwner`, `independentReviewer`, `acceptanceOwner` and `acceptanceDecision` remain unset without genuine evidence. `leadRole` is a responsible **role** only.
- G01–G07 have dedicated [GitHub issues #58–#64](https://github.com/info-rbp/proinspect/issues/54); all other tasks remain stably tracked by task ID in this register and the umbrella issue #54. G06's *one issue per task* original acceptance requirement is not satisfied by this index.
- The four engineering-verified O05–O08 retain their existing evidence state despite new merged source; PR #81 and #80 are source-integration evidence only. They do not satisfy genuine finance, signing, provider or legal acceptance.
- Commercial pricing, WA legal forms, real Stripe execution, nine independently authenticated portal journeys, live delivery/response, D1/R2 restoration and approved scope remain open.
- Production-only deployment preference does not silently change original staging/recovery acceptance contracts; make any authorised scope change through G04/G07 with a formal change record.
- Branch history: [complete branch census](branch-census-20261108.md); schema status: [migration ledger](migration-ledger-20261108.md).

**No task or F package is accepted or deferred by creating or merging this register.**
