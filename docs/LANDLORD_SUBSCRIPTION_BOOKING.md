# Landlord subscription-included direct booking

## Business rule

A Landlord should be able to select an authorised residential property, choose an included
service, provide access arrangements, pick an available appointment and confirm without
paying a second per-service charge. An included service creates the **same canonical
booking and Work Order**, scheduling reservation, confirmation event and eventual
document trail as the existing paid instant-booking workflow.

The catalogue's global `price_ex_gst_cents=NULL` / `booking_mode=request` **does
not mean free**. Published pay-as-you-go prices remain separate from subscription
coverage.

## Existing database contract

No migration is needed. The existing `subscriptions` table stores the approved
plan against a client and optionally a specific property.

- `client_id` must match the authorised Landlord workspace.
- `property_id=NULL` covers the subscribing client's eligible properties;
  a non-null `property_id` restricts coverage to that exact property.
- `status='active'` is required; paused and ended subscriptions do not
  authorise *new* included bookings.
- `allowance_json` **must explicitly** name included services, e.g.:

```json
{"includedServiceIds":["property-condition-report","routine-inspection"]}
```

An explicit `"*"` means every active, sector-compatible service is included.
**Do not use the wildcard without approving the plan's full service scope.**
A missing, empty or malformed `includedServiceIds` list confers no access.
Prices and catalog booking modes are otherwise unchanged.

Plan prices, term dates, service visit-frequency limits, renewal and payment
reconciliation are not defined by the existing database/application contract.
**Do not infer unlimited included visits from this implementation.**
Configure an approved plan policy and any necessary usage limits before activating
a paid subscription for a real customer.

## Booking and permission behaviour

- The server rechecks the actual client, property, service sector and active plan at
  confirmation, not just at the UI/availability stage.
- No plan means that a request-only/unpriced service continues to use the service
  request workflow.
- An included appointment records `bookings.price_ex_gst_cents=0` to indicate no
  *additional booking charge*, and snapshots
  `{ bookingBasis: "subscription_included", subscription: { id, planCode } }`.
  This does **not** imply that the customer's subscription itself is free.
- Paid instant booking still uses the existing catalogue price for a service that
  is not covered; professional and strata booking rules are unchanged.
- The existing scheduling Durable Object, D1 overlap/blocked-time triggers,
  idempotency keys, access/notice rules and Work Order transitions remain in force.
- Subscription pause/expiry blocks **new** included bookings without deleting
  existing confirmed bookings or their operational history.

## Stage 2 TEST landlord

The live D1 `subscriptions` table had **zero rows** on 17 October 2026, including
for `cli_pi_test_landlord`. This feature is deliberately **fail-closed** until the
test landlord has a synthetic approved active subscription. The branch does not
create one automatically, and no public route allows customers to provision
their own billing entitlement.

For a controlled acceptance test, after explicit test-plan approval, create a
synthetic subscription scoped to `cli_pi_test_landlord` and its synthetic
property, covering at least `property-condition-report`. Confirm the plan
record and supported service allowance with the authorised operator. Do not set
all 23 catalogue entries to `$0` or change public booking mode globally.

Test these outcomes with two authenticated identities:
1. Landlord sees "Included — no additional charge", selects available date and
   confirms a PCR without a quote.
2. One canonical Booking, one Work Order, no per-visit payment and customer +
   Staff booking notifications are created.
3. Staff sees the scheduled Work Order and client sees the booking.
4. A different client cannot view/book this property or use this subscription.
5. Pausing the subscription blocks subsequent included bookings while existing
   records remain intact.
6. The tenant inspection notice/access process and report issuance still respect
   existing privacy rules.

## Deployment gate

The feature must pass TypeScript, isolated Worker/D1/DO runtime integration,
browser, SQL integrity and Wrangler dry-run checks before merge. Source code may
be deployed independently of activation; no production subscription records
should be written until explicit business-plan eligibility and visit limits are
approved.
