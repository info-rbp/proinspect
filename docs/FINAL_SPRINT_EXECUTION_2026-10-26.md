# Final sprint: recovered integration and verified release boundaries

## Recovery baseline
The interrupted integration branch stopped after four of eight transport chunks. Production remained at `9e5ea2c05668b7f9d4c47d1245714591aa103831`, with 26 applied migrations and no foreign-key violations. The dedicated staging Worker remained at `0f66f61b5fd1439dbeb46983c5a387ca79f3d872`, with 19 migrations. Recovery retrieved all remote branch histories and hash-checked available source fragments before reconstructing the complete candidate. Temporary transport material is not part of the application tree.

## Source disposition
| Source | Incorporated scope | Boundaries |
|---|---|---|
| PR 3, a1f7bd69 | Payment-attempt tracking, reconciliation exceptions and reviewed notice lifecycle adapted to current permissions | Old migrations 0004/0005 are not replayed; obsolete branch trees are not substituted |
| PR 39, b0914032 | Signed Property Report Tool handoff, bounded streaming private PDF intake, independent review | Paired provider acceptance and complete report parity remain unproven |
| PR 43, b04508ba | Rental authority, private scanner dispatch, signed agency handoff, retention and outcome controls | Actual scanner/Apps Script and lawful retention review required |
| PR 44, 36b7a3e9 | Sandbox guest Checkout, property subscriptions and financial events | No production-enabled payment adapter, real credentials or provider acceptance |
| PR 46, b411d427 | WA restricted preparation and non-custodial rent records, sandbox architecture | No live rent, bond, trust transfer or government submission |
| PR 47, 6498efed and PR 48, 804b564d | Forms Centre, immutable official-document signing intent, sandbox draft adapter and 32-form review records | No invented official PDF coordinates, signature, statutory service or approval |
| PR 49, 882c9523 | Seven legal review documents plus new versioned transactional acceptance enforcement | Independent approval of actual terms, identity, pricing and data processing remains required |
| PR 50, ee4eb555 | Service scopes, marketing copy and publication register | Pending publication approvals remain pending |
| PR 51, bf603cdc | Agency owner grants, negotiated agreements and monthly statements | Extended with mailbox-bound invitations, independent authority verification and sandbox invoice preparation |
| PR 52, ba7c98e6 | Direct contractor payment evidence and separately gated sandbox Connect | Live collection/transfers and recipient acceptance remain blocked |
| version-4-guest-booking-finalisation | 174 SKU reference catalogue, 40 request pathways and quote/request records | Reference fees are not automatically published appointment prices |

## Added completion modules
- A ninth, separately authorised **Building Manager** workspace, not a renamed resident portal. Current building/client delegation, independent appointment review, revocation, private resident requests, reviewed public summaries, canonical Work Orders, shared assets, preventive maintenance requests, device custody, resident moves and explicit report grants.
- Strata/council extensions reuse canonical scheme and building records. Council conflict declarations and reviewed operational notice publication do not constitute statutory voting or lawful tenancy notice service.
- Commercial lease-source and critical-date/obligation records with independently reviewed completion evidence; no automatic rent reviews, legal notices or complete lease accounting.
- Immutable legal versions and SHA-256-bound consent receipts committed in the same transaction as onboarding, bookings, guest requests, quotes, payments, subscription initiation and rental submission. Draft terms cannot be silently approved by accepting a checkbox.
- Source/environment-bound release records require independent administrators and actual evidence references. Configuration flags alone cannot enable the protected hosted workflows. No release approvals are seeded.
- Approved sale variants map existing services to verified fee SKUs, explicit scope, postcode/property rules, GST and independent approval. No customer price or service-area decision is invented.
- Separate Checkout attempts, replay protection, asynchronous settlement, refund/dispute observations, over-refund protection and independent refund approval. Stable client billing accounts, customer billing portal, immutable agency statement allocation, reviewed sandbox invoice draft/finalisation and invoice-event reconciliation.
- Agency owner invitations are bound to a verified mailbox and a current management appointment; claiming an invitation does not create a new paying account, subscription or management authority.

## Database integration
Migrations 0001-0026 are unchanged, checked against exact Git blob identities. New migrations are sequenced 0027-0044. Tests rehearse both populated 19-to-44 and 26-to-44 upgrades, retaining existing users, clients, bookings, payments and all-inclusive entitlements. Every source branch's independent 0027 has been deliberately renumbered; no historical migration is changed.

## Verification records
Use the exact release SHA's GitHub Actions run and the environment's BUILD_SHA as deployment evidence. Local and CI suites use synthetic identities and mocked provider calls; they are not actual mailbox, payment, scanner or signature-provider acceptance. New tests cover building-role separation/revocation, owner-invitation isolation, transactional legal receipt correctness, immutable payment attempts, partial refunds, disputes and financial approval segregation.

## Explicit remaining operating and parity requirements
1. Install separate staging provider credentials through their secret stores. At recovery, neither inspected Worker had Stripe secrets, and staging had only its encryption secret. Preserve the existing encryption keys.
2. Reconcile actual rate-card scope, appointment capacity, location rules and commercial terms. Stripe's 162 PAYG Prices are not a one-to-one mapping to the 23 public service categories. No approved mappings are seeded.
3. Resolve the conflicting subscription policies and inspection frequencies before charging customers or altering existing all-inclusive entitlements. The legal review draft and sandbox prices are not an approval decision.
4. Genuine authenticated hosted journeys across the original eight workspaces and the new Building Manager role, including mailbox/Turnstile, current authority, revoked access and recipient-specific document checks.
5. Real hosted sandbox Checkout, subscription renewal/failure, signed webhook delivery, invoice tax comparison, refund, dispute, contractor onboarding and transfer-reversal acceptance. Code and recorded events do not prove bank settlement. Complete any remaining credit-note/accounting/payout integrations against approved operating procedures.
6. Real Resend delivery/bounce, Google Calendar writes/reschedule/cancel, malware-scanner outcomes, agency handoff receipts and protected next-day 09:00 Perth Open Home reporting. No production successful-provider fixtures.
7. Approved official form bytes, placement coordinates, signatory/service rules, confidential-case threat review and government processes. The signing adapter creates sandbox drafts, not executed agreements.
8. Original Report Tool layout/annotation/media parity, representative large-PDF visual review, high-volume offline recovery and paired external-bridge acceptance remain individual completion tasks. No assertion of complete upstream report parity is made.
9. Business/legal/media/accessibility approval, protected launch evidence, monitoring ownership, restore rehearsal and approved release sequence. A green build is not a blanket launch approval.

## Release procedure
First verify the exact combined source, all schema tests, Worker integrations, both builds, browser suites and hosted isolated staging with all financial/sensitive flags OFF. Capture migration recovery points and compare canonical counts. Only then apply additive production migrations before the main merge's automatic deployment. Never force-push main or automatically close source PRs as fully activated. Preserve all historical branches and record any partial parity explicitly.
