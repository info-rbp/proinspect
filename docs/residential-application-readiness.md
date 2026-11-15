# Residential application readiness (workstream B)

Extends the existing original ProInspect application, informed by optional WA Form 18. It does not reproduce government branding, option-fee guidance, a tenancy offer or a lease. The existing customer sign-in/up implementation is unchanged.

Official source pages checked 15 November 2026:
- https://www.consumerprotection.wa.gov.au/publications/application-rent-residential-premises-form-18
- https://www.consumerprotection.wa.gov.au/publications/tenancy-database-notice-form-18a

## Existing controls retained

Published residential property, explicit ProInspect mode, signed per-listing authority, verified recipient and source-bound release acceptance are required. The production intake/scanner/handoff flags stay OFF. Starts use server-verified Turnstile and rate limits; recovery is generic. Private expiring, hashed email links isolate adults' answers and documents; new recovery/resend links revoke older links. Lead applicants see completion status rather than confidential answers. There is no paper three-person cap: the existing ten-adult safety limit remains, with larger households requiring operator review rather than inviting children.

Encrypted D1 answers, immutable submission revisions, private R2 quarantine, type/size/magic/hash checks, signed scanner results, restricted staff review, recipient verification, signed idempotent handoff, information requests, withdrawal, correction requests and privacy holds are reused. Tenancy/bond creation, selection and customer account access are not changed or activated.

## Completed gaps

- Optional adult/minor counts must reconcile to total occupancy; adult count must match completed applicants when supplied. Invitations explicitly confirm an adult.
- Current/previous rental details remain; additional histories repeat with validated dates, amounts and contacts, or an explanation and alternative evidence. First-time renters can explain their circumstances.
- Employment branches include employed, self-employed, unemployed, retired, student and other income. Income amounts require a period; self-employment evidence is conditional.
- Two existing optional personal referees remain, with additional repeatable referees and contact validation. Purpose, optionality and separate contact authorisation are explicit; kin/emergency data is not mandatory by default.
- Extra records are encrypted in existing answer envelopes and included in private review, staff review, print and sealed snapshots. No D1 migration or new application system is required.
- Each applicant can correct their own email before submission. The transaction revokes old links and declarations, sends a new private link and requires renewed access through the corrected mailbox. No other applicant can edit it.
- Hosted starts and edits require the listing's approved notice version to match the current approved privacy policy. The start displays the recipient, purpose, policy version, privacy contact and configured retention windows. Exact notice version is bound to each declaration and snapshot.
- Pending/unsafe/unreviewed evidence blocks final submission. Reposting an already submitted application returns the original receipt without another snapshot or notification. The commit also checks that no active applicant has become incomplete.
- Any adult participant can withdraw and stop household processing; it does not depend on a queued handoff. The withdrawal transaction guards the application change itself, and cancelled delivery cannot proceed.
- A safe approved external application URL takes precedence over native intake. A configured external URL also blocks direct native GET/POST collection, so a bookmarked link cannot bypass the representative’s route.

## Release dependencies

These changes do not approve a privacy policy, choose retention periods or invent provider acceptance. Before hosted activation, obtain listing authority and recipient verification, approved collection/provider/retention disclosures, allowlisted private scanner contracts and signed clean receipts, verified handoff acceptance and bounce/uncertain-delivery reconciliation, independent source-specific release acceptance and operational ownership. Existing configurations remain disabled. Staging uses synthetic data and local email only; no production Worker or D1 writes are part of this PR.
