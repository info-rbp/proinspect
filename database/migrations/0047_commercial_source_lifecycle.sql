-- Handbook O05-O08. Additive records; deployed lease/task sources remain untouched.
CREATE TABLE commercial_lease_revisions (
 id TEXT PRIMARY KEY, lease_id TEXT NOT NULL REFERENCES commercial_lease_register(id),
 base_version INTEGER NOT NULL CHECK(base_version>0), previous_revision_id TEXT REFERENCES commercial_lease_revisions(id),
 kind TEXT NOT NULL CHECK(kind IN('commencement','variation','renewal','expiry')),
 effective_at TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL CHECK(ends_at>starts_at),
 option_opens_at TEXT, option_closes_at TEXT,
 source_document_id TEXT NOT NULL REFERENCES documents(id), source_reference TEXT NOT NULL CHECK(length(source_reference)>=8),
 terms_envelope TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, review_reference TEXT,
 CHECK((option_opens_at IS NULL AND option_closes_at IS NULL) OR
       (option_opens_at IS NOT NULL AND option_closes_at IS NOT NULL AND option_opens_at<option_closes_at AND option_closes_at<=ends_at))
) STRICT;
CREATE INDEX commercial_revision_history ON commercial_lease_revisions(lease_id,base_version DESC);
CREATE UNIQUE INDEX commercial_revision_one_approved_base ON commercial_lease_revisions(lease_id,base_version) WHERE status='approved';
CREATE TABLE commercial_charge_rules (
 id TEXT PRIMARY KEY, lease_id TEXT NOT NULL REFERENCES commercial_lease_register(id),
 revision_id TEXT NOT NULL REFERENCES commercial_lease_revisions(id),
 source_document_id TEXT NOT NULL REFERENCES documents(id), source_reference TEXT NOT NULL CHECK(length(source_reference)>=8),
 rule_json TEXT NOT NULL CHECK(json_valid(rule_json)), rule_sha256 TEXT NOT NULL CHECK(length(rule_sha256)=64),
 details_envelope TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, review_reference TEXT
) STRICT;
CREATE INDEX commercial_rules_history ON commercial_charge_rules(lease_id,created_at);
CREATE TABLE commercial_lease_charges (
 id TEXT PRIMARY KEY, lease_id TEXT NOT NULL REFERENCES commercial_lease_register(id),
 rule_id TEXT NOT NULL REFERENCES commercial_charge_rules(id), adjusts_charge_id TEXT REFERENCES commercial_lease_charges(id),
 source_document_id TEXT NOT NULL REFERENCES documents(id), source_reference TEXT NOT NULL CHECK(length(source_reference)>=8),
 calculation_json TEXT NOT NULL CHECK(json_valid(calculation_json)), calculation_sha256 TEXT NOT NULL CHECK(length(calculation_sha256)=64),
 subtotal_cents INTEGER NOT NULL, gst_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL CHECK(total_cents=subtotal_cents+gst_cents AND abs(total_cents)<=1000000000000),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, review_reference TEXT,
 CHECK(adjusts_charge_id IS NOT NULL OR (subtotal_cents>=0 AND gst_cents>=0 AND total_cents>=0))
) STRICT;
CREATE INDEX commercial_charge_history ON commercial_lease_charges(lease_id,created_at);
CREATE TABLE commercial_obligation_reviews (
 id TEXT PRIMARY KEY, lease_id TEXT NOT NULL REFERENCES commercial_lease_register(id), task_id TEXT NOT NULL REFERENCES commercial_lease_tasks(id),
 task_version INTEGER NOT NULL CHECK(task_version>0),
 kind TEXT NOT NULL CHECK(kind IN('assessment','completion','cancellation','reopening')),
 source_document_id TEXT NOT NULL REFERENCES documents(id), source_reference TEXT NOT NULL CHECK(length(source_reference)>=8),
 condition_document_id TEXT REFERENCES documents(id), work_order_id TEXT REFERENCES work_orders(id),
 responsibility TEXT NOT NULL CHECK(responsibility IN('lessor','occupier','shared','undetermined')),
 details_envelope TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, review_reference TEXT
) STRICT;
CREATE INDEX commercial_obligation_history ON commercial_obligation_reviews(lease_id,task_id,created_at);
CREATE TABLE commercial_task_successors (
 predecessor_id TEXT PRIMARY KEY REFERENCES commercial_lease_tasks(id), successor_id TEXT NOT NULL UNIQUE REFERENCES commercial_lease_tasks(id),
 review_id TEXT NOT NULL UNIQUE REFERENCES commercial_obligation_reviews(id), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE commercial_lease_exceptions (
 id TEXT PRIMARY KEY, lease_id TEXT NOT NULL REFERENCES commercial_lease_register(id),
 kind TEXT NOT NULL CHECK(kind IN('missed_option','overlapping_options','missing_document','changed_terms','disputed_charge','disputed_task','other')),
 charge_id TEXT REFERENCES commercial_lease_charges(id), task_id TEXT REFERENCES commercial_lease_tasks(id),
 source_reference TEXT NOT NULL CHECK(length(source_reference)>=8), details_envelope TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 resolved_by TEXT REFERENCES users(id), resolved_at TEXT, resolution_reference TEXT, resolution_document_id TEXT REFERENCES documents(id)
) STRICT;
CREATE INDEX commercial_exception_queue ON commercial_lease_exceptions(lease_id,status);
CREATE TRIGGER commercial_lease_revisions_insert BEFORE INSERT ON commercial_lease_revisions BEGIN
 SELECT CASE WHEN NEW.status!='pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reference IS NOT NULL THEN RAISE(ABORT,'COMMERCIAL_REVIEW_REQUIRED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued') THEN RAISE(ABORT,'COMMERCIAL_SOURCE_SCOPE') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commercial_lease_register WHERE id=NEW.lease_id AND version=NEW.base_version) THEN RAISE(ABORT,'REVISION_STALE') END;
 SELECT CASE WHEN NEW.previous_revision_id IS NOT (SELECT id FROM commercial_lease_revisions WHERE lease_id=NEW.lease_id AND status='approved' ORDER BY base_version DESC LIMIT 1) THEN RAISE(ABORT,'REVISION_HEAD_CHANGED') END;
END;
CREATE TRIGGER commercial_lease_revisions_immutable BEFORE UPDATE ON commercial_lease_revisions WHEN OLD.status!='pending' OR NEW.id IS NOT OLD.id OR NEW.lease_id IS NOT OLD.lease_id OR NEW.base_version IS NOT OLD.base_version OR NEW.previous_revision_id IS NOT OLD.previous_revision_id OR NEW.kind IS NOT OLD.kind OR NEW.effective_at IS NOT OLD.effective_at OR NEW.starts_at IS NOT OLD.starts_at OR NEW.ends_at IS NOT OLD.ends_at OR NEW.option_opens_at IS NOT OLD.option_opens_at OR NEW.option_closes_at IS NOT OLD.option_closes_at OR NEW.source_document_id IS NOT OLD.source_document_id OR NEW.source_reference IS NOT OLD.source_reference OR NEW.terms_envelope IS NOT OLD.terms_envelope OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'COMMERCIAL_SOURCE_IMMUTABLE'); END;
CREATE TRIGGER commercial_lease_revisions_review BEFORE UPDATE ON commercial_lease_revisions BEGIN
 SELECT CASE WHEN NEW.status NOT IN('approved','rejected') OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL OR length(COALESCE(NEW.review_reference,''))<8 OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=NEW.reviewed_by AND u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager')) THEN RAISE(ABORT,'COMMERCIAL_INDEPENDENT_REVIEW') END;
 SELECT CASE WHEN NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued') THEN RAISE(ABORT,'COMMERCIAL_SOURCE_REVOKED') END;
 SELECT CASE WHEN NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM commercial_lease_register WHERE id=NEW.lease_id AND version=NEW.base_version) THEN RAISE(ABORT,'REVISION_STALE') END;
 SELECT CASE WHEN NEW.status='approved' AND NEW.previous_revision_id IS NOT (SELECT id FROM commercial_lease_revisions WHERE lease_id=NEW.lease_id AND status='approved' ORDER BY base_version DESC LIMIT 1) THEN RAISE(ABORT,'REVISION_HEAD_CHANGED') END;
END;
CREATE TRIGGER commercial_lease_revisions_no_delete BEFORE DELETE ON commercial_lease_revisions BEGIN SELECT RAISE(ABORT,'COMMERCIAL_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER commercial_charge_rules_insert BEFORE INSERT ON commercial_charge_rules BEGIN
 SELECT CASE WHEN NEW.status!='pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reference IS NOT NULL THEN RAISE(ABORT,'COMMERCIAL_REVIEW_REQUIRED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued') THEN RAISE(ABORT,'COMMERCIAL_SOURCE_SCOPE') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commercial_lease_revisions WHERE id=NEW.revision_id AND lease_id=NEW.lease_id AND status='approved' AND kind!='expiry') THEN RAISE(ABORT,'RULE_REVISION_SCOPE') END;
END;
CREATE TRIGGER commercial_charge_rules_immutable BEFORE UPDATE ON commercial_charge_rules WHEN OLD.status!='pending' OR NEW.id IS NOT OLD.id OR NEW.lease_id IS NOT OLD.lease_id OR NEW.revision_id IS NOT OLD.revision_id OR NEW.source_document_id IS NOT OLD.source_document_id OR NEW.source_reference IS NOT OLD.source_reference OR NEW.rule_json IS NOT OLD.rule_json OR NEW.rule_sha256 IS NOT OLD.rule_sha256 OR NEW.details_envelope IS NOT OLD.details_envelope OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'COMMERCIAL_SOURCE_IMMUTABLE'); END;
CREATE TRIGGER commercial_charge_rules_review BEFORE UPDATE ON commercial_charge_rules BEGIN
 SELECT CASE WHEN NEW.status NOT IN('approved','rejected') OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL OR length(COALESCE(NEW.review_reference,''))<8 OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=NEW.reviewed_by AND u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager')) THEN RAISE(ABORT,'COMMERCIAL_INDEPENDENT_REVIEW') END;
 SELECT CASE WHEN NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued') THEN RAISE(ABORT,'COMMERCIAL_SOURCE_REVOKED') END;
END;
CREATE TRIGGER commercial_charge_rules_no_delete BEFORE DELETE ON commercial_charge_rules BEGIN SELECT RAISE(ABORT,'COMMERCIAL_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER commercial_lease_charges_insert BEFORE INSERT ON commercial_lease_charges BEGIN
 SELECT CASE WHEN NEW.status!='pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reference IS NOT NULL THEN RAISE(ABORT,'COMMERCIAL_REVIEW_REQUIRED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued') THEN RAISE(ABORT,'COMMERCIAL_SOURCE_SCOPE') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commercial_charge_rules WHERE id=NEW.rule_id AND lease_id=NEW.lease_id AND status='approved') THEN RAISE(ABORT,'CHARGE_RULE_SCOPE') END;
 SELECT CASE WHEN NEW.adjusts_charge_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_lease_charges WHERE id=NEW.adjusts_charge_id AND lease_id=NEW.lease_id AND status='approved' AND adjusts_charge_id IS NULL) THEN RAISE(ABORT,'CHARGE_ADJUSTMENT_SCOPE') END;
 SELECT CASE WHEN json_extract(NEW.calculation_json,'$.subtotalCents') IS NOT NEW.subtotal_cents OR json_extract(NEW.calculation_json,'$.gstCents') IS NOT NEW.gst_cents OR json_extract(NEW.calculation_json,'$.totalCents') IS NOT NEW.total_cents THEN RAISE(ABORT,'CHARGE_CALCULATION_MISMATCH') END;
END;
CREATE TRIGGER commercial_lease_charges_immutable BEFORE UPDATE ON commercial_lease_charges WHEN OLD.status!='pending' OR NEW.id IS NOT OLD.id OR NEW.lease_id IS NOT OLD.lease_id OR NEW.rule_id IS NOT OLD.rule_id OR NEW.adjusts_charge_id IS NOT OLD.adjusts_charge_id OR NEW.source_document_id IS NOT OLD.source_document_id OR NEW.source_reference IS NOT OLD.source_reference OR NEW.calculation_json IS NOT OLD.calculation_json OR NEW.calculation_sha256 IS NOT OLD.calculation_sha256 OR NEW.subtotal_cents IS NOT OLD.subtotal_cents OR NEW.gst_cents IS NOT OLD.gst_cents OR NEW.total_cents IS NOT OLD.total_cents OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'COMMERCIAL_SOURCE_IMMUTABLE'); END;
CREATE TRIGGER commercial_lease_charges_review BEFORE UPDATE ON commercial_lease_charges BEGIN
 SELECT CASE WHEN NEW.status NOT IN('approved','rejected') OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL OR length(COALESCE(NEW.review_reference,''))<8 OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=NEW.reviewed_by AND u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager')) THEN RAISE(ABORT,'COMMERCIAL_INDEPENDENT_REVIEW') END;
 SELECT CASE WHEN NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued') THEN RAISE(ABORT,'COMMERCIAL_SOURCE_REVOKED') END;
 SELECT CASE WHEN NEW.status='approved' AND NEW.adjusts_charge_id IS NOT NULL AND NEW.subtotal_cents+COALESCE((SELECT subtotal_cents FROM commercial_lease_charges WHERE id=NEW.adjusts_charge_id),0)+COALESCE((SELECT sum(subtotal_cents) FROM commercial_lease_charges WHERE adjusts_charge_id=NEW.adjusts_charge_id AND status='approved'),0)<0 THEN RAISE(ABORT,'CHARGE_OVER_CREDIT') END;
 SELECT CASE WHEN NEW.status='approved' AND NEW.adjusts_charge_id IS NOT NULL AND NEW.gst_cents+COALESCE((SELECT gst_cents FROM commercial_lease_charges WHERE id=NEW.adjusts_charge_id),0)+COALESCE((SELECT sum(gst_cents) FROM commercial_lease_charges WHERE adjusts_charge_id=NEW.adjusts_charge_id AND status='approved'),0)<0 THEN RAISE(ABORT,'CHARGE_OVER_CREDIT') END;
 SELECT CASE WHEN NEW.status='approved' AND NEW.adjusts_charge_id IS NOT NULL AND NEW.total_cents+COALESCE((SELECT total_cents FROM commercial_lease_charges WHERE id=NEW.adjusts_charge_id),0)+COALESCE((SELECT sum(total_cents) FROM commercial_lease_charges WHERE adjusts_charge_id=NEW.adjusts_charge_id AND status='approved'),0)<0 THEN RAISE(ABORT,'CHARGE_OVER_CREDIT') END;
 SELECT CASE WHEN NEW.status='approved' AND EXISTS(SELECT 1 FROM commercial_lease_exceptions WHERE lease_id=NEW.lease_id AND status='open' AND kind='disputed_charge' AND charge_id IN(NEW.id,NEW.adjusts_charge_id)) THEN RAISE(ABORT,'CHARGE_DISPUTED') END;
END;
CREATE TRIGGER commercial_lease_charges_no_delete BEFORE DELETE ON commercial_lease_charges BEGIN SELECT RAISE(ABORT,'COMMERCIAL_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER commercial_obligation_reviews_insert BEFORE INSERT ON commercial_obligation_reviews BEGIN
 SELECT CASE WHEN NEW.status!='pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reference IS NOT NULL THEN RAISE(ABORT,'COMMERCIAL_REVIEW_REQUIRED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued') THEN RAISE(ABORT,'COMMERCIAL_SOURCE_SCOPE') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commercial_lease_tasks WHERE id=NEW.task_id AND lease_id=NEW.lease_id AND version=NEW.task_version) THEN RAISE(ABORT,'OBLIGATION_STALE') END;
 SELECT CASE WHEN NEW.condition_document_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.condition_document_id AND d.status='issued') THEN RAISE(ABORT,'CONDITION_DOCUMENT_SCOPE') END;
 SELECT CASE WHEN NEW.work_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_orders w JOIN commercial_lease_register l ON l.id=NEW.lease_id AND l.property_id=w.property_id AND l.client_id=w.client_id WHERE w.id=NEW.work_order_id) THEN RAISE(ABORT,'OBLIGATION_WORK_SCOPE') END;
END;
CREATE TRIGGER commercial_obligation_reviews_immutable BEFORE UPDATE ON commercial_obligation_reviews WHEN OLD.status!='pending' OR NEW.id IS NOT OLD.id OR NEW.lease_id IS NOT OLD.lease_id OR NEW.task_id IS NOT OLD.task_id OR NEW.task_version IS NOT OLD.task_version OR NEW.kind IS NOT OLD.kind OR NEW.source_document_id IS NOT OLD.source_document_id OR NEW.source_reference IS NOT OLD.source_reference OR NEW.condition_document_id IS NOT OLD.condition_document_id OR NEW.work_order_id IS NOT OLD.work_order_id OR NEW.responsibility IS NOT OLD.responsibility OR NEW.details_envelope IS NOT OLD.details_envelope OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'COMMERCIAL_SOURCE_IMMUTABLE'); END;
CREATE TRIGGER commercial_obligation_reviews_review BEFORE UPDATE ON commercial_obligation_reviews BEGIN
 SELECT CASE WHEN NEW.status NOT IN('approved','rejected') OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL OR length(COALESCE(NEW.review_reference,''))<8 OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=NEW.reviewed_by AND u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager')) THEN RAISE(ABORT,'COMMERCIAL_INDEPENDENT_REVIEW') END;
 SELECT CASE WHEN NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued') THEN RAISE(ABORT,'COMMERCIAL_SOURCE_REVOKED') END;
 SELECT CASE WHEN NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM commercial_lease_tasks WHERE id=NEW.task_id AND lease_id=NEW.lease_id AND version=NEW.task_version) THEN RAISE(ABORT,'OBLIGATION_STALE') END;
 SELECT CASE WHEN NEW.status='approved' AND NEW.condition_document_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.condition_document_id AND d.status='issued') THEN RAISE(ABORT,'CONDITION_DOCUMENT_REVOKED') END;
END;
CREATE TRIGGER commercial_obligation_reviews_no_delete BEFORE DELETE ON commercial_obligation_reviews BEGIN SELECT RAISE(ABORT,'COMMERCIAL_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER commercial_revision_advance AFTER UPDATE ON commercial_lease_revisions WHEN NEW.status='approved' BEGIN
 UPDATE commercial_lease_register SET version=version+1,updated_at=NEW.reviewed_at WHERE id=NEW.lease_id AND version=NEW.base_version;
END;
CREATE TRIGGER commercial_exception_insert BEFORE INSERT ON commercial_lease_exceptions BEGIN
 SELECT CASE WHEN NEW.status!='open' OR NEW.resolved_by IS NOT NULL OR NEW.resolved_at IS NOT NULL OR NEW.resolution_reference IS NOT NULL OR NEW.resolution_document_id IS NOT NULL THEN RAISE(ABORT,'EXCEPTION_REVIEW_REQUIRED') END;
 SELECT CASE WHEN NEW.charge_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_lease_charges WHERE id=NEW.charge_id AND lease_id=NEW.lease_id) THEN RAISE(ABORT,'EXCEPTION_CHARGE_SCOPE') END;
 SELECT CASE WHEN NEW.task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_lease_tasks WHERE id=NEW.task_id AND lease_id=NEW.lease_id) THEN RAISE(ABORT,'EXCEPTION_TASK_SCOPE') END;
END;
CREATE TRIGGER commercial_exception_immutable BEFORE UPDATE ON commercial_lease_exceptions WHEN OLD.status!='open' OR NEW.id IS NOT OLD.id OR NEW.lease_id IS NOT OLD.lease_id OR NEW.kind IS NOT OLD.kind OR NEW.charge_id IS NOT OLD.charge_id OR NEW.task_id IS NOT OLD.task_id OR NEW.source_reference IS NOT OLD.source_reference OR NEW.details_envelope IS NOT OLD.details_envelope OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'EXCEPTION_SOURCE_IMMUTABLE'); END;
CREATE TRIGGER commercial_exception_resolve BEFORE UPDATE ON commercial_lease_exceptions BEGIN
 SELECT CASE WHEN NEW.status!='resolved' OR NEW.resolved_by IS NULL OR NEW.resolved_by=OLD.created_by OR NEW.resolved_at IS NULL OR length(COALESCE(NEW.resolution_reference,''))<8 OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=NEW.resolved_by AND u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager')) THEN RAISE(ABORT,'EXCEPTION_INDEPENDENT_REVIEW') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.resolution_document_id AND d.status='issued') THEN RAISE(ABORT,'EXCEPTION_RESOLUTION_SCOPE') END;
END;
CREATE TRIGGER commercial_exception_no_delete BEFORE DELETE ON commercial_lease_exceptions BEGIN SELECT RAISE(ABORT,'EXCEPTION_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER commercial_successor_scope BEFORE INSERT ON commercial_task_successors BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commercial_lease_tasks p JOIN commercial_lease_tasks s ON s.lease_id=p.lease_id JOIN commercial_obligation_reviews r ON r.task_id=p.id AND r.lease_id=p.lease_id WHERE p.id=NEW.predecessor_id AND s.id=NEW.successor_id AND p.status IN('completed','cancelled') AND s.status='open' AND r.id=NEW.review_id AND r.status='approved' AND r.kind='reopening') THEN RAISE(ABORT,'TASK_SUCCESSOR_SCOPE') END;
END;
CREATE TRIGGER commercial_successor_no_update BEFORE UPDATE ON commercial_task_successors BEGIN SELECT RAISE(ABORT,'TASK_SUCCESSOR_IMMUTABLE'); END;
CREATE TRIGGER commercial_successor_no_delete BEFORE DELETE ON commercial_task_successors BEGIN SELECT RAISE(ABORT,'TASK_SUCCESSOR_IMMUTABLE'); END;

-- Approving a second adjustment against an old balance must fail, including positive adjustments.
CREATE TRIGGER commercial_adjustment_balance BEFORE UPDATE ON commercial_lease_charges WHEN NEW.status='approved' AND NEW.adjusts_charge_id IS NOT NULL BEGIN
 SELECT CASE WHEN json_extract(NEW.calculation_json,'$.baseBalance.subtotalCents') IS NOT (SELECT c.subtotal_cents+COALESCE((SELECT sum(a.subtotal_cents) FROM commercial_lease_charges a WHERE a.adjusts_charge_id=c.id AND a.status='approved'),0) FROM commercial_lease_charges c WHERE c.id=NEW.adjusts_charge_id) OR
 json_extract(NEW.calculation_json,'$.baseBalance.gstCents') IS NOT (SELECT c.gst_cents+COALESCE((SELECT sum(a.gst_cents) FROM commercial_lease_charges a WHERE a.adjusts_charge_id=c.id AND a.status='approved'),0) FROM commercial_lease_charges c WHERE c.id=NEW.adjusts_charge_id) OR
 json_extract(NEW.calculation_json,'$.baseBalance.totalCents') IS NOT (SELECT c.total_cents+COALESCE((SELECT sum(a.total_cents) FROM commercial_lease_charges a WHERE a.adjusts_charge_id=c.id AND a.status='approved'),0) FROM commercial_lease_charges c WHERE c.id=NEW.adjusts_charge_id)
 THEN RAISE(ABORT,'CHARGE_BALANCE_CHANGED') END;
END;
CREATE TRIGGER commercial_charge_overlap BEFORE INSERT ON commercial_lease_charges WHEN NEW.adjusts_charge_id IS NULL BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM commercial_lease_charges c JOIN commercial_charge_rules a ON a.id=c.rule_id JOIN commercial_charge_rules b ON b.id=NEW.rule_id
 WHERE c.lease_id=NEW.lease_id AND c.adjusts_charge_id IS NULL AND c.status!='rejected'
 AND json_extract(a.rule_json,'$.obligationKey')=json_extract(b.rule_json,'$.obligationKey')
 AND json_extract(a.rule_json,'$.category')=json_extract(b.rule_json,'$.category')
 AND json_extract(c.calculation_json,'$.periodFrom')<json_extract(NEW.calculation_json,'$.periodTo')
 AND json_extract(c.calculation_json,'$.periodTo')>json_extract(NEW.calculation_json,'$.periodFrom')
 AND (c.status='pending' OR c.total_cents+COALESCE((SELECT sum(total_cents) FROM commercial_lease_charges WHERE adjusts_charge_id=c.id AND status='approved'),0)>0))
 THEN RAISE(ABORT,'CHARGE_PERIOD_OVERLAP') END;
END;
CREATE TRIGGER commercial_revision_sequence BEFORE INSERT ON commercial_lease_revisions BEGIN
 SELECT CASE WHEN (NEW.previous_revision_id IS NULL AND NEW.kind!='commencement') OR (NEW.previous_revision_id IS NOT NULL AND NEW.kind='commencement') THEN RAISE(ABORT,'REVISION_SEQUENCE') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM commercial_lease_revisions p WHERE p.id=NEW.previous_revision_id AND (NEW.effective_at<p.effective_at OR
 (NEW.kind='renewal' AND NEW.starts_at<p.ends_at) OR
 (NEW.kind IN('variation','expiry') AND (p.kind='expiry' OR NEW.starts_at!=p.starts_at)) OR
 (NEW.kind='expiry' AND (NEW.ends_at!=p.ends_at OR NEW.effective_at<p.ends_at)))) THEN RAISE(ABORT,'REVISION_SEQUENCE') END;
END;
CREATE TABLE commercial_exception_assignments (
 id TEXT PRIMARY KEY, exception_id TEXT NOT NULL REFERENCES commercial_lease_exceptions(id),
 owner_id TEXT NOT NULL REFERENCES users(id), priority TEXT NOT NULL CHECK(priority IN('routine','high','urgent')),
 actor_id TEXT NOT NULL REFERENCES users(id), reference TEXT NOT NULL CHECK(length(reference)>=8), created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER commercial_exception_owner BEFORE INSERT ON commercial_exception_assignments BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commercial_lease_exceptions WHERE id=NEW.exception_id AND status='open') OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=NEW.owner_id AND u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager')) THEN RAISE(ABORT,'EXCEPTION_OWNER_INVALID') END;
END;
CREATE TRIGGER commercial_assignment_no_update BEFORE UPDATE ON commercial_exception_assignments BEGIN SELECT RAISE(ABORT,'EXCEPTION_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER commercial_assignment_no_delete BEFORE DELETE ON commercial_exception_assignments BEGIN SELECT RAISE(ABORT,'EXCEPTION_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER commercial_closed_task_immutable BEFORE UPDATE ON commercial_lease_tasks WHEN OLD.status IN('completed','cancelled') BEGIN SELECT RAISE(ABORT,'CLOSED_TASK_IMMUTABLE'); END;
CREATE TRIGGER commercial_task_no_delete BEFORE DELETE ON commercial_lease_tasks BEGIN SELECT RAISE(ABORT,'TASK_HISTORY_IMMUTABLE'); END;
-- A material task state cannot bypass its independent source-backed case.
CREATE TRIGGER commercial_task_reviewed_closure BEFORE UPDATE ON commercial_lease_tasks WHEN NEW.status IN('completed','cancelled') AND NEW.status!=OLD.status BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commercial_obligation_reviews r WHERE r.task_id=NEW.id AND r.lease_id=NEW.lease_id AND r.task_version=OLD.version AND r.status='approved' AND r.reviewed_by=NEW.reviewed_by AND r.kind=CASE NEW.status WHEN 'completed' THEN 'completion' ELSE 'cancellation' END) THEN RAISE(ABORT,'TASK_REVIEW_REQUIRED') END;
END;
CREATE TRIGGER commercial_obligation_material_review BEFORE UPDATE ON commercial_obligation_reviews WHEN NEW.status='approved' BEGIN
 SELECT CASE WHEN NEW.kind IN('completion','cancellation','reopening') AND NEW.reviewed_by=(SELECT created_by FROM commercial_lease_tasks WHERE id=NEW.task_id) THEN RAISE(ABORT,'TASK_INDEPENDENT_REVIEW') END;
 SELECT CASE WHEN NEW.kind='completion' AND (NEW.condition_document_id IS NULL OR NEW.responsibility='undetermined' OR NOT EXISTS(SELECT 1 FROM commercial_lease_tasks WHERE id=NEW.task_id AND status='review_required') OR (NEW.work_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_orders WHERE id=NEW.work_order_id AND status='completed'))) THEN RAISE(ABORT,'TASK_COMPLETION_INCOMPLETE') END;
END;
CREATE TRIGGER commercial_charge_rule_evidence BEFORE UPDATE ON commercial_lease_charges WHEN NEW.status='approved' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commercial_charge_rules r JOIN commercial_lease_revisions v ON v.id=r.revision_id JOIN commercial_lease_register l ON l.id=NEW.lease_id
 JOIN documents rd ON rd.id=r.source_document_id AND rd.property_id=l.property_id AND rd.status='issued'
 JOIN document_grants rg ON rg.document_id=rd.id AND rg.recipient_kind='client' AND rg.recipient_id=l.client_id
 JOIN documents vd ON vd.id=v.source_document_id AND vd.property_id=l.property_id AND vd.status='issued'
 JOIN document_grants vg ON vg.document_id=vd.id AND vg.recipient_kind='client' AND vg.recipient_id=l.client_id
 WHERE r.id=NEW.rule_id AND r.lease_id=l.id AND r.status='approved' AND v.status='approved') THEN RAISE(ABORT,'CHARGE_RULE_SOURCE_REVOKED') END;
END;
