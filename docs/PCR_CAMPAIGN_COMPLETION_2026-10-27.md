# PCR campaign implementation and independent activation gates

This source reconciles draft PR #56 with the deployed recovery/payment safeguard baseline. It fixes the corrupted guest-management JSX rather than discarding working booking, legal or payment controls. No campaign price, guest intake, Stripe collection, sample PDF or financial entitlement is activated by this change.

## Implemented contract

- Uses the branch's proposed AUD100 weekday / AUD125 Saturday / AUD150 Sunday customer totals, plus AUD10 optional off-site key collection. Exact absolute Perth appointment determines the amount; the confirmation must echo the reviewed total. The campaign is residential-only. Final business approval of scope, postcode coverage, GST and delivery commitments remains necessary.
- Retains immutable migrations0001-0044 and PR56's proposed0045. Additive0046 adds financial provenance and atomic benefit reservations. No paid customer is migrated or charged.
- The four 20% routine-inspection benefits are awarded only after a valid signed paid Checkout event. Duplicate events cannot grant another four. Eligibility is conservatively restricted to the same verified purchaser and canonical property. This restriction must be included in the independently approved offer terms before activation; a different approved policy requires an explicit reviewed change.
- Customer must opt in and confirm the displayed discounted total. Server rechecks scope, settled source, remaining uses and current price. D1 inserts the reservation atomically with the booking/payment and decrements once. Fifth-use and cross-purchaser/property claims fail without partial booking effects.
- Successful settlement changes reserved to redeemed once. Cancelling an unpaid booking before ANY Checkout attempt restores one use. Once a Checkout attempt has started, delayed financial outcomes must be reviewed before restoring a benefit; no automatic refund or restoration is inferred from navigation or expiry.
- A refund/dispute on the original PCR suspends unused benefits and holds outstanding reservations for review, without increasing an already agreed customer's price. Refunds on a discounted inspection require a separate restoration decision; the code does not silently invent that policy.
- New campaign intake and existing benefit redemption have separate switches/source-bound approvals. Closing a campaign does not itself erase earned records. Existing confirmed guest orders continue using the controlled payment workflow.
- Public sample delivery requires a separately reviewed release, exact configured SHA256 and bounded PDF bytes. An object merely existing at a fixed R2 path is not publication consent. The draft offer is noindex and absent from the sitemap; no real sample was uploaded.

## Disabled controls
PCR_LAUNCH_ENABLED, PCR_DISCOUNT_REDEMPTION_ENABLED and PCR_SAMPLE_PUBLICATION_ENABLED default false in both applications. All existing guest, financial and sensitive gates remain unchanged. PCR_SAMPLE_SHA256 must identify the genuinely reviewed public sample. Hosted release approvals remain independently source/environment bound.

## Acceptance
Run pnpm check, full Worker suites including tests/runtime/pcr-campaign.mjs, and complete browser verification on the exact source. Additional SQLite tests cover four-use exhaustion, property/purchaser isolation, cancellation/attempt safety, immutable redemption history, and populated44-to46 migration rehearsal. Local fixtures and mocked signed Stripe events do not establish real hosted checkout, tax acceptance, inbox delivery, regulatory approval, sample rights or the 48-hour operational promise.

Apply reviewed migrations before any Worker referencing the new schema. Back up and inspect isolated staging first; production migration requires a fresh recovery point, byte-identical44-entry history, preserved existing rows and zero FK violations. Keep all new switches off until their own evidence is approved.
