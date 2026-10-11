-- V2 WP5: governed capital programmes, enterprise asset portfolios and reproducible reports.
-- Amounts are AUD cents. These records authorise planning, NOT bank payments or legal agency.
CREATE TABLE v2_enterprise_portfolios(
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id),
 name TEXT NOT NULL, purpose TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','archived')),
 authority_reference TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(client_id,name)
) STRICT;
CREATE TABLE v2_enterprise_portfolio_members(
 id TEXT PRIMARY KEY, portfolio_id TEXT NOT NULL REFERENCES v2_enterprise_portfolios(id),
 property_id TEXT REFERENCES properties(id), scheme_id TEXT REFERENCES strata_schemes(id),
 verified_by TEXT NOT NULL REFERENCES users(id), authority_reference TEXT NOT NULL, added_at TEXT NOT NULL,
 CHECK((property_id IS NOT NULL)+(scheme_id IS NOT NULL)=1)
) STRICT;
CREATE UNIQUE INDEX v2_enterprise_portfolio_property ON v2_enterprise_portfolio_members(portfolio_id,property_id) WHERE property_id IS NOT NULL;
CREATE UNIQUE INDEX v2_enterprise_portfolio_scheme ON v2_enterprise_portfolio_members(portfolio_id,scheme_id) WHERE scheme_id IS NOT NULL;
CREATE TRIGGER v2_enterprise_portfolio_scope BEFORE INSERT ON v2_enterprise_portfolio_members
BEGIN
 SELECT RAISE(ABORT,'V2_PORTFOLIO_NOT_AUTHORISED') WHERE NOT EXISTS(
 SELECT 1 FROM v2_enterprise_portfolios p WHERE p.id=NEW.portfolio_id AND p.status='active'
 AND (EXISTS(SELECT 1 FROM client_property_links l WHERE NEW.property_id IS NOT NULL
 AND l.property_id=NEW.property_id AND l.client_id=p.client_id
 AND l.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND (l.ends_at IS NULL OR l.ends_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')))
 OR EXISTS(SELECT 1 FROM scheme_client_links l WHERE NEW.scheme_id IS NOT NULL
 AND l.scheme_id=NEW.scheme_id AND l.client_id=p.client_id
 AND l.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND (l.ends_at IS NULL OR l.ends_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))));
END;
CREATE TRIGGER v2_enterprise_portfolio_members_lock BEFORE UPDATE ON v2_enterprise_portfolio_members
BEGIN SELECT RAISE(ABORT,'V2_PORTFOLIO_MEMBERSHIP_IMMUTABLE'); END;
CREATE TRIGGER v2_enterprise_portfolio_members_delete BEFORE DELETE ON v2_enterprise_portfolio_members
BEGIN SELECT RAISE(ABORT,'V2_PORTFOLIO_MEMBERSHIP_IMMUTABLE'); END;

CREATE TABLE v2_capital_programmes(
 id TEXT PRIMARY KEY,
 engagement_id TEXT NOT NULL REFERENCES v2_engagements(id),
 title TEXT NOT NULL, purpose TEXT NOT NULL,
 baseline_budget_cents INTEGER NOT NULL CHECK(baseline_budget_cents>=0),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','active','completed','cancelled')),
 authority_reference TEXT, approved_by TEXT REFERENCES users(id), approved_at TEXT,
 planned_start TEXT, planned_finish TEXT,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK(planned_finish IS NULL OR planned_start IS NULL OR planned_finish>=planned_start)
) STRICT;
CREATE INDEX v2_cap_programme_status ON v2_capital_programmes(engagement_id,status);
CREATE TRIGGER v2_cap_programme_approve BEFORE UPDATE OF status ON v2_capital_programmes
WHEN NEW.status='approved' AND OLD.status='draft'
BEGIN
 SELECT RAISE(ABORT,'V2_CAPITAL_AUTHORITY_REQUIRED') WHERE NEW.approved_by IS NULL
 OR NEW.approved_by=NEW.created_by OR NEW.approved_at IS NULL
 OR LENGTH(TRIM(COALESCE(NEW.authority_reference,'')))<4;
 SELECT RAISE(ABORT,'V2_CAPITAL_ENGAGEMENT_REQUIRED') WHERE NOT EXISTS(
 SELECT 1 FROM v2_engagements e WHERE e.id=NEW.engagement_id AND e.status='active');
END;
CREATE TRIGGER v2_cap_programme_status BEFORE UPDATE OF status ON v2_capital_programmes
WHEN OLD.status!=NEW.status
BEGIN
 SELECT RAISE(ABORT,'V2_CAPITAL_PROGRAMME_TRANSITION') WHERE NOT(
 (OLD.status='draft' AND NEW.status IN('approved','cancelled')) OR
 (OLD.status='approved' AND NEW.status IN('active','cancelled')) OR
 (OLD.status='active' AND NEW.status IN('completed','cancelled')));
 SELECT RAISE(ABORT,'V2_CAPITAL_PROJECTS_OUTSTANDING') WHERE NEW.status='completed'
 AND EXISTS(SELECT 1 FROM v2_capital_projects p WHERE p.programme_id=NEW.id AND p.status NOT IN('completed','cancelled'));
END;
CREATE TRIGGER v2_cap_programme_budget_lock BEFORE UPDATE OF engagement_id,baseline_budget_cents,planned_start,planned_finish ON v2_capital_programmes
WHEN OLD.status!='draft'
BEGIN SELECT RAISE(ABORT,'V2_CAPITAL_BASELINE_IMMUTABLE'); END;

CREATE TABLE v2_capital_projects(
 id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES v2_capital_programmes(id),
 asset_id TEXT REFERENCES v2_assets(id), work_order_id TEXT REFERENCES work_orders(id),
 title TEXT NOT NULL, scope_summary TEXT NOT NULL,
 estimated_cents INTEGER NOT NULL CHECK(estimated_cents>=0),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','active','completed','cancelled')),
 authority_reference TEXT, approved_by TEXT REFERENCES users(id), approved_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX v2_cap_projects_programme ON v2_capital_projects(programme_id,status);
CREATE TRIGGER v2_cap_project_insert_scope BEFORE INSERT ON v2_capital_projects
BEGIN
 SELECT RAISE(ABORT,'V2_CAPITAL_PROGRAMME_NOT_APPROVED') WHERE NOT EXISTS(
 SELECT 1 FROM v2_capital_programmes p WHERE p.id=NEW.programme_id AND p.status IN('approved','active'));
 SELECT RAISE(ABORT,'V2_CAPITAL_ASSET_SCOPE') WHERE NEW.asset_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_capital_programmes p JOIN v2_engagements e ON e.id=p.engagement_id
 JOIN v2_assets a ON a.id=NEW.asset_id WHERE p.id=NEW.programme_id
 AND a.property_id IS e.property_id AND a.scheme_id IS e.scheme_id);
 SELECT RAISE(ABORT,'V2_CAPITAL_WORK_SCOPE') WHERE NEW.work_order_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_capital_programmes p JOIN v2_engagements e ON e.id=p.engagement_id
 JOIN work_orders w ON w.id=NEW.work_order_id WHERE p.id=NEW.programme_id
 AND w.client_id=e.client_id AND w.property_id IS e.property_id AND w.scheme_id IS e.scheme_id);
END;
CREATE TRIGGER v2_cap_project_status BEFORE UPDATE OF status ON v2_capital_projects
WHEN OLD.status!=NEW.status
BEGIN
 SELECT RAISE(ABORT,'V2_CAPITAL_PROJECT_TRANSITION') WHERE NOT(
 (OLD.status='draft' AND NEW.status IN('approved','cancelled')) OR
 (OLD.status='approved' AND NEW.status IN('active','cancelled')) OR
 (OLD.status='active' AND NEW.status IN('completed','cancelled')));
 SELECT RAISE(ABORT,'V2_CAPITAL_PROJECT_REVIEW_REQUIRED') WHERE NEW.status='approved'
 AND (NEW.approved_by IS NULL OR NEW.approved_by=NEW.created_by OR NEW.approved_at IS NULL
 OR LENGTH(TRIM(COALESCE(NEW.authority_reference,'')))<4);
 SELECT RAISE(ABORT,'V2_CAPITAL_MILESTONES_OUTSTANDING') WHERE NEW.status='completed'
 AND EXISTS(SELECT 1 FROM v2_capital_milestones m WHERE m.project_id=NEW.id AND m.status='planned');
 SELECT RAISE(ABORT,'V2_CAPITAL_COMMITMENTS_OUTSTANDING') WHERE NEW.status='completed'
 AND EXISTS(SELECT 1 FROM v2_capital_commitments c WHERE c.project_id=NEW.id AND c.status='proposed');
END;
CREATE TRIGGER v2_cap_project_scope_lock BEFORE UPDATE OF programme_id,asset_id,work_order_id,estimated_cents ON v2_capital_projects
WHEN OLD.status!='draft'
BEGIN SELECT RAISE(ABORT,'V2_CAPITAL_PROJECT_SCOPE_LOCKED'); END;

CREATE TABLE v2_capital_milestones(
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES v2_capital_projects(id),
 title TEXT NOT NULL, due_on TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN('planned','completed','deferred')),
 evidence_reference TEXT, completed_by TEXT REFERENCES users(id), completed_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK(status='planned' OR (completed_by IS NOT NULL AND completed_at IS NOT NULL
 AND LENGTH(TRIM(COALESCE(evidence_reference,'')))>=4))
) STRICT;
CREATE INDEX v2_cap_milestones_due ON v2_capital_milestones(status,due_on);
CREATE TRIGGER v2_cap_milestone_review BEFORE UPDATE ON v2_capital_milestones
WHEN OLD.status!='planned' OR NEW.status NOT IN('completed','deferred')
 OR NEW.project_id!=OLD.project_id OR NEW.title!=OLD.title OR NEW.due_on!=OLD.due_on
BEGIN SELECT RAISE(ABORT,'V2_CAPITAL_MILESTONE_IMMUTABLE'); END;
CREATE TRIGGER v2_cap_milestone_delete BEFORE DELETE ON v2_capital_milestones
BEGIN SELECT RAISE(ABORT,'V2_CAPITAL_MILESTONE_IMMUTABLE'); END;

CREATE TABLE v2_capital_commitments(
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES v2_capital_projects(id),
 contractor_id TEXT REFERENCES contractors(id), category TEXT NOT NULL CHECK(category IN('works','materials','professional','contingency','other')),
 proposed_cents INTEGER NOT NULL CHECK(proposed_cents>=0),
 quotation_reference TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','approved','cancelled')),
 authority_reference TEXT, approved_by TEXT REFERENCES users(id), approved_at TEXT,
 proposed_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK(status!='approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND LENGTH(authority_reference)>=4))
) STRICT;
CREATE INDEX v2_cap_commitments_project ON v2_capital_commitments(project_id,status);
CREATE TRIGGER v2_capital_commit_approval BEFORE UPDATE OF status ON v2_capital_commitments
WHEN NEW.status='approved' AND OLD.status='proposed'
BEGIN
 SELECT RAISE(ABORT,'V2_CAPITAL_COMMITMENT_REVIEW_REQUIRED') WHERE NEW.approved_by IS NULL
 OR NEW.approved_by=NEW.proposed_by OR NEW.approved_at IS NULL OR
 LENGTH(TRIM(COALESCE(NEW.authority_reference,'')))<4;
 SELECT RAISE(ABORT,'V2_CAPITAL_NOT_ACTIVE') WHERE NOT EXISTS(
 SELECT 1 FROM v2_capital_projects p JOIN v2_capital_programmes g ON g.id=p.programme_id
 WHERE p.id=NEW.project_id AND p.status IN('approved','active') AND g.status IN('approved','active'));
 SELECT RAISE(ABORT,'V2_CAPITAL_BUDGET_EXCEEDED') WHERE
 (SELECT COALESCE(SUM(c.proposed_cents),0) FROM v2_capital_commitments c
 JOIN v2_capital_projects p ON p.id=c.project_id WHERE p.programme_id=
 (SELECT p2.programme_id FROM v2_capital_projects p2 WHERE p2.id=NEW.project_id)
 AND c.status='approved')+NEW.proposed_cents >
 (SELECT g.baseline_budget_cents FROM v2_capital_programmes g
 JOIN v2_capital_projects p ON p.programme_id=g.id WHERE p.id=NEW.project_id);
 SELECT RAISE(ABORT,'V2_CAPITAL_CONTRACTOR_UNVERIFIED') WHERE NEW.contractor_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM contractors c JOIN v2_contractor_credentials v ON v.contractor_id=c.id
 WHERE c.id=NEW.contractor_id AND c.active=1 AND v.status='verified'
 AND v.credential_type='insurance' AND v.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER v2_capital_commit_lock BEFORE UPDATE ON v2_capital_commitments
WHEN OLD.status!='proposed' OR NEW.status NOT IN('approved','cancelled')
 OR NEW.project_id!=OLD.project_id OR NEW.proposed_cents!=OLD.proposed_cents
 OR NEW.contractor_id IS NOT OLD.contractor_id
BEGIN SELECT RAISE(ABORT,'V2_CAPITAL_COMMITMENT_IMMUTABLE'); END;
CREATE TRIGGER v2_capital_commit_delete BEFORE DELETE ON v2_capital_commitments
BEGIN SELECT RAISE(ABORT,'V2_CAPITAL_COMMITMENT_IMMUTABLE'); END;

CREATE TABLE v2_capital_forecasts(
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES v2_capital_projects(id),
 revision INTEGER NOT NULL CHECK(revision>0),
 forecast_total_cents INTEGER NOT NULL CHECK(forecast_total_cents>=0),
 rationale TEXT NOT NULL, source_reference TEXT NOT NULL,
 recorded_by TEXT NOT NULL REFERENCES users(id), recorded_at TEXT NOT NULL,
 UNIQUE(project_id,revision)
) STRICT;
CREATE TRIGGER v2_cap_forecast_lock_u BEFORE UPDATE ON v2_capital_forecasts
BEGIN SELECT RAISE(ABORT,'V2_CAPITAL_FORECAST_IMMUTABLE'); END;
CREATE TRIGGER v2_cap_forecast_lock_d BEFORE DELETE ON v2_capital_forecasts
BEGIN SELECT RAISE(ABORT,'V2_CAPITAL_FORECAST_IMMUTABLE'); END;

CREATE TABLE v2_saved_report_definitions(
 id TEXT PRIMARY KEY, title TEXT NOT NULL,
 report_kind TEXT NOT NULL CHECK(report_kind IN('operations','assets','compliance','maintenance','sectors','capital')),
 client_id TEXT REFERENCES clients(id), market_code TEXT REFERENCES v2_markets(code),
 portfolio_id TEXT REFERENCES v2_enterprise_portfolios(id),
 window_days INTEGER NOT NULL DEFAULT 90 CHECK(window_days BETWEEN 1 AND 366),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','archived')),
 owner_user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK(portfolio_id IS NULL OR client_id IS NOT NULL)
) STRICT;
CREATE TRIGGER v2_report_portfolio_scope BEFORE INSERT ON v2_saved_report_definitions
BEGIN
 SELECT RAISE(ABORT,'V2_REPORT_PORTFOLIO_SCOPE') WHERE NEW.portfolio_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_enterprise_portfolios p WHERE p.id=NEW.portfolio_id AND p.client_id=NEW.client_id);
END;
CREATE TABLE v2_report_snapshots(
 id TEXT PRIMARY KEY, definition_id TEXT NOT NULL REFERENCES v2_saved_report_definitions(id),
 period_start TEXT NOT NULL, period_end TEXT NOT NULL,
 metrics_json TEXT NOT NULL CHECK(json_valid(metrics_json)),
 created_by TEXT NOT NULL REFERENCES users(id), generated_at TEXT NOT NULL,
 CHECK(period_end>period_start)
) STRICT;
CREATE INDEX v2_report_snapshots_definition ON v2_report_snapshots(definition_id,generated_at);
CREATE TRIGGER v2_report_snapshot_lock_u BEFORE UPDATE ON v2_report_snapshots
BEGIN SELECT RAISE(ABORT,'V2_REPORT_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER v2_report_snapshot_lock_d BEFORE DELETE ON v2_report_snapshots
BEGIN SELECT RAISE(ABORT,'V2_REPORT_SNAPSHOT_IMMUTABLE'); END;

CREATE TABLE v2_enterprise_alerts(
 id TEXT PRIMARY KEY, source_kind TEXT NOT NULL CHECK(source_kind IN('asset','preventive','compliance','maintenance','capital','sector')),
 source_id TEXT NOT NULL, alert_code TEXT NOT NULL, severity TEXT NOT NULL CHECK(severity IN('info','warning','critical')),
 summary TEXT NOT NULL, due_on TEXT,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','acknowledged','resolved')),
 assigned_staff_id TEXT REFERENCES staff_profiles(user_id),
 resolution_reference TEXT, resolved_by TEXT REFERENCES users(id), resolved_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(source_kind,source_id,alert_code),
 CHECK(status!='resolved' OR (LENGTH(TRIM(COALESCE(resolution_reference,'')))>=4 AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
) STRICT;
CREATE INDEX v2_alerts_status ON v2_enterprise_alerts(status,severity,due_on);
CREATE TRIGGER v2_alert_review_lock BEFORE UPDATE ON v2_enterprise_alerts
WHEN OLD.status NOT IN('open','acknowledged') OR NEW.status NOT IN('acknowledged','resolved')
 OR NEW.source_kind!=OLD.source_kind OR NEW.source_id!=OLD.source_id
 OR NEW.alert_code!=OLD.alert_code OR NEW.severity!=OLD.severity
BEGIN SELECT RAISE(ABORT,'V2_ENTERPRISE_ALERT_IMMUTABLE'); END;
CREATE TRIGGER v2_alert_delete BEFORE DELETE ON v2_enterprise_alerts
BEGIN SELECT RAISE(ABORT,'V2_ENTERPRISE_ALERT_IMMUTABLE'); END;
