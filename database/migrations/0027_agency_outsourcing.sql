-- Agency-managed owner access and approved commercial billing. Additive only.
CREATE TABLE agency_owner_grants (
 id TEXT PRIMARY KEY,
 agency_client_id TEXT NOT NULL REFERENCES clients(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 management_id TEXT NOT NULL REFERENCES property_management_relationships(id),
 owner_user_id TEXT NOT NULL REFERENCES users(id),
 verified_by TEXT NOT NULL REFERENCES users(id),
 authority_reference TEXT NOT NULL,
 allow_inspections INTEGER NOT NULL DEFAULT 1 CHECK(allow_inspections IN (0,1)),
 allow_reports INTEGER NOT NULL DEFAULT 0 CHECK(allow_reports IN (0,1)),
 revoked_at TEXT,
 created_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX agency_owner_one_active ON agency_owner_grants(agency_client_id,property_id,owner_user_id) WHERE revoked_at IS NULL;
CREATE INDEX agency_owner_user ON agency_owner_grants(owner_user_id,revoked_at);
CREATE TABLE agency_owner_report_shares (
 grant_id TEXT NOT NULL REFERENCES agency_owner_grants(id),
 document_id TEXT NOT NULL REFERENCES documents(id),
 shared_by TEXT NOT NULL REFERENCES users(id),
 shared_at TEXT NOT NULL,
 PRIMARY KEY(grant_id,document_id)
) STRICT;
CREATE TABLE agency_commercial_agreements (
 id TEXT PRIMARY KEY,
 client_id TEXT NOT NULL REFERENCES clients(id),
 reference TEXT NOT NULL UNIQUE,
 tier TEXT NOT NULL CHECK(tier IN ('50_149','150_499','500_1000','custom')),
 pricing_model TEXT NOT NULL CHECK(pricing_model IN ('per_service','retainer','hybrid')),
 base_monthly_cents INTEGER NOT NULL CHECK(base_monthly_cents>=0),
 gst_basis_points INTEGER NOT NULL CHECK(gst_basis_points BETWEEN 0 AND 10000),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','ended')),
 effective_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 approved_by TEXT REFERENCES users(id),
 approval_reference TEXT,
 created_at TEXT NOT NULL
) STRICT;
CREATE TABLE agency_contract_rates (
 agreement_id TEXT NOT NULL REFERENCES agency_commercial_agreements(id),
 service_id TEXT NOT NULL REFERENCES services(id),
 rate_cents INTEGER NOT NULL CHECK(rate_cents>=0),
 included INTEGER NOT NULL CHECK(included IN (0,1)),
 PRIMARY KEY(agreement_id,service_id),
 CHECK(included=0 OR rate_cents=0)
) STRICT;
CREATE TABLE agency_billable_work (
 id TEXT PRIMARY KEY,
 agreement_id TEXT NOT NULL REFERENCES agency_commercial_agreements(id),
 work_order_id TEXT NOT NULL UNIQUE REFERENCES work_orders(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 service_id TEXT NOT NULL REFERENCES services(id),
 charge_cents INTEGER NOT NULL CHECK(charge_cents>=0),
 completed_at TEXT NOT NULL,
 recorded_by TEXT NOT NULL REFERENCES users(id)
) STRICT;
CREATE TABLE agency_monthly_statements (
 id TEXT PRIMARY KEY,
 agreement_id TEXT NOT NULL REFERENCES agency_commercial_agreements(id),
 period TEXT NOT NULL CHECK(period GLOB '????-??'),
 subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents>=0),
 gst_cents INTEGER NOT NULL CHECK(gst_cents>=0),
 total_cents INTEGER NOT NULL CHECK(total_cents=subtotal_cents+gst_cents),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved')),
 prepared_by TEXT NOT NULL REFERENCES users(id),
 approved_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL,
 UNIQUE(agreement_id,period)
) STRICT;
CREATE TABLE agency_statement_lines (
 id TEXT PRIMARY KEY,
 statement_id TEXT NOT NULL REFERENCES agency_monthly_statements(id),
 billable_work_id TEXT UNIQUE REFERENCES agency_billable_work(id),
 property_id TEXT REFERENCES properties(id),
 description TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0)
) STRICT;