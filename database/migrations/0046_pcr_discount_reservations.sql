-- Immutable, property-scoped reservations. No live discount is enabled or price seeded.
ALTER TABLE pcr_routine_discount_entitlements ADD COLUMN source_payment_id TEXT REFERENCES payments(id);
ALTER TABLE pcr_routine_discount_entitlements ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','suspended'));
UPDATE pcr_routine_discount_entitlements SET source_payment_id=(
 SELECT p.id FROM guest_service_orders g JOIN work_orders w ON w.booking_id=g.booking_id
 JOIN payments p ON p.work_order_id=w.id WHERE g.id=guest_order_id AND p.status='paid' AND p.refunded_cents=0
 GROUP BY g.id HAVING COUNT(*)=1
);
UPDATE pcr_routine_discount_entitlements SET status='suspended' WHERE source_payment_id IS NULL;
CREATE TABLE pcr_discount_reservations (
 id TEXT PRIMARY KEY,
 entitlement_id TEXT NOT NULL REFERENCES pcr_routine_discount_entitlements(id),
 guest_order_id TEXT NOT NULL UNIQUE REFERENCES guest_service_orders(id),
 payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 base_ex_gst_cents INTEGER NOT NULL CHECK(base_ex_gst_cents>0),
 base_gst_cents INTEGER NOT NULL CHECK(base_gst_cents>=0),
 discount_cents INTEGER NOT NULL CHECK(discount_cents>0),
 total_cents INTEGER NOT NULL CHECK(total_cents>0 AND total_cents+discount_cents=base_ex_gst_cents+base_gst_cents),
 status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN('reserved','redeemed','released','exception')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX pcr_reservation_entitlement ON pcr_discount_reservations(entitlement_id,status);
CREATE TRIGGER pcr_entitlement_source_guard BEFORE INSERT ON pcr_routine_discount_entitlements BEGIN
 SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM guest_service_orders g JOIN work_orders w ON w.booking_id=g.booking_id
 JOIN payments p ON p.work_order_id=w.id
 WHERE g.id=NEW.guest_order_id AND g.offer_code='pcr100' AND g.status='confirmed'
 AND g.verified_at IS NOT NULL AND g.purchaser_email_hash=NEW.purchaser_email_hash
 AND p.id=NEW.source_payment_id AND p.status='paid' AND p.provider='stripe' AND p.refunded_cents=0
 AND NOT EXISTS(SELECT 1 FROM payment_disputes d WHERE d.payment_id=p.id)
 ) THEN RAISE(ABORT,'PCR paid source required') END;
END;
CREATE TRIGGER pcr_entitlement_identity_immutable BEFORE UPDATE ON pcr_routine_discount_entitlements
WHEN NEW.id!=OLD.id OR NEW.guest_order_id!=OLD.guest_order_id OR NEW.purchaser_email_hash!=OLD.purchaser_email_hash
 OR NEW.source_payment_id IS NOT OLD.source_payment_id OR NEW.discount_basis_points!=OLD.discount_basis_points
 OR NEW.created_at!=OLD.created_at OR (OLD.status='suspended' AND NEW.status!='suspended')
BEGIN SELECT RAISE(ABORT,'PCR entitlement identity is immutable'); END;
CREATE TRIGGER pcr_entitlement_no_delete BEFORE DELETE ON pcr_routine_discount_entitlements
BEGIN SELECT RAISE(ABORT,'PCR benefit history is immutable'); END;
CREATE TRIGGER pcr_reservation_guard BEFORE INSERT ON pcr_discount_reservations BEGIN
 SELECT CASE WHEN NEW.status!='reserved' OR NEW.discount_cents!=CAST(((NEW.base_ex_gst_cents+NEW.base_gst_cents)*2000+5000)/10000 AS INTEGER)
 OR NOT EXISTS(
 SELECT 1 FROM pcr_routine_discount_entitlements e
 JOIN guest_service_orders source ON source.id=e.guest_order_id
 JOIN payments paid ON paid.id=e.source_payment_id
 JOIN guest_service_orders target ON target.id=NEW.guest_order_id
 JOIN bookings b ON b.id=target.booking_id
 JOIN payments payment ON payment.id=NEW.payment_id
 JOIN work_orders w ON w.id=payment.work_order_id AND w.booking_id=b.id
 WHERE e.id=NEW.entitlement_id AND e.status='active' AND e.uses_remaining>0
 AND source.property_id=NEW.property_id AND source.status='confirmed' AND source.offer_code='pcr100'
 AND target.property_id=NEW.property_id AND target.verified_at IS NOT NULL AND target.status='confirmed'
 AND target.purchaser_email_hash=e.purchaser_email_hash AND target.service_id='routine-inspection'
 AND target.sector='residential' AND target.offer_code IS NULL
 AND paid.status='paid' AND paid.refunded_cents=0
 AND NOT EXISTS(SELECT 1 FROM payment_disputes d WHERE d.payment_id=paid.id)
 AND b.status='confirmed' AND b.service_id='routine-inspection' AND w.status='scheduled'
 AND payment.status='payment_required' AND payment.property_id=NEW.property_id AND payment.total_cents=NEW.total_cents
 AND payment.amount_ex_gst_cents=CAST((NEW.base_ex_gst_cents*8000+5000)/10000 AS INTEGER)
 ) THEN RAISE(ABORT,'PCR discount unavailable or inconsistent') END;
END;
CREATE TRIGGER pcr_reservation_decrement AFTER INSERT ON pcr_discount_reservations BEGIN
 UPDATE pcr_routine_discount_entitlements SET uses_remaining=uses_remaining-1,updated_at=NEW.created_at WHERE id=NEW.entitlement_id;
END;
CREATE TRIGGER pcr_reservation_update_guard BEFORE UPDATE ON pcr_discount_reservations BEGIN
 SELECT CASE WHEN NEW.id!=OLD.id OR NEW.entitlement_id!=OLD.entitlement_id OR NEW.guest_order_id!=OLD.guest_order_id
 OR NEW.payment_id!=OLD.payment_id OR NEW.property_id!=OLD.property_id OR NEW.base_ex_gst_cents!=OLD.base_ex_gst_cents
 OR NEW.base_gst_cents!=OLD.base_gst_cents OR NEW.discount_cents!=OLD.discount_cents OR NEW.total_cents!=OLD.total_cents
 OR NEW.created_at!=OLD.created_at THEN RAISE(ABORT,'PCR reservation identity is immutable') END;
 SELECT CASE WHEN NEW.status!=OLD.status AND NOT (OLD.status='reserved' AND NEW.status IN('redeemed','released','exception'))
 THEN RAISE(ABORT,'PCR reservation transition denied') END;
 SELECT CASE WHEN NEW.status='released' AND OLD.status!='released' AND (
 EXISTS(SELECT 1 FROM payment_checkout_attempts a WHERE a.payment_id=OLD.payment_id)
 OR NOT EXISTS(SELECT 1 FROM payments p JOIN guest_service_orders g ON g.id=OLD.guest_order_id
 WHERE p.id=OLD.payment_id AND p.status IN('payment_required','failed') AND g.status='cancelled')
 ) THEN RAISE(ABORT,'PCR pending financial outcome requires review') END;
 SELECT CASE WHEN NEW.status='redeemed' AND OLD.status!='redeemed' AND NOT EXISTS(
 SELECT 1 FROM payments p WHERE p.id=OLD.payment_id AND p.status='paid' AND p.provider='stripe' AND p.total_cents=OLD.total_cents
 ) THEN RAISE(ABORT,'PCR redemption requires verified settlement') END;
END;
CREATE TRIGGER pcr_reservation_release AFTER UPDATE OF status ON pcr_discount_reservations
WHEN OLD.status='reserved' AND NEW.status='released' BEGIN
 UPDATE pcr_routine_discount_entitlements SET uses_remaining=uses_remaining+1,updated_at=NEW.updated_at WHERE id=NEW.entitlement_id;
END;
CREATE TRIGGER pcr_reservation_settle AFTER UPDATE OF status ON pcr_discount_reservations
WHEN OLD.status='reserved' AND NEW.status='redeemed' BEGIN
 INSERT INTO pcr_routine_discount_redemptions(id,entitlement_id,payment_id,discount_cents,created_at)
 VALUES(NEW.id,NEW.entitlement_id,NEW.payment_id,NEW.discount_cents,NEW.updated_at);
END;
CREATE TRIGGER pcr_reservation_no_delete BEFORE DELETE ON pcr_discount_reservations BEGIN SELECT RAISE(ABORT,'PCR reservation history is immutable'); END;
CREATE TRIGGER pcr_redemption_no_update BEFORE UPDATE ON pcr_routine_discount_redemptions BEGIN SELECT RAISE(ABORT,'PCR redemption history is immutable'); END;
CREATE TRIGGER pcr_redemption_no_delete BEFORE DELETE ON pcr_routine_discount_redemptions BEGIN SELECT RAISE(ABORT,'PCR redemption history is immutable'); END;
