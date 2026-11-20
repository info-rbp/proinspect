-- Feature tranche: no destructive changes to pre-existing tenant, scheme, invoice or report records.
-- A signed provider event, not a booking form submission, authorises paid service delivery.
CREATE TABLE registered_booking_payment_links (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE RESTRICT,
  payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
  price_ex_gst_cents INTEGER NOT NULL CHECK(price_ex_gst_cents>0),
  gst_cents INTEGER NOT NULL CHECK(gst_cents>=0),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX registered_booking_payment_by_payment ON registered_booking_payment_links(payment_id);
CREATE TRIGGER registered_booking_payment_scope BEFORE INSERT ON registered_booking_payment_links
BEGIN
  SELECT RAISE(ABORT,'REGISTERED_PAYMENT_SCOPE_MISMATCH') WHERE NOT EXISTS(
    SELECT 1 FROM bookings b JOIN work_orders w ON w.booking_id=b.id
    JOIN payments p ON p.id=NEW.payment_id AND p.work_order_id=w.id
    WHERE b.id=NEW.booking_id AND b.client_id=p.client_id
      AND b.property_id=p.property_id
      AND p.total_cents=NEW.price_ex_gst_cents+NEW.gst_cents
      AND b.price_ex_gst_cents=NEW.price_ex_gst_cents
  );
END;
CREATE TRIGGER registered_booking_payment_immutable BEFORE UPDATE ON registered_booking_payment_links
BEGIN SELECT RAISE(ABORT,'REGISTERED_PAYMENT_LINK_IMMUTABLE'); END;

-- User-level presentation, never portal authority/entitlement.
CREATE TABLE user_portal_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portal_family TEXT NOT NULL CHECK(portal_family IN ('residential','commercial','strata','resident','operations')),
  display_density TEXT NOT NULL DEFAULT 'comfortable' CHECK(display_density IN ('comfortable','compact')),
  landing_section TEXT NOT NULL DEFAULT 'overview' CHECK(landing_section IN ('overview','properties','bookings','requests','documents','co-living','facilities','finance','my-room','occupant-premises','occupant-requests')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id,portal_family)
) STRICT;

-- Room/bed terms are operational *records*, not a statutory agreement or lodged bond.
CREATE TABLE co_living_lease_terms (
  tenancy_id TEXT PRIMARY KEY REFERENCES co_living_occupancies(tenancy_id) ON DELETE RESTRICT,
  rent_cents INTEGER CHECK(rent_cents>=0),
  rent_period TEXT NOT NULL DEFAULT 'weekly' CHECK(rent_period IN ('weekly','fortnightly','monthly')),
  expected_bond_cents INTEGER CHECK(expected_bond_cents>=0),
  utility_basis TEXT NOT NULL DEFAULT 'included' CHECK(utility_basis IN ('included','equal_share','metered','manual')),
  agreement_document_id TEXT REFERENCES documents(id) ON DELETE RESTRICT,
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK(review_status IN ('draft','reviewed')),
  source_reference TEXT NOT NULL CHECK(length(trim(source_reference))>=8),
  reviewed_by TEXT REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL
) STRICT;

-- Check-in, check-out, condition, transfer and financial note log.
-- Actions never alter legal tenancy dates or process a real payment automatically.
CREATE TABLE co_living_occupancy_events (
  id TEXT PRIMARY KEY,
  tenancy_id TEXT NOT NULL REFERENCES co_living_occupancies(tenancy_id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('check_in','check_out','condition_review','transfer_requested','agreement_review','rent_review','bond_review','utilities_review')),
  effective_at TEXT NOT NULL,
  evidence_reference TEXT NOT NULL CHECK(length(trim(evidence_reference)) BETWEEN 8 AND 240),
  note_envelope TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX co_living_occupancy_events_tenancy ON co_living_occupancy_events(tenancy_id,effective_at);

-- Shared-area inspections never expose raw photo files or another occupant's tenancy.
-- Issued document access remains governed by explicit document grants.
CREATE TABLE co_living_area_inspections (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES co_living_sites(property_id) ON DELETE RESTRICT,
  space_id TEXT NOT NULL REFERENCES co_living_spaces(id) ON DELETE RESTRICT,
  inspected_at TEXT NOT NULL,
  summary_envelope TEXT NOT NULL,
  public_summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','published')),
  issued_document_id TEXT REFERENCES documents(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(status!='published' OR (COALESCE(length(trim(public_summary)),0)>=8 AND reviewed_by IS NOT NULL))
) STRICT;
CREATE INDEX co_living_inspections_property ON co_living_area_inspections(property_id,inspected_at);
CREATE TRIGGER co_living_shared_review_independent BEFORE UPDATE OF status ON co_living_area_inspections
WHEN NEW.status='published' AND OLD.status!='published'
BEGIN
 SELECT RAISE(ABORT,'CO_LIVING_SELF_REVIEW_DENIED') WHERE NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by;
END;
CREATE TRIGGER co_living_shared_published_immutable BEFORE UPDATE ON co_living_area_inspections
WHEN OLD.status='published'
BEGIN SELECT RAISE(ABORT,'CO_LIVING_PUBLISHED_IMMUTABLE'); END;
CREATE TRIGGER co_living_terms_independent BEFORE UPDATE OF review_status ON co_living_lease_terms
WHEN NEW.review_status='reviewed' AND OLD.review_status!='reviewed'
BEGIN
 SELECT RAISE(ABORT,'CO_LIVING_SELF_REVIEW_DENIED') WHERE NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.updated_by;
END;
CREATE TRIGGER co_living_shared_area_guard BEFORE INSERT ON co_living_area_inspections
BEGIN
 SELECT RAISE(ABORT,'CO_LIVING_SHARED_AREA_REQUIRED') WHERE NOT EXISTS (
  SELECT 1 FROM co_living_spaces s WHERE s.id=NEW.space_id AND s.property_id=NEW.property_id
    AND s.space_type='shared_area' AND s.active=1
 );
END;

-- Opt-in pilot. Amenity requests are not strata levies, AGM decisions or a payment service.
CREATE TABLE strata_amenities (
  id TEXT PRIMARY KEY,
  scheme_id TEXT NOT NULL REFERENCES strata_schemes(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 3 AND 100),
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(scheme_id,name)
) STRICT;
CREATE TABLE strata_amenity_requests (
  id TEXT PRIMARY KEY,
  amenity_id TEXT NOT NULL REFERENCES strata_amenities(id) ON DELETE RESTRICT,
  requester_id TEXT NOT NULL REFERENCES users(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','declined','cancelled')),
  reviewed_by TEXT REFERENCES users(id),
  review_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(ends_at>starts_at)
) STRICT;
CREATE INDEX strata_amenity_requests_slot ON strata_amenity_requests(amenity_id,starts_at,ends_at,status);
CREATE TRIGGER strata_amenity_approval_conflict BEFORE UPDATE OF status ON strata_amenity_requests
WHEN NEW.status='approved' AND OLD.status!='approved'
BEGIN
 SELECT RAISE(ABORT,'AMENITY_SLOT_CONFLICT') WHERE EXISTS (
 SELECT 1 FROM strata_amenity_requests r
 WHERE r.amenity_id=NEW.amenity_id AND r.id<>NEW.id AND r.status='approved'
 AND r.starts_at<NEW.ends_at AND r.ends_at>NEW.starts_at
 );
END;
