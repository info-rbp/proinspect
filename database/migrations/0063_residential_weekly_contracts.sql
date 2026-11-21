-- Additive only. No historical subscription is converted or charged.
CREATE TABLE residential_subscription_contracts (
 billing_link_id TEXT PRIMARY KEY REFERENCES stripe_billing_links(id),
 plan_version TEXT NOT NULL CHECK(plan_version='residential-all-inclusive-weekly-2026-11'),
 weekly_ex_gst_cents INTEGER NOT NULL CHECK(weekly_ex_gst_cents=5000),
 currency TEXT NOT NULL CHECK(currency='AUD'),
 billing_unit TEXT NOT NULL CHECK(billing_unit='property'),
 initial_term_months INTEGER NOT NULL CHECK(initial_term_months=24),
 cancellation_notice_days INTEGER NOT NULL CHECK(cancellation_notice_days=60),
 accepted_by TEXT NOT NULL REFERENCES users(id), accepted_at TEXT NOT NULL,
 starts_at TEXT
) STRICT;
CREATE TABLE residential_cancellation_notices (
 billing_link_id TEXT PRIMARY KEY REFERENCES residential_subscription_contracts(billing_link_id),
 requested_by TEXT NOT NULL REFERENCES users(id), received_at TEXT NOT NULL,
 earliest_end_at TEXT NOT NULL, reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN('pending_review','provider_scheduled','completed','withdrawn')),
 provider_reference TEXT, reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT,
 CHECK(status='pending_review' OR (provider_reference IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by!=requested_by))
) STRICT;
CREATE TRIGGER residential_contract_identity_immutable BEFORE UPDATE OF
 billing_link_id,plan_version,weekly_ex_gst_cents,currency,billing_unit,initial_term_months,cancellation_notice_days,accepted_by,accepted_at
 ON residential_subscription_contracts BEGIN SELECT RAISE(ABORT,'CONTRACT_IMMUTABLE'); END;
CREATE TRIGGER residential_contract_start_immutable BEFORE UPDATE OF starts_at ON residential_subscription_contracts
 WHEN OLD.starts_at IS NOT NULL AND NEW.starts_at IS NOT OLD.starts_at
 BEGIN SELECT RAISE(ABORT,'CONTRACT_START_IMMUTABLE'); END;
CREATE TRIGGER residential_contract_no_delete BEFORE DELETE ON residential_subscription_contracts
 BEGIN SELECT RAISE(ABORT,'CONTRACT_IMMUTABLE'); END;
CREATE TRIGGER residential_notice_receipt_immutable BEFORE UPDATE OF
 billing_link_id,requested_by,received_at,earliest_end_at,reason ON residential_cancellation_notices
 BEGIN SELECT RAISE(ABORT,'NOTICE_RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER residential_notice_no_delete BEFORE DELETE ON residential_cancellation_notices
 BEGIN SELECT RAISE(ABORT,'NOTICE_RECEIPT_IMMUTABLE'); END;
