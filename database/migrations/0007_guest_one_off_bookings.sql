-- One-off purchasers are not subscription clients or portal users.
-- A guest intent cannot reserve capacity until its contact email is confirmed.
CREATE TABLE guest_service_intents (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  request_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  envelope TEXT NOT NULL,
  service_id TEXT NOT NULL REFERENCES services(id),
  sector TEXT NOT NULL CHECK(sector IN ('residential','commercial','strata-building')),
  quoted_price_cents INTEGER CHECK(quoted_price_cents>=0),
  verify_hash TEXT NOT NULL UNIQUE,
  verify_expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK(status IN ('pending_verification','quote_requested','review_required','confirmed')),
  booking_id TEXT UNIQUE REFERENCES bookings(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX guest_intents_status ON guest_service_intents(status,created_at);
-- Not a customer session or an identity supplied by a guest: immutable internal
-- FK actor for reservation/audit. Inactive, unverified, no memberships or roles.
INSERT INTO users(id,email,display_name,active,created_at)
VALUES('usr_guest_booking_system','guest-bookings@proinspect.invalid',
       'ProInspect guest booking process',0,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(id) DO NOTHING;
