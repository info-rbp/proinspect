# Version 4 — release acceptance and negative-case checklist

## Repository checks

- [ ] Run `pnpm check` including 174-row catalogue and price/unit regressions.
- [ ] Run `pnpm test:integration` and `pnpm test:browser` on the precise candidate SHA.
- [ ] Run the non-empty migration upgrade rehearsal from migrations 0001–0026 to 0027 without data loss or foreign-key violations.
- [ ] Verify approved source fees for Residential PCR $200, Routine $60, Form 1AA $250; Commercial PCR $350, Commercial Lease Data Abstraction $250 and Outgoings Reconciliation $450; $25/invoice minimum $75.

## Customer and authority

- [ ] Restricted Form 2 and court processes never appear in ordinary public intake.
- [ ] Anonymous access to Staff request details and unrelated customer records fails.
- [ ] Gated-off public intake returns unavailable, not a simulated successful purchase.
- [ ] Rate limits and verified Turnstile block automation, replay and cross-hostname submissions.
- [ ] Same idempotency key with changed request data fails; exact retry does not create duplicate case.
- [ ] One-use links cannot be accepted twice, on a different case, after replacement or after expiry.
- [ ] Guest status never exposes contact, access codes, confidential evidence or unrelated property details.
- [ ] Staff review cannot bypass role control, stale version checks, document scope or client approval.

## Financial and provider acceptance

- [ ] Source schedule is not presented as an approved final quote without accepted scope and tax/payment terms.
- [ ] `POA`, `From`, plus-expenses and recurring unit prices cannot silently become zero or fixed final charges.
- [ ] Prevent duplicate charging for combined administration packs and individual component tasks.
- [ ] Confirm residential post-service seven-day payment policy and commercial terms.
- [ ] Confirm effective subscription schedule and each included/optional component before invoicing.
- [ ] Complete guest Stripe Checkout and signed webhook success, failure, replay, delayed settlement, refunds, retries and invoice reconciliation.
- [ ] Confirm email delivery using a verified real recipient; do not treat an outbox `sent` row as inbox delivery evidence.

## Operational workflows

- [ ] Each inspection has lawful notice/access review, resource availability, explicit confirmation, Work Order, report QA and authorised delivery.
- [ ] Each document has reviewed official template/version, role-bound approval, permitted signing method, legal-service evidence separated from email dispatch.
- [ ] Bond/court processes record independent government filing status without performing unapproved legal/government acts.
- [ ] Financial reporting accepts approved supporting data and performs no unlicensed accounting/legal determinations.
- [ ] Recurring reports work only under an approved client/property agreement.
- [ ] Real authenticated portal tests cover all eight portal classes and negative access restrictions.
- [ ] Only then deliberately set `V4_SERVICE_REQUESTS_ENABLED=true` in an approved environment.
