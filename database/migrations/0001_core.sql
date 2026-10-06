PRAGMA foreign_keys = ON;

CREATE TABLE users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 display_name TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 created_at TEXT NOT NULL, verified_at TEXT
) STRICT;
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT
) STRICT;
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE login_tokens (
 token_hash TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE,
 expires_at TEXT NOT NULL, consumed_at TEXT, return_to TEXT NOT NULL DEFAULT '/workspaces', created_at TEXT NOT NULL
) STRICT;
CREATE TABLE auth_rate_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at TEXT NOT NULL) STRICT;
CREATE TABLE staff_profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 role TEXT NOT NULL CHECK(role IN('administrator','operations_manager','inspector','read_only')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1))
) STRICT;
CREATE TABLE clients (
 id TEXT PRIMARY KEY, name TEXT NOT NULL,
 client_type TEXT NOT NULL CHECK(client_type IN('landlord','agency','commercial_landlord','strata_company','asset_manager','other')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','pending','inactive')),
 billing_email TEXT, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE client_memberships (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), user_id TEXT NOT NULL REFERENCES users(id),
 role TEXT NOT NULL CHECK(role IN('owner','admin','member','viewer')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), created_at TEXT NOT NULL,
 UNIQUE(client_id,user_id)
) STRICT;
CREATE INDEX memberships_user ON client_memberships(user_id,active);
CREATE TABLE properties (
 id TEXT PRIMARY KEY, address TEXT NOT NULL, suburb TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'WA',
 postcode TEXT NOT NULL, address_key TEXT NOT NULL UNIQUE,
 sector TEXT NOT NULL CHECK(sector IN('residential','commercial','strata-building')),
 property_type TEXT NOT NULL DEFAULT 'House', created_at TEXT NOT NULL, archived_at TEXT
) STRICT;
CREATE TABLE client_property_links (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), property_id TEXT NOT NULL REFERENCES properties(id),
 role TEXT NOT NULL CHECK(role IN('owner','landlord','managing_agent','asset_manager','strata_manager','other')),
 starts_at TEXT NOT NULL, ends_at TEXT, UNIQUE(client_id,property_id,role,starts_at), CHECK(ends_at IS NULL OR ends_at>starts_at)
) STRICT;
CREATE INDEX links_property ON client_property_links(property_id,client_id);
CREATE TABLE property_management_relationships (
 id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id), manager_client_id TEXT NOT NULL REFERENCES clients(id),
 mode TEXT NOT NULL CHECK(mode IN('self_managed','agency_managed','commercial_managed')),
 starts_at TEXT NOT NULL, ends_at TEXT, CHECK(ends_at IS NULL OR ends_at>starts_at)
) STRICT;
CREATE UNIQUE INDEX one_current_manager ON property_management_relationships(property_id) WHERE ends_at IS NULL;
CREATE INDEX management_client ON property_management_relationships(manager_client_id,property_id);
CREATE TABLE portfolio_assignments (
 user_id TEXT NOT NULL REFERENCES users(id), property_id TEXT NOT NULL REFERENCES properties(id), client_id TEXT NOT NULL REFERENCES clients(id),
 PRIMARY KEY(user_id,property_id,client_id)
) STRICT;
CREATE TABLE tenancies (
 id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id),
 status TEXT NOT NULL CHECK(status IN('pending','active','ended')), starts_at TEXT NOT NULL, ends_at TEXT,
 reference TEXT, CHECK(ends_at IS NULL OR ends_at>starts_at)
) STRICT;
CREATE INDEX tenancy_property ON tenancies(property_id,status);
CREATE TABLE tenancy_memberships (
 id TEXT PRIMARY KEY, tenancy_id TEXT NOT NULL REFERENCES tenancies(id), user_id TEXT NOT NULL REFERENCES users(id),
 starts_at TEXT NOT NULL, ends_at TEXT, UNIQUE(tenancy_id,user_id), CHECK(ends_at IS NULL OR ends_at>starts_at)
) STRICT;
CREATE TABLE invitations (
 token_hash TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE, tenancy_id TEXT REFERENCES tenancies(id),
 client_id TEXT REFERENCES clients(id), role TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK((tenancy_id IS NOT NULL)+(client_id IS NOT NULL)=1)
) STRICT;
CREATE TABLE strata_schemes (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, scheme_number TEXT UNIQUE, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE scheme_client_links (
 id TEXT PRIMARY KEY, scheme_id TEXT NOT NULL REFERENCES strata_schemes(id), client_id TEXT NOT NULL REFERENCES clients(id),
 role TEXT NOT NULL CHECK(role IN('strata_manager','strata_company','building_manager')),
 starts_at TEXT NOT NULL, ends_at TEXT
) STRICT;
CREATE TABLE scheme_buildings (
 id TEXT PRIMARY KEY, scheme_id TEXT NOT NULL REFERENCES strata_schemes(id), name TEXT NOT NULL,
 property_id TEXT REFERENCES properties(id), UNIQUE(scheme_id,name)
) STRICT;
CREATE TABLE strata_lots (
 id TEXT PRIMARY KEY, scheme_id TEXT NOT NULL REFERENCES strata_schemes(id), lot_number TEXT NOT NULL,
 building_id TEXT REFERENCES scheme_buildings(id), property_id TEXT UNIQUE REFERENCES properties(id), UNIQUE(scheme_id,lot_number)
) STRICT;
CREATE TABLE common_property_areas (
 id TEXT PRIMARY KEY, scheme_id TEXT NOT NULL REFERENCES strata_schemes(id), building_id TEXT REFERENCES scheme_buildings(id), name TEXT NOT NULL
) STRICT;
CREATE TABLE scheme_memberships (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), scheme_id TEXT NOT NULL REFERENCES strata_schemes(id),
 lot_id TEXT REFERENCES strata_lots(id), role TEXT NOT NULL CHECK(role IN('resident','owner','council_member')),
 starts_at TEXT NOT NULL, ends_at TEXT, approved_by TEXT NOT NULL REFERENCES users(id), CHECK(ends_at IS NULL OR ends_at>starts_at)
) STRICT;
CREATE TABLE scheme_authority_profiles (
 scheme_id TEXT NOT NULL REFERENCES strata_schemes(id), client_id TEXT NOT NULL REFERENCES clients(id),
 spending_limit_cents INTEGER NOT NULL DEFAULT 0 CHECK(spending_limit_cents>=0), authority_reference TEXT NOT NULL,
 valid_until TEXT NOT NULL, PRIMARY KEY(scheme_id,client_id)
) STRICT;
CREATE TABLE building_notices (
 id TEXT PRIMARY KEY, scheme_id TEXT NOT NULL REFERENCES strata_schemes(id), title TEXT NOT NULL, body TEXT NOT NULL,
 audience TEXT NOT NULL CHECK(audience IN('residents','owners','council','all_members')),
 starts_at TEXT NOT NULL, expires_at TEXT, created_by TEXT NOT NULL REFERENCES users(id)
) STRICT;
CREATE TABLE services (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, family TEXT NOT NULL, sectors_json TEXT NOT NULL CHECK(json_valid(sectors_json)),
 summary TEXT NOT NULL, duration_minutes INTEGER NOT NULL CHECK(duration_minutes>0 AND duration_minutes<=480),
 buffer_before INTEGER NOT NULL DEFAULT 15 CHECK(buffer_before>=0), buffer_after INTEGER NOT NULL DEFAULT 15 CHECK(buffer_after>=0),
 notice_hours INTEGER NOT NULL DEFAULT 24 CHECK(notice_hours>=0), horizon_days INTEGER NOT NULL DEFAULT 60 CHECK(horizon_days>0),
 price_ex_gst_cents INTEGER CHECK(price_ex_gst_cents>=0), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 booking_mode TEXT NOT NULL DEFAULT 'request' CHECK(booking_mode IN('instant','request'))
) STRICT;
CREATE TABLE schedule_resources (id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1))) STRICT;
CREATE TABLE schedule_blocks (
 id TEXT PRIMARY KEY, resource_id TEXT NOT NULL REFERENCES schedule_resources(id), starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT 'Unavailable', CHECK(ends_at>starts_at)
) STRICT;
CREATE TABLE bookings (
 id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL REFERENCES clients(id), user_id TEXT NOT NULL REFERENCES users(id),
 property_id TEXT NOT NULL REFERENCES properties(id), service_id TEXT NOT NULL REFERENCES services(id),
 resource_id TEXT NOT NULL REFERENCES schedule_resources(id), starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 reserved_start TEXT NOT NULL, reserved_end TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN('confirmed','completed','cancelled')),
 price_ex_gst_cents INTEGER CHECK(price_ex_gst_cents>=0), snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(client_id,request_key), CHECK(ends_at>starts_at), CHECK(reserved_start<=starts_at AND reserved_end>=ends_at)
) STRICT;
CREATE INDEX bookings_client_property ON bookings(client_id,property_id,starts_at);
CREATE INDEX bookings_schedule ON bookings(resource_id,status,reserved_start,reserved_end);
CREATE TRIGGER booking_overlap_insert BEFORE INSERT ON bookings WHEN NEW.status!='cancelled'
BEGIN
 SELECT RAISE(ABORT,'SCHEDULE_CONFLICT') WHERE EXISTS(SELECT 1 FROM bookings b WHERE b.resource_id=NEW.resource_id AND b.status!='cancelled' AND b.reserved_start<NEW.reserved_end AND b.reserved_end>NEW.reserved_start);
 SELECT RAISE(ABORT,'SCHEDULE_BLOCKED') WHERE EXISTS(SELECT 1 FROM schedule_blocks s WHERE s.resource_id=NEW.resource_id AND s.starts_at<NEW.reserved_end AND s.ends_at>NEW.reserved_start);
END;
CREATE TRIGGER booking_overlap_update BEFORE UPDATE OF starts_at,ends_at,reserved_start,reserved_end,resource_id,status ON bookings WHEN NEW.status!='cancelled'
BEGIN
 SELECT RAISE(ABORT,'SCHEDULE_CONFLICT') WHERE EXISTS(SELECT 1 FROM bookings b WHERE b.id!=NEW.id AND b.resource_id=NEW.resource_id AND b.status!='cancelled' AND b.reserved_start<NEW.reserved_end AND b.reserved_end>NEW.reserved_start);
 SELECT RAISE(ABORT,'SCHEDULE_BLOCKED') WHERE EXISTS(SELECT 1 FROM schedule_blocks s WHERE s.resource_id=NEW.resource_id AND s.starts_at<NEW.reserved_end AND s.ends_at>NEW.reserved_start);
END;
CREATE TABLE booking_access_secrets (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id), envelope TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE requests (
 id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, client_id TEXT REFERENCES clients(id), property_id TEXT REFERENCES properties(id),
 tenancy_id TEXT REFERENCES tenancies(id), scheme_id TEXT REFERENCES strata_schemes(id), area_id TEXT REFERENCES common_property_areas(id),
 created_by TEXT NOT NULL REFERENCES users(id), source TEXT NOT NULL CHECK(source IN('client','tenant','building','staff')),
 category TEXT NOT NULL, title TEXT NOT NULL, details TEXT NOT NULL,
 priority TEXT NOT NULL CHECK(priority IN('routine','urgent','emergency')),
 status TEXT NOT NULL CHECK(status IN('submitted','under_review','action_required','in_progress','completed','closed')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK(property_id IS NOT NULL OR scheme_id IS NOT NULL)
) STRICT;
CREATE INDEX requests_property ON requests(property_id,status);
CREATE INDEX requests_scheme ON requests(scheme_id,status);
CREATE TABLE contractors (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, active INTEGER NOT NULL DEFAULT 1) STRICT;
CREATE TABLE work_orders (
 id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, booking_id TEXT UNIQUE REFERENCES bookings(id), request_id TEXT UNIQUE REFERENCES requests(id),
 client_id TEXT REFERENCES clients(id), property_id TEXT REFERENCES properties(id), scheme_id TEXT REFERENCES strata_schemes(id),
 title TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('triage','quote_required','awaiting_approval','approved','assigned','scheduled','in_progress','report_pending','completed','cancelled')),
 priority TEXT NOT NULL DEFAULT 'routine' CHECK(priority IN('routine','urgent','emergency')),
 assigned_staff_id TEXT REFERENCES staff_profiles(user_id), contractor_id TEXT REFERENCES contractors(id),
 completion_notes TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK(property_id IS NOT NULL OR scheme_id IS NOT NULL)
) STRICT;
CREATE INDEX work_orders_scope ON work_orders(client_id,property_id,assigned_staff_id,status);
CREATE TABLE approvals (
 id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL REFERENCES work_orders(id), requested_by TEXT NOT NULL REFERENCES users(id),
 decision_user_id TEXT REFERENCES users(id), client_id TEXT REFERENCES clients(id), scheme_id TEXT REFERENCES strata_schemes(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0), summary TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('pending','approved','changes_requested','declined')),
 response_comment TEXT, authority_reference TEXT, created_at TEXT NOT NULL, decided_at TEXT
) STRICT;
CREATE TABLE payments (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), property_id TEXT REFERENCES properties(id), work_order_id TEXT REFERENCES work_orders(id),
 description TEXT NOT NULL, amount_ex_gst_cents INTEGER NOT NULL CHECK(amount_ex_gst_cents>=0), gst_cents INTEGER NOT NULL CHECK(gst_cents>=0),
 total_cents INTEGER NOT NULL CHECK(total_cents=amount_ex_gst_cents+gst_cents), currency TEXT NOT NULL DEFAULT 'AUD' CHECK(currency='AUD'),
 status TEXT NOT NULL CHECK(status IN('pending','payment_required','paid','failed','refunded','waived')), provider TEXT NOT NULL DEFAULT 'manual', external_reference TEXT, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE subscriptions (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), property_id TEXT REFERENCES properties(id), plan_code TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('active','paused','ended')), allowance_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(allowance_json)), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE documents (
 id TEXT PRIMARY KEY, property_id TEXT REFERENCES properties(id), scheme_id TEXT REFERENCES strata_schemes(id), tenancy_id TEXT REFERENCES tenancies(id),
 booking_id TEXT REFERENCES bookings(id), work_order_id TEXT REFERENCES work_orders(id), request_id TEXT REFERENCES requests(id),
 title TEXT NOT NULL, category TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, content_type TEXT NOT NULL, size INTEGER NOT NULL CHECK(size>0), sha256 TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), source_report_id TEXT UNIQUE,
 status TEXT NOT NULL CHECK(status IN('draft','generated','review','approved','issued','archived')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, issued_at TEXT,
 CHECK(property_id IS NOT NULL OR scheme_id IS NOT NULL)
) STRICT;
CREATE TABLE document_grants (
 document_id TEXT NOT NULL REFERENCES documents(id), recipient_kind TEXT NOT NULL CHECK(recipient_kind IN('client','user','tenancy','scheme_resident','scheme_owner','scheme_council')),
 recipient_id TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 PRIMARY KEY(document_id,recipient_kind,recipient_id)
) STRICT;
CREATE INDEX documents_context ON documents(property_id,scheme_id,status);
CREATE TRIGGER issued_document_immutable BEFORE UPDATE OF object_key,sha256,size,content_type,version ON documents WHEN OLD.status IN('issued','archived') BEGIN SELECT RAISE(ABORT,'ISSUED_DOCUMENT_IMMUTABLE'); END;
CREATE TABLE document_requests (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), property_id TEXT NOT NULL REFERENCES properties(id), requested_by TEXT NOT NULL REFERENCES users(id),
 product_code TEXT NOT NULL, title TEXT NOT NULL, answers_envelope TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('submitted','under_review','awaiting_information','in_preparation','review','ready','completed','cancelled')),
 document_id TEXT REFERENCES documents(id), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE statutory_forms (
 id TEXT PRIMARY KEY, tenancy_id TEXT NOT NULL REFERENCES tenancies(id), created_by TEXT NOT NULL REFERENCES users(id), form_code TEXT NOT NULL,
 definition_version TEXT NOT NULL, answers_envelope TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL
) STRICT;
CREATE TABLE restricted_form_cases (
 id TEXT PRIMARY KEY, applicant_user_id TEXT NOT NULL REFERENCES users(id), tenancy_id TEXT NOT NULL REFERENCES tenancies(id),
 envelope TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL
) STRICT;
CREATE TABLE restricted_case_grants (case_id TEXT NOT NULL REFERENCES restricted_form_cases(id), staff_user_id TEXT NOT NULL REFERENCES staff_profiles(user_id), granted_by TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(case_id,staff_user_id)) STRICT;
CREATE TABLE restricted_evidence (id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES restricted_form_cases(id), object_key TEXT NOT NULL UNIQUE, envelope TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
CREATE TABLE restricted_audit (id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES restricted_form_cases(id), actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
CREATE TABLE notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, message TEXT NOT NULL, href TEXT NOT NULL,
 created_at TEXT NOT NULL, read_at TEXT
) STRICT;
CREATE INDEX notifications_user ON notifications(user_id,read_at,created_at);
CREATE TABLE communications (
 id TEXT PRIMARY KEY, property_id TEXT REFERENCES properties(id), scheme_id TEXT REFERENCES strata_schemes(id),
 recipient_user_id TEXT REFERENCES users(id), kind TEXT NOT NULL, subject TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE audit_events (
 id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id), action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 property_id TEXT REFERENCES properties(id), scheme_id TEXT REFERENCES strata_schemes(id), metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)), created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER restricted_audit_no_update BEFORE UPDATE ON restricted_audit BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER restricted_audit_no_delete BEFORE DELETE ON restricted_audit BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TABLE outbox_events (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, envelope TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','sent','failed')),
 attempts INTEGER NOT NULL DEFAULT 0, available_at TEXT NOT NULL, lease_until TEXT, lease_token TEXT,
 created_at TEXT NOT NULL, sent_at TEXT, error_code TEXT
) STRICT;
CREATE INDEX outbox_pending ON outbox_events(status,available_at);
CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL CHECK(json_valid(value_json)), updated_at TEXT NOT NULL) STRICT;
CREATE TABLE leads (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, enquiry TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
