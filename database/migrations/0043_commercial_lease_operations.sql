CREATE TABLE commercial_lease_register (
 id TEXT PRIMARY KEY,property_id TEXT NOT NULL REFERENCES properties(id),client_id TEXT NOT NULL REFERENCES clients(id),
 reference TEXT NOT NULL,occupier_name TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL CHECK(ends_at>starts_at),
 details_envelope TEXT NOT NULL,source_document_id TEXT REFERENCES documents(id),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','ended')),version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(client_id,property_id,reference)
) STRICT;
CREATE TRIGGER commercial_lease_scope BEFORE INSERT ON commercial_lease_register BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM properties p JOIN client_property_links l ON l.property_id=p.id AND l.client_id=NEW.client_id AND l.starts_at<=NEW.created_at AND (l.ends_at IS NULL OR l.ends_at>NEW.created_at) WHERE p.id=NEW.property_id AND p.sector='commercial') THEN RAISE(ABORT,'COMMERCIAL_LEASE_SCOPE') END; END;
CREATE TRIGGER commercial_lease_immutable BEFORE UPDATE ON commercial_lease_register WHEN NEW.property_id!=OLD.property_id OR NEW.client_id!=OLD.client_id OR NEW.reference!=OLD.reference OR NEW.starts_at!=OLD.starts_at OR NEW.ends_at!=OLD.ends_at OR NEW.details_envelope!=OLD.details_envelope OR NEW.source_document_id IS NOT OLD.source_document_id BEGIN SELECT RAISE(ABORT,'LEASE_SOURCE_IMMUTABLE'); END;
CREATE TABLE commercial_lease_tasks (
 id TEXT PRIMARY KEY,lease_id TEXT NOT NULL REFERENCES commercial_lease_register(id),
 kind TEXT NOT NULL CHECK(kind IN('option_date','rent_review','insurance','compliance','make_good','handover','other')),
 title TEXT NOT NULL,due_at TEXT NOT NULL,details_envelope TEXT NOT NULL,work_order_id TEXT REFERENCES work_orders(id),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','in_progress','review_required','completed','cancelled')),
 version INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 reviewed_by TEXT REFERENCES users(id),reviewed_at TEXT,completion_reference TEXT,completion_document_id TEXT REFERENCES documents(id)
) STRICT;
CREATE TRIGGER commercial_task_source_immutable BEFORE UPDATE ON commercial_lease_tasks WHEN NEW.lease_id!=OLD.lease_id OR NEW.kind!=OLD.kind OR NEW.title!=OLD.title OR NEW.due_at!=OLD.due_at OR NEW.details_envelope!=OLD.details_envelope OR NEW.work_order_id IS NOT OLD.work_order_id OR NEW.created_by!=OLD.created_by BEGIN SELECT RAISE(ABORT,'LEASE_TASK_IMMUTABLE'); END;
CREATE TRIGGER commercial_task_completion BEFORE UPDATE ON commercial_lease_tasks WHEN NEW.status='completed' AND OLD.status!='completed' BEGIN
 SELECT CASE WHEN NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL OR length(COALESCE(NEW.completion_reference,''))<8 OR NEW.completion_document_id IS NULL THEN RAISE(ABORT,'COMMERCIAL_COMPLETION_EVIDENCE') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.completion_document_id AND d.status='issued') THEN RAISE(ABORT,'COMMERCIAL_DOCUMENT_SCOPE') END;
 SELECT CASE WHEN NEW.work_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_orders w JOIN commercial_lease_register l ON l.property_id=w.property_id AND l.client_id=w.client_id WHERE l.id=NEW.lease_id AND w.id=NEW.work_order_id AND w.status='completed') THEN RAISE(ABORT,'COMMERCIAL_WORK_UNFINISHED') END;
END;
CREATE TABLE commercial_lease_events (
 id TEXT PRIMARY KEY,lease_id TEXT NOT NULL REFERENCES commercial_lease_register(id),task_id TEXT REFERENCES commercial_lease_tasks(id),
 actor_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,reference TEXT NOT NULL,created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER commercial_events_no_update BEFORE UPDATE ON commercial_lease_events BEGIN SELECT RAISE(ABORT,'LEASE_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER commercial_events_no_delete BEFORE DELETE ON commercial_lease_events BEGIN SELECT RAISE(ABORT,'LEASE_AUDIT_IMMUTABLE'); END;
