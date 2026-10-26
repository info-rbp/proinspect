CREATE TABLE billing_accounts (
 client_id TEXT PRIMARY KEY REFERENCES clients(id),
 stripe_account_id TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN('test','live')),
 stripe_customer_id TEXT UNIQUE,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER billing_customer_mapping_immutable BEFORE UPDATE ON billing_accounts WHEN NEW.client_id!=OLD.client_id OR NEW.mode!=OLD.mode OR NEW.stripe_account_id!=OLD.stripe_account_id OR (OLD.stripe_customer_id IS NOT NULL AND NEW.stripe_customer_id IS NOT OLD.stripe_customer_id) BEGIN SELECT RAISE(ABORT,'BILLING_CUSTOMER_IMMUTABLE'); END;
CREATE TABLE agency_invoice_exports (
 statement_id TEXT PRIMARY KEY REFERENCES agency_monthly_statements(id),
 client_id TEXT NOT NULL REFERENCES clients(id),
 snapshot_hash TEXT NOT NULL CHECK(length(snapshot_hash)=64),
 status TEXT NOT NULL CHECK(status IN('preparing','draft','finalized')),
 due_days INTEGER NOT NULL CHECK(due_days BETWEEN 1 AND 120),
 terms_reference TEXT NOT NULL,
 stripe_invoice_id TEXT UNIQUE,
 requested_by TEXT NOT NULL REFERENCES users(id),
 approved_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER invoice_export_scope BEFORE INSERT ON agency_invoice_exports BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM agency_monthly_statements s JOIN agency_commercial_agreements a ON a.id=s.agreement_id WHERE s.id=NEW.statement_id AND s.status='approved' AND a.client_id=NEW.client_id AND s.approved_by IS NOT s.prepared_by) THEN RAISE(ABORT,'APPROVED_STATEMENT_REQUIRED') END; END;
CREATE TRIGGER invoice_export_immutable BEFORE UPDATE ON agency_invoice_exports WHEN NEW.statement_id!=OLD.statement_id OR NEW.client_id!=OLD.client_id OR NEW.snapshot_hash!=OLD.snapshot_hash OR NEW.due_days!=OLD.due_days OR NEW.terms_reference!=OLD.terms_reference OR NEW.requested_by!=OLD.requested_by OR (OLD.stripe_invoice_id IS NOT NULL AND NEW.stripe_invoice_id IS NOT OLD.stripe_invoice_id) BEGIN SELECT RAISE(ABORT,'INVOICE_EXPORT_IMMUTABLE'); END;
CREATE TRIGGER invoice_export_independent BEFORE UPDATE ON agency_invoice_exports WHEN NEW.status='finalized' AND OLD.status!='finalized' BEGIN SELECT CASE WHEN NEW.approved_by=OLD.requested_by OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1 AND sp.role IN('administrator','operations_manager') WHERE u.id=NEW.approved_by AND u.active=1 AND u.verified_at IS NOT NULL) THEN RAISE(ABORT,'INDEPENDENT_INVOICE_REVIEW') END; END;
CREATE TABLE billing_invoices (
 stripe_invoice_id TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES clients(id),
 statement_id TEXT UNIQUE REFERENCES agency_monthly_statements(id),
 stripe_customer_id TEXT NOT NULL,
 currency TEXT NOT NULL CHECK(currency='AUD'),
 subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents>=0),
 total_cents INTEGER NOT NULL CHECK(total_cents>=subtotal_cents),
 paid_cents INTEGER NOT NULL DEFAULT 0 CHECK(paid_cents>=0),
 remaining_cents INTEGER NOT NULL CHECK(remaining_cents>=0),
 status TEXT NOT NULL CHECK(status IN('draft','open','paid','void','uncollectible','review')),
 reconciliation TEXT NOT NULL CHECK(reconciliation IN('matched','exception')),
 last_provider_created INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER billing_invoice_identity BEFORE UPDATE ON billing_invoices WHEN NEW.client_id!=OLD.client_id OR NEW.statement_id IS NOT OLD.statement_id OR NEW.stripe_customer_id!=OLD.stripe_customer_id OR NEW.currency!=OLD.currency OR NEW.total_cents!=OLD.total_cents OR NEW.subtotal_cents!=OLD.subtotal_cents BEGIN SELECT RAISE(ABORT,'INVOICE_SNAPSHOT_IMMUTABLE'); END;
CREATE TABLE billing_reconciliations (
 id TEXT PRIMARY KEY,
 provider_event_id TEXT NOT NULL,
 stripe_invoice_id TEXT NOT NULL REFERENCES billing_invoices(stripe_invoice_id),
 matched INTEGER NOT NULL CHECK(matched IN(0,1)),
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(provider_event_id,stripe_invoice_id)
) STRICT;
CREATE TRIGGER billing_reconciliation_no_update BEFORE UPDATE ON billing_reconciliations BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER billing_reconciliation_no_delete BEFORE DELETE ON billing_reconciliations BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER approved_agreement_rate_lock_update BEFORE UPDATE ON agency_contract_rates WHEN EXISTS(SELECT 1 FROM agency_commercial_agreements WHERE id=OLD.agreement_id AND status!='draft') BEGIN SELECT RAISE(ABORT,'APPROVED_RATE_IMMUTABLE'); END;
CREATE TRIGGER approved_agreement_rate_lock_insert BEFORE INSERT ON agency_contract_rates WHEN EXISTS(SELECT 1 FROM agency_commercial_agreements WHERE id=NEW.agreement_id AND status!='draft') BEGIN SELECT RAISE(ABORT,'APPROVED_RATE_IMMUTABLE'); END;
CREATE TRIGGER approved_agreement_rate_lock_delete BEFORE DELETE ON agency_contract_rates WHEN EXISTS(SELECT 1 FROM agency_commercial_agreements WHERE id=OLD.agreement_id AND status!='draft') BEGIN SELECT RAISE(ABORT,'APPROVED_RATE_IMMUTABLE'); END;
CREATE TRIGGER billable_work_immutable_update BEFORE UPDATE ON agency_billable_work BEGIN SELECT RAISE(ABORT,'BILLABLE_WORK_IMMUTABLE'); END;
CREATE TRIGGER billable_work_immutable_delete BEFORE DELETE ON agency_billable_work BEGIN SELECT RAISE(ABORT,'BILLABLE_WORK_IMMUTABLE'); END;
CREATE TRIGGER approved_statement_lines_insert BEFORE INSERT ON agency_statement_lines WHEN EXISTS(SELECT 1 FROM agency_monthly_statements WHERE id=NEW.statement_id AND status='approved') BEGIN SELECT RAISE(ABORT,'APPROVED_STATEMENT_IMMUTABLE'); END;
CREATE TRIGGER statement_lines_no_update BEFORE UPDATE ON agency_statement_lines BEGIN SELECT RAISE(ABORT,'STATEMENT_LINE_IMMUTABLE'); END;
CREATE TRIGGER statement_lines_no_delete BEFORE DELETE ON agency_statement_lines BEGIN SELECT RAISE(ABORT,'STATEMENT_LINE_IMMUTABLE'); END;
CREATE TRIGGER statement_approval_integrity BEFORE UPDATE ON agency_monthly_statements WHEN NEW.status='approved' AND OLD.status='draft' BEGIN
 SELECT CASE WHEN NEW.approved_by=OLD.prepared_by OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1 AND sp.role IN('administrator','operations_manager') WHERE u.id=NEW.approved_by AND u.active=1 AND u.verified_at IS NOT NULL) THEN RAISE(ABORT,'INDEPENDENT_STATEMENT_REVIEW') END;
 SELECT CASE WHEN NEW.subtotal_cents!=COALESCE((SELECT sum(amount_cents) FROM agency_statement_lines WHERE statement_id=NEW.id),-1) THEN RAISE(ABORT,'STATEMENT_LINE_TOTAL_MISMATCH') END;
END;
CREATE TRIGGER approved_statement_immutable BEFORE UPDATE ON agency_monthly_statements WHEN OLD.status='approved' BEGIN SELECT RAISE(ABORT,'APPROVED_STATEMENT_IMMUTABLE'); END;
