-- Version 4: service-request orchestration. Additive to the verified 0001-0026 production ledger.
-- No service is automatically enabled, billed, signed, legally served, or lodged by this migration.
CREATE TABLE v4_service_requests (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  request_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  service_code TEXT NOT NULL CHECK(service_code GLOB '[A-Z][A-Z][A-Z]-[0-9][0-9][0-9]'),
  sector TEXT NOT NULL CHECK(sector IN ('residential','commercial')),
  workflow_code TEXT NOT NULL,
  intake_envelope TEXT NOT NULL,
  rate_snapshot_json TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity>=1 AND quantity<=500),
  status TEXT NOT NULL DEFAULT 'pending_verification' CHECK(status IN (
    'pending_verification','submitted','under_review','awaiting_information','quoted',
    'approved','in_progress','awaiting_review','completed','declined','cancelled')),
  quote_cents INTEGER CHECK(quote_cents IS NULL OR (quote_cents>=0 AND quote_cents<=100000000)),
  quote_expires_at TEXT,
  completion_document_id TEXT REFERENCES documents(id),
  staff_note TEXT CHECK(staff_note IS NULL OR length(staff_note)<=1000),
  verified_at TEXT,
  staff_actor_id TEXT REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(status!='quoted' OR (quote_cents IS NOT NULL AND quote_expires_at IS NOT NULL)),
  CHECK(status!='completed' OR verified_at IS NOT NULL)
) STRICT;
CREATE INDEX v4_requests_queue ON v4_service_requests(status,created_at);
CREATE INDEX v4_requests_service ON v4_service_requests(service_code,created_at);
CREATE TABLE v4_request_links (
  token_hash TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES v4_service_requests(id),
  purpose TEXT NOT NULL CHECK(purpose IN ('verify','manage','quote')),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX v4_links_request ON v4_request_links(request_id,purpose,expires_at);
CREATE TABLE v4_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES v4_service_requests(id),
  action TEXT NOT NULL CHECK(length(action) BETWEEN 3 AND 80),
  actor_id TEXT REFERENCES users(id),
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX v4_events_request ON v4_request_events(request_id,created_at);
