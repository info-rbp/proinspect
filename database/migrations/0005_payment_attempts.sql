ALTER TABLE payments ADD COLUMN checkout_expires_at TEXT;
CREATE TABLE payment_checkout_attempts (
 session_id TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payments(id),
 status TEXT NOT NULL CHECK(status IN('open','processing','paid','failed','expired')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0), currency TEXT NOT NULL CHECK(currency='AUD'),
 expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
INSERT INTO payment_checkout_attempts(session_id,payment_id,status,amount_cents,currency,created_at,updated_at)
 SELECT checkout_session_id,id,CASE WHEN status='paid' THEN 'paid' ELSE 'open' END,total_cents,currency,created_at,COALESCE(updated_at,created_at)
 FROM payments WHERE checkout_session_id IS NOT NULL;
CREATE INDEX checkout_payment ON payment_checkout_attempts(payment_id,created_at);
CREATE TABLE payment_reconciliation_items (
 id TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payments(id), event_id TEXT NOT NULL UNIQUE,
 code TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved')),
 reference TEXT, resolved_by TEXT REFERENCES users(id), created_at TEXT NOT NULL, resolved_at TEXT
) STRICT;
