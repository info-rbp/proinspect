CREATE TABLE mutation_guards (changed_rows INTEGER NOT NULL CHECK(changed_rows=1)) STRICT;
CREATE TRIGGER self_management_owner BEFORE INSERT ON property_management_relationships WHEN NEW.mode='self_managed'
BEGIN
 SELECT RAISE(ABORT,'SELF_MANAGEMENT_REQUIRES_OWNER') WHERE NOT EXISTS(SELECT 1 FROM client_property_links l JOIN properties p ON p.id=l.property_id JOIN clients c ON c.id=l.client_id WHERE l.property_id=NEW.property_id AND l.client_id=NEW.manager_client_id AND l.role IN('owner','landlord') AND l.ends_at IS NULL AND p.sector='residential' AND c.client_type='landlord');
END;
CREATE TRIGGER scheme_membership_lot_guard BEFORE INSERT ON scheme_memberships WHEN NEW.lot_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'SCHEME_LOT_MISMATCH') WHERE NOT EXISTS(SELECT 1 FROM strata_lots l WHERE l.id=NEW.lot_id AND l.scheme_id=NEW.scheme_id); END;
CREATE TABLE tenant_inspections (
 booking_id TEXT NOT NULL REFERENCES bookings(id), tenancy_id TEXT NOT NULL REFERENCES tenancies(id),
 notice_document_id TEXT REFERENCES documents(id), published_by TEXT NOT NULL REFERENCES users(id), published_at TEXT NOT NULL,
 PRIMARY KEY(booking_id,tenancy_id)
) STRICT;
CREATE UNIQUE INDEX report_content_once ON documents(work_order_id,sha256,category) WHERE work_order_id IS NOT NULL;
