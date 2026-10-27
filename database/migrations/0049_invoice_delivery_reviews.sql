-- Sandbox-only, independently reviewed recipients and append-only dispatch evidence.
-- No existing statement, payment, invoice total, or customer entitlement is rewritten.
CREATE TABLE billing_invoice_contacts (
 id TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES clients(id),
 email TEXT NOT NULL,
 authority_reference TEXT NOT NULL CHECK(length(trim(authority_reference)) BETWEEN 8 AND 500),
 status TEXT NOT NULL CHECK(status IN('pending','approved','revoked')),
 requested_by TEXT NOT NULL REFERENCES users(id),
 approved_by TEXT REFERENCES users(id),
 approved_at TEXT,
 revoked_by TEXT REFERENCES users(id),
 revoked_at TEXT,
 created_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX billing_invoice_one_active_contact ON billing_invoice_contacts(client_id)
 WHERE status IN('pending','approved');
CREATE TRIGGER billing_invoice_contact_approval BEFORE UPDATE ON billing_invoice_contacts
 WHEN OLD.status='pending' AND NEW.status='approved' BEGIN
 SELECT CASE WHEN NEW.approved_by IS NULL OR NEW.approved_by=OLD.requested_by OR NOT EXISTS (
   SELECT 1 FROM users u JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1
   AND sp.role IN('administrator','operations_manager')
   WHERE u.id=NEW.approved_by AND u.active=1 AND u.verified_at IS NOT NULL
 ) THEN RAISE(ABORT,'BILLING_CONTACT_INDEPENDENT_REVIEW') END;
END;
CREATE TRIGGER billing_invoice_contact_immutable BEFORE UPDATE ON billing_invoice_contacts
 WHEN NEW.id!=OLD.id OR NEW.client_id!=OLD.client_id OR NEW.email!=OLD.email
 OR NEW.authority_reference!=OLD.authority_reference OR NEW.requested_by!=OLD.requested_by
 OR NEW.created_at!=OLD.created_at OR OLD.status='revoked'
 OR (OLD.status='approved' AND NEW.status!='revoked')
 OR (OLD.status='pending' AND NEW.status NOT IN('approved','revoked'))
 OR (OLD.approved_by IS NOT NULL AND NEW.approved_by IS NOT OLD.approved_by)
 OR (OLD.approved_at IS NOT NULL AND NEW.approved_at IS NOT OLD.approved_at)
 BEGIN SELECT RAISE(ABORT,'BILLING_CONTACT_IMMUTABLE'); END;
CREATE TRIGGER billing_invoice_contact_delete BEFORE DELETE ON billing_invoice_contacts
 BEGIN SELECT RAISE(ABORT,'BILLING_CONTACT_IMMUTABLE'); END;
CREATE TABLE billing_invoice_dispatches (
 statement_id TEXT PRIMARY KEY REFERENCES agency_monthly_statements(id),
 stripe_invoice_id TEXT NOT NULL UNIQUE REFERENCES billing_invoices(stripe_invoice_id),
 contact_id TEXT NOT NULL REFERENCES billing_invoice_contacts(id),
 customer_id TEXT NOT NULL,
 recipient_email TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('preparing','provider_accepted','needs_reconciliation')),
 requested_by TEXT NOT NULL REFERENCES users(id),
 approval_reference TEXT NOT NULL CHECK(length(trim(approval_reference)) BETWEEN 8 AND 500),
 provider_accepted_at TEXT,
 updated_at TEXT NOT NULL,
 created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER billing_invoice_dispatch_scope BEFORE INSERT ON billing_invoice_dispatches BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM agency_invoice_exports e
  JOIN billing_invoices i ON i.stripe_invoice_id=e.stripe_invoice_id
  JOIN billing_invoice_contacts c ON c.client_id=e.client_id
  WHERE e.statement_id=NEW.statement_id AND e.status='finalized'
   AND e.stripe_invoice_id=NEW.stripe_invoice_id AND i.client_id=e.client_id
   AND i.stripe_customer_id=NEW.customer_id AND i.status IN('draft','open')
   AND c.id=NEW.contact_id AND c.email=NEW.recipient_email AND c.status='approved'
   AND c.approved_by IS NOT NEW.requested_by AND e.approved_by IS NOT NULL
 ) THEN RAISE(ABORT,'BILLING_DISPATCH_REVIEW_REQUIRED') END;
END;
CREATE TRIGGER billing_invoice_dispatch_immutable BEFORE UPDATE ON billing_invoice_dispatches
 WHEN NEW.statement_id!=OLD.statement_id OR NEW.stripe_invoice_id!=OLD.stripe_invoice_id
 OR NEW.contact_id!=OLD.contact_id OR NEW.customer_id!=OLD.customer_id
 OR NEW.recipient_email!=OLD.recipient_email OR NEW.requested_by!=OLD.requested_by
 OR NEW.approval_reference!=OLD.approval_reference OR NEW.created_at!=OLD.created_at
 OR OLD.status='provider_accepted' OR (OLD.status='needs_reconciliation' AND NEW.status!='needs_reconciliation')
 BEGIN SELECT RAISE(ABORT,'BILLING_DISPATCH_IMMUTABLE'); END;
CREATE TRIGGER billing_invoice_dispatch_delete BEFORE DELETE ON billing_invoice_dispatches
 BEGIN SELECT RAISE(ABORT,'BILLING_DISPATCH_IMMUTABLE'); END;
CREATE TABLE billing_invoice_dispatch_events (
 id TEXT PRIMARY KEY,
 statement_id TEXT NOT NULL REFERENCES billing_invoice_dispatches(statement_id),
 event TEXT NOT NULL CHECK(event IN('requested','provider_accepted','needs_reconciliation')),
 actor_id TEXT NOT NULL REFERENCES users(id),
 reference TEXT NOT NULL,
 created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER billing_invoice_dispatch_event_immutable BEFORE UPDATE ON billing_invoice_dispatch_events
 BEGIN SELECT RAISE(ABORT,'BILLING_DISPATCH_EVENT_IMMUTABLE'); END;
CREATE TRIGGER billing_invoice_dispatch_event_delete BEFORE DELETE ON billing_invoice_dispatch_events
 BEGIN SELECT RAISE(ABORT,'BILLING_DISPATCH_EVENT_IMMUTABLE'); END;
