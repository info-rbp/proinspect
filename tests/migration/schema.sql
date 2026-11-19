-- Synthetic spike only. Never apply to a production or shared application database.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE resources (id text PRIMARY KEY);
INSERT INTO resources VALUES ('default');
CREATE TABLE bookings (
 id text PRIMARY KEY, client_id text NOT NULL, user_id text NOT NULL,
 request_key text NOT NULL, fingerprint text NOT NULL, version integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'confirmed', envelope text NOT NULL,
 UNIQUE(client_id,request_key)
);
CREATE TABLE reservations (
 id text PRIMARY KEY, resource_id text NOT NULL REFERENCES resources(id),
 booking_id text UNIQUE REFERENCES bookings(id), period tstzrange NOT NULL,
 CHECK (NOT isempty(period) AND lower(period) IS NOT NULL AND upper(period) IS NOT NULL),
 EXCLUDE USING gist(resource_id WITH =, period WITH &&)
);
CREATE TABLE work_orders (id text PRIMARY KEY, booking_id text UNIQUE NOT NULL REFERENCES bookings(id), status text NOT NULL);
CREATE TABLE audit_events (id bigserial PRIMARY KEY, booking_id text REFERENCES bookings(id), action text NOT NULL);
CREATE TABLE outbox (id bigserial PRIMARY KEY, booking_id text UNIQUE REFERENCES bookings(id), event text NOT NULL);
CREATE TABLE payments (
 id text PRIMARY KEY, work_order_id text UNIQUE REFERENCES work_orders(id),
 amount_ex_gst_cents bigint NOT NULL CHECK(amount_ex_gst_cents>=0),
 gst_cents bigint NOT NULL CHECK(gst_cents>=0),
 total_cents bigint NOT NULL CHECK(total_cents=amount_ex_gst_cents+gst_cents),
 currency text NOT NULL CHECK(currency='AUD'), status text NOT NULL DEFAULT 'payment_required',
 refunded_cents bigint NOT NULL DEFAULT 0 CHECK(refunded_cents>=0 AND refunded_cents<=total_cents),
 version integer NOT NULL DEFAULT 1
);
CREATE TABLE webhook_receipts (provider text NOT NULL, event_id text NOT NULL, payload_hash text NOT NULL, PRIMARY KEY(provider,event_id));
CREATE TABLE payment_events (id bigserial PRIMARY KEY, payment_id text NOT NULL REFERENCES payments(id), event_id text NOT NULL UNIQUE);
CREATE TABLE invoice_credit_proposals (
 id text PRIMARY KEY, requested_by text NOT NULL, reviewed_by text, reviewed_at timestamptz,
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','rejected'))
);
CREATE FUNCTION credit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('approved','rejected') THEN RAISE EXCEPTION 'CREDIT_PROPOSAL_IMMUTABLE'; END IF;
 IF NEW.status IN ('approved','rejected') AND OLD.status='requested' AND
    (NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.requested_by OR NEW.reviewed_at IS NULL)
 THEN RAISE EXCEPTION 'FINANCE_SELF_REVIEW_DENIED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER credit_review BEFORE UPDATE ON invoice_credit_proposals FOR EACH ROW EXECUTE FUNCTION credit_guard();
