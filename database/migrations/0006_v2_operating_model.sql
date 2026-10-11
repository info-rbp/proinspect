-- ProInspect V2: ADDITIVE operational business contract.
-- All V2 market, service, package and rate-card data is draft; legacy booking services are untouched.
-- This migration follows the immutable 0001-0005 baseline and does not deploy anything.

CREATE TABLE v2_markets (
 code TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, reference_unit TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))
) STRICT;

CREATE TABLE v2_services (
 code TEXT PRIMARY KEY, name TEXT NOT NULL, family TEXT NOT NULL,
 summary TEXT NOT NULL, delivery_gate TEXT NOT NULL CHECK(delivery_gate IN ('operations_only','qualified_review','statutory_reserved')),
 legacy_service_id TEXT UNIQUE, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','approved','retired')),
 approved_by TEXT REFERENCES users(id), approved_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE v2_service_revisions (
 service_code TEXT NOT NULL REFERENCES v2_services(code), version INTEGER NOT NULL CHECK(version>0),
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), changed_by TEXT REFERENCES users(id),
 changed_at TEXT NOT NULL, PRIMARY KEY(service_code,version)
) STRICT;
CREATE TRIGGER v2_service_revisions_immutable_u BEFORE UPDATE ON v2_service_revisions BEGIN SELECT RAISE(ABORT,'V2_REVISION_IMMUTABLE'); END;
CREATE TRIGGER v2_service_revisions_immutable_d BEFORE DELETE ON v2_service_revisions BEGIN SELECT RAISE(ABORT,'V2_REVISION_IMMUTABLE'); END;

CREATE TABLE v2_market_service_rules (
 market_code TEXT NOT NULL REFERENCES v2_markets(code), service_code TEXT NOT NULL REFERENCES v2_services(code),
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','blocked')),
 notes TEXT NOT NULL DEFAULT '', verified_by TEXT REFERENCES users(id), verified_at TEXT,
 PRIMARY KEY(market_code,service_code)
) STRICT;

-- An asset is scoped to EXACTLY one existing property or scheme; no duplicate canonical property.
CREATE TABLE v2_assets (
 id TEXT PRIMARY KEY, property_id TEXT REFERENCES properties(id), scheme_id TEXT REFERENCES strata_schemes(id),
 parent_id TEXT REFERENCES v2_assets(id), kind TEXT NOT NULL CHECK(kind IN
 ('site','building','premises','lot','common_area','plant','equipment','facility','infrastructure','other')),
 name TEXT NOT NULL, reference TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TEXT NOT NULL,
 CHECK((property_id IS NOT NULL) + (scheme_id IS NOT NULL) = 1),
 CHECK(parent_id IS NULL OR parent_id != id)
) STRICT;
CREATE INDEX v2_assets_property ON v2_assets(property_id,parent_id);
CREATE INDEX v2_assets_scheme ON v2_assets(scheme_id,parent_id);
CREATE INDEX v2_assets_parent ON v2_assets(parent_id);

CREATE TRIGGER v2_asset_insert_scope BEFORE INSERT ON v2_assets WHEN NEW.parent_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'V2_ASSET_SCOPE_MISMATCH') WHERE NOT EXISTS (
 SELECT 1 FROM v2_assets p WHERE p.id=NEW.parent_id
 AND p.property_id IS NEW.property_id AND p.scheme_id IS NEW.scheme_id);
END;
CREATE TRIGGER v2_asset_update_scope BEFORE UPDATE OF parent_id,property_id,scheme_id ON v2_assets
BEGIN
 SELECT RAISE(ABORT,'V2_ASSET_SCOPE_MISMATCH') WHERE NEW.parent_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM v2_assets p WHERE p.id=NEW.parent_id
 AND p.property_id IS NEW.property_id AND p.scheme_id IS NEW.scheme_id);
 WITH RECURSIVE ancestry(id) AS (
 SELECT NEW.parent_id UNION ALL SELECT p.parent_id FROM v2_assets p JOIN ancestry a ON p.id=a.id WHERE p.parent_id IS NOT NULL
 ) SELECT RAISE(ABORT,'V2_ASSET_CYCLE') WHERE EXISTS(SELECT 1 FROM ancestry WHERE id=NEW.id);
END;

CREATE TABLE v2_asset_markets (
 id TEXT PRIMARY KEY, market_code TEXT NOT NULL REFERENCES v2_markets(code),
 property_id TEXT REFERENCES properties(id), scheme_id TEXT REFERENCES strata_schemes(id),
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','blocked')),
 verified_by TEXT REFERENCES users(id), verified_at TEXT,
 CHECK((property_id IS NOT NULL) + (scheme_id IS NOT NULL) = 1)
) STRICT;
CREATE UNIQUE INDEX v2_asset_markets_property ON v2_asset_markets(property_id,market_code) WHERE property_id IS NOT NULL;
CREATE UNIQUE INDEX v2_asset_markets_scheme ON v2_asset_markets(scheme_id,market_code) WHERE scheme_id IS NOT NULL;

CREATE TABLE v2_engagements (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id),
 property_id TEXT REFERENCES properties(id), scheme_id TEXT REFERENCES strata_schemes(id),
 market_code TEXT NOT NULL REFERENCES v2_markets(code), reference TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','ended')),
 scope_summary TEXT NOT NULL, authority_reference TEXT, verified_by TEXT REFERENCES users(id),
 verified_at TEXT, starts_at TEXT NOT NULL, ends_at TEXT, created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK((property_id IS NOT NULL) + (scheme_id IS NOT NULL) = 1),
 CHECK(ends_at IS NULL OR ends_at>starts_at)
) STRICT;
CREATE INDEX v2_engagements_client ON v2_engagements(client_id,status);
CREATE INDEX v2_engagements_property ON v2_engagements(property_id,status);
CREATE INDEX v2_engagements_scheme ON v2_engagements(scheme_id,status);
CREATE TRIGGER v2_engagement_activation BEFORE UPDATE OF status ON v2_engagements
WHEN NEW.status='active' AND OLD.status!='active'
BEGIN
 SELECT RAISE(ABORT,'V2_UNVERIFIED_ENGAGEMENT') WHERE NEW.authority_reference IS NULL OR NEW.verified_by IS NULL
 OR NEW.verified_at IS NULL OR NEW.ends_at IS NOT NULL AND NEW.ends_at<=CURRENT_TIMESTAMP;
 SELECT RAISE(ABORT,'V2_UNAPPROVED_MARKET') WHERE NOT EXISTS(
 SELECT 1 FROM v2_asset_markets am WHERE am.market_code=NEW.market_code AND am.status='approved'
 AND am.property_id IS NEW.property_id AND am.scheme_id IS NEW.scheme_id);
END;
CREATE TRIGGER v2_engagement_scope_lock BEFORE UPDATE OF client_id,property_id,scheme_id,market_code,starts_at ON v2_engagements
WHEN OLD.status!='draft'
BEGIN SELECT RAISE(ABORT,'V2_ENGAGEMENT_SCOPE_LOCKED'); END;

CREATE TABLE v2_plan_versions (
 id TEXT PRIMARY KEY, market_code TEXT NOT NULL REFERENCES v2_markets(code),
 plan_code TEXT NOT NULL CHECK(plan_code IN ('inspection','standard','outsourced')),
 version INTEGER NOT NULL CHECK(version>0),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','retired')),
 reference_unit TEXT NOT NULL, included_hours_milli INTEGER CHECK(included_hours_milli>=0),
 included_visits INTEGER CHECK(included_visits>=0), included_tickets INTEGER CHECK(included_tickets>=0),
 included_reports INTEGER CHECK(included_reports>=0),
 monthly_fee_cents INTEGER CHECK(monthly_fee_cents>=0), approved_by TEXT REFERENCES users(id), approved_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(market_code,plan_code,version)
) STRICT;
CREATE TRIGGER v2_plan_version_immutable BEFORE UPDATE ON v2_plan_versions WHEN OLD.status='approved'
BEGIN SELECT RAISE(ABORT,'V2_APPROVED_PLAN_IMMUTABLE'); END;
CREATE TRIGGER v2_plan_version_delete BEFORE DELETE ON v2_plan_versions
BEGIN SELECT RAISE(ABORT,'V2_PLAN_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER v2_plan_approve_gate BEFORE UPDATE OF status ON v2_plan_versions WHEN NEW.status='approved'
BEGIN
 SELECT RAISE(ABORT,'V2_PLAN_NOT_READY') WHERE NEW.monthly_fee_cents IS NULL OR NEW.included_hours_milli IS NULL
 OR NEW.included_visits IS NULL OR NEW.included_tickets IS NULL OR NEW.included_reports IS NULL
 OR NEW.approved_by IS NULL OR NEW.approved_at IS NULL;
 SELECT RAISE(ABORT,'V2_UNAPPROVED_PLAN_SERVICES') WHERE EXISTS(
 SELECT 1 FROM v2_plan_services ps LEFT JOIN v2_market_service_rules r ON r.market_code=NEW.market_code
 AND r.service_code=ps.service_code
 WHERE ps.plan_id=NEW.id AND ps.inclusion='included' AND COALESCE(r.status,'blocked')!='approved');
END;

CREATE TABLE v2_plan_services (
 plan_id TEXT NOT NULL REFERENCES v2_plan_versions(id),
 service_code TEXT NOT NULL REFERENCES v2_services(code),
 inclusion TEXT NOT NULL CHECK(inclusion IN ('included','optional','excluded')),
 PRIMARY KEY(plan_id,service_code)
) STRICT;
CREATE TRIGGER v2_plan_services_insert_gate BEFORE INSERT ON v2_plan_services
WHEN (SELECT status FROM v2_plan_versions WHERE id=NEW.plan_id)!='draft'
BEGIN SELECT RAISE(ABORT,'V2_APPROVED_PLAN_IMMUTABLE'); END;
CREATE TRIGGER v2_plan_services_update_gate BEFORE UPDATE ON v2_plan_services
WHEN (SELECT status FROM v2_plan_versions WHERE id=OLD.plan_id)!='draft'
BEGIN SELECT RAISE(ABORT,'V2_APPROVED_PLAN_IMMUTABLE'); END;
CREATE TRIGGER v2_plan_services_delete_gate BEFORE DELETE ON v2_plan_services
WHEN (SELECT status FROM v2_plan_versions WHERE id=OLD.plan_id)!='draft'
BEGIN SELECT RAISE(ABORT,'V2_APPROVED_PLAN_IMMUTABLE'); END;

CREATE TABLE v2_subscription_periods (
 id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL REFERENCES v2_engagements(id),
 plan_id TEXT NOT NULL REFERENCES v2_plan_versions(id),
 period_start TEXT NOT NULL, period_end TEXT NOT NULL,
 agreed_monthly_cents INTEGER NOT NULL CHECK(agreed_monthly_cents>=0),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK(period_end>period_start)
) STRICT;
CREATE UNIQUE INDEX v2_one_active_subscription ON v2_subscription_periods(engagement_id) WHERE status='active';
CREATE TRIGGER v2_subscription_gate BEFORE INSERT ON v2_subscription_periods
BEGIN
 SELECT RAISE(ABORT,'V2_SUBSCRIPTION_SCOPE') WHERE NOT EXISTS(
 SELECT 1 FROM v2_engagements e JOIN v2_plan_versions p ON p.id=NEW.plan_id
 WHERE e.id=NEW.engagement_id AND e.status='active' AND p.status='approved'
 AND p.market_code=e.market_code AND e.starts_at<=NEW.period_start
 AND (e.ends_at IS NULL OR NEW.period_end<=e.ends_at)
 AND p.monthly_fee_cents=NEW.agreed_monthly_cents);
END;
CREATE TRIGGER v2_subscription_lock BEFORE UPDATE OF engagement_id,plan_id,period_start,period_end,agreed_monthly_cents ON v2_subscription_periods
BEGIN SELECT RAISE(ABORT,'V2_SUBSCRIPTION_LOCKED'); END;

CREATE TABLE v2_usage_ledger (
 id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL REFERENCES v2_subscription_periods(id),
 service_code TEXT NOT NULL REFERENCES v2_services(code),
 metric TEXT NOT NULL CHECK(metric IN ('hours_milli','visits','tickets','reports')),
 quantity INTEGER NOT NULL CHECK(quantity>0), source_key TEXT NOT NULL,
 work_order_id TEXT REFERENCES work_orders(id), booking_id TEXT REFERENCES bookings(id),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(subscription_id,source_key,metric), CHECK(work_order_id IS NULL OR booking_id IS NULL)
) STRICT;
CREATE INDEX v2_usage_subscription ON v2_usage_ledger(subscription_id,metric);
CREATE TRIGGER v2_usage_limit BEFORE INSERT ON v2_usage_ledger
BEGIN
 SELECT RAISE(ABORT,'V2_USAGE_NOT_INCLUDED') WHERE NOT EXISTS(
 SELECT 1 FROM v2_subscription_periods s JOIN v2_engagements e ON e.id=s.engagement_id
 JOIN v2_plan_versions p ON p.id=s.plan_id JOIN v2_plan_services ps ON ps.plan_id=p.id
 JOIN v2_market_service_rules mr ON mr.market_code=e.market_code AND mr.service_code=ps.service_code
 WHERE s.id=NEW.subscription_id AND s.status='active' AND e.status='active'
 AND p.status='approved' AND ps.inclusion='included' AND ps.service_code=NEW.service_code
 AND mr.status='approved' AND NEW.created_at>=s.period_start AND NEW.created_at<s.period_end);
 SELECT RAISE(ABORT,'V2_USAGE_CONTEXT_MISMATCH') WHERE
 (NEW.work_order_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM work_orders o JOIN v2_subscription_periods s ON s.id=NEW.subscription_id
 JOIN v2_engagements e ON e.id=s.engagement_id WHERE o.id=NEW.work_order_id
 AND o.client_id=e.client_id AND o.property_id IS e.property_id AND o.scheme_id IS e.scheme_id))
 OR (NEW.booking_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM bookings b JOIN v2_subscription_periods s ON s.id=NEW.subscription_id
 JOIN v2_engagements e ON e.id=s.engagement_id WHERE b.id=NEW.booking_id
 AND b.client_id=e.client_id AND b.property_id=e.property_id AND e.scheme_id IS NULL));
 SELECT RAISE(ABORT,'V2_ENTITLEMENT_EXCEEDED') WHERE
 (SELECT COALESCE(SUM(u.quantity),0) FROM v2_usage_ledger u WHERE u.subscription_id=NEW.subscription_id AND u.metric=NEW.metric)+NEW.quantity >
 (SELECT CASE NEW.metric WHEN 'hours_milli' THEN p.included_hours_milli
 WHEN 'visits' THEN p.included_visits WHEN 'tickets' THEN p.included_tickets
 ELSE p.included_reports END
 FROM v2_subscription_periods s JOIN v2_plan_versions p ON p.id=s.plan_id WHERE s.id=NEW.subscription_id);
END;
CREATE TRIGGER v2_usage_immutable_u BEFORE UPDATE ON v2_usage_ledger
BEGIN SELECT RAISE(ABORT,'V2_USAGE_IMMUTABLE'); END;
CREATE TRIGGER v2_usage_immutable_d BEFORE DELETE ON v2_usage_ledger
BEGIN SELECT RAISE(ABORT,'V2_USAGE_IMMUTABLE'); END;

CREATE TABLE v2_rate_cards (
 id TEXT PRIMARY KEY, market_code TEXT NOT NULL REFERENCES v2_markets(code),
 version INTEGER NOT NULL CHECK(version>0), status TEXT NOT NULL DEFAULT 'draft'
 CHECK(status IN ('draft','approved','retired')),
 loaded_hourly_cents INTEGER NOT NULL CHECK(loaded_hourly_cents>=0),
 travel_visit_cents INTEGER NOT NULL CHECK(travel_visit_cents>=0),
 fixed_admin_cents INTEGER NOT NULL CHECK(fixed_admin_cents>=0),
 contingency_bp INTEGER NOT NULL CHECK(contingency_bp BETWEEN 0 AND 5000),
 target_margin_bp INTEGER NOT NULL CHECK(target_margin_bp BETWEEN 0 AND 9500),
 gst_bp INTEGER NOT NULL DEFAULT 1000 CHECK(gst_bp BETWEEN 0 AND 3000),
 approved_by TEXT REFERENCES users(id), approved_at TEXT,
 created_at TEXT NOT NULL, UNIQUE(market_code,version)
) STRICT;
CREATE TRIGGER v2_rate_card_lock BEFORE UPDATE ON v2_rate_cards WHEN OLD.status='approved'
BEGIN SELECT RAISE(ABORT,'V2_RATE_CARD_IMMUTABLE'); END;
CREATE TRIGGER v2_rate_card_approval BEFORE UPDATE OF status ON v2_rate_cards WHEN NEW.status='approved'
BEGIN SELECT RAISE(ABORT,'V2_RATE_CARD_REVIEW_REQUIRED') WHERE NEW.approved_by IS NULL OR NEW.approved_at IS NULL; END;

CREATE TABLE v2_quote_snapshots (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id),
 property_id TEXT REFERENCES properties(id), scheme_id TEXT REFERENCES strata_schemes(id),
 market_code TEXT NOT NULL REFERENCES v2_markets(code), service_code TEXT REFERENCES v2_services(code),
 rate_card_id TEXT NOT NULL REFERENCES v2_rate_cards(id), engagement_id TEXT REFERENCES v2_engagements(id),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','accepted','expired')),
 calculation_json TEXT NOT NULL CHECK(json_valid(calculation_json)),
 amount_ex_gst_cents INTEGER NOT NULL CHECK(amount_ex_gst_cents>=0),
 gst_cents INTEGER NOT NULL CHECK(gst_cents>=0), total_cents INTEGER NOT NULL CHECK(total_cents=amount_ex_gst_cents+gst_cents),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK((property_id IS NOT NULL) + (scheme_id IS NOT NULL) = 1)
) STRICT;
CREATE TRIGGER v2_quote_immutable_u BEFORE UPDATE ON v2_quote_snapshots
BEGIN SELECT RAISE(ABORT,'V2_QUOTE_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER v2_quote_immutable_d BEFORE DELETE ON v2_quote_snapshots
BEGIN SELECT RAISE(ABORT,'V2_QUOTE_SNAPSHOT_IMMUTABLE'); END;

-- Existing records receive a new tree, without altering properties or scheme identifiers.
INSERT INTO v2_markets(code,name,reference_unit) VALUES('RES','Residential','dwelling');
INSERT INTO v2_markets(code,name,reference_unit) VALUES('COM','Commercial','premises');
INSERT INTO v2_markets(code,name,reference_unit) VALUES('STR','Strata & Buildings','scheme');
INSERT INTO v2_markets(code,name,reference_unit) VALUES('CTS','Community Titles','community scheme');
INSERT INTO v2_markets(code,name,reference_unit) VALUES('STA','Short-Stay Accommodation','dwelling');
INSERT INTO v2_markets(code,name,reference_unit) VALUES('SOC','Social & Community Housing','dwelling');
INSERT INTO v2_markets(code,name,reference_unit) VALUES('SDA','Specialist Disability Accommodation','dwelling');
INSERT INTO v2_markets(code,name,reference_unit) VALUES('RET','Retirement & Lifestyle Villages','village');
INSERT INTO v2_markets(code,name,reference_unit) VALUES('AGE','Residential Aged Care','facility');
INSERT INTO v2_markets(code,name,reference_unit) VALUES('RUR','Rural & Agricultural','site');
INSERT INTO v2_markets(code,name,reference_unit) VALUES('INS','Institutional & Public Facilities','facility');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-001','Routine Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','routine-inspection');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-002','Property Condition Report (PCR)','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','property-condition-report');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-003','Pre-Vacate Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','pre-vacate-inspection');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-004','Final / Exit Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','final-exit-inspection');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-005','Commercial Property Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','commercial-property-inspection');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-006','Commercial Pre-Vacate / Make-Good Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','commercial-pre-vacate-make-good-inspection');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-007','Commercial Final / Make-Good Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','commercial-final-make-good-inspection');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-008','Common Property Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','common-property-inspection');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-009','Building Management Attendance','attendance','Draft attendance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','building-management-attendance');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-010','Maintenance Attendance','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','maintenance-attendance');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-011','Completed Works Inspection','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','completed-works-inspection');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-012','Follow-Up / Reinspection','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','follow-up-reinspection');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-013','Damage / Incident Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','damage-incident-inspection');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-014','Cleaning & Presentation Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','cleaning-presentation-inspection');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-015','Defect / Rectification Inspection','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','defect-rectification-inspection');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-016','Property Meeting','attendance','Draft attendance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','property-meeting');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-017','Contractor Access Attendance','access','Draft access service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','contractor-access-attendance');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-018','Key / Fob / Remote Handover','access','Draft access service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','key-handover-collection');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-019','Contractor Supervision Attendance','access','Draft access service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','contractor-supervision-attendance');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-020','Move-In / Move-Out Attendance','access','Draft access service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','move-in-move-out-attendance');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-021','Urgent Building Attendance','attendance','Draft attendance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','urgent-building-attendance');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-022','Building Handover Attendance','attendance','Draft attendance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','building-handover-attendance');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-023','Custom Property Attendance','attendance','Draft attendance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','other-custom-appointment');
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-024','Facilities Condition Survey','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-025','SDA Accessibility Condition Observation','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-026','Village Common Amenities Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-027','Rural Infrastructure Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-028','Short-Stay Turnover Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-029','Community Housing Portfolio Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-030','Maintenance Request Triage','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-031','Contractor Quotation Coordination','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-032','Contractor Quote Comparison Support','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-033','Planned Maintenance Coordination','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-034','Warranty and Defect Follow-Up','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-035','Contractor Completion Evidence Review','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-036','Emergency Works Coordination (Availability Dependent)','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-037','Maintenance Record Register','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-038','Asset Register Setup','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-039','Plant and Equipment Service Schedule','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-040','Contractor Service Calendar','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-041','Operational Safety Walkthrough','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-042','Keys and Access Register Review','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-043','Grounds and External Area Review','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-044','Capital Expenditure Planning Support','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-045','Asset Condition Trend Review','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-046','Multi-Site Facilities Audit','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-047','Compliance Obligations Register Setup','compliance','Draft compliance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-048','Compliance Calendar Management','compliance','Draft compliance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-049','Certificate and Evidence Follow-Up','compliance','Draft compliance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-050','Qualified Service Provider Coordination','compliance','Draft compliance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-051','Inspection Evidence Register Reconciliation','compliance','Draft compliance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-052','Fire System Service Coordination','compliance','Draft compliance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-053','Essential Services Evidence Tracking','compliance','Draft compliance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-054','Tenancy Administrative Support','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-055','Owner Correspondence Support','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-056','Scheme and Resident Notice Coordination','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-057','Building Move Coordination','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-058','Stakeholder Liaison','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-059','Operational Handover Pack','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-060','Property Records Administration','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-061','Asset Incident Log','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-062','Contractor Invoice Verification Support','financial','Draft financial service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-063','Maintenance Expenditure Budget Tracking','financial','Draft financial service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-064','Maintenance Cost Summary','financial','Draft financial service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-065','Contract Variation Administration','financial','Draft financial service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-066','Asset Condition Advisory Brief','advisory','Draft advisory service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-067','Asset Lifecycle Forecast Support','advisory','Draft advisory service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-068','Contractor Performance Summary','advisory','Draft advisory service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL);
INSERT INTO v2_services(code,name,family,summary,delivery_gate,legacy_service_id) VALUES('V2-069','Portfolio Operations Reporting','advisory','Draft advisory service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL);
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-001','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-001','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-001','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-001','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-001','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-002','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-002','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-002','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-002','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-002','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-003','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-003','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-003','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-003','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-003','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-004','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-004','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-004','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-004','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-004','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-005','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-005','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-005','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-005','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-006','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-006','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-006','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-006','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-007','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-007','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-007','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-007','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-008','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-008','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-008','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-008','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-008','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-008','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-009','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-009','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-009','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-009','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-009','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-009','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-010','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-010','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-010','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-010','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-010','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-010','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-010','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-010','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-010','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-010','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-010','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-011','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-011','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-011','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-011','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-011','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-011','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-011','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-011','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-011','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-011','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-011','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-012','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-012','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-012','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-012','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-012','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-012','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-012','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-012','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-012','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-012','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-012','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-013','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-013','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-013','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-013','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-013','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-013','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-013','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-013','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-013','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-013','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-013','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-014','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-014','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-014','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-014','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-014','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-014','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-014','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-014','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-014','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-014','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-014','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-015','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-015','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-015','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-015','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-015','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-015','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-015','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-015','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-015','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-015','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-015','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-016','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-016','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-016','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-016','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-016','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-016','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-016','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-016','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-016','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-016','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-016','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-017','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-017','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-017','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-017','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-017','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-017','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-017','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-017','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-017','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-017','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-017','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-018','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-018','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-018','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-018','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-018','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-018','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-018','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-018','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-018','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-018','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-018','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-019','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-019','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-019','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-019','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-019','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-019','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-019','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-019','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-019','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-019','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-019','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-020','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-020','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-020','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-020','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-020','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-020','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-020','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-020','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-020','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-020','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-020','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-021','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-021','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-021','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-021','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-021','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-021','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-022','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-022','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-022','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-022','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-022','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-022','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-023','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-023','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-023','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-023','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-023','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-023','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-023','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-023','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-023','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-023','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-023','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-024','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-024','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-024','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-024','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-024','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-024','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-025','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-025','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-025','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-025','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-026','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-026','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-026','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-026','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-027','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-027','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-027','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-028','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-028','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-028','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-028','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-028','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-029','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-029','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-029','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-029','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-029','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-030','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-030','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-030','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-030','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-030','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-030','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-030','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-030','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-030','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-030','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-030','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-031','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-031','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-031','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-031','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-031','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-031','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-031','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-031','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-031','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-031','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-031','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-032','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-032','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-032','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-032','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-032','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-032','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-032','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-032','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-032','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-032','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-032','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-033','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-033','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-033','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-033','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-033','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-033','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-033','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-033','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-033','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-033','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-033','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-034','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-034','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-034','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-034','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-034','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-034','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-034','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-034','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-034','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-034','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-034','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-035','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-035','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-035','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-035','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-035','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-035','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-035','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-035','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-035','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-035','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-035','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-036','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-036','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-036','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-036','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-036','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-036','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-036','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-036','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-036','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-036','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-036','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-037','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-037','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-037','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-037','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-037','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-037','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-037','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-037','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-037','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-037','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-037','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-038','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-038','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-038','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-038','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-038','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-038','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-038','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-038','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-038','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-038','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-038','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-039','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-039','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-039','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-039','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-039','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-039','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-040','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-040','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-040','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-040','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-040','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-040','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-040','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-040','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-040','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-040','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-040','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-041','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-041','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-041','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-041','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-041','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-041','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-041','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-041','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-041','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-041','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-041','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-042','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-042','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-042','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-042','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-042','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-042','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-042','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-042','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-042','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-042','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-042','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-043','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-043','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-043','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-043','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-043','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-043','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-043','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-043','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-043','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-043','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-043','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-044','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-044','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-044','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-044','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-044','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-044','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-045','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-045','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-045','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-045','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-045','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-045','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-045','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-045','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-045','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-045','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-045','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-046','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-046','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-046','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-046','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-046','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-046','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-046','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-046','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-046','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-046','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-046','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-047','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-047','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-047','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-047','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-047','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-047','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-047','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-047','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-047','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-047','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-047','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-048','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-048','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-048','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-048','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-048','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-048','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-048','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-048','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-048','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-048','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-048','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-049','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-049','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-049','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-049','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-049','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-049','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-049','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-049','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-049','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-049','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-049','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-050','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-050','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-050','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-050','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-050','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-050','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-050','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-050','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-050','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-050','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-050','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-051','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-051','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-051','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-051','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-051','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-051','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-051','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-051','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-051','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-051','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-051','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-052','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-052','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-052','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-052','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-052','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-052','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-053','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-053','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-053','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-053','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-053','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-053','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-054','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-054','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-054','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-054','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-054','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-055','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-055','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-055','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-055','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-055','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-056','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-056','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-056','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-056','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-056','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-056','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-057','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-057','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-057','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-057','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-057','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-057','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-058','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-058','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-058','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-058','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-058','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-058','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-058','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-058','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-058','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-058','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-058','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-059','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-059','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-059','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-059','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-059','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-059','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-059','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-059','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-059','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-059','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-059','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-060','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-060','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-060','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-060','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-060','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-060','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-060','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-060','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-060','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-060','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-060','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-061','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-061','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-061','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-061','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-061','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-061','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-061','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-061','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-061','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-061','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-061','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-062','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-062','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-062','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-062','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-062','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-062','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-062','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-062','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-062','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-062','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-062','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-063','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-063','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-063','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-063','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-063','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-063','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-063','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-063','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-063','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-063','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-063','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-064','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-064','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-064','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-064','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-064','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-064','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-064','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-064','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-064','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-064','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-064','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-065','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-065','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-065','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-065','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-065','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-065','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-065','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-065','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-065','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-065','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-065','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-066','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-066','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-066','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-066','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-066','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-066','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-066','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-066','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-066','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-066','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-066','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-067','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-067','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-067','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-067','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-067','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-067','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-067','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-067','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-067','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-067','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-067','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-068','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-068','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-068','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-068','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-068','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-068','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-068','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-068','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-068','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-068','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-068','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RES','V2-069','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('COM','V2-069','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STR','V2-069','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('CTS','V2-069','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('STA','V2-069','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SOC','V2-069','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('SDA','V2-069','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RET','V2-069','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('AGE','V2-069','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('RUR','V2-069','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_market_service_rules(market_code,service_code,status,notes) VALUES('INS','V2-069','proposed','Preliminary applicability - not approved for sale');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('RES:inspection:v1','RES','inspection',1,'draft','dwelling');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('RES:standard:v1','RES','standard',1,'draft','dwelling');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('RES:outsourced:v1','RES','outsourced',1,'draft','dwelling');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('COM:inspection:v1','COM','inspection',1,'draft','premises');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('COM:standard:v1','COM','standard',1,'draft','premises');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('COM:outsourced:v1','COM','outsourced',1,'draft','premises');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('STR:inspection:v1','STR','inspection',1,'draft','scheme');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('STR:standard:v1','STR','standard',1,'draft','scheme');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('STR:outsourced:v1','STR','outsourced',1,'draft','scheme');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('CTS:inspection:v1','CTS','inspection',1,'draft','community scheme');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('CTS:standard:v1','CTS','standard',1,'draft','community scheme');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('CTS:outsourced:v1','CTS','outsourced',1,'draft','community scheme');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('STA:inspection:v1','STA','inspection',1,'draft','dwelling');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('STA:standard:v1','STA','standard',1,'draft','dwelling');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('STA:outsourced:v1','STA','outsourced',1,'draft','dwelling');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('SOC:inspection:v1','SOC','inspection',1,'draft','dwelling');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('SOC:standard:v1','SOC','standard',1,'draft','dwelling');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('SOC:outsourced:v1','SOC','outsourced',1,'draft','dwelling');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('SDA:inspection:v1','SDA','inspection',1,'draft','dwelling');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('SDA:standard:v1','SDA','standard',1,'draft','dwelling');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('SDA:outsourced:v1','SDA','outsourced',1,'draft','dwelling');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('RET:inspection:v1','RET','inspection',1,'draft','village');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('RET:standard:v1','RET','standard',1,'draft','village');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('RET:outsourced:v1','RET','outsourced',1,'draft','village');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('AGE:inspection:v1','AGE','inspection',1,'draft','facility');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('AGE:standard:v1','AGE','standard',1,'draft','facility');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('AGE:outsourced:v1','AGE','outsourced',1,'draft','facility');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('RUR:inspection:v1','RUR','inspection',1,'draft','site');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('RUR:standard:v1','RUR','standard',1,'draft','site');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('RUR:outsourced:v1','RUR','outsourced',1,'draft','site');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('INS:inspection:v1','INS','inspection',1,'draft','facility');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('INS:standard:v1','INS','standard',1,'draft','facility');
INSERT INTO v2_plan_versions(id,market_code,plan_code,version,status,reference_unit) VALUES('INS:outsourced:v1','INS','outsourced',1,'draft','facility');
INSERT INTO v2_assets(id,property_id,kind,name,created_at)
 SELECT 'v2:property:'||id,id,'site',address,CURRENT_TIMESTAMP FROM properties;
INSERT INTO v2_assets(id,scheme_id,kind,name,created_at)
 SELECT 'v2:scheme:'||id,id,'site',name,CURRENT_TIMESTAMP FROM strata_schemes;
INSERT INTO v2_assets(id,scheme_id,parent_id,kind,name,created_at)
 SELECT 'v2:building:'||id,scheme_id,'v2:scheme:'||scheme_id,'building',name,CURRENT_TIMESTAMP FROM scheme_buildings;
INSERT INTO v2_assets(id,scheme_id,parent_id,kind,name,created_at)
 SELECT 'v2:area:'||id,scheme_id,COALESCE('v2:building:'||building_id,'v2:scheme:'||scheme_id),'common_area',name,CURRENT_TIMESTAMP FROM common_property_areas;
INSERT INTO v2_assets(id,scheme_id,parent_id,kind,name,created_at)
 SELECT 'v2:lot:'||id,scheme_id,COALESCE('v2:building:'||building_id,'v2:scheme:'||scheme_id),'lot',lot_number,CURRENT_TIMESTAMP FROM strata_lots;
INSERT INTO v2_asset_markets(id,property_id,market_code)
 SELECT 'v2:market:property:'||id,id,CASE sector WHEN 'residential' THEN 'RES' WHEN 'commercial' THEN 'COM' ELSE 'STR' END FROM properties;
INSERT INTO v2_asset_markets(id,scheme_id,market_code) SELECT 'v2:market:scheme:'||id,id,'STR' FROM strata_schemes;

CREATE TRIGGER v2_property_root AFTER INSERT ON properties BEGIN
 INSERT INTO v2_assets(id,property_id,kind,name,created_at) VALUES('v2:property:'||NEW.id,NEW.id,'site',NEW.address,CURRENT_TIMESTAMP);
 INSERT INTO v2_asset_markets(id,property_id,market_code) VALUES('v2:market:property:'||NEW.id,NEW.id,CASE NEW.sector WHEN 'residential' THEN 'RES' WHEN 'commercial' THEN 'COM' ELSE 'STR' END);
END;
CREATE TRIGGER v2_scheme_root AFTER INSERT ON strata_schemes BEGIN
 INSERT INTO v2_assets(id,scheme_id,kind,name,created_at) VALUES('v2:scheme:'||NEW.id,NEW.id,'site',NEW.name,CURRENT_TIMESTAMP);
 INSERT INTO v2_asset_markets(id,scheme_id,market_code) VALUES('v2:market:scheme:'||NEW.id,NEW.id,'STR');
END;
CREATE TRIGGER v2_scheme_building_sync AFTER INSERT ON scheme_buildings BEGIN
 INSERT INTO v2_assets(id,scheme_id,parent_id,kind,name,created_at)
 VALUES('v2:building:'||NEW.id,NEW.scheme_id,'v2:scheme:'||NEW.scheme_id,'building',NEW.name,CURRENT_TIMESTAMP);
END;
CREATE TRIGGER v2_scheme_area_sync AFTER INSERT ON common_property_areas BEGIN
 INSERT INTO v2_assets(id,scheme_id,parent_id,kind,name,created_at)
 VALUES('v2:area:'||NEW.id,NEW.scheme_id,COALESCE('v2:building:'||NEW.building_id,'v2:scheme:'||NEW.scheme_id),'common_area',NEW.name,CURRENT_TIMESTAMP);
END;
CREATE TRIGGER v2_scheme_lot_sync AFTER INSERT ON strata_lots BEGIN
 INSERT INTO v2_assets(id,scheme_id,parent_id,kind,name,created_at)
 VALUES('v2:lot:'||NEW.id,NEW.scheme_id,COALESCE('v2:building:'||NEW.building_id,'v2:scheme:'||NEW.scheme_id),'lot',NEW.lot_number,CURRENT_TIMESTAMP);
END;
