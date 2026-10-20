-- Guest purchases are transactions, not customer portal memberships.
-- 0010 deliberately avoids draft-branch 0007/0008 migration-name collisions.
INSERT INTO users(id,email,display_name,active,created_at)
VALUES('usr_guest_booking_system','guest-bookings@proinspect.invalid','Guest booking system',0,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(id) DO NOTHING;
INSERT INTO clients(id,name,client_type,status,created_at)
VALUES('cli_guest_transactions','One-off service transactions (internal)','other','inactive',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(id) DO NOTHING;

CREATE TRIGGER guest_client_no_activation BEFORE UPDATE OF status ON clients
WHEN NEW.id='cli_guest_transactions' AND NEW.status='active'
BEGIN SELECT RAISE(ABORT,'GUEST_CLIENT_CANNOT_ACTIVATE'); END;
CREATE TRIGGER guest_client_no_memberships BEFORE INSERT ON client_memberships
WHEN NEW.client_id='cli_guest_transactions'
BEGIN SELECT RAISE(ABORT,'GUEST_MEMBERSHIPS_FORBIDDEN'); END;
CREATE TRIGGER guest_client_no_entitlements BEFORE INSERT ON client_entitlements
WHEN NEW.client_id='cli_guest_transactions'
BEGIN SELECT RAISE(ABORT,'GUEST_ENTITLEMENTS_FORBIDDEN'); END;

CREATE TABLE guest_service_orders (
 id TEXT PRIMARY KEY,
 reference TEXT NOT NULL UNIQUE,
 request_key TEXT NOT NULL UNIQUE,
 fingerprint TEXT NOT NULL,
 envelope TEXT NOT NULL,
 service_id TEXT NOT NULL REFERENCES services(id),
 sector TEXT NOT NULL CHECK(sector IN ('residential','commercial','strata-building')),
 status TEXT NOT NULL DEFAULT 'pending_verification'
   CHECK(status IN ('pending_verification','verified','quote_requested','quote_sent','awaiting_appointment','review_required','confirmed','cancelled')),
 price_basis TEXT NOT NULL CHECK(price_basis IN ('published','quote')),
 price_ex_gst_cents INTEGER CHECK(price_ex_gst_cents IS NULL OR price_ex_gst_cents>=0),
 quote_expires_at TEXT,
 property_id TEXT REFERENCES properties(id),
 property_reviewed_by TEXT REFERENCES users(id),
 property_reviewed_at TEXT,
 booking_id TEXT UNIQUE REFERENCES bookings(id),
 verified_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK(price_basis='quote' OR price_ex_gst_cents IS NOT NULL)
) STRICT;
CREATE INDEX guest_orders_queue ON guest_service_orders(status,created_at);
CREATE INDEX guest_orders_booking ON guest_service_orders(booking_id);

CREATE TABLE guest_access_links (
 token_hash TEXT PRIMARY KEY,
 order_id TEXT NOT NULL REFERENCES guest_service_orders(id),
 purpose TEXT NOT NULL CHECK(purpose IN ('verify','manage','quote','report')),
 document_id TEXT REFERENCES documents(id),
 expires_at TEXT NOT NULL,
 consumed_at TEXT,
 created_at TEXT NOT NULL,
 CHECK((purpose='report')=(document_id IS NOT NULL))
) STRICT;
CREATE INDEX guest_links_order ON guest_access_links(order_id,purpose,expires_at);

CREATE TABLE guest_request_limits (
 bucket TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL CHECK(attempts>0),
 expires_at TEXT NOT NULL
) STRICT;

