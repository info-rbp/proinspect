CREATE TABLE booking_service_addon_intents (
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 addon_code TEXT NOT NULL CHECK(addon_code IN(
  'inventory_with_pcr','form19_service','tenant_attendance_coordination')),
 source_fee_candidate_ex_gst_cents INTEGER NOT NULL CHECK(source_fee_candidate_ex_gst_cents>=0),
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN('requested','declined','scope_accepted')),
 created_at TEXT NOT NULL,
 reviewed_by TEXT REFERENCES users(id),
 reviewed_at TEXT,
 PRIMARY KEY(booking_id,addon_code),
 CHECK((status='requested' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status!='requested' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
) STRICT;
CREATE TABLE request_service_intakes (
 request_id TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
 service_kind TEXT NOT NULL,
 encrypted_envelope TEXT NOT NULL,
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX request_service_intakes_kind ON request_service_intakes(service_kind,created_at);
