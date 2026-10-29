-- No historical all-inclusive subscriptions are modified or backfilled.
-- Only explicitly enrolled residential properties use the paid entitlement gate.
CREATE TABLE residential_paid_property_enrollments (
 client_id TEXT NOT NULL REFERENCES clients(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 enrolled_at TEXT NOT NULL,
 PRIMARY KEY(client_id,property_id)
) STRICT;
CREATE INDEX residential_paid_properties_client ON residential_paid_property_enrollments(client_id);
-- Signed Stripe invoice observations survive out-of-order webhook delivery.
CREATE TABLE stripe_subscription_invoice_observations (
 stripe_invoice_id TEXT PRIMARY KEY,
 stripe_subscription_id TEXT NOT NULL,
 stripe_customer_id TEXT NOT NULL,
 price_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('paid','failed','pending','review')),
 currency TEXT NOT NULL CHECK(currency='aud'),
 amount_paid_cents INTEGER NOT NULL DEFAULT 0 CHECK(amount_paid_cents>=0),
 invoice_created INTEGER NOT NULL,
 paid_through TEXT NOT NULL,
 last_event_created INTEGER NOT NULL,
 last_event_id TEXT NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX stripe_subscription_invoice_subscription ON stripe_subscription_invoice_observations(
 stripe_subscription_id,stripe_customer_id,invoice_created DESC
);
CREATE TRIGGER stripe_subscription_invoice_identity BEFORE UPDATE ON stripe_subscription_invoice_observations
WHEN NEW.stripe_subscription_id!=OLD.stripe_subscription_id OR NEW.stripe_customer_id!=OLD.stripe_customer_id
 OR (OLD.price_id!='unverified' AND NEW.price_id NOT IN(OLD.price_id,'unverified')) OR NEW.invoice_created!=OLD.invoice_created
BEGIN SELECT RAISE(ABORT,'STRIPE_INVOICE_IDENTITY_IMMUTABLE'); END;
