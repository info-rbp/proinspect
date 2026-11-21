-- Additive, branch-only implementation. Do not merge or migrate production without
-- approved PAYG prices, invoices, payment terms, provider verification and acceptance.
CREATE TABLE cash_payment_term_requests (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id),
 term_code TEXT NOT NULL CHECK(term_code IN('upon_booking','net_7','eom_7')),
 credit_limit_cents INTEGER CHECK(credit_limit_cents IS NULL OR credit_limit_cents>=0),
 reason TEXT NOT NULL CHECK(length(reason)>=8), status TEXT NOT NULL DEFAULT 'pending'
 CHECK(status IN('pending','approved','declined')),
 requested_by TEXT NOT NULL REFERENCES users(id),
 reviewed_by TEXT REFERENCES users(id), review_reference TEXT,
 created_at TEXT NOT NULL, reviewed_at TEXT
) STRICT;
CREATE UNIQUE INDEX cash_terms_one_pending ON cash_payment_term_requests(client_id) WHERE status='pending';
CREATE TABLE cash_client_terms (
 client_id TEXT PRIMARY KEY REFERENCES clients(id),
 term_code TEXT NOT NULL CHECK(term_code IN('upon_booking','net_7','eom_7')),
 credit_limit_cents INTEGER CHECK(credit_limit_cents IS NULL OR credit_limit_cents>=0),
 source_request_id TEXT NOT NULL UNIQUE REFERENCES cash_payment_term_requests(id),
 approved_by TEXT NOT NULL REFERENCES users(id), approved_at TEXT NOT NULL
) STRICT;
CREATE TABLE booking_intake_secrets (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 envelope TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE cash_booking_charges (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id),
 client_id TEXT NOT NULL REFERENCES clients(id),
 term_code TEXT NOT NULL CHECK(term_code IN('net_7','eom_7')),
 amount_ex_gst_cents INTEGER NOT NULL CHECK(amount_ex_gst_cents>0),
 gst_cents INTEGER NOT NULL CHECK(gst_cents>=0),
 status TEXT NOT NULL DEFAULT 'awaiting_service'
 CHECK(status IN('awaiting_service','ready_to_invoice','invoice_prepared','cancelled')),
 completed_at TEXT, period TEXT, invoice_id TEXT,
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX cash_charges_status ON cash_booking_charges(client_id,status,period);
CREATE TABLE cash_invoice_batches (
 id TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES clients(id),
 term_code TEXT NOT NULL CHECK(term_code IN('net_7','eom_7')),
 period TEXT NOT NULL,
 subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents>0),
 gst_cents INTEGER NOT NULL CHECK(gst_cents>=0),
 total_cents INTEGER NOT NULL CHECK(total_cents=subtotal_cents+gst_cents),
 status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN('prepared','issued','paid','exception','void')),
 issued_at TEXT, due_at TEXT,
 provider_invoice_id TEXT UNIQUE,
 prepared_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 UNIQUE(client_id,term_code,period,status) 
) STRICT;
CREATE TABLE cash_invoice_items (
 booking_id TEXT PRIMARY KEY REFERENCES cash_booking_charges(booking_id),
 invoice_id TEXT NOT NULL REFERENCES cash_invoice_batches(id)
) STRICT;
-- Reviewed source prices. Apply only to unconfigured services, preserving prior
-- approved prices. A production deployment requires a separate approval gate.
UPDATE services SET price_ex_gst_cents=20000,booking_mode='instant'
 WHERE id='property-condition-report' AND price_ex_gst_cents IS NULL AND booking_mode='request';
UPDATE services SET price_ex_gst_cents=10000,booking_mode='instant'
 WHERE id='final-exit-inspection' AND price_ex_gst_cents IS NULL AND booking_mode='request';
UPDATE services SET price_ex_gst_cents=6000,booking_mode='instant'
 WHERE id='routine-inspection' AND price_ex_gst_cents IS NULL AND booking_mode='request';
