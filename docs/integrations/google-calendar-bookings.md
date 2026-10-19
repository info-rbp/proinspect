# ProInspect Google Calendar booking integration

## Status and authority
This integration is **opt-in and not active in production from this branch**.
ProInspect's Durable Object and D1 overlap guards remain the sole canonical
reservation authority. Google Calendar is an additional external busy-time veto
and an eventually-consistent projection of confirmed ProInspect appointments.

The existing `GOOGLE_CALENDAR_ENABLED=true` controls the read-only connectivity
diagnostic. The independent `GOOGLE_CALENDAR_BOOKINGS_ENABLED` controls all
booking availability lookups, event synchronisation and Staff sync dashboard
queries. Its default is `false`.

## Supported operational flow
1. A signed-in customer requests availability for an eligible service.
   ProInspect checks local booking windows, D1 reservations and blocks.
   With scheduling enabled, a single Google Free/Busy API query vetoes busy
   windows, including inspector/service buffers.
2. Reservation is serialised through the existing default BookingScheduler
   Durable Object. The Worker rechecks Google and writes the booking, work
   order, confidential-access envelope and versioned calendar sync job in a
   single D1 batch. D1 triggers guard concurrent internal reservations.
3. The next scheduled/after-POST dispatcher leases and processes pending jobs:
   an event with deterministic ID `pi` plus the booking UUID is inserted.
   Retried inserts inspect the same external ID and cannot create a second ID.
4. Rescheduling rechecks Google events **excluding the booking's own event**,
   atomically changes the D1 booking and upserts a new job version; the worker
   patches the Google event with the same ID. Cancellation deletes that event.
   Staff work-order cancellation and completion also update target versions.
5. Temporary failures retry with exponential backoff; exhausted attempts,
   external busy conflicts and foreign event-ID collisions require Staff review.
   The Staff Integrations page displays status counts, alerts and an audited
   manual retry. Notification email contains only generic error codes, never
   calendar event details or credentials.

**An internal booking can be confirmed before Google accepts its event.**
External calendar edits racing with confirmation can cause a job to require
manual reconciliation. Avoid treating a Google event itself as a ProInspect
reservation; verify sync state before relying on calendar mirroring.

## Before enabling in any environment
1. Apply migration `database/migrations/0008_calendar_sync.sql` to that
   environment's D1 database first. It intentionally does not backfill
   historical bookings into Google.
2. Set service account email and encrypted PEM private key in Worker bindings.
   Configure `GOOGLE_CALENDAR_ID`, `GOOGLE_CALENDAR_TIMEZONE=Australia/Perth`
   and `GOOGLE_CALENDAR_ENABLED=true`.
3. Confirm the **secondary ProInspect operational calendar** is shared with
   that service account at event-editing level. The already-proven read-only
   Free/Busy scope does **not** establish edit permissions; this release also
   requests `https://www.googleapis.com/auth/calendar.events`.
4. Run synthetic staging tests against an isolated operations/test calendar:
   - Verify Google busy periods remove candidate slots.
   - Concurrently submit two bookings for the same D1 resource/slot:
     exactly one succeeds.
   - Confirm a booking mirrors as one event; retry the sync and verify no
     duplicate event.
   - Reschedule and confirm the same event ID moves without conflict with
     itself. Block a slot externally and verify reschedule is rejected.
   - Cancel and confirm Google event deletion. Exercise Staff work-order
     cancellation and fast completion.
   - Simulate OAuth outage, 403 edit denial and stale/foreign event ID:
     staff attention/repair and manual retry must work without credential
     leakage.
5. Only after staging acceptance and explicit release approval, set
   `GOOGLE_CALENDAR_BOOKINGS_ENABLED=true`. Do not enable this flag before the
   migration or before confirming Google event-write rights.

## Rollback and limitations
- Set `GOOGLE_CALENDAR_BOOKINGS_ENABLED=false` immediately to disable all
  new external lookups/writes. Existing D1 reservations remain intact.
- Pending/attention sync jobs remain in D1 for later controlled replay.
- Google events created while enabled are *not* deleted automatically on
  rollback; operations staff must reconcile them.
- Current release uses **one shared `GOOGLE_CALENDAR_ID`** and the existing
  `default` scheduler resource. Inspector-specific calendars and multi-resource
  allocation are a separate design and must not be inferred from this release.
- Guest one-off booking is tracked in a separate draft PR and must adopt this
  canonical scheduler before being published.
- Historical booking backfill and automated detection of later manual Google
  event changes require dedicated review; there is no silent bulk backfill.
- To protect customer privacy, access codes and tenant details remain in
  ProInspect, not in Google event descriptions.

## References
- Google Events insert:
  https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- Google Events list:
  https://developers.google.com/workspace/calendar/api/v3/reference/events/list
- Google Free/Busy:
  https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
