-- Additive, non-custodial Stripe Billing ledger. No automatic entitlement changes.
CREATE TABLE stripe_billing_links (
 id TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES clients(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 sector TEXT NOT NULL CHECK(sector IN ('residential','commercial')),
 price_id TEXT NOT NULL,
 session_id TEXT UNIQUE,
 checkout_url TEXT,
 stripe_subscription_id TEXT UNIQUE,
 stripe_customer_id TEXT,
 last_subscription_event_created INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL CHECK(status IN ('pending','incomplete','active','trialing','past_due','unpaid','canceled','paused','expired')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CONSTRAINT valid_stripe_price CHECK(length(price_id)>0)
) STRICT;
CREATE INDEX stripe_billing_links_status ON stripe_billing_links(status,client_id);
CREATE UNIQUE INDEX stripe_billing_active_property ON stripe_billing_links(client_id,property_id) WHERE status NOT IN ('canceled','expired');

-- A canceled subscription can be superseded without losing historical linkage.
CREATE TABLE stripe_billing_events (
 event_id TEXT PRIMARY KEY,
 link_id TEXT REFERENCES stripe_billing_links(id),
 event_type TEXT NOT NULL,
 stripe_object_id TEXT,
 status TEXT NOT NULL,
 currency TEXT,
 amount_cents INTEGER,
 needs_reconciliation INTEGER NOT NULL DEFAULT 1 CHECK(needs_reconciliation IN (0,1)),
 created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER stripe_billing_events_immutable_update BEFORE UPDATE ON stripe_billing_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER stripe_billing_events_immutable_delete BEFORE DELETE ON stripe_billing_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;