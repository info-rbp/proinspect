# Connected operations acceptance

## Source contract

Build on `c7929b4c52a8ba8fdb4943dde89fc15577f26e5a`; retain all previously accepted workflows. The current GitHub `Verify ProInspect` result, not this document alone, determines the acceptance status of a commit.

## Additional user journeys

1. A strata manager schedules a targeted notice. Before publication there is no resident announcement. Once due, a bounded dispatcher creates one portal notification and optional private-link email per eligible verified person. Revisions create new notifications; withdrawals and lost membership suppress stale email.
2. A tenant receives published inspection information. Cancellation/rescheduling withdraws the previous information and notifies the tenancy. ProInspect does not claim that an application notification legally serves a statutory entry notice.
3. A person who is also a resident, council member and ProInspect operator changes workspace. Documents and notice audiences follow that workspace. A Building screen cannot reveal Council records by inheriting the person's Council role.
4. A property operator searches and pages through only their authorised properties, with exact result counts. A cursor is a page position, never an access grant. A team member's simultaneous Staff identity does not expand their assigned agency portfolio.
5. An unpaid provider checkout remains pending. Signed delayed-success/failure/expiry events update the record without regressing a settled payment. Duplicate or superseded settlements are visible to authorised Staff for reviewed reconciliation.

## Checks

The existing 46 real local Worker/D1/R2/Durable Object checks remain. `tests/runtime/continuity.mjs` adds 18 checks, and `tests/browser/continuity.spec.ts` adds two real-browser journeys. The full suite includes 64 runtime checks and eight browser tests, alongside the existing Node and SQL checks and both production builds.

All provider responses in these tests are synthetic. No hosted deployment, money movement, outbound notification, legal service, bond lodgement or customer data migration is performed.

## Build boundaries

Private document quarantine/release remains a manual review process, not antivirus scanning. Full statutory template approval, lawful service/lodgement integrations, restricted-workflow operating procedures, advanced retention, consolidated tax invoicing and multi-inspector scheduling remain separate scope. The schema and interfaces retain these domains without pretending unfinished controls are complete.
