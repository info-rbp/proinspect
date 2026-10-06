-- Additive contracts. Never rewrite the accepted core migrations.
CREATE TABLE client_entitlements (
 client_id TEXT NOT NULL REFERENCES clients(id), workspace_kind TEXT NOT NULL CHECK(workspace_kind IN('landlord','property-manager','strata-manager','commercial')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), approved_by TEXT REFERENCES users(id), created_at TEXT NOT NULL,
 PRIMARY KEY(client_id,workspace_kind)
) STRICT;
INSERT INTO client_entitlements(client_id,workspace_kind,created_at) SELECT id,'landlord',created_at FROM clients WHERE client_type='landlord';
CREATE TABLE organisation_applications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
 workspace_kind TEXT NOT NULL CHECK(workspace_kind IN('property-manager','strata-manager','commercial')),
 business_reference TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('pending','approved','declined')),
 client_id TEXT REFERENCES clients(id), reviewed_by TEXT REFERENCES users(id), review_reference TEXT, created_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX one_pending_application ON organisation_applications(user_id,workspace_kind) WHERE status='pending';
CREATE TABLE portal_invitations (
 token_hash TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE, client_id TEXT REFERENCES clients(id), scheme_id TEXT REFERENCES strata_schemes(id),
 lot_id TEXT REFERENCES strata_lots(id), role TEXT NOT NULL CHECK(role IN('admin','member','viewer','resident','owner','council_member')),
 starts_at TEXT NOT NULL, ends_at TEXT, expires_at TEXT NOT NULL, consumed_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK((client_id IS NOT NULL)+(scheme_id IS NOT NULL)=1), CHECK(ends_at IS NULL OR ends_at>starts_at)
) STRICT;
CREATE TABLE portfolio_owners (
 property_id TEXT NOT NULL REFERENCES properties(id), client_id TEXT NOT NULL REFERENCES clients(id),
 name TEXT NOT NULL, email TEXT, PRIMARY KEY(property_id,client_id)
) STRICT;
CREATE TABLE management_authorities (
 property_id TEXT NOT NULL REFERENCES properties(id), client_id TEXT NOT NULL REFERENCES clients(id),
 spending_limit_cents INTEGER NOT NULL DEFAULT 0 CHECK(spending_limit_cents>=0), authority_reference TEXT NOT NULL,
 valid_until TEXT NOT NULL, PRIMARY KEY(property_id,client_id)
) STRICT;
CREATE TABLE portfolio_imports (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), user_id TEXT NOT NULL REFERENCES users(id),
 envelope TEXT NOT NULL, fingerprint TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('preview','applied')),
 created_at TEXT NOT NULL, applied_at TEXT
) STRICT;
CREATE TABLE bulk_booking_runs (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), user_id TEXT NOT NULL REFERENCES users(id),
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(client_id,request_key)
) STRICT;
CREATE TABLE recurring_plans (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), property_id TEXT NOT NULL REFERENCES properties(id),
 service_id TEXT NOT NULL REFERENCES services(id), interval_months INTEGER NOT NULL CHECK(interval_months BETWEEN 1 AND 24),
 next_due TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('active','paused','ended')), version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE plan_occurrences (
 plan_id TEXT NOT NULL REFERENCES recurring_plans(id), due_date TEXT NOT NULL, booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
 PRIMARY KEY(plan_id,due_date)
) STRICT;
ALTER TABLE bookings ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bookings ADD COLUMN scheme_id TEXT REFERENCES strata_schemes(id);
ALTER TABLE tenancies ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tenancies ADD COLUMN bond_reference TEXT;
ALTER TABLE tenancies ADD COLUMN rent_cents INTEGER CHECK(rent_cents IS NULL OR rent_cents>=0);
ALTER TABLE requests ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE requests ADD COLUMN lot_id TEXT REFERENCES strata_lots(id);
ALTER TABLE requests ADD COLUMN location_kind TEXT CHECK(location_kind IS NULL OR location_kind IN('common','lot','unsure'));
ALTER TABLE work_orders ADD COLUMN approval_required INTEGER NOT NULL DEFAULT 0 CHECK(approval_required IN(0,1));
ALTER TABLE work_orders ADD COLUMN resident_visible INTEGER NOT NULL DEFAULT 0 CHECK(resident_visible IN(0,1));
ALTER TABLE work_orders ADD COLUMN public_summary TEXT;
ALTER TABLE work_orders ADD COLUMN scheduled_at TEXT;
ALTER TABLE approvals ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE approvals ADD COLUMN decision_scope TEXT NOT NULL DEFAULT 'client' CHECK(decision_scope IN('client','council','named_user'));
ALTER TABLE approvals ADD COLUMN target_user_id TEXT REFERENCES users(id);
CREATE UNIQUE INDEX one_pending_approval ON approvals(work_order_id) WHERE status='pending';
CREATE TABLE council_responses (
 approval_id TEXT NOT NULL REFERENCES approvals(id), user_id TEXT NOT NULL REFERENCES users(id),
 membership_id TEXT NOT NULL REFERENCES scheme_memberships(id), response TEXT NOT NULL CHECK(response IN('support','oppose','information')),
 comment TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, PRIMARY KEY(approval_id,user_id)
) STRICT;
CREATE TABLE request_comments (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id), author_id TEXT NOT NULL REFERENCES users(id),
 body TEXT NOT NULL, audience TEXT NOT NULL CHECK(audience IN('requester','staff')), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE request_attachments (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id), uploaded_by TEXT NOT NULL REFERENCES users(id),
 object_key TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL CHECK(size>0),
 sha256 TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('quarantined','released','rejected')),
 review_reference TEXT, reviewed_by TEXT REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(request_id,sha256)
) STRICT;
ALTER TABLE documents ADD COLUMN previous_document_id TEXT REFERENCES documents(id);
CREATE UNIQUE INDEX one_document_successor ON documents(previous_document_id) WHERE previous_document_id IS NOT NULL;
ALTER TABLE document_requests ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE document_requests ADD COLUMN updated_at TEXT;
ALTER TABLE building_notices ADD COLUMN work_order_id TEXT REFERENCES work_orders(id);
ALTER TABLE building_notices ADD COLUMN building_id TEXT REFERENCES scheme_buildings(id);
ALTER TABLE building_notices ADD COLUMN lot_id TEXT REFERENCES strata_lots(id);
ALTER TABLE building_notices ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE payments ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE payments ADD COLUMN due_at TEXT;
ALTER TABLE payments ADD COLUMN checkout_session_id TEXT;
CREATE UNIQUE INDEX payment_checkout_session ON payments(checkout_session_id) WHERE checkout_session_id IS NOT NULL;
ALTER TABLE payments ADD COLUMN checkout_url TEXT;
ALTER TABLE payments ADD COLUMN updated_at TEXT;
CREATE TABLE payment_events (
 id TEXT PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payments(id), actor_id TEXT REFERENCES users(id),
 from_status TEXT, to_status TEXT NOT NULL, reference TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER payment_events_no_update BEFORE UPDATE ON payment_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER payment_events_no_delete BEFORE DELETE ON payment_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TABLE webhook_receipts (
 provider TEXT NOT NULL, event_id TEXT NOT NULL, payload_hash TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(provider,event_id)
) STRICT;
CREATE TABLE report_handoffs (
 id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL REFERENCES work_orders(id), requested_by TEXT NOT NULL REFERENCES users(id),
 token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, consumed_at TEXT, document_id TEXT REFERENCES documents(id), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE integration_deliveries (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 status TEXT NOT NULL CHECK(status IN('pending','sent','failed')), attempts INTEGER NOT NULL DEFAULT 0,
 available_at TEXT NOT NULL, lease_token TEXT, lease_until TEXT, error_code TEXT, created_at TEXT NOT NULL, sent_at TEXT
) STRICT;
CREATE INDEX integration_pending ON integration_deliveries(status,available_at);
CREATE TABLE statutory_case_events (
 id TEXT PRIMARY KEY, form_id TEXT NOT NULL REFERENCES statutory_forms(id), actor_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL, reference TEXT, created_at TEXT NOT NULL
) STRICT;
ALTER TABLE statutory_forms ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE statutory_forms ADD COLUMN issued_document_id TEXT REFERENCES documents(id);
ALTER TABLE statutory_forms ADD COLUMN service_reference TEXT;
ALTER TABLE statutory_forms ADD COLUMN updated_at TEXT;
CREATE TABLE pcr_responses (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id), tenancy_id TEXT NOT NULL REFERENCES tenancies(id),
 user_id TEXT NOT NULL REFERENCES users(id), response_envelope TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('submitted','acknowledged')),
 created_at TEXT NOT NULL, acknowledged_by TEXT REFERENCES users(id), UNIQUE(document_id,user_id)
) STRICT;
CREATE TABLE restricted_reviewers (staff_user_id TEXT PRIMARY KEY REFERENCES staff_profiles(user_id), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1))) STRICT;
ALTER TABLE restricted_form_cases ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE restricted_evidence ADD COLUMN size INTEGER;
CREATE TABLE action_receipts (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL,
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, result_json TEXT NOT NULL CHECK(json_valid(result_json)), created_at TEXT NOT NULL,
 UNIQUE(user_id,action,request_key)
) STRICT;
-- Database guards protect writes regardless of the API path used.
CREATE TRIGGER work_order_approval_gate BEFORE UPDATE OF status ON work_orders
WHEN NEW.approval_required=1 AND NEW.status IN('approved','assigned','scheduled','in_progress','report_pending','completed')
BEGIN
 SELECT RAISE(ABORT,'APPROVAL_REQUIRED') WHERE COALESCE((SELECT status FROM approvals WHERE work_order_id=NEW.id ORDER BY created_at DESC,rowid DESC LIMIT 1),'missing')!='approved';
END;
CREATE TRIGGER request_scheme_area_guard BEFORE INSERT ON requests WHEN NEW.area_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'SCHEME_AREA_MISMATCH') WHERE NOT EXISTS(SELECT 1 FROM common_property_areas a WHERE a.id=NEW.area_id AND a.scheme_id=NEW.scheme_id); END;
CREATE TRIGGER request_scheme_lot_guard BEFORE INSERT ON requests WHEN NEW.lot_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'SCHEME_LOT_MISMATCH') WHERE NOT EXISTS(SELECT 1 FROM strata_lots l WHERE l.id=NEW.lot_id AND l.scheme_id=NEW.scheme_id); END;
CREATE TRIGGER lot_building_guard BEFORE INSERT ON strata_lots WHEN NEW.building_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'SCHEME_BUILDING_MISMATCH') WHERE NOT EXISTS(SELECT 1 FROM scheme_buildings b WHERE b.id=NEW.building_id AND b.scheme_id=NEW.scheme_id); END;
CREATE TRIGGER area_building_guard BEFORE INSERT ON common_property_areas WHEN NEW.building_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'SCHEME_BUILDING_MISMATCH') WHERE NOT EXISTS(SELECT 1 FROM scheme_buildings b WHERE b.id=NEW.building_id AND b.scheme_id=NEW.scheme_id); END;
CREATE TRIGGER scheme_membership_update_guard BEFORE UPDATE OF scheme_id,lot_id ON scheme_memberships WHEN NEW.lot_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'SCHEME_LOT_MISMATCH') WHERE NOT EXISTS(SELECT 1 FROM strata_lots l WHERE l.id=NEW.lot_id AND l.scheme_id=NEW.scheme_id); END;
CREATE TRIGGER portal_invitation_scope BEFORE INSERT ON portal_invitations
BEGIN
 SELECT RAISE(ABORT,'INVITATION_ROLE_MISMATCH') WHERE (NEW.client_id IS NOT NULL AND NEW.role NOT IN('admin','member','viewer')) OR (NEW.scheme_id IS NOT NULL AND NEW.role NOT IN('resident','owner','council_member'));
 SELECT RAISE(ABORT,'SCHEME_LOT_MISMATCH') WHERE NEW.lot_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM strata_lots l WHERE l.id=NEW.lot_id AND l.scheme_id=NEW.scheme_id);
END;
CREATE TRIGGER schedule_block_insert_guard BEFORE INSERT ON schedule_blocks
BEGIN SELECT RAISE(ABORT,'SCHEDULE_CONFLICT') WHERE EXISTS(SELECT 1 FROM bookings b WHERE b.resource_id=NEW.resource_id AND b.status!='cancelled' AND b.reserved_start<NEW.ends_at AND b.reserved_end>NEW.starts_at); END;
ALTER TABLE documents ADD COLUMN uploaded_client_id TEXT REFERENCES clients(id);
ALTER TABLE tenant_inspections ADD COLUMN notice_reference TEXT;
