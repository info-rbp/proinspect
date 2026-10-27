-- PCR launch offer: immutable attribution and four benefits issued only on verified payment.
ALTER TABLE guest_service_orders ADD COLUMN offer_code TEXT CHECK(offer_code IS NULL OR offer_code='pcr100');
ALTER TABLE guest_service_orders ADD COLUMN purchaser_email_hash TEXT;
CREATE INDEX pcr_offer_guest_lookup ON guest_service_orders(offer_code,purchaser_email_hash);
CREATE TABLE pcr_routine_discount_entitlements (
 id TEXT PRIMARY KEY,
 guest_order_id TEXT NOT NULL UNIQUE REFERENCES guest_service_orders(id),
 purchaser_email_hash TEXT NOT NULL,
 discount_basis_points INTEGER NOT NULL DEFAULT 2000 CHECK(discount_basis_points=2000),
 uses_remaining INTEGER NOT NULL DEFAULT 4 CHECK(uses_remaining BETWEEN 0 AND 4),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX pcr_routine_discount_lookup ON pcr_routine_discount_entitlements(purchaser_email_hash,uses_remaining);
CREATE TABLE pcr_routine_discount_redemptions (
 id TEXT PRIMARY KEY,
 entitlement_id TEXT NOT NULL REFERENCES pcr_routine_discount_entitlements(id),
 payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id),
 discount_cents INTEGER NOT NULL CHECK(discount_cents>0),
 created_at TEXT NOT NULL
) STRICT;
