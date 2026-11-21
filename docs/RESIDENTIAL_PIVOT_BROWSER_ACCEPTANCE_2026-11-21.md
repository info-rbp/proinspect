# Owner browser acceptance — Residential pivot

Use the exact preview SHA reported by `/api/health` and the delivery PR. Record date, browser/device, account role, route, expected result, observed result and screenshot for each issue. Mark each item **Pass / Fail / Blocked**; a disabled provider is Blocked, not Pass. Use synthetic data and no real payment details. This review does not authorise a main merge or Phase 6.

## Sign in to the staging preview

Open [ProInspect staging sign-in](https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev/signin?returnTo=%2Fworkspaces) in a private browser window. Choose **Continue with staging email**, enter the nominated address and retrieve its one-time code. Confirm the displayed address on the staging site and choose **Continue to ProInspect**. Use separate private sessions for different identities. Keep codes and cookies out of screenshots.

| Nominated email role | Workspace and synthetic records |
| --- | --- |
| Administrator | Staff Operations, including Today, work orders, report review and billing |
| Client | Two choices in My ProInspect. The landlord owns 11001 ProInspect Test Street. The agency manages 11002 ProInspect Test Street. |
| Resident | A tenancy at 11001 ProInspect Test Street, Test room A and the shared kitchen |

Use **Staging practice visit** for the booking and rescheduling journey. It has a zero test price and creates a synthetic appointment. The normal Residential services retain their catalogue rates or quote requirements. The leasing page includes **Staging sample rental**. Use synthetic contact details throughout.

- [ ] Record the staging source revision from [staging health](https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev/api/health), browser, viewport and test alias.
- [ ] Confirm the correct alias is displayed after email verification. Open its workspace and record the first page. Sign out and revisit a private page to confirm it requests sign-in.
- [ ] In the landlord workspace, try the agency property through that landlord workspace’s property URL. Then try the landlord’s finance page in the separate resident session. Both must deny access. The client can intentionally switch to its own agency workspace in My ProInspect.
- [ ] Record the receipt of the code, the confirmation and the workspace separately. Redact email codes, cookies and personal information from screenshots.

## Public review (available after successful preview deployment)

- [ ] At 320px, 390px, desktop and keyboard-only: header contains Residential, Co-Living, Leasing, Tenants, Maintenance, About Us, Who We Help, Sign Up / Sign In, Contact Us; mobile menu opens, closes with Escape and keeps focus usable.
- [ ] Home, all nine destinations, services, service finder and Residential Property Support load with no blank pages, clipping, horizontal scrolling, broken images or dead calls to action.
- [ ] Every new subscription reference says AUD $50 + GST / $55 including GST per week per property, initial 24 months and 60 days written notice. No $20/$150 monthly offering or per-room charge appears.
- [ ] Free registration is clearly separate from paid subscription. Co-Living custom operating scope and third-party expenses are not represented as unlimited included work.
- [ ] `/commercial`, `/strata`, `/construction`, commercial service/listing/application URLs and `.data` equivalents are unavailable for acquisition. `/student-living` redirects to Co-Living. Header, footer, finder and sitemap offer no retired product signup.
- [ ] Contact categories and Who We Help reflect the Residential audience. Draft legal documents visibly remain drafts and do not claim legal approval.

## Account and property journeys

Use the three nominated staging accounts above. A second owner, assigned inspector, separate reviewer and read-only user require separate authorised identities for hosted testing. Do not grant all roles to one account and treat that as permission testing.

- [ ] Owner A signs in, creates a free account and adds a property. No Stripe customer/charge, subscription or included-service entitlement appears automatically.
- [ ] Dashboard properties, open work, upcoming visits and pending decisions reflect actual authorised records. A visit in the past is not automatically reported as completed.
- [ ] Property links retain the chosen property for booking and tenancy. History, reports, requests and invoices have usable empty/loading/error states and return paths.
- [ ] Owner B cannot open Owner A's property, bookings, tenancy, reports, billing or guessed download URLs.
- [ ] An agency application remains pending until separately approved. An approved agency sees only assigned properties. Revocation takes effect immediately.
- [ ] Tenant invitation is mailbox/tenancy scoped. The tenant can submit maintenance and track their own request, but cannot see owner invoices, another tenant's files or private complaints.
- [ ] Ended tenancy and revoked membership no longer permit new ordinary requests.
- [ ] Configure one Co-Living property with two rooms and distinct tenant assignments. Each tenant sees only their residence/permitted shared records. Adding a room never creates another subscription.

## Booking, maintenance, leasing and Staff

- [ ] Authorised owner books an allowed service, receives one Booking and one linked Work Order, and retries without duplicate work/payment.
- [ ] Unpaid or wrong-property subscription coverage does not unlock included service. PAYG extras remain separate and priced/approved.
- [ ] Change/cancel a future visit; conflict and stale-update errors are useful. Booking history remains available afterwards.
- [ ] Tenant maintenance reaches the correct manager. Staff converts it to one Work Order; approved quotation/authority precedes spending. Private notes are not projected into customer updates.
- [ ] Residential listing uses the agency's approved applicant destination. Open-home attendance and reports reveal only permitted personal information. Commercial listing publication is blocked.
- [ ] Staff Today, assigned inspector, reviewer and read-only experiences match their authority. Retired sector tool links do not invite new actions.
- [ ] Inspector records evidence, submits a report and cannot self-approve or issue it. A different reviewer checks the exact PDF/source/audience before issuing.
- [ ] The client receives only the issued version. Draft/private/other-client downloads fail. Review Unicode text, large photos and annotations explicitly; existing automated offline checks do not prove all PDF template parity.
- [ ] Interrupt connectivity during a draft save/photo upload and recover without losing newer edits or duplicating acknowledged photos.

## Billing (blocked until legal and real Stripe test-mode acceptance)

- [ ] Approved current terms, inclusions, extras, renewal and early-exit treatment are visible before affirmative consent. Changed or missing document versions block Checkout.
- [ ] Stripe test Checkout is AUD 50 ex / 55 inc GST weekly, quantity one, mapped to exactly one property. Two rooms do not create two prices or quantities.
- [ ] Successful browser redirect alone does not activate paid coverage; signed matching settled invoice and subscription are required.
- [ ] Wrong customer, amount, price, quantity, currency, signature and duplicate/out-of-order events do not create incorrect entitlements or duplicate money.
- [ ] Failed renewal, recovery, refund, dispute and cancellation reconcile in the property ledger and Staff exception view.
- [ ] Written notice returns a persistent receipt and earliest ordinary end date; retry retains the same receipt. The UI says pending review, not cancelled. Immediate weekly-end self-cancellation is unavailable for the 24-month contract.
- [ ] Use an independently reviewed Stripe sandbox subscription to reconcile a written notice in Staff billing. Check the permissible end date, the date observed at Stripe and the final invoice. Scheduling at Stripe and the final charge require separate provider and legal acceptance.

## Release decision

- [ ] Broad CI and all required role/provider tests pass on the exact final SHA.
- [ ] Independent reviewer verifies preservation, no production bindings in preview, D1/R2 restore evidence and rollback.
- [ ] Owner records remaining browser changes and retests them. No critical/high unresolved defect remains.
- [ ] A separate named approver records explicit Cloudflare production GO. Until then leave the PR draft, main unchanged and live payments disabled.
- [ ] Stop before Phase 6. Google Cloud requires a new, separately approved migration and cutover decision.
