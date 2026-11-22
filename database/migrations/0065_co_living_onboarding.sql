-- Co-Living property-specific establishment workflow, stacked on PR #118 migration 0064.
-- No live rent collection, Stripe charges, bond handling, subscription activation or statutory certification.
CREATE TABLE co_living_onboarding_projects (
 id TEXT PRIMARY KEY,
 property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
 client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
 stage TEXT NOT NULL DEFAULT 'enquiry' CHECK(stage IN('enquiry','site_visit','proposal','implementation','advertising','tenanted')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','on_hold','withdrawn','completed')),
 objectives TEXT NOT NULL CHECK(length(trim(objectives)) BETWEEN 8 AND 2000),
 assigned_to TEXT REFERENCES users(id),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX co_living_onboarding_one_active ON co_living_onboarding_projects(property_id)
 WHERE status IN('active','on_hold');
CREATE INDEX co_living_onboarding_client ON co_living_onboarding_projects(client_id,updated_at);
CREATE TRIGGER co_living_onboarding_residential BEFORE INSERT ON co_living_onboarding_projects BEGIN
 SELECT RAISE(ABORT,'CO_LIVING_RESIDENTIAL_ONLY') WHERE NOT EXISTS
 (SELECT 1 FROM properties WHERE id=NEW.property_id AND sector='residential' AND archived_at IS NULL);
END;

CREATE TABLE co_living_onboarding_assessments (
 project_id TEXT PRIMARY KEY REFERENCES co_living_onboarding_projects(id) ON DELETE RESTRICT,
 visit_at TEXT,
 summary TEXT NOT NULL CHECK(length(trim(summary)) BETWEEN 8 AND 3000),
 internal_notes TEXT NOT NULL CHECK(length(trim(internal_notes)) BETWEEN 8 AND 4000),
 proposed_rooms INTEGER NOT NULL CHECK(proposed_rooms BETWEEN 1 AND 100),
 evidence_reference TEXT NOT NULL CHECK(length(trim(evidence_reference)) BETWEEN 8 AND 500),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','reviewed')),
 updated_by TEXT NOT NULL REFERENCES users(id),
 reviewed_by TEXT REFERENCES users(id),
 updated_at TEXT NOT NULL,
 reviewed_at TEXT
) STRICT;
CREATE TRIGGER co_living_onboarding_assessment_independent BEFORE UPDATE OF status ON co_living_onboarding_assessments
 WHEN NEW.status='reviewed' AND OLD.status!='reviewed'
 BEGIN SELECT RAISE(ABORT,'INDEPENDENT_REVIEW_REQUIRED')
 WHERE NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.updated_by; END;

CREATE TABLE co_living_onboarding_proposals (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES co_living_onboarding_projects(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','issued','accepted','declined','changes_requested','superseded')),
 traditional_weekly_cents INTEGER NOT NULL CHECK(traditional_weekly_cents>=0),
 room_weekly_cents INTEGER NOT NULL CHECK(room_weekly_cents>=0),
 parking_weekly_cents INTEGER NOT NULL CHECK(parking_weekly_cents>=0),
 furnishing_budget_cents INTEGER NOT NULL CHECK(furnishing_budget_cents>=0),
 works_budget_cents INTEGER NOT NULL CHECK(works_budget_cents>=0),
 management_fee_bp INTEGER NOT NULL DEFAULT 2500 CHECK(management_fee_bp=2500),
 utility_cap_of_fee_bp INTEGER NOT NULL DEFAULT 2500 CHECK(utility_cap_of_fee_bp=2500),
 assumptions TEXT NOT NULL CHECK(length(trim(assumptions)) BETWEEN 15 AND 3000),
 agreement_version TEXT NOT NULL CHECK(length(trim(agreement_version)) BETWEEN 3 AND 120),
 document_reference TEXT NOT NULL CHECK(length(trim(document_reference)) BETWEEN 8 AND 500),
 created_by TEXT NOT NULL REFERENCES users(id),
 reviewed_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL,
 issued_at TEXT,
 UNIQUE(project_id,version)
) STRICT;
CREATE UNIQUE INDEX co_living_onboarding_one_issued ON co_living_onboarding_proposals(project_id)
 WHERE status='issued';
CREATE TRIGGER co_living_onboarding_proposal_immutable BEFORE UPDATE OF
 project_id,version,traditional_weekly_cents,room_weekly_cents,parking_weekly_cents,
 furnishing_budget_cents,works_budget_cents,management_fee_bp,utility_cap_of_fee_bp,
 assumptions,agreement_version,document_reference,created_by,created_at
 ON co_living_onboarding_proposals
 BEGIN SELECT RAISE(ABORT,'PROPOSAL_IMMUTABLE'); END;
CREATE TRIGGER co_living_onboarding_proposal_review BEFORE UPDATE OF status ON co_living_onboarding_proposals
 WHEN NEW.status='issued' AND OLD.status!='issued'
 BEGIN SELECT RAISE(ABORT,'INDEPENDENT_REVIEW_REQUIRED')
 WHERE NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by; END;

CREATE TABLE co_living_onboarding_decisions (
 id TEXT PRIMARY KEY,
 proposal_id TEXT NOT NULL REFERENCES co_living_onboarding_proposals(id) ON DELETE RESTRICT UNIQUE,
 project_id TEXT NOT NULL REFERENCES co_living_onboarding_projects(id) ON DELETE RESTRICT,
 proposal_version INTEGER NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN('approved','declined','changes_requested')),
 note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 1000),
 actor_id TEXT NOT NULL REFERENCES users(id),
 decided_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER co_living_onboarding_decision_immutable BEFORE UPDATE ON co_living_onboarding_decisions
 BEGIN SELECT RAISE(ABORT,'DECISION_IMMUTABLE'); END;
CREATE TRIGGER co_living_onboarding_decision_no_delete BEFORE DELETE ON co_living_onboarding_decisions
 BEGIN SELECT RAISE(ABORT,'DECISION_IMMUTABLE'); END;

CREATE TABLE co_living_onboarding_checks (
 project_id TEXT NOT NULL REFERENCES co_living_onboarding_projects(id) ON DELETE RESTRICT,
 code TEXT NOT NULL CHECK(length(code) BETWEEN 5 AND 80),
 stage TEXT NOT NULL CHECK(stage IN('enquiry','site_visit','proposal','implementation','advertising')),
 status TEXT NOT NULL CHECK(status IN('submitted','verified','rejected')),
 evidence_reference TEXT NOT NULL CHECK(length(trim(evidence_reference)) BETWEEN 8 AND 500),
 submitted_by TEXT NOT NULL REFERENCES users(id),
 reviewed_by TEXT REFERENCES users(id),
 submitted_at TEXT NOT NULL,
 reviewed_at TEXT,
 PRIMARY KEY(project_id,code)
) STRICT;
CREATE TRIGGER co_living_onboarding_check_independent BEFORE UPDATE OF status ON co_living_onboarding_checks
 WHEN NEW.status='verified' AND OLD.status!='verified'
 BEGIN SELECT RAISE(ABORT,'INDEPENDENT_REVIEW_REQUIRED')
 WHERE NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.submitted_by; END;

CREATE TABLE co_living_onboarding_tasks (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES co_living_onboarding_projects(id) ON DELETE RESTRICT,
 stage TEXT NOT NULL CHECK(stage IN('enquiry','site_visit','proposal','implementation','advertising','tenanted')),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 5 AND 240),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','blocked','completed')),
 due_at TEXT,
 owner_visible INTEGER NOT NULL DEFAULT 1 CHECK(owner_visible IN(0,1)),
 evidence_reference TEXT,
 created_by TEXT NOT NULL REFERENCES users(id),
 updated_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX co_living_onboarding_tasks_by_project ON co_living_onboarding_tasks(project_id,stage,status);

CREATE TABLE co_living_onboarding_items (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES co_living_onboarding_projects(id) ON DELETE RESTRICT,
 space_label TEXT NOT NULL CHECK(length(trim(space_label)) BETWEEN 2 AND 100),
 item_name TEXT NOT NULL CHECK(length(trim(item_name)) BETWEEN 3 AND 180),
 supplier TEXT NOT NULL CHECK(length(trim(supplier)) BETWEEN 2 AND 160),
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 100),
 unit_cost_cents INTEGER NOT NULL CHECK(unit_cost_cents BETWEEN 0 AND 100000000),
 actual_total_cents INTEGER CHECK(actual_total_cents BETWEEN 0 AND 100000000),
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN('planned','quoted','ordered','delivered','installed')),
 receipt_reference TEXT,
 warranty_reference TEXT,
 updated_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX co_living_onboarding_items_by_project ON co_living_onboarding_items(project_id,status);

CREATE TABLE co_living_onboarding_variations (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES co_living_onboarding_projects(id) ON DELETE RESTRICT,
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 8 AND 500),
 extra_budget_cents INTEGER NOT NULL CHECK(extra_budget_cents BETWEEN 1 AND 100000000),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','declined')),
 requested_by TEXT NOT NULL REFERENCES users(id),
 decided_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL,
 decided_at TEXT
) STRICT;
CREATE INDEX co_living_onboarding_variations_by_project ON co_living_onboarding_variations(project_id,status);
CREATE TRIGGER co_living_onboarding_variation_immutable BEFORE UPDATE OF
 project_id,description,extra_budget_cents,requested_by,created_at ON co_living_onboarding_variations
 BEGIN SELECT RAISE(ABORT,'VARIATION_IMMUTABLE'); END;

CREATE TABLE co_living_onboarding_events (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES co_living_onboarding_projects(id) ON DELETE RESTRICT,
 actor_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL CHECK(length(action) BETWEEN 5 AND 100),
 detail TEXT NOT NULL CHECK(length(detail) BETWEEN 1 AND 1000),
 request_key TEXT,
 created_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX co_living_onboarding_event_request ON co_living_onboarding_events(project_id,request_key)
 WHERE request_key IS NOT NULL;
CREATE INDEX co_living_onboarding_events_by_project ON co_living_onboarding_events(project_id,created_at);
CREATE TRIGGER co_living_onboarding_event_immutable BEFORE UPDATE ON co_living_onboarding_events
 BEGIN SELECT RAISE(ABORT,'EVENT_IMMUTABLE'); END;
CREATE TRIGGER co_living_onboarding_event_no_delete BEFORE DELETE ON co_living_onboarding_events
 BEGIN SELECT RAISE(ABORT,'EVENT_IMMUTABLE'); END;
