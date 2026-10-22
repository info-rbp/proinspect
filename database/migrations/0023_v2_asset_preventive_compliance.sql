-- V2 WP3: asset lifecycle, preventive maintenance, compliance tracking.
-- Additive to accepted migrations 0001-0007. Compliance evidence is not legal certification.
CREATE TABLE v2_asset_details(
 asset_id TEXT PRIMARY KEY REFERENCES v2_assets(id),
 asset_code TEXT NOT NULL UNIQUE,
 manufacturer TEXT, model TEXT, serial_number TEXT,
 commissioned_on TEXT, design_life_months INTEGER CHECK(design_life_months BETWEEN 1 AND 1800),
 replacement_cost_cents INTEGER CHECK(replacement_cost_cents>=0),
 criticality TEXT NOT NULL DEFAULT 'normal' CHECK(criticality IN('low','normal','high','critical')),
 lifecycle_status TEXT NOT NULL DEFAULT 'operational' CHECK(lifecycle_status IN('operational','restricted','out_of_service','retired')),
 last_condition_score INTEGER CHECK(last_condition_score BETWEEN 1 AND 5),
 last_condition_at TEXT,
 notes TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX v2_asset_details_critical ON v2_asset_details(criticality,lifecycle_status);
CREATE TRIGGER v2_asset_details_scope BEFORE INSERT ON v2_asset_details
BEGIN
 SELECT RAISE(ABORT,'V2_ASSET_RETIRED') WHERE NOT EXISTS(
 SELECT 1 FROM v2_assets a WHERE a.id=NEW.asset_id AND a.status='active');
END;
CREATE TRIGGER v2_asset_details_identity BEFORE UPDATE OF asset_id,asset_code ON v2_asset_details
BEGIN SELECT RAISE(ABORT,'V2_ASSET_IDENTITY_LOCKED'); END;

CREATE TABLE v2_asset_conditions(
 id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES v2_assets(id),
 score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
 observed_on TEXT NOT NULL, method TEXT NOT NULL CHECK(method IN('visual','functional','professional_report')),
 summary TEXT NOT NULL, evidence_document_id TEXT REFERENCES documents(id),
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','verified','rejected')),
 observed_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 verified_by TEXT REFERENCES users(id), verified_at TEXT, verification_reference TEXT,
 CHECK(status!='verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND LENGTH(verification_reference)>=4))
) STRICT;
CREATE INDEX v2_conditions_asset ON v2_asset_conditions(asset_id,observed_on);
CREATE TRIGGER v2_condition_scope BEFORE INSERT ON v2_asset_conditions
BEGIN
 SELECT RAISE(ABORT,'V2_ASSET_CONDITION_DOCUMENT_SCOPE') WHERE NEW.evidence_document_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_assets a JOIN documents d ON d.id=NEW.evidence_document_id
 WHERE a.id=NEW.asset_id AND d.property_id IS a.property_id AND d.scheme_id IS a.scheme_id AND d.status='issued');
END;
CREATE TRIGGER v2_condition_review_lock BEFORE UPDATE ON v2_asset_conditions
WHEN OLD.status!='submitted' OR NEW.status NOT IN('verified','rejected')
 OR NEW.id!=OLD.id OR NEW.asset_id!=OLD.asset_id OR NEW.score!=OLD.score
 OR NEW.observed_on!=OLD.observed_on OR NEW.method!=OLD.method
 OR NEW.summary!=OLD.summary OR NEW.evidence_document_id IS NOT OLD.evidence_document_id
BEGIN SELECT RAISE(ABORT,'V2_CONDITION_HISTORY_LOCKED'); END;
CREATE TRIGGER v2_condition_no_delete BEFORE DELETE ON v2_asset_conditions
BEGIN SELECT RAISE(ABORT,'V2_CONDITION_HISTORY_LOCKED'); END;
CREATE TRIGGER v2_condition_after_verify AFTER UPDATE OF status ON v2_asset_conditions
WHEN NEW.status='verified'
BEGIN
 UPDATE v2_asset_details SET last_condition_score=NEW.score,last_condition_at=NEW.observed_on,
 updated_by=NEW.verified_by,updated_at=NEW.verified_at,version=version+1
 WHERE asset_id=NEW.asset_id AND (last_condition_at IS NULL OR last_condition_at<=NEW.observed_on);
END;

CREATE TABLE v2_asset_warranties(
 id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES v2_assets(id),
 provider TEXT NOT NULL, warranty_reference TEXT NOT NULL,
 starts_on TEXT, expires_on TEXT NOT NULL,
 evidence_document_id TEXT REFERENCES documents(id),
 verification_reference TEXT NOT NULL,
 reviewed_by TEXT NOT NULL REFERENCES users(id), reviewed_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 CHECK(starts_on IS NULL OR starts_on<expires_on)
) STRICT;
CREATE INDEX v2_warranties_asset ON v2_asset_warranties(asset_id,expires_on);
CREATE TRIGGER v2_warranty_document_scope BEFORE INSERT ON v2_asset_warranties
BEGIN
 SELECT RAISE(ABORT,'V2_WARRANTY_DOCUMENT_SCOPE') WHERE NEW.evidence_document_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_assets a JOIN documents d ON d.id=NEW.evidence_document_id
 WHERE a.id=NEW.asset_id AND d.property_id IS a.property_id AND d.scheme_id IS a.scheme_id AND d.status='issued');
END;
CREATE TRIGGER v2_warranty_immutable_u BEFORE UPDATE ON v2_asset_warranties
BEGIN SELECT RAISE(ABORT,'V2_WARRANTY_HISTORY_LOCKED'); END;
CREATE TRIGGER v2_warranty_immutable_d BEFORE DELETE ON v2_asset_warranties
BEGIN SELECT RAISE(ABORT,'V2_WARRANTY_HISTORY_LOCKED'); END;

CREATE TABLE v2_preventive_plans(
 id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL REFERENCES v2_engagements(id),
 asset_id TEXT NOT NULL REFERENCES v2_assets(id),
 service_code TEXT NOT NULL REFERENCES v2_services(code),
 title TEXT NOT NULL, instructions TEXT NOT NULL,
 cadence_months INTEGER NOT NULL CHECK(cadence_months BETWEEN 1 AND 120),
 lead_days INTEGER NOT NULL DEFAULT 14 CHECK(lead_days BETWEEN 0 AND 180),
 next_due TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','paused','retired')),
 authority_reference TEXT, verified_by TEXT REFERENCES users(id), verified_at TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK(LENGTH(next_due)=10)
) STRICT;
CREATE INDEX v2_pm_due ON v2_preventive_plans(status,next_due);
CREATE INDEX v2_pm_asset ON v2_preventive_plans(asset_id,status);
CREATE TRIGGER v2_preventive_scope BEFORE INSERT ON v2_preventive_plans
BEGIN
 SELECT RAISE(ABORT,'V2_PM_ENGAGEMENT_SCOPE') WHERE NOT EXISTS(
 SELECT 1 FROM v2_assets a JOIN v2_engagements e ON e.id=NEW.engagement_id
 JOIN v2_market_service_rules r ON r.market_code=e.market_code AND r.service_code=NEW.service_code
 JOIN v2_services s ON s.code=NEW.service_code
 WHERE a.id=NEW.asset_id AND a.status='active' AND a.property_id IS e.property_id
 AND a.scheme_id IS e.scheme_id AND e.status='active'
 AND r.status='approved' AND s.status='approved');
END;
CREATE TRIGGER v2_preventive_activate BEFORE UPDATE OF status ON v2_preventive_plans
WHEN NEW.status='active' AND OLD.status!='active'
BEGIN
 SELECT RAISE(ABORT,'V2_PM_AUTHORITY_REQUIRED') WHERE NEW.authority_reference IS NULL
 OR LENGTH(TRIM(NEW.authority_reference))<4 OR NEW.verified_by IS NULL OR NEW.verified_at IS NULL;
 SELECT RAISE(ABORT,'V2_PM_ENGAGEMENT_INACTIVE') WHERE NOT EXISTS(
 SELECT 1 FROM v2_assets a JOIN v2_engagements e ON e.id=NEW.engagement_id
 JOIN v2_market_service_rules r ON r.market_code=e.market_code AND r.service_code=NEW.service_code
 JOIN v2_services s ON s.code=NEW.service_code
 WHERE a.id=NEW.asset_id AND a.status='active' AND a.property_id IS e.property_id
 AND a.scheme_id IS e.scheme_id AND e.status='active' AND r.status='approved' AND s.status='approved');
END;
CREATE TRIGGER v2_preventive_scope_lock BEFORE UPDATE OF engagement_id,asset_id,service_code,cadence_months ON v2_preventive_plans
WHEN OLD.status!='draft'
BEGIN SELECT RAISE(ABORT,'V2_PM_SCOPE_LOCKED'); END;

CREATE TABLE v2_preventive_occurrences(
 id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES v2_preventive_plans(id),
 due_on TEXT NOT NULL, work_order_id TEXT UNIQUE REFERENCES work_orders(id),
 status TEXT NOT NULL CHECK(status IN('issued','skipped')),
 authority_reference TEXT NOT NULL,
 skip_reason TEXT, recorded_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, UNIQUE(plan_id,due_on),
 CHECK((status='issued' AND work_order_id IS NOT NULL AND skip_reason IS NULL) OR
 (status='skipped' AND work_order_id IS NULL AND LENGTH(skip_reason)>=4))
) STRICT;
CREATE INDEX v2_pm_occurrences_due ON v2_preventive_occurrences(due_on,status);
CREATE TRIGGER v2_pm_occurrence_guard BEFORE INSERT ON v2_preventive_occurrences
BEGIN
 SELECT RAISE(ABORT,'V2_PM_PLAN_INACTIVE') WHERE NOT EXISTS(
 SELECT 1 FROM v2_preventive_plans p JOIN v2_engagements e ON e.id=p.engagement_id
 WHERE p.id=NEW.plan_id AND p.status='active' AND e.status='active' AND p.next_due=NEW.due_on);
 SELECT RAISE(ABORT,'V2_PM_ORDER_SCOPE') WHERE NEW.work_order_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM work_orders w JOIN v2_preventive_plans p ON p.id=NEW.plan_id
 JOIN v2_engagements e ON e.id=p.engagement_id WHERE w.id=NEW.work_order_id
 AND w.client_id=e.client_id AND w.property_id IS e.property_id AND w.scheme_id IS e.scheme_id);
END;
CREATE TRIGGER v2_pm_occurrence_immutable_u BEFORE UPDATE ON v2_preventive_occurrences
BEGIN SELECT RAISE(ABORT,'V2_PM_HISTORY_LOCKED'); END;
CREATE TRIGGER v2_pm_occurrence_immutable_d BEFORE DELETE ON v2_preventive_occurrences
BEGIN SELECT RAISE(ABORT,'V2_PM_HISTORY_LOCKED'); END;

-- Compliance tracking is an evidence/coordination register, never a statutory certificate.
CREATE TABLE v2_compliance_obligations(
 id TEXT PRIMARY KEY,
 engagement_id TEXT NOT NULL REFERENCES v2_engagements(id),
 asset_id TEXT NOT NULL REFERENCES v2_assets(id),
 title TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN
 ('fire','electrical','water','lift','accessibility','environment','essential_services','safety','other')),
 jurisdiction TEXT NOT NULL DEFAULT 'WA',
 source_reference TEXT NOT NULL, requirement_summary TEXT NOT NULL,
 accountable_party TEXT NOT NULL CHECK(accountable_party IN
 ('owner','appointed_manager','operator','qualified_provider','government_authority')),
 recurrence_months INTEGER CHECK(recurrence_months BETWEEN 1 AND 120),
 next_review_on TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','tracked','paused','retired')),
 review_reference TEXT, reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL, CHECK(LENGTH(next_review_on)=10)
) STRICT;
CREATE INDEX v2_obligations_due ON v2_compliance_obligations(status,next_review_on);
CREATE TRIGGER v2_compliance_scope BEFORE INSERT ON v2_compliance_obligations
BEGIN
 SELECT RAISE(ABORT,'V2_COMPLIANCE_SCOPE') WHERE NOT EXISTS(
 SELECT 1 FROM v2_assets a JOIN v2_engagements e ON e.id=NEW.engagement_id
 WHERE a.id=NEW.asset_id AND a.property_id IS e.property_id AND a.scheme_id IS e.scheme_id
 AND e.status='active');
END;
CREATE TRIGGER v2_compliance_activation BEFORE UPDATE OF status ON v2_compliance_obligations
WHEN NEW.status='tracked' AND OLD.status!='tracked'
BEGIN
 SELECT RAISE(ABORT,'V2_COMPLIANCE_AUTHORITY_REQUIRED') WHERE
 NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR
 LENGTH(TRIM(COALESCE(NEW.review_reference,'')))<4 OR LENGTH(TRIM(NEW.source_reference))<4;
 SELECT RAISE(ABORT,'V2_COMPLIANCE_ENGAGEMENT_INACTIVE') WHERE NOT EXISTS(
 SELECT 1 FROM v2_engagements e WHERE e.id=NEW.engagement_id AND e.status='active');
END;
CREATE TRIGGER v2_compliance_identity_lock BEFORE UPDATE OF engagement_id,asset_id,category,source_reference,accountable_party ON v2_compliance_obligations
WHEN OLD.status!='draft'
BEGIN SELECT RAISE(ABORT,'V2_COMPLIANCE_SCOPE_LOCKED'); END;

CREATE TABLE v2_compliance_evidence(
 id TEXT PRIMARY KEY, obligation_id TEXT NOT NULL REFERENCES v2_compliance_obligations(id),
 document_id TEXT REFERENCES documents(id),
 kind TEXT NOT NULL CHECK(kind IN('certificate','inspection','service_record','correspondence','other')),
 provider_name TEXT NOT NULL, evidence_reference TEXT NOT NULL,
 issued_on TEXT NOT NULL, expires_on TEXT,
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','verified','rejected')),
 recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, independent_check_reference TEXT,
 CHECK(expires_on IS NULL OR expires_on>issued_on),
 CHECK(status!='verified' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND LENGTH(independent_check_reference)>=4))
) STRICT;
CREATE INDEX v2_compliance_evidence_due ON v2_compliance_evidence(obligation_id,status,expires_on);
CREATE TRIGGER v2_compliance_evidence_scope BEFORE INSERT ON v2_compliance_evidence
BEGIN
 SELECT RAISE(ABORT,'V2_COMPLIANCE_EVIDENCE_SCOPE') WHERE NEW.document_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM documents d JOIN v2_compliance_obligations o ON o.id=NEW.obligation_id
 JOIN v2_assets a ON a.id=o.asset_id
 WHERE d.id=NEW.document_id AND d.status='issued'
 AND d.property_id IS a.property_id AND d.scheme_id IS a.scheme_id);
END;
CREATE TRIGGER v2_compliance_evidence_lock BEFORE UPDATE ON v2_compliance_evidence
WHEN OLD.status!='submitted' OR NEW.status NOT IN('verified','rejected')
 OR NEW.obligation_id!=OLD.obligation_id OR NEW.document_id IS NOT OLD.document_id
 OR NEW.evidence_reference!=OLD.evidence_reference OR NEW.issued_on!=OLD.issued_on
 OR NEW.expires_on IS NOT OLD.expires_on OR NEW.kind!=OLD.kind OR NEW.provider_name!=OLD.provider_name
BEGIN SELECT RAISE(ABORT,'V2_COMPLIANCE_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER v2_compliance_evidence_delete BEFORE DELETE ON v2_compliance_evidence
BEGIN SELECT RAISE(ABORT,'V2_COMPLIANCE_EVIDENCE_IMMUTABLE'); END;

CREATE TABLE v2_compliance_actions(
 id TEXT PRIMARY KEY, obligation_id TEXT NOT NULL REFERENCES v2_compliance_obligations(id),
 action_text TEXT NOT NULL, due_on TEXT NOT NULL,
 assignee_id TEXT NOT NULL REFERENCES staff_profiles(user_id),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','done','cancelled')),
 completion_reference TEXT, closed_by TEXT REFERENCES users(id), closed_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK(status='open' OR (closed_by IS NOT NULL AND closed_at IS NOT NULL AND LENGTH(completion_reference)>=4))
) STRICT;
CREATE INDEX v2_compliance_actions_due ON v2_compliance_actions(status,due_on);
CREATE TRIGGER v2_compliance_action_lock BEFORE UPDATE ON v2_compliance_actions
WHEN OLD.status!='open' OR NEW.status NOT IN('done','cancelled')
 OR NEW.obligation_id!=OLD.obligation_id OR NEW.action_text!=OLD.action_text
 OR NEW.due_on!=OLD.due_on OR NEW.assignee_id!=OLD.assignee_id
BEGIN SELECT RAISE(ABORT,'V2_COMPLIANCE_ACTION_IMMUTABLE'); END;
CREATE TRIGGER v2_compliance_action_delete BEFORE DELETE ON v2_compliance_actions
BEGIN SELECT RAISE(ABORT,'V2_COMPLIANCE_ACTION_IMMUTABLE'); END;

CREATE TABLE v2_asset_risks(
 id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES v2_assets(id),
 category TEXT NOT NULL CHECK(category IN('condition','safety','failure','compliance','financial','service','other')),
 summary TEXT NOT NULL,
 likelihood INTEGER NOT NULL CHECK(likelihood BETWEEN 1 AND 5),
 impact INTEGER NOT NULL CHECK(impact BETWEEN 1 AND 5),
 mitigation TEXT NOT NULL, next_review_on TEXT NOT NULL,
 owner_staff_id TEXT NOT NULL REFERENCES staff_profiles(user_id),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','mitigated','accepted')),
 closure_reference TEXT, reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK(status='open' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND LENGTH(closure_reference)>=4))
) STRICT;
CREATE INDEX v2_asset_risk_review ON v2_asset_risks(status,next_review_on);
CREATE TRIGGER v2_asset_risk_lock BEFORE UPDATE ON v2_asset_risks
WHEN OLD.status!='open' OR NEW.status NOT IN('mitigated','accepted')
 OR NEW.asset_id!=OLD.asset_id OR NEW.category!=OLD.category
 OR NEW.likelihood!=OLD.likelihood OR NEW.impact!=OLD.impact
BEGIN SELECT RAISE(ABORT,'V2_RISK_HISTORY_LOCKED'); END;
CREATE TRIGGER v2_asset_risk_delete BEFORE DELETE ON v2_asset_risks
BEGIN SELECT RAISE(ABORT,'V2_RISK_HISTORY_LOCKED'); END;
