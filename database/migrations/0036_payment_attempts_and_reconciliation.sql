-- Existing payments and financial audit history are preserved.
ALTER TABLE payments ADD COLUMN stripe_payment_intent_id TEXT;
ALTER TABLE payments ADD COLUMN stripe_charge_id TEXT;
ALTER TABLE payments ADD COLUMN refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK(refunded_cents>=0 AND refunded_cents<=total_cents);
CREATE UNIQUE INDEX payment_intent_identity ON payments(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX payment_charge_identity ON payments(stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;
CREATE TABLE payment_checkout_attempts (
 id TEXT PRIMARY KEY,
 payment_id TEXT NOT NULL REFERENCES payments(id),
 payment_version INTEGER NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 currency TEXT NOT NULL CHECK(currency='AUD'),
 client_id TEXT NOT NULL REFERENCES clients(id),
 description TEXT NOT NULL,
 success_url TEXT NOT NULL,
 cancel_url TEXT NOT NULL,
 session_id TEXT UNIQUE,
 payment_intent_id TEXT,
 checkout_url TEXT,
 status TEXT NOT NULL CHECK(status IN('creating','open','processing','paid','failed','expired','superseded','review')),
 expires_at INTEGER,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX one_active_payment_attempt ON payment_checkout_attempts(payment_id) WHERE status IN('creating','open','processing');
CREATE TRIGGER payment_attempt_scope_insert BEFORE INSERT ON payment_checkout_attempts BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM payments p WHERE p.id=NEW.payment_id AND p.client_id=NEW.client_id AND p.version=NEW.payment_version AND p.total_cents=NEW.amount_cents AND p.currency=NEW.currency AND p.status IN('payment_required','failed')) THEN RAISE(ABORT,'PAYMENT_SNAPSHOT_CHANGED') END;
END;
CREATE TRIGGER payment_attempt_snapshot_immutable BEFORE UPDATE ON payment_checkout_attempts WHEN NEW.payment_id!=OLD.payment_id OR NEW.payment_version!=OLD.payment_version OR NEW.amount_cents!=OLD.amount_cents OR NEW.currency!=OLD.currency OR NEW.client_id!=OLD.client_id OR NEW.description!=OLD.description OR NEW.success_url!=OLD.success_url OR NEW.cancel_url!=OLD.cancel_url OR NEW.created_at!=OLD.created_at OR (OLD.session_id IS NOT NULL AND NEW.session_id IS NOT OLD.session_id) BEGIN SELECT RAISE(ABORT,'PAYMENT_ATTEMPT_IMMUTABLE'); END;
CREATE TRIGGER payment_attempt_no_delete BEFORE DELETE ON payment_checkout_attempts BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TABLE payment_reconciliation_items (
 id TEXT PRIMARY KEY,
 payment_id TEXT REFERENCES payments(id),
 provider_event_id TEXT NOT NULL,
 code TEXT NOT NULL,
 object_id TEXT,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved')),
 created_at TEXT NOT NULL,
 resolved_by TEXT REFERENCES users(id),
 resolved_at TEXT,
 evidence_reference TEXT,
 UNIQUE(provider_event_id,code)
) STRICT;
CREATE TRIGGER reconciliation_evidence_required BEFORE UPDATE ON payment_reconciliation_items BEGIN
 SELECT CASE WHEN NEW.status='resolved' AND (NEW.evidence_reference IS NULL OR length(NEW.evidence_reference)<8 OR NEW.resolved_at IS NULL OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1 AND sp.role IN('administrator','operations_manager') WHERE u.id=NEW.resolved_by AND u.active=1 AND u.verified_at IS NOT NULL)) THEN RAISE(ABORT,'RECONCILIATION_EVIDENCE_REQUIRED') END;
 SELECT CASE WHEN NEW.payment_id IS NOT OLD.payment_id OR NEW.provider_event_id!=OLD.provider_event_id OR NEW.code!=OLD.code OR NEW.object_id IS NOT OLD.object_id OR NEW.created_at!=OLD.created_at THEN RAISE(ABORT,'RECONCILIATION_IMMUTABLE') END;
END;
CREATE TRIGGER reconciliation_no_delete BEFORE DELETE ON payment_reconciliation_items BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TABLE payment_refund_observations (
 refund_id TEXT PRIMARY KEY,
 payment_id TEXT NOT NULL REFERENCES payments(id),
 payment_intent_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 currency TEXT NOT NULL CHECK(currency='AUD'),
 status TEXT NOT NULL CHECK(status IN('pending','requires_action','succeeded','failed','canceled')),
 provider_created INTEGER NOT NULL,
 last_event_created INTEGER NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER refund_identity_immutable BEFORE UPDATE ON payment_refund_observations WHEN NEW.payment_id!=OLD.payment_id OR NEW.payment_intent_id!=OLD.payment_intent_id OR NEW.amount_cents!=OLD.amount_cents OR NEW.currency!=OLD.currency OR NEW.provider_created!=OLD.provider_created BEGIN SELECT RAISE(ABORT,'REFUND_IDENTITY_MISMATCH'); END;
CREATE TRIGGER refund_observation_no_delete BEFORE DELETE ON payment_refund_observations BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TABLE payment_disputes (
 dispute_id TEXT PRIMARY KEY,
 payment_id TEXT NOT NULL REFERENCES payments(id),
 payment_intent_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 currency TEXT NOT NULL CHECK(currency='AUD'),
 status TEXT NOT NULL,
 last_event_created INTEGER NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE refund_requests (
 id TEXT PRIMARY KEY,
 payment_id TEXT NOT NULL REFERENCES payments(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 reason TEXT NOT NULL,
 evidence_reference TEXT NOT NULL,
 request_key TEXT NOT NULL UNIQUE,
 requested_by TEXT NOT NULL REFERENCES users(id),
 requested_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN('requested','approved','rejected','processing','submitted','failed')),
 approved_by TEXT REFERENCES users(id),
 approval_reference TEXT,
 approved_at TEXT,
 stripe_refund_id TEXT UNIQUE,
 version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER refund_request_immutable BEFORE UPDATE ON refund_requests WHEN NEW.payment_id!=OLD.payment_id OR NEW.amount_cents!=OLD.amount_cents OR NEW.reason!=OLD.reason OR NEW.evidence_reference!=OLD.evidence_reference OR NEW.request_key!=OLD.request_key OR NEW.requested_by!=OLD.requested_by OR NEW.requested_at!=OLD.requested_at OR (OLD.stripe_refund_id IS NOT NULL AND NEW.stripe_refund_id IS NOT OLD.stripe_refund_id) BEGIN SELECT RAISE(ABORT,'REFUND_REQUEST_IMMUTABLE'); END;
CREATE TRIGGER refund_independent_approval BEFORE UPDATE ON refund_requests WHEN NEW.status='approved' AND OLD.status='requested' BEGIN
 SELECT CASE WHEN NEW.approved_by=OLD.requested_by OR length(COALESCE(NEW.approval_reference,''))<8 OR NEW.approved_at IS NULL OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1 AND sp.role IN('administrator','operations_manager') WHERE u.id=NEW.approved_by AND u.active=1 AND u.verified_at IS NOT NULL) THEN RAISE(ABORT,'INDEPENDENT_REFUND_APPROVAL_REQUIRED') END;
 SELECT CASE WHEN NEW.amount_cents > COALESCE((SELECT p.total_cents-p.refunded_cents-COALESCE((SELECT sum(r.amount_cents) FROM refund_requests r WHERE r.payment_id=p.id AND r.id!=NEW.id AND r.status IN('approved','processing','submitted') AND (r.stripe_refund_id IS NULL OR NOT EXISTS(SELECT 1 FROM payment_refund_observations o WHERE o.refund_id=r.stripe_refund_id AND o.status IN('succeeded','failed','canceled')))),0) FROM payments p WHERE p.id=NEW.payment_id AND p.status='paid'),-1) THEN RAISE(ABORT,'REFUND_BALANCE_EXCEEDED') END;
END;
CREATE TRIGGER refund_no_delete BEFORE DELETE ON refund_requests BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER webhook_receipts_no_update BEFORE UPDATE ON webhook_receipts BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER webhook_receipts_no_delete BEFORE DELETE ON webhook_receipts BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
