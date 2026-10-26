-- Professional authority is independent of resident membership; existing roles are not widened.
CREATE TABLE building_manager_assignments (
 id TEXT PRIMARY KEY, building_id TEXT NOT NULL REFERENCES scheme_buildings(id),
 user_id TEXT NOT NULL REFERENCES users(id), client_id TEXT NOT NULL REFERENCES clients(id),
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL CHECK(ends_at>starts_at),
 authority_reference TEXT NOT NULL CHECK(length(authority_reference)>=8),
 requested_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','declined','revoked')),
 approved_by TEXT REFERENCES users(id), approved_at TEXT, review_reference TEXT, revoked_at TEXT,
 CHECK(status!='approved' OR (approved_by IS NOT NULL AND approved_by!=requested_by AND approved_by!=user_id AND approved_at IS NOT NULL AND length(review_reference)>=8))
) STRICT;
CREATE INDEX building_assignment_user ON building_manager_assignments(user_id,status,ends_at);
CREATE TRIGGER building_assignment_scope BEFORE INSERT ON building_manager_assignments BEGIN
 SELECT RAISE(ABORT,'BUILDING_AUTHORITY_REQUIRED') WHERE NOT EXISTS(SELECT 1 FROM scheme_buildings b JOIN scheme_client_links l ON l.scheme_id=b.scheme_id JOIN clients c ON c.id=l.client_id WHERE b.id=NEW.building_id AND l.client_id=NEW.client_id AND l.role IN('strata_manager','building_manager') AND c.status='active' AND l.starts_at<=NEW.starts_at AND (l.ends_at IS NULL OR l.ends_at>=NEW.ends_at));
END;
CREATE TRIGGER building_assignment_identity BEFORE UPDATE OF building_id,user_id,client_id,starts_at,ends_at,authority_reference,requested_by,created_at ON building_manager_assignments BEGIN SELECT RAISE(ABORT,'BUILDING_ASSIGNMENT_IMMUTABLE'); END;
CREATE TRIGGER building_assignment_approval BEFORE UPDATE OF status ON building_manager_assignments WHEN NEW.status='approved' BEGIN
 SELECT RAISE(ABORT,'BUILDING_ASSIGNMENT_REVIEW_REQUIRED') WHERE OLD.status!='pending' OR NEW.approved_by=NEW.requested_by OR NEW.approved_by=NEW.user_id OR NOT EXISTS(SELECT 1 FROM staff_profiles s JOIN users u ON u.id=s.user_id WHERE s.user_id=NEW.approved_by AND s.role IN('administrator','operations_manager') AND s.active=1 AND u.active=1 AND u.verified_at IS NOT NULL);
 SELECT RAISE(ABORT,'BUILDING_ASSIGNMENT_OVERLAP') WHERE EXISTS(SELECT 1 FROM building_manager_assignments a WHERE a.id!=NEW.id AND a.building_id=NEW.building_id AND a.user_id=NEW.user_id AND a.status='approved' AND a.starts_at<NEW.ends_at AND a.ends_at>NEW.starts_at);
END;
CREATE TRIGGER building_assignment_no_delete BEFORE DELETE ON building_manager_assignments BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TABLE building_asset_links (
 asset_id TEXT PRIMARY KEY REFERENCES v2_assets(id), building_id TEXT NOT NULL REFERENCES scheme_buildings(id),
 linked_by TEXT NOT NULL REFERENCES users(id), authority_reference TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER building_asset_scope BEFORE INSERT ON building_asset_links BEGIN
 SELECT RAISE(ABORT,'BUILDING_ASSET_SCOPE') WHERE NOT EXISTS(SELECT 1 FROM v2_assets a JOIN scheme_buildings b ON b.id=NEW.building_id WHERE a.id=NEW.asset_id AND a.status='active' AND ((a.scheme_id=b.scheme_id AND a.property_id IS NULL) OR (a.property_id=b.property_id AND a.scheme_id IS NULL)));
END;
CREATE TRIGGER building_asset_immutable BEFORE UPDATE ON building_asset_links BEGIN SELECT RAISE(ABORT,'BUILDING_ASSET_IMMUTABLE'); END;
CREATE TABLE building_operational_items (
 id TEXT PRIMARY KEY, building_id TEXT NOT NULL REFERENCES scheme_buildings(id), asset_id TEXT REFERENCES v2_assets(id),
 kind TEXT NOT NULL CHECK(kind IN('maintenance','incident','daily_log','inspection','contractor_visit')),
 title TEXT NOT NULL, details_envelope TEXT NOT NULL CHECK(json_valid(details_envelope)),
 priority TEXT NOT NULL DEFAULT 'routine' CHECK(priority IN('routine','urgent','emergency')),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','triaged','in_progress','awaiting_review','completed','cancelled')),
 requester_id TEXT NOT NULL REFERENCES users(id), last_action_by TEXT NOT NULL REFERENCES users(id),
 request_id TEXT UNIQUE REFERENCES requests(id), work_order_id TEXT UNIQUE REFERENCES work_orders(id),
 public_visible INTEGER NOT NULL DEFAULT 0 CHECK(public_visible IN(0,1)), public_summary TEXT NOT NULL DEFAULT '',
 completion_reference TEXT, completed_by TEXT REFERENCES users(id), completed_at TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK(public_visible=0 OR length(public_summary)>=4),
 CHECK(status!='completed' OR (completed_by IS NOT NULL AND completed_by!=requester_id AND completed_at IS NOT NULL AND length(completion_reference)>=8))
) STRICT;
CREATE INDEX building_item_state ON building_operational_items(building_id,status,updated_at);
CREATE TRIGGER building_item_asset BEFORE INSERT ON building_operational_items WHEN NEW.asset_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'BUILDING_ASSET_SCOPE') WHERE NOT EXISTS(SELECT 1 FROM building_asset_links WHERE asset_id=NEW.asset_id AND building_id=NEW.building_id);
END;
CREATE TRIGGER building_item_identity BEFORE UPDATE OF building_id,asset_id,requester_id,kind,details_envelope,created_at ON building_operational_items BEGIN SELECT RAISE(ABORT,'BUILDING_ITEM_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER building_item_completion BEFORE UPDATE OF status ON building_operational_items WHEN NEW.status='completed' BEGIN
 SELECT RAISE(ABORT,'BUILDING_COMPLETION_REVIEW') WHERE OLD.status!='awaiting_review' OR NEW.completed_by=OLD.last_action_by OR NEW.completed_by=OLD.requester_id;
 SELECT RAISE(ABORT,'BUILDING_CANONICAL_WORK_INCOMPLETE') WHERE NEW.work_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_orders w JOIN scheme_buildings b ON b.id=NEW.building_id WHERE w.id=NEW.work_order_id AND w.status='completed' AND w.scheme_id=b.scheme_id);
END;
CREATE TRIGGER building_item_work_scope BEFORE UPDATE OF work_order_id ON building_operational_items WHEN NEW.work_order_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'BUILDING_WORK_SCOPE') WHERE NOT EXISTS(SELECT 1 FROM work_orders w JOIN scheme_buildings b ON b.id=NEW.building_id WHERE w.id=NEW.work_order_id AND w.scheme_id=b.scheme_id AND w.request_id=NEW.request_id AND w.property_id IS b.property_id);
END;
CREATE TABLE building_operational_events (
 id TEXT PRIMARY KEY, building_id TEXT NOT NULL REFERENCES scheme_buildings(id), entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 action TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), reference TEXT, created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER building_event_no_update BEFORE UPDATE ON building_operational_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER building_event_no_delete BEFORE DELETE ON building_operational_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TABLE building_plan_requests (
 plan_id TEXT NOT NULL REFERENCES v2_preventive_plans(id), due_on TEXT NOT NULL,
 item_id TEXT NOT NULL UNIQUE REFERENCES building_operational_items(id), created_at TEXT NOT NULL,
 PRIMARY KEY(plan_id,due_on)
) STRICT;
CREATE TABLE building_move_requests (
 id TEXT PRIMARY KEY, building_id TEXT NOT NULL REFERENCES scheme_buildings(id), lot_id TEXT NOT NULL REFERENCES strata_lots(id),
 requester_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN('move_in','move_out','delivery')),
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL CHECK(ends_at>starts_at),
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN('requested','approved','declined','cancelled','completed')),
 reviewed_by TEXT REFERENCES users(id), reference TEXT, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER building_move_lot BEFORE INSERT ON building_move_requests BEGIN
 SELECT RAISE(ABORT,'BUILDING_MOVE_SCOPE') WHERE NOT EXISTS(SELECT 1 FROM strata_lots l JOIN scheme_memberships m ON m.lot_id=l.id WHERE l.id=NEW.lot_id AND l.building_id=NEW.building_id AND m.user_id=NEW.requester_id AND m.role IN('owner','resident') AND m.starts_at<=NEW.created_at AND (m.ends_at IS NULL OR m.ends_at>NEW.created_at));
END;
CREATE TRIGGER building_move_identity BEFORE UPDATE OF building_id,lot_id,requester_id,kind,starts_at,ends_at ON building_move_requests BEGIN SELECT RAISE(ABORT,'BUILDING_MOVE_IMMUTABLE'); END;
CREATE TABLE building_access_devices (
 id TEXT PRIMARY KEY, building_id TEXT NOT NULL REFERENCES scheme_buildings(id), label TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('key','fob','remote','other')),
 status TEXT NOT NULL DEFAULT 'available' CHECK(status IN('available','issued','lost','retired')),
 holder_id TEXT REFERENCES users(id), issued_at TEXT, acknowledged_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(building_id,label), CHECK(status!='issued' OR (holder_id IS NOT NULL AND issued_at IS NOT NULL))
) STRICT;
CREATE TABLE building_report_grants (
 building_id TEXT NOT NULL REFERENCES scheme_buildings(id), document_id TEXT NOT NULL REFERENCES documents(id),
 granted_by TEXT NOT NULL REFERENCES users(id), reference TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT,
 PRIMARY KEY(building_id,document_id)
) STRICT;
CREATE TRIGGER building_report_scope BEFORE INSERT ON building_report_grants BEGIN
 SELECT RAISE(ABORT,'BUILDING_REPORT_SCOPE') WHERE NOT EXISTS(SELECT 1 FROM documents d JOIN scheme_buildings b ON b.id=NEW.building_id WHERE d.id=NEW.document_id AND d.status='issued' AND d.tenancy_id IS NULL AND d.category IN('service_report','building_report','common_property_report') AND (d.property_id=b.property_id OR (d.property_id IS NULL AND d.scheme_id=b.scheme_id)));
END;
