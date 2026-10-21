-- Google Calendar is an operational projection, not a booking authority.
-- Import and enable only after configuring the Calendar scope and service account.
-- Historical bookings are not automatically exported; a separately audited
-- backfill is required if existing appointments should appear on Google.
-- A versioned, lease-protected job is committed in the same D1 batch as a booking
-- creation, rescheduling or cancellation. No external API call occurs in D1.
CREATE TABLE booking_calendar_sync (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
  event_id TEXT NOT NULL UNIQUE,
  target_version INTEGER NOT NULL CHECK(target_version>0),
  synced_version INTEGER CHECK(synced_version>0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN('pending','processing','synced','attention')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  next_attempt_at TEXT NOT NULL,
  lease_token TEXT,
  lease_until TEXT,
  error_code TEXT,
  synced_at TEXT,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX booking_calendar_sync_pending
  ON booking_calendar_sync(status,next_attempt_at,updated_at);
