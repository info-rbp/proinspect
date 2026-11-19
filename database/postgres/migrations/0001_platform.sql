-- Generated from pristine repository migrations. See scripts/migration/postgres-schema.py.

-- Apply to a fresh UTF-8 database with LC_CTYPE=C so citext matches SQLite's ASCII NOCASE.
DO $$
BEGIN
  IF (SELECT datctype FROM pg_database WHERE datname = current_database()) NOT IN ('C', 'POSIX') THEN
    RAISE EXCEPTION 'PostgreSQL migration requires LC_CTYPE=C for the existing email uniqueness contract';
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;
CREATE SCHEMA pi_compat;
CREATE FUNCTION pi_compat.strftime(fmt text, val text, delta text DEFAULT '0 hours')
RETURNS text LANGUAGE plpgsql STABLE STRICT AS $$
DECLARE
  instant timestamp := ((CASE WHEN val = 'now' THEN statement_timestamp() ELSE val::timestamptz END)
                         AT TIME ZONE 'UTC') + delta::interval;
BEGIN
  CASE fmt
    WHEN '%Y-%m-%dT%H:%M:%fZ' THEN RETURN to_char(instant, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    WHEN '%Y-%m-%d' THEN RETURN to_char(instant, 'YYYY-MM-DD');
    WHEN '%M' THEN RETURN to_char(instant, 'MI');
    WHEN '%H' THEN RETURN to_char(instant, 'HH24');
    WHEN '%s' THEN RETURN floor(extract(epoch FROM instant))::bigint::text;
    WHEN '%w' THEN RETURN extract(dow FROM instant)::integer::text;
    ELSE RAISE EXCEPTION 'Unsupported strftime format %', fmt;
  END CASE;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
END $$;
CREATE FUNCTION pi_compat.julianday(val text) RETURNS numeric
LANGUAGE plpgsql STABLE STRICT AS $$
BEGIN
  RETURN extract(epoch FROM val::timestamptz) / 86400 + 2440587.5;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
END $$;
-- JSON stays text to preserve exact envelope and signed payload bytes.
CREATE FUNCTION pi_compat.json_length(val text) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE WHEN json_typeof(val::json) = 'array' THEN json_array_length(val::json) ELSE 0 END
$$;
-- Serialize nonproduction writers ahead of row/trigger reads, including direct SQL writes.
-- A second statement on a waiting READ COMMITTED connection observes the preceding commit.
CREATE FUNCTION pi_compat.writer_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(1701996912, 1);
  RETURN NULL;
END $$;
CREATE FUNCTION pi_compat.json_each(val text) RETURNS TABLE(value text)
LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT json_array_elements_text(val::json) $$;
CREATE FUNCTION pi_compat.json_extract(val text, path text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT val::json #>> string_to_array(substr(path, 3), '.') $$;
CREATE FUNCTION pi_compat.scalar_min(a anycompatible, b anycompatible) RETURNS anycompatible
LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT least(a,b) $$;
CREATE FUNCTION pi_compat.scalar_max(a anycompatible, b anycompatible) RETURNS anycompatible
LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT greatest(a,b) $$;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email public.citext NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  active BIGINT NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  created_at TEXT NOT NULL,
  verified_at TEXT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email public.citext NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  return_to TEXT NOT NULL DEFAULT '/workspaces',
  created_at TEXT NOT NULL
);

CREATE TABLE auth_rate_limits (
  bucket TEXT PRIMARY KEY,
  attempts BIGINT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE staff_profiles (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN('administrator','operations_manager','inspector','read_only')),
  active BIGINT NOT NULL DEFAULT 1 CHECK(active IN(0,1))
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_type TEXT NOT NULL CHECK(client_type IN('landlord','agency','commercial_landlord','strata_company','asset_manager','other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','pending','inactive')),
  billing_email TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE client_memberships (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN('owner','admin','member','viewer')),
  active BIGINT NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(client_id,user_id)
);

CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  suburb TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'WA',
  postcode TEXT NOT NULL,
  address_key TEXT NOT NULL UNIQUE,
  sector TEXT NOT NULL CHECK(sector IN('residential','commercial','strata-building')),
  property_type TEXT NOT NULL DEFAULT 'House',
  created_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE client_property_links (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN('owner','landlord','managing_agent','asset_manager','strata_manager','other')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  UNIQUE(client_id,property_id,role,starts_at),
  CHECK(ends_at IS NULL OR ends_at>starts_at)
);

CREATE TABLE property_management_relationships (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  manager_client_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN('self_managed','agency_managed','commercial_managed')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  CHECK(ends_at IS NULL OR ends_at>starts_at)
);

CREATE TABLE portfolio_assignments (
  user_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  PRIMARY KEY(user_id,property_id,client_id)
);

CREATE TABLE tenancies (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('pending','active','ended')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  reference TEXT,
  version BIGINT NOT NULL DEFAULT 1,
  bond_reference TEXT,
  rent_cents BIGINT CHECK(rent_cents IS NULL OR rent_cents>=0),
  CHECK(ends_at IS NULL OR ends_at>starts_at)
);

CREATE TABLE tenancy_memberships (
  id TEXT PRIMARY KEY,
  tenancy_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  UNIQUE(tenancy_id,user_id),
  CHECK(ends_at IS NULL OR ends_at>starts_at)
);

CREATE TABLE invitations (
  token_hash TEXT PRIMARY KEY,
  email public.citext NOT NULL,
  tenancy_id TEXT,
  client_id TEXT,
  role TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK((tenancy_id IS NOT NULL)::integer+ (client_id IS NOT NULL)::integer=1)
);

CREATE TABLE strata_schemes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scheme_number TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE scheme_client_links (
  id TEXT PRIMARY KEY,
  scheme_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN('strata_manager','strata_company','building_manager')),
  starts_at TEXT NOT NULL,
  ends_at TEXT
);

CREATE TABLE scheme_buildings (
  id TEXT PRIMARY KEY,
  scheme_id TEXT NOT NULL,
  name TEXT NOT NULL,
  property_id TEXT,
  UNIQUE(scheme_id,name)
);

CREATE TABLE strata_lots (
  id TEXT PRIMARY KEY,
  scheme_id TEXT NOT NULL,
  lot_number TEXT NOT NULL,
  building_id TEXT,
  property_id TEXT UNIQUE,
  UNIQUE(scheme_id,lot_number)
);

CREATE TABLE common_property_areas (
  id TEXT PRIMARY KEY,
  scheme_id TEXT NOT NULL,
  building_id TEXT,
  name TEXT NOT NULL
);

CREATE TABLE scheme_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scheme_id TEXT NOT NULL,
  lot_id TEXT,
  role TEXT NOT NULL CHECK(role IN('resident','owner','council_member')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  approved_by TEXT NOT NULL,
  CHECK(ends_at IS NULL OR ends_at>starts_at)
);

CREATE TABLE scheme_authority_profiles (
  scheme_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  spending_limit_cents BIGINT NOT NULL DEFAULT 0 CHECK(spending_limit_cents>=0),
  authority_reference TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  PRIMARY KEY(scheme_id,client_id)
);

CREATE TABLE building_notices (
  id TEXT PRIMARY KEY,
  scheme_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL CHECK(audience IN('residents','owners','council','all_members')),
  starts_at TEXT NOT NULL,
  expires_at TEXT,
  created_by TEXT NOT NULL,
  work_order_id TEXT,
  building_id TEXT,
  lot_id TEXT,
  version BIGINT NOT NULL DEFAULT 1,
  withdrawn_at TEXT
);

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  family TEXT NOT NULL,
  sectors_json TEXT NOT NULL CHECK((sectors_json IS JSON)),
  summary TEXT NOT NULL,
  duration_minutes BIGINT NOT NULL CHECK(duration_minutes>0 AND duration_minutes<=480),
  buffer_before BIGINT NOT NULL DEFAULT 15 CHECK(buffer_before>=0),
  buffer_after BIGINT NOT NULL DEFAULT 15 CHECK(buffer_after>=0),
  notice_hours BIGINT NOT NULL DEFAULT 24 CHECK(notice_hours>=0),
  horizon_days BIGINT NOT NULL DEFAULT 60 CHECK(horizon_days>0),
  price_ex_gst_cents BIGINT CHECK(price_ex_gst_cents>=0),
  active BIGINT NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  booking_mode TEXT NOT NULL DEFAULT 'request' CHECK(booking_mode IN('instant','request'))
);

CREATE TABLE schedule_resources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active BIGINT NOT NULL DEFAULT 1 CHECK(active IN(0,1))
);

CREATE TABLE schedule_blocks (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'Unavailable',
  CHECK(ends_at>starts_at)
);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reserved_start TEXT NOT NULL,
  reserved_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN('confirmed','completed','cancelled')),
  price_ex_gst_cents BIGINT CHECK(price_ex_gst_cents>=0),
  snapshot_json TEXT NOT NULL CHECK((snapshot_json IS JSON)),
  request_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  scheme_id TEXT,
  UNIQUE(client_id,request_key),
  CHECK(ends_at>starts_at),
  CHECK(reserved_start<=starts_at AND reserved_end>=ends_at)
);

CREATE TABLE booking_access_secrets (
  booking_id TEXT PRIMARY KEY,
  envelope TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  client_id TEXT,
  property_id TEXT,
  tenancy_id TEXT,
  scheme_id TEXT,
  area_id TEXT,
  created_by TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN('client','tenant','building','staff')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN('routine','urgent','emergency')),
  status TEXT NOT NULL CHECK(status IN('submitted','under_review','action_required','in_progress','completed','closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  lot_id TEXT,
  location_kind TEXT CHECK(location_kind IS NULL OR location_kind IN('common','lot','unsure')),
  co_living_space_id TEXT,
  CHECK(property_id IS NOT NULL OR scheme_id IS NOT NULL)
);

CREATE TABLE contractors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  active BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE work_orders (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  booking_id TEXT UNIQUE,
  request_id TEXT UNIQUE,
  client_id TEXT,
  property_id TEXT,
  scheme_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('triage','quote_required','awaiting_approval','approved','assigned','scheduled','in_progress','report_pending','completed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'routine' CHECK(priority IN('routine','urgent','emergency')),
  assigned_staff_id TEXT,
  contractor_id TEXT,
  completion_notes TEXT,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approval_required BIGINT NOT NULL DEFAULT 0 CHECK(approval_required IN(0,1)),
  resident_visible BIGINT NOT NULL DEFAULT 0 CHECK(resident_visible IN(0,1)),
  public_summary TEXT,
  scheduled_at TEXT,
  CHECK(property_id IS NOT NULL OR scheme_id IS NOT NULL)
);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  decision_user_id TEXT,
  client_id TEXT,
  scheme_id TEXT,
  amount_cents BIGINT NOT NULL CHECK(amount_cents>=0),
  summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('pending','approved','changes_requested','declined')),
  response_comment TEXT,
  authority_reference TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  version BIGINT NOT NULL DEFAULT 1,
  decision_scope TEXT NOT NULL DEFAULT 'client' CHECK(decision_scope IN('client','council','named_user')),
  target_user_id TEXT,
  pi_rowid bigint GENERATED ALWAYS AS IDENTITY UNIQUE
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  property_id TEXT,
  work_order_id TEXT,
  description TEXT NOT NULL,
  amount_ex_gst_cents BIGINT NOT NULL CHECK(amount_ex_gst_cents>=0),
  gst_cents BIGINT NOT NULL CHECK(gst_cents>=0),
  total_cents BIGINT NOT NULL CHECK(total_cents=amount_ex_gst_cents+gst_cents),
  currency TEXT NOT NULL DEFAULT 'AUD' CHECK(currency='AUD'),
  status TEXT NOT NULL CHECK(status IN('pending','payment_required','paid','failed','refunded','waived')),
  provider TEXT NOT NULL DEFAULT 'manual',
  external_reference TEXT,
  created_at TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  due_at TEXT,
  checkout_session_id TEXT,
  checkout_url TEXT,
  updated_at TEXT,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  refunded_cents BIGINT NOT NULL DEFAULT 0 CHECK(refunded_cents>=0 AND refunded_cents<=total_cents)
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  property_id TEXT,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('active','paused','ended')),
  allowance_json TEXT NOT NULL DEFAULT '{}' CHECK((allowance_json IS JSON)),
  created_at TEXT NOT NULL
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  property_id TEXT,
  scheme_id TEXT,
  tenancy_id TEXT,
  booking_id TEXT,
  work_order_id TEXT,
  request_id TEXT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size BIGINT NOT NULL CHECK(size>0),
  sha256 TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  source_report_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK(status IN('draft','generated','review','approved','issued','archived')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  issued_at TEXT,
  previous_document_id TEXT,
  uploaded_client_id TEXT,
  CHECK(property_id IS NOT NULL OR scheme_id IS NOT NULL)
);

CREATE TABLE document_grants (
  document_id TEXT NOT NULL,
  recipient_kind TEXT NOT NULL CHECK(recipient_kind IN('client','user','tenancy','scheme_resident','scheme_owner','scheme_council')),
  recipient_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(document_id,recipient_kind,recipient_id)
);

CREATE TABLE document_requests (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  product_code TEXT NOT NULL,
  title TEXT NOT NULL,
  answers_envelope TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('submitted','under_review','awaiting_information','in_preparation','review','ready','completed','cancelled')),
  document_id TEXT,
  created_at TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TEXT
);

CREATE TABLE statutory_forms (
  id TEXT PRIMARY KEY,
  tenancy_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  form_code TEXT NOT NULL,
  definition_version TEXT NOT NULL,
  answers_envelope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  issued_document_id TEXT,
  service_reference TEXT,
  updated_at TEXT
);

CREATE TABLE restricted_form_cases (
  id TEXT PRIMARY KEY,
  applicant_user_id TEXT NOT NULL,
  tenancy_id TEXT NOT NULL,
  envelope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE restricted_case_grants (
  case_id TEXT NOT NULL,
  staff_user_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  PRIMARY KEY(case_id,staff_user_id)
);

CREATE TABLE restricted_evidence (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  envelope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  size BIGINT
);

CREATE TABLE restricted_audit (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  href TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE TABLE communications (
  id TEXT PRIMARY KEY,
  property_id TEXT,
  scheme_id TEXT,
  recipient_user_id TEXT,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  property_id TEXT,
  scheme_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK((metadata_json IS JSON)),
  created_at TEXT NOT NULL
);

CREATE TABLE outbox_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  envelope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','sent','failed')),
  attempts BIGINT NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  lease_until TEXT,
  lease_token TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  error_code TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK((value_json IS JSON)),
  updated_at TEXT NOT NULL
);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  enquiry TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE mutation_guards (
  changed_rows BIGINT NOT NULL CHECK(changed_rows=1)
);

CREATE TABLE tenant_inspections (
  booking_id TEXT NOT NULL,
  tenancy_id TEXT NOT NULL,
  notice_document_id TEXT,
  published_by TEXT NOT NULL,
  published_at TEXT NOT NULL,
  notice_reference TEXT,
  PRIMARY KEY(booking_id,tenancy_id)
);

CREATE TABLE client_entitlements (
  client_id TEXT NOT NULL,
  workspace_kind TEXT NOT NULL CHECK(workspace_kind IN('landlord','property-manager','strata-manager','commercial')),
  active BIGINT NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  approved_by TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(client_id,workspace_kind)
);

CREATE TABLE organisation_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  workspace_kind TEXT NOT NULL CHECK(workspace_kind IN('property-manager','strata-manager','commercial')),
  business_reference TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('pending','approved','declined')),
  client_id TEXT,
  reviewed_by TEXT,
  review_reference TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE portal_invitations (
  token_hash TEXT PRIMARY KEY,
  email public.citext NOT NULL,
  client_id TEXT,
  scheme_id TEXT,
  lot_id TEXT,
  role TEXT NOT NULL CHECK(role IN('admin','member','viewer','resident','owner','council_member')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  council_review_id TEXT,
  CHECK((client_id IS NOT NULL)::integer+ (scheme_id IS NOT NULL)::integer=1),
  CHECK(ends_at IS NULL OR ends_at>starts_at)
);

CREATE TABLE portfolio_owners (
  property_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  PRIMARY KEY(property_id,client_id)
);

CREATE TABLE management_authorities (
  property_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  spending_limit_cents BIGINT NOT NULL DEFAULT 0 CHECK(spending_limit_cents>=0),
  authority_reference TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  PRIMARY KEY(property_id,client_id)
);

CREATE TABLE portfolio_imports (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  envelope TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('preview','applied')),
  created_at TEXT NOT NULL,
  applied_at TEXT
);

CREATE TABLE bulk_booking_runs (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  request_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(client_id,request_key)
);

CREATE TABLE recurring_plans (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  interval_months BIGINT NOT NULL CHECK(interval_months BETWEEN 1 AND 24),
  next_due TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('active','paused','ended')),
  version BIGINT NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE plan_occurrences (
  plan_id TEXT NOT NULL,
  due_date TEXT NOT NULL,
  booking_id TEXT NOT NULL UNIQUE,
  PRIMARY KEY(plan_id,due_date)
);

CREATE TABLE council_responses (
  approval_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  response TEXT NOT NULL CHECK(response IN('support','oppose','information')),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY(approval_id,user_id)
);

CREATE TABLE request_comments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL CHECK(audience IN('requester','staff')),
  created_at TEXT NOT NULL
);

CREATE TABLE request_attachments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size BIGINT NOT NULL CHECK(size>0),
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('quarantined','released','rejected')),
  review_reference TEXT,
  reviewed_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(request_id,sha256)
);

CREATE TABLE payment_events (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  actor_id TEXT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reference TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE webhook_receipts (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(provider,event_id)
);

CREATE TABLE report_handoffs (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  document_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE integration_deliveries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK((payload_json IS JSON)),
  status TEXT NOT NULL CHECK(status IN('pending','sent','failed')),
  attempts BIGINT NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  lease_token TEXT,
  lease_until TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE statutory_case_events (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reference TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE pcr_responses (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  tenancy_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  response_envelope TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('submitted','acknowledged')),
  created_at TEXT NOT NULL,
  acknowledged_by TEXT,
  UNIQUE(document_id,user_id)
);

CREATE TABLE restricted_reviewers (
  staff_user_id TEXT PRIMARY KEY,
  active BIGINT NOT NULL DEFAULT 1 CHECK(active IN(0,1))
);

CREATE TABLE action_receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  request_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK((result_json IS JSON)),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,action,request_key)
);

CREATE TABLE marketing_enquiries (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  request_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  envelope TEXT NOT NULL,
  service_id TEXT,
  enquiry_kind TEXT NOT NULL CHECK(enquiry_kind IN('service','portfolio','strata','other')),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN('new','reviewing','awaiting_customer','qualified','closed','spam')),
  assigned_user_id TEXT,
  linked_client_id TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE enquiry_events (
  id TEXT PRIMARY KEY,
  enquiry_id TEXT NOT NULL,
  actor_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN('received','updated','reply','linked')),
  envelope TEXT NOT NULL,
  outbox_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE notice_dispatch_jobs (
  notice_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','completed','cancelled','failed')),
  cursor_user_id TEXT NOT NULL DEFAULT '',
  lease_token TEXT,
  lease_until TEXT,
  attempts BIGINT NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  last_error TEXT,
  completed_at TEXT
);

CREATE TABLE notice_deliveries (
  notice_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  notification_id TEXT NOT NULL UNIQUE,
  outbox_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN('queued','sent','suppressed','failed')),
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  PRIMARY KEY(notice_id,user_id)
);

CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY,
  report_email BIGINT NOT NULL DEFAULT 1 CHECK(report_email IN(0,1)),
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  updated_at TEXT NOT NULL
);

CREATE TABLE booking_calendar_sync (
  booking_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  target_version BIGINT NOT NULL CHECK(target_version>0),
  synced_version BIGINT CHECK(synced_version>0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN('pending','processing','synced','attention')),
  attempts BIGINT NOT NULL DEFAULT 0 CHECK(attempts>=0),
  next_attempt_at TEXT NOT NULL,
  lease_token TEXT,
  lease_until TEXT,
  error_code TEXT,
  synced_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE guest_service_orders (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  request_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  envelope TEXT NOT NULL,
  service_id TEXT NOT NULL,
  sector TEXT NOT NULL CHECK(sector IN ('residential','commercial','strata-building')),
  status TEXT NOT NULL DEFAULT 'pending_verification'
   CHECK(status IN ('pending_verification','verified','quote_requested','quote_sent','awaiting_appointment','review_required','confirmed','cancelled')),
  price_basis TEXT NOT NULL CHECK(price_basis IN ('published','quote')),
  price_ex_gst_cents BIGINT CHECK(price_ex_gst_cents IS NULL OR price_ex_gst_cents>=0),
  quote_expires_at TEXT,
  property_id TEXT,
  property_reviewed_by TEXT,
  property_reviewed_at TEXT,
  booking_id TEXT UNIQUE,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sale_variant_id TEXT,
  sale_quantity BIGINT NOT NULL DEFAULT 1 CHECK(sale_quantity BETWEEN 1 AND 500),
  gst_cents BIGINT CHECK(gst_cents>=0),
  pricing_snapshot_json TEXT CHECK(pricing_snapshot_json IS NULL OR (pricing_snapshot_json IS JSON)),
  offer_code TEXT CHECK(offer_code IS NULL OR offer_code='pcr100'),
  purchaser_email_hash TEXT,
  CHECK(price_basis='quote' OR price_ex_gst_cents IS NOT NULL)
);

CREATE TABLE guest_access_links (
  token_hash TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('verify','manage','quote','report')),
  document_id TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  CHECK((purpose='report')=(document_id IS NOT NULL))
);

CREATE TABLE guest_request_limits (
  bucket TEXT PRIMARY KEY,
  attempts BIGINT NOT NULL CHECK(attempts>0),
  expires_at TEXT NOT NULL
);

CREATE TABLE guest_reminder_deliveries (
  booking_id TEXT PRIMARY KEY,
  outbox_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE leasing_listings (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  instructed_by_client_id TEXT NOT NULL,
  owner_client_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN('residential','commercial')),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  display_address TEXT NOT NULL,
  suburb TEXT NOT NULL,
  postcode TEXT NOT NULL,
  price_cents BIGINT CHECK(price_cents IS NULL OR price_cents >= 0),
  price_period TEXT NOT NULL DEFAULT 'week' CHECK(price_period IN('week','year','on_application')),
  bedrooms BIGINT CHECK(bedrooms IS NULL OR bedrooms BETWEEN 0 AND 30),
  bathrooms BIGINT CHECK(bathrooms IS NULL OR bathrooms BETWEEN 0 AND 30),
  parking BIGINT CHECK(parking IS NULL OR parking BETWEEN 0 AND 100),
  area_sqm BIGINT CHECK(area_sqm IS NULL OR area_sqm BETWEEN 0 AND 10000000),
  available_from TEXT,
  agent_name TEXT NOT NULL,
  agent_role TEXT NOT NULL CHECK(agent_role IN('landlord','property_manager','leasing_agent')),
  application_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','withdrawn','leased')),
  published_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  application_mode TEXT NOT NULL DEFAULT 'unavailable'
 CHECK(application_mode IN('external','proinspect','unavailable')),
  application_authority_reference TEXT,
  application_recipient_email TEXT,
  tenancy_database_notice_mode TEXT NOT NULL DEFAULT 'unconfigured'
 CHECK(tenancy_database_notice_mode IN('unconfigured','not_used','configured')),
  tenancy_database_notice_json TEXT NOT NULL DEFAULT '[]'
 CHECK((tenancy_database_notice_json IS JSON)),
  rental_approval_state TEXT NOT NULL DEFAULT 'pending'
 CHECK(rental_approval_state IN ('pending','approved')),
  rental_approval_version BIGINT NOT NULL DEFAULT 0,
  rental_approved_at TEXT,
  rental_approved_by TEXT,
  rental_approved_notice_version TEXT,
  rental_recipient_verified_at TEXT,
  UNIQUE(kind,slug)
);

CREATE TABLE leasing_photos (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK(content_type IN('image/jpeg','image/png','image/webp')),
  size BIGINT NOT NULL CHECK(size BETWEEN 1 AND 6000001),
  alt_text TEXT NOT NULL,
  sort_order BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE leasing_sessions (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  capacity BIGINT CHECK(capacity IS NULL OR capacity BETWEEN 1 AND 200),
  booked_count BIGINT NOT NULL DEFAULT 0 CHECK(booked_count>=0),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','cancelled','completed')),
  instructions TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  CHECK(ends_at>starts_at),
  CHECK(capacity IS NULL OR booked_count<=capacity)
);

CREATE TABLE leasing_leads (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  session_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN('inspection','interest')),
  request_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  envelope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','cancelled')),
  cancel_token_hash TEXT NOT NULL UNIQUE,
  reminder_queued_at TEXT,
  created_at TEXT NOT NULL,
  cancelled_at TEXT,
  CHECK((kind='inspection' AND session_id IS NOT NULL) OR (kind='interest' AND session_id IS NULL))
);

CREATE TABLE leasing_email_events (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('registration.received','interest.received','registration.cancelled','session.updated','session.cancelled','session.reminder')),
  envelope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_integration' CHECK(status='pending_integration'),
  created_at TEXT NOT NULL
);

CREATE TABLE rental_applications (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
  CHECK(status IN('draft','submitted','information_requested','ready_for_handoff','forwarded','decision_recorded','withdrawn')),
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  notice_envelope TEXT,
  consent_version TEXT NOT NULL DEFAULT 'form18-digital-2026-10',
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  updated_at TEXT NOT NULL,
  forwarded_at TEXT,
  decision_recorded_at TEXT,
  withdrawn_at TEXT,
  retained_until TEXT,
  privacy_hold_until TEXT,
  privacy_hold_reference_envelope TEXT,
  review_request_envelope TEXT
);

CREATE TABLE rental_applicants (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  ordinal BIGINT NOT NULL CHECK(ordinal BETWEEN 1 AND 10),
  role TEXT NOT NULL CHECK(role IN('primary','coapplicant')),
  email_hash TEXT NOT NULL,
  access_token_hash TEXT NOT NULL UNIQUE,
  access_expires_at TEXT NOT NULL,
  answers_envelope TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'invited'
   CHECK(state IN('invited','in_progress','complete','removed')),
  declared_at TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  notice_digest TEXT,
  UNIQUE(application_id,ordinal),
  UNIQUE(application_id,email_hash),
  CHECK(ordinal=1 OR role='coapplicant')
);

CREATE TABLE rental_application_documents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  applicant_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK(category IN('identity','income','rental_history','other')),
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL
  CHECK(content_type IN('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes BIGINT NOT NULL CHECK(size_bytes BETWEEN 1 AND 8388608),
  sha256 TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'quarantined'
   CHECK(review_status IN('quarantined','released','rejected')),
  uploaded_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  scan_status TEXT NOT NULL DEFAULT 'pending'
 CHECK(scan_status IN('pending','clean','unsafe','error')),
  scan_report_envelope TEXT,
  scanned_at TEXT
);

CREATE TABLE rental_application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  actor_applicant_id TEXT,
  actor_staff_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN(
  'started','resumed','coapplicant_invited','coapplicant_removed',
  'section_saved','document_uploaded','document_removed','document_reviewed',
  'applicant_completed','submitted','information_requested','ready_for_handoff',
  'forwarded','decision_recorded','withdrawn')),
  envelope TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE rental_application_submissions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  submitted_by_applicant_id TEXT NOT NULL,
  version BIGINT NOT NULL CHECK(version BETWEEN 1 AND 30),
  form_version TEXT NOT NULL,
  snapshot_envelope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(application_id,version)
);

CREATE TABLE rental_application_handoffs (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  submission_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  recipient_hash TEXT NOT NULL,
  recipient_envelope TEXT NOT NULL,
  format_version TEXT NOT NULL DEFAULT 'proinspect-rental-email-v1',
  status TEXT NOT NULL DEFAULT 'awaiting_script'
  CHECK(status IN('awaiting_script','delivered','cancelled')),
  delivery_reference TEXT,
  staged_at TEXT NOT NULL,
  delivered_at TEXT,
  attempt_count BIGINT NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error_code TEXT,
  CHECK(status!='delivered' OR (delivered_at IS NOT NULL AND delivery_reference IS NOT NULL))
);

CREATE TABLE rental_application_privacy_requests (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  applicant_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('access','correction','erasure')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN('requested','in_review','fulfilled','declined')),
  request_envelope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  closed_at TEXT,
  reviewed_by TEXT
);

CREATE TABLE rental_application_purge_permits (
  application_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK(reason IN('retention_expired','privacy_request','operational_remediation')),
  issued_at TEXT NOT NULL
);

CREATE TABLE rental_application_purge_receipts (
  id TEXT PRIMARY KEY,
  reference_digest TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK(reason IN('retention_expired','privacy_request','operational_remediation')),
  actor_user_id TEXT,
  document_count BIGINT NOT NULL CHECK(document_count>=0),
  applicant_count BIGINT NOT NULL CHECK(applicant_count>=0),
  purged_at TEXT NOT NULL
);

CREATE TABLE rental_document_scan_receipts (
  event_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE leasing_checkins (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  registered_lead_id TEXT,
  request_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  attendee_hash TEXT NOT NULL,
  contact_envelope TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN('web','qr')),
  consent_version TEXT NOT NULL,
  arrived_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(session_id,attendee_hash)
);

CREATE TABLE open_home_sheet_events (
  id TEXT PRIMARY KEY,
  checkin_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','synced')),
  created_at TEXT NOT NULL,
  synced_at TEXT,
  sheet_row_number BIGINT CHECK(sheet_row_number IS NULL OR sheet_row_number>1),
  CHECK(status='pending' OR synced_at IS NOT NULL)
);

CREATE TABLE open_home_sheet_nonces (
  nonce_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);

CREATE TABLE wa_residential_form_templates (
  form_code TEXT NOT NULL,
  version TEXT NOT NULL,
  official_source_url TEXT NOT NULL,
  official_sha256 TEXT NOT NULL CHECK(length(official_sha256)=64),
  reviewed_by TEXT NOT NULL,
  legal_review_reference TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  retired_at TEXT,
  object_key TEXT,
  file_size BIGINT CHECK(file_size IS NULL OR (file_size>0 AND file_size<=10485760)),
  release_approved_at TEXT,
  release_approved_by TEXT,
  release_review_reference TEXT,
  PRIMARY KEY(form_code,version)
);

CREATE TABLE wa_residential_form_cases (
  id TEXT PRIMARY KEY,
  tenancy_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  form_code TEXT NOT NULL,
  form_stage TEXT NOT NULL CHECK(form_stage IN('commencement','active','breach','ending','bond')),
  initiator_id TEXT NOT NULL,
  initiator_kind TEXT NOT NULL CHECK(initiator_kind IN('tenant','manager')),
  data_envelope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN(
    'draft','submitted','under_review','approved','document_issued',
    'service_evidence_recorded','external_submitted','external_confirmed',
    'disputed','completed','withdrawn'
  )),
  due_at TEXT,
  due_basis TEXT,
  template_version TEXT,
  issued_document_id TEXT,
  reviewed_by TEXT,
  review_reference TEXT,
  external_reference TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  received_at TEXT,
  deadline_rule_version TEXT,
  decision_status TEXT CHECK(decision_status IS NULL OR decision_status IN('approved','refused','approved_with_conditions','information_requested','disputed','acknowledged')),
  decision_at TEXT,
  external_status TEXT CHECK(external_status IS NULL OR external_status IN('prepared','submitted','confirmed','rejected','disputed','determined','appealed','finalised')),
  external_status_at TEXT,
  booking_id TEXT,
  notice_purpose TEXT CHECK(notice_purpose IS NULL OR notice_purpose IN('routine','repairs','other')),
  notice_booking_starts_at TEXT,
  notice_invalidated_at TEXT,
  notice_invalidated_reason TEXT,
  completed_at TEXT,
  completion_reference TEXT,
  CHECK ((template_version IS NULL AND issued_document_id IS NULL) OR template_version IS NOT NULL)
);

CREATE TABLE wa_residential_form_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reference TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK((metadata_json IS JSON)),
  created_at TEXT NOT NULL
);

CREATE TABLE wa_residential_form_delivery (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  recipient_kind TEXT NOT NULL CHECK(recipient_kind IN('tenant','landlord','authority','other')),
  recipient_reference TEXT NOT NULL,
  delivery_method TEXT NOT NULL CHECK(delivery_method IN('in_person','post','email','government_portal','other')),
  delivery_at TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN('attempted','delivered','rejected','unconfirmed')),
  created_at TEXT NOT NULL
);

CREATE TABLE wa_residential_form_responses (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  answer TEXT NOT NULL CHECK(answer IN('approved','declined','changes_requested','acknowledged','disputed')),
  envelope TEXT NOT NULL,
  reference TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE wa_residential_form_decisions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN('approved','refused','approved_with_conditions','information_requested','disputed','acknowledged')),
  explanation_envelope TEXT NOT NULL,
  authority_reference TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE wa_residential_form_external_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN('prepared','submitted','confirmed','rejected','disputed','determined','appealed','finalised')),
  provider TEXT NOT NULL,
  external_reference TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(case_id,action,external_reference)
);

CREATE TABLE wa_residential_form_signatures (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  signer_kind TEXT NOT NULL CHECK(signer_kind IN('tenant','landlord','staff_witness','external')),
  method TEXT NOT NULL CHECK(method IN('wet_ink','stylus','external_provider')),
  signed_document_id TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(case_id,signer_kind,actor_id,signed_document_id)
);

CREATE TABLE wa_residential_form_reminders (
  case_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK(phase IN('due_soon','overdue')),
  user_id TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY(case_id,phase,user_id)
);

CREATE TABLE wa_residential_form_verifications (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  requirement TEXT NOT NULL CHECK(requirement IN(
  'verified_prior_form_21','statutory_grounds_review','legal_service_review',
  'verified_rent_ledger','verified_grounds','verified_entry_purpose',
  'service_window_review','official_signature_policy','issued_pcr_report'
 )),
  evidence_reference TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(case_id,requirement)
);

CREATE TABLE bonds (
  id TEXT PRIMARY KEY,
  tenancy_id TEXT NOT NULL UNIQUE,
  property_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','awaiting_lodgement','lodgement_submitted','active','variation_pending','release_pending','in_dispute','appeal_pending','payout_pending','released','exception')),
  bond_reference TEXT UNIQUE,
  general_cents BIGINT NOT NULL DEFAULT 0 CHECK(general_cents>=0),
  pet_cents BIGINT NOT NULL DEFAULT 0 CHECK(pet_cents>=0),
  held_general_cents BIGINT NOT NULL DEFAULT 0 CHECK(held_general_cents>=0),
  held_pet_cents BIGINT NOT NULL DEFAULT 0 CHECK(held_pet_cents>=0),
  weekly_rent_cents BIGINT NOT NULL CHECK(weekly_rent_cents>=0),
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  CHECK(held_general_cents<=general_cents OR status='released'),
  CHECK(held_pet_cents<=pet_cents OR status='released')
);

CREATE TABLE bond_parties (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  user_id TEXT,
  role TEXT NOT NULL CHECK(role IN('tenant','landlord','agent','estate')),
  name_envelope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','confirmed','former')),
  external_reference TEXT,
  government_document_id TEXT,
  effective_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE bond_transactions (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK(code IN(
 'B01','B02','B03','B04','B05','B06','B07','B08','B09',
 'B10','B11','B12','B13','B14','B15','B16','B17','B18',
 'B19','B20','B21','B22','B23')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted','confirmed','rejected','cancelled')),
  general_delta_cents BIGINT NOT NULL DEFAULT 0,
  pet_delta_cents BIGINT NOT NULL DEFAULT 0,
  details_envelope TEXT NOT NULL,
  created_by TEXT NOT NULL,
  channel TEXT CHECK(channel IN('manual','bondsonline','ecourts','other')),
  external_reference TEXT,
  submitted_at TEXT,
  confirmed_at TEXT,
  confirmation_document_id TEXT,
  confirmed_by TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE bond_receipts (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  transaction_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN('general','pet')),
  amount_cents BIGINT NOT NULL CHECK(amount_cents>0),
  payer_envelope TEXT NOT NULL,
  payment_reference TEXT NOT NULL,
  paid_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  lodgement_confirmed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE bond_claims (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN(
 'property_damage','garden','carpet_cleaning','cleaning','pet_fumigation','keys_security',
 'unpaid_rent','unpaid_utilities','other_breach')),
  amount_cents BIGINT NOT NULL CHECK(amount_cents>0),
  explanation_envelope TEXT NOT NULL,
  evidence_document_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE bond_evidence (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  transaction_id TEXT,
  document_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN('lodgement','variation','release','claim','notice','dispute','court','government_confirmation','other')),
  submitted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(bond_id,document_id,transaction_id)
);

CREATE TABLE bond_cases (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'notice_received' CHECK(status IN('notice_received','responded','referred','submissions','determined','appealed','declined','resolved')),
  decision_envelope TEXT,
  external_reference TEXT,
  decision_at TEXT,
  appeal_due_at TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE bond_deadlines (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  transaction_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN('lodgement','response','submission','appeal','other')),
  source TEXT NOT NULL CHECK(source IN('receipt','government_notice','court','reviewed_rule')),
  due_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE bond_notices (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  transaction_id TEXT,
  case_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN('release_application','invitation_to_submit','commissioner_decision','appeal','variation','other')),
  government_reference TEXT NOT NULL,
  received_at TEXT NOT NULL,
  response_due_at TEXT,
  document_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE bond_events (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  transaction_id TEXT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK((metadata_json IS JSON)),
  created_at TEXT NOT NULL
);

CREATE TABLE bond_alert_dispatches (
  deadline_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK(phase IN('approaching','overdue')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(deadline_id,user_id,phase)
);

CREATE TABLE bond_preparations (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  official_form TEXT NOT NULL CHECK(official_form IN('lodgement','variation','release','external')),
  worksheet_envelope TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  acknowledged_external BIGINT NOT NULL CHECK(acknowledged_external=1),
  prepared_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE bond_contributions (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  party_id TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK(amount_cents>0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(bond_id,receipt_id,party_id)
);

CREATE TABLE bond_allocations (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  recipient_kind TEXT NOT NULL CHECK(recipient_kind IN('tenant','landlord','housing_loan','new_bond')),
  party_id TEXT,
  target_bond_id TEXT,
  general_cents BIGINT NOT NULL DEFAULT 0 CHECK(general_cents>=0),
  pet_cents BIGINT NOT NULL DEFAULT 0 CHECK(pet_cents>=0),
  payment_reference TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(general_cents+pet_cents>0),
  CHECK((recipient_kind='tenant' AND party_id IS NOT NULL AND target_bond_id IS NULL)
    OR (recipient_kind='new_bond' AND target_bond_id IS NOT NULL AND party_id IS NULL)
    OR (recipient_kind IN('landlord','housing_loan') AND target_bond_id IS NULL))
);

CREATE TABLE bond_external_verifications (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  transaction_id TEXT,
  document_id TEXT NOT NULL,
  external_reference TEXT NOT NULL,
  source_channel TEXT NOT NULL CHECK(source_channel IN('bondsonline','manual','ecourts','other')),
  verification_method TEXT NOT NULL CHECK(verification_method IN('government_portal','government_correspondence','official_certificate','court_record')),
  review_notes_envelope TEXT NOT NULL,
  result TEXT NOT NULL CHECK(result IN('verified','rejected')),
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  UNIQUE(bond_id,transaction_id,document_id,external_reference,reviewed_by)
);

CREATE TABLE bond_payout_reconciliations (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  government_reference TEXT NOT NULL,
  government_document_id TEXT NOT NULL,
  general_cents BIGINT NOT NULL CHECK(general_cents>=0),
  pet_cents BIGINT NOT NULL CHECK(pet_cents>=0),
  outcome TEXT NOT NULL CHECK(outcome IN('matched','exception')),
  reconciled_by TEXT NOT NULL,
  notes_envelope TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE bond_exception_cases (
  id TEXT PRIMARY KEY,
  bond_id TEXT NOT NULL,
  transaction_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN('estate','failed_lodgement','payout_mismatch','missing_government_record','manual_review')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','in_review','resolved','referred')),
  details_envelope TEXT NOT NULL,
  created_by TEXT NOT NULL,
  resolved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE open_home_report_settings (
  listing_id TEXT PRIMARY KEY,
  enabled BIGINT NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
  recipient_user_id TEXT,
  authority_reference TEXT NOT NULL DEFAULT '',
  configured_by TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>=1),
  updated_at TEXT NOT NULL,
  CHECK(enabled=0 OR (recipient_user_id IS NOT NULL AND length(authority_reference)>=5))
);

CREATE TABLE open_home_inspection_reports (
  session_id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  outbox_id TEXT NOT NULL UNIQUE,
  recipient_user_id TEXT NOT NULL,
  session_end_at TEXT NOT NULL,
  report_date_perth TEXT NOT NULL,
  attendance_count BIGINT NOT NULL CHECK(attendance_count>=0),
  preregistered_arrivals BIGINT NOT NULL CHECK(preregistered_arrivals>=0),
  walk_in_arrivals BIGINT NOT NULL CHECK(walk_in_arrivals>=0),
  registered_count BIGINT NOT NULL CHECK(registered_count>=0),
  queued_at TEXT NOT NULL,
  CHECK(attendance_count=preregistered_arrivals+walk_in_arrivals)
);

CREATE TABLE report_templates (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL CHECK(report_type IN('entry','routine','exit','comparison','maintenance')),
  profile TEXT NOT NULL CHECK(profile IN('residential','commercial','strata','attendance')),
  template_version BIGINT NOT NULL CHECK(template_version>0),
  status TEXT NOT NULL CHECK(status IN('published','retired')),
  snapshot_json TEXT NOT NULL CHECK((snapshot_json IS JSON)),
  published_at TEXT NOT NULL,
  UNIQUE(report_type,profile,template_version)
);

CREATE TABLE report_layouts (
  id TEXT PRIMARY KEY,
  property_id TEXT,
  scheme_id TEXT,
  version BIGINT NOT NULL CHECK(version>0),
  definition_json TEXT NOT NULL CHECK((definition_json IS JSON)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK((property_id IS NULL)!=(scheme_id IS NULL))
);

CREATE TABLE inspection_reports (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL UNIQUE,
  client_id TEXT,
  property_id TEXT,
  scheme_id TEXT,
  tenancy_id TEXT,
  booking_id TEXT,
  service_id TEXT,
  report_type TEXT NOT NULL CHECK(report_type IN('entry','routine','exit','comparison','maintenance')),
  profile TEXT NOT NULL CHECK(profile IN('residential','commercial','strata','attendance')),
  output_kind TEXT NOT NULL CHECK(output_kind IN('inspection','attendance')),
  template_id TEXT NOT NULL,
  template_version BIGINT NOT NULL CHECK(template_version>0),
  layout_snapshot_json TEXT NOT NULL CHECK((layout_snapshot_json IS JSON)),
  baseline_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted','changes_requested','approved','issued','archived')),
  revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0),
  inspector_id TEXT,
  reviewer_id TEXT,
  approved_version_id TEXT,
  issued_document_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(property_id IS NOT NULL OR scheme_id IS NOT NULL)
);

CREATE TABLE report_drafts (
  report_id TEXT PRIMARY KEY,
  revision BIGINT NOT NULL CHECK(revision>0),
  content_json TEXT NOT NULL CHECK((content_json IS JSON)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE report_versions (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  sequence BIGINT NOT NULL CHECK(sequence>0),
  content_json TEXT NOT NULL CHECK((content_json IS JSON)),
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
  template_id TEXT NOT NULL,
  layout_sha256 TEXT NOT NULL CHECK(length(layout_sha256)=64),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(report_id,sequence)
);

CREATE TABLE report_review_events (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  report_version_id TEXT,
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN('assigned','approved','changes_requested','rejected_evidence')),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE report_evidence (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  area_id TEXT,
  component_id TEXT,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK(content_type IN('image/jpeg','image/png','image/webp')),
  size BIGINT NOT NULL CHECK(size>0 AND size<=5242880),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','rejected')),
  uploaded_by TEXT NOT NULL,
  reviewed_by TEXT,
  uploaded_at TEXT NOT NULL,
  reviewed_at TEXT,
  UNIQUE(report_id,sha256)
);

CREATE TABLE report_render_manifests (
  id TEXT PRIMARY KEY,
  report_version_id TEXT NOT NULL UNIQUE,
  document_id TEXT,
  renderer_version TEXT NOT NULL,
  document_sha256 TEXT NOT NULL CHECK(length(document_sha256)=64),
  manifest_json TEXT NOT NULL CHECK((manifest_json IS JSON)),
  created_at TEXT NOT NULL
);

CREATE TABLE report_responses (
  id TEXT PRIMARY KEY,
  report_version_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  tenancy_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  response_envelope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','under_review','resolved')),
  created_at TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT,
  UNIQUE(report_version_id,user_id)
);

CREATE TABLE report_maintenance_candidates (
  id TEXT PRIMARY KEY,
  report_version_id TEXT NOT NULL,
  area_id TEXT NOT NULL,
  component_id TEXT NOT NULL,
  finding TEXT NOT NULL,
  request_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(report_version_id,area_id,component_id)
);

CREATE TABLE report_sync_receipts (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expected_revision BIGINT NOT NULL,
  result_revision BIGINT NOT NULL,
  fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
  created_at TEXT NOT NULL
);

CREATE TABLE v2_markets (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  reference_unit TEXT NOT NULL,
  enabled BIGINT NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))
);

CREATE TABLE v2_services (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  family TEXT NOT NULL,
  summary TEXT NOT NULL,
  delivery_gate TEXT NOT NULL CHECK(delivery_gate IN ('operations_only','qualified_review','statutory_reserved')),
  legacy_service_id TEXT UNIQUE,
  approval_reference TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','approved','retired')),
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE v2_service_revisions (
  service_code TEXT NOT NULL,
  version BIGINT NOT NULL CHECK(version>0),
  snapshot_json TEXT NOT NULL CHECK((snapshot_json IS JSON)),
  changed_by TEXT,
  changed_at TEXT NOT NULL,
  PRIMARY KEY(service_code,version)
);

CREATE TABLE v2_market_service_rules (
  market_code TEXT NOT NULL,
  service_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','blocked')),
  notes TEXT NOT NULL DEFAULT '',
  verified_by TEXT,
  verified_at TEXT,
  PRIMARY KEY(market_code,service_code)
);

CREATE TABLE v2_assets (
  id TEXT PRIMARY KEY,
  property_id TEXT,
  scheme_id TEXT,
  parent_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN
 ('site','building','premises','lot','common_area','plant','equipment','facility','infrastructure','other')),
  name TEXT NOT NULL,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL,
  CHECK((property_id IS NOT NULL)::integer + (scheme_id IS NOT NULL)::integer = 1),
  CHECK(parent_id IS NULL OR parent_id != id)
);

CREATE TABLE v2_asset_markets (
  id TEXT PRIMARY KEY,
  market_code TEXT NOT NULL,
  property_id TEXT,
  scheme_id TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','blocked')),
  verified_by TEXT,
  verified_at TEXT,
  verification_reference TEXT,
  CHECK((property_id IS NOT NULL)::integer + (scheme_id IS NOT NULL)::integer = 1)
);

CREATE TABLE v2_engagements (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  property_id TEXT,
  scheme_id TEXT,
  market_code TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','ended')),
  scope_summary TEXT NOT NULL,
  authority_reference TEXT,
  verified_by TEXT,
  verified_at TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  CHECK((property_id IS NOT NULL)::integer + (scheme_id IS NOT NULL)::integer = 1),
  CHECK(ends_at IS NULL OR ends_at>starts_at)
);

CREATE TABLE v2_plan_versions (
  id TEXT PRIMARY KEY,
  market_code TEXT NOT NULL,
  plan_code TEXT NOT NULL CHECK(plan_code IN ('inspection','standard','outsourced')),
  version BIGINT NOT NULL CHECK(version>0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','retired')),
  reference_unit TEXT NOT NULL,
  included_hours_milli BIGINT CHECK(included_hours_milli>=0),
  included_visits BIGINT CHECK(included_visits>=0),
  included_tickets BIGINT CHECK(included_tickets>=0),
  included_reports BIGINT CHECK(included_reports>=0),
  monthly_fee_cents BIGINT CHECK(monthly_fee_cents>=0),
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE(market_code,plan_code,version)
);

CREATE TABLE v2_plan_services (
  plan_id TEXT NOT NULL,
  service_code TEXT NOT NULL,
  inclusion TEXT NOT NULL CHECK(inclusion IN ('included','optional','excluded')),
  PRIMARY KEY(plan_id,service_code)
);

CREATE TABLE v2_plan_entitlements (
  plan_id TEXT NOT NULL,
  service_code TEXT NOT NULL,
  metric TEXT NOT NULL CHECK(metric IN ('hours_milli','visits','tickets','reports')),
  limit_quantity BIGINT NOT NULL CHECK(limit_quantity>=0),
  PRIMARY KEY(plan_id,service_code,metric)
);

CREATE TABLE v2_subscription_periods (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  agreed_monthly_cents BIGINT NOT NULL CHECK(agreed_monthly_cents>=0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(period_end>period_start)
);

CREATE TABLE v2_usage_ledger (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  service_code TEXT NOT NULL,
  metric TEXT NOT NULL CHECK(metric IN ('hours_milli','visits','tickets','reports')),
  quantity BIGINT NOT NULL CHECK(quantity>0),
  source_key TEXT NOT NULL,
  work_order_id TEXT,
  booking_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(subscription_id,source_key,metric),
  CHECK(work_order_id IS NULL OR booking_id IS NULL)
);

CREATE TABLE v2_rate_cards (
  id TEXT PRIMARY KEY,
  market_code TEXT NOT NULL,
  version BIGINT NOT NULL CHECK(version>0),
  status TEXT NOT NULL DEFAULT 'draft'
 CHECK(status IN ('draft','approved','retired')),
  loaded_hourly_cents BIGINT NOT NULL CHECK(loaded_hourly_cents>=0),
  travel_visit_cents BIGINT NOT NULL CHECK(travel_visit_cents>=0),
  fixed_admin_cents BIGINT NOT NULL CHECK(fixed_admin_cents>=0),
  contingency_bp BIGINT NOT NULL CHECK(contingency_bp BETWEEN 0 AND 5000),
  target_margin_bp BIGINT NOT NULL CHECK(target_margin_bp BETWEEN 0 AND 9500),
  gst_bp BIGINT NOT NULL DEFAULT 1000 CHECK(gst_bp BETWEEN 0 AND 3000),
  approved_by TEXT,
  approved_at TEXT,
  approval_reference TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(market_code,version)
);

CREATE TABLE v2_quote_snapshots (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  property_id TEXT,
  scheme_id TEXT,
  market_code TEXT NOT NULL,
  service_code TEXT,
  rate_card_id TEXT NOT NULL,
  engagement_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','accepted','expired')),
  calculation_json TEXT NOT NULL CHECK((calculation_json IS JSON)),
  amount_ex_gst_cents BIGINT NOT NULL CHECK(amount_ex_gst_cents>=0),
  gst_cents BIGINT NOT NULL CHECK(gst_cents>=0),
  total_cents BIGINT NOT NULL CHECK(total_cents=amount_ex_gst_cents+gst_cents),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK((property_id IS NOT NULL)::integer + (scheme_id IS NOT NULL)::integer = 1)
);

CREATE TABLE v2_maintenance_tasks (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL,
  asset_id TEXT,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  public_summary TEXT NOT NULL DEFAULT '',
  trade TEXT NOT NULL CHECK(trade IN
 ('general','inspections','cleaning','grounds','carpentry','electrical','plumbing','fire','hvac','access','compliance')),
  priority TEXT NOT NULL DEFAULT 'routine' CHECK(priority IN('routine','urgent','emergency')),
  status TEXT NOT NULL DEFAULT 'scoped' CHECK(status IN
 ('scoped','awaiting_approval','approved','assigned','scheduled','in_progress','evidence_pending','completed','cancelled')),
  approval_required BIGINT NOT NULL DEFAULT 0 CHECK(approval_required IN(0,1)),
  budget_ceiling_cents BIGINT NOT NULL DEFAULT 0 CHECK(budget_ceiling_cents>=0),
  evidence_kind TEXT NOT NULL DEFAULT 'note' CHECK(evidence_kind IN('note','photo','report','certificate')),
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completion_summary TEXT,
  completed_by TEXT,
  completed_at TEXT
);

CREATE TABLE v2_contractor_credentials (
  id TEXT PRIMARY KEY,
  contractor_id TEXT NOT NULL,
  credential_type TEXT NOT NULL CHECK(credential_type IN('insurance','licence','competency','site_induction')),
  trade TEXT NOT NULL DEFAULT 'general' CHECK(trade IN
 ('general','inspections','cleaning','grounds','carpentry','electrical','plumbing','fire','hvac','access','compliance')),
  credential_reference TEXT NOT NULL,
  verification_reference TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'verified' CHECK(status IN('verified','revoked')),
  created_at TEXT NOT NULL,
  CHECK(valid_until>verified_at)
);

CREATE TABLE v2_task_credential_requirements (
  task_id TEXT NOT NULL,
  credential_type TEXT NOT NULL CHECK(credential_type IN('insurance','licence','competency','site_induction')),
  PRIMARY KEY(task_id,credential_type)
);

CREATE TABLE v2_task_assignments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  staff_user_id TEXT,
  contractor_id TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN('confirmed','released')),
  instruction_reference TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  released_at TEXT,
  CHECK((staff_user_id IS NOT NULL)::integer+ (contractor_id IS NOT NULL)::integer=1)
);

CREATE TABLE v2_capacity_resources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN('staff','contractor','equipment','vehicle','space')),
  name TEXT NOT NULL,
  staff_user_id TEXT,
  contractor_id TEXT,
  region TEXT NOT NULL DEFAULT 'Perth WA',
  active BIGINT NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK((kind='staff' AND staff_user_id IS NOT NULL AND contractor_id IS NULL) OR
 (kind='contractor' AND contractor_id IS NOT NULL AND staff_user_id IS NULL) OR
 (kind IN('equipment','vehicle','space') AND staff_user_id IS NULL AND contractor_id IS NULL))
);

CREATE TABLE v2_resource_skills (
  resource_id TEXT NOT NULL,
  trade TEXT NOT NULL CHECK(trade IN
 ('general','inspections','cleaning','grounds','carpentry','electrical','plumbing','fire','hvac','access','compliance')),
  verified_by TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  PRIMARY KEY(resource_id,trade)
);

CREATE TABLE v2_roster_windows (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  weekday BIGINT NOT NULL CHECK(weekday BETWEEN 1 AND 7),
  starts_minute BIGINT NOT NULL CHECK(starts_minute BETWEEN 0 AND 1425),
  ends_minute BIGINT NOT NULL CHECK(ends_minute BETWEEN 15 AND 1440),
  CHECK(ends_minute>starts_minute)
);

CREATE TABLE v2_capacity_blocks (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(ends_at>starts_at)
);

CREATE TABLE v2_resource_allocations (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN('confirmed','released','completed')),
  allocation_reference TEXT NOT NULL,
  allocated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(ends_at>starts_at),
  UNIQUE(task_id,resource_id,starts_at)
);

CREATE TABLE v2_task_evidence (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('note','photo','report','invoice','certificate')),
  document_id TEXT,
  reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','verified','rejected')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  verified_by TEXT,
  verified_at TEXT,
  CHECK(status!='verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

CREATE TABLE v2_staff_cost_rates (
  id TEXT PRIMARY KEY,
  staff_user_id TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  hourly_cost_cents BIGINT NOT NULL CHECK(hourly_cost_cents>=0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved')),
  approval_reference TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(staff_user_id,effective_from)
);

CREATE TABLE v2_task_entitlement_links (
  task_id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  service_code TEXT NOT NULL,
  linked_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE v2_time_entries (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  staff_user_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  minutes BIGINT NOT NULL CHECK(minutes BETWEEN 1 AND 720),
  activity_kind TEXT NOT NULL CHECK(activity_kind IN('on_site','travel','inspection','coordination','administration')),
  note TEXT NOT NULL DEFAULT '',
  source_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','approved','rejected')),
  rate_id TEXT,
  hourly_cost_cents BIGINT CHECK(hourly_cost_cents>=0),
  cost_cents BIGINT CHECK(cost_cents>=0),
  reviewed_by TEXT,
  reviewed_at TEXT,
  submitted_at TEXT NOT NULL,
  CHECK(ended_at>started_at),
  CHECK(status!='approved' OR (rate_id IS NOT NULL AND hourly_cost_cents IS NOT NULL
 AND cost_cents IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  UNIQUE(staff_user_id,source_key)
);

CREATE TABLE v2_external_costs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  contractor_id TEXT,
  category TEXT NOT NULL CHECK(category IN
 ('contractor','materials','equipment','travel','other')),
  amount_cents BIGINT NOT NULL CHECK(amount_cents>=0),
  invoice_reference TEXT NOT NULL,
  source_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','approved','rejected')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  CHECK(status!='approved' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  UNIQUE(task_id,source_key)
);

CREATE TABLE v2_asset_details (
  asset_id TEXT PRIMARY KEY,
  asset_code TEXT NOT NULL UNIQUE,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  commissioned_on TEXT,
  design_life_months BIGINT CHECK(design_life_months BETWEEN 1 AND 1800),
  replacement_cost_cents BIGINT CHECK(replacement_cost_cents>=0),
  criticality TEXT NOT NULL DEFAULT 'normal' CHECK(criticality IN('low','normal','high','critical')),
  lifecycle_status TEXT NOT NULL DEFAULT 'operational' CHECK(lifecycle_status IN('operational','restricted','out_of_service','retired')),
  last_condition_score BIGINT CHECK(last_condition_score BETWEEN 1 AND 5),
  last_condition_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE v2_asset_conditions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  score BIGINT NOT NULL CHECK(score BETWEEN 1 AND 5),
  observed_on TEXT NOT NULL,
  method TEXT NOT NULL CHECK(method IN('visual','functional','professional_report')),
  summary TEXT NOT NULL,
  evidence_document_id TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','verified','rejected')),
  observed_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  verified_by TEXT,
  verified_at TEXT,
  verification_reference TEXT,
  CHECK(status!='verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND LENGTH(verification_reference)>=4))
);

CREATE TABLE v2_asset_warranties (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  warranty_reference TEXT NOT NULL,
  starts_on TEXT,
  expires_on TEXT NOT NULL,
  evidence_document_id TEXT,
  verification_reference TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(starts_on IS NULL OR starts_on<expires_on)
);

CREATE TABLE v2_preventive_plans (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  service_code TEXT NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  cadence_months BIGINT NOT NULL CHECK(cadence_months BETWEEN 1 AND 120),
  lead_days BIGINT NOT NULL DEFAULT 14 CHECK(lead_days BETWEEN 0 AND 180),
  next_due TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','paused','retired')),
  authority_reference TEXT,
  verified_by TEXT,
  verified_at TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(LENGTH(next_due)=10)
);

CREATE TABLE v2_preventive_occurrences (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  due_on TEXT NOT NULL,
  work_order_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK(status IN('issued','skipped')),
  authority_reference TEXT NOT NULL,
  skip_reason TEXT,
  recorded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(plan_id,due_on),
  CHECK((status='issued' AND work_order_id IS NOT NULL AND skip_reason IS NULL) OR
 (status='skipped' AND work_order_id IS NULL AND LENGTH(skip_reason)>=4))
);

CREATE TABLE v2_compliance_obligations (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN
 ('fire','electrical','water','lift','accessibility','environment','essential_services','safety','other')),
  jurisdiction TEXT NOT NULL DEFAULT 'WA',
  source_reference TEXT NOT NULL,
  requirement_summary TEXT NOT NULL,
  accountable_party TEXT NOT NULL CHECK(accountable_party IN
 ('owner','appointed_manager','operator','qualified_provider','government_authority')),
  recurrence_months BIGINT CHECK(recurrence_months BETWEEN 1 AND 120),
  next_review_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','tracked','paused','retired')),
  review_reference TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(LENGTH(next_review_on)=10)
);

CREATE TABLE v2_compliance_evidence (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL,
  document_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN('certificate','inspection','service_record','correspondence','other')),
  provider_name TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  issued_on TEXT NOT NULL,
  expires_on TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','verified','rejected')),
  recorded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  independent_check_reference TEXT,
  CHECK(expires_on IS NULL OR expires_on>issued_on),
  CHECK(status!='verified' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND LENGTH(independent_check_reference)>=4))
);

CREATE TABLE v2_compliance_actions (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL,
  action_text TEXT NOT NULL,
  due_on TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','done','cancelled')),
  completion_reference TEXT,
  closed_by TEXT,
  closed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(status='open' OR (closed_by IS NOT NULL AND closed_at IS NOT NULL AND LENGTH(completion_reference)>=4))
);

CREATE TABLE v2_asset_risks (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN('condition','safety','failure','compliance','financial','service','other')),
  summary TEXT NOT NULL,
  likelihood BIGINT NOT NULL CHECK(likelihood BETWEEN 1 AND 5),
  impact BIGINT NOT NULL CHECK(impact BETWEEN 1 AND 5),
  mitigation TEXT NOT NULL,
  next_review_on TEXT NOT NULL,
  owner_staff_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','mitigated','accepted')),
  closure_reference TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(status='open' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND LENGTH(closure_reference)>=4))
);

CREATE TABLE v2_sector_packs (
  id TEXT PRIMARY KEY,
  market_code TEXT NOT NULL,
  version BIGINT NOT NULL CHECK(version>0),
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','approved','retired')),
  governance_boundary TEXT NOT NULL,
  approval_reference TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE(market_code,version)
);

CREATE TABLE v2_sector_modules (
  code TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  name TEXT NOT NULL,
  classification TEXT NOT NULL CHECK(classification IN
 ('operations','qualified_coordination','reserved_external')),
  purpose TEXT NOT NULL,
  required_fields_json TEXT NOT NULL CHECK((required_fields_json IS JSON)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','excluded')),
  review_reference TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT
);

CREATE TABLE v2_sector_release_checks (
  pack_id TEXT NOT NULL,
  check_code TEXT NOT NULL CHECK(check_code IN('governance','service_scope','pricing','insurance','credentials','privacy','workflow_acceptance')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','verified','rejected')),
  evidence_reference TEXT,
  verified_by TEXT,
  verified_at TEXT,
  PRIMARY KEY(pack_id,check_code)
);

CREATE TABLE v2_sector_module_clearances (
  id TEXT PRIMARY KEY,
  module_code TEXT NOT NULL,
  qualified_provider TEXT NOT NULL,
  credential_reference TEXT NOT NULL,
  independent_check_reference TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'verified' CHECK(status IN('verified','revoked')),
  created_at TEXT NOT NULL
);

CREATE TABLE v2_sector_rollouts (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','pilot','live','paused','ended')),
  authority_reference TEXT,
  approved_by TEXT,
  approved_at TEXT,
  pilot_started_at TEXT,
  live_started_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(pack_id,engagement_id)
);

CREATE TABLE v2_sector_records (
  id TEXT PRIMARY KEY,
  rollout_id TEXT NOT NULL,
  module_code TEXT NOT NULL,
  asset_id TEXT,
  source_key TEXT NOT NULL,
  facts_json TEXT NOT NULL CHECK((facts_json IS JSON)),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','accepted','rejected')),
  recorded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reference TEXT,
  UNIQUE(rollout_id,module_code,source_key),
  CHECK(status!='accepted' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND LENGTH(review_reference)>=4))
);

CREATE TABLE v2_enterprise_portfolios (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','archived')),
  authority_reference TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(client_id,name)
);

CREATE TABLE v2_enterprise_portfolio_members (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  property_id TEXT,
  scheme_id TEXT,
  verified_by TEXT NOT NULL,
  authority_reference TEXT NOT NULL,
  added_at TEXT NOT NULL,
  CHECK((property_id IS NOT NULL)::integer+ (scheme_id IS NOT NULL)::integer=1)
);

CREATE TABLE v2_capital_programmes (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  title TEXT NOT NULL,
  purpose TEXT NOT NULL,
  baseline_budget_cents BIGINT NOT NULL CHECK(baseline_budget_cents>=0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','active','completed','cancelled')),
  authority_reference TEXT,
  approved_by TEXT,
  approved_at TEXT,
  planned_start TEXT,
  planned_finish TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  CHECK(planned_finish IS NULL OR planned_start IS NULL OR planned_finish>=planned_start)
);

CREATE TABLE v2_capital_projects (
  id TEXT PRIMARY KEY,
  programme_id TEXT NOT NULL,
  asset_id TEXT,
  work_order_id TEXT,
  title TEXT NOT NULL,
  scope_summary TEXT NOT NULL,
  estimated_cents BIGINT NOT NULL CHECK(estimated_cents>=0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','active','completed','cancelled')),
  authority_reference TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE v2_capital_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN('planned','completed','deferred')),
  evidence_reference TEXT,
  completed_by TEXT,
  completed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(status='planned' OR (completed_by IS NOT NULL AND completed_at IS NOT NULL
 AND LENGTH(TRIM(COALESCE(evidence_reference,'')))>=4))
);

CREATE TABLE v2_capital_commitments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  contractor_id TEXT,
  category TEXT NOT NULL CHECK(category IN('works','materials','professional','contingency','other')),
  proposed_cents BIGINT NOT NULL CHECK(proposed_cents>=0),
  quotation_reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','approved','cancelled')),
  authority_reference TEXT,
  approved_by TEXT,
  approved_at TEXT,
  proposed_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(status!='approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND LENGTH(authority_reference)>=4))
);

CREATE TABLE v2_capital_forecasts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  revision BIGINT NOT NULL CHECK(revision>0),
  forecast_total_cents BIGINT NOT NULL CHECK(forecast_total_cents>=0),
  rationale TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE(project_id,revision)
);

CREATE TABLE v2_saved_report_definitions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  report_kind TEXT NOT NULL CHECK(report_kind IN('operations','assets','compliance','maintenance','sectors','capital')),
  client_id TEXT,
  market_code TEXT,
  portfolio_id TEXT,
  window_days BIGINT NOT NULL DEFAULT 90 CHECK(window_days BETWEEN 1 AND 366),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','archived')),
  owner_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(portfolio_id IS NULL OR client_id IS NOT NULL)
);

CREATE TABLE v2_report_snapshots (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  metrics_json TEXT NOT NULL CHECK((metrics_json IS JSON)),
  created_by TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  CHECK(period_end>period_start)
);

CREATE TABLE v2_enterprise_alerts (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK(source_kind IN('asset','preventive','compliance','maintenance','capital','sector')),
  source_id TEXT NOT NULL,
  alert_code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN('info','warning','critical')),
  summary TEXT NOT NULL,
  due_on TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','acknowledged','resolved')),
  assigned_staff_id TEXT,
  resolution_reference TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(source_kind,source_id,alert_code),
  CHECK(status!='resolved' OR (LENGTH(TRIM(COALESCE(resolution_reference,'')))>=4 AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);

CREATE TABLE stripe_billing_links (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  sector TEXT NOT NULL CHECK(sector IN ('residential','commercial')),
  price_id TEXT NOT NULL,
  session_id TEXT UNIQUE,
  checkout_url TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  last_subscription_event_created BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('pending','incomplete','active','trialing','past_due','unpaid','canceled','paused','expired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT valid_stripe_price CHECK(length(price_id)>0)
);

CREATE TABLE stripe_billing_events (
  event_id TEXT PRIMARY KEY,
  link_id TEXT,
  event_type TEXT NOT NULL,
  stripe_object_id TEXT,
  status TEXT NOT NULL,
  currency TEXT,
  amount_cents BIGINT,
  needs_reconciliation BIGINT NOT NULL DEFAULT 1 CHECK(needs_reconciliation IN (0,1)),
  created_at TEXT NOT NULL
);

CREATE TABLE contractor_payment_plans (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  contractor_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('platform_collect','payer_direct')),
  gross_cents BIGINT NOT NULL CHECK(gross_cents>0 AND gross_cents<=100000000),
  platform_fee_cents BIGINT NOT NULL DEFAULT 0 CHECK(platform_fee_cents>=0 AND platform_fee_cents<gross_cents),
  currency TEXT NOT NULL DEFAULT 'AUD' CHECK(currency='AUD'),
  quote_reference TEXT NOT NULL,
  invoice_reference TEXT NOT NULL,
  approval_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN (
  'draft','awaiting_checkout','checkout_open','funded','release_approved','transfer_initiated','transfer_created','transfer_review','reversed',
  'external_due','external_reported','external_verified','failed','disputed','cancelled')),
  payer_approved_by TEXT,
  payer_approved_at TEXT,
  payer_authority_reference TEXT,
  checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id TEXT,
  checkout_url TEXT,
  stripe_transfer_id TEXT UNIQUE,
  recipient_account_id TEXT,
  completion_reference TEXT,
  release_approved_by TEXT,
  release_approved_at TEXT,
  external_payment_reference TEXT,
  external_reported_by TEXT,
  external_reported_at TEXT,
  external_verified_by TEXT,
  external_verified_at TEXT,
  external_verification_reference TEXT,
  transfer_initiated_by TEXT,
  transfer_initiated_at TEXT,
  last_actor_id TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(mode='platform_collect' OR (platform_fee_cents=0 AND checkout_session_id IS NULL AND stripe_transfer_id IS NULL)),
  CHECK(status NOT IN ('awaiting_checkout','checkout_open','funded','release_approved','transfer_initiated','transfer_created','transfer_review','reversed','disputed') OR mode='platform_collect'),
  CHECK(status NOT IN ('external_due','external_reported','external_verified') OR mode='payer_direct')
);

CREATE TABLE contractor_connect_recipients (
  contractor_id TEXT PRIMARY KEY,
  stripe_account_id TEXT NOT NULL UNIQUE CHECK(stripe_account_id ~ '^acct_.*$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','disabled')),
  identity_verification_reference TEXT,
  identity_verified_by TEXT,
  identity_verified_at TEXT,
  recorded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(status != 'verified' OR (identity_verification_reference IS NOT NULL AND identity_verified_by IS NOT NULL AND identity_verified_at IS NOT NULL))
);

CREATE TABLE contractor_payment_events (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id TEXT,
  event_reference TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE contractor_connect_webhook_receipts (
  event_id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK(source IN ('checkout','platform','recipients')),
  event_type TEXT NOT NULL,
  stripe_object_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE rental_listing_recipient_challenges (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  verified_at TEXT,
  CHECK(verified_at IS NULL OR verified_at>=requested_at)
);

CREATE TABLE rental_listing_approvals (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  approval_version BIGINT NOT NULL,
  authority_reference TEXT NOT NULL,
  authority_attestation_envelope TEXT NOT NULL,
  privacy_notice_version TEXT NOT NULL,
  recipient_challenge_id TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  UNIQUE(listing_id,approval_version)
);

CREATE TABLE rental_document_scan_jobs (
  document_id TEXT PRIMARY KEY,
  attempts BIGINT NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),
  next_attempt_at TEXT NOT NULL,
  last_error_code TEXT,
  last_attempt_at TEXT,
  completed_at TEXT
);

CREATE TABLE rental_handoff_receipts (
  id TEXT PRIMARY KEY,
  handoff_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  recipient_hash TEXT NOT NULL,
  message_reference TEXT NOT NULL,
  accepted_at TEXT NOT NULL
);

CREATE TABLE rental_application_outcomes (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE,
  outcome TEXT NOT NULL CHECK(outcome IN ('successful','unsuccessful')),
  authority_reference TEXT NOT NULL,
  details_envelope TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  applicant_notification_at TEXT
);

CREATE TABLE property_report_bridge_handoffs (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL,
  staff_user_id TEXT NOT NULL,
  staff_email TEXT NOT NULL,
  source_report_id TEXT,
  document_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  launch_expires_at TEXT NOT NULL,
  publish_expires_at TEXT NOT NULL,
  received_at TEXT,
  status TEXT NOT NULL CHECK(status IN('pending','received','revoked')),
  CHECK(document_id IS NULL OR (status='received' AND source_report_id IS NOT NULL))
);

CREATE TABLE rent_route_plans (
  id TEXT PRIMARY KEY,
  tenancy_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  manager_mode TEXT NOT NULL CHECK(manager_mode IN('self_managed','agency_managed')),
  route TEXT NOT NULL CHECK(route IN('agency_trust_external','landlord_direct_external','landlord_connect_candidate')),
  currency TEXT NOT NULL DEFAULT 'aud' CHECK(currency='aud'),
  amount_cents BIGINT NOT NULL CHECK(amount_cents>0 AND amount_cents<=100000000),
  frequency TEXT NOT NULL CHECK(frequency IN('weekly','fortnightly','monthly')),
  status TEXT NOT NULL DEFAULT 'proposal_only' CHECK(status='proposal_only'),
  policy_version TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK((manager_mode='agency_managed' AND route='agency_trust_external') OR
       (manager_mode='self_managed' AND route IN('landlord_direct_external','landlord_connect_candidate')))
);

CREATE TABLE rent_external_money_records (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('rent_received_external','owner_disbursement_external')),
  amount_cents BIGINT NOT NULL CHECK(amount_cents>0 AND amount_cents<=100000000),
  source TEXT NOT NULL CHECK(source IN('agency_trust_statement','landlord_bank_statement','approved_external_ledger')),
  external_reference TEXT NOT NULL CHECK(length(external_reference) BETWEEN 4 AND 160),
  effective_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(plan_id,kind,external_reference)
);

CREATE TABLE rent_external_verifications (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL UNIQUE,
  reviewed_by TEXT NOT NULL,
  evidence_kind TEXT NOT NULL CHECK(evidence_kind IN('official_trust_ledger','bank_statement','accounting_reconciliation')),
  external_evidence_reference TEXT NOT NULL CHECK(length(external_evidence_reference) BETWEEN 4 AND 160),
  reviewed_at TEXT NOT NULL
);

CREATE TABLE restricted_form2_preparations (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  encrypted_worksheet TEXT NOT NULL,
  official_form_code TEXT NOT NULL DEFAULT 'WA_FORM_2'
 CHECK(official_form_code='WA_FORM_2'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status='draft'),
  prepared_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE restricted_form2_reviews (
  id TEXT PRIMARY KEY,
  preparation_id TEXT NOT NULL UNIQUE,
  reviewer_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN('reviewed_for_manual_handling','requires_revision')),
  reviewed_at TEXT NOT NULL
);

CREATE TABLE rent_connect_sandbox_accounts (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL UNIQUE CHECK(account_id ILIKE 'acct_%'),
  environment TEXT NOT NULL CHECK(environment='sandbox'),
  status TEXT NOT NULL DEFAULT 'onboarding_required' CHECK(status IN('onboarding_required','provider_requirements_pending','provider_ready_not_approved_for_rent')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE wa_agreement_envelopes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL UNIQUE,
  tenancy_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  source_document_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
  template_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'collecting' CHECK(status IN('collecting','all_consented','executed','void')),
  prepared_by TEXT NOT NULL,
  prepared_at TEXT NOT NULL,
  executed_document_id TEXT,
  executed_at TEXT,
  reviewed_by TEXT,
  review_reference TEXT,
  voided_at TEXT,
  voided_by TEXT,
  void_reason TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  CHECK((status='executed')=(executed_document_id IS NOT NULL)),
  CHECK((status='void')=(voided_at IS NOT NULL))
);

CREATE TABLE wa_agreement_signers (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN('tenant','landlord')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','consented')),
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
  consent_envelope TEXT,
  consented_at TEXT,
  UNIQUE(envelope_id,user_id)
);

CREATE TABLE wa_agreement_events (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reference TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE agency_owner_grants (
  id TEXT PRIMARY KEY,
  agency_client_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  management_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  authority_reference TEXT NOT NULL,
  allow_inspections BIGINT NOT NULL DEFAULT 1 CHECK(allow_inspections IN (0,1)),
  allow_reports BIGINT NOT NULL DEFAULT 0 CHECK(allow_reports IN (0,1)),
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE agency_owner_report_shares (
  grant_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  shared_by TEXT NOT NULL,
  shared_at TEXT NOT NULL,
  PRIMARY KEY(grant_id,document_id)
);

CREATE TABLE agency_commercial_agreements (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL CHECK(tier IN ('50_149','150_499','500_1000','custom')),
  pricing_model TEXT NOT NULL CHECK(pricing_model IN ('per_service','retainer','hybrid')),
  base_monthly_cents BIGINT NOT NULL CHECK(base_monthly_cents>=0),
  gst_basis_points BIGINT NOT NULL CHECK(gst_basis_points BETWEEN 0 AND 10000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','ended')),
  effective_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  approved_by TEXT,
  approval_reference TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE agency_contract_rates (
  agreement_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  rate_cents BIGINT NOT NULL CHECK(rate_cents>=0),
  included BIGINT NOT NULL CHECK(included IN (0,1)),
  PRIMARY KEY(agreement_id,service_id),
  CHECK(included=0 OR rate_cents=0)
);

CREATE TABLE agency_billable_work (
  id TEXT PRIMARY KEY,
  agreement_id TEXT NOT NULL,
  work_order_id TEXT NOT NULL UNIQUE,
  property_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  charge_cents BIGINT NOT NULL CHECK(charge_cents>=0),
  completed_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL
);

CREATE TABLE agency_monthly_statements (
  id TEXT PRIMARY KEY,
  agreement_id TEXT NOT NULL,
  period TEXT NOT NULL CHECK(period ~ '^....-..$'),
  subtotal_cents BIGINT NOT NULL CHECK(subtotal_cents>=0),
  gst_cents BIGINT NOT NULL CHECK(gst_cents>=0),
  total_cents BIGINT NOT NULL CHECK(total_cents=subtotal_cents+gst_cents),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved')),
  prepared_by TEXT NOT NULL,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(agreement_id,period)
);

CREATE TABLE agency_statement_lines (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL,
  billable_work_id TEXT UNIQUE,
  property_id TEXT,
  description TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK(amount_cents>=0)
);

CREATE TABLE v4_service_requests (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  request_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  service_code TEXT NOT NULL CHECK(service_code ~ '^[A-Z][A-Z][A-Z]-[0-9][0-9][0-9]$'),
  sector TEXT NOT NULL CHECK(sector IN ('residential','commercial')),
  workflow_code TEXT NOT NULL,
  intake_envelope TEXT NOT NULL,
  rate_snapshot_json TEXT NOT NULL,
  quantity BIGINT NOT NULL DEFAULT 1 CHECK(quantity>=1 AND quantity<=500),
  status TEXT NOT NULL DEFAULT 'pending_verification' CHECK(status IN (
    'pending_verification','submitted','under_review','awaiting_information','quoted',
    'approved','in_progress','awaiting_review','completed','declined','cancelled')),
  quote_cents BIGINT CHECK(quote_cents IS NULL OR (quote_cents>=0 AND quote_cents<=100000000)),
  quote_expires_at TEXT,
  completion_document_id TEXT,
  staff_note TEXT CHECK(staff_note IS NULL OR length(staff_note)<=1000),
  verified_at TEXT,
  staff_actor_id TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>=1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(status!='quoted' OR (quote_cents IS NOT NULL AND quote_expires_at IS NOT NULL)),
  CHECK(status!='completed' OR verified_at IS NOT NULL)
);

CREATE TABLE v4_request_links (
  token_hash TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('verify','manage','quote')),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE v4_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(length(action) BETWEEN 3 AND 80),
  actor_id TEXT,
  version BIGINT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE payment_checkout_attempts (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  payment_version BIGINT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK(amount_cents>0),
  currency TEXT NOT NULL CHECK(currency='AUD'),
  client_id TEXT NOT NULL,
  description TEXT NOT NULL,
  success_url TEXT NOT NULL,
  cancel_url TEXT NOT NULL,
  session_id TEXT UNIQUE,
  payment_intent_id TEXT,
  checkout_url TEXT,
  status TEXT NOT NULL CHECK(status IN('creating','open','processing','paid','failed','expired','superseded','review')),
  expires_at BIGINT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE payment_reconciliation_items (
  id TEXT PRIMARY KEY,
  payment_id TEXT,
  provider_event_id TEXT NOT NULL,
  code TEXT NOT NULL,
  object_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved')),
  created_at TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT,
  evidence_reference TEXT,
  UNIQUE(provider_event_id,code)
);

CREATE TABLE payment_refund_observations (
  refund_id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  payment_intent_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK(amount_cents>0),
  currency TEXT NOT NULL CHECK(currency='AUD'),
  status TEXT NOT NULL CHECK(status IN('pending','requires_action','succeeded','failed','canceled')),
  provider_created BIGINT NOT NULL,
  last_event_created BIGINT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE payment_disputes (
  dispute_id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  payment_intent_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK(amount_cents>0),
  currency TEXT NOT NULL CHECK(currency='AUD'),
  status TEXT NOT NULL,
  last_event_created BIGINT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE refund_requests (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK(amount_cents>0),
  reason TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN('requested','approved','rejected','processing','submitted','failed')),
  approved_by TEXT,
  approval_reference TEXT,
  approved_at TEXT,
  stripe_refund_id TEXT UNIQUE,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE billing_accounts (
  client_id TEXT PRIMARY KEY,
  stripe_account_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN('test','live')),
  stripe_customer_id TEXT UNIQUE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE agency_invoice_exports (
  statement_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL CHECK(length(snapshot_hash)=64),
  status TEXT NOT NULL CHECK(status IN('preparing','draft','finalized')),
  due_days BIGINT NOT NULL CHECK(due_days BETWEEN 1 AND 120),
  terms_reference TEXT NOT NULL,
  stripe_invoice_id TEXT UNIQUE,
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE billing_invoices (
  stripe_invoice_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  statement_id TEXT UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(currency='AUD'),
  subtotal_cents BIGINT NOT NULL CHECK(subtotal_cents>=0),
  total_cents BIGINT NOT NULL CHECK(total_cents>=subtotal_cents),
  paid_cents BIGINT NOT NULL DEFAULT 0 CHECK(paid_cents>=0),
  remaining_cents BIGINT NOT NULL CHECK(remaining_cents>=0),
  status TEXT NOT NULL CHECK(status IN('draft','open','paid','void','uncollectible','review')),
  reconciliation TEXT NOT NULL CHECK(reconciliation IN('matched','exception')),
  last_provider_created BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE billing_reconciliations (
  id TEXT PRIMARY KEY,
  provider_event_id TEXT NOT NULL,
  stripe_invoice_id TEXT NOT NULL,
  matched BIGINT NOT NULL CHECK(matched IN(0,1)),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(provider_event_id,stripe_invoice_id)
);

CREATE TABLE legal_document_versions (
  id TEXT PRIMARY KEY,
  document_key TEXT NOT NULL CHECK(document_key IN('privacy','terms','website-terms','platform-terms','booking-policy','service-scopes','subscription-terms')),
  version_label TEXT NOT NULL,
  title TEXT NOT NULL,
  body_json TEXT NOT NULL CHECK((body_json IS JSON)),
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','withdrawn')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  effective_at TEXT,
  approval_reference TEXT,
  withdrawn_by TEXT,
  withdrawn_at TEXT,
  withdrawal_reason TEXT,
  UNIQUE(document_key,version_label),
  CHECK(status!='approved' OR (approved_by IS NOT NULL AND approved_by!=created_by AND approved_at IS NOT NULL AND effective_at IS NOT NULL AND length(approval_reference)>=8))
);

CREATE TABLE legal_acceptance_receipts (
  id TEXT PRIMARY KEY,
  subject_kind TEXT NOT NULL CHECK(subject_kind IN('user','guest','rental','request')),
  subject_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN('onboarding','guest-intake','booking','payment','subscription','rental')),
  transaction_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
  acknowledgement TEXT NOT NULL CHECK(acknowledgement IN('privacy_notice','contract')),
  snapshot_sha256 TEXT NOT NULL CHECK(length(snapshot_sha256)=64),
  created_at TEXT NOT NULL,
  UNIQUE(subject_kind,subject_id,purpose,transaction_id,document_id)
);

CREATE TABLE building_manager_assignments (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK(ends_at>starts_at),
  authority_reference TEXT NOT NULL CHECK(length(authority_reference)>=8),
  requested_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','declined','revoked')),
  approved_by TEXT,
  approved_at TEXT,
  review_reference TEXT,
  revoked_at TEXT,
  CHECK(status!='approved' OR (approved_by IS NOT NULL AND approved_by!=requested_by AND approved_by!=user_id AND approved_at IS NOT NULL AND length(review_reference)>=8))
);

CREATE TABLE building_asset_links (
  asset_id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  linked_by TEXT NOT NULL,
  authority_reference TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE building_operational_items (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  asset_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN('maintenance','incident','daily_log','inspection','contractor_visit')),
  title TEXT NOT NULL,
  details_envelope TEXT NOT NULL CHECK((details_envelope IS JSON)),
  priority TEXT NOT NULL DEFAULT 'routine' CHECK(priority IN('routine','urgent','emergency')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','triaged','in_progress','awaiting_review','completed','cancelled')),
  requester_id TEXT NOT NULL,
  last_action_by TEXT NOT NULL,
  request_id TEXT UNIQUE,
  work_order_id TEXT UNIQUE,
  public_visible BIGINT NOT NULL DEFAULT 0 CHECK(public_visible IN(0,1)),
  public_summary TEXT NOT NULL DEFAULT '',
  completion_reference TEXT,
  completed_by TEXT,
  completed_at TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(public_visible=0 OR length(public_summary)>=4),
  CHECK(status!='completed' OR (completed_by IS NOT NULL AND completed_by!=requester_id AND completed_at IS NOT NULL AND length(completion_reference)>=8))
);

CREATE TABLE building_operational_events (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reference TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE building_plan_requests (
  plan_id TEXT NOT NULL,
  due_on TEXT NOT NULL,
  item_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(plan_id,due_on)
);

CREATE TABLE building_move_requests (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  lot_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('move_in','move_out','delivery')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK(ends_at>starts_at),
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN('requested','approved','declined','cancelled','completed')),
  reviewed_by TEXT,
  reference TEXT,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE building_access_devices (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('key','fob','remote','other')),
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN('available','issued','lost','retired')),
  holder_id TEXT,
  issued_at TEXT,
  acknowledged_at TEXT,
  created_by TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(building_id,label),
  CHECK(status!='issued' OR (holder_id IS NOT NULL AND issued_at IS NOT NULL))
);

CREATE TABLE building_report_grants (
  building_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  reference TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY(building_id,document_id)
);

CREATE TABLE building_notice_drafts (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  scheme_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL CHECK(audience IN('residents','owners','council','all_members')),
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
  starts_at TEXT NOT NULL,
  expires_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','published','rejected')),
  reviewed_by TEXT,
  review_reference TEXT,
  reviewed_at TEXT,
  notice_id TEXT UNIQUE
);

CREATE TABLE notice_supersessions (
  old_notice_id TEXT PRIMARY KEY,
  new_notice_id TEXT NOT NULL UNIQUE,
  actor_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(old_notice_id!=new_notice_id)
);

CREATE TABLE notice_revision_history (
  notice_id TEXT NOT NULL,
  version BIGINT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  expires_at TEXT,
  withdrawn_at TEXT,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(notice_id,version)
);

CREATE TABLE council_conflict_declarations (
  approval_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('clear','declared','unsure')),
  reason_envelope TEXT,
  declared_at TEXT NOT NULL,
  PRIMARY KEY(approval_id,user_id),
  CHECK(status='clear' OR reason_envelope IS NOT NULL)
);

CREATE TABLE council_response_history (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  approval_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  response TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE service_sale_variants (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  source_code TEXT NOT NULL,
  source_version TEXT NOT NULL,
  source_fee TEXT NOT NULL,
  label TEXT NOT NULL,
  scope_text TEXT NOT NULL,
  scope_sha256 TEXT NOT NULL CHECK(length(scope_sha256)=64),
  unit_ex_gst_cents BIGINT NOT NULL CHECK(unit_ex_gst_cents>0),
  minimum_cents BIGINT NOT NULL DEFAULT 0 CHECK(minimum_cents>=0),
  quantity_allowed BIGINT NOT NULL DEFAULT 0 CHECK(quantity_allowed IN(0,1)),
  gst_basis_points BIGINT NOT NULL CHECK(gst_basis_points IN(0,1000)),
  postcodes_json TEXT NOT NULL CHECK((postcodes_json IS JSON)),
  property_types_json TEXT NOT NULL CHECK((property_types_json IS JSON)),
  starts_at TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK(expires_at>starts_at),
  payment_policy TEXT NOT NULL CHECK(payment_policy='invoice_after_confirmation'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','withdrawn')),
  created_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  approval_reference TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE feature_release_approvals (
  id TEXT PRIMARY KEY,
  feature TEXT NOT NULL,
  environment TEXT NOT NULL CHECK(environment IN('staging','production')),
  source_sha TEXT NOT NULL CHECK(length(source_sha)=40),
  evidence_reference TEXT NOT NULL CHECK(length(evidence_reference)>=8),
  expires_at TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN('requested','approved','rejected','revoked')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reference TEXT,
  CHECK(status!='approved' OR (reviewed_by IS NOT NULL AND reviewed_by!=requested_by AND reviewed_at IS NOT NULL AND length(review_reference)>=8))
);

CREATE TABLE commercial_lease_register (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  occupier_name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK(ends_at>starts_at),
  details_envelope TEXT NOT NULL,
  source_document_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','ended')),
  version BIGINT NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(client_id,property_id,reference)
);

CREATE TABLE commercial_lease_tasks (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('option_date','rent_review','insurance','compliance','make_good','handover','other')),
  title TEXT NOT NULL,
  due_at TEXT NOT NULL,
  details_envelope TEXT NOT NULL,
  work_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','in_progress','review_required','completed','cancelled')),
  version BIGINT NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  completion_reference TEXT,
  completion_document_id TEXT
);

CREATE TABLE commercial_lease_events (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  task_id TEXT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reference TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE agency_owner_invitations (
  id TEXT PRIMARY KEY,
  agency_client_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  management_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  email_hash TEXT NOT NULL,
  recipient_envelope TEXT NOT NULL,
  authority_reference TEXT NOT NULL,
  allow_inspections BIGINT NOT NULL CHECK(allow_inspections IN(0,1)),
  allow_reports BIGINT NOT NULL CHECK(allow_reports IN(0,1)),
  invited_by TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','claimed','approved','revoked')),
  claimed_by TEXT,
  claimed_at TEXT,
  grant_id TEXT UNIQUE,
  reviewed_by TEXT,
  reviewed_at TEXT
);

CREATE TABLE pcr_routine_discount_entitlements (
  id TEXT PRIMARY KEY,
  guest_order_id TEXT NOT NULL UNIQUE,
  purchaser_email_hash TEXT NOT NULL,
  discount_basis_points BIGINT NOT NULL DEFAULT 2000 CHECK(discount_basis_points=2000),
  uses_remaining BIGINT NOT NULL DEFAULT 4 CHECK(uses_remaining BETWEEN 0 AND 4),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','suspended'))
);

CREATE TABLE pcr_routine_discount_redemptions (
  id TEXT PRIMARY KEY,
  entitlement_id TEXT NOT NULL,
  payment_id TEXT NOT NULL UNIQUE,
  discount_cents BIGINT NOT NULL CHECK(discount_cents>0),
  created_at TEXT NOT NULL
);

CREATE TABLE pcr_discount_reservations (
  id TEXT PRIMARY KEY,
  entitlement_id TEXT NOT NULL,
  guest_order_id TEXT NOT NULL UNIQUE,
  payment_id TEXT NOT NULL UNIQUE,
  property_id TEXT NOT NULL,
  base_ex_gst_cents BIGINT NOT NULL CHECK(base_ex_gst_cents>0),
  base_gst_cents BIGINT NOT NULL CHECK(base_gst_cents>=0),
  discount_cents BIGINT NOT NULL CHECK(discount_cents>0),
  total_cents BIGINT NOT NULL CHECK(total_cents>0 AND total_cents+discount_cents=base_ex_gst_cents+base_gst_cents),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN('reserved','redeemed','released','exception')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE residential_paid_property_enrollments (
  client_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  enrolled_at TEXT NOT NULL,
  PRIMARY KEY(client_id,property_id)
);

CREATE TABLE stripe_subscription_invoice_observations (
  stripe_invoice_id TEXT PRIMARY KEY,
  stripe_subscription_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  price_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('paid','failed','pending','review')),
  currency TEXT NOT NULL CHECK(currency='aud'),
  amount_paid_cents BIGINT NOT NULL DEFAULT 0 CHECK(amount_paid_cents>=0),
  invoice_created BIGINT NOT NULL,
  paid_through TEXT NOT NULL,
  last_event_created BIGINT NOT NULL,
  last_event_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE stripe_subscription_risk_holds (
  id TEXT PRIMARY KEY,
  stripe_invoice_id TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  charge_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN('refunded','dispute','fraud_warning')),
  status TEXT NOT NULL CHECK(status IN('open','released')),
  created_at TEXT NOT NULL,
  released_at TEXT
);

CREATE TABLE rental_application_reference_checks (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  applicant_id TEXT NOT NULL,
  target TEXT NOT NULL CHECK(target IN('previous_lessor','employer','personal_1','personal_2')),
  outcome TEXT NOT NULL CHECK(outcome IN('contact_attempted','confirmed','not_confirmed','unable_to_contact','not_applicable')),
  method TEXT NOT NULL CHECK(method IN('phone','email','other','not_contacted')),
  details_envelope TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE commercial_lease_revisions (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  base_version BIGINT NOT NULL CHECK(base_version>0),
  previous_revision_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN('commencement','variation','renewal','expiry')),
  effective_at TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK(ends_at>starts_at),
  option_opens_at TEXT,
  option_closes_at TEXT,
  source_document_id TEXT NOT NULL,
  source_reference TEXT NOT NULL CHECK(length(source_reference)>=8),
  terms_envelope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reference TEXT,
  CHECK((option_opens_at IS NULL AND option_closes_at IS NULL) OR
       (option_opens_at IS NOT NULL AND option_closes_at IS NOT NULL AND option_opens_at<option_closes_at AND option_closes_at<=ends_at))
);

CREATE TABLE commercial_charge_rules (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  source_document_id TEXT NOT NULL,
  source_reference TEXT NOT NULL CHECK(length(source_reference)>=8),
  rule_json TEXT NOT NULL CHECK((rule_json IS JSON)),
  rule_sha256 TEXT NOT NULL CHECK(length(rule_sha256)=64),
  details_envelope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reference TEXT
);

CREATE TABLE commercial_lease_charges (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  adjusts_charge_id TEXT,
  source_document_id TEXT NOT NULL,
  source_reference TEXT NOT NULL CHECK(length(source_reference)>=8),
  calculation_json TEXT NOT NULL CHECK((calculation_json IS JSON)),
  calculation_sha256 TEXT NOT NULL CHECK(length(calculation_sha256)=64),
  subtotal_cents BIGINT NOT NULL,
  gst_cents BIGINT NOT NULL,
  total_cents BIGINT NOT NULL CHECK(total_cents=subtotal_cents+gst_cents AND abs(total_cents)<=1000000000000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reference TEXT,
  CHECK(adjusts_charge_id IS NOT NULL OR (subtotal_cents>=0 AND gst_cents>=0 AND total_cents>=0))
);

CREATE TABLE commercial_obligation_reviews (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_version BIGINT NOT NULL CHECK(task_version>0),
  kind TEXT NOT NULL CHECK(kind IN('assessment','completion','cancellation','reopening')),
  source_document_id TEXT NOT NULL,
  source_reference TEXT NOT NULL CHECK(length(source_reference)>=8),
  condition_document_id TEXT,
  work_order_id TEXT,
  responsibility TEXT NOT NULL CHECK(responsibility IN('lessor','occupier','shared','undetermined')),
  details_envelope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reference TEXT
);

CREATE TABLE commercial_task_successors (
  predecessor_id TEXT PRIMARY KEY,
  successor_id TEXT NOT NULL UNIQUE,
  review_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE commercial_lease_exceptions (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('missed_option','overlapping_options','missing_document','changed_terms','disputed_charge','disputed_task','other')),
  charge_id TEXT,
  task_id TEXT,
  source_reference TEXT NOT NULL CHECK(length(source_reference)>=8),
  details_envelope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT,
  resolution_reference TEXT,
  resolution_document_id TEXT
);

CREATE TABLE commercial_exception_assignments (
  id TEXT PRIMARY KEY,
  exception_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN('routine','high','urgent')),
  actor_id TEXT NOT NULL,
  reference TEXT NOT NULL CHECK(length(reference)>=8),
  created_at TEXT NOT NULL
);

CREATE TABLE report_render_reviews (
  id TEXT PRIMARY KEY,
  report_version_id TEXT NOT NULL UNIQUE,
  document_id TEXT NOT NULL UNIQUE,
  document_sha256 TEXT NOT NULL CHECK(length(document_sha256)=64),
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN('accepted','rejected')),
  review_reference TEXT NOT NULL CHECK(length(trim(review_reference)) BETWEEN 8 AND 500),
  reviewed_at TEXT NOT NULL
);

CREATE TABLE billing_invoice_contacts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  email TEXT NOT NULL,
  authority_reference TEXT NOT NULL CHECK(length(trim(authority_reference)) BETWEEN 8 AND 500),
  status TEXT NOT NULL CHECK(status IN('pending','approved','revoked')),
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  revoked_by TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE billing_invoice_dispatches (
  statement_id TEXT PRIMARY KEY,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  contact_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN('preparing','provider_accepted','needs_reconciliation')),
  requested_by TEXT NOT NULL,
  approval_reference TEXT NOT NULL CHECK(length(trim(approval_reference)) BETWEEN 8 AND 500),
  provider_accepted_at TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE billing_invoice_dispatch_events (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL,
  event TEXT NOT NULL CHECK(event IN('requested','provider_accepted','needs_reconciliation')),
  actor_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE rental_tenancy_handovers (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE,
  outcome_id TEXT NOT NULL UNIQUE,
  submission_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  tenancy_id TEXT NOT NULL UNIQUE,
  request_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'awaiting_agreement'
  CHECK(status IN('awaiting_agreement','activated','void')),
  authority_reference TEXT NOT NULL CHECK(length(trim(authority_reference))>=8),
  terms_envelope TEXT NOT NULL,
  applicant_count BIGINT NOT NULL CHECK(applicant_count BETWEEN 1 AND 10),
  initiated_by TEXT NOT NULL,
  initiated_at TEXT NOT NULL,
  activated_by TEXT,
  activated_at TEXT,
  activation_reference TEXT,
  voided_by TEXT,
  voided_at TEXT,
  void_reference TEXT,
  CHECK((status='activated')=(activated_at IS NOT NULL)),
  CHECK((status='void')=(voided_at IS NOT NULL))
);

CREATE TABLE rental_tenancy_handover_people (
  id TEXT PRIMARY KEY,
  handover_id TEXT NOT NULL,
  applicant_ordinal BIGINT NOT NULL CHECK(applicant_ordinal BETWEEN 1 AND 10),
  email_hash TEXT NOT NULL CHECK(length(email_hash)=64),
  invitation_token_hash TEXT NOT NULL UNIQUE CHECK(length(invitation_token_hash)=64),
  invited_at TEXT NOT NULL,
  UNIQUE(handover_id,applicant_ordinal),
  UNIQUE(handover_id,email_hash)
);

CREATE TABLE legacy_included_property_grants (
  client_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'migration_0053' CHECK(origin='migration_0053'),
  PRIMARY KEY(client_id,property_id)
);

CREATE TABLE account_subscription_preferences (
  client_id TEXT PRIMARY KEY,
  account_state TEXT NOT NULL DEFAULT 'registered'
    CHECK(account_state IN ('registered','verified','active')),
  subscription_intent TEXT NOT NULL DEFAULT 'none'
    CHECK(subscription_intent IN ('none','checkout_requested','subscribed','canceled')),
  updated_at TEXT NOT NULL
);

CREATE TABLE residential_paid_service_allowances (
  service_id TEXT PRIMARY KEY,
  approval_reference TEXT NOT NULL CHECK(length(trim(approval_reference))>=8),
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL
);

CREATE TABLE client_service_interests (
  client_id TEXT NOT NULL,
  service_area TEXT NOT NULL CHECK(service_area IN ('residential','commercial','strata','co-living','construction','leasing','maintenance')),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(client_id, service_area)
);

CREATE TABLE commercial_application_permissions (
  user_id TEXT PRIMARY KEY,
  can_configure BIGINT NOT NULL DEFAULT 0 CHECK(can_configure IN(0,1)),
  can_review BIGINT NOT NULL DEFAULT 0 CHECK(can_review IN(0,1)),
  active BIGINT NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  reference TEXT NOT NULL
);

CREATE TABLE commercial_application_flows (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  version BIGINT NOT NULL CHECK(version>0),
  mode TEXT NOT NULL CHECK(mode='proinspect_commercial'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','revoked')),
  config_envelope TEXT NOT NULL,
  config_sha256 TEXT NOT NULL CHECK(length(config_sha256)=64),
  recipient_hash TEXT NOT NULL,
  recipient_verified_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  approval_reference TEXT,
  UNIQUE(listing_id,version)
);

CREATE TABLE commercial_flow_recipient_challenges (
  token_hash TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE commercial_applications (
  id TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','invited','in_progress','ready','submitted','scanning_validation','referred','decision_recorded','closed','withdrawn','expired','needs_information','blocked')),
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  shared_envelope TEXT NOT NULL,
  scope_sha256 TEXT NOT NULL CHECK(length(scope_sha256)=64),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT,
  retained_until TEXT NOT NULL,
  privacy_hold_until TEXT,
  purged_at TEXT
);

CREATE TABLE commercial_application_people (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  lead BIGINT NOT NULL DEFAULT 0 CHECK(lead IN(0,1)),
  profile_envelope TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'invited' CHECK(state IN('invited','in_progress','ready','withdrawn','removed')),
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  declared_scope_sha256 TEXT,
  declared_notice_sha256 TEXT,
  declared_at TEXT,
  UNIQUE(application_id,email_hash),
  UNIQUE(application_id,id)
);

CREATE TABLE commercial_applicant_entities (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN('individual','sole_trader','company','partnership','trust','corporate_trustee','association','other_overseas','joint')),
  envelope TEXT NOT NULL,
  UNIQUE(application_id,id)
);

CREATE TABLE commercial_people_roles (
  application_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN('contact','director','partner','trustee_officer','signatory','guarantor')),
  authority_envelope TEXT NOT NULL,
  PRIMARY KEY(application_id,person_id,entity_id,role)
);

CREATE TABLE commercial_application_links (
  token_hash TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE TABLE commercial_application_sessions (
  token_hash TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE commercial_application_evidence (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  entity_id TEXT,
  category TEXT NOT NULL CHECK(category IN('financial_year','bas_quarter','registry','trust_authority','partnership_authority','association_authority','identity','guarantee','fitout_plan','alternative','other')),
  period_label TEXT NOT NULL DEFAULT '',
  object_key TEXT NOT NULL UNIQUE,
  metadata_envelope TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  scan_status TEXT NOT NULL DEFAULT 'pending' CHECK(scan_status IN('pending','clean','unsafe','error')),
  review_status TEXT NOT NULL DEFAULT 'quarantined' CHECK(review_status IN('quarantined','released','rejected')),
  scan_requested_at TEXT,
  scan_reference_envelope TEXT,
  reviewed_by TEXT,
  uploaded_at TEXT NOT NULL
);

CREATE TABLE commercial_application_scan_receipts (
  event_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE commercial_application_offers (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  version TEXT NOT NULL,
  envelope TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  expires_at TEXT NOT NULL,
  authorised_by TEXT NOT NULL,
  authorised_at TEXT NOT NULL,
  UNIQUE(application_id,version)
);

CREATE TABLE commercial_application_submissions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  snapshot_envelope TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  submitted_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE commercial_application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT,
  flow_id TEXT,
  actor_person_id TEXT,
  actor_staff_id TEXT,
  kind TEXT NOT NULL,
  envelope TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE commercial_application_referrals (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN('prepared','sending','accepted','uncertain','bounced','revoked')),
  prepared_by TEXT NOT NULL,
  prepared_at TEXT NOT NULL,
  receipt_envelope TEXT
);

CREATE TABLE commercial_referral_grants (
  token_hash TEXT PRIMARY KEY,
  referral_id TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE commercial_application_privacy_requests (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN('access','correction','erasure')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','resolved','denied')),
  envelope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolution_envelope TEXT,
  resolved_by TEXT,
  resolved_at TEXT
);

CREATE TABLE commercial_application_purge_permits (
  application_id TEXT PRIMARY KEY,
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  verification_reference TEXT NOT NULL
);

CREATE TABLE property_application_management (
  property_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN('proinspect','external','unconfirmed')),
  authority_reference TEXT NOT NULL CHECK(length(authority_reference)>=8),
  version BIGINT NOT NULL DEFAULT 1 CHECK(version>0),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE managed_rental_intake_releases (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK(environment IN('staging','production')),
  source_sha TEXT NOT NULL CHECK(length(source_sha)=40),
  policy_version TEXT NOT NULL,
  policy_sha256 TEXT NOT NULL CHECK(length(policy_sha256)=64),
  intake_mode TEXT NOT NULL CHECK(intake_mode='details_only'),
  authorized_by TEXT NOT NULL,
  authorization_reference TEXT NOT NULL CHECK(length(authorization_reference)>=12),
  enabled BIGINT NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(environment,source_sha)
);

CREATE TABLE managed_rental_document_releases (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK(environment IN('staging','production')),
  source_sha TEXT NOT NULL CHECK(length(source_sha)=40),
  policy_version TEXT NOT NULL,
  policy_sha256 TEXT NOT NULL CHECK(length(policy_sha256)=64),
  intake_mode TEXT NOT NULL CHECK(intake_mode='scanned_documents'),
  scanner_worker_name TEXT NOT NULL,
  scanner_source_sha TEXT NOT NULL CHECK(length(scanner_source_sha)=40),
  scanner_image_digest TEXT NOT NULL CHECK(length(scanner_image_digest)=64),
  scanner_key_id TEXT NOT NULL CHECK(length(scanner_key_id)=64),
  scanner_public_jwk TEXT NOT NULL CHECK((scanner_public_jwk IS JSON) AND (scanner_public_jwk::json #>> '{kty}')='EC' AND (scanner_public_jwk::json #>> '{crv}')='P-256' AND (scanner_public_jwk::json #>> '{d}') IS NULL),
  scanner_test_sha256 TEXT NOT NULL CHECK(length(scanner_test_sha256)=64),
  scanner_verified_at TEXT NOT NULL,
  authorized_by TEXT NOT NULL,
  authorization_reference TEXT NOT NULL CHECK(length(authorization_reference)>=12),
  enabled BIGINT NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(environment,source_sha)
);

CREATE TABLE managed_rental_temporary_releases (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK(environment IN('staging','production')),
  source_sha TEXT NOT NULL CHECK(length(source_sha)=40),
  policy_version TEXT NOT NULL,
  policy_sha256 TEXT NOT NULL CHECK(length(policy_sha256)=64),
  intake_mode TEXT NOT NULL CHECK(intake_mode='temporary_documents'),
  authorized_by TEXT NOT NULL,
  authorization_reference TEXT NOT NULL CHECK(length(authorization_reference)>=12),
  enabled BIGINT NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(environment,source_sha)
);

CREATE TABLE rental_temporary_documents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  applicant_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  metadata_envelope TEXT,
  size_bytes BIGINT NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  state TEXT NOT NULL DEFAULT 'quarantined' CHECK(state IN('quarantined','approved','rejected','purging','purged')),
  security_evidence_envelope TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  uploaded_at TEXT NOT NULL,
  stored_at TEXT,
  delete_after TEXT NOT NULL,
  purged_at TEXT,
  CHECK(state!='approved' OR (security_evidence_envelope IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK(state!='purged' OR (metadata_envelope IS NULL AND security_evidence_envelope IS NULL AND purged_at IS NOT NULL))
);

CREATE TABLE rental_temporary_packages (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  outbox_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  recipient_envelope TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  cc_hash TEXT NOT NULL,
  management_version BIGINT NOT NULL,
  recipient_verified_at TEXT NOT NULL,
  document_ids_json TEXT NOT NULL CHECK((document_ids_json IS JSON)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  provider_id TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(application_id,submission_id),
  CHECK(sent_at IS NULL OR provider_id IS NOT NULL)
);

CREATE TABLE account_experience_tags (
  client_id TEXT NOT NULL,
  tag TEXT NOT NULL CHECK(tag IN ('co_living','student_living','professional_portfolio','multi_site','priority_operations')),
  set_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(client_id,tag)
);

CREATE TABLE co_living_sites (
  property_id TEXT PRIMARY KEY,
  allocation_mode TEXT NOT NULL CHECK(allocation_mode IN ('room','bed')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE co_living_spaces (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 64),
  space_type TEXT NOT NULL CHECK(space_type IN ('room','bed','shared_area')),
  active BIGINT NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(property_id,label)
);

CREATE TABLE co_living_occupancies (
  tenancy_id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE commercial_occupancies (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  premises_label TEXT NOT NULL CHECK(length(premises_label) BETWEEN 2 AND 160),
  relationship_kind TEXT NOT NULL CHECK(relationship_kind IN('tenant_contact','employee','contractor','other_occupant')),
  authority_reference TEXT NOT NULL CHECK(length(authority_reference) BETWEEN 4 AND 500),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','ended')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(ends_at IS NULL OR ends_at>starts_at)
);

CREATE TABLE commercial_occupant_invitations (
  token_hash TEXT PRIMARY KEY,
  occupancy_id TEXT NOT NULL,
  email public.citext NOT NULL,
  created_by TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE commercial_occupant_memberships (
  id TEXT PRIMARY KEY,
  occupancy_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(occupancy_id,user_id),
  CHECK(ends_at IS NULL OR ends_at>starts_at)
);

CREATE TABLE commercial_occupant_requests (
  id TEXT PRIMARY KEY,
  occupancy_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 4 AND 180),
  details TEXT NOT NULL CHECK(length(details) BETWEEN 10 AND 5000),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','under_review','closed')),
  manager_response TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE council_appointment_reviews (
  id TEXT PRIMARY KEY,
  scheme_id TEXT NOT NULL,
  lot_id TEXT,
  email public.citext NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  appointment_reference TEXT NOT NULL CHECK(length(appointment_reference) BETWEEN 8 AND 500),
  requested_by TEXT NOT NULL,
  origin_client_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','declined')),
  reviewed_by TEXT,
  review_reference TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  CHECK(ends_at>starts_at),
  CHECK((status='pending' AND reviewed_by IS NULL AND review_reference IS NULL AND reviewed_at IS NULL)
        OR (status IN('approved','declined') AND reviewed_by IS NOT NULL AND review_reference IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE TABLE registered_booking_payment_links (
  booking_id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL UNIQUE,
  price_ex_gst_cents BIGINT NOT NULL CHECK(price_ex_gst_cents>0),
  gst_cents BIGINT NOT NULL CHECK(gst_cents>=0),
  created_at TEXT NOT NULL
);

CREATE TABLE user_portal_preferences (
  user_id TEXT NOT NULL,
  portal_family TEXT NOT NULL CHECK(portal_family IN ('residential','commercial','strata','resident','operations')),
  display_density TEXT NOT NULL DEFAULT 'comfortable' CHECK(display_density IN ('comfortable','compact')),
  landing_section TEXT NOT NULL DEFAULT 'overview' CHECK(landing_section IN ('overview','properties','bookings','requests','documents','co-living','facilities','finance','my-room','occupant-premises','occupant-requests')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id,portal_family)
);

CREATE TABLE co_living_lease_terms (
  tenancy_id TEXT PRIMARY KEY,
  rent_cents BIGINT CHECK(rent_cents>=0),
  rent_period TEXT NOT NULL DEFAULT 'weekly' CHECK(rent_period IN ('weekly','fortnightly','monthly')),
  expected_bond_cents BIGINT CHECK(expected_bond_cents>=0),
  utility_basis TEXT NOT NULL DEFAULT 'included' CHECK(utility_basis IN ('included','equal_share','metered','manual')),
  agreement_document_id TEXT,
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK(review_status IN ('draft','reviewed')),
  source_reference TEXT NOT NULL CHECK(length(trim(source_reference))>=8),
  reviewed_by TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE co_living_occupancy_events (
  id TEXT PRIMARY KEY,
  tenancy_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('check_in','check_out','condition_review','transfer_requested','agreement_review','rent_review','bond_review','utilities_review')),
  effective_at TEXT NOT NULL,
  evidence_reference TEXT NOT NULL CHECK(length(trim(evidence_reference)) BETWEEN 8 AND 240),
  note_envelope TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE co_living_area_inspections (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  inspected_at TEXT NOT NULL,
  summary_envelope TEXT NOT NULL,
  public_summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','published')),
  issued_document_id TEXT,
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(status!='published' OR (COALESCE(length(trim(public_summary)),0)>=8 AND reviewed_by IS NOT NULL))
);

CREATE TABLE strata_amenities (
  id TEXT PRIMARY KEY,
  scheme_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 3 AND 100),
  description TEXT NOT NULL DEFAULT '',
  active BIGINT NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(scheme_id,name)
);

CREATE TABLE strata_amenity_requests (
  id TEXT PRIMARY KEY,
  amenity_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','declined','cancelled')),
  reviewed_by TEXT,
  review_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(ends_at>starts_at)
);

CREATE TABLE report_photo_annotations (
  evidence_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
  annotations_json TEXT NOT NULL CHECK((annotations_json IS JSON)),
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK(review_status IN ('draft','accepted','rejected')),
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  source_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE invoice_credit_proposals (
  id TEXT PRIMARY KEY,
  stripe_invoice_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK(amount_cents>0),
  rationale TEXT NOT NULL CHECK(length(trim(rationale))>=8),
  evidence_reference TEXT NOT NULL CHECK(length(trim(evidence_reference))>=8),
  request_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','rejected')),
  requested_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE bank_reconciliation_observations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  observed_amount_cents BIGINT NOT NULL CHECK(observed_amount_cents>=0),
  observation_type TEXT NOT NULL CHECK(observation_type IN ('bank_received','bank_returned','payout_match','payout_exception')),
  source_reference TEXT NOT NULL CHECK(length(trim(source_reference))>=8),
  request_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded','reviewed','disputed')),
  requested_by TEXT NOT NULL,
  reviewed_by TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE INDEX sessions_user ON sessions(user_id);

CREATE INDEX memberships_user ON client_memberships(user_id,active);

CREATE INDEX links_property ON client_property_links(property_id,client_id);

CREATE UNIQUE INDEX one_current_manager ON property_management_relationships(property_id) WHERE ends_at IS NULL;

CREATE INDEX management_client ON property_management_relationships(manager_client_id,property_id);

CREATE INDEX tenancy_property ON tenancies(property_id,status);

CREATE INDEX bookings_client_property ON bookings(client_id,property_id,starts_at);

CREATE INDEX bookings_schedule ON bookings(resource_id,status,reserved_start,reserved_end);

CREATE INDEX requests_property ON requests(property_id,status);

CREATE INDEX requests_scheme ON requests(scheme_id,status);

CREATE INDEX work_orders_scope ON work_orders(client_id,property_id,assigned_staff_id,status);

CREATE INDEX documents_context ON documents(property_id,scheme_id,status);

CREATE INDEX notifications_user ON notifications(user_id,read_at,created_at);

CREATE INDEX outbox_pending ON outbox_events(status,available_at);

CREATE UNIQUE INDEX report_content_once ON documents(work_order_id,sha256,category) WHERE work_order_id IS NOT NULL;

CREATE UNIQUE INDEX one_pending_application ON organisation_applications(user_id,workspace_kind) WHERE status='pending';

CREATE UNIQUE INDEX one_pending_approval ON approvals(work_order_id) WHERE status='pending';

CREATE UNIQUE INDEX one_document_successor ON documents(previous_document_id) WHERE previous_document_id IS NOT NULL;

CREATE UNIQUE INDEX payment_checkout_session ON payments(checkout_session_id) WHERE checkout_session_id IS NOT NULL;

CREATE INDEX integration_pending ON integration_deliveries(status,available_at);

CREATE INDEX enquiries_queue ON marketing_enquiries(status,created_at,id);

CREATE INDEX enquiry_events_parent ON enquiry_events(enquiry_id,created_at);

CREATE INDEX notices_dispatch ON notice_dispatch_jobs(status,available_at);

CREATE INDEX booking_calendar_sync_pending
  ON booking_calendar_sync(status,next_attempt_at,updated_at);

CREATE INDEX guest_orders_queue ON guest_service_orders(status,created_at);

CREATE INDEX guest_orders_booking ON guest_service_orders(booking_id);

CREATE INDEX guest_links_order ON guest_access_links(order_id,purpose,expires_at);

CREATE UNIQUE INDEX leasing_one_live_per_property ON leasing_listings(property_id) WHERE status IN('draft','published');

CREATE INDEX leasing_public_search ON leasing_listings(status,kind,suburb,published_at);

CREATE INDEX leasing_owner_lookup ON leasing_listings(instructed_by_client_id,property_id);

CREATE INDEX leasing_photos_listing ON leasing_photos(listing_id,sort_order,id);

CREATE INDEX leasing_upcoming_sessions ON leasing_sessions(listing_id,status,starts_at);

CREATE UNIQUE INDEX leasing_inspection_contact ON leasing_leads(session_id,email_hash) WHERE kind='inspection' AND status='active';

CREATE UNIQUE INDEX leasing_interest_contact ON leasing_leads(listing_id,email_hash) WHERE kind='interest' AND status='active';

CREATE INDEX leasing_leads_session ON leasing_leads(session_id,status);

CREATE INDEX leasing_email_pending ON leasing_email_events(status,created_at);

CREATE INDEX rental_applications_by_listing ON rental_applications(listing_id,status,started_at);

CREATE INDEX rental_applications_by_status ON rental_applications(status,submitted_at,id);

CREATE INDEX rental_applicants_parent ON rental_applicants(application_id,state);

CREATE INDEX rental_applicants_email ON rental_applicants(email_hash,application_id);

CREATE INDEX rental_docs_applicant ON rental_application_documents(applicant_id,uploaded_at);

CREATE INDEX rental_docs_application ON rental_application_documents(application_id,review_status);

CREATE INDEX rental_events_application ON rental_application_events(application_id,created_at);

CREATE INDEX rental_submission_history ON rental_application_submissions(application_id,version DESC);

CREATE INDEX rental_handoffs_by_status ON rental_application_handoffs(status,staged_at);

CREATE INDEX rental_applications_retention_due ON rental_applications(retained_until,status);

CREATE INDEX rental_privacy_requests_status ON rental_application_privacy_requests(status,created_at);

CREATE INDEX rental_privacy_requests_parent ON rental_application_privacy_requests(application_id,applicant_id);

CREATE INDEX rental_scan_receipts_doc ON rental_document_scan_receipts(document_id);

CREATE UNIQUE INDEX rental_privacy_one_open_request ON rental_application_privacy_requests(applicant_id,kind)
 WHERE status IN('requested','in_review');

CREATE INDEX leasing_checkins_by_session ON leasing_checkins(session_id,arrived_at);

CREATE INDEX leasing_checkins_by_listing ON leasing_checkins(listing_id,arrived_at);

CREATE INDEX leasing_checkins_by_email ON leasing_checkins(session_id,email_hash);

CREATE INDEX open_home_sheet_pending ON open_home_sheet_events(status,created_at);

CREATE INDEX open_home_sheet_nonces_expiry ON open_home_sheet_nonces(expires_at);

CREATE INDEX wa_forms_by_tenancy ON wa_residential_form_cases(tenancy_id,status,created_at);

CREATE INDEX wa_forms_by_deadline ON wa_residential_form_cases(status,due_at) WHERE due_at IS NOT NULL;

CREATE INDEX wa_form_events_case ON wa_residential_form_events(case_id,created_at);

CREATE INDEX wa_form_delivery_case ON wa_residential_form_delivery(case_id,created_at);

CREATE INDEX wa_form_responses_case ON wa_residential_form_responses(case_id,created_at);

CREATE INDEX wa_form_booking ON wa_residential_form_cases(booking_id) WHERE booking_id IS NOT NULL;

CREATE INDEX wa_form_decisions_case ON wa_residential_form_decisions(case_id,created_at);

CREATE INDEX wa_form_external_case ON wa_residential_form_external_events(case_id,created_at);

CREATE INDEX wa_form_signatures_case ON wa_residential_form_signatures(case_id,created_at);

CREATE INDEX wa_form_entry_booking ON wa_residential_form_cases(form_code,booking_id,notice_invalidated_at);

CREATE INDEX wa_form_verifications_case ON wa_residential_form_verifications(case_id,requirement);

CREATE INDEX bond_status ON bonds(status,updated_at);

CREATE INDEX bond_parties_bond ON bond_parties(bond_id,status);

CREATE INDEX bond_transactions_bond ON bond_transactions(bond_id,created_at);

CREATE UNIQUE INDEX bond_one_pending_submission ON bond_transactions(bond_id) WHERE status='submitted' AND code IN('B01','B02','B03','B04','B05','B06','B07','B08','B09','B10','B11','B12','B13','B14','B15','B19');

CREATE INDEX bond_receipts_due ON bond_receipts(due_at) WHERE lodgement_confirmed_at IS NULL;

CREATE INDEX bond_claims_transaction ON bond_claims(transaction_id);

CREATE INDEX bond_cases_transaction ON bond_cases(transaction_id);

CREATE INDEX bond_deadlines_due ON bond_deadlines(due_at) WHERE completed_at IS NULL;

CREATE INDEX bond_events_history ON bond_events(bond_id,created_at);

CREATE INDEX bond_contributions_receipt ON bond_contributions(receipt_id);

CREATE INDEX bond_allocations_tx ON bond_allocations(transaction_id);

CREATE INDEX bond_verifications_documents ON bond_external_verifications(bond_id,document_id,transaction_id,result);

CREATE INDEX bond_exceptions_open ON bond_exception_cases(status,created_at);

CREATE INDEX open_home_inspection_reports_listing ON open_home_inspection_reports(listing_id,queued_at);

CREATE INDEX idx_reports_client ON inspection_reports(client_id,status,created_at);

CREATE INDEX idx_reports_property ON inspection_reports(property_id,status);

CREATE INDEX idx_reports_scheme ON inspection_reports(scheme_id,status);

CREATE INDEX v2_assets_property ON v2_assets(property_id,parent_id);

CREATE INDEX v2_assets_scheme ON v2_assets(scheme_id,parent_id);

CREATE INDEX v2_assets_parent ON v2_assets(parent_id);

CREATE UNIQUE INDEX v2_asset_markets_property ON v2_asset_markets(property_id,market_code) WHERE property_id IS NOT NULL;

CREATE UNIQUE INDEX v2_asset_markets_scheme ON v2_asset_markets(scheme_id,market_code) WHERE scheme_id IS NOT NULL;

CREATE INDEX v2_engagements_client ON v2_engagements(client_id,status);

CREATE INDEX v2_engagements_property ON v2_engagements(property_id,status);

CREATE INDEX v2_engagements_scheme ON v2_engagements(scheme_id,status);

CREATE UNIQUE INDEX v2_one_active_subscription ON v2_subscription_periods(engagement_id) WHERE status='active';

CREATE INDEX v2_usage_subscription ON v2_usage_ledger(subscription_id,metric);

CREATE INDEX v2_tasks_work_order ON v2_maintenance_tasks(work_order_id,status);

CREATE INDEX v2_tasks_asset ON v2_maintenance_tasks(asset_id,status);

CREATE INDEX v2_credentials_contractor ON v2_contractor_credentials(contractor_id,credential_type,status,valid_until);

CREATE UNIQUE INDEX v2_active_staff_task ON v2_task_assignments(task_id,staff_user_id) WHERE staff_user_id IS NOT NULL AND status='confirmed';

CREATE UNIQUE INDEX v2_active_contractor_task ON v2_task_assignments(task_id,contractor_id) WHERE contractor_id IS NOT NULL AND status='confirmed';

CREATE INDEX v2_assignments_staff ON v2_task_assignments(staff_user_id,status);

CREATE INDEX v2_assignments_contractor ON v2_task_assignments(contractor_id,status);

CREATE UNIQUE INDEX v2_staff_resource_once ON v2_capacity_resources(staff_user_id) WHERE staff_user_id IS NOT NULL;

CREATE UNIQUE INDEX v2_contractor_resource_once ON v2_capacity_resources(contractor_id) WHERE contractor_id IS NOT NULL;

CREATE INDEX v2_roster_resource ON v2_roster_windows(resource_id,weekday);

CREATE INDEX v2_blocks_range ON v2_capacity_blocks(resource_id,starts_at,ends_at);

CREATE INDEX v2_allocations_range ON v2_resource_allocations(resource_id,status,starts_at,ends_at);

CREATE INDEX v2_allocations_task ON v2_resource_allocations(task_id,status);

CREATE INDEX v2_evidence_task ON v2_task_evidence(task_id,status);

CREATE INDEX v2_time_task ON v2_time_entries(task_id,status);

CREATE INDEX v2_time_staff ON v2_time_entries(staff_user_id,started_at,status);

CREATE INDEX v2_cost_task ON v2_external_costs(task_id,status);

CREATE INDEX v2_asset_details_critical ON v2_asset_details(criticality,lifecycle_status);

CREATE INDEX v2_conditions_asset ON v2_asset_conditions(asset_id,observed_on);

CREATE INDEX v2_warranties_asset ON v2_asset_warranties(asset_id,expires_on);

CREATE INDEX v2_pm_due ON v2_preventive_plans(status,next_due);

CREATE INDEX v2_pm_asset ON v2_preventive_plans(asset_id,status);

CREATE INDEX v2_pm_occurrences_due ON v2_preventive_occurrences(due_on,status);

CREATE INDEX v2_obligations_due ON v2_compliance_obligations(status,next_review_on);

CREATE INDEX v2_compliance_evidence_due ON v2_compliance_evidence(obligation_id,status,expires_on);

CREATE INDEX v2_compliance_actions_due ON v2_compliance_actions(status,due_on);

CREATE INDEX v2_asset_risk_review ON v2_asset_risks(status,next_review_on);

CREATE INDEX v2_pack_market ON v2_sector_packs(market_code,status);

CREATE INDEX v2_sector_modules_pack ON v2_sector_modules(pack_id,status);

CREATE INDEX v2_clearances_module ON v2_sector_module_clearances(module_code,status,valid_until);

CREATE INDEX v2_rollout_engagement ON v2_sector_rollouts(engagement_id,status);

CREATE INDEX v2_sector_records_scope ON v2_sector_records(rollout_id,module_code,status);

CREATE UNIQUE INDEX v2_enterprise_portfolio_property ON v2_enterprise_portfolio_members(portfolio_id,property_id) WHERE property_id IS NOT NULL;

CREATE UNIQUE INDEX v2_enterprise_portfolio_scheme ON v2_enterprise_portfolio_members(portfolio_id,scheme_id) WHERE scheme_id IS NOT NULL;

CREATE INDEX v2_cap_programme_status ON v2_capital_programmes(engagement_id,status);

CREATE INDEX v2_cap_projects_programme ON v2_capital_projects(programme_id,status);

CREATE INDEX v2_cap_milestones_due ON v2_capital_milestones(status,due_on);

CREATE INDEX v2_cap_commitments_project ON v2_capital_commitments(project_id,status);

CREATE INDEX v2_report_snapshots_definition ON v2_report_snapshots(definition_id,generated_at);

CREATE INDEX v2_alerts_status ON v2_enterprise_alerts(status,severity,due_on);

CREATE INDEX stripe_billing_links_status ON stripe_billing_links(status,client_id);

CREATE UNIQUE INDEX stripe_billing_active_property ON stripe_billing_links(client_id,property_id) WHERE status NOT IN ('canceled','expired');

CREATE INDEX contractor_payment_plans_scope ON contractor_payment_plans(client_id,property_id,created_at);

CREATE INDEX contractor_payment_plans_status ON contractor_payment_plans(status,mode);

CREATE INDEX rental_recipient_challenge_listing ON rental_listing_recipient_challenges(listing_id,requested_at DESC);

CREATE INDEX rental_scan_jobs_due ON rental_document_scan_jobs(next_attempt_at,completed_at);

CREATE INDEX rental_handoff_retry_due ON rental_application_handoffs(status,next_attempt_at);

CREATE UNIQUE INDEX bridge_report_source_unique ON property_report_bridge_handoffs(source_report_id) WHERE source_report_id IS NOT NULL;

CREATE INDEX bridge_work_order_idx ON property_report_bridge_handoffs(work_order_id,created_at);

CREATE INDEX rent_route_plans_tenancy ON rent_route_plans(tenancy_id,created_at);

CREATE INDEX restricted_form2_case ON restricted_form2_preparations(case_id,created_at);

CREATE UNIQUE INDEX agency_owner_one_active ON agency_owner_grants(agency_client_id,property_id,owner_user_id) WHERE revoked_at IS NULL;

CREATE INDEX agency_owner_user ON agency_owner_grants(owner_user_id,revoked_at);

CREATE INDEX v4_requests_queue ON v4_service_requests(status,created_at);

CREATE INDEX v4_requests_service ON v4_service_requests(service_code,created_at);

CREATE INDEX v4_links_request ON v4_request_links(request_id,purpose,expires_at);

CREATE INDEX v4_events_request ON v4_request_events(request_id,created_at);

CREATE UNIQUE INDEX payment_intent_identity ON payments(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX payment_charge_identity ON payments(stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;

CREATE UNIQUE INDEX one_active_payment_attempt ON payment_checkout_attempts(payment_id) WHERE status IN('creating','open','processing');

CREATE INDEX legal_document_current ON legal_document_versions(document_key,status,effective_at);

CREATE INDEX building_assignment_user ON building_manager_assignments(user_id,status,ends_at);

CREATE INDEX building_item_state ON building_operational_items(building_id,status,updated_at);

CREATE INDEX sale_variants_service_status ON service_sale_variants(service_id,status,starts_at,expires_at);

CREATE INDEX release_approval_lookup ON feature_release_approvals(feature,environment,source_sha,status,expires_at);

CREATE INDEX agency_invitations_queue ON agency_owner_invitations(agency_client_id,status,expires_at);

CREATE INDEX pcr_offer_guest_lookup ON guest_service_orders(offer_code,purchaser_email_hash);

CREATE INDEX pcr_routine_discount_lookup ON pcr_routine_discount_entitlements(purchaser_email_hash,uses_remaining);

CREATE INDEX pcr_reservation_entitlement ON pcr_discount_reservations(entitlement_id,status);

CREATE INDEX residential_paid_properties_client ON residential_paid_property_enrollments(client_id);

CREATE INDEX stripe_subscription_invoice_subscription ON stripe_subscription_invoice_observations(
 stripe_subscription_id,stripe_customer_id,invoice_created DESC
);

CREATE INDEX stripe_subscription_risk_subscription ON stripe_subscription_risk_holds(stripe_subscription_id,status);

CREATE INDEX stripe_subscription_risk_charge ON stripe_subscription_risk_holds(charge_id,reason,status);

CREATE INDEX rental_reference_checks_application ON rental_application_reference_checks(application_id,applicant_id,created_at DESC);

CREATE INDEX commercial_revision_history ON commercial_lease_revisions(lease_id,base_version DESC);

CREATE UNIQUE INDEX commercial_revision_one_approved_base ON commercial_lease_revisions(lease_id,base_version) WHERE status='approved';

CREATE INDEX commercial_rules_history ON commercial_charge_rules(lease_id,created_at);

CREATE INDEX commercial_charge_history ON commercial_lease_charges(lease_id,created_at);

CREATE INDEX commercial_obligation_history ON commercial_obligation_reviews(lease_id,task_id,created_at);

CREATE INDEX commercial_exception_queue ON commercial_lease_exceptions(lease_id,status);

CREATE UNIQUE INDEX billing_invoice_one_active_contact ON billing_invoice_contacts(client_id)
 WHERE status IN('pending','approved');

CREATE INDEX rental_handover_tenancy_status ON rental_tenancy_handovers(tenancy_id,status);

CREATE INDEX account_subscription_intent_state ON account_subscription_preferences(subscription_intent,account_state);

CREATE INDEX client_service_interests_area ON client_service_interests(service_area, client_id);

CREATE UNIQUE INDEX commercial_one_approved_flow ON commercial_application_flows(listing_id) WHERE status='approved';

CREATE UNIQUE INDEX commercial_one_lead ON commercial_application_people(application_id) WHERE lead=1;

CREATE UNIQUE INDEX commercial_evidence_duplicate ON commercial_application_evidence(application_id,person_id,sha256);

CREATE UNIQUE INDEX commercial_evidence_period ON commercial_application_evidence(application_id,entity_id,category,period_label) WHERE category IN('financial_year','bas_quarter');

CREATE UNIQUE INDEX rental_temporary_duplicate_active ON rental_temporary_documents(applicant_id,sha256) WHERE state!='purged';

CREATE INDEX rental_temporary_due ON rental_temporary_documents(state,delete_after);

CREATE INDEX rental_temporary_parent ON rental_temporary_documents(application_id,applicant_id);

CREATE INDEX rental_temporary_package_parent ON rental_temporary_packages(application_id);

CREATE INDEX account_experience_tags_tag ON account_experience_tags(tag,client_id);

CREATE INDEX co_living_spaces_property ON co_living_spaces(property_id,space_type,active);

CREATE INDEX co_living_occupancy_space ON co_living_occupancies(space_id,tenancy_id);

CREATE INDEX requests_co_living_space ON requests(co_living_space_id,status);

CREATE INDEX commercial_occupancy_property ON commercial_occupancies(property_id,client_id,status);

CREATE INDEX commercial_occupant_invites_scope ON commercial_occupant_invitations(occupancy_id,expires_at);

CREATE INDEX commercial_occupant_member_lookup ON commercial_occupant_memberships(user_id,occupancy_id);

CREATE INDEX commercial_occupant_requests_scope ON commercial_occupant_requests(occupancy_id,created_at);

CREATE INDEX council_appointment_review_scheme ON council_appointment_reviews(scheme_id,status,created_at);

CREATE UNIQUE INDEX portal_council_invite_review ON portal_invitations(council_review_id) WHERE council_review_id IS NOT NULL;

CREATE INDEX registered_booking_payment_by_payment ON registered_booking_payment_links(payment_id);

CREATE INDEX co_living_occupancy_events_tenancy ON co_living_occupancy_events(tenancy_id,effective_at);

CREATE INDEX co_living_inspections_property ON co_living_area_inspections(property_id,inspected_at);

CREATE INDEX strata_amenity_requests_slot ON strata_amenity_requests(amenity_id,starts_at,ends_at,status);

CREATE INDEX report_annotations_report ON report_photo_annotations(report_id,review_status);

CREATE INDEX invoice_credit_proposals_invoice ON invoice_credit_proposals(stripe_invoice_id,status);

CREATE INDEX bank_observations_payment ON bank_reconciliation_observations(payment_id,status);

INSERT INTO users (id,email,display_name,active,created_at,verified_at) VALUES
  ('usr_guest_booking_system','guest-bookings@proinspect.invalid','Guest booking system',0,pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL);

INSERT INTO clients (id,name,client_type,status,billing_email,created_at) VALUES
  ('cli_guest_transactions','One-off service transactions (internal)','other','inactive',NULL,pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT INTO v2_markets (code,name,reference_unit,enabled) VALUES
  ('RES','Residential','dwelling',0),
  ('COM','Commercial','premises',0),
  ('STR','Strata & Buildings','scheme',0),
  ('CTS','Community Titles','community scheme',0),
  ('STA','Short-Stay Accommodation','dwelling',0),
  ('SOC','Social & Community Housing','dwelling',0),
  ('SDA','Specialist Disability Accommodation','dwelling',0),
  ('RET','Retirement & Lifestyle Villages','village',0),
  ('AGE','Residential Aged Care','facility',0),
  ('RUR','Rural & Agricultural','site',0),
  ('INS','Institutional & Public Facilities','facility',0);

INSERT INTO v2_services (code,name,family,summary,delivery_gate,legacy_service_id,approval_reference,version,status,approved_by,approved_at,created_at) VALUES
  ('V2-001','Routine Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','routine-inspection',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-002','Property Condition Report (PCR)','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','property-condition-report',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-003','Pre-Vacate Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','pre-vacate-inspection',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-004','Final / Exit Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','final-exit-inspection',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-005','Commercial Property Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','commercial-property-inspection',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-006','Commercial Pre-Vacate / Make-Good Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','commercial-pre-vacate-make-good-inspection',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-007','Commercial Final / Make-Good Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','commercial-final-make-good-inspection',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-008','Common Property Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','common-property-inspection',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-009','Building Management Attendance','attendance','Draft attendance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','building-management-attendance',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-010','Maintenance Attendance','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','maintenance-attendance',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-011','Completed Works Inspection','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','completed-works-inspection',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-012','Follow-Up / Reinspection','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','follow-up-reinspection',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-013','Damage / Incident Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','damage-incident-inspection',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-014','Cleaning & Presentation Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','cleaning-presentation-inspection',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-015','Defect / Rectification Inspection','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','defect-rectification-inspection',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-016','Property Meeting','attendance','Draft attendance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','property-meeting',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-017','Contractor Access Attendance','access','Draft access service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','contractor-access-attendance',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-018','Key / Fob / Remote Handover','access','Draft access service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','key-handover-collection',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-019','Contractor Supervision Attendance','access','Draft access service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','contractor-supervision-attendance',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-020','Move-In / Move-Out Attendance','access','Draft access service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','move-in-move-out-attendance',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-021','Urgent Building Attendance','attendance','Draft attendance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','urgent-building-attendance',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-022','Building Handover Attendance','attendance','Draft attendance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','building-handover-attendance',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-023','Custom Property Attendance','attendance','Draft attendance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only','other-custom-appointment',NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-024','Facilities Condition Survey','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-025','SDA Accessibility Condition Observation','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-026','Village Common Amenities Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-027','Rural Infrastructure Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-028','Short-Stay Turnover Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-029','Community Housing Portfolio Inspection','inspections','Draft inspections service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-030','Maintenance Request Triage','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-031','Contractor Quotation Coordination','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-032','Contractor Quote Comparison Support','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-033','Planned Maintenance Coordination','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-034','Warranty and Defect Follow-Up','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-035','Contractor Completion Evidence Review','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-036','Emergency Works Coordination (Availability Dependent)','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-037','Maintenance Record Register','maintenance','Draft maintenance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-038','Asset Register Setup','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-039','Plant and Equipment Service Schedule','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-040','Contractor Service Calendar','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-041','Operational Safety Walkthrough','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-042','Keys and Access Register Review','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-043','Grounds and External Area Review','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-044','Capital Expenditure Planning Support','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-045','Asset Condition Trend Review','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-046','Multi-Site Facilities Audit','facilities','Draft facilities service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-047','Compliance Obligations Register Setup','compliance','Draft compliance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-048','Compliance Calendar Management','compliance','Draft compliance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-049','Certificate and Evidence Follow-Up','compliance','Draft compliance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-050','Qualified Service Provider Coordination','compliance','Draft compliance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-051','Inspection Evidence Register Reconciliation','compliance','Draft compliance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-052','Fire System Service Coordination','compliance','Draft compliance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-053','Essential Services Evidence Tracking','compliance','Draft compliance service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-054','Tenancy Administrative Support','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-055','Owner Correspondence Support','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-056','Scheme and Resident Notice Coordination','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-057','Building Move Coordination','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-058','Stakeholder Liaison','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-059','Operational Handover Pack','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-060','Property Records Administration','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-061','Asset Incident Log','administration','Draft administration service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-062','Contractor Invoice Verification Support','financial','Draft financial service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-063','Maintenance Expenditure Budget Tracking','financial','Draft financial service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-064','Maintenance Cost Summary','financial','Draft financial service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-065','Contract Variation Administration','financial','Draft financial service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','operations_only',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-066','Asset Condition Advisory Brief','advisory','Draft advisory service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-067','Asset Lifecycle Forecast Support','advisory','Draft advisory service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-068','Contractor Performance Summary','advisory','Draft advisory service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('V2-069','Portfolio Operations Reporting','advisory','Draft advisory service. Scope, exclusions, delivery qualifications and market availability require business approval before sale.','qualified_review',NULL,NULL,1,'draft',NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'));

INSERT INTO v2_market_service_rules (market_code,service_code,status,notes,verified_by,verified_at) VALUES
  ('RES','V2-001','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-001','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-001','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-001','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-001','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-002','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-002','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-002','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-002','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-002','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-003','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-003','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-003','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-003','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-003','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-004','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-004','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-004','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-004','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-004','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-005','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-005','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-005','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-005','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-006','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-006','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-006','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-006','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-007','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-007','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-007','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-007','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-008','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-008','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-008','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-008','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-008','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-008','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-009','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-009','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-009','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-009','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-009','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-009','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-010','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-010','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-010','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-010','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-010','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-010','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-010','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-010','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-010','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-010','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-010','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-011','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-011','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-011','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-011','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-011','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-011','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-011','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-011','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-011','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-011','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-011','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-012','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-012','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-012','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-012','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-012','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-012','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-012','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-012','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-012','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-012','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-012','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-013','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-013','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-013','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-013','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-013','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-013','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-013','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-013','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-013','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-013','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-013','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-014','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-014','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-014','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-014','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-014','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-014','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-014','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-014','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-014','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-014','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-014','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-015','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-015','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-015','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-015','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-015','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-015','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-015','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-015','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-015','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-015','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-015','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-016','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-016','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-016','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-016','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-016','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-016','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-016','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-016','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-016','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-016','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-016','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-017','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-017','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-017','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-017','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-017','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-017','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-017','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-017','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-017','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-017','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-017','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-018','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-018','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-018','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-018','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-018','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-018','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-018','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-018','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-018','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-018','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-018','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-019','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-019','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-019','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-019','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-019','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-019','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-019','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-019','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-019','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-019','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-019','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-020','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-020','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-020','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-020','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-020','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-020','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-020','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-020','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-020','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-020','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-020','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-021','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-021','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-021','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-021','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-021','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-021','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-022','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-022','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-022','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-022','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-022','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-022','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-023','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-023','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-023','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-023','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-023','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-023','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-023','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-023','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-023','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-023','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-023','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-024','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-024','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-024','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-024','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-024','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-024','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-025','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-025','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-025','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-025','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-026','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-026','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-026','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-026','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-027','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-027','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-027','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-028','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-028','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-028','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-028','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-028','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-029','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-029','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-029','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-029','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-029','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-030','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-030','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-030','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-030','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-030','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-030','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-030','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-030','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-030','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-030','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-030','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-031','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-031','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-031','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-031','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-031','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-031','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-031','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-031','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-031','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-031','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-031','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-032','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-032','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-032','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-032','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-032','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-032','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-032','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-032','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-032','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-032','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-032','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-033','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-033','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-033','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-033','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-033','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-033','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-033','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-033','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-033','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-033','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-033','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-034','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-034','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-034','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-034','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-034','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-034','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-034','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-034','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-034','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-034','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-034','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-035','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-035','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-035','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-035','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-035','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-035','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-035','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-035','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-035','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-035','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-035','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-036','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-036','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-036','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-036','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-036','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-036','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-036','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-036','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-036','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-036','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-036','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-037','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-037','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-037','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-037','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-037','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-037','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-037','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-037','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-037','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-037','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-037','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-038','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-038','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-038','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-038','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-038','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-038','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-038','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-038','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-038','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-038','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-038','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-039','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-039','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-039','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-039','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-039','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-039','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-040','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-040','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-040','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-040','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-040','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-040','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-040','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-040','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-040','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-040','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-040','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-041','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-041','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-041','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-041','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-041','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-041','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-041','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-041','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-041','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-041','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-041','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-042','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-042','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-042','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-042','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-042','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-042','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-042','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-042','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-042','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-042','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-042','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-043','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-043','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-043','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-043','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-043','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-043','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-043','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-043','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-043','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-043','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-043','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-044','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-044','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-044','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-044','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-044','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-044','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-045','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-045','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-045','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-045','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-045','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-045','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-045','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-045','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-045','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-045','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-045','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-046','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-046','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-046','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-046','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-046','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-046','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-046','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-046','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-046','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-046','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-046','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-047','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-047','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-047','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-047','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-047','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-047','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-047','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-047','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-047','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-047','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-047','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-048','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-048','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-048','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-048','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-048','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-048','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-048','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-048','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-048','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-048','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-048','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-049','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-049','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-049','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-049','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-049','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-049','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-049','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-049','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-049','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-049','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-049','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-050','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-050','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-050','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-050','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-050','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-050','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-050','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-050','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-050','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-050','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-050','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-051','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-051','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-051','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-051','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-051','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-051','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-051','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-051','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-051','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-051','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-051','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-052','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-052','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-052','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-052','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-052','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-052','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-053','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-053','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-053','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-053','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-053','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-053','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-054','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-054','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-054','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-054','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-054','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-055','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-055','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-055','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-055','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-055','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-056','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-056','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-056','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-056','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-056','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-056','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-057','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-057','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-057','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-057','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-057','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-057','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-058','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-058','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-058','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-058','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-058','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-058','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-058','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-058','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-058','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-058','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-058','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-059','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-059','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-059','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-059','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-059','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-059','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-059','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-059','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-059','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-059','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-059','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-060','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-060','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-060','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-060','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-060','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-060','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-060','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-060','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-060','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-060','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-060','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-061','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-061','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-061','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-061','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-061','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-061','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-061','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-061','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-061','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-061','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-061','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-062','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-062','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-062','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-062','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-062','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-062','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-062','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-062','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-062','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-062','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-062','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-063','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-063','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-063','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-063','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-063','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-063','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-063','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-063','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-063','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-063','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-063','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-064','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-064','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-064','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-064','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-064','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-064','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-064','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-064','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-064','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-064','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-064','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-065','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-065','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-065','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-065','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-065','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-065','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-065','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-065','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-065','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-065','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-065','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-066','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-066','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-066','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-066','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-066','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-066','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-066','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-066','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-066','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-066','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-066','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-067','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-067','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-067','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-067','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-067','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-067','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-067','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-067','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-067','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-067','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-067','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-068','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-068','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-068','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-068','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-068','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-068','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-068','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-068','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-068','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-068','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-068','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RES','V2-069','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('COM','V2-069','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STR','V2-069','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('CTS','V2-069','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('STA','V2-069','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SOC','V2-069','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('SDA','V2-069','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RET','V2-069','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('AGE','V2-069','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('RUR','V2-069','proposed','Preliminary applicability - not approved for sale',NULL,NULL),
  ('INS','V2-069','proposed','Preliminary applicability - not approved for sale',NULL,NULL);

INSERT INTO v2_plan_versions (id,market_code,plan_code,version,status,reference_unit,included_hours_milli,included_visits,included_tickets,included_reports,monthly_fee_cents,approved_by,approved_at,created_at) VALUES
  ('RES:inspection:v1','RES','inspection',1,'draft','dwelling',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('RES:standard:v1','RES','standard',1,'draft','dwelling',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('RES:outsourced:v1','RES','outsourced',1,'draft','dwelling',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('COM:inspection:v1','COM','inspection',1,'draft','premises',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('COM:standard:v1','COM','standard',1,'draft','premises',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('COM:outsourced:v1','COM','outsourced',1,'draft','premises',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('STR:inspection:v1','STR','inspection',1,'draft','scheme',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('STR:standard:v1','STR','standard',1,'draft','scheme',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('STR:outsourced:v1','STR','outsourced',1,'draft','scheme',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('CTS:inspection:v1','CTS','inspection',1,'draft','community scheme',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('CTS:standard:v1','CTS','standard',1,'draft','community scheme',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('CTS:outsourced:v1','CTS','outsourced',1,'draft','community scheme',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('STA:inspection:v1','STA','inspection',1,'draft','dwelling',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('STA:standard:v1','STA','standard',1,'draft','dwelling',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('STA:outsourced:v1','STA','outsourced',1,'draft','dwelling',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('SOC:inspection:v1','SOC','inspection',1,'draft','dwelling',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('SOC:standard:v1','SOC','standard',1,'draft','dwelling',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('SOC:outsourced:v1','SOC','outsourced',1,'draft','dwelling',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('SDA:inspection:v1','SDA','inspection',1,'draft','dwelling',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('SDA:standard:v1','SDA','standard',1,'draft','dwelling',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('SDA:outsourced:v1','SDA','outsourced',1,'draft','dwelling',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('RET:inspection:v1','RET','inspection',1,'draft','village',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('RET:standard:v1','RET','standard',1,'draft','village',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('RET:outsourced:v1','RET','outsourced',1,'draft','village',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('AGE:inspection:v1','AGE','inspection',1,'draft','facility',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('AGE:standard:v1','AGE','standard',1,'draft','facility',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('AGE:outsourced:v1','AGE','outsourced',1,'draft','facility',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('RUR:inspection:v1','RUR','inspection',1,'draft','site',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('RUR:standard:v1','RUR','standard',1,'draft','site',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('RUR:outsourced:v1','RUR','outsourced',1,'draft','site',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('INS:inspection:v1','INS','inspection',1,'draft','facility',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('INS:standard:v1','INS','standard',1,'draft','facility',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('INS:outsourced:v1','INS','outsourced',1,'draft','facility',NULL,NULL,NULL,NULL,NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'));

INSERT INTO v2_sector_packs (id,market_code,version,label,status,governance_boundary,approval_reference,approved_by,approved_at,created_at) VALUES
  ('RES:pack:v1','RES',1,'Residential operations v1','draft','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.',NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('COM:pack:v1','COM',1,'Commercial operations v1','draft','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.',NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('STR:pack:v1','STR',1,'Strata operations v1','draft','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.',NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('CTS:pack:v1','CTS',1,'Community Titles operations v1','draft','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.',NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('STA:pack:v1','STA',1,'Short Stay operations v1','draft','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.',NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('SOC:pack:v1','SOC',1,'Social Housing operations v1','draft','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.',NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('SDA:pack:v1','SDA',1,'Specialist Disability Accommodation operations v1','draft','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.',NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('RET:pack:v1','RET',1,'Retirement Villages operations v1','draft','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.',NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('AGE:pack:v1','AGE',1,'Aged Care operations v1','draft','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.',NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('RUR:pack:v1','RUR',1,'Rural Agriculture operations v1','draft','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.',NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  ('INS:pack:v1','INS',1,'Institutional and Public operations v1','draft','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.',NULL,NULL,NULL,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'));

INSERT INTO v2_sector_modules (code,pack_id,name,classification,purpose,required_fields_json,status,review_reference,reviewed_by,reviewed_at) VALUES
  ('RES-M01','RES:pack:v1','Property inspection protocols','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('RES-M02','RES:pack:v1','Tenancy turnover coordination','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('RES-M03','RES:pack:v1','Owner authority and approvals','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('RES-M04','RES:pack:v1','Resident access and notice liaison','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('RES-M05','RES:pack:v1','Dwelling asset condition history','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('COM-M01','COM:pack:v1','Lease make-good condition survey','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('COM-M02','COM:pack:v1','Site and after-hours access','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('COM-M03','COM:pack:v1','Plant service scheduling','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('COM-M04','COM:pack:v1','Fitout and alteration registers','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('COM-M05','COM:pack:v1','Facilities contractor reporting','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('STR-M01','STR:pack:v1','Common property condition registers','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('STR-M02','STR:pack:v1','Building notice coordination','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('STR-M03','STR:pack:v1','Lot and common access coordination','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('STR-M04','STR:pack:v1','Shared plant servicing','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('STR-M05','STR:pack:v1','Strata authority and council liaison','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('CTS-M01','CTS:pack:v1','Community shared asset register','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('CTS-M02','CTS:pack:v1','Shared service request coordination','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('CTS-M03','CTS:pack:v1','Member notice distribution liaison','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('CTS-M04','CTS:pack:v1','Community facilities scheduling','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('CTS-M05','CTS:pack:v1','Community governance approvals liaison','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('STA-M01','STA:pack:v1','Property turnaround scheduling','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('STA-M02','STA:pack:v1','Guest access contractor coordination','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('STA-M03','STA:pack:v1','Presentation quality observations','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('STA-M04','STA:pack:v1','Rapid repair triage','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('STA-M05','STA:pack:v1','Furniture and amenity condition','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('SOC-M01','SOC:pack:v1','Supported housing asset maintenance','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('SOC-M02','SOC:pack:v1','Sensitive access protocols','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('SOC-M03','SOC:pack:v1','Housing provider approvals','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('SOC-M04','SOC:pack:v1','Housing condition inspection','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('SOC-M05','SOC:pack:v1','Case escalation handoff boundary','reserved_external','Reserved activity. ProInspect must not represent itself as licensed/appointed provider or store clinical records.','["authorityReference","qualifiedProviderReference","operationalScope"]','draft',NULL,NULL,NULL),
  ('SDA-M01','SDA:pack:v1','Accessible facilities asset register','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('SDA-M02','SDA:pack:v1','Accessibility modification coordination','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('SDA-M03','SDA:pack:v1','SDA provider liaison','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('SDA-M04','SDA:pack:v1','Essential equipment servicing','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('SDA-M05','SDA:pack:v1','NDIS and clinical determinations','reserved_external','Reserved activity. ProInspect must not represent itself as licensed/appointed provider or store clinical records.','["authorityReference","qualifiedProviderReference","operationalScope"]','draft',NULL,NULL,NULL),
  ('RET-M01','RET:pack:v1','Village common amenity inspection','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('RET-M02','RET:pack:v1','Resident works scheduling','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('RET-M03','RET:pack:v1','Shared facilities maintenance','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('RET-M04','RET:pack:v1','Village capital asset lifecycle','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('RET-M05','RET:pack:v1','Retirement village statutory governance','reserved_external','Reserved activity. ProInspect must not represent itself as licensed/appointed provider or store clinical records.','["authorityReference","qualifiedProviderReference","operationalScope"]','draft',NULL,NULL,NULL),
  ('AGE-M01','AGE:pack:v1','Facility plant and essential services','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('AGE-M02','AGE:pack:v1','Contractor site entry protocols','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('AGE-M03','AGE:pack:v1','Room access and infection controls liaison','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('AGE-M04','AGE:pack:v1','Aged care facility asset register','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('AGE-M05','AGE:pack:v1','Clinical and care compliance decisions','reserved_external','Reserved activity. ProInspect must not represent itself as licensed/appointed provider or store clinical records.','["authorityReference","qualifiedProviderReference","operationalScope"]','draft',NULL,NULL,NULL),
  ('RUR-M01','RUR:pack:v1','Water and irrigation asset checks','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('RUR-M02','RUR:pack:v1','Fencing gate and tracks condition','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('RUR-M03','RUR:pack:v1','Firebreak maintenance coordination','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('RUR-M04','RUR:pack:v1','Remote workforce access scheduling','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('RUR-M05','RUR:pack:v1','Rural structures defect management','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('INS-M01','INS:pack:v1','Public facilities planned maintenance','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('INS-M02','INS:pack:v1','Asset condition portfolio register','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('INS-M03','INS:pack:v1','Procurement authority support','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('INS-M04','INS:pack:v1','Restricted site access coordination','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL),
  ('INS-M05','INS:pack:v1','Public incident response handoff','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]','draft',NULL,NULL,NULL);

INSERT INTO v2_sector_release_checks (pack_id,check_code,status,evidence_reference,verified_by,verified_at) VALUES
  ('RES:pack:v1','governance','pending',NULL,NULL,NULL),
  ('RES:pack:v1','service_scope','pending',NULL,NULL,NULL),
  ('RES:pack:v1','pricing','pending',NULL,NULL,NULL),
  ('RES:pack:v1','insurance','pending',NULL,NULL,NULL),
  ('RES:pack:v1','credentials','pending',NULL,NULL,NULL),
  ('RES:pack:v1','privacy','pending',NULL,NULL,NULL),
  ('RES:pack:v1','workflow_acceptance','pending',NULL,NULL,NULL),
  ('COM:pack:v1','governance','pending',NULL,NULL,NULL),
  ('COM:pack:v1','service_scope','pending',NULL,NULL,NULL),
  ('COM:pack:v1','pricing','pending',NULL,NULL,NULL),
  ('COM:pack:v1','insurance','pending',NULL,NULL,NULL),
  ('COM:pack:v1','credentials','pending',NULL,NULL,NULL),
  ('COM:pack:v1','privacy','pending',NULL,NULL,NULL),
  ('COM:pack:v1','workflow_acceptance','pending',NULL,NULL,NULL),
  ('STR:pack:v1','governance','pending',NULL,NULL,NULL),
  ('STR:pack:v1','service_scope','pending',NULL,NULL,NULL),
  ('STR:pack:v1','pricing','pending',NULL,NULL,NULL),
  ('STR:pack:v1','insurance','pending',NULL,NULL,NULL),
  ('STR:pack:v1','credentials','pending',NULL,NULL,NULL),
  ('STR:pack:v1','privacy','pending',NULL,NULL,NULL),
  ('STR:pack:v1','workflow_acceptance','pending',NULL,NULL,NULL),
  ('CTS:pack:v1','governance','pending',NULL,NULL,NULL),
  ('CTS:pack:v1','service_scope','pending',NULL,NULL,NULL),
  ('CTS:pack:v1','pricing','pending',NULL,NULL,NULL),
  ('CTS:pack:v1','insurance','pending',NULL,NULL,NULL),
  ('CTS:pack:v1','credentials','pending',NULL,NULL,NULL),
  ('CTS:pack:v1','privacy','pending',NULL,NULL,NULL),
  ('CTS:pack:v1','workflow_acceptance','pending',NULL,NULL,NULL),
  ('STA:pack:v1','governance','pending',NULL,NULL,NULL),
  ('STA:pack:v1','service_scope','pending',NULL,NULL,NULL),
  ('STA:pack:v1','pricing','pending',NULL,NULL,NULL),
  ('STA:pack:v1','insurance','pending',NULL,NULL,NULL),
  ('STA:pack:v1','credentials','pending',NULL,NULL,NULL),
  ('STA:pack:v1','privacy','pending',NULL,NULL,NULL),
  ('STA:pack:v1','workflow_acceptance','pending',NULL,NULL,NULL),
  ('SOC:pack:v1','governance','pending',NULL,NULL,NULL),
  ('SOC:pack:v1','service_scope','pending',NULL,NULL,NULL),
  ('SOC:pack:v1','pricing','pending',NULL,NULL,NULL),
  ('SOC:pack:v1','insurance','pending',NULL,NULL,NULL),
  ('SOC:pack:v1','credentials','pending',NULL,NULL,NULL),
  ('SOC:pack:v1','privacy','pending',NULL,NULL,NULL),
  ('SOC:pack:v1','workflow_acceptance','pending',NULL,NULL,NULL),
  ('SDA:pack:v1','governance','pending',NULL,NULL,NULL),
  ('SDA:pack:v1','service_scope','pending',NULL,NULL,NULL),
  ('SDA:pack:v1','pricing','pending',NULL,NULL,NULL),
  ('SDA:pack:v1','insurance','pending',NULL,NULL,NULL),
  ('SDA:pack:v1','credentials','pending',NULL,NULL,NULL),
  ('SDA:pack:v1','privacy','pending',NULL,NULL,NULL),
  ('SDA:pack:v1','workflow_acceptance','pending',NULL,NULL,NULL),
  ('RET:pack:v1','governance','pending',NULL,NULL,NULL),
  ('RET:pack:v1','service_scope','pending',NULL,NULL,NULL),
  ('RET:pack:v1','pricing','pending',NULL,NULL,NULL),
  ('RET:pack:v1','insurance','pending',NULL,NULL,NULL),
  ('RET:pack:v1','credentials','pending',NULL,NULL,NULL),
  ('RET:pack:v1','privacy','pending',NULL,NULL,NULL),
  ('RET:pack:v1','workflow_acceptance','pending',NULL,NULL,NULL),
  ('AGE:pack:v1','governance','pending',NULL,NULL,NULL),
  ('AGE:pack:v1','service_scope','pending',NULL,NULL,NULL),
  ('AGE:pack:v1','pricing','pending',NULL,NULL,NULL),
  ('AGE:pack:v1','insurance','pending',NULL,NULL,NULL),
  ('AGE:pack:v1','credentials','pending',NULL,NULL,NULL),
  ('AGE:pack:v1','privacy','pending',NULL,NULL,NULL),
  ('AGE:pack:v1','workflow_acceptance','pending',NULL,NULL,NULL),
  ('RUR:pack:v1','governance','pending',NULL,NULL,NULL),
  ('RUR:pack:v1','service_scope','pending',NULL,NULL,NULL),
  ('RUR:pack:v1','pricing','pending',NULL,NULL,NULL),
  ('RUR:pack:v1','insurance','pending',NULL,NULL,NULL),
  ('RUR:pack:v1','credentials','pending',NULL,NULL,NULL),
  ('RUR:pack:v1','privacy','pending',NULL,NULL,NULL),
  ('RUR:pack:v1','workflow_acceptance','pending',NULL,NULL,NULL),
  ('INS:pack:v1','governance','pending',NULL,NULL,NULL),
  ('INS:pack:v1','service_scope','pending',NULL,NULL,NULL),
  ('INS:pack:v1','pricing','pending',NULL,NULL,NULL),
  ('INS:pack:v1','insurance','pending',NULL,NULL,NULL),
  ('INS:pack:v1','credentials','pending',NULL,NULL,NULL),
  ('INS:pack:v1','privacy','pending',NULL,NULL,NULL),
  ('INS:pack:v1','workflow_acceptance','pending',NULL,NULL,NULL);

ALTER TABLE sessions ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE staff_profiles ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE client_memberships ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE client_memberships ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE client_property_links ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE client_property_links ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE property_management_relationships ADD FOREIGN KEY (manager_client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE property_management_relationships ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE portfolio_assignments ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE portfolio_assignments ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE portfolio_assignments ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE tenancies ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE tenancy_memberships ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE tenancy_memberships ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE invitations ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE invitations ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE invitations ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE scheme_client_links ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE scheme_client_links ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE scheme_buildings ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE scheme_buildings ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE strata_lots ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE strata_lots ADD FOREIGN KEY (building_id) REFERENCES scheme_buildings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE strata_lots ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE common_property_areas ADD FOREIGN KEY (building_id) REFERENCES scheme_buildings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE common_property_areas ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE scheme_memberships ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE scheme_memberships ADD FOREIGN KEY (lot_id) REFERENCES strata_lots (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE scheme_memberships ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE scheme_memberships ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE scheme_authority_profiles ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE scheme_authority_profiles ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_notices ADD FOREIGN KEY (lot_id) REFERENCES strata_lots (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_notices ADD FOREIGN KEY (building_id) REFERENCES scheme_buildings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_notices ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_notices ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_notices ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE schedule_blocks ADD FOREIGN KEY (resource_id) REFERENCES schedule_resources (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bookings ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bookings ADD FOREIGN KEY (resource_id) REFERENCES schedule_resources (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bookings ADD FOREIGN KEY (service_id) REFERENCES services (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bookings ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bookings ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bookings ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE booking_access_secrets ADD FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE requests ADD FOREIGN KEY (co_living_space_id) REFERENCES co_living_spaces (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE requests ADD FOREIGN KEY (lot_id) REFERENCES strata_lots (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE requests ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE requests ADD FOREIGN KEY (area_id) REFERENCES common_property_areas (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE requests ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE requests ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE requests ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE requests ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE work_orders ADD FOREIGN KEY (contractor_id) REFERENCES contractors (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE work_orders ADD FOREIGN KEY (assigned_staff_id) REFERENCES staff_profiles (user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE work_orders ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE work_orders ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE work_orders ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE work_orders ADD FOREIGN KEY (request_id) REFERENCES requests (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE work_orders ADD FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE approvals ADD FOREIGN KEY (target_user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE approvals ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE approvals ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE approvals ADD FOREIGN KEY (decision_user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE approvals ADD FOREIGN KEY (requested_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE approvals ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE payments ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE payments ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE payments ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE subscriptions ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE subscriptions ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE documents ADD FOREIGN KEY (uploaded_client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE documents ADD FOREIGN KEY (previous_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE documents ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE documents ADD FOREIGN KEY (request_id) REFERENCES requests (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE documents ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE documents ADD FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE documents ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE documents ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE documents ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE document_grants ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE document_grants ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE document_requests ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE document_requests ADD FOREIGN KEY (requested_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE document_requests ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE document_requests ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE statutory_forms ADD FOREIGN KEY (issued_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE statutory_forms ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE statutory_forms ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE restricted_form_cases ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE restricted_form_cases ADD FOREIGN KEY (applicant_user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE restricted_case_grants ADD FOREIGN KEY (granted_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE restricted_case_grants ADD FOREIGN KEY (staff_user_id) REFERENCES staff_profiles (user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE restricted_case_grants ADD FOREIGN KEY (case_id) REFERENCES restricted_form_cases (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE restricted_evidence ADD FOREIGN KEY (case_id) REFERENCES restricted_form_cases (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE restricted_audit ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE restricted_audit ADD FOREIGN KEY (case_id) REFERENCES restricted_form_cases (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE notifications ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE communications ADD FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE communications ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE communications ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE audit_events ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE audit_events ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE audit_events ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE tenant_inspections ADD FOREIGN KEY (published_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE tenant_inspections ADD FOREIGN KEY (notice_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE tenant_inspections ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE tenant_inspections ADD FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE client_entitlements ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE client_entitlements ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE organisation_applications ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE organisation_applications ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE organisation_applications ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE portal_invitations ADD FOREIGN KEY (council_review_id) REFERENCES council_appointment_reviews (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE portal_invitations ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE portal_invitations ADD FOREIGN KEY (lot_id) REFERENCES strata_lots (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE portal_invitations ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE portal_invitations ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE portfolio_owners ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE portfolio_owners ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE management_authorities ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE management_authorities ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE portfolio_imports ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE portfolio_imports ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bulk_booking_runs ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bulk_booking_runs ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE recurring_plans ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE recurring_plans ADD FOREIGN KEY (service_id) REFERENCES services (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE recurring_plans ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE recurring_plans ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE plan_occurrences ADD FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE plan_occurrences ADD FOREIGN KEY (plan_id) REFERENCES recurring_plans (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE council_responses ADD FOREIGN KEY (membership_id) REFERENCES scheme_memberships (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE council_responses ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE council_responses ADD FOREIGN KEY (approval_id) REFERENCES approvals (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE request_comments ADD FOREIGN KEY (author_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE request_comments ADD FOREIGN KEY (request_id) REFERENCES requests (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE request_attachments ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE request_attachments ADD FOREIGN KEY (uploaded_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE request_attachments ADD FOREIGN KEY (request_id) REFERENCES requests (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE payment_events ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE payment_events ADD FOREIGN KEY (payment_id) REFERENCES payments (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_handoffs ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_handoffs ADD FOREIGN KEY (requested_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_handoffs ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE statutory_case_events ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE statutory_case_events ADD FOREIGN KEY (form_id) REFERENCES statutory_forms (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE pcr_responses ADD FOREIGN KEY (acknowledged_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE pcr_responses ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE pcr_responses ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE pcr_responses ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE restricted_reviewers ADD FOREIGN KEY (staff_user_id) REFERENCES staff_profiles (user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE action_receipts ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE marketing_enquiries ADD FOREIGN KEY (linked_client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE marketing_enquiries ADD FOREIGN KEY (assigned_user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE marketing_enquiries ADD FOREIGN KEY (service_id) REFERENCES services (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE enquiry_events ADD FOREIGN KEY (outbox_id) REFERENCES outbox_events (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE enquiry_events ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE enquiry_events ADD FOREIGN KEY (enquiry_id) REFERENCES marketing_enquiries (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE notice_dispatch_jobs ADD FOREIGN KEY (notice_id) REFERENCES building_notices (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE notice_deliveries ADD FOREIGN KEY (outbox_id) REFERENCES outbox_events (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE notice_deliveries ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE notice_deliveries ADD FOREIGN KEY (notice_id) REFERENCES building_notices (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE user_preferences ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE booking_calendar_sync ADD FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE guest_service_orders ADD FOREIGN KEY (sale_variant_id) REFERENCES service_sale_variants (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE guest_service_orders ADD FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE guest_service_orders ADD FOREIGN KEY (property_reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE guest_service_orders ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE guest_service_orders ADD FOREIGN KEY (service_id) REFERENCES services (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE guest_access_links ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE guest_access_links ADD FOREIGN KEY (order_id) REFERENCES guest_service_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE guest_reminder_deliveries ADD FOREIGN KEY (outbox_id) REFERENCES outbox_events (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE guest_reminder_deliveries ADD FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE leasing_listings ADD FOREIGN KEY (rental_approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE leasing_listings ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE leasing_listings ADD FOREIGN KEY (owner_client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE leasing_listings ADD FOREIGN KEY (instructed_by_client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE leasing_listings ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE leasing_photos ADD FOREIGN KEY (listing_id) REFERENCES leasing_listings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE leasing_sessions ADD FOREIGN KEY (listing_id) REFERENCES leasing_listings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE leasing_leads ADD FOREIGN KEY (session_id) REFERENCES leasing_sessions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE leasing_leads ADD FOREIGN KEY (listing_id) REFERENCES leasing_listings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE leasing_email_events ADD FOREIGN KEY (lead_id) REFERENCES leasing_leads (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_applications ADD FOREIGN KEY (listing_id) REFERENCES leasing_listings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_applicants ADD FOREIGN KEY (application_id) REFERENCES rental_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_documents ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_documents ADD FOREIGN KEY (applicant_id) REFERENCES rental_applicants (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_documents ADD FOREIGN KEY (application_id) REFERENCES rental_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_events ADD FOREIGN KEY (actor_staff_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_events ADD FOREIGN KEY (actor_applicant_id) REFERENCES rental_applicants (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_events ADD FOREIGN KEY (application_id) REFERENCES rental_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_submissions ADD FOREIGN KEY (submitted_by_applicant_id) REFERENCES rental_applicants (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_submissions ADD FOREIGN KEY (application_id) REFERENCES rental_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_handoffs ADD FOREIGN KEY (submission_id) REFERENCES rental_application_submissions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_handoffs ADD FOREIGN KEY (application_id) REFERENCES rental_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_privacy_requests ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_privacy_requests ADD FOREIGN KEY (applicant_id) REFERENCES rental_applicants (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_privacy_requests ADD FOREIGN KEY (application_id) REFERENCES rental_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_purge_receipts ADD FOREIGN KEY (actor_user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_document_scan_receipts ADD FOREIGN KEY (document_id) REFERENCES rental_application_documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE leasing_checkins ADD FOREIGN KEY (registered_lead_id) REFERENCES leasing_leads (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE leasing_checkins ADD FOREIGN KEY (session_id) REFERENCES leasing_sessions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE leasing_checkins ADD FOREIGN KEY (listing_id) REFERENCES leasing_listings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE open_home_sheet_events ADD FOREIGN KEY (checkin_id) REFERENCES leasing_checkins (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_templates ADD FOREIGN KEY (release_approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_templates ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_cases ADD FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_cases ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_cases ADD FOREIGN KEY (issued_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_cases ADD FOREIGN KEY (initiator_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_cases ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_cases ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_events ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_events ADD FOREIGN KEY (case_id) REFERENCES wa_residential_form_cases (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_delivery ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_delivery ADD FOREIGN KEY (case_id) REFERENCES wa_residential_form_cases (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_responses ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_responses ADD FOREIGN KEY (case_id) REFERENCES wa_residential_form_cases (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_decisions ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_decisions ADD FOREIGN KEY (case_id) REFERENCES wa_residential_form_cases (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_external_events ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_external_events ADD FOREIGN KEY (case_id) REFERENCES wa_residential_form_cases (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_signatures ADD FOREIGN KEY (signed_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_signatures ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_signatures ADD FOREIGN KEY (case_id) REFERENCES wa_residential_form_cases (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_reminders ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_reminders ADD FOREIGN KEY (case_id) REFERENCES wa_residential_form_cases (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_verifications ADD FOREIGN KEY (verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_residential_form_verifications ADD FOREIGN KEY (case_id) REFERENCES wa_residential_form_cases (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bonds ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bonds ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bonds ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_parties ADD FOREIGN KEY (government_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_parties ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_parties ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_transactions ADD FOREIGN KEY (confirmed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_transactions ADD FOREIGN KEY (confirmation_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_transactions ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_transactions ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_receipts ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_receipts ADD FOREIGN KEY (transaction_id) REFERENCES bond_transactions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_receipts ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_claims ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_claims ADD FOREIGN KEY (evidence_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_claims ADD FOREIGN KEY (transaction_id) REFERENCES bond_transactions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_claims ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_evidence ADD FOREIGN KEY (submitted_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_evidence ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_evidence ADD FOREIGN KEY (transaction_id) REFERENCES bond_transactions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_evidence ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_cases ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_cases ADD FOREIGN KEY (transaction_id) REFERENCES bond_transactions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_cases ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_deadlines ADD FOREIGN KEY (transaction_id) REFERENCES bond_transactions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_deadlines ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_notices ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_notices ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_notices ADD FOREIGN KEY (case_id) REFERENCES bond_cases (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_notices ADD FOREIGN KEY (transaction_id) REFERENCES bond_transactions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_notices ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_events ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_events ADD FOREIGN KEY (transaction_id) REFERENCES bond_transactions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_events ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_alert_dispatches ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_alert_dispatches ADD FOREIGN KEY (deadline_id) REFERENCES bond_deadlines (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_preparations ADD FOREIGN KEY (prepared_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_preparations ADD FOREIGN KEY (transaction_id) REFERENCES bond_transactions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_preparations ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_contributions ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_contributions ADD FOREIGN KEY (receipt_id) REFERENCES bond_receipts (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_contributions ADD FOREIGN KEY (party_id) REFERENCES bond_parties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_contributions ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_allocations ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_allocations ADD FOREIGN KEY (target_bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_allocations ADD FOREIGN KEY (party_id) REFERENCES bond_parties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_allocations ADD FOREIGN KEY (transaction_id) REFERENCES bond_transactions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_allocations ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_external_verifications ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_external_verifications ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_external_verifications ADD FOREIGN KEY (transaction_id) REFERENCES bond_transactions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_external_verifications ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_payout_reconciliations ADD FOREIGN KEY (reconciled_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_payout_reconciliations ADD FOREIGN KEY (government_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_payout_reconciliations ADD FOREIGN KEY (transaction_id) REFERENCES bond_transactions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_payout_reconciliations ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_exception_cases ADD FOREIGN KEY (resolved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_exception_cases ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_exception_cases ADD FOREIGN KEY (transaction_id) REFERENCES bond_transactions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bond_exception_cases ADD FOREIGN KEY (bond_id) REFERENCES bonds (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE open_home_report_settings ADD FOREIGN KEY (configured_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE open_home_report_settings ADD FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE open_home_report_settings ADD FOREIGN KEY (listing_id) REFERENCES leasing_listings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE open_home_inspection_reports ADD FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE open_home_inspection_reports ADD FOREIGN KEY (outbox_id) REFERENCES outbox_events (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE open_home_inspection_reports ADD FOREIGN KEY (listing_id) REFERENCES leasing_listings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE open_home_inspection_reports ADD FOREIGN KEY (session_id) REFERENCES leasing_sessions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_layouts ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_layouts ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_layouts ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE inspection_reports ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE inspection_reports ADD FOREIGN KEY (issued_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE inspection_reports ADD FOREIGN KEY (approved_version_id) REFERENCES report_versions (id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE inspection_reports ADD FOREIGN KEY (reviewer_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE inspection_reports ADD FOREIGN KEY (inspector_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE inspection_reports ADD FOREIGN KEY (baseline_version_id) REFERENCES report_versions (id) ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE inspection_reports ADD FOREIGN KEY (template_id) REFERENCES report_templates (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE inspection_reports ADD FOREIGN KEY (service_id) REFERENCES services (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE inspection_reports ADD FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE inspection_reports ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE inspection_reports ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE inspection_reports ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE inspection_reports ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE inspection_reports ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_drafts ADD FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_drafts ADD FOREIGN KEY (report_id) REFERENCES inspection_reports (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_versions ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_versions ADD FOREIGN KEY (template_id) REFERENCES report_templates (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_versions ADD FOREIGN KEY (report_id) REFERENCES inspection_reports (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_review_events ADD FOREIGN KEY (reviewer_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_review_events ADD FOREIGN KEY (report_version_id) REFERENCES report_versions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_review_events ADD FOREIGN KEY (report_id) REFERENCES inspection_reports (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_evidence ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_evidence ADD FOREIGN KEY (uploaded_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_evidence ADD FOREIGN KEY (report_id) REFERENCES inspection_reports (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_render_manifests ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_render_manifests ADD FOREIGN KEY (report_version_id) REFERENCES report_versions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_responses ADD FOREIGN KEY (resolved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_responses ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_responses ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_responses ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_responses ADD FOREIGN KEY (report_version_id) REFERENCES report_versions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_maintenance_candidates ADD FOREIGN KEY (request_id) REFERENCES requests (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_maintenance_candidates ADD FOREIGN KEY (report_version_id) REFERENCES report_versions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_sync_receipts ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_sync_receipts ADD FOREIGN KEY (report_id) REFERENCES inspection_reports (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_services ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_service_revisions ADD FOREIGN KEY (changed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_service_revisions ADD FOREIGN KEY (service_code) REFERENCES v2_services (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_market_service_rules ADD FOREIGN KEY (verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_market_service_rules ADD FOREIGN KEY (service_code) REFERENCES v2_services (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_market_service_rules ADD FOREIGN KEY (market_code) REFERENCES v2_markets (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_assets ADD FOREIGN KEY (parent_id) REFERENCES v2_assets (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_assets ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_assets ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_markets ADD FOREIGN KEY (verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_markets ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_markets ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_markets ADD FOREIGN KEY (market_code) REFERENCES v2_markets (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_engagements ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_engagements ADD FOREIGN KEY (verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_engagements ADD FOREIGN KEY (market_code) REFERENCES v2_markets (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_engagements ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_engagements ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_engagements ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_plan_versions ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_plan_versions ADD FOREIGN KEY (market_code) REFERENCES v2_markets (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_plan_services ADD FOREIGN KEY (service_code) REFERENCES v2_services (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_plan_services ADD FOREIGN KEY (plan_id) REFERENCES v2_plan_versions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_plan_entitlements ADD FOREIGN KEY (plan_id,service_code) REFERENCES v2_plan_services (plan_id,service_code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_plan_entitlements ADD FOREIGN KEY (service_code) REFERENCES v2_services (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_plan_entitlements ADD FOREIGN KEY (plan_id) REFERENCES v2_plan_versions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_subscription_periods ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_subscription_periods ADD FOREIGN KEY (plan_id) REFERENCES v2_plan_versions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_subscription_periods ADD FOREIGN KEY (engagement_id) REFERENCES v2_engagements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_usage_ledger ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_usage_ledger ADD FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_usage_ledger ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_usage_ledger ADD FOREIGN KEY (service_code) REFERENCES v2_services (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_usage_ledger ADD FOREIGN KEY (subscription_id) REFERENCES v2_subscription_periods (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_rate_cards ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_rate_cards ADD FOREIGN KEY (market_code) REFERENCES v2_markets (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_quote_snapshots ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_quote_snapshots ADD FOREIGN KEY (engagement_id) REFERENCES v2_engagements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_quote_snapshots ADD FOREIGN KEY (rate_card_id) REFERENCES v2_rate_cards (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_quote_snapshots ADD FOREIGN KEY (service_code) REFERENCES v2_services (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_quote_snapshots ADD FOREIGN KEY (market_code) REFERENCES v2_markets (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_quote_snapshots ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_quote_snapshots ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_quote_snapshots ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_maintenance_tasks ADD FOREIGN KEY (completed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_maintenance_tasks ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_maintenance_tasks ADD FOREIGN KEY (asset_id) REFERENCES v2_assets (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_maintenance_tasks ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_contractor_credentials ADD FOREIGN KEY (verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_contractor_credentials ADD FOREIGN KEY (contractor_id) REFERENCES contractors (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_task_credential_requirements ADD FOREIGN KEY (task_id) REFERENCES v2_maintenance_tasks (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_task_assignments ADD FOREIGN KEY (assigned_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_task_assignments ADD FOREIGN KEY (contractor_id) REFERENCES contractors (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_task_assignments ADD FOREIGN KEY (staff_user_id) REFERENCES staff_profiles (user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_task_assignments ADD FOREIGN KEY (task_id) REFERENCES v2_maintenance_tasks (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capacity_resources ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capacity_resources ADD FOREIGN KEY (contractor_id) REFERENCES contractors (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capacity_resources ADD FOREIGN KEY (staff_user_id) REFERENCES staff_profiles (user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_resource_skills ADD FOREIGN KEY (verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_resource_skills ADD FOREIGN KEY (resource_id) REFERENCES v2_capacity_resources (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_roster_windows ADD FOREIGN KEY (resource_id) REFERENCES v2_capacity_resources (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capacity_blocks ADD FOREIGN KEY (recorded_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capacity_blocks ADD FOREIGN KEY (resource_id) REFERENCES v2_capacity_resources (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_resource_allocations ADD FOREIGN KEY (allocated_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_resource_allocations ADD FOREIGN KEY (resource_id) REFERENCES v2_capacity_resources (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_resource_allocations ADD FOREIGN KEY (task_id) REFERENCES v2_maintenance_tasks (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_task_evidence ADD FOREIGN KEY (verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_task_evidence ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_task_evidence ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_task_evidence ADD FOREIGN KEY (task_id) REFERENCES v2_maintenance_tasks (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_staff_cost_rates ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_staff_cost_rates ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_staff_cost_rates ADD FOREIGN KEY (staff_user_id) REFERENCES staff_profiles (user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_task_entitlement_links ADD FOREIGN KEY (linked_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_task_entitlement_links ADD FOREIGN KEY (service_code) REFERENCES v2_services (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_task_entitlement_links ADD FOREIGN KEY (subscription_id) REFERENCES v2_subscription_periods (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_task_entitlement_links ADD FOREIGN KEY (task_id) REFERENCES v2_maintenance_tasks (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_time_entries ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_time_entries ADD FOREIGN KEY (rate_id) REFERENCES v2_staff_cost_rates (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_time_entries ADD FOREIGN KEY (staff_user_id) REFERENCES staff_profiles (user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_time_entries ADD FOREIGN KEY (task_id) REFERENCES v2_maintenance_tasks (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_external_costs ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_external_costs ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_external_costs ADD FOREIGN KEY (contractor_id) REFERENCES contractors (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_external_costs ADD FOREIGN KEY (task_id) REFERENCES v2_maintenance_tasks (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_details ADD FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_details ADD FOREIGN KEY (asset_id) REFERENCES v2_assets (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_conditions ADD FOREIGN KEY (verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_conditions ADD FOREIGN KEY (observed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_conditions ADD FOREIGN KEY (evidence_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_conditions ADD FOREIGN KEY (asset_id) REFERENCES v2_assets (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_warranties ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_warranties ADD FOREIGN KEY (evidence_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_warranties ADD FOREIGN KEY (asset_id) REFERENCES v2_assets (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_preventive_plans ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_preventive_plans ADD FOREIGN KEY (verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_preventive_plans ADD FOREIGN KEY (service_code) REFERENCES v2_services (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_preventive_plans ADD FOREIGN KEY (asset_id) REFERENCES v2_assets (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_preventive_plans ADD FOREIGN KEY (engagement_id) REFERENCES v2_engagements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_preventive_occurrences ADD FOREIGN KEY (recorded_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_preventive_occurrences ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_preventive_occurrences ADD FOREIGN KEY (plan_id) REFERENCES v2_preventive_plans (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_compliance_obligations ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_compliance_obligations ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_compliance_obligations ADD FOREIGN KEY (asset_id) REFERENCES v2_assets (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_compliance_obligations ADD FOREIGN KEY (engagement_id) REFERENCES v2_engagements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_compliance_evidence ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_compliance_evidence ADD FOREIGN KEY (recorded_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_compliance_evidence ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_compliance_evidence ADD FOREIGN KEY (obligation_id) REFERENCES v2_compliance_obligations (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_compliance_actions ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_compliance_actions ADD FOREIGN KEY (closed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_compliance_actions ADD FOREIGN KEY (assignee_id) REFERENCES staff_profiles (user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_compliance_actions ADD FOREIGN KEY (obligation_id) REFERENCES v2_compliance_obligations (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_risks ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_risks ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_risks ADD FOREIGN KEY (owner_staff_id) REFERENCES staff_profiles (user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_asset_risks ADD FOREIGN KEY (asset_id) REFERENCES v2_assets (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_packs ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_packs ADD FOREIGN KEY (market_code) REFERENCES v2_markets (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_modules ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_modules ADD FOREIGN KEY (pack_id) REFERENCES v2_sector_packs (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_release_checks ADD FOREIGN KEY (verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_release_checks ADD FOREIGN KEY (pack_id) REFERENCES v2_sector_packs (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_module_clearances ADD FOREIGN KEY (verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_module_clearances ADD FOREIGN KEY (module_code) REFERENCES v2_sector_modules (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_rollouts ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_rollouts ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_rollouts ADD FOREIGN KEY (engagement_id) REFERENCES v2_engagements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_rollouts ADD FOREIGN KEY (pack_id) REFERENCES v2_sector_packs (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_records ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_records ADD FOREIGN KEY (recorded_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_records ADD FOREIGN KEY (asset_id) REFERENCES v2_assets (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_records ADD FOREIGN KEY (module_code) REFERENCES v2_sector_modules (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_sector_records ADD FOREIGN KEY (rollout_id) REFERENCES v2_sector_rollouts (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_enterprise_portfolios ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_enterprise_portfolios ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_enterprise_portfolio_members ADD FOREIGN KEY (verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_enterprise_portfolio_members ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_enterprise_portfolio_members ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_enterprise_portfolio_members ADD FOREIGN KEY (portfolio_id) REFERENCES v2_enterprise_portfolios (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_programmes ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_programmes ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_programmes ADD FOREIGN KEY (engagement_id) REFERENCES v2_engagements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_projects ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_projects ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_projects ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_projects ADD FOREIGN KEY (asset_id) REFERENCES v2_assets (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_projects ADD FOREIGN KEY (programme_id) REFERENCES v2_capital_programmes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_milestones ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_milestones ADD FOREIGN KEY (completed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_milestones ADD FOREIGN KEY (project_id) REFERENCES v2_capital_projects (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_commitments ADD FOREIGN KEY (proposed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_commitments ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_commitments ADD FOREIGN KEY (contractor_id) REFERENCES contractors (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_commitments ADD FOREIGN KEY (project_id) REFERENCES v2_capital_projects (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_forecasts ADD FOREIGN KEY (recorded_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_capital_forecasts ADD FOREIGN KEY (project_id) REFERENCES v2_capital_projects (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_saved_report_definitions ADD FOREIGN KEY (owner_user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_saved_report_definitions ADD FOREIGN KEY (portfolio_id) REFERENCES v2_enterprise_portfolios (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_saved_report_definitions ADD FOREIGN KEY (market_code) REFERENCES v2_markets (code) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_saved_report_definitions ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_report_snapshots ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_report_snapshots ADD FOREIGN KEY (definition_id) REFERENCES v2_saved_report_definitions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_enterprise_alerts ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_enterprise_alerts ADD FOREIGN KEY (resolved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v2_enterprise_alerts ADD FOREIGN KEY (assigned_staff_id) REFERENCES staff_profiles (user_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE stripe_billing_links ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE stripe_billing_links ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE stripe_billing_events ADD FOREIGN KEY (link_id) REFERENCES stripe_billing_links (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_payment_plans ADD FOREIGN KEY (last_actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_payment_plans ADD FOREIGN KEY (transfer_initiated_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_payment_plans ADD FOREIGN KEY (external_verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_payment_plans ADD FOREIGN KEY (external_reported_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_payment_plans ADD FOREIGN KEY (release_approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_payment_plans ADD FOREIGN KEY (payer_approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_payment_plans ADD FOREIGN KEY (approval_id) REFERENCES approvals (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_payment_plans ADD FOREIGN KEY (contractor_id) REFERENCES contractors (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_payment_plans ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_payment_plans ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_payment_plans ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_connect_recipients ADD FOREIGN KEY (recorded_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_connect_recipients ADD FOREIGN KEY (identity_verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_connect_recipients ADD FOREIGN KEY (contractor_id) REFERENCES contractors (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE contractor_payment_events ADD FOREIGN KEY (plan_id) REFERENCES contractor_payment_plans (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_listing_recipient_challenges ADD FOREIGN KEY (requested_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_listing_recipient_challenges ADD FOREIGN KEY (listing_id) REFERENCES leasing_listings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_listing_approvals ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_listing_approvals ADD FOREIGN KEY (recipient_challenge_id) REFERENCES rental_listing_recipient_challenges (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_listing_approvals ADD FOREIGN KEY (listing_id) REFERENCES leasing_listings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_document_scan_jobs ADD FOREIGN KEY (document_id) REFERENCES rental_application_documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_handoff_receipts ADD FOREIGN KEY (handoff_id) REFERENCES rental_application_handoffs (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_outcomes ADD FOREIGN KEY (recorded_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_outcomes ADD FOREIGN KEY (application_id) REFERENCES rental_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE property_report_bridge_handoffs ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE property_report_bridge_handoffs ADD FOREIGN KEY (staff_user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE property_report_bridge_handoffs ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rent_route_plans ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rent_route_plans ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rent_route_plans ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rent_external_money_records ADD FOREIGN KEY (recorded_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rent_external_money_records ADD FOREIGN KEY (plan_id) REFERENCES rent_route_plans (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rent_external_verifications ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rent_external_verifications ADD FOREIGN KEY (record_id) REFERENCES rent_external_money_records (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE restricted_form2_preparations ADD FOREIGN KEY (prepared_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE restricted_form2_preparations ADD FOREIGN KEY (case_id) REFERENCES restricted_form_cases (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE restricted_form2_reviews ADD FOREIGN KEY (reviewer_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE restricted_form2_reviews ADD FOREIGN KEY (preparation_id) REFERENCES restricted_form2_preparations (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rent_connect_sandbox_accounts ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rent_connect_sandbox_accounts ADD FOREIGN KEY (plan_id) REFERENCES rent_route_plans (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_agreement_envelopes ADD FOREIGN KEY (voided_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_agreement_envelopes ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_agreement_envelopes ADD FOREIGN KEY (executed_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_agreement_envelopes ADD FOREIGN KEY (prepared_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_agreement_envelopes ADD FOREIGN KEY (source_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_agreement_envelopes ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_agreement_envelopes ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_agreement_envelopes ADD FOREIGN KEY (case_id) REFERENCES wa_residential_form_cases (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_agreement_signers ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_agreement_signers ADD FOREIGN KEY (envelope_id) REFERENCES wa_agreement_envelopes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_agreement_events ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE wa_agreement_events ADD FOREIGN KEY (envelope_id) REFERENCES wa_agreement_envelopes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_grants ADD FOREIGN KEY (verified_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_grants ADD FOREIGN KEY (owner_user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_grants ADD FOREIGN KEY (management_id) REFERENCES property_management_relationships (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_grants ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_grants ADD FOREIGN KEY (agency_client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_report_shares ADD FOREIGN KEY (shared_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_report_shares ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_report_shares ADD FOREIGN KEY (grant_id) REFERENCES agency_owner_grants (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_commercial_agreements ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_commercial_agreements ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_commercial_agreements ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_contract_rates ADD FOREIGN KEY (service_id) REFERENCES services (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_contract_rates ADD FOREIGN KEY (agreement_id) REFERENCES agency_commercial_agreements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_billable_work ADD FOREIGN KEY (recorded_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_billable_work ADD FOREIGN KEY (service_id) REFERENCES services (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_billable_work ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_billable_work ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_billable_work ADD FOREIGN KEY (agreement_id) REFERENCES agency_commercial_agreements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_monthly_statements ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_monthly_statements ADD FOREIGN KEY (prepared_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_monthly_statements ADD FOREIGN KEY (agreement_id) REFERENCES agency_commercial_agreements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_statement_lines ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_statement_lines ADD FOREIGN KEY (billable_work_id) REFERENCES agency_billable_work (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_statement_lines ADD FOREIGN KEY (statement_id) REFERENCES agency_monthly_statements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v4_service_requests ADD FOREIGN KEY (staff_actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v4_service_requests ADD FOREIGN KEY (completion_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v4_request_links ADD FOREIGN KEY (request_id) REFERENCES v4_service_requests (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v4_request_events ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE v4_request_events ADD FOREIGN KEY (request_id) REFERENCES v4_service_requests (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE payment_checkout_attempts ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE payment_checkout_attempts ADD FOREIGN KEY (payment_id) REFERENCES payments (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE payment_reconciliation_items ADD FOREIGN KEY (resolved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE payment_reconciliation_items ADD FOREIGN KEY (payment_id) REFERENCES payments (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE payment_refund_observations ADD FOREIGN KEY (payment_id) REFERENCES payments (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE payment_disputes ADD FOREIGN KEY (payment_id) REFERENCES payments (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE refund_requests ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE refund_requests ADD FOREIGN KEY (requested_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE refund_requests ADD FOREIGN KEY (payment_id) REFERENCES payments (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_accounts ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_accounts ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_invoice_exports ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_invoice_exports ADD FOREIGN KEY (requested_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_invoice_exports ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_invoice_exports ADD FOREIGN KEY (statement_id) REFERENCES agency_monthly_statements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_invoices ADD FOREIGN KEY (statement_id) REFERENCES agency_monthly_statements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_invoices ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_reconciliations ADD FOREIGN KEY (stripe_invoice_id) REFERENCES billing_invoices (stripe_invoice_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE legal_document_versions ADD FOREIGN KEY (withdrawn_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE legal_document_versions ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE legal_document_versions ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE legal_acceptance_receipts ADD FOREIGN KEY (document_id) REFERENCES legal_document_versions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_manager_assignments ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_manager_assignments ADD FOREIGN KEY (requested_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_manager_assignments ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_manager_assignments ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_manager_assignments ADD FOREIGN KEY (building_id) REFERENCES scheme_buildings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_asset_links ADD FOREIGN KEY (linked_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_asset_links ADD FOREIGN KEY (building_id) REFERENCES scheme_buildings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_asset_links ADD FOREIGN KEY (asset_id) REFERENCES v2_assets (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_operational_items ADD FOREIGN KEY (completed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_operational_items ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_operational_items ADD FOREIGN KEY (request_id) REFERENCES requests (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_operational_items ADD FOREIGN KEY (last_action_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_operational_items ADD FOREIGN KEY (requester_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_operational_items ADD FOREIGN KEY (asset_id) REFERENCES v2_assets (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_operational_items ADD FOREIGN KEY (building_id) REFERENCES scheme_buildings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_operational_events ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_operational_events ADD FOREIGN KEY (building_id) REFERENCES scheme_buildings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_plan_requests ADD FOREIGN KEY (item_id) REFERENCES building_operational_items (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_plan_requests ADD FOREIGN KEY (plan_id) REFERENCES v2_preventive_plans (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_move_requests ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_move_requests ADD FOREIGN KEY (requester_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_move_requests ADD FOREIGN KEY (lot_id) REFERENCES strata_lots (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_move_requests ADD FOREIGN KEY (building_id) REFERENCES scheme_buildings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_access_devices ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_access_devices ADD FOREIGN KEY (holder_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_access_devices ADD FOREIGN KEY (building_id) REFERENCES scheme_buildings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_report_grants ADD FOREIGN KEY (granted_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_report_grants ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_report_grants ADD FOREIGN KEY (building_id) REFERENCES scheme_buildings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_notice_drafts ADD FOREIGN KEY (notice_id) REFERENCES building_notices (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_notice_drafts ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_notice_drafts ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_notice_drafts ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE building_notice_drafts ADD FOREIGN KEY (building_id) REFERENCES scheme_buildings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE notice_supersessions ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE notice_supersessions ADD FOREIGN KEY (new_notice_id) REFERENCES building_notices (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE notice_supersessions ADD FOREIGN KEY (old_notice_id) REFERENCES building_notices (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE notice_revision_history ADD FOREIGN KEY (notice_id) REFERENCES building_notices (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE council_conflict_declarations ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE council_conflict_declarations ADD FOREIGN KEY (approval_id) REFERENCES approvals (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE council_response_history ADD FOREIGN KEY (membership_id) REFERENCES scheme_memberships (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE council_response_history ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE council_response_history ADD FOREIGN KEY (approval_id) REFERENCES approvals (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE service_sale_variants ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE service_sale_variants ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE service_sale_variants ADD FOREIGN KEY (service_id) REFERENCES services (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE feature_release_approvals ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE feature_release_approvals ADD FOREIGN KEY (requested_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_register ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_register ADD FOREIGN KEY (source_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_register ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_register ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_tasks ADD FOREIGN KEY (completion_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_tasks ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_tasks ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_tasks ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_tasks ADD FOREIGN KEY (lease_id) REFERENCES commercial_lease_register (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_events ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_events ADD FOREIGN KEY (task_id) REFERENCES commercial_lease_tasks (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_events ADD FOREIGN KEY (lease_id) REFERENCES commercial_lease_register (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_invitations ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_invitations ADD FOREIGN KEY (grant_id) REFERENCES agency_owner_grants (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_invitations ADD FOREIGN KEY (claimed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_invitations ADD FOREIGN KEY (invited_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_invitations ADD FOREIGN KEY (management_id) REFERENCES property_management_relationships (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_invitations ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE agency_owner_invitations ADD FOREIGN KEY (agency_client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE pcr_routine_discount_entitlements ADD FOREIGN KEY (source_payment_id) REFERENCES payments (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE pcr_routine_discount_entitlements ADD FOREIGN KEY (guest_order_id) REFERENCES guest_service_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE pcr_routine_discount_redemptions ADD FOREIGN KEY (payment_id) REFERENCES payments (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE pcr_routine_discount_redemptions ADD FOREIGN KEY (entitlement_id) REFERENCES pcr_routine_discount_entitlements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE pcr_discount_reservations ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE pcr_discount_reservations ADD FOREIGN KEY (payment_id) REFERENCES payments (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE pcr_discount_reservations ADD FOREIGN KEY (guest_order_id) REFERENCES guest_service_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE pcr_discount_reservations ADD FOREIGN KEY (entitlement_id) REFERENCES pcr_routine_discount_entitlements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE residential_paid_property_enrollments ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE residential_paid_property_enrollments ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE stripe_subscription_risk_holds ADD FOREIGN KEY (stripe_invoice_id) REFERENCES stripe_subscription_invoice_observations (stripe_invoice_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_reference_checks ADD FOREIGN KEY (recorded_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_reference_checks ADD FOREIGN KEY (applicant_id) REFERENCES rental_applicants (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_application_reference_checks ADD FOREIGN KEY (application_id) REFERENCES rental_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_revisions ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_revisions ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_revisions ADD FOREIGN KEY (source_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_revisions ADD FOREIGN KEY (previous_revision_id) REFERENCES commercial_lease_revisions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_revisions ADD FOREIGN KEY (lease_id) REFERENCES commercial_lease_register (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_charge_rules ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_charge_rules ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_charge_rules ADD FOREIGN KEY (source_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_charge_rules ADD FOREIGN KEY (revision_id) REFERENCES commercial_lease_revisions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_charge_rules ADD FOREIGN KEY (lease_id) REFERENCES commercial_lease_register (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_charges ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_charges ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_charges ADD FOREIGN KEY (source_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_charges ADD FOREIGN KEY (adjusts_charge_id) REFERENCES commercial_lease_charges (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_charges ADD FOREIGN KEY (rule_id) REFERENCES commercial_charge_rules (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_charges ADD FOREIGN KEY (lease_id) REFERENCES commercial_lease_register (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_obligation_reviews ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_obligation_reviews ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_obligation_reviews ADD FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_obligation_reviews ADD FOREIGN KEY (condition_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_obligation_reviews ADD FOREIGN KEY (source_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_obligation_reviews ADD FOREIGN KEY (task_id) REFERENCES commercial_lease_tasks (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_obligation_reviews ADD FOREIGN KEY (lease_id) REFERENCES commercial_lease_register (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_task_successors ADD FOREIGN KEY (review_id) REFERENCES commercial_obligation_reviews (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_task_successors ADD FOREIGN KEY (successor_id) REFERENCES commercial_lease_tasks (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_task_successors ADD FOREIGN KEY (predecessor_id) REFERENCES commercial_lease_tasks (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_exceptions ADD FOREIGN KEY (resolution_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_exceptions ADD FOREIGN KEY (resolved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_exceptions ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_exceptions ADD FOREIGN KEY (task_id) REFERENCES commercial_lease_tasks (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_exceptions ADD FOREIGN KEY (charge_id) REFERENCES commercial_lease_charges (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_lease_exceptions ADD FOREIGN KEY (lease_id) REFERENCES commercial_lease_register (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_exception_assignments ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_exception_assignments ADD FOREIGN KEY (owner_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_exception_assignments ADD FOREIGN KEY (exception_id) REFERENCES commercial_lease_exceptions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_render_reviews ADD FOREIGN KEY (reviewer_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_render_reviews ADD FOREIGN KEY (document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_render_reviews ADD FOREIGN KEY (report_version_id) REFERENCES report_versions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_invoice_contacts ADD FOREIGN KEY (revoked_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_invoice_contacts ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_invoice_contacts ADD FOREIGN KEY (requested_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_invoice_contacts ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_invoice_dispatches ADD FOREIGN KEY (requested_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_invoice_dispatches ADD FOREIGN KEY (contact_id) REFERENCES billing_invoice_contacts (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_invoice_dispatches ADD FOREIGN KEY (stripe_invoice_id) REFERENCES billing_invoices (stripe_invoice_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_invoice_dispatches ADD FOREIGN KEY (statement_id) REFERENCES agency_monthly_statements (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_invoice_dispatch_events ADD FOREIGN KEY (actor_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE billing_invoice_dispatch_events ADD FOREIGN KEY (statement_id) REFERENCES billing_invoice_dispatches (statement_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_tenancy_handovers ADD FOREIGN KEY (voided_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_tenancy_handovers ADD FOREIGN KEY (activated_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_tenancy_handovers ADD FOREIGN KEY (initiated_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_tenancy_handovers ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_tenancy_handovers ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_tenancy_handovers ADD FOREIGN KEY (listing_id) REFERENCES leasing_listings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_tenancy_handovers ADD FOREIGN KEY (submission_id) REFERENCES rental_application_submissions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_tenancy_handovers ADD FOREIGN KEY (outcome_id) REFERENCES rental_application_outcomes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_tenancy_handovers ADD FOREIGN KEY (application_id) REFERENCES rental_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_tenancy_handover_people ADD FOREIGN KEY (handover_id) REFERENCES rental_tenancy_handovers (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE legacy_included_property_grants ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE legacy_included_property_grants ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE account_subscription_preferences ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE residential_paid_service_allowances ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE residential_paid_service_allowances ADD FOREIGN KEY (service_id) REFERENCES services (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE client_service_interests ADD FOREIGN KEY (requested_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE client_service_interests ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE CASCADE;

ALTER TABLE commercial_application_permissions ADD FOREIGN KEY (granted_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_permissions ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_flows ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_flows ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_flows ADD FOREIGN KEY (listing_id) REFERENCES leasing_listings (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_flow_recipient_challenges ADD FOREIGN KEY (flow_id) REFERENCES commercial_application_flows (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_applications ADD FOREIGN KEY (flow_id) REFERENCES commercial_application_flows (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_people ADD FOREIGN KEY (application_id) REFERENCES commercial_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_applicant_entities ADD FOREIGN KEY (application_id) REFERENCES commercial_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_people_roles ADD FOREIGN KEY (application_id,entity_id) REFERENCES commercial_applicant_entities (application_id,id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_people_roles ADD FOREIGN KEY (application_id,person_id) REFERENCES commercial_application_people (application_id,id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_links ADD FOREIGN KEY (person_id) REFERENCES commercial_application_people (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_sessions ADD FOREIGN KEY (person_id) REFERENCES commercial_application_people (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_evidence ADD FOREIGN KEY (application_id,entity_id) REFERENCES commercial_applicant_entities (application_id,id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_evidence ADD FOREIGN KEY (application_id,person_id) REFERENCES commercial_application_people (application_id,id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_evidence ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_evidence ADD FOREIGN KEY (application_id) REFERENCES commercial_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_scan_receipts ADD FOREIGN KEY (document_id) REFERENCES commercial_application_evidence (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_offers ADD FOREIGN KEY (authorised_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_offers ADD FOREIGN KEY (application_id) REFERENCES commercial_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_submissions ADD FOREIGN KEY (submitted_by) REFERENCES commercial_application_people (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_submissions ADD FOREIGN KEY (application_id) REFERENCES commercial_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_events ADD FOREIGN KEY (actor_staff_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_events ADD FOREIGN KEY (actor_person_id) REFERENCES commercial_application_people (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_events ADD FOREIGN KEY (flow_id) REFERENCES commercial_application_flows (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_events ADD FOREIGN KEY (application_id) REFERENCES commercial_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_referrals ADD FOREIGN KEY (prepared_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_referrals ADD FOREIGN KEY (submission_id) REFERENCES commercial_application_submissions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_referrals ADD FOREIGN KEY (application_id) REFERENCES commercial_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_referral_grants ADD FOREIGN KEY (referral_id) REFERENCES commercial_application_referrals (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_privacy_requests ADD FOREIGN KEY (resolved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_privacy_requests ADD FOREIGN KEY (person_id) REFERENCES commercial_application_people (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_privacy_requests ADD FOREIGN KEY (application_id) REFERENCES commercial_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_purge_permits ADD FOREIGN KEY (approved_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_application_purge_permits ADD FOREIGN KEY (application_id) REFERENCES commercial_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE property_application_management ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_temporary_documents ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_temporary_documents ADD FOREIGN KEY (applicant_id) REFERENCES rental_applicants (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_temporary_documents ADD FOREIGN KEY (application_id) REFERENCES rental_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_temporary_packages ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_temporary_packages ADD FOREIGN KEY (outbox_id) REFERENCES outbox_events (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_temporary_packages ADD FOREIGN KEY (submission_id) REFERENCES rental_application_submissions (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE rental_temporary_packages ADD FOREIGN KEY (application_id) REFERENCES rental_applications (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE account_experience_tags ADD FOREIGN KEY (set_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE account_experience_tags ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE CASCADE;

ALTER TABLE co_living_sites ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE co_living_sites ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE co_living_spaces ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE co_living_spaces ADD FOREIGN KEY (property_id) REFERENCES co_living_sites (property_id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE co_living_occupancies ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE co_living_occupancies ADD FOREIGN KEY (space_id) REFERENCES co_living_spaces (id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE co_living_occupancies ADD FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE commercial_occupancies ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_occupancies ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_occupancies ADD FOREIGN KEY (property_id) REFERENCES properties (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_occupant_invitations ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_occupant_invitations ADD FOREIGN KEY (occupancy_id) REFERENCES commercial_occupancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_occupant_memberships ADD FOREIGN KEY (granted_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_occupant_memberships ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_occupant_memberships ADD FOREIGN KEY (occupancy_id) REFERENCES commercial_occupancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_occupant_requests ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE commercial_occupant_requests ADD FOREIGN KEY (occupancy_id) REFERENCES commercial_occupancies (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE council_appointment_reviews ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE council_appointment_reviews ADD FOREIGN KEY (origin_client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE council_appointment_reviews ADD FOREIGN KEY (requested_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE council_appointment_reviews ADD FOREIGN KEY (lot_id) REFERENCES strata_lots (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE council_appointment_reviews ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE registered_booking_payment_links ADD FOREIGN KEY (payment_id) REFERENCES payments (id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE registered_booking_payment_links ADD FOREIGN KEY (booking_id) REFERENCES bookings (id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE user_portal_preferences ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE CASCADE;

ALTER TABLE co_living_lease_terms ADD FOREIGN KEY (updated_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE co_living_lease_terms ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE co_living_lease_terms ADD FOREIGN KEY (agreement_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE co_living_lease_terms ADD FOREIGN KEY (tenancy_id) REFERENCES co_living_occupancies (tenancy_id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE co_living_occupancy_events ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE co_living_occupancy_events ADD FOREIGN KEY (tenancy_id) REFERENCES co_living_occupancies (tenancy_id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE co_living_area_inspections ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE co_living_area_inspections ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE co_living_area_inspections ADD FOREIGN KEY (issued_document_id) REFERENCES documents (id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE co_living_area_inspections ADD FOREIGN KEY (space_id) REFERENCES co_living_spaces (id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE co_living_area_inspections ADD FOREIGN KEY (property_id) REFERENCES co_living_sites (property_id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE strata_amenities ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE strata_amenities ADD FOREIGN KEY (scheme_id) REFERENCES strata_schemes (id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE strata_amenity_requests ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE strata_amenity_requests ADD FOREIGN KEY (requester_id) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE strata_amenity_requests ADD FOREIGN KEY (amenity_id) REFERENCES strata_amenities (id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE report_photo_annotations ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_photo_annotations ADD FOREIGN KEY (created_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE report_photo_annotations ADD FOREIGN KEY (report_id) REFERENCES inspection_reports (id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE report_photo_annotations ADD FOREIGN KEY (evidence_id) REFERENCES report_evidence (id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE invoice_credit_proposals ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE invoice_credit_proposals ADD FOREIGN KEY (requested_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE invoice_credit_proposals ADD FOREIGN KEY (client_id) REFERENCES clients (id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE invoice_credit_proposals ADD FOREIGN KEY (stripe_invoice_id) REFERENCES billing_invoices (stripe_invoice_id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE bank_reconciliation_observations ADD FOREIGN KEY (reviewed_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bank_reconciliation_observations ADD FOREIGN KEY (requested_by) REFERENCES users (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE bank_reconciliation_observations ADD FOREIGN KEY (payment_id) REFERENCES payments (id) ON UPDATE NO ACTION ON DELETE RESTRICT;

-- bank_observation_immutable
CREATE FUNCTION pi_compat.bank_observation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status IN ('reviewed','disputed')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BANK_OBSERVATION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0000_bank_observation_immutable BEFORE UPDATE ON bank_reconciliation_observations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.bank_observation_immutable();

-- bank_observation_independent
CREATE FUNCTION pi_compat.bank_observation_independent() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status IN ('reviewed','disputed') AND OLD.status='recorded') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.requested_by OR NEW.reviewed_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'FINANCE_SELF_REVIEW_DENIED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0001_bank_observation_independent BEFORE UPDATE OF status ON bank_reconciliation_observations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.bank_observation_independent();

-- invoice_credit_immutable
CREATE FUNCTION pi_compat.invoice_credit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status IN ('approved','rejected')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CREDIT_PROPOSAL_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0002_invoice_credit_immutable BEFORE UPDATE ON invoice_credit_proposals
  FOR EACH ROW EXECUTE FUNCTION pi_compat.invoice_credit_immutable();

-- invoice_credit_independent
CREATE FUNCTION pi_compat.invoice_credit_independent() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status IN ('approved','rejected') AND OLD.status='requested') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.requested_by OR NEW.reviewed_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'FINANCE_SELF_REVIEW_DENIED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0003_invoice_credit_independent BEFORE UPDATE OF status ON invoice_credit_proposals
  FOR EACH ROW EXECUTE FUNCTION pi_compat.invoice_credit_independent();

-- report_annotations_immutable
CREATE FUNCTION pi_compat.report_annotations_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.review_status='accepted') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REVIEWED_ANNOTATIONS_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0004_report_annotations_immutable AFTER UPDATE ON report_photo_annotations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.report_annotations_immutable();

-- report_annotations_independent
CREATE FUNCTION pi_compat.report_annotations_independent() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.review_status IN ('accepted','rejected') AND OLD.review_status='draft') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ANNOTATION_SELF_REVIEW_DENIED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0005_report_annotations_independent BEFORE UPDATE OF review_status ON report_photo_annotations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.report_annotations_independent();

-- strata_amenity_approval_conflict
CREATE FUNCTION pi_compat.strata_amenity_approval_conflict() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved' AND OLD.status!='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (EXISTS (
 SELECT 1 FROM strata_amenity_requests r
 WHERE r.amenity_id=NEW.amenity_id AND r.id<>NEW.id AND r.status='approved'
 AND r.starts_at<NEW.ends_at AND r.ends_at>NEW.starts_at
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AMENITY_SLOT_CONFLICT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0006_strata_amenity_approval_conflict BEFORE UPDATE OF status ON strata_amenity_requests
  FOR EACH ROW EXECUTE FUNCTION pi_compat.strata_amenity_approval_conflict();

-- co_living_shared_area_guard
CREATE FUNCTION pi_compat.co_living_shared_area_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS (
  SELECT 1 FROM co_living_spaces s WHERE s.id=NEW.space_id AND s.property_id=NEW.property_id
    AND s.space_type='shared_area' AND s.active=1
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CO_LIVING_SHARED_AREA_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0007_co_living_shared_area_guard BEFORE INSERT ON co_living_area_inspections
  FOR EACH ROW EXECUTE FUNCTION pi_compat.co_living_shared_area_guard();

-- co_living_terms_independent
CREATE FUNCTION pi_compat.co_living_terms_independent() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.review_status='reviewed' AND OLD.review_status!='reviewed') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.updated_by) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CO_LIVING_SELF_REVIEW_DENIED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0008_co_living_terms_independent BEFORE UPDATE OF review_status ON co_living_lease_terms
  FOR EACH ROW EXECUTE FUNCTION pi_compat.co_living_terms_independent();

-- co_living_shared_published_immutable
CREATE FUNCTION pi_compat.co_living_shared_published_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status='published') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CO_LIVING_PUBLISHED_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0009_co_living_shared_published_immutable BEFORE UPDATE ON co_living_area_inspections
  FOR EACH ROW EXECUTE FUNCTION pi_compat.co_living_shared_published_immutable();

-- co_living_shared_review_independent
CREATE FUNCTION pi_compat.co_living_shared_review_independent() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='published' AND OLD.status!='published') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CO_LIVING_SELF_REVIEW_DENIED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0010_co_living_shared_review_independent BEFORE UPDATE OF status ON co_living_area_inspections
  FOR EACH ROW EXECUTE FUNCTION pi_compat.co_living_shared_review_independent();

-- registered_booking_payment_immutable
CREATE FUNCTION pi_compat.registered_booking_payment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REGISTERED_PAYMENT_LINK_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0011_registered_booking_payment_immutable BEFORE UPDATE ON registered_booking_payment_links
  FOR EACH ROW EXECUTE FUNCTION pi_compat.registered_booking_payment_immutable();

-- registered_booking_payment_scope
CREATE FUNCTION pi_compat.registered_booking_payment_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
    SELECT 1 FROM bookings b JOIN work_orders w ON w.booking_id=b.id
    JOIN payments p ON p.id=NEW.payment_id AND p.work_order_id=w.id
    WHERE b.id=NEW.booking_id AND b.client_id=p.client_id
      AND b.property_id=p.property_id
      AND p.total_cents=NEW.price_ex_gst_cents+NEW.gst_cents
      AND b.price_ex_gst_cents=NEW.price_ex_gst_cents
  )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REGISTERED_PAYMENT_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0012_registered_booking_payment_scope BEFORE INSERT ON registered_booking_payment_links
  FOR EACH ROW EXECUTE FUNCTION pi_compat.registered_booking_payment_scope();

-- co_living_occupancy_immutable
CREATE FUNCTION pi_compat.co_living_occupancy_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CO_LIVING_OCCUPANCY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0013_co_living_occupancy_immutable BEFORE UPDATE OF tenancy_id,space_id ON co_living_occupancies
  FOR EACH ROW EXECUTE FUNCTION pi_compat.co_living_occupancy_immutable();

-- co_living_tenancy_property_immutable
CREATE FUNCTION pi_compat.co_living_tenancy_property_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (EXISTS (SELECT 1 FROM co_living_occupancies WHERE tenancy_id=OLD.id)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CO_LIVING_OCCUPANCY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0014_co_living_tenancy_property_immutable BEFORE UPDATE OF property_id ON tenancies
  FOR EACH ROW EXECUTE FUNCTION pi_compat.co_living_tenancy_property_immutable();

-- co_living_tenancy_date_guard
CREATE FUNCTION pi_compat.co_living_tenancy_date_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (EXISTS (SELECT 1 FROM co_living_occupancies WHERE tenancy_id=NEW.id)) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.status IN ('active','pending')
    AND EXISTS (
      SELECT 1 FROM co_living_occupancies mine
      JOIN co_living_occupancies other ON other.space_id=mine.space_id AND other.tenancy_id!=mine.tenancy_id
      JOIN tenancies prior ON prior.id=other.tenancy_id
      WHERE mine.tenancy_id=NEW.id AND prior.status IN ('active','pending')
        AND (prior.ends_at IS NULL OR prior.ends_at>NEW.starts_at)
        AND (NEW.ends_at IS NULL OR prior.starts_at<NEW.ends_at)
    )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CO_LIVING_OCCUPANCY_CONFLICT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0015_co_living_tenancy_date_guard BEFORE UPDATE OF status,starts_at,ends_at ON tenancies
  FOR EACH ROW EXECUTE FUNCTION pi_compat.co_living_tenancy_date_guard();

-- co_living_occupancy_guard
CREATE FUNCTION pi_compat.co_living_occupancy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS (
    SELECT 1 FROM co_living_spaces s JOIN tenancies t ON t.property_id=s.property_id
    WHERE s.id=NEW.space_id AND t.id=NEW.tenancy_id AND s.active=1
      AND s.space_type IN ('room','bed')
  )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CO_LIVING_SPACE_NOT_PRIVATE';
  END IF;
  IF (EXISTS (
    SELECT 1 FROM co_living_occupancies o
    JOIN tenancies prior ON prior.id=o.tenancy_id
    JOIN tenancies incoming ON incoming.id=NEW.tenancy_id
    WHERE o.space_id=NEW.space_id AND prior.status IN ('pending','active')
      AND incoming.status IN ('pending','active')
      AND (prior.ends_at IS NULL OR prior.ends_at>incoming.starts_at)
      AND (incoming.ends_at IS NULL OR prior.starts_at<incoming.ends_at)
  )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CO_LIVING_OCCUPANCY_CONFLICT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0016_co_living_occupancy_guard BEFORE INSERT ON co_living_occupancies
  FOR EACH ROW EXECUTE FUNCTION pi_compat.co_living_occupancy_guard();

-- co_living_space_mode
CREATE FUNCTION pi_compat.co_living_space_mode() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.space_type NOT IN ('shared_area',(SELECT allocation_mode FROM co_living_sites WHERE property_id=NEW.property_id))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CO_LIVING_SPACE_MODE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0017_co_living_space_mode BEFORE INSERT ON co_living_spaces
  FOR EACH ROW EXECUTE FUNCTION pi_compat.co_living_space_mode();

-- co_living_site_residential
CREATE FUNCTION pi_compat.co_living_site_residential() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS
   (SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.sector='residential' AND p.archived_at IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CO_LIVING_RESIDENTIAL_ONLY';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0018_co_living_site_residential BEFORE INSERT ON co_living_sites
  FOR EACH ROW EXECUTE FUNCTION pi_compat.co_living_site_residential();

-- rental_temporary_package_sent_once
CREATE FUNCTION pi_compat.rental_temporary_package_sent_once() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.sent_at IS NOT NULL AND (NEW.sent_at IS DISTINCT FROM OLD.sent_at OR NEW.provider_id IS DISTINCT FROM OLD.provider_id OR NEW.expires_at IS DISTINCT FROM OLD.expires_at)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TEMPORARY_SEND_RECEIPT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0019_rental_temporary_package_sent_once BEFORE UPDATE OF sent_at,provider_id,expires_at ON rental_temporary_packages
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_temporary_package_sent_once();

-- rental_temporary_package_immutable
CREATE FUNCTION pi_compat.rental_temporary_package_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TEMPORARY_PACKAGE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0020_rental_temporary_package_immutable BEFORE UPDATE OF application_id,submission_id,outbox_id,token_hash,recipient_envelope,recipient_hash,cc_hash,management_version,recipient_verified_at,document_ids_json,created_by,created_at ON rental_temporary_packages
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_temporary_package_immutable();

-- rental_temporary_review_guard
CREATE FUNCTION pi_compat.rental_temporary_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF ((OLD.state IN('purging','purged') AND NEW.state NOT IN('purging','purged')) OR
 (NEW.state='approved' AND OLD.state!='quarantined')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TEMPORARY_REVIEW_CLOSED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0021_rental_temporary_review_guard BEFORE UPDATE OF state ON rental_temporary_documents
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_temporary_review_guard();

-- rental_temporary_manifest_immutable
CREATE FUNCTION pi_compat.rental_temporary_manifest_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TEMPORARY_DOCUMENT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0022_rental_temporary_manifest_immutable BEFORE UPDATE OF application_id,applicant_id,object_key,size_bytes,sha256,uploaded_at ON rental_temporary_documents
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_temporary_manifest_immutable();

-- rental_temporary_upload_guard
CREATE FUNCTION pi_compat.rental_temporary_upload_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
  SELECT 1 FROM rental_applications a JOIN rental_applicants p ON p.application_id=a.id
  JOIN leasing_listings l ON l.id=a.listing_id JOIN property_application_management m ON m.property_id=l.property_id
  WHERE a.id=NEW.application_id AND p.id=NEW.applicant_id AND p.state!='removed'
  AND a.status IN('draft','information_requested') AND (a.privacy_hold_until IS NULL OR a.privacy_hold_until<=pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND strpos(a.consent_version,'|managed-temporary:')>0
  AND m.provider='proinspect' AND l.status='published' AND l.application_mode='proinspect' AND l.application_url IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TEMPORARY_UPLOAD_CLOSED';
  END IF;
  IF ((SELECT COUNT(*) FROM rental_temporary_documents WHERE applicant_id=NEW.applicant_id AND state!='purged')>=10) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TEMPORARY_DOCUMENT_LIMIT';
  END IF;
  IF (COALESCE((SELECT SUM(size_bytes) FROM rental_temporary_documents WHERE application_id=NEW.application_id AND state!='purged'),0)+NEW.size_bytes>52428800) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TEMPORARY_STORAGE_LIMIT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0023_rental_temporary_upload_guard BEFORE INSERT ON rental_temporary_documents
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_temporary_upload_guard();

-- rental_temporary_release_immutable
CREATE FUNCTION pi_compat.rental_temporary_release_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TEMPORARY_RELEASE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0024_rental_temporary_release_immutable BEFORE UPDATE OF id,environment,source_sha,policy_version,policy_sha256,intake_mode,authorized_by,authorization_reference,created_at ON managed_rental_temporary_releases
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_temporary_release_immutable();

-- rental_document_count_limit
CREATE FUNCTION pi_compat.rental_document_count_limit() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF ((SELECT COUNT(*) FROM rental_application_documents WHERE applicant_id=NEW.applicant_id)>=10) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_DOCUMENT_LIMIT';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0025_rental_document_count_limit BEFORE INSERT ON rental_application_documents
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_document_count_limit();

-- managed_document_release_immutable
CREATE FUNCTION pi_compat.managed_document_release_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DOCUMENT_RELEASE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0026_managed_document_release_immutable BEFORE UPDATE OF id,environment,source_sha,policy_version,policy_sha256,intake_mode,scanner_worker_name,scanner_source_sha,scanner_image_digest,scanner_key_id,scanner_public_jwk,scanner_test_sha256,scanner_verified_at,authorized_by,authorization_reference,created_at ON managed_rental_document_releases
  FOR EACH ROW EXECUTE FUNCTION pi_compat.managed_document_release_immutable();

-- managed_rental_release_immutable
CREATE FUNCTION pi_compat.managed_rental_release_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MANAGED_RELEASE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0027_managed_rental_release_immutable BEFORE UPDATE OF id,environment,source_sha,policy_version,policy_sha256,intake_mode,authorized_by,authorization_reference,created_at ON managed_rental_intake_releases
  FOR EACH ROW EXECUTE FUNCTION pi_compat.managed_rental_release_immutable();

-- commercial_referral_parent_guard
CREATE FUNCTION pi_compat.commercial_referral_parent_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM commercial_application_submissions s WHERE s.id=NEW.submission_id AND s.application_id=NEW.application_id)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_REFERRAL_PARENT_REQUIRED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0028_commercial_referral_parent_guard BEFORE INSERT ON commercial_application_referrals
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_referral_parent_guard();

-- commercial_submission_parent_guard
CREATE FUNCTION pi_compat.commercial_submission_parent_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM commercial_application_people p JOIN commercial_applications a ON a.id=p.application_id WHERE p.id=NEW.submitted_by AND p.application_id=NEW.application_id AND p.lead=1 AND a.status='submitted')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SUBMISSION_OWNER_REQUIRED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0029_commercial_submission_parent_guard BEFORE INSERT ON commercial_application_submissions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_submission_parent_guard();

-- commercial_submitted_evidence_delete
CREATE FUNCTION pi_compat.commercial_submitted_evidence_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM commercial_applications a WHERE a.id=OLD.application_id AND a.status IN('draft','invited','in_progress','ready','needs_information'))
 AND NOT EXISTS(SELECT 1 FROM commercial_application_purge_permits p WHERE p.application_id=OLD.application_id)) IS NOT TRUE THEN RETURN OLD; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SUBMITTED_EVIDENCE_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0030_commercial_submitted_evidence_delete BEFORE DELETE ON commercial_application_evidence
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_submitted_evidence_delete();

-- commercial_evidence_content_immutable
CREATE FUNCTION pi_compat.commercial_evidence_content_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_EVIDENCE_CONTENT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0031_commercial_evidence_content_immutable BEFORE UPDATE OF id,application_id,person_id,entity_id,category,period_label,object_key,metadata_envelope,sha256,uploaded_at ON commercial_application_evidence
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_evidence_content_immutable();

-- commercial_offer_identity_immutable
CREATE FUNCTION pi_compat.commercial_offer_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_OFFER_IDENTITY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0032_commercial_offer_identity_immutable BEFORE UPDATE OF id,application_id,version,sha256,expires_at,authorised_by,authorised_at ON commercial_application_offers
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_offer_identity_immutable();

-- commercial_event_identity_immutable
CREATE FUNCTION pi_compat.commercial_event_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_AUDIT_IDENTITY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0033_commercial_event_identity_immutable BEFORE UPDATE OF id,application_id,flow_id,actor_person_id,actor_staff_id,kind,created_at ON commercial_application_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_event_identity_immutable();

-- commercial_submission_identity_immutable
CREATE FUNCTION pi_compat.commercial_submission_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SNAPSHOT_IDENTITY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0034_commercial_submission_identity_immutable BEFORE UPDATE OF id,application_id,request_key,sha256,submitted_by,created_at ON commercial_application_submissions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_submission_identity_immutable();

-- commercial_offer_immutable_d
CREATE FUNCTION pi_compat.commercial_offer_immutable_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_OFFER_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0035_commercial_offer_immutable_d BEFORE DELETE ON commercial_application_offers
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_offer_immutable_d();

-- commercial_offer_immutable_u
CREATE FUNCTION pi_compat.commercial_offer_immutable_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM commercial_application_purge_permits WHERE application_id=OLD.application_id)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_OFFER_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0036_commercial_offer_immutable_u BEFORE UPDATE ON commercial_application_offers
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_offer_immutable_u();

-- commercial_event_immutable_d
CREATE FUNCTION pi_compat.commercial_event_immutable_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0037_commercial_event_immutable_d BEFORE DELETE ON commercial_application_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_event_immutable_d();

-- commercial_event_immutable_u
CREATE FUNCTION pi_compat.commercial_event_immutable_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM commercial_application_purge_permits WHERE application_id=OLD.application_id)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0038_commercial_event_immutable_u BEFORE UPDATE ON commercial_application_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_event_immutable_u();

-- commercial_submission_immutable_d
CREATE FUNCTION pi_compat.commercial_submission_immutable_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SNAPSHOT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0039_commercial_submission_immutable_d BEFORE DELETE ON commercial_application_submissions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_submission_immutable_d();

-- commercial_submission_immutable_u
CREATE FUNCTION pi_compat.commercial_submission_immutable_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM commercial_application_purge_permits WHERE application_id=OLD.application_id)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SNAPSHOT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0040_commercial_submission_immutable_u BEFORE UPDATE ON commercial_application_submissions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_submission_immutable_u();

-- commercial_referred_requires_receipt
CREATE FUNCTION pi_compat.commercial_referred_requires_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='referred' AND NOT EXISTS(SELECT 1 FROM commercial_application_referrals r WHERE r.application_id=NEW.id AND r.status='accepted' AND r.receipt_envelope IS NOT NULL)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_REFERRAL_ACCEPTANCE_REQUIRED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0041_commercial_referred_requires_receipt BEFORE UPDATE OF status ON commercial_applications
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_referred_requires_receipt();

-- commercial_referral_receipt_guard
CREATE FUNCTION pi_compat.commercial_referral_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='accepted' AND (OLD.status NOT IN('sending','uncertain') OR NEW.receipt_envelope IS NULL)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SIGNED_RECEIPT_REQUIRED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0042_commercial_referral_receipt_guard BEFORE UPDATE OF status ON commercial_application_referrals
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_referral_receipt_guard();

-- commercial_evidence_final_scan
CREATE FUNCTION pi_compat.commercial_evidence_final_scan() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.scan_status IN('clean','unsafe') AND NEW.scan_status!=OLD.scan_status) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SCAN_FINAL';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0043_commercial_evidence_final_scan BEFORE UPDATE OF scan_status ON commercial_application_evidence
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_evidence_final_scan();

-- commercial_evidence_release_guard
CREATE FUNCTION pi_compat.commercial_evidence_release_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.review_status='released' AND (NEW.scan_status!='clean' OR OLD.scan_status!='clean' OR NEW.reviewed_by IS NULL)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_CLEAN_SCAN_REQUIRED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0044_commercial_evidence_release_guard BEFORE UPDATE OF review_status ON commercial_application_evidence
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_evidence_release_guard();

-- commercial_flow_approval_guard
CREATE FUNCTION pi_compat.commercial_flow_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved' AND (OLD.status!='draft' OR NEW.recipient_verified_at IS NULL OR NEW.approved_by IS NULL OR NEW.approved_by=NEW.created_by OR NEW.approved_at IS NULL OR length(COALESCE(NEW.approval_reference,''))<8)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_INDEPENDENT_AUTHORITY_REQUIRED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0045_commercial_flow_approval_guard BEFORE UPDATE OF status ON commercial_application_flows
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_flow_approval_guard();

-- commercial_listing_change_revokes_flow
CREATE FUNCTION pi_compat.commercial_listing_change_revokes_flow() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.property_id IS DISTINCT FROM NEW.property_id OR OLD.instructed_by_client_id IS DISTINCT FROM NEW.instructed_by_client_id
 OR OLD.agent_name IS DISTINCT FROM NEW.agent_name OR OLD.agent_role IS DISTINCT FROM NEW.agent_role OR OLD.application_url IS DISTINCT FROM NEW.application_url OR OLD.kind IS DISTINCT FROM NEW.kind) IS NOT TRUE THEN RETURN NEW; END IF;
  UPDATE commercial_application_flows SET status='revoked' WHERE listing_id=NEW.id AND status='approved';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0046_commercial_listing_change_revokes_flow AFTER UPDATE OF property_id,instructed_by_client_id,agent_name,agent_role,application_url,kind ON leasing_listings
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_listing_change_revokes_flow();

-- commercial_flow_immutable_scope
CREATE FUNCTION pi_compat.commercial_flow_immutable_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_FLOW_SCOPE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0047_commercial_flow_immutable_scope BEFORE UPDATE OF listing_id,version,mode,config_envelope,config_sha256,recipient_hash,created_by,created_at ON commercial_application_flows
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_flow_immutable_scope();

-- commercial_flow_listing_guard
CREATE FUNCTION pi_compat.commercial_flow_listing_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM leasing_listings l WHERE l.id=NEW.listing_id AND l.kind='commercial')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_LISTING_REQUIRED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0048_commercial_flow_listing_guard BEFORE INSERT ON commercial_application_flows
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_flow_listing_guard();

-- residential_paid_service_allowances_no_update
CREATE FUNCTION pi_compat.residential_paid_service_allowances_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAID_SERVICE_ALLOWANCE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0049_residential_paid_service_allowances_no_update BEFORE UPDATE ON residential_paid_service_allowances
  FOR EACH ROW EXECUTE FUNCTION pi_compat.residential_paid_service_allowances_no_update();

-- account_subscription_preferences_no_implicit_payment
CREATE FUNCTION pi_compat.account_subscription_preferences_no_implicit_payment() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.subscription_intent NOT IN ('none','checkout_requested')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SUBSCRIPTION_REQUIRES_PROVIDER_EVENT';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0050_account_subscription_preferences_no_implicit_payment BEFORE INSERT ON account_subscription_preferences
  FOR EACH ROW EXECUTE FUNCTION pi_compat.account_subscription_preferences_no_implicit_payment();

-- legacy_included_property_grants_no_delete
CREATE FUNCTION pi_compat.legacy_included_property_grants_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEGACY_GRANT_REQUIRES_INDEPENDENT_APPROVAL';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0051_legacy_included_property_grants_no_delete BEFORE DELETE ON legacy_included_property_grants
  FOR EACH ROW EXECUTE FUNCTION pi_compat.legacy_included_property_grants_no_delete();

-- legacy_included_property_grants_no_update
CREATE FUNCTION pi_compat.legacy_included_property_grants_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEGACY_GRANT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0052_legacy_included_property_grants_no_update BEFORE UPDATE ON legacy_included_property_grants
  FOR EACH ROW EXECUTE FUNCTION pi_compat.legacy_included_property_grants_no_update();

-- rental_handover_people_no_delete
CREATE FUNCTION pi_compat.rental_handover_people_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HANDOVER_PARTICIPANTS_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0053_rental_handover_people_no_delete BEFORE DELETE ON rental_tenancy_handover_people
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_handover_people_no_delete();

-- rental_handover_people_immutable
CREATE FUNCTION pi_compat.rental_handover_people_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HANDOVER_PARTICIPANTS_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0054_rental_handover_people_immutable BEFORE UPDATE ON rental_tenancy_handover_people
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_handover_people_immutable();

-- rental_handover_void_guard
CREATE FUNCTION pi_compat.rental_handover_void_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='void') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (OLD.status!='awaiting_agreement') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HANDOVER_ALREADY_FINALISED';
  END IF;
  IF (EXISTS(
    SELECT 1 FROM tenancies WHERE id=NEW.tenancy_id AND status!='ended')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HANDOVER_TENANCY_STILL_PENDING';
  END IF;
  IF (EXISTS(
    SELECT 1 FROM wa_agreement_envelopes
    WHERE tenancy_id=NEW.tenancy_id AND status='executed')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HANDOVER_EXECUTED_AGREEMENT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0055_rental_handover_void_guard BEFORE UPDATE OF status ON rental_tenancy_handovers
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_handover_void_guard();

-- rental_handover_activate_guard
CREATE FUNCTION pi_compat.rental_handover_activate_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='activated') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (OLD.status!='awaiting_agreement') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HANDOVER_ALREADY_FINALISED';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM rental_applications WHERE id=NEW.application_id AND status='decision_recorded')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HANDOVER_APPLICATION_WITHDRAWN';
  END IF;
  IF (NOT EXISTS(
   SELECT 1 FROM wa_agreement_envelopes e
   JOIN wa_residential_form_cases c ON c.id=e.case_id
   JOIN documents d ON d.id=e.executed_document_id AND d.status='issued'
   WHERE e.tenancy_id=NEW.tenancy_id AND e.property_id=NEW.property_id
     AND e.status='executed' AND e.executed_document_id IS NOT NULL
     AND c.form_code='WA_FORM_1AA' AND c.tenancy_id=NEW.tenancy_id
  )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HANDOVER_MISSING_EXECUTED_FORM_1AA';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0056_rental_handover_activate_guard BEFORE UPDATE OF status ON rental_tenancy_handovers
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_handover_activate_guard();

-- rental_handover_no_delete
CREATE FUNCTION pi_compat.rental_handover_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HANDOVER_REQUIRES_RETENTION_REVIEW';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0057_rental_handover_no_delete BEFORE DELETE ON rental_tenancy_handovers
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_handover_no_delete();

-- rental_handover_immutable
CREATE FUNCTION pi_compat.rental_handover_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HANDOVER_SOURCE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0058_rental_handover_immutable BEFORE UPDATE OF
 application_id,outcome_id,submission_id,listing_id,property_id,tenancy_id,request_key,
 authority_reference,terms_envelope,applicant_count,initiated_by,initiated_at ON rental_tenancy_handovers
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_handover_immutable();

-- rental_handover_source_guard
CREATE FUNCTION pi_compat.rental_handover_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS (
  SELECT 1 FROM rental_applications a
  JOIN rental_application_outcomes o ON o.application_id=a.id AND o.outcome='successful'
  JOIN rental_application_submissions s ON s.application_id=a.id
  JOIN leasing_listings l ON l.id=a.listing_id
  JOIN properties p ON p.id=l.property_id AND p.sector='residential'
  JOIN tenancies t ON t.id=NEW.tenancy_id AND t.property_id=p.id AND t.status='pending'
  WHERE a.id=NEW.application_id AND a.status='decision_recorded'
    AND (a.privacy_hold_until IS NULL OR a.privacy_hold_until<=pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    AND o.id=NEW.outcome_id AND s.id=NEW.submission_id
    AND l.id=NEW.listing_id AND l.property_id=NEW.property_id
    AND l.instructed_by_client_id IN (
      SELECT pm.manager_client_id FROM property_management_relationships pm
       WHERE pm.property_id=p.id AND pm.ends_at IS NULL)
    AND EXISTS (SELECT 1 FROM rental_application_handoffs h
      WHERE h.application_id=a.id AND h.status='delivered')
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HANDOVER_APPLICATION_NOT_APPROVED';
  END IF;
  IF (EXISTS(
   SELECT 1 FROM tenancies proposed JOIN tenancies other
     ON other.property_id=proposed.property_id AND other.id!=proposed.id
   WHERE proposed.id=NEW.tenancy_id AND other.status IN('pending','active')
     AND (other.ends_at IS NULL OR other.ends_at>proposed.starts_at)
     AND (proposed.ends_at IS NULL OR other.starts_at<proposed.ends_at)
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HANDOVER_TENANCY_OVERLAP';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0059_rental_handover_source_guard BEFORE INSERT ON rental_tenancy_handovers
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_handover_source_guard();

-- billing_invoice_dispatch_status_review
CREATE FUNCTION pi_compat.billing_invoice_dispatch_status_review() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status='preparing'
   AND NEW.status NOT IN('preparing','provider_accepted','needs_reconciliation')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLING_DISPATCH_TRANSITION';
  END IF;
  IF (NEW.status='provider_accepted' AND
  (OLD.status!='preparing' OR NEW.provider_accepted_at IS NULL)
 ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLING_DISPATCH_ACCEPTANCE_MISSING';
  END IF;
  IF (NEW.status='needs_reconciliation' AND NEW.provider_accepted_at IS NOT NULL
 ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLING_DISPATCH_UNCERTAINTY';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0060_billing_invoice_dispatch_status_review BEFORE UPDATE ON billing_invoice_dispatches
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_invoice_dispatch_status_review();

-- billing_invoice_dispatch_initial_state
CREATE FUNCTION pi_compat.billing_invoice_dispatch_initial_state() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status!='preparing' OR NEW.provider_accepted_at IS NOT NULL
 ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLING_DISPATCH_INITIAL_STATE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0061_billing_invoice_dispatch_initial_state BEFORE INSERT ON billing_invoice_dispatches
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_invoice_dispatch_initial_state();

-- billing_invoice_contact_initial_state
CREATE FUNCTION pi_compat.billing_invoice_contact_initial_state() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status!='pending' OR NEW.approved_by IS NOT NULL
  OR NEW.approved_at IS NOT NULL OR NEW.revoked_by IS NOT NULL OR NEW.revoked_at IS NOT NULL
 ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLING_CONTACT_INITIAL_REVIEW_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0062_billing_invoice_contact_initial_state BEFORE INSERT ON billing_invoice_contacts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_invoice_contact_initial_state();

-- billing_invoice_dispatch_event_delete
CREATE FUNCTION pi_compat.billing_invoice_dispatch_event_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLING_DISPATCH_EVENT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0063_billing_invoice_dispatch_event_delete BEFORE DELETE ON billing_invoice_dispatch_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_invoice_dispatch_event_delete();

-- billing_invoice_dispatch_event_immutable
CREATE FUNCTION pi_compat.billing_invoice_dispatch_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLING_DISPATCH_EVENT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0064_billing_invoice_dispatch_event_immutable BEFORE UPDATE ON billing_invoice_dispatch_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_invoice_dispatch_event_immutable();

-- billing_invoice_dispatch_delete
CREATE FUNCTION pi_compat.billing_invoice_dispatch_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLING_DISPATCH_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0065_billing_invoice_dispatch_delete BEFORE DELETE ON billing_invoice_dispatches
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_invoice_dispatch_delete();

-- billing_invoice_dispatch_immutable
CREATE FUNCTION pi_compat.billing_invoice_dispatch_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.statement_id!=OLD.statement_id OR NEW.stripe_invoice_id!=OLD.stripe_invoice_id
 OR NEW.contact_id!=OLD.contact_id OR NEW.customer_id!=OLD.customer_id
 OR NEW.recipient_email!=OLD.recipient_email OR NEW.requested_by!=OLD.requested_by
 OR NEW.approval_reference!=OLD.approval_reference OR NEW.created_at!=OLD.created_at
 OR OLD.status='provider_accepted' OR (OLD.status='needs_reconciliation' AND NEW.status!='needs_reconciliation')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLING_DISPATCH_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0066_billing_invoice_dispatch_immutable BEFORE UPDATE ON billing_invoice_dispatches
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_invoice_dispatch_immutable();

-- billing_invoice_dispatch_scope
CREATE FUNCTION pi_compat.billing_invoice_dispatch_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS (
  SELECT 1 FROM agency_invoice_exports e
  JOIN billing_invoices i ON i.stripe_invoice_id=e.stripe_invoice_id
  JOIN billing_invoice_contacts c ON c.client_id=e.client_id
  WHERE e.statement_id=NEW.statement_id AND e.status='finalized'
   AND e.stripe_invoice_id=NEW.stripe_invoice_id AND i.client_id=e.client_id
   AND i.stripe_customer_id=NEW.customer_id AND i.status IN('draft','open')
   AND c.id=NEW.contact_id AND c.email=NEW.recipient_email AND c.status='approved'
   AND c.approved_by IS DISTINCT FROM NEW.requested_by AND e.approved_by IS NOT NULL
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLING_DISPATCH_REVIEW_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0067_billing_invoice_dispatch_scope BEFORE INSERT ON billing_invoice_dispatches
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_invoice_dispatch_scope();

-- billing_invoice_contact_delete
CREATE FUNCTION pi_compat.billing_invoice_contact_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLING_CONTACT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0068_billing_invoice_contact_delete BEFORE DELETE ON billing_invoice_contacts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_invoice_contact_delete();

-- billing_invoice_contact_immutable
CREATE FUNCTION pi_compat.billing_invoice_contact_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.id!=OLD.id OR NEW.client_id!=OLD.client_id OR NEW.email!=OLD.email
 OR NEW.authority_reference!=OLD.authority_reference OR NEW.requested_by!=OLD.requested_by
 OR NEW.created_at!=OLD.created_at OR OLD.status='revoked'
 OR (OLD.status='approved' AND NEW.status!='revoked')
 OR (OLD.status='pending' AND NEW.status NOT IN('approved','revoked'))
 OR (OLD.approved_by IS NOT NULL AND NEW.approved_by IS DISTINCT FROM OLD.approved_by)
 OR (OLD.approved_at IS NOT NULL AND NEW.approved_at IS DISTINCT FROM OLD.approved_at)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLING_CONTACT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0069_billing_invoice_contact_immutable BEFORE UPDATE ON billing_invoice_contacts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_invoice_contact_immutable();

-- billing_invoice_contact_approval
CREATE FUNCTION pi_compat.billing_invoice_contact_approval() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status='pending' AND NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.approved_by IS NULL OR NEW.approved_by=OLD.requested_by OR NOT EXISTS (
   SELECT 1 FROM users u JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1
   AND sp.role IN('administrator','operations_manager')
   WHERE u.id=NEW.approved_by AND u.active=1 AND u.verified_at IS NOT NULL
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLING_CONTACT_INDEPENDENT_REVIEW';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0070_billing_invoice_contact_approval BEFORE UPDATE ON billing_invoice_contacts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_invoice_contact_approval();

-- report_render_document_issue_guard
CREATE FUNCTION pi_compat.report_render_document_issue_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='issued' AND OLD.status!='issued' AND EXISTS (
  SELECT 1 FROM report_render_manifests m WHERE m.document_id=OLD.id
 )) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS (
   SELECT 1 FROM report_render_manifests m
   JOIN report_render_reviews rv ON rv.report_version_id=m.report_version_id AND rv.document_id=m.document_id
   JOIN report_versions v ON v.id=m.report_version_id
   JOIN inspection_reports r ON r.id=v.report_id
   JOIN users u ON u.id=rv.reviewer_id AND u.active=1 AND u.verified_at IS NOT NULL
   JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1
   WHERE m.document_id=OLD.id AND rv.decision='accepted'
     AND rv.document_sha256=OLD.sha256 AND m.document_sha256=OLD.sha256
     AND r.approved_version_id=m.report_version_id AND r.status IN('approved','issued')
     AND r.inspector_id IS DISTINCT FROM rv.reviewer_id AND r.created_by IS DISTINCT FROM rv.reviewer_id
     AND OLD.created_by IS DISTINCT FROM rv.reviewer_id
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENDER_DOCUMENT_REVIEW_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0071_report_render_document_issue_guard BEFORE UPDATE OF status ON documents
  FOR EACH ROW EXECUTE FUNCTION pi_compat.report_render_document_issue_guard();

-- report_render_review_immutable_delete
CREATE FUNCTION pi_compat.report_render_review_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENDER_REVIEW_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0072_report_render_review_immutable_delete BEFORE DELETE ON report_render_reviews
  FOR EACH ROW EXECUTE FUNCTION pi_compat.report_render_review_immutable_delete();

-- report_render_review_immutable_update
CREATE FUNCTION pi_compat.report_render_review_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENDER_REVIEW_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0073_report_render_review_immutable_update BEFORE UPDATE ON report_render_reviews
  FOR EACH ROW EXECUTE FUNCTION pi_compat.report_render_review_immutable_update();

-- report_render_review_source
CREATE FUNCTION pi_compat.report_render_review_source() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS (
  SELECT 1 FROM report_render_manifests m
  JOIN documents d ON d.id=m.document_id
  JOIN report_versions v ON v.id=m.report_version_id
  JOIN inspection_reports r ON r.id=v.report_id
  JOIN users u ON u.id=NEW.reviewer_id AND u.active=1 AND u.verified_at IS NOT NULL
  JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1
  WHERE m.report_version_id=NEW.report_version_id AND m.document_id=NEW.document_id
    AND m.document_sha256=NEW.document_sha256 AND d.sha256=NEW.document_sha256
    AND d.status='review' AND r.approved_version_id=NEW.report_version_id
    AND r.status='approved' AND r.inspector_id IS DISTINCT FROM NEW.reviewer_id
    AND r.created_by IS DISTINCT FROM NEW.reviewer_id AND d.created_by IS DISTINCT FROM NEW.reviewer_id
    AND (r.reviewer_id=NEW.reviewer_id OR sp.role IN('administrator','operations_manager'))
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INDEPENDENT_RENDER_REVIEW_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0074_report_render_review_source BEFORE INSERT ON report_render_reviews
  FOR EACH ROW EXECUTE FUNCTION pi_compat.report_render_review_source();

-- commercial_charge_rule_evidence
CREATE FUNCTION pi_compat.commercial_charge_rule_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM commercial_charge_rules r JOIN commercial_lease_revisions v ON v.id=r.revision_id JOIN commercial_lease_register l ON l.id=NEW.lease_id
 JOIN documents rd ON rd.id=r.source_document_id AND rd.property_id=l.property_id AND rd.status='issued'
 JOIN document_grants rg ON rg.document_id=rd.id AND rg.recipient_kind='client' AND rg.recipient_id=l.client_id
 JOIN documents vd ON vd.id=v.source_document_id AND vd.property_id=l.property_id AND vd.status='issued'
 JOIN document_grants vg ON vg.document_id=vd.id AND vg.recipient_kind='client' AND vg.recipient_id=l.client_id
 WHERE r.id=NEW.rule_id AND r.lease_id=l.id AND r.status='approved' AND v.status='approved')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CHARGE_RULE_SOURCE_REVOKED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0075_commercial_charge_rule_evidence BEFORE UPDATE ON commercial_lease_charges
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_charge_rule_evidence();

-- commercial_obligation_material_review
CREATE FUNCTION pi_compat.commercial_obligation_material_review() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.kind IN('completion','cancellation','reopening') AND NEW.reviewed_by=(SELECT created_by FROM commercial_lease_tasks WHERE id=NEW.task_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TASK_INDEPENDENT_REVIEW';
  END IF;
  IF (NEW.kind='completion' AND (NEW.condition_document_id IS NULL OR NEW.responsibility='undetermined' OR NOT EXISTS(SELECT 1 FROM commercial_lease_tasks WHERE id=NEW.task_id AND status='review_required') OR (NEW.work_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_orders WHERE id=NEW.work_order_id AND status='completed')))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TASK_COMPLETION_INCOMPLETE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0076_commercial_obligation_material_review BEFORE UPDATE ON commercial_obligation_reviews
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_obligation_material_review();

-- commercial_task_reviewed_closure
CREATE FUNCTION pi_compat.commercial_task_reviewed_closure() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status IN('completed','cancelled') AND NEW.status!=OLD.status) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM commercial_obligation_reviews r WHERE r.task_id=NEW.id AND r.lease_id=NEW.lease_id AND r.task_version=OLD.version AND r.status='approved' AND r.reviewed_by=NEW.reviewed_by AND r.kind=CASE NEW.status WHEN 'completed' THEN 'completion' ELSE 'cancellation' END)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TASK_REVIEW_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0077_commercial_task_reviewed_closure BEFORE UPDATE ON commercial_lease_tasks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_task_reviewed_closure();

-- commercial_task_no_delete
CREATE FUNCTION pi_compat.commercial_task_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TASK_HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0078_commercial_task_no_delete BEFORE DELETE ON commercial_lease_tasks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_task_no_delete();

-- commercial_closed_task_immutable
CREATE FUNCTION pi_compat.commercial_closed_task_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status IN('completed','cancelled')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CLOSED_TASK_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0079_commercial_closed_task_immutable BEFORE UPDATE ON commercial_lease_tasks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_closed_task_immutable();

-- commercial_assignment_no_delete
CREATE FUNCTION pi_compat.commercial_assignment_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXCEPTION_AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0080_commercial_assignment_no_delete BEFORE DELETE ON commercial_exception_assignments
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_assignment_no_delete();

-- commercial_assignment_no_update
CREATE FUNCTION pi_compat.commercial_assignment_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXCEPTION_AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0081_commercial_assignment_no_update BEFORE UPDATE ON commercial_exception_assignments
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_assignment_no_update();

-- commercial_exception_owner
CREATE FUNCTION pi_compat.commercial_exception_owner() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM commercial_lease_exceptions WHERE id=NEW.exception_id AND status='open') OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=NEW.owner_id AND u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXCEPTION_OWNER_INVALID';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0082_commercial_exception_owner BEFORE INSERT ON commercial_exception_assignments
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_exception_owner();

-- commercial_revision_sequence
CREATE FUNCTION pi_compat.commercial_revision_sequence() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF ((NEW.previous_revision_id IS NULL AND NEW.kind!='commencement') OR (NEW.previous_revision_id IS NOT NULL AND NEW.kind='commencement')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REVISION_SEQUENCE';
  END IF;
  IF (EXISTS(SELECT 1 FROM commercial_lease_revisions p WHERE p.id=NEW.previous_revision_id AND (NEW.effective_at<p.effective_at OR
 (NEW.kind='renewal' AND NEW.starts_at<p.ends_at) OR
 (NEW.kind IN('variation','expiry') AND (p.kind='expiry' OR NEW.starts_at!=p.starts_at)) OR
 (NEW.kind='expiry' AND (NEW.ends_at!=p.ends_at OR NEW.effective_at<p.ends_at))))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REVISION_SEQUENCE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0083_commercial_revision_sequence BEFORE INSERT ON commercial_lease_revisions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_revision_sequence();

-- commercial_charge_overlap
CREATE FUNCTION pi_compat.commercial_charge_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.adjusts_charge_id IS NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (EXISTS(SELECT 1 FROM commercial_lease_charges c JOIN commercial_charge_rules a ON a.id=c.rule_id JOIN commercial_charge_rules b ON b.id=NEW.rule_id
 WHERE c.lease_id=NEW.lease_id AND c.adjusts_charge_id IS NULL AND c.status!='rejected'
 AND (a.rule_json::json #>> '{obligationKey}')=(b.rule_json::json #>> '{obligationKey}')
 AND (a.rule_json::json #>> '{category}')=(b.rule_json::json #>> '{category}')
 AND (c.calculation_json::json #>> '{periodFrom}')<(NEW.calculation_json::json #>> '{periodTo}')
 AND (c.calculation_json::json #>> '{periodTo}')>(NEW.calculation_json::json #>> '{periodFrom}')
 AND (c.status='pending' OR c.total_cents+COALESCE((SELECT sum(total_cents) FROM commercial_lease_charges WHERE adjusts_charge_id=c.id AND status='approved'),0)>0))
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CHARGE_PERIOD_OVERLAP';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0084_commercial_charge_overlap BEFORE INSERT ON commercial_lease_charges
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_charge_overlap();

-- commercial_adjustment_balance
CREATE FUNCTION pi_compat.commercial_adjustment_balance() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved' AND NEW.adjusts_charge_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF ((NEW.calculation_json::jsonb #> '{baseBalance,subtotalCents}') IS DISTINCT FROM to_jsonb((SELECT c.subtotal_cents+COALESCE((SELECT sum(a.subtotal_cents) FROM commercial_lease_charges a WHERE a.adjusts_charge_id=c.id AND a.status='approved'),0) FROM commercial_lease_charges c WHERE c.id=NEW.adjusts_charge_id)) OR
 (NEW.calculation_json::jsonb #> '{baseBalance,gstCents}') IS DISTINCT FROM to_jsonb((SELECT c.gst_cents+COALESCE((SELECT sum(a.gst_cents) FROM commercial_lease_charges a WHERE a.adjusts_charge_id=c.id AND a.status='approved'),0) FROM commercial_lease_charges c WHERE c.id=NEW.adjusts_charge_id)) OR
 (NEW.calculation_json::jsonb #> '{baseBalance,totalCents}') IS DISTINCT FROM to_jsonb((SELECT c.total_cents+COALESCE((SELECT sum(a.total_cents) FROM commercial_lease_charges a WHERE a.adjusts_charge_id=c.id AND a.status='approved'),0) FROM commercial_lease_charges c WHERE c.id=NEW.adjusts_charge_id))
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CHARGE_BALANCE_CHANGED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0085_commercial_adjustment_balance BEFORE UPDATE ON commercial_lease_charges
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_adjustment_balance();

-- commercial_successor_no_delete
CREATE FUNCTION pi_compat.commercial_successor_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TASK_SUCCESSOR_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0086_commercial_successor_no_delete BEFORE DELETE ON commercial_task_successors
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_successor_no_delete();

-- commercial_successor_no_update
CREATE FUNCTION pi_compat.commercial_successor_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TASK_SUCCESSOR_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0087_commercial_successor_no_update BEFORE UPDATE ON commercial_task_successors
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_successor_no_update();

-- commercial_successor_scope
CREATE FUNCTION pi_compat.commercial_successor_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM commercial_lease_tasks p JOIN commercial_lease_tasks s ON s.lease_id=p.lease_id JOIN commercial_obligation_reviews r ON r.task_id=p.id AND r.lease_id=p.lease_id WHERE p.id=NEW.predecessor_id AND s.id=NEW.successor_id AND p.status IN('completed','cancelled') AND s.status='open' AND r.id=NEW.review_id AND r.status='approved' AND r.kind='reopening')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TASK_SUCCESSOR_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0088_commercial_successor_scope BEFORE INSERT ON commercial_task_successors
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_successor_scope();

-- commercial_exception_no_delete
CREATE FUNCTION pi_compat.commercial_exception_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXCEPTION_HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0089_commercial_exception_no_delete BEFORE DELETE ON commercial_lease_exceptions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_exception_no_delete();

-- commercial_exception_resolve
CREATE FUNCTION pi_compat.commercial_exception_resolve() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status!='resolved' OR NEW.resolved_by IS NULL OR NEW.resolved_by=OLD.created_by OR NEW.resolved_at IS NULL OR length(COALESCE(NEW.resolution_reference,''))<8 OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=NEW.resolved_by AND u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXCEPTION_INDEPENDENT_REVIEW';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.resolution_document_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXCEPTION_RESOLUTION_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0090_commercial_exception_resolve BEFORE UPDATE ON commercial_lease_exceptions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_exception_resolve();

-- commercial_exception_immutable
CREATE FUNCTION pi_compat.commercial_exception_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='open' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.lease_id IS DISTINCT FROM OLD.lease_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.charge_id IS DISTINCT FROM OLD.charge_id OR NEW.task_id IS DISTINCT FROM OLD.task_id OR NEW.source_reference IS DISTINCT FROM OLD.source_reference OR NEW.details_envelope IS DISTINCT FROM OLD.details_envelope OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXCEPTION_SOURCE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0091_commercial_exception_immutable BEFORE UPDATE ON commercial_lease_exceptions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_exception_immutable();

-- commercial_exception_insert
CREATE FUNCTION pi_compat.commercial_exception_insert() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status!='open' OR NEW.resolved_by IS NOT NULL OR NEW.resolved_at IS NOT NULL OR NEW.resolution_reference IS NOT NULL OR NEW.resolution_document_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXCEPTION_REVIEW_REQUIRED';
  END IF;
  IF (NEW.charge_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_lease_charges WHERE id=NEW.charge_id AND lease_id=NEW.lease_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXCEPTION_CHARGE_SCOPE';
  END IF;
  IF (NEW.task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_lease_tasks WHERE id=NEW.task_id AND lease_id=NEW.lease_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXCEPTION_TASK_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0092_commercial_exception_insert BEFORE INSERT ON commercial_lease_exceptions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_exception_insert();

-- commercial_revision_advance
CREATE FUNCTION pi_compat.commercial_revision_advance() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  UPDATE commercial_lease_register SET version=version+1,updated_at=NEW.reviewed_at WHERE id=NEW.lease_id AND version=NEW.base_version;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0093_commercial_revision_advance AFTER UPDATE ON commercial_lease_revisions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_revision_advance();

-- commercial_obligation_reviews_no_delete
CREATE FUNCTION pi_compat.commercial_obligation_reviews_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0094_commercial_obligation_reviews_no_delete BEFORE DELETE ON commercial_obligation_reviews
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_obligation_reviews_no_delete();

-- commercial_obligation_reviews_review
CREATE FUNCTION pi_compat.commercial_obligation_reviews_review() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status NOT IN('approved','rejected') OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL OR length(COALESCE(NEW.review_reference,''))<8 OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=NEW.reviewed_by AND u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_INDEPENDENT_REVIEW';
  END IF;
  IF (NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SOURCE_REVOKED';
  END IF;
  IF (NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM commercial_lease_tasks WHERE id=NEW.task_id AND lease_id=NEW.lease_id AND version=NEW.task_version)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OBLIGATION_STALE';
  END IF;
  IF (NEW.status='approved' AND NEW.condition_document_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.condition_document_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONDITION_DOCUMENT_REVOKED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0095_commercial_obligation_reviews_review BEFORE UPDATE ON commercial_obligation_reviews
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_obligation_reviews_review();

-- commercial_obligation_reviews_immutable
CREATE FUNCTION pi_compat.commercial_obligation_reviews_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='pending' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.lease_id IS DISTINCT FROM OLD.lease_id OR NEW.task_id IS DISTINCT FROM OLD.task_id OR NEW.task_version IS DISTINCT FROM OLD.task_version OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id OR NEW.source_reference IS DISTINCT FROM OLD.source_reference OR NEW.condition_document_id IS DISTINCT FROM OLD.condition_document_id OR NEW.work_order_id IS DISTINCT FROM OLD.work_order_id OR NEW.responsibility IS DISTINCT FROM OLD.responsibility OR NEW.details_envelope IS DISTINCT FROM OLD.details_envelope OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SOURCE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0096_commercial_obligation_reviews_immutable BEFORE UPDATE ON commercial_obligation_reviews
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_obligation_reviews_immutable();

-- commercial_obligation_reviews_insert
CREATE FUNCTION pi_compat.commercial_obligation_reviews_insert() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status!='pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reference IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_REVIEW_REQUIRED';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SOURCE_SCOPE';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM commercial_lease_tasks WHERE id=NEW.task_id AND lease_id=NEW.lease_id AND version=NEW.task_version)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OBLIGATION_STALE';
  END IF;
  IF (NEW.condition_document_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.condition_document_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CONDITION_DOCUMENT_SCOPE';
  END IF;
  IF (NEW.work_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_orders w JOIN commercial_lease_register l ON l.id=NEW.lease_id AND l.property_id=w.property_id AND l.client_id=w.client_id WHERE w.id=NEW.work_order_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OBLIGATION_WORK_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0097_commercial_obligation_reviews_insert BEFORE INSERT ON commercial_obligation_reviews
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_obligation_reviews_insert();

-- commercial_lease_charges_no_delete
CREATE FUNCTION pi_compat.commercial_lease_charges_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0098_commercial_lease_charges_no_delete BEFORE DELETE ON commercial_lease_charges
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_lease_charges_no_delete();

-- commercial_lease_charges_review
CREATE FUNCTION pi_compat.commercial_lease_charges_review() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status NOT IN('approved','rejected') OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL OR length(COALESCE(NEW.review_reference,''))<8 OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=NEW.reviewed_by AND u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_INDEPENDENT_REVIEW';
  END IF;
  IF (NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SOURCE_REVOKED';
  END IF;
  IF (NEW.status='approved' AND NEW.adjusts_charge_id IS NOT NULL AND NEW.subtotal_cents+COALESCE((SELECT subtotal_cents FROM commercial_lease_charges WHERE id=NEW.adjusts_charge_id),0)+COALESCE((SELECT sum(subtotal_cents) FROM commercial_lease_charges WHERE adjusts_charge_id=NEW.adjusts_charge_id AND status='approved'),0)<0) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CHARGE_OVER_CREDIT';
  END IF;
  IF (NEW.status='approved' AND NEW.adjusts_charge_id IS NOT NULL AND NEW.gst_cents+COALESCE((SELECT gst_cents FROM commercial_lease_charges WHERE id=NEW.adjusts_charge_id),0)+COALESCE((SELECT sum(gst_cents) FROM commercial_lease_charges WHERE adjusts_charge_id=NEW.adjusts_charge_id AND status='approved'),0)<0) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CHARGE_OVER_CREDIT';
  END IF;
  IF (NEW.status='approved' AND NEW.adjusts_charge_id IS NOT NULL AND NEW.total_cents+COALESCE((SELECT total_cents FROM commercial_lease_charges WHERE id=NEW.adjusts_charge_id),0)+COALESCE((SELECT sum(total_cents) FROM commercial_lease_charges WHERE adjusts_charge_id=NEW.adjusts_charge_id AND status='approved'),0)<0) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CHARGE_OVER_CREDIT';
  END IF;
  IF (NEW.status='approved' AND EXISTS(SELECT 1 FROM commercial_lease_exceptions WHERE lease_id=NEW.lease_id AND status='open' AND kind='disputed_charge' AND charge_id IN(NEW.id,NEW.adjusts_charge_id))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CHARGE_DISPUTED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0099_commercial_lease_charges_review BEFORE UPDATE ON commercial_lease_charges
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_lease_charges_review();

-- commercial_lease_charges_immutable
CREATE FUNCTION pi_compat.commercial_lease_charges_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='pending' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.lease_id IS DISTINCT FROM OLD.lease_id OR NEW.rule_id IS DISTINCT FROM OLD.rule_id OR NEW.adjusts_charge_id IS DISTINCT FROM OLD.adjusts_charge_id OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id OR NEW.source_reference IS DISTINCT FROM OLD.source_reference OR NEW.calculation_json IS DISTINCT FROM OLD.calculation_json OR NEW.calculation_sha256 IS DISTINCT FROM OLD.calculation_sha256 OR NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents OR NEW.gst_cents IS DISTINCT FROM OLD.gst_cents OR NEW.total_cents IS DISTINCT FROM OLD.total_cents OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SOURCE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0100_commercial_lease_charges_immutable BEFORE UPDATE ON commercial_lease_charges
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_lease_charges_immutable();

-- commercial_lease_charges_insert
CREATE FUNCTION pi_compat.commercial_lease_charges_insert() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status!='pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reference IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_REVIEW_REQUIRED';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SOURCE_SCOPE';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM commercial_charge_rules WHERE id=NEW.rule_id AND lease_id=NEW.lease_id AND status='approved')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CHARGE_RULE_SCOPE';
  END IF;
  IF (NEW.adjusts_charge_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commercial_lease_charges WHERE id=NEW.adjusts_charge_id AND lease_id=NEW.lease_id AND status='approved' AND adjusts_charge_id IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CHARGE_ADJUSTMENT_SCOPE';
  END IF;
  IF ((NEW.calculation_json::jsonb #> '{subtotalCents}') IS DISTINCT FROM to_jsonb(NEW.subtotal_cents) OR (NEW.calculation_json::jsonb #> '{gstCents}') IS DISTINCT FROM to_jsonb(NEW.gst_cents) OR (NEW.calculation_json::jsonb #> '{totalCents}') IS DISTINCT FROM to_jsonb(NEW.total_cents)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CHARGE_CALCULATION_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0101_commercial_lease_charges_insert BEFORE INSERT ON commercial_lease_charges
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_lease_charges_insert();

-- commercial_charge_rules_no_delete
CREATE FUNCTION pi_compat.commercial_charge_rules_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0102_commercial_charge_rules_no_delete BEFORE DELETE ON commercial_charge_rules
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_charge_rules_no_delete();

-- commercial_charge_rules_review
CREATE FUNCTION pi_compat.commercial_charge_rules_review() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status NOT IN('approved','rejected') OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL OR length(COALESCE(NEW.review_reference,''))<8 OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=NEW.reviewed_by AND u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_INDEPENDENT_REVIEW';
  END IF;
  IF (NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SOURCE_REVOKED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0103_commercial_charge_rules_review BEFORE UPDATE ON commercial_charge_rules
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_charge_rules_review();

-- commercial_charge_rules_immutable
CREATE FUNCTION pi_compat.commercial_charge_rules_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='pending' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.lease_id IS DISTINCT FROM OLD.lease_id OR NEW.revision_id IS DISTINCT FROM OLD.revision_id OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id OR NEW.source_reference IS DISTINCT FROM OLD.source_reference OR NEW.rule_json IS DISTINCT FROM OLD.rule_json OR NEW.rule_sha256 IS DISTINCT FROM OLD.rule_sha256 OR NEW.details_envelope IS DISTINCT FROM OLD.details_envelope OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SOURCE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0104_commercial_charge_rules_immutable BEFORE UPDATE ON commercial_charge_rules
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_charge_rules_immutable();

-- commercial_charge_rules_insert
CREATE FUNCTION pi_compat.commercial_charge_rules_insert() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status!='pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reference IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_REVIEW_REQUIRED';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SOURCE_SCOPE';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM commercial_lease_revisions WHERE id=NEW.revision_id AND lease_id=NEW.lease_id AND status='approved' AND kind!='expiry')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RULE_REVISION_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0105_commercial_charge_rules_insert BEFORE INSERT ON commercial_charge_rules
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_charge_rules_insert();

-- commercial_lease_revisions_no_delete
CREATE FUNCTION pi_compat.commercial_lease_revisions_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0106_commercial_lease_revisions_no_delete BEFORE DELETE ON commercial_lease_revisions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_lease_revisions_no_delete();

-- commercial_lease_revisions_review
CREATE FUNCTION pi_compat.commercial_lease_revisions_review() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status NOT IN('approved','rejected') OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL OR length(COALESCE(NEW.review_reference,''))<8 OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=NEW.reviewed_by AND u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_INDEPENDENT_REVIEW';
  END IF;
  IF (NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SOURCE_REVOKED';
  END IF;
  IF (NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM commercial_lease_register WHERE id=NEW.lease_id AND version=NEW.base_version)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REVISION_STALE';
  END IF;
  IF (NEW.status='approved' AND NEW.previous_revision_id IS DISTINCT FROM (SELECT id FROM commercial_lease_revisions WHERE lease_id=NEW.lease_id AND status='approved' ORDER BY base_version DESC LIMIT 1)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REVISION_HEAD_CHANGED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0107_commercial_lease_revisions_review BEFORE UPDATE ON commercial_lease_revisions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_lease_revisions_review();

-- commercial_lease_revisions_immutable
CREATE FUNCTION pi_compat.commercial_lease_revisions_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='pending' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.lease_id IS DISTINCT FROM OLD.lease_id OR NEW.base_version IS DISTINCT FROM OLD.base_version OR NEW.previous_revision_id IS DISTINCT FROM OLD.previous_revision_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.effective_at IS DISTINCT FROM OLD.effective_at OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.option_opens_at IS DISTINCT FROM OLD.option_opens_at OR NEW.option_closes_at IS DISTINCT FROM OLD.option_closes_at OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id OR NEW.source_reference IS DISTINCT FROM OLD.source_reference OR NEW.terms_envelope IS DISTINCT FROM OLD.terms_envelope OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SOURCE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0108_commercial_lease_revisions_immutable BEFORE UPDATE ON commercial_lease_revisions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_lease_revisions_immutable();

-- commercial_lease_revisions_insert
CREATE FUNCTION pi_compat.commercial_lease_revisions_insert() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status!='pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.review_reference IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_REVIEW_REQUIRED';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.source_document_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_SOURCE_SCOPE';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM commercial_lease_register WHERE id=NEW.lease_id AND version=NEW.base_version)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REVISION_STALE';
  END IF;
  IF (NEW.previous_revision_id IS DISTINCT FROM (SELECT id FROM commercial_lease_revisions WHERE lease_id=NEW.lease_id AND status='approved' ORDER BY base_version DESC LIMIT 1)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REVISION_HEAD_CHANGED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0109_commercial_lease_revisions_insert BEFORE INSERT ON commercial_lease_revisions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_lease_revisions_insert();

-- rental_reference_check_immutable_delete
CREATE FUNCTION pi_compat.rental_reference_check_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM rental_application_purge_permits p WHERE p.application_id=OLD.application_id)) IS NOT TRUE THEN RETURN OLD; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_REFERENCE_CHECK_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0110_rental_reference_check_immutable_delete BEFORE DELETE ON rental_application_reference_checks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_reference_check_immutable_delete();

-- rental_reference_check_immutable_update
CREATE FUNCTION pi_compat.rental_reference_check_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_REFERENCE_CHECK_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0111_rental_reference_check_immutable_update BEFORE UPDATE ON rental_application_reference_checks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_reference_check_immutable_update();

-- rental_reference_check_applicant_guard
CREATE FUNCTION pi_compat.rental_reference_check_applicant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM rental_applicants a
  WHERE a.id=NEW.applicant_id AND a.application_id=NEW.application_id AND a.state='complete')
 OR NOT EXISTS(SELECT 1 FROM rental_applications r WHERE r.id=NEW.application_id AND r.status IN('submitted','ready_for_handoff'))) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_REFERENCE_APPLICANT_OR_STATUS_INVALID';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0112_rental_reference_check_applicant_guard BEFORE INSERT ON rental_application_reference_checks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_reference_check_applicant_guard();

-- stripe_subscription_risk_hold_immutable
CREATE FUNCTION pi_compat.stripe_subscription_risk_hold_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.stripe_invoice_id!=OLD.stripe_invoice_id OR NEW.stripe_subscription_id!=OLD.stripe_subscription_id
 OR NEW.stripe_customer_id!=OLD.stripe_customer_id OR NEW.charge_id!=OLD.charge_id
 OR NEW.reason!=OLD.reason OR NEW.created_at!=OLD.created_at) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SUBSCRIPTION_RISK_IDENTITY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0113_stripe_subscription_risk_hold_immutable BEFORE UPDATE ON stripe_subscription_risk_holds
  FOR EACH ROW EXECUTE FUNCTION pi_compat.stripe_subscription_risk_hold_immutable();

-- stripe_subscription_invoice_identity
CREATE FUNCTION pi_compat.stripe_subscription_invoice_identity() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.stripe_subscription_id!=OLD.stripe_subscription_id OR NEW.stripe_customer_id!=OLD.stripe_customer_id
 OR (OLD.price_id!='unverified' AND NEW.price_id NOT IN(OLD.price_id,'unverified')) OR NEW.invoice_created!=OLD.invoice_created) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STRIPE_INVOICE_IDENTITY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0114_stripe_subscription_invoice_identity BEFORE UPDATE ON stripe_subscription_invoice_observations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.stripe_subscription_invoice_identity();

-- pcr_redemption_no_delete
CREATE FUNCTION pi_compat.pcr_redemption_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PCR redemption history is immutable';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0115_pcr_redemption_no_delete BEFORE DELETE ON pcr_routine_discount_redemptions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.pcr_redemption_no_delete();

-- pcr_redemption_no_update
CREATE FUNCTION pi_compat.pcr_redemption_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PCR redemption history is immutable';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0116_pcr_redemption_no_update BEFORE UPDATE ON pcr_routine_discount_redemptions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.pcr_redemption_no_update();

-- pcr_reservation_no_delete
CREATE FUNCTION pi_compat.pcr_reservation_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PCR reservation history is immutable';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0117_pcr_reservation_no_delete BEFORE DELETE ON pcr_discount_reservations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.pcr_reservation_no_delete();

-- pcr_reservation_settle
CREATE FUNCTION pi_compat.pcr_reservation_settle() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status='reserved' AND NEW.status='redeemed') IS NOT TRUE THEN RETURN NEW; END IF;
  INSERT INTO pcr_routine_discount_redemptions(id,entitlement_id,payment_id,discount_cents,created_at)
 VALUES(NEW.id,NEW.entitlement_id,NEW.payment_id,NEW.discount_cents,NEW.updated_at);
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0118_pcr_reservation_settle AFTER UPDATE OF status ON pcr_discount_reservations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.pcr_reservation_settle();

-- pcr_reservation_release
CREATE FUNCTION pi_compat.pcr_reservation_release() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status='reserved' AND NEW.status='released') IS NOT TRUE THEN RETURN NEW; END IF;
  UPDATE pcr_routine_discount_entitlements SET uses_remaining=uses_remaining+1,updated_at=NEW.updated_at WHERE id=NEW.entitlement_id;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0119_pcr_reservation_release AFTER UPDATE OF status ON pcr_discount_reservations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.pcr_reservation_release();

-- pcr_reservation_update_guard
CREATE FUNCTION pi_compat.pcr_reservation_update_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.id!=OLD.id OR NEW.entitlement_id!=OLD.entitlement_id OR NEW.guest_order_id!=OLD.guest_order_id
 OR NEW.payment_id!=OLD.payment_id OR NEW.property_id!=OLD.property_id OR NEW.base_ex_gst_cents!=OLD.base_ex_gst_cents
 OR NEW.base_gst_cents!=OLD.base_gst_cents OR NEW.discount_cents!=OLD.discount_cents OR NEW.total_cents!=OLD.total_cents
 OR NEW.created_at!=OLD.created_at) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PCR reservation identity is immutable';
  END IF;
  IF (NEW.status!=OLD.status AND NOT (OLD.status='reserved' AND NEW.status IN('redeemed','released','exception'))
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PCR reservation transition denied';
  END IF;
  IF (NEW.status='released' AND OLD.status!='released' AND (
 EXISTS(SELECT 1 FROM payment_checkout_attempts a WHERE a.payment_id=OLD.payment_id)
 OR NOT EXISTS(SELECT 1 FROM payments p JOIN guest_service_orders g ON g.id=OLD.guest_order_id
 WHERE p.id=OLD.payment_id AND p.status IN('payment_required','failed') AND g.status='cancelled')
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PCR pending financial outcome requires review';
  END IF;
  IF (NEW.status='redeemed' AND OLD.status!='redeemed' AND NOT EXISTS(
 SELECT 1 FROM payments p WHERE p.id=OLD.payment_id AND p.status='paid' AND p.provider='stripe' AND p.total_cents=OLD.total_cents
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PCR redemption requires verified settlement';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0120_pcr_reservation_update_guard BEFORE UPDATE ON pcr_discount_reservations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.pcr_reservation_update_guard();

-- pcr_reservation_decrement
CREATE FUNCTION pi_compat.pcr_reservation_decrement() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  UPDATE pcr_routine_discount_entitlements SET uses_remaining=uses_remaining-1,updated_at=NEW.created_at WHERE id=NEW.entitlement_id;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0121_pcr_reservation_decrement AFTER INSERT ON pcr_discount_reservations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.pcr_reservation_decrement();

-- pcr_reservation_guard
CREATE FUNCTION pi_compat.pcr_reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status!='reserved' OR NEW.discount_cents!=CAST(((NEW.base_ex_gst_cents+NEW.base_gst_cents)*2000+5000)/10000 AS BIGINT)
 OR NOT EXISTS(
 SELECT 1 FROM pcr_routine_discount_entitlements e
 JOIN guest_service_orders source ON source.id=e.guest_order_id
 JOIN payments paid ON paid.id=e.source_payment_id
 JOIN guest_service_orders target ON target.id=NEW.guest_order_id
 JOIN bookings b ON b.id=target.booking_id
 JOIN payments payment ON payment.id=NEW.payment_id
 JOIN work_orders w ON w.id=payment.work_order_id AND w.booking_id=b.id
 WHERE e.id=NEW.entitlement_id AND e.status='active' AND e.uses_remaining>0
 AND source.property_id=NEW.property_id AND source.status='confirmed' AND source.offer_code='pcr100'
 AND target.property_id=NEW.property_id AND target.verified_at IS NOT NULL AND target.status='confirmed'
 AND target.purchaser_email_hash=e.purchaser_email_hash AND target.service_id='routine-inspection'
 AND target.sector='residential' AND target.offer_code IS NULL
 AND paid.status='paid' AND paid.refunded_cents=0
 AND NOT EXISTS(SELECT 1 FROM payment_disputes d WHERE d.payment_id=paid.id)
 AND b.status='confirmed' AND b.service_id='routine-inspection' AND w.status='scheduled'
 AND payment.status='payment_required' AND payment.property_id=NEW.property_id AND payment.total_cents=NEW.total_cents
 AND payment.amount_ex_gst_cents=CAST((NEW.base_ex_gst_cents*8000+5000)/10000 AS BIGINT)
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PCR discount unavailable or inconsistent';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0122_pcr_reservation_guard BEFORE INSERT ON pcr_discount_reservations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.pcr_reservation_guard();

-- pcr_entitlement_no_delete
CREATE FUNCTION pi_compat.pcr_entitlement_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PCR benefit history is immutable';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0123_pcr_entitlement_no_delete BEFORE DELETE ON pcr_routine_discount_entitlements
  FOR EACH ROW EXECUTE FUNCTION pi_compat.pcr_entitlement_no_delete();

-- pcr_entitlement_identity_immutable
CREATE FUNCTION pi_compat.pcr_entitlement_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.id!=OLD.id OR NEW.guest_order_id!=OLD.guest_order_id OR NEW.purchaser_email_hash!=OLD.purchaser_email_hash
 OR NEW.source_payment_id IS DISTINCT FROM OLD.source_payment_id OR NEW.discount_basis_points!=OLD.discount_basis_points
 OR NEW.created_at!=OLD.created_at OR (OLD.status='suspended' AND NEW.status!='suspended')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PCR entitlement identity is immutable';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0124_pcr_entitlement_identity_immutable BEFORE UPDATE ON pcr_routine_discount_entitlements
  FOR EACH ROW EXECUTE FUNCTION pi_compat.pcr_entitlement_identity_immutable();

-- pcr_entitlement_source_guard
CREATE FUNCTION pi_compat.pcr_entitlement_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM guest_service_orders g JOIN work_orders w ON w.booking_id=g.booking_id
 JOIN payments p ON p.work_order_id=w.id
 WHERE g.id=NEW.guest_order_id AND g.offer_code='pcr100' AND g.status='confirmed'
 AND g.verified_at IS NOT NULL AND g.purchaser_email_hash=NEW.purchaser_email_hash
 AND p.id=NEW.source_payment_id AND p.status='paid' AND p.provider='stripe' AND p.refunded_cents=0
 AND NOT EXISTS(SELECT 1 FROM payment_disputes d WHERE d.payment_id=p.id)
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PCR paid source required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0125_pcr_entitlement_source_guard BEFORE INSERT ON pcr_routine_discount_entitlements
  FOR EACH ROW EXECUTE FUNCTION pi_compat.pcr_entitlement_source_guard();

-- owner_invitation_no_delete
CREATE FUNCTION pi_compat.owner_invitation_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OWNER_INVITATION_AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0126_owner_invitation_no_delete BEFORE DELETE ON agency_owner_invitations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.owner_invitation_no_delete();

-- owner_invitation_approval
CREATE FUNCTION pi_compat.owner_invitation_approval() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved' AND OLD.status='claimed') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.invited_by OR NEW.reviewed_by=OLD.claimed_by OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles s ON s.user_id=u.id AND s.active=1 AND s.role IN('administrator','operations_manager') WHERE u.id=NEW.reviewed_by AND u.active=1 AND u.verified_at IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INDEPENDENT_OWNER_REVIEW';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM agency_owner_grants g WHERE g.id=NEW.grant_id AND g.agency_client_id=NEW.agency_client_id AND g.property_id=NEW.property_id AND g.management_id=NEW.management_id AND g.owner_user_id=NEW.claimed_by AND g.verified_by=NEW.reviewed_by AND g.allow_reports=NEW.allow_reports AND g.allow_inspections=NEW.allow_inspections AND g.revoked_at IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OWNER_INVITATION_GRANT_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0127_owner_invitation_approval BEFORE UPDATE ON agency_owner_invitations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.owner_invitation_approval();

-- owner_invitation_immutable
CREATE FUNCTION pi_compat.owner_invitation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.agency_client_id!=OLD.agency_client_id OR NEW.property_id!=OLD.property_id OR NEW.management_id!=OLD.management_id OR NEW.token_hash!=OLD.token_hash OR NEW.email_hash!=OLD.email_hash OR NEW.recipient_envelope!=OLD.recipient_envelope OR NEW.allow_inspections!=OLD.allow_inspections OR NEW.allow_reports!=OLD.allow_reports OR NEW.invited_by!=OLD.invited_by OR NEW.expires_at!=OLD.expires_at OR NEW.authority_reference!=OLD.authority_reference) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OWNER_INVITATION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0128_owner_invitation_immutable BEFORE UPDATE ON agency_owner_invitations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.owner_invitation_immutable();

-- owner_invitation_scope
CREATE FUNCTION pi_compat.owner_invitation_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM property_management_relationships m JOIN clients c ON c.id=m.manager_client_id AND c.client_type='agency' AND c.status='active' JOIN client_entitlements e ON e.client_id=c.id AND e.workspace_kind='property-manager' AND e.active=1 AND e.approved_by IS NOT NULL WHERE m.id=NEW.management_id AND m.property_id=NEW.property_id AND m.manager_client_id=NEW.agency_client_id AND m.mode='agency_managed' AND m.starts_at<=NEW.created_at AND (m.ends_at IS NULL OR m.ends_at>NEW.created_at))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENCY_INVITATION_SCOPE';
  END IF;
  IF (EXISTS(SELECT 1 FROM agency_owner_invitations i WHERE i.agency_client_id=NEW.agency_client_id AND i.property_id=NEW.property_id AND i.email_hash=NEW.email_hash AND i.status IN('pending','claimed') AND i.expires_at>NEW.created_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OWNER_INVITATION_PENDING';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0129_owner_invitation_scope BEFORE INSERT ON agency_owner_invitations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.owner_invitation_scope();

-- commercial_events_no_delete
CREATE FUNCTION pi_compat.commercial_events_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEASE_AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0130_commercial_events_no_delete BEFORE DELETE ON commercial_lease_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_events_no_delete();

-- commercial_events_no_update
CREATE FUNCTION pi_compat.commercial_events_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEASE_AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0131_commercial_events_no_update BEFORE UPDATE ON commercial_lease_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_events_no_update();

-- commercial_task_completion
CREATE FUNCTION pi_compat.commercial_task_completion() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='completed' AND OLD.status!='completed') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL OR length(COALESCE(NEW.completion_reference,''))<8 OR NEW.completion_document_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_COMPLETION_EVIDENCE';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM commercial_lease_register l JOIN documents d ON d.property_id=l.property_id JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=l.client_id WHERE l.id=NEW.lease_id AND d.id=NEW.completion_document_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_DOCUMENT_SCOPE';
  END IF;
  IF (NEW.work_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_orders w JOIN commercial_lease_register l ON l.property_id=w.property_id AND l.client_id=w.client_id WHERE l.id=NEW.lease_id AND w.id=NEW.work_order_id AND w.status='completed')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_WORK_UNFINISHED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0132_commercial_task_completion BEFORE UPDATE ON commercial_lease_tasks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_task_completion();

-- commercial_task_source_immutable
CREATE FUNCTION pi_compat.commercial_task_source_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.lease_id!=OLD.lease_id OR NEW.kind!=OLD.kind OR NEW.title!=OLD.title OR NEW.due_at!=OLD.due_at OR NEW.details_envelope!=OLD.details_envelope OR NEW.work_order_id IS DISTINCT FROM OLD.work_order_id OR NEW.created_by!=OLD.created_by) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEASE_TASK_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0133_commercial_task_source_immutable BEFORE UPDATE ON commercial_lease_tasks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_task_source_immutable();

-- commercial_lease_immutable
CREATE FUNCTION pi_compat.commercial_lease_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.property_id!=OLD.property_id OR NEW.client_id!=OLD.client_id OR NEW.reference!=OLD.reference OR NEW.starts_at!=OLD.starts_at OR NEW.ends_at!=OLD.ends_at OR NEW.details_envelope!=OLD.details_envelope OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEASE_SOURCE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0134_commercial_lease_immutable BEFORE UPDATE ON commercial_lease_register
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_lease_immutable();

-- commercial_lease_scope
CREATE FUNCTION pi_compat.commercial_lease_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM properties p JOIN client_property_links l ON l.property_id=p.id AND l.client_id=NEW.client_id AND l.starts_at<=NEW.created_at AND (l.ends_at IS NULL OR l.ends_at>NEW.created_at) WHERE p.id=NEW.property_id AND p.sector='commercial')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COMMERCIAL_LEASE_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0135_commercial_lease_scope BEFORE INSERT ON commercial_lease_register
  FOR EACH ROW EXECUTE FUNCTION pi_compat.commercial_lease_scope();

-- release_no_delete
CREATE FUNCTION pi_compat.release_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0136_release_no_delete BEFORE DELETE ON feature_release_approvals
  FOR EACH ROW EXECUTE FUNCTION pi_compat.release_no_delete();

-- release_independent_reviewer
CREATE FUNCTION pi_compat.release_independent_reviewer() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.reviewed_by=NEW.requested_by OR NOT EXISTS(SELECT 1 FROM staff_profiles s JOIN users u ON u.id=s.user_id WHERE s.user_id=NEW.reviewed_by AND s.role='administrator' AND s.active=1 AND u.active=1 AND u.verified_at IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RELEASE_REVIEWER_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0137_release_independent_reviewer BEFORE UPDATE OF status ON feature_release_approvals
  FOR EACH ROW EXECUTE FUNCTION pi_compat.release_independent_reviewer();

-- release_approval_transition
CREATE FUNCTION pi_compat.release_approval_transition() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT((OLD.status='requested' AND NEW.status IN('approved','rejected')) OR (OLD.status='approved' AND NEW.status='revoked'))) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RELEASE_STATUS_INVALID';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0138_release_approval_transition BEFORE UPDATE OF status ON feature_release_approvals
  FOR EACH ROW EXECUTE FUNCTION pi_compat.release_approval_transition();

-- release_approval_scope_immutable
CREATE FUNCTION pi_compat.release_approval_scope_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RELEASE_SCOPE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0139_release_approval_scope_immutable BEFORE UPDATE OF feature,environment,source_sha,evidence_reference,expires_at,requested_by,requested_at ON feature_release_approvals
  FOR EACH ROW EXECUTE FUNCTION pi_compat.release_approval_scope_immutable();

-- sale_variant_no_delete
CREATE FUNCTION pi_compat.sale_variant_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PRICE_AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0140_sale_variant_no_delete BEFORE DELETE ON service_sale_variants
  FOR EACH ROW EXECUTE FUNCTION pi_compat.sale_variant_no_delete();

-- sale_variant_status
CREATE FUNCTION pi_compat.sale_variant_status() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT((OLD.status='draft' AND NEW.status IN('approved','withdrawn')) OR (OLD.status='approved' AND NEW.status='withdrawn'))) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PRICE_STATUS_INVALID';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0141_sale_variant_status BEFORE UPDATE ON service_sale_variants
  FOR EACH ROW EXECUTE FUNCTION pi_compat.sale_variant_status();

-- sale_variant_approval
CREATE FUNCTION pi_compat.sale_variant_approval() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved' AND OLD.status='draft') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.approved_by=OLD.created_by OR NEW.approved_at IS NULL OR length(COALESCE(NEW.approval_reference,''))<8 OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1 AND sp.role='administrator' WHERE u.id=NEW.approved_by AND u.active=1 AND u.verified_at IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INDEPENDENT_PRICE_APPROVAL_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0142_sale_variant_approval BEFORE UPDATE ON service_sale_variants
  FOR EACH ROW EXECUTE FUNCTION pi_compat.sale_variant_approval();

-- sale_variant_immutable
CREATE FUNCTION pi_compat.sale_variant_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.service_id!=OLD.service_id OR NEW.source_code!=OLD.source_code OR NEW.source_version!=OLD.source_version OR NEW.source_fee!=OLD.source_fee OR NEW.label!=OLD.label OR NEW.scope_text!=OLD.scope_text OR NEW.scope_sha256!=OLD.scope_sha256 OR NEW.unit_ex_gst_cents!=OLD.unit_ex_gst_cents OR NEW.minimum_cents!=OLD.minimum_cents OR NEW.quantity_allowed!=OLD.quantity_allowed OR NEW.gst_basis_points!=OLD.gst_basis_points OR NEW.postcodes_json!=OLD.postcodes_json OR NEW.property_types_json!=OLD.property_types_json OR NEW.starts_at!=OLD.starts_at OR NEW.expires_at!=OLD.expires_at OR NEW.payment_policy!=OLD.payment_policy OR NEW.created_by!=OLD.created_by OR NEW.created_at!=OLD.created_at) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PRICE_SCOPE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0143_sale_variant_immutable BEFORE UPDATE ON service_sale_variants
  FOR EACH ROW EXECUTE FUNCTION pi_compat.sale_variant_immutable();

-- council_response_history_no_delete
CREATE FUNCTION pi_compat.council_response_history_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COUNCIL_HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0144_council_response_history_no_delete BEFORE DELETE ON council_response_history
  FOR EACH ROW EXECUTE FUNCTION pi_compat.council_response_history_no_delete();

-- council_response_history_no_update
CREATE FUNCTION pi_compat.council_response_history_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COUNCIL_HISTORY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0145_council_response_history_no_update BEFORE UPDATE ON council_response_history
  FOR EACH ROW EXECUTE FUNCTION pi_compat.council_response_history_no_update();

-- council_response_update_history
CREATE FUNCTION pi_compat.council_response_update_history() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  INSERT INTO council_response_history(approval_id,user_id,membership_id,response,comment,created_at) VALUES(NEW.approval_id,NEW.user_id,NEW.membership_id,NEW.response,NEW.comment,NEW.created_at);
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0146_council_response_update_history AFTER UPDATE ON council_responses
  FOR EACH ROW EXECUTE FUNCTION pi_compat.council_response_update_history();

-- council_response_insert_history
CREATE FUNCTION pi_compat.council_response_insert_history() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  INSERT INTO council_response_history(approval_id,user_id,membership_id,response,comment,created_at) VALUES(NEW.approval_id,NEW.user_id,NEW.membership_id,NEW.response,NEW.comment,NEW.created_at);
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0147_council_response_insert_history AFTER INSERT ON council_responses
  FOR EACH ROW EXECUTE FUNCTION pi_compat.council_response_insert_history();

-- council_declaration_no_delete
CREATE FUNCTION pi_compat.council_declaration_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COUNCIL_HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0148_council_declaration_no_delete BEFORE DELETE ON council_conflict_declarations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.council_declaration_no_delete();

-- council_declaration_no_update
CREATE FUNCTION pi_compat.council_declaration_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COUNCIL_HISTORY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0149_council_declaration_no_update BEFORE UPDATE ON council_conflict_declarations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.council_declaration_no_update();

-- council_declaration_scope
CREATE FUNCTION pi_compat.council_declaration_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM approvals a JOIN scheme_memberships m ON m.scheme_id=a.scheme_id AND m.user_id=NEW.user_id AND m.role='council_member' AND m.starts_at<=NEW.declared_at AND (m.ends_at IS NULL OR m.ends_at>NEW.declared_at) WHERE a.id=NEW.approval_id AND a.decision_scope='council' AND a.status='pending')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'COUNCIL_DECLARATION_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0150_council_declaration_scope BEFORE INSERT ON council_conflict_declarations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.council_declaration_scope();

-- notice_supersession_no_delete
CREATE FUNCTION pi_compat.notice_supersession_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'NOTICE_HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0151_notice_supersession_no_delete BEFORE DELETE ON notice_supersessions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.notice_supersession_no_delete();

-- notice_supersession_no_update
CREATE FUNCTION pi_compat.notice_supersession_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'NOTICE_HISTORY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0152_notice_supersession_no_update BEFORE UPDATE ON notice_supersessions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.notice_supersession_no_update();

-- notice_history_no_delete
CREATE FUNCTION pi_compat.notice_history_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'NOTICE_HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0153_notice_history_no_delete BEFORE DELETE ON notice_revision_history
  FOR EACH ROW EXECUTE FUNCTION pi_compat.notice_history_no_delete();

-- notice_history_no_update
CREATE FUNCTION pi_compat.notice_history_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'NOTICE_HISTORY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0154_notice_history_no_update BEFORE UPDATE ON notice_revision_history
  FOR EACH ROW EXECUTE FUNCTION pi_compat.notice_history_no_update();

-- notice_update_history
CREATE FUNCTION pi_compat.notice_update_history() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.version!=OLD.version) IS NOT TRUE THEN RETURN NEW; END IF;
  INSERT INTO notice_revision_history VALUES(NEW.id,NEW.version,NEW.title,NEW.body,NEW.audience,NEW.starts_at,NEW.expires_at,NEW.withdrawn_at,pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0155_notice_update_history AFTER UPDATE ON building_notices
  FOR EACH ROW EXECUTE FUNCTION pi_compat.notice_update_history();

-- notice_insert_history
CREATE FUNCTION pi_compat.notice_insert_history() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  INSERT INTO notice_revision_history VALUES(NEW.id,NEW.version,NEW.title,NEW.body,NEW.audience,NEW.starts_at,NEW.expires_at,NEW.withdrawn_at,pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0156_notice_insert_history AFTER INSERT ON building_notices
  FOR EACH ROW EXECUTE FUNCTION pi_compat.notice_insert_history();

-- notice_supersession_scope
CREATE FUNCTION pi_compat.notice_supersession_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM building_notices old JOIN building_notices next ON next.scheme_id=old.scheme_id WHERE old.id=NEW.old_notice_id AND next.id=NEW.new_notice_id AND old.withdrawn_at IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'NOTICE_REVISION_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0157_notice_supersession_scope BEFORE INSERT ON notice_supersessions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.notice_supersession_scope();

-- notice_draft_review
CREATE FUNCTION pi_compat.notice_draft_review() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='submitted' OR NEW.status NOT IN('published','rejected') OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL OR length(COALESCE(NEW.review_reference,''))<8 OR (NEW.status='published' AND NEW.notice_id IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INDEPENDENT_NOTICE_REVIEW_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0158_notice_draft_review BEFORE UPDATE ON building_notice_drafts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.notice_draft_review();

-- notice_draft_immutable
CREATE FUNCTION pi_compat.notice_draft_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.building_id!=OLD.building_id OR NEW.scheme_id!=OLD.scheme_id OR NEW.title!=OLD.title OR NEW.body!=OLD.body OR NEW.audience!=OLD.audience OR NEW.content_sha256!=OLD.content_sha256 OR NEW.starts_at!=OLD.starts_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_by!=OLD.created_by OR NEW.created_at!=OLD.created_at) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'NOTICE_DRAFT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0159_notice_draft_immutable BEFORE UPDATE ON building_notice_drafts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.notice_draft_immutable();

-- notice_draft_building_scope
CREATE FUNCTION pi_compat.notice_draft_building_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM scheme_buildings WHERE id=NEW.building_id AND scheme_id=NEW.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'NOTICE_BUILDING_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0160_notice_draft_building_scope BEFORE INSERT ON building_notice_drafts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.notice_draft_building_scope();

-- building_report_scope
CREATE FUNCTION pi_compat.building_report_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM documents d JOIN scheme_buildings b ON b.id=NEW.building_id WHERE d.id=NEW.document_id AND d.status='issued' AND d.tenancy_id IS NULL AND d.category IN('service_report','building_report','common_property_report') AND (d.property_id=b.property_id OR (d.property_id IS NULL AND d.scheme_id=b.scheme_id)))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILDING_REPORT_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0161_building_report_scope BEFORE INSERT ON building_report_grants
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_report_scope();

-- building_move_identity
CREATE FUNCTION pi_compat.building_move_identity() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILDING_MOVE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0162_building_move_identity BEFORE UPDATE OF building_id,lot_id,requester_id,kind,starts_at,ends_at ON building_move_requests
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_move_identity();

-- building_move_lot
CREATE FUNCTION pi_compat.building_move_lot() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM strata_lots l JOIN scheme_memberships m ON m.lot_id=l.id WHERE l.id=NEW.lot_id AND l.building_id=NEW.building_id AND m.user_id=NEW.requester_id AND m.role IN('owner','resident') AND m.starts_at<=NEW.created_at AND (m.ends_at IS NULL OR m.ends_at>NEW.created_at))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILDING_MOVE_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0163_building_move_lot BEFORE INSERT ON building_move_requests
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_move_lot();

-- building_event_no_delete
CREATE FUNCTION pi_compat.building_event_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0164_building_event_no_delete BEFORE DELETE ON building_operational_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_event_no_delete();

-- building_event_no_update
CREATE FUNCTION pi_compat.building_event_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0165_building_event_no_update BEFORE UPDATE ON building_operational_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_event_no_update();

-- building_item_work_scope
CREATE FUNCTION pi_compat.building_item_work_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.work_order_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM work_orders w JOIN scheme_buildings b ON b.id=NEW.building_id WHERE w.id=NEW.work_order_id AND w.scheme_id=b.scheme_id AND w.request_id=NEW.request_id AND w.property_id IS NOT DISTINCT FROM b.property_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILDING_WORK_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0166_building_item_work_scope BEFORE UPDATE OF work_order_id ON building_operational_items
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_item_work_scope();

-- building_item_completion
CREATE FUNCTION pi_compat.building_item_completion() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='completed') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (OLD.status!='awaiting_review' OR NEW.completed_by=OLD.last_action_by OR NEW.completed_by=OLD.requester_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILDING_COMPLETION_REVIEW';
  END IF;
  IF (NEW.work_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_orders w JOIN scheme_buildings b ON b.id=NEW.building_id WHERE w.id=NEW.work_order_id AND w.status='completed' AND w.scheme_id=b.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILDING_CANONICAL_WORK_INCOMPLETE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0167_building_item_completion BEFORE UPDATE OF status ON building_operational_items
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_item_completion();

-- building_item_identity
CREATE FUNCTION pi_compat.building_item_identity() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILDING_ITEM_IDENTITY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0168_building_item_identity BEFORE UPDATE OF building_id,asset_id,requester_id,kind,details_envelope,created_at ON building_operational_items
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_item_identity();

-- building_item_asset
CREATE FUNCTION pi_compat.building_item_asset() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.asset_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM building_asset_links WHERE asset_id=NEW.asset_id AND building_id=NEW.building_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILDING_ASSET_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0169_building_item_asset BEFORE INSERT ON building_operational_items
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_item_asset();

-- building_asset_immutable
CREATE FUNCTION pi_compat.building_asset_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILDING_ASSET_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0170_building_asset_immutable BEFORE UPDATE ON building_asset_links
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_asset_immutable();

-- building_asset_scope
CREATE FUNCTION pi_compat.building_asset_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM v2_assets a JOIN scheme_buildings b ON b.id=NEW.building_id WHERE a.id=NEW.asset_id AND a.status='active' AND ((a.scheme_id=b.scheme_id AND a.property_id IS NULL) OR (a.property_id=b.property_id AND a.scheme_id IS NULL)))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILDING_ASSET_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0171_building_asset_scope BEFORE INSERT ON building_asset_links
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_asset_scope();

-- building_assignment_no_delete
CREATE FUNCTION pi_compat.building_assignment_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0172_building_assignment_no_delete BEFORE DELETE ON building_manager_assignments
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_assignment_no_delete();

-- building_assignment_approval
CREATE FUNCTION pi_compat.building_assignment_approval() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (OLD.status!='pending' OR NEW.approved_by=NEW.requested_by OR NEW.approved_by=NEW.user_id OR NOT EXISTS(SELECT 1 FROM staff_profiles s JOIN users u ON u.id=s.user_id WHERE s.user_id=NEW.approved_by AND s.role IN('administrator','operations_manager') AND s.active=1 AND u.active=1 AND u.verified_at IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILDING_ASSIGNMENT_REVIEW_REQUIRED';
  END IF;
  IF (EXISTS(SELECT 1 FROM building_manager_assignments a WHERE a.id!=NEW.id AND a.building_id=NEW.building_id AND a.user_id=NEW.user_id AND a.status='approved' AND a.starts_at<NEW.ends_at AND a.ends_at>NEW.starts_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILDING_ASSIGNMENT_OVERLAP';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0173_building_assignment_approval BEFORE UPDATE OF status ON building_manager_assignments
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_assignment_approval();

-- building_assignment_identity
CREATE FUNCTION pi_compat.building_assignment_identity() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILDING_ASSIGNMENT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0174_building_assignment_identity BEFORE UPDATE OF building_id,user_id,client_id,starts_at,ends_at,authority_reference,requested_by,created_at ON building_manager_assignments
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_assignment_identity();

-- building_assignment_scope
CREATE FUNCTION pi_compat.building_assignment_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM scheme_buildings b JOIN scheme_client_links l ON l.scheme_id=b.scheme_id JOIN clients c ON c.id=l.client_id WHERE b.id=NEW.building_id AND l.client_id=NEW.client_id AND l.role IN('strata_manager','building_manager') AND c.status='active' AND l.starts_at<=NEW.starts_at AND (l.ends_at IS NULL OR l.ends_at>=NEW.ends_at))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BUILDING_AUTHORITY_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0175_building_assignment_scope BEFORE INSERT ON building_manager_assignments
  FOR EACH ROW EXECUTE FUNCTION pi_compat.building_assignment_scope();

-- legal_receipt_no_delete
CREATE FUNCTION pi_compat.legal_receipt_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0176_legal_receipt_no_delete BEFORE DELETE ON legal_acceptance_receipts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.legal_receipt_no_delete();

-- legal_receipt_no_update
CREATE FUNCTION pi_compat.legal_receipt_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0177_legal_receipt_no_update BEFORE UPDATE ON legal_acceptance_receipts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.legal_receipt_no_update();

-- legal_receipt_current
CREATE FUNCTION pi_compat.legal_receipt_current() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM legal_document_versions v WHERE v.id=NEW.document_id AND v.content_sha256=NEW.content_sha256 AND v.status='approved' AND v.effective_at<=NEW.created_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEGAL_VERSION_CHANGED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0178_legal_receipt_current BEFORE INSERT ON legal_acceptance_receipts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.legal_receipt_current();

-- legal_independent_approval
CREATE FUNCTION pi_compat.legal_independent_approval() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM staff_profiles s JOIN users u ON u.id=s.user_id WHERE s.user_id=NEW.approved_by AND s.role='administrator' AND s.active=1 AND u.active=1 AND u.verified_at IS NOT NULL) OR NEW.approved_by=NEW.created_by) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEGAL_APPROVER_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0179_legal_independent_approval BEFORE UPDATE OF status ON legal_document_versions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.legal_independent_approval();

-- legal_status_transition
CREATE FUNCTION pi_compat.legal_status_transition() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT((OLD.status='draft' AND NEW.status IN('approved','withdrawn')) OR (OLD.status='approved' AND NEW.status='withdrawn'))) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEGAL_STATUS_INVALID';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0180_legal_status_transition BEFORE UPDATE OF status ON legal_document_versions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.legal_status_transition();

-- legal_version_no_delete
CREATE FUNCTION pi_compat.legal_version_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEGAL_VERSION_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0181_legal_version_no_delete BEFORE DELETE ON legal_document_versions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.legal_version_no_delete();

-- legal_text_immutable
CREATE FUNCTION pi_compat.legal_text_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEGAL_VERSION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0182_legal_text_immutable BEFORE UPDATE OF document_key,version_label,title,body_json,content_sha256,created_by,created_at ON legal_document_versions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.legal_text_immutable();

-- approved_statement_immutable
CREATE FUNCTION pi_compat.approved_statement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'APPROVED_STATEMENT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0183_approved_statement_immutable BEFORE UPDATE ON agency_monthly_statements
  FOR EACH ROW EXECUTE FUNCTION pi_compat.approved_statement_immutable();

-- statement_approval_integrity
CREATE FUNCTION pi_compat.statement_approval_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved' AND OLD.status='draft') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.approved_by=OLD.prepared_by OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1 AND sp.role IN('administrator','operations_manager') WHERE u.id=NEW.approved_by AND u.active=1 AND u.verified_at IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INDEPENDENT_STATEMENT_REVIEW';
  END IF;
  IF (NEW.subtotal_cents!=COALESCE((SELECT sum(amount_cents) FROM agency_statement_lines WHERE statement_id=NEW.id),-1)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STATEMENT_LINE_TOTAL_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0184_statement_approval_integrity BEFORE UPDATE ON agency_monthly_statements
  FOR EACH ROW EXECUTE FUNCTION pi_compat.statement_approval_integrity();

-- statement_lines_no_delete
CREATE FUNCTION pi_compat.statement_lines_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STATEMENT_LINE_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0185_statement_lines_no_delete BEFORE DELETE ON agency_statement_lines
  FOR EACH ROW EXECUTE FUNCTION pi_compat.statement_lines_no_delete();

-- statement_lines_no_update
CREATE FUNCTION pi_compat.statement_lines_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STATEMENT_LINE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0186_statement_lines_no_update BEFORE UPDATE ON agency_statement_lines
  FOR EACH ROW EXECUTE FUNCTION pi_compat.statement_lines_no_update();

-- approved_statement_lines_insert
CREATE FUNCTION pi_compat.approved_statement_lines_insert() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (EXISTS(SELECT 1 FROM agency_monthly_statements WHERE id=NEW.statement_id AND status='approved')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'APPROVED_STATEMENT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0187_approved_statement_lines_insert BEFORE INSERT ON agency_statement_lines
  FOR EACH ROW EXECUTE FUNCTION pi_compat.approved_statement_lines_insert();

-- billable_work_immutable_delete
CREATE FUNCTION pi_compat.billable_work_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLABLE_WORK_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0188_billable_work_immutable_delete BEFORE DELETE ON agency_billable_work
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billable_work_immutable_delete();

-- billable_work_immutable_update
CREATE FUNCTION pi_compat.billable_work_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLABLE_WORK_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0189_billable_work_immutable_update BEFORE UPDATE ON agency_billable_work
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billable_work_immutable_update();

-- approved_agreement_rate_lock_delete
CREATE FUNCTION pi_compat.approved_agreement_rate_lock_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (EXISTS(SELECT 1 FROM agency_commercial_agreements WHERE id=OLD.agreement_id AND status!='draft')) IS NOT TRUE THEN RETURN OLD; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'APPROVED_RATE_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0190_approved_agreement_rate_lock_delete BEFORE DELETE ON agency_contract_rates
  FOR EACH ROW EXECUTE FUNCTION pi_compat.approved_agreement_rate_lock_delete();

-- approved_agreement_rate_lock_insert
CREATE FUNCTION pi_compat.approved_agreement_rate_lock_insert() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (EXISTS(SELECT 1 FROM agency_commercial_agreements WHERE id=NEW.agreement_id AND status!='draft')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'APPROVED_RATE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0191_approved_agreement_rate_lock_insert BEFORE INSERT ON agency_contract_rates
  FOR EACH ROW EXECUTE FUNCTION pi_compat.approved_agreement_rate_lock_insert();

-- approved_agreement_rate_lock_update
CREATE FUNCTION pi_compat.approved_agreement_rate_lock_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (EXISTS(SELECT 1 FROM agency_commercial_agreements WHERE id=OLD.agreement_id AND status!='draft')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'APPROVED_RATE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0192_approved_agreement_rate_lock_update BEFORE UPDATE ON agency_contract_rates
  FOR EACH ROW EXECUTE FUNCTION pi_compat.approved_agreement_rate_lock_update();

-- billing_reconciliation_no_delete
CREATE FUNCTION pi_compat.billing_reconciliation_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0193_billing_reconciliation_no_delete BEFORE DELETE ON billing_reconciliations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_reconciliation_no_delete();

-- billing_reconciliation_no_update
CREATE FUNCTION pi_compat.billing_reconciliation_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0194_billing_reconciliation_no_update BEFORE UPDATE ON billing_reconciliations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_reconciliation_no_update();

-- billing_invoice_identity
CREATE FUNCTION pi_compat.billing_invoice_identity() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.client_id!=OLD.client_id OR NEW.statement_id IS DISTINCT FROM OLD.statement_id OR NEW.stripe_customer_id!=OLD.stripe_customer_id OR NEW.currency!=OLD.currency OR NEW.total_cents!=OLD.total_cents OR NEW.subtotal_cents!=OLD.subtotal_cents) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVOICE_SNAPSHOT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0195_billing_invoice_identity BEFORE UPDATE ON billing_invoices
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_invoice_identity();

-- invoice_export_independent
CREATE FUNCTION pi_compat.invoice_export_independent() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='finalized' AND OLD.status!='finalized') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.approved_by=OLD.requested_by OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1 AND sp.role IN('administrator','operations_manager') WHERE u.id=NEW.approved_by AND u.active=1 AND u.verified_at IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INDEPENDENT_INVOICE_REVIEW';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0196_invoice_export_independent BEFORE UPDATE ON agency_invoice_exports
  FOR EACH ROW EXECUTE FUNCTION pi_compat.invoice_export_independent();

-- invoice_export_immutable
CREATE FUNCTION pi_compat.invoice_export_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.statement_id!=OLD.statement_id OR NEW.client_id!=OLD.client_id OR NEW.snapshot_hash!=OLD.snapshot_hash OR NEW.due_days!=OLD.due_days OR NEW.terms_reference!=OLD.terms_reference OR NEW.requested_by!=OLD.requested_by OR (OLD.stripe_invoice_id IS NOT NULL AND NEW.stripe_invoice_id IS DISTINCT FROM OLD.stripe_invoice_id)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVOICE_EXPORT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0197_invoice_export_immutable BEFORE UPDATE ON agency_invoice_exports
  FOR EACH ROW EXECUTE FUNCTION pi_compat.invoice_export_immutable();

-- invoice_export_scope
CREATE FUNCTION pi_compat.invoice_export_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM agency_monthly_statements s JOIN agency_commercial_agreements a ON a.id=s.agreement_id WHERE s.id=NEW.statement_id AND s.status='approved' AND a.client_id=NEW.client_id AND s.approved_by IS DISTINCT FROM s.prepared_by)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'APPROVED_STATEMENT_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0198_invoice_export_scope BEFORE INSERT ON agency_invoice_exports
  FOR EACH ROW EXECUTE FUNCTION pi_compat.invoice_export_scope();

-- billing_customer_mapping_immutable
CREATE FUNCTION pi_compat.billing_customer_mapping_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.client_id!=OLD.client_id OR NEW.mode!=OLD.mode OR NEW.stripe_account_id!=OLD.stripe_account_id OR (OLD.stripe_customer_id IS NOT NULL AND NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BILLING_CUSTOMER_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0199_billing_customer_mapping_immutable BEFORE UPDATE ON billing_accounts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.billing_customer_mapping_immutable();

-- webhook_receipts_no_delete
CREATE FUNCTION pi_compat.webhook_receipts_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0200_webhook_receipts_no_delete BEFORE DELETE ON webhook_receipts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.webhook_receipts_no_delete();

-- webhook_receipts_no_update
CREATE FUNCTION pi_compat.webhook_receipts_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0201_webhook_receipts_no_update BEFORE UPDATE ON webhook_receipts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.webhook_receipts_no_update();

-- refund_no_delete
CREATE FUNCTION pi_compat.refund_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0202_refund_no_delete BEFORE DELETE ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION pi_compat.refund_no_delete();

-- refund_independent_approval
CREATE FUNCTION pi_compat.refund_independent_approval() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved' AND OLD.status='requested') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.approved_by=OLD.requested_by OR length(COALESCE(NEW.approval_reference,''))<8 OR NEW.approved_at IS NULL OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1 AND sp.role IN('administrator','operations_manager') WHERE u.id=NEW.approved_by AND u.active=1 AND u.verified_at IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INDEPENDENT_REFUND_APPROVAL_REQUIRED';
  END IF;
  IF (NEW.amount_cents > COALESCE((SELECT p.total_cents-p.refunded_cents-COALESCE((SELECT sum(r.amount_cents) FROM refund_requests r WHERE r.payment_id=p.id AND r.id!=NEW.id AND r.status IN('approved','processing','submitted') AND (r.stripe_refund_id IS NULL OR NOT EXISTS(SELECT 1 FROM payment_refund_observations o WHERE o.refund_id=r.stripe_refund_id AND o.status IN('succeeded','failed','canceled')))),0) FROM payments p WHERE p.id=NEW.payment_id AND p.status='paid'),-1)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REFUND_BALANCE_EXCEEDED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0203_refund_independent_approval BEFORE UPDATE ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION pi_compat.refund_independent_approval();

-- refund_request_immutable
CREATE FUNCTION pi_compat.refund_request_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.payment_id!=OLD.payment_id OR NEW.amount_cents!=OLD.amount_cents OR NEW.reason!=OLD.reason OR NEW.evidence_reference!=OLD.evidence_reference OR NEW.request_key!=OLD.request_key OR NEW.requested_by!=OLD.requested_by OR NEW.requested_at!=OLD.requested_at OR (OLD.stripe_refund_id IS NOT NULL AND NEW.stripe_refund_id IS DISTINCT FROM OLD.stripe_refund_id)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REFUND_REQUEST_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0204_refund_request_immutable BEFORE UPDATE ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION pi_compat.refund_request_immutable();

-- refund_observation_no_delete
CREATE FUNCTION pi_compat.refund_observation_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0205_refund_observation_no_delete BEFORE DELETE ON payment_refund_observations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.refund_observation_no_delete();

-- refund_identity_immutable
CREATE FUNCTION pi_compat.refund_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.payment_id!=OLD.payment_id OR NEW.payment_intent_id!=OLD.payment_intent_id OR NEW.amount_cents!=OLD.amount_cents OR NEW.currency!=OLD.currency OR NEW.provider_created!=OLD.provider_created) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REFUND_IDENTITY_MISMATCH';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0206_refund_identity_immutable BEFORE UPDATE ON payment_refund_observations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.refund_identity_immutable();

-- reconciliation_no_delete
CREATE FUNCTION pi_compat.reconciliation_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0207_reconciliation_no_delete BEFORE DELETE ON payment_reconciliation_items
  FOR EACH ROW EXECUTE FUNCTION pi_compat.reconciliation_no_delete();

-- reconciliation_evidence_required
CREATE FUNCTION pi_compat.reconciliation_evidence_required() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='resolved' AND (NEW.evidence_reference IS NULL OR length(NEW.evidence_reference)<8 OR NEW.resolved_at IS NULL OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1 AND sp.role IN('administrator','operations_manager') WHERE u.id=NEW.resolved_by AND u.active=1 AND u.verified_at IS NOT NULL))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RECONCILIATION_EVIDENCE_REQUIRED';
  END IF;
  IF (NEW.payment_id IS DISTINCT FROM OLD.payment_id OR NEW.provider_event_id!=OLD.provider_event_id OR NEW.code!=OLD.code OR NEW.object_id IS DISTINCT FROM OLD.object_id OR NEW.created_at!=OLD.created_at) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RECONCILIATION_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0208_reconciliation_evidence_required BEFORE UPDATE ON payment_reconciliation_items
  FOR EACH ROW EXECUTE FUNCTION pi_compat.reconciliation_evidence_required();

-- payment_attempt_no_delete
CREATE FUNCTION pi_compat.payment_attempt_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0209_payment_attempt_no_delete BEFORE DELETE ON payment_checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.payment_attempt_no_delete();

-- payment_attempt_snapshot_immutable
CREATE FUNCTION pi_compat.payment_attempt_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.payment_id!=OLD.payment_id OR NEW.payment_version!=OLD.payment_version OR NEW.amount_cents!=OLD.amount_cents OR NEW.currency!=OLD.currency OR NEW.client_id!=OLD.client_id OR NEW.description!=OLD.description OR NEW.success_url!=OLD.success_url OR NEW.cancel_url!=OLD.cancel_url OR NEW.created_at!=OLD.created_at OR (OLD.session_id IS NOT NULL AND NEW.session_id IS DISTINCT FROM OLD.session_id)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYMENT_ATTEMPT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0210_payment_attempt_snapshot_immutable BEFORE UPDATE ON payment_checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.payment_attempt_snapshot_immutable();

-- payment_attempt_scope_insert
CREATE FUNCTION pi_compat.payment_attempt_scope_insert() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM payments p WHERE p.id=NEW.payment_id AND p.client_id=NEW.client_id AND p.version=NEW.payment_version AND p.total_cents=NEW.amount_cents AND p.currency=NEW.currency AND p.status IN('payment_required','failed'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYMENT_SNAPSHOT_CHANGED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0211_payment_attempt_scope_insert BEFORE INSERT ON payment_checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.payment_attempt_scope_insert();

-- wa_agreement_events_immutable_d
CREATE FUNCTION pi_compat.wa_agreement_events_immutable_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0212_wa_agreement_events_immutable_d BEFORE DELETE ON wa_agreement_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_agreement_events_immutable_d();

-- wa_agreement_events_immutable_u
CREATE FUNCTION pi_compat.wa_agreement_events_immutable_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0213_wa_agreement_events_immutable_u BEFORE UPDATE ON wa_agreement_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_agreement_events_immutable_u();

-- wa_agreement_signed_consent_immutable
CREATE FUNCTION pi_compat.wa_agreement_signed_consent_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.consented_at IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WA_SIGNED_CONSENT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0214_wa_agreement_signed_consent_immutable BEFORE UPDATE OF consent_envelope,consented_at,source_sha256 ON wa_agreement_signers
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_agreement_signed_consent_immutable();

-- wa_agreement_signer_tenancy
CREATE FUNCTION pi_compat.wa_agreement_signer_tenancy() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.role='tenant' AND NOT EXISTS(
 SELECT 1 FROM wa_agreement_envelopes e JOIN tenancy_memberships m ON m.tenancy_id=e.tenancy_id
 WHERE e.id=NEW.envelope_id AND m.user_id=NEW.user_id AND m.ends_at IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WA_SIGNER_NOT_TENANT';
  END IF;
  IF (NEW.role='landlord' AND NOT EXISTS(
 SELECT 1 FROM wa_agreement_envelopes e
 JOIN property_management_relationships pm ON pm.property_id=e.property_id AND pm.ends_at IS NULL
 JOIN client_memberships m ON m.client_id=pm.manager_client_id AND m.active=1 AND m.role IN('owner','admin')
 WHERE e.id=NEW.envelope_id AND m.user_id=NEW.user_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WA_SIGNER_NOT_MANAGER';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0215_wa_agreement_signer_tenancy BEFORE INSERT ON wa_agreement_signers
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_agreement_signer_tenancy();

-- wa_agreement_source_immutable
CREATE FUNCTION pi_compat.wa_agreement_source_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WA_AGREEMENT_SOURCE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0216_wa_agreement_source_immutable BEFORE UPDATE OF case_id,tenancy_id,property_id,source_document_id,source_sha256,template_version,prepared_by,prepared_at ON wa_agreement_envelopes
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_agreement_source_immutable();

-- wa_agreement_scope_create
CREATE FUNCTION pi_compat.wa_agreement_scope_create() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM wa_residential_form_cases c JOIN tenancies t ON t.id=c.tenancy_id
 JOIN properties p ON p.id=t.property_id
 WHERE c.id=NEW.case_id AND c.form_code='WA_FORM_1AA' AND c.tenancy_id=NEW.tenancy_id
 AND c.property_id=NEW.property_id AND p.sector='residential'
 AND c.issued_document_id=NEW.source_document_id AND c.template_version=NEW.template_version)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WA_AGREEMENT_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0217_wa_agreement_scope_create BEFORE INSERT ON wa_agreement_envelopes
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_agreement_scope_create();

-- rent_connect_no_delete
CREATE FUNCTION pi_compat.rent_connect_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENT_CONNECT_NO_DELETE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0218_rent_connect_no_delete BEFORE DELETE ON rent_connect_sandbox_accounts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rent_connect_no_delete();

-- rent_connect_no_identity_edits
CREATE FUNCTION pi_compat.rent_connect_no_identity_edits() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENT_CONNECT_IDENTITY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0219_rent_connect_no_identity_edits BEFORE UPDATE OF plan_id,account_id,environment,created_by,created_at ON rent_connect_sandbox_accounts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rent_connect_no_identity_edits();

-- rent_connect_self_managed_only
CREATE FUNCTION pi_compat.rent_connect_self_managed_only() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM rent_route_plans p WHERE p.id=NEW.plan_id
 AND p.manager_mode='self_managed' AND p.route='landlord_connect_candidate')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENT_CONNECT_NOT_SELF_MANAGED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0220_rent_connect_self_managed_only BEFORE INSERT ON rent_connect_sandbox_accounts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rent_connect_self_managed_only();

-- restricted_form2_independent_review
CREATE FUNCTION pi_compat.restricted_form2_independent_review() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.reviewer_id=(SELECT prepared_by FROM restricted_form2_preparations WHERE id=NEW.preparation_id)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'FORM2_INDEPENDENT_REVIEW_REQUIRED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0221_restricted_form2_independent_review BEFORE INSERT ON restricted_form2_reviews
  FOR EACH ROW EXECUTE FUNCTION pi_compat.restricted_form2_independent_review();

-- rent_disbursement_balance_guard
CREATE FUNCTION pi_compat.rent_disbursement_balance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF ((SELECT kind FROM rent_external_money_records WHERE id=NEW.record_id)='owner_disbursement_external'
  AND (
   COALESCE((SELECT SUM(e.amount_cents) FROM rent_external_money_records e
    JOIN rent_external_verifications v ON v.record_id=e.id
    WHERE e.plan_id=(SELECT plan_id FROM rent_external_money_records WHERE id=NEW.record_id)
      AND e.kind='rent_received_external'),0)
   - COALESCE((SELECT SUM(e.amount_cents) FROM rent_external_money_records e
    JOIN rent_external_verifications v ON v.record_id=e.id
    WHERE e.plan_id=(SELECT plan_id FROM rent_external_money_records WHERE id=NEW.record_id)
      AND e.kind='owner_disbursement_external'),0)
   < (SELECT amount_cents FROM rent_external_money_records WHERE id=NEW.record_id)
  )) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENT_EXTERNAL_RECONCILIATION_EXCESS';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0222_rent_disbursement_balance_guard BEFORE INSERT ON rent_external_verifications
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rent_disbursement_balance_guard();

-- rent_independent_reviewer_guard
CREATE FUNCTION pi_compat.rent_independent_reviewer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF ((SELECT recorded_by FROM rent_external_money_records WHERE id=NEW.record_id)=NEW.reviewed_by) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENT_REVIEWER_MUST_DIFFER';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0223_rent_independent_reviewer_guard BEFORE INSERT ON rent_external_verifications
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rent_independent_reviewer_guard();

-- restricted_review_immutable_delete
CREATE FUNCTION pi_compat.restricted_review_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'FORM2_REVIEW_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0224_restricted_review_immutable_delete BEFORE DELETE ON restricted_form2_reviews
  FOR EACH ROW EXECUTE FUNCTION pi_compat.restricted_review_immutable_delete();

-- restricted_review_immutable_update
CREATE FUNCTION pi_compat.restricted_review_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'FORM2_REVIEW_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0225_restricted_review_immutable_update BEFORE UPDATE ON restricted_form2_reviews
  FOR EACH ROW EXECUTE FUNCTION pi_compat.restricted_review_immutable_update();

-- restricted_preparation_immutable_delete
CREATE FUNCTION pi_compat.restricted_preparation_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'FORM2_PREPARATION_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0226_restricted_preparation_immutable_delete BEFORE DELETE ON restricted_form2_preparations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.restricted_preparation_immutable_delete();

-- restricted_preparation_immutable_update
CREATE FUNCTION pi_compat.restricted_preparation_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'FORM2_PREPARATION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0227_restricted_preparation_immutable_update BEFORE UPDATE ON restricted_form2_preparations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.restricted_preparation_immutable_update();

-- restricted_preparation_residential
CREATE FUNCTION pi_compat.restricted_preparation_residential() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM restricted_form_cases c JOIN tenancies t ON t.id=c.tenancy_id
 JOIN properties p ON p.id=t.property_id AND p.sector='residential' WHERE c.id=NEW.case_id)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'FORM2_RESIDENTIAL_ONLY';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0228_restricted_preparation_residential BEFORE INSERT ON restricted_form2_preparations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.restricted_preparation_residential();

-- rent_reviews_immutable_delete
CREATE FUNCTION pi_compat.rent_reviews_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENT_VERIFICATION_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0229_rent_reviews_immutable_delete BEFORE DELETE ON rent_external_verifications
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rent_reviews_immutable_delete();

-- rent_reviews_immutable_update
CREATE FUNCTION pi_compat.rent_reviews_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENT_VERIFICATION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0230_rent_reviews_immutable_update BEFORE UPDATE ON rent_external_verifications
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rent_reviews_immutable_update();

-- rent_records_immutable_delete
CREATE FUNCTION pi_compat.rent_records_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENT_EVIDENCE_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0231_rent_records_immutable_delete BEFORE DELETE ON rent_external_money_records
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rent_records_immutable_delete();

-- rent_records_immutable_update
CREATE FUNCTION pi_compat.rent_records_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENT_EVIDENCE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0232_rent_records_immutable_update BEFORE UPDATE ON rent_external_money_records
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rent_records_immutable_update();

-- rent_plans_immutable_delete
CREATE FUNCTION pi_compat.rent_plans_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENT_PLAN_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0233_rent_plans_immutable_delete BEFORE DELETE ON rent_route_plans
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rent_plans_immutable_delete();

-- rent_plans_immutable_update
CREATE FUNCTION pi_compat.rent_plans_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENT_PLAN_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0234_rent_plans_immutable_update BEFORE UPDATE ON rent_route_plans
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rent_plans_immutable_update();

-- rent_plans_residential_insert
CREATE FUNCTION pi_compat.rent_plans_residential_insert() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM tenancies t JOIN properties p ON p.id=t.property_id
   WHERE t.id=NEW.tenancy_id AND p.id=NEW.property_id AND p.sector='residential')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENT_RESIDENTIAL_ONLY';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0235_rent_plans_residential_insert BEFORE INSERT ON rent_route_plans
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rent_plans_residential_insert();

-- rental_outcome_immutable_delete
CREATE FUNCTION pi_compat.rental_outcome_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM rental_application_purge_permits p WHERE p.application_id=OLD.application_id)) IS NOT TRUE THEN RETURN OLD; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_OUTCOME_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0236_rental_outcome_immutable_delete BEFORE DELETE ON rental_application_outcomes
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_outcome_immutable_delete();

-- rental_outcome_immutable_update
CREATE FUNCTION pi_compat.rental_outcome_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.outcome!=OLD.outcome OR NEW.authority_reference!=OLD.authority_reference
 OR NEW.details_envelope!=OLD.details_envelope OR NEW.recorded_by!=OLD.recorded_by
 OR NEW.recorded_at!=OLD.recorded_at) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_OUTCOME_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0237_rental_outcome_immutable_update BEFORE UPDATE ON rental_application_outcomes
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_outcome_immutable_update();

-- rental_handoff_requires_script_receipt
CREATE FUNCTION pi_compat.rental_handoff_requires_script_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='delivered' AND NOT EXISTS (
 SELECT 1 FROM rental_handoff_receipts r WHERE r.handoff_id=NEW.id
 AND r.idempotency_key=NEW.idempotency_key AND r.recipient_hash=NEW.recipient_hash
)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_SCRIPT_RECEIPT_REQUIRED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0238_rental_handoff_requires_script_receipt BEFORE UPDATE OF status ON rental_application_handoffs
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_handoff_requires_script_receipt();

-- rental_listing_approved_requires_evidence
CREATE FUNCTION pi_compat.rental_listing_approved_requires_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.rental_approval_state='approved'
AND (NEW.application_mode!='proinspect' OR NEW.kind!='residential'
 OR NEW.application_url IS NOT NULL OR NEW.rental_recipient_verified_at IS NULL
 OR NEW.rental_approved_by IS NULL OR NEW.rental_approved_at IS NULL
 OR NEW.rental_approved_notice_version IS NULL)) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_APPLICATION_APPROVAL_REQUIRED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0239_rental_listing_approved_requires_evidence BEFORE UPDATE OF rental_approval_state ON leasing_listings
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_listing_approved_requires_evidence();

-- rental_listing_changes_revoke_approval
CREATE FUNCTION pi_compat.rental_listing_changes_revoke_approval() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.application_mode IS DISTINCT FROM NEW.application_mode
 OR OLD.application_url IS DISTINCT FROM NEW.application_url
 OR OLD.application_authority_reference IS DISTINCT FROM NEW.application_authority_reference
 OR OLD.application_recipient_email IS DISTINCT FROM NEW.application_recipient_email
 OR OLD.tenancy_database_notice_mode IS DISTINCT FROM NEW.tenancy_database_notice_mode
 OR OLD.tenancy_database_notice_json IS DISTINCT FROM NEW.tenancy_database_notice_json
 OR OLD.instructed_by_client_id IS DISTINCT FROM NEW.instructed_by_client_id
 OR OLD.agent_name IS DISTINCT FROM NEW.agent_name
 OR OLD.agent_role IS DISTINCT FROM NEW.agent_role OR OLD.property_id IS DISTINCT FROM NEW.property_id) IS NOT TRUE THEN RETURN NEW; END IF;
  UPDATE leasing_listings
 SET rental_approval_state='pending',rental_approved_at=NULL,
 rental_approved_by=NULL,rental_approved_notice_version=NULL,
 rental_recipient_verified_at=CASE WHEN OLD.application_recipient_email IS DISTINCT FROM NEW.application_recipient_email
 THEN NULL ELSE rental_recipient_verified_at END
 WHERE id=NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0240_rental_listing_changes_revoke_approval AFTER UPDATE OF application_mode,application_url,application_authority_reference,
 application_recipient_email,tenancy_database_notice_mode,tenancy_database_notice_json,
 instructed_by_client_id,agent_name,agent_role,property_id ON leasing_listings
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_listing_changes_revoke_approval();

-- rental_listing_approval_immutable_delete
CREATE FUNCTION pi_compat.rental_listing_approval_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_APPROVAL_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0241_rental_listing_approval_immutable_delete BEFORE DELETE ON rental_listing_approvals
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_listing_approval_immutable_delete();

-- rental_listing_approval_immutable_update
CREATE FUNCTION pi_compat.rental_listing_approval_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_APPROVAL_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0242_rental_listing_approval_immutable_update BEFORE UPDATE ON rental_listing_approvals
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_listing_approval_immutable_update();

-- contractor_connect_webhook_receipts_no_delete
CREATE FUNCTION pi_compat.contractor_connect_webhook_receipts_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0243_contractor_connect_webhook_receipts_no_delete BEFORE DELETE ON contractor_connect_webhook_receipts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.contractor_connect_webhook_receipts_no_delete();

-- contractor_connect_webhook_receipts_no_update
CREATE FUNCTION pi_compat.contractor_connect_webhook_receipts_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0244_contractor_connect_webhook_receipts_no_update BEFORE UPDATE ON contractor_connect_webhook_receipts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.contractor_connect_webhook_receipts_no_update();

-- contractor_payment_status_event
CREATE FUNCTION pi_compat.contractor_payment_status_event() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!=NEW.status) IS NOT TRUE THEN RETURN NEW; END IF;
  INSERT INTO contractor_payment_events(id,plan_id,from_status,to_status,actor_id,event_reference,created_at)
 VALUES('cpe_'||replace(gen_random_uuid()::text, '-', ''),NEW.id,OLD.status,NEW.status,NEW.last_actor_id,COALESCE(NEW.external_verification_reference,NEW.stripe_transfer_id,NEW.external_payment_reference,NEW.checkout_session_id,NEW.payer_authority_reference,NEW.quote_reference),NEW.updated_at);
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0245_contractor_payment_status_event AFTER UPDATE OF status ON contractor_payment_plans
  FOR EACH ROW EXECUTE FUNCTION pi_compat.contractor_payment_status_event();

-- contractor_payment_insert_event
CREATE FUNCTION pi_compat.contractor_payment_insert_event() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  INSERT INTO contractor_payment_events(id,plan_id,from_status,to_status,actor_id,event_reference,created_at)
 VALUES('cpe_'||replace(gen_random_uuid()::text, '-', ''),NEW.id,NULL,NEW.status,NEW.last_actor_id,NEW.invoice_reference,NEW.created_at);
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0246_contractor_payment_insert_event AFTER INSERT ON contractor_payment_plans
  FOR EACH ROW EXECUTE FUNCTION pi_compat.contractor_payment_insert_event();

-- contractor_payment_events_no_delete
CREATE FUNCTION pi_compat.contractor_payment_events_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0247_contractor_payment_events_no_delete BEFORE DELETE ON contractor_payment_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.contractor_payment_events_no_delete();

-- contractor_payment_events_no_update
CREATE FUNCTION pi_compat.contractor_payment_events_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0248_contractor_payment_events_no_update BEFORE UPDATE ON contractor_payment_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.contractor_payment_events_no_update();

-- stripe_billing_events_immutable_delete
CREATE FUNCTION pi_compat.stripe_billing_events_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0249_stripe_billing_events_immutable_delete BEFORE DELETE ON stripe_billing_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.stripe_billing_events_immutable_delete();

-- stripe_billing_events_immutable_update
CREATE FUNCTION pi_compat.stripe_billing_events_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0250_stripe_billing_events_immutable_update BEFORE UPDATE ON stripe_billing_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.stripe_billing_events_immutable_update();

-- v2_compliance_distinct_reviewer
CREATE FUNCTION pi_compat.v2_compliance_distinct_reviewer() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status IN ('verified','rejected') AND NEW.status IS DISTINCT FROM OLD.status
 AND NEW.reviewed_by=OLD.recorded_by) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_COMPLIANCE_EVIDENCE_SELF_REVIEW';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0251_v2_compliance_distinct_reviewer BEFORE UPDATE OF status ON v2_compliance_evidence
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_compliance_distinct_reviewer();

-- v2_condition_distinct_reviewer
CREATE FUNCTION pi_compat.v2_condition_distinct_reviewer() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status IN ('verified','rejected') AND NEW.status IS DISTINCT FROM OLD.status
 AND NEW.verified_by=OLD.observed_by) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CONDITION_SELF_REVIEW';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0252_v2_condition_distinct_reviewer BEFORE UPDATE OF status ON v2_asset_conditions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_condition_distinct_reviewer();

-- v2_alert_delete
CREATE FUNCTION pi_compat.v2_alert_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ENTERPRISE_ALERT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0253_v2_alert_delete BEFORE DELETE ON v2_enterprise_alerts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_alert_delete();

-- v2_alert_review_lock
CREATE FUNCTION pi_compat.v2_alert_review_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status NOT IN('open','acknowledged') OR NEW.status NOT IN('acknowledged','resolved')
 OR NEW.source_kind!=OLD.source_kind OR NEW.source_id!=OLD.source_id
 OR NEW.alert_code!=OLD.alert_code OR NEW.severity!=OLD.severity) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ENTERPRISE_ALERT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0254_v2_alert_review_lock BEFORE UPDATE ON v2_enterprise_alerts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_alert_review_lock();

-- v2_report_snapshot_lock_d
CREATE FUNCTION pi_compat.v2_report_snapshot_lock_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_REPORT_SNAPSHOT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0255_v2_report_snapshot_lock_d BEFORE DELETE ON v2_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_report_snapshot_lock_d();

-- v2_report_snapshot_lock_u
CREATE FUNCTION pi_compat.v2_report_snapshot_lock_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_REPORT_SNAPSHOT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0256_v2_report_snapshot_lock_u BEFORE UPDATE ON v2_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_report_snapshot_lock_u();

-- v2_report_portfolio_scope
CREATE FUNCTION pi_compat.v2_report_portfolio_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.portfolio_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_enterprise_portfolios p WHERE p.id=NEW.portfolio_id AND p.client_id=NEW.client_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_REPORT_PORTFOLIO_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0257_v2_report_portfolio_scope BEFORE INSERT ON v2_saved_report_definitions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_report_portfolio_scope();

-- v2_cap_forecast_lock_d
CREATE FUNCTION pi_compat.v2_cap_forecast_lock_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_FORECAST_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0258_v2_cap_forecast_lock_d BEFORE DELETE ON v2_capital_forecasts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_cap_forecast_lock_d();

-- v2_cap_forecast_lock_u
CREATE FUNCTION pi_compat.v2_cap_forecast_lock_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_FORECAST_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0259_v2_cap_forecast_lock_u BEFORE UPDATE ON v2_capital_forecasts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_cap_forecast_lock_u();

-- v2_capital_commit_delete
CREATE FUNCTION pi_compat.v2_capital_commit_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_COMMITMENT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0260_v2_capital_commit_delete BEFORE DELETE ON v2_capital_commitments
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_capital_commit_delete();

-- v2_capital_commit_lock
CREATE FUNCTION pi_compat.v2_capital_commit_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='proposed' OR NEW.status NOT IN('approved','cancelled')
 OR NEW.project_id!=OLD.project_id OR NEW.proposed_cents!=OLD.proposed_cents
 OR NEW.contractor_id IS DISTINCT FROM OLD.contractor_id) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_COMMITMENT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0261_v2_capital_commit_lock BEFORE UPDATE ON v2_capital_commitments
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_capital_commit_lock();

-- v2_capital_commit_approval
CREATE FUNCTION pi_compat.v2_capital_commit_approval() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved' AND OLD.status='proposed') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.approved_by IS NULL
 OR NEW.approved_by=NEW.proposed_by OR NEW.approved_at IS NULL OR
 LENGTH(TRIM(COALESCE(NEW.authority_reference,'')))<4) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_COMMITMENT_REVIEW_REQUIRED';
  END IF;
  IF (NOT EXISTS(
 SELECT 1 FROM v2_capital_projects p JOIN v2_capital_programmes g ON g.id=p.programme_id
 WHERE p.id=NEW.project_id AND p.status IN('approved','active') AND g.status IN('approved','active'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_NOT_ACTIVE';
  END IF;
  IF ((SELECT COALESCE(SUM(c.proposed_cents),0) FROM v2_capital_commitments c
 JOIN v2_capital_projects p ON p.id=c.project_id WHERE p.programme_id=
 (SELECT p2.programme_id FROM v2_capital_projects p2 WHERE p2.id=NEW.project_id)
 AND c.status='approved')+NEW.proposed_cents >
 (SELECT g.baseline_budget_cents FROM v2_capital_programmes g
 JOIN v2_capital_projects p ON p.programme_id=g.id WHERE p.id=NEW.project_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_BUDGET_EXCEEDED';
  END IF;
  IF (NEW.contractor_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM contractors c JOIN v2_contractor_credentials v ON v.contractor_id=c.id
 WHERE c.id=NEW.contractor_id AND c.active=1 AND v.status='verified'
 AND v.credential_type='insurance' AND v.valid_until>pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_CONTRACTOR_UNVERIFIED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0262_v2_capital_commit_approval BEFORE UPDATE OF status ON v2_capital_commitments
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_capital_commit_approval();

-- v2_cap_milestone_delete
CREATE FUNCTION pi_compat.v2_cap_milestone_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_MILESTONE_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0263_v2_cap_milestone_delete BEFORE DELETE ON v2_capital_milestones
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_cap_milestone_delete();

-- v2_cap_milestone_review
CREATE FUNCTION pi_compat.v2_cap_milestone_review() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='planned' OR NEW.status NOT IN('completed','deferred')
 OR NEW.project_id!=OLD.project_id OR NEW.title!=OLD.title OR NEW.due_on!=OLD.due_on) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_MILESTONE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0264_v2_cap_milestone_review BEFORE UPDATE ON v2_capital_milestones
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_cap_milestone_review();

-- v2_cap_project_scope_lock
CREATE FUNCTION pi_compat.v2_cap_project_scope_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='draft') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_PROJECT_SCOPE_LOCKED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0265_v2_cap_project_scope_lock BEFORE UPDATE OF programme_id,asset_id,work_order_id,estimated_cents ON v2_capital_projects
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_cap_project_scope_lock();

-- v2_cap_project_status
CREATE FUNCTION pi_compat.v2_cap_project_status() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!=NEW.status) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT(
 (OLD.status='draft' AND NEW.status IN('approved','cancelled')) OR
 (OLD.status='approved' AND NEW.status IN('active','cancelled')) OR
 (OLD.status='active' AND NEW.status IN('completed','cancelled')))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_PROJECT_TRANSITION';
  END IF;
  IF (NEW.status='approved'
 AND (NEW.approved_by IS NULL OR NEW.approved_by=NEW.created_by OR NEW.approved_at IS NULL
 OR LENGTH(TRIM(COALESCE(NEW.authority_reference,'')))<4)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_PROJECT_REVIEW_REQUIRED';
  END IF;
  IF (NEW.status='completed'
 AND EXISTS(SELECT 1 FROM v2_capital_milestones m WHERE m.project_id=NEW.id AND m.status='planned')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_MILESTONES_OUTSTANDING';
  END IF;
  IF (NEW.status='completed'
 AND EXISTS(SELECT 1 FROM v2_capital_commitments c WHERE c.project_id=NEW.id AND c.status='proposed')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_COMMITMENTS_OUTSTANDING';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0266_v2_cap_project_status BEFORE UPDATE OF status ON v2_capital_projects
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_cap_project_status();

-- v2_cap_project_insert_scope
CREATE FUNCTION pi_compat.v2_cap_project_insert_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_capital_programmes p WHERE p.id=NEW.programme_id AND p.status IN('approved','active'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_PROGRAMME_NOT_APPROVED';
  END IF;
  IF (NEW.asset_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_capital_programmes p JOIN v2_engagements e ON e.id=p.engagement_id
 JOIN v2_assets a ON a.id=NEW.asset_id WHERE p.id=NEW.programme_id
 AND a.property_id IS NOT DISTINCT FROM e.property_id AND a.scheme_id IS NOT DISTINCT FROM e.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_ASSET_SCOPE';
  END IF;
  IF (NEW.work_order_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_capital_programmes p JOIN v2_engagements e ON e.id=p.engagement_id
 JOIN work_orders w ON w.id=NEW.work_order_id WHERE p.id=NEW.programme_id
 AND w.client_id=e.client_id AND w.property_id IS NOT DISTINCT FROM e.property_id AND w.scheme_id IS NOT DISTINCT FROM e.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_WORK_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0267_v2_cap_project_insert_scope BEFORE INSERT ON v2_capital_projects
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_cap_project_insert_scope();

-- v2_cap_programme_budget_lock
CREATE FUNCTION pi_compat.v2_cap_programme_budget_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='draft') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_BASELINE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0268_v2_cap_programme_budget_lock BEFORE UPDATE OF engagement_id,baseline_budget_cents,planned_start,planned_finish ON v2_capital_programmes
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_cap_programme_budget_lock();

-- v2_cap_programme_status
CREATE FUNCTION pi_compat.v2_cap_programme_status() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!=NEW.status) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT(
 (OLD.status='draft' AND NEW.status IN('approved','cancelled')) OR
 (OLD.status='approved' AND NEW.status IN('active','cancelled')) OR
 (OLD.status='active' AND NEW.status IN('completed','cancelled')))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_PROGRAMME_TRANSITION';
  END IF;
  IF (NEW.status='completed'
 AND EXISTS(SELECT 1 FROM v2_capital_projects p WHERE p.programme_id=NEW.id AND p.status NOT IN('completed','cancelled'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_PROJECTS_OUTSTANDING';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0269_v2_cap_programme_status BEFORE UPDATE OF status ON v2_capital_programmes
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_cap_programme_status();

-- v2_cap_programme_approve
CREATE FUNCTION pi_compat.v2_cap_programme_approve() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved' AND OLD.status='draft') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.approved_by IS NULL
 OR NEW.approved_by=NEW.created_by OR NEW.approved_at IS NULL
 OR LENGTH(TRIM(COALESCE(NEW.authority_reference,'')))<4) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_AUTHORITY_REQUIRED';
  END IF;
  IF (NOT EXISTS(
 SELECT 1 FROM v2_engagements e WHERE e.id=NEW.engagement_id AND e.status='active')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CAPITAL_ENGAGEMENT_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0270_v2_cap_programme_approve BEFORE UPDATE OF status ON v2_capital_programmes
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_cap_programme_approve();

-- v2_enterprise_portfolio_members_delete
CREATE FUNCTION pi_compat.v2_enterprise_portfolio_members_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PORTFOLIO_MEMBERSHIP_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0271_v2_enterprise_portfolio_members_delete BEFORE DELETE ON v2_enterprise_portfolio_members
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_enterprise_portfolio_members_delete();

-- v2_enterprise_portfolio_members_lock
CREATE FUNCTION pi_compat.v2_enterprise_portfolio_members_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PORTFOLIO_MEMBERSHIP_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0272_v2_enterprise_portfolio_members_lock BEFORE UPDATE ON v2_enterprise_portfolio_members
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_enterprise_portfolio_members_lock();

-- v2_enterprise_portfolio_scope
CREATE FUNCTION pi_compat.v2_enterprise_portfolio_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_enterprise_portfolios p WHERE p.id=NEW.portfolio_id AND p.status='active'
 AND (EXISTS(SELECT 1 FROM client_property_links l WHERE NEW.property_id IS NOT NULL
 AND l.property_id=NEW.property_id AND l.client_id=p.client_id
 AND l.starts_at<=pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND (l.ends_at IS NULL OR l.ends_at>pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now')))
 OR EXISTS(SELECT 1 FROM scheme_client_links l WHERE NEW.scheme_id IS NOT NULL
 AND l.scheme_id=NEW.scheme_id AND l.client_id=p.client_id
 AND l.starts_at<=pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND (l.ends_at IS NULL OR l.ends_at>pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now')))))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PORTFOLIO_NOT_AUTHORISED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0273_v2_enterprise_portfolio_scope BEFORE INSERT ON v2_enterprise_portfolio_members
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_enterprise_portfolio_scope();

-- v2_sector_record_delete
CREATE FUNCTION pi_compat.v2_sector_record_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_SECTOR_RECORD_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0274_v2_sector_record_delete BEFORE DELETE ON v2_sector_records
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_sector_record_delete();

-- v2_sector_record_review_lock
CREATE FUNCTION pi_compat.v2_sector_record_review_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='submitted' OR NEW.status NOT IN('accepted','rejected')
 OR NEW.rollout_id!=OLD.rollout_id OR NEW.module_code!=OLD.module_code
 OR NEW.asset_id IS DISTINCT FROM OLD.asset_id OR NEW.source_key!=OLD.source_key OR NEW.facts_json!=OLD.facts_json) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_SECTOR_RECORD_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0275_v2_sector_record_review_lock BEFORE UPDATE ON v2_sector_records
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_sector_record_review_lock();

-- v2_sector_record_guard
CREATE FUNCTION pi_compat.v2_sector_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_sector_rollouts r JOIN v2_sector_modules m ON m.pack_id=r.pack_id AND m.code=NEW.module_code
 JOIN v2_sector_packs p ON p.id=r.pack_id
 JOIN v2_engagements e ON e.id=r.engagement_id
 WHERE r.id=NEW.rollout_id AND r.status IN('pilot','live') AND m.status='approved'
 AND p.status='approved' AND e.status='active')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_SECTOR_NOT_ACTIVATED';
  END IF;
  IF (NEW.asset_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_sector_rollouts r JOIN v2_engagements e ON e.id=r.engagement_id
 JOIN v2_assets a ON a.id=NEW.asset_id
 WHERE r.id=NEW.rollout_id AND a.property_id IS NOT DISTINCT FROM e.property_id AND a.scheme_id IS NOT DISTINCT FROM e.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_SECTOR_ASSET_SCOPE';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_sector_modules m WHERE m.code=NEW.module_code AND m.classification='reserved_external'
 AND NOT EXISTS(SELECT 1 FROM v2_sector_module_clearances c WHERE c.module_code=m.code AND c.status='verified'
 AND c.valid_until>pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now')))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_SECTOR_CLEARANCE_EXPIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0276_v2_sector_record_guard BEFORE INSERT ON v2_sector_records
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_sector_record_guard();

-- v2_rollout_scope_lock
CREATE FUNCTION pi_compat.v2_rollout_scope_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ROLLOUT_SCOPE_LOCKED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0277_v2_rollout_scope_lock BEFORE UPDATE OF pack_id,engagement_id ON v2_sector_rollouts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_rollout_scope_lock();

-- v2_rollout_activation
CREATE FUNCTION pi_compat.v2_rollout_activation() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status IN('pilot','live') AND NEW.status!=OLD.status) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.approved_by IS NULL OR NEW.approved_at IS NULL
 OR LENGTH(TRIM(COALESCE(NEW.authority_reference,'')))<4) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ROLLOUT_APPROVAL_REQUIRED';
  END IF;
  IF (NOT(
 (OLD.status='draft' AND NEW.status='pilot') OR
 (OLD.status='pilot' AND NEW.status='live') OR
 (OLD.status='paused' AND NEW.status='pilot'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ROLLOUT_STAGE_INVALID';
  END IF;
  IF (NOT EXISTS(
 SELECT 1 FROM v2_sector_packs p JOIN v2_markets m ON m.code=p.market_code AND m.enabled=1
 JOIN v2_engagements e ON e.id=NEW.engagement_id AND e.market_code=p.market_code AND e.status='active'
 JOIN v2_asset_markets am ON am.market_code=p.market_code AND am.status='approved'
 AND am.property_id IS NOT DISTINCT FROM e.property_id AND am.scheme_id IS NOT DISTINCT FROM e.scheme_id
 WHERE p.id=NEW.pack_id AND p.status='approved')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ROLLOUT_MARKET_NOT_READY';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_sector_modules sm WHERE sm.pack_id=NEW.pack_id
 AND sm.status='approved' AND sm.classification='reserved_external'
 AND NOT EXISTS(SELECT 1 FROM v2_sector_module_clearances c WHERE c.module_code=sm.code
 AND c.status='verified' AND c.valid_until>pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now')))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ROLLOUT_CLEARANCE_EXPIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0278_v2_rollout_activation BEFORE UPDATE OF status ON v2_sector_rollouts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_rollout_activation();

-- v2_sector_check_lock
CREATE FUNCTION pi_compat.v2_sector_check_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF ((SELECT status FROM v2_sector_packs WHERE id=OLD.pack_id)='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PACK_VERSION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0279_v2_sector_check_lock BEFORE UPDATE ON v2_sector_release_checks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_sector_check_lock();

-- v2_sector_pack_locked
CREATE FUNCTION pi_compat.v2_sector_pack_locked() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status='approved' AND NEW.status!='retired') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PACK_VERSION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0280_v2_sector_pack_locked BEFORE UPDATE ON v2_sector_packs
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_sector_pack_locked();

-- v2_sector_pack_approval
CREATE FUNCTION pi_compat.v2_sector_pack_approval() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved' AND OLD.status!='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.approved_by IS NULL OR NEW.approved_at IS NULL
 OR LENGTH(TRIM(COALESCE(NEW.approval_reference,'')))<4) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PACK_REVIEW_REQUIRED';
  END IF;
  IF ((SELECT COUNT(*) FROM v2_sector_release_checks c WHERE c.pack_id=NEW.id AND c.status='verified')!=7) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PACK_RELEASE_CHECKS_MISSING';
  END IF;
  IF (EXISTS(SELECT 1 FROM v2_sector_modules m WHERE m.pack_id=NEW.id AND m.status='draft')
 OR NOT EXISTS(SELECT 1 FROM v2_sector_modules m WHERE m.pack_id=NEW.id AND m.status='approved')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PACK_MODULES_UNREVIEWED';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_sector_modules m WHERE m.pack_id=NEW.id AND m.classification='reserved_external'
 AND m.status='approved' AND NOT EXISTS(SELECT 1 FROM v2_sector_module_clearances c
 WHERE c.module_code=m.code AND c.status='verified'
 AND c.valid_until>pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now')))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_RESERVED_PROVIDER_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0281_v2_sector_pack_approval BEFORE UPDATE OF status ON v2_sector_packs
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_sector_pack_approval();

-- v2_sector_module_locked
CREATE FUNCTION pi_compat.v2_sector_module_locked() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status IN('approved','excluded') AND
 (SELECT status FROM v2_sector_packs WHERE id=OLD.pack_id)='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_APPROVED_PACK_LOCKED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0282_v2_sector_module_locked BEFORE UPDATE ON v2_sector_modules
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_sector_module_locked();

-- v2_sector_module_review
CREATE FUNCTION pi_compat.v2_sector_module_review() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL
 OR LENGTH(TRIM(COALESCE(NEW.review_reference,'')))<4) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_MODULE_REVIEW_REQUIRED';
  END IF;
  IF (NEW.classification='reserved_external' AND NOT EXISTS(
 SELECT 1 FROM v2_sector_module_clearances c WHERE c.module_code=NEW.code AND c.status='verified'
 AND c.valid_until>pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_RESERVED_PROVIDER_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0283_v2_sector_module_review BEFORE UPDATE OF status ON v2_sector_modules
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_sector_module_review();

-- v2_sector_clearance_delete
CREATE FUNCTION pi_compat.v2_sector_clearance_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_SECTOR_CLEARANCE_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0284_v2_sector_clearance_delete BEFORE DELETE ON v2_sector_module_clearances
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_sector_clearance_delete();

-- v2_sector_clearance_immutable
CREATE FUNCTION pi_compat.v2_sector_clearance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='verified' OR NEW.status!='revoked'
 OR NEW.module_code!=OLD.module_code OR NEW.credential_reference!=OLD.credential_reference
 OR NEW.independent_check_reference!=OLD.independent_check_reference) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_SECTOR_CLEARANCE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0285_v2_sector_clearance_immutable BEFORE UPDATE ON v2_sector_module_clearances
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_sector_clearance_immutable();

-- v2_asset_risk_delete
CREATE FUNCTION pi_compat.v2_asset_risk_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_RISK_HISTORY_LOCKED';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0286_v2_asset_risk_delete BEFORE DELETE ON v2_asset_risks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_asset_risk_delete();

-- v2_asset_risk_lock
CREATE FUNCTION pi_compat.v2_asset_risk_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='open' OR NEW.status NOT IN('mitigated','accepted')
 OR NEW.asset_id!=OLD.asset_id OR NEW.category!=OLD.category
 OR NEW.likelihood!=OLD.likelihood OR NEW.impact!=OLD.impact) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_RISK_HISTORY_LOCKED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0287_v2_asset_risk_lock BEFORE UPDATE ON v2_asset_risks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_asset_risk_lock();

-- v2_compliance_action_delete
CREATE FUNCTION pi_compat.v2_compliance_action_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_COMPLIANCE_ACTION_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0288_v2_compliance_action_delete BEFORE DELETE ON v2_compliance_actions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_compliance_action_delete();

-- v2_compliance_action_lock
CREATE FUNCTION pi_compat.v2_compliance_action_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='open' OR NEW.status NOT IN('done','cancelled')
 OR NEW.obligation_id!=OLD.obligation_id OR NEW.action_text!=OLD.action_text
 OR NEW.due_on!=OLD.due_on OR NEW.assignee_id!=OLD.assignee_id) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_COMPLIANCE_ACTION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0289_v2_compliance_action_lock BEFORE UPDATE ON v2_compliance_actions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_compliance_action_lock();

-- v2_compliance_evidence_delete
CREATE FUNCTION pi_compat.v2_compliance_evidence_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_COMPLIANCE_EVIDENCE_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0290_v2_compliance_evidence_delete BEFORE DELETE ON v2_compliance_evidence
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_compliance_evidence_delete();

-- v2_compliance_evidence_lock
CREATE FUNCTION pi_compat.v2_compliance_evidence_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='submitted' OR NEW.status NOT IN('verified','rejected')
 OR NEW.obligation_id!=OLD.obligation_id OR NEW.document_id IS DISTINCT FROM OLD.document_id
 OR NEW.evidence_reference!=OLD.evidence_reference OR NEW.issued_on!=OLD.issued_on
 OR NEW.expires_on IS DISTINCT FROM OLD.expires_on OR NEW.kind!=OLD.kind OR NEW.provider_name!=OLD.provider_name) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_COMPLIANCE_EVIDENCE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0291_v2_compliance_evidence_lock BEFORE UPDATE ON v2_compliance_evidence
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_compliance_evidence_lock();

-- v2_compliance_evidence_scope
CREATE FUNCTION pi_compat.v2_compliance_evidence_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.document_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM documents d JOIN v2_compliance_obligations o ON o.id=NEW.obligation_id
 JOIN v2_assets a ON a.id=o.asset_id
 WHERE d.id=NEW.document_id AND d.status='issued'
 AND d.property_id IS NOT DISTINCT FROM a.property_id AND d.scheme_id IS NOT DISTINCT FROM a.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_COMPLIANCE_EVIDENCE_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0292_v2_compliance_evidence_scope BEFORE INSERT ON v2_compliance_evidence
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_compliance_evidence_scope();

-- v2_compliance_identity_lock
CREATE FUNCTION pi_compat.v2_compliance_identity_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='draft') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_COMPLIANCE_SCOPE_LOCKED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0293_v2_compliance_identity_lock BEFORE UPDATE OF engagement_id,asset_id,category,source_reference,accountable_party ON v2_compliance_obligations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_compliance_identity_lock();

-- v2_compliance_activation
CREATE FUNCTION pi_compat.v2_compliance_activation() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='tracked' AND OLD.status!='tracked') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR
 LENGTH(TRIM(COALESCE(NEW.review_reference,'')))<4 OR LENGTH(TRIM(NEW.source_reference))<4) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_COMPLIANCE_AUTHORITY_REQUIRED';
  END IF;
  IF (NOT EXISTS(
 SELECT 1 FROM v2_engagements e WHERE e.id=NEW.engagement_id AND e.status='active')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_COMPLIANCE_ENGAGEMENT_INACTIVE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0294_v2_compliance_activation BEFORE UPDATE OF status ON v2_compliance_obligations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_compliance_activation();

-- v2_compliance_scope
CREATE FUNCTION pi_compat.v2_compliance_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_assets a JOIN v2_engagements e ON e.id=NEW.engagement_id
 WHERE a.id=NEW.asset_id AND a.property_id IS NOT DISTINCT FROM e.property_id AND a.scheme_id IS NOT DISTINCT FROM e.scheme_id
 AND e.status='active')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_COMPLIANCE_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0295_v2_compliance_scope BEFORE INSERT ON v2_compliance_obligations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_compliance_scope();

-- v2_pm_occurrence_immutable_d
CREATE FUNCTION pi_compat.v2_pm_occurrence_immutable_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PM_HISTORY_LOCKED';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0296_v2_pm_occurrence_immutable_d BEFORE DELETE ON v2_preventive_occurrences
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_pm_occurrence_immutable_d();

-- v2_pm_occurrence_immutable_u
CREATE FUNCTION pi_compat.v2_pm_occurrence_immutable_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PM_HISTORY_LOCKED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0297_v2_pm_occurrence_immutable_u BEFORE UPDATE ON v2_preventive_occurrences
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_pm_occurrence_immutable_u();

-- v2_pm_occurrence_guard
CREATE FUNCTION pi_compat.v2_pm_occurrence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_preventive_plans p JOIN v2_engagements e ON e.id=p.engagement_id
 WHERE p.id=NEW.plan_id AND p.status='active' AND e.status='active' AND p.next_due=NEW.due_on)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PM_PLAN_INACTIVE';
  END IF;
  IF (NEW.work_order_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM work_orders w JOIN v2_preventive_plans p ON p.id=NEW.plan_id
 JOIN v2_engagements e ON e.id=p.engagement_id WHERE w.id=NEW.work_order_id
 AND w.client_id=e.client_id AND w.property_id IS NOT DISTINCT FROM e.property_id AND w.scheme_id IS NOT DISTINCT FROM e.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PM_ORDER_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0298_v2_pm_occurrence_guard BEFORE INSERT ON v2_preventive_occurrences
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_pm_occurrence_guard();

-- v2_preventive_scope_lock
CREATE FUNCTION pi_compat.v2_preventive_scope_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='draft') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PM_SCOPE_LOCKED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0299_v2_preventive_scope_lock BEFORE UPDATE OF engagement_id,asset_id,service_code,cadence_months ON v2_preventive_plans
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_preventive_scope_lock();

-- v2_preventive_activate
CREATE FUNCTION pi_compat.v2_preventive_activate() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='active' AND OLD.status!='active') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.authority_reference IS NULL
 OR LENGTH(TRIM(NEW.authority_reference))<4 OR NEW.verified_by IS NULL OR NEW.verified_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PM_AUTHORITY_REQUIRED';
  END IF;
  IF (NOT EXISTS(
 SELECT 1 FROM v2_assets a JOIN v2_engagements e ON e.id=NEW.engagement_id
 JOIN v2_market_service_rules r ON r.market_code=e.market_code AND r.service_code=NEW.service_code
 JOIN v2_services s ON s.code=NEW.service_code
 WHERE a.id=NEW.asset_id AND a.status='active' AND a.property_id IS NOT DISTINCT FROM e.property_id
 AND a.scheme_id IS NOT DISTINCT FROM e.scheme_id AND e.status='active' AND r.status='approved' AND s.status='approved')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PM_ENGAGEMENT_INACTIVE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0300_v2_preventive_activate BEFORE UPDATE OF status ON v2_preventive_plans
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_preventive_activate();

-- v2_preventive_scope
CREATE FUNCTION pi_compat.v2_preventive_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_assets a JOIN v2_engagements e ON e.id=NEW.engagement_id
 JOIN v2_market_service_rules r ON r.market_code=e.market_code AND r.service_code=NEW.service_code
 JOIN v2_services s ON s.code=NEW.service_code
 WHERE a.id=NEW.asset_id AND a.status='active' AND a.property_id IS NOT DISTINCT FROM e.property_id
 AND a.scheme_id IS NOT DISTINCT FROM e.scheme_id AND e.status='active'
 AND r.status='approved' AND s.status='approved')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PM_ENGAGEMENT_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0301_v2_preventive_scope BEFORE INSERT ON v2_preventive_plans
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_preventive_scope();

-- v2_warranty_immutable_d
CREATE FUNCTION pi_compat.v2_warranty_immutable_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_WARRANTY_HISTORY_LOCKED';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0302_v2_warranty_immutable_d BEFORE DELETE ON v2_asset_warranties
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_warranty_immutable_d();

-- v2_warranty_immutable_u
CREATE FUNCTION pi_compat.v2_warranty_immutable_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_WARRANTY_HISTORY_LOCKED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0303_v2_warranty_immutable_u BEFORE UPDATE ON v2_asset_warranties
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_warranty_immutable_u();

-- v2_warranty_document_scope
CREATE FUNCTION pi_compat.v2_warranty_document_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.evidence_document_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_assets a JOIN documents d ON d.id=NEW.evidence_document_id
 WHERE a.id=NEW.asset_id AND d.property_id IS NOT DISTINCT FROM a.property_id AND d.scheme_id IS NOT DISTINCT FROM a.scheme_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_WARRANTY_DOCUMENT_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0304_v2_warranty_document_scope BEFORE INSERT ON v2_asset_warranties
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_warranty_document_scope();

-- v2_condition_after_verify
CREATE FUNCTION pi_compat.v2_condition_after_verify() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='verified') IS NOT TRUE THEN RETURN NEW; END IF;
  UPDATE v2_asset_details SET last_condition_score=NEW.score,last_condition_at=NEW.observed_on,
 updated_by=NEW.verified_by,updated_at=NEW.verified_at,version=version+1
 WHERE asset_id=NEW.asset_id AND (last_condition_at IS NULL OR last_condition_at<=NEW.observed_on);
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0305_v2_condition_after_verify AFTER UPDATE OF status ON v2_asset_conditions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_condition_after_verify();

-- v2_condition_no_delete
CREATE FUNCTION pi_compat.v2_condition_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CONDITION_HISTORY_LOCKED';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0306_v2_condition_no_delete BEFORE DELETE ON v2_asset_conditions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_condition_no_delete();

-- v2_condition_review_lock
CREATE FUNCTION pi_compat.v2_condition_review_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='submitted' OR NEW.status NOT IN('verified','rejected')
 OR NEW.id!=OLD.id OR NEW.asset_id!=OLD.asset_id OR NEW.score!=OLD.score
 OR NEW.observed_on!=OLD.observed_on OR NEW.method!=OLD.method
 OR NEW.summary!=OLD.summary OR NEW.evidence_document_id IS DISTINCT FROM OLD.evidence_document_id) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CONDITION_HISTORY_LOCKED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0307_v2_condition_review_lock BEFORE UPDATE ON v2_asset_conditions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_condition_review_lock();

-- v2_condition_scope
CREATE FUNCTION pi_compat.v2_condition_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.evidence_document_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_assets a JOIN documents d ON d.id=NEW.evidence_document_id
 WHERE a.id=NEW.asset_id AND d.property_id IS NOT DISTINCT FROM a.property_id AND d.scheme_id IS NOT DISTINCT FROM a.scheme_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ASSET_CONDITION_DOCUMENT_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0308_v2_condition_scope BEFORE INSERT ON v2_asset_conditions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_condition_scope();

-- v2_asset_details_identity
CREATE FUNCTION pi_compat.v2_asset_details_identity() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ASSET_IDENTITY_LOCKED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0309_v2_asset_details_identity BEFORE UPDATE OF asset_id,asset_code ON v2_asset_details
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_asset_details_identity();

-- v2_asset_details_scope
CREATE FUNCTION pi_compat.v2_asset_details_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_assets a WHERE a.id=NEW.asset_id AND a.status='active')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ASSET_RETIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0310_v2_asset_details_scope BEFORE INSERT ON v2_asset_details
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_asset_details_scope();

-- v2_cost_budget_guard
CREATE FUNCTION pi_compat.v2_cost_budget_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t WHERE t.id=NEW.task_id AND t.budget_ceiling_cents>0
 AND ((SELECT COALESCE(SUM(e.cost_cents),0) FROM v2_time_entries e WHERE e.task_id=t.id AND e.status='approved')
 + (SELECT COALESCE(SUM(c.amount_cents),0) FROM v2_external_costs c WHERE c.task_id=t.id AND c.status='approved')
 + NEW.amount_cents)>t.budget_ceiling_cents)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_BUDGET_EXCEEDED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0311_v2_cost_budget_guard BEFORE UPDATE OF status ON v2_external_costs
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_cost_budget_guard();

-- v2_time_budget_guard
CREATE FUNCTION pi_compat.v2_time_budget_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t WHERE t.id=NEW.task_id AND t.budget_ceiling_cents>0
 AND ((SELECT COALESCE(SUM(e.cost_cents),0) FROM v2_time_entries e WHERE e.task_id=t.id AND e.status='approved')
 + (SELECT COALESCE(SUM(c.amount_cents),0) FROM v2_external_costs c WHERE c.task_id=t.id AND c.status='approved')
 + NEW.cost_cents)>t.budget_ceiling_cents)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_BUDGET_EXCEEDED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0312_v2_time_budget_guard BEFORE UPDATE OF status ON v2_time_entries
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_time_budget_guard();

-- v2_external_cost_no_delete
CREATE FUNCTION pi_compat.v2_external_cost_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_COST_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0313_v2_external_cost_no_delete BEFORE DELETE ON v2_external_costs
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_external_cost_no_delete();

-- v2_external_cost_review_guard
CREATE FUNCTION pi_compat.v2_external_cost_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='submitted' OR NEW.status NOT IN('approved','rejected')
 OR NEW.task_id!=OLD.task_id OR NEW.amount_cents!=OLD.amount_cents
 OR NEW.category!=OLD.category OR NEW.contractor_id IS DISTINCT FROM OLD.contractor_id
 OR NEW.invoice_reference!=OLD.invoice_reference OR NEW.source_key!=OLD.source_key) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_COST_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0314_v2_external_cost_review_guard BEFORE UPDATE ON v2_external_costs
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_external_cost_review_guard();

-- v2_external_cost_guard
CREATE FUNCTION pi_compat.v2_external_cost_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id
 WHERE t.id=NEW.task_id AND t.status NOT IN('completed','cancelled')
 AND w.status NOT IN('completed','cancelled'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_COST_TASK_INVALID';
  END IF;
  IF (NEW.contractor_id IS NOT NULL AND
 NOT EXISTS(SELECT 1 FROM v2_task_assignments a WHERE a.task_id=NEW.task_id
 AND a.contractor_id=NEW.contractor_id AND a.status='confirmed')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_COST_CONTRACTOR_UNASSIGNED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0315_v2_external_cost_guard BEFORE INSERT ON v2_external_costs
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_external_cost_guard();

-- v2_time_no_delete
CREATE FUNCTION pi_compat.v2_time_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TIME_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0316_v2_time_no_delete BEFORE DELETE ON v2_time_entries
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_time_no_delete();

-- v2_time_review_guard
CREATE FUNCTION pi_compat.v2_time_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='submitted' OR NEW.status NOT IN('approved','rejected')
 OR NEW.id!=OLD.id OR NEW.task_id!=OLD.task_id OR NEW.staff_user_id!=OLD.staff_user_id
 OR NEW.started_at!=OLD.started_at OR NEW.ended_at!=OLD.ended_at
 OR NEW.minutes!=OLD.minutes OR NEW.source_key!=OLD.source_key) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TIME_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0317_v2_time_review_guard BEFORE UPDATE ON v2_time_entries
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_time_review_guard();

-- v2_time_insert_guard
CREATE FUNCTION pi_compat.v2_time_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id
 WHERE t.id=NEW.task_id AND t.status IN('assigned','scheduled','in_progress','evidence_pending')
 AND w.status NOT IN('completed','cancelled'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TIME_TASK_INVALID';
  END IF;
  IF (NOT EXISTS(
 SELECT 1 FROM v2_task_assignments a WHERE a.task_id=NEW.task_id
 AND a.staff_user_id=NEW.staff_user_id AND a.status='confirmed')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TIME_NOT_ASSIGNED';
  END IF;
  IF (NEW.ended_at>pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now') OR
 ABS((pi_compat.julianday(NEW.ended_at)-pi_compat.julianday(NEW.started_at))*1440-NEW.minutes)>0.02) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TIME_INVALID';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_time_entries e WHERE e.staff_user_id=NEW.staff_user_id
 AND e.status IN('submitted','approved') AND e.started_at<NEW.ended_at AND e.ended_at>NEW.started_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TIME_OVERLAP';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0318_v2_time_insert_guard BEFORE INSERT ON v2_time_entries
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_time_insert_guard();

-- v2_entitlement_immutable_d
CREATE FUNCTION pi_compat.v2_entitlement_immutable_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ENTITLEMENT_LINK_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0319_v2_entitlement_immutable_d BEFORE DELETE ON v2_task_entitlement_links
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_entitlement_immutable_d();

-- v2_entitlement_immutable_u
CREATE FUNCTION pi_compat.v2_entitlement_immutable_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ENTITLEMENT_LINK_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0320_v2_entitlement_immutable_u BEFORE UPDATE ON v2_task_entitlement_links
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_entitlement_immutable_u();

-- v2_entitlement_scope
CREATE FUNCTION pi_compat.v2_entitlement_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id
 JOIN v2_subscription_periods s ON s.id=NEW.subscription_id
 JOIN v2_engagements e ON e.id=s.engagement_id JOIN v2_plan_services ps ON ps.plan_id=s.plan_id
 JOIN v2_market_service_rules mr ON mr.market_code=e.market_code AND mr.service_code=NEW.service_code
 WHERE t.id=NEW.task_id AND t.status NOT IN('completed','cancelled')
 AND w.client_id=e.client_id AND w.property_id IS NOT DISTINCT FROM e.property_id AND w.scheme_id IS NOT DISTINCT FROM e.scheme_id
 AND s.status='active' AND e.status='active'
 AND ps.service_code=NEW.service_code AND ps.inclusion='included' AND mr.status='approved'
 AND EXISTS(SELECT 1 FROM v2_services ss WHERE ss.code=NEW.service_code AND ss.status='approved'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_ENTITLEMENT_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0321_v2_entitlement_scope BEFORE INSERT ON v2_task_entitlement_links
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_entitlement_scope();

-- v2_staff_rate_delete
CREATE FUNCTION pi_compat.v2_staff_rate_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_STAFF_RATE_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0322_v2_staff_rate_delete BEFORE DELETE ON v2_staff_cost_rates
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_staff_rate_delete();

-- v2_staff_rate_lock
CREATE FUNCTION pi_compat.v2_staff_rate_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_STAFF_RATE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0323_v2_staff_rate_lock BEFORE UPDATE ON v2_staff_cost_rates
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_staff_rate_lock();

-- v2_rate_approval_gate
CREATE FUNCTION pi_compat.v2_rate_approval_gate() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.approved_by IS NULL
 OR NEW.approved_at IS NULL OR LENGTH(TRIM(COALESCE(NEW.approval_reference,'')))<4) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_RATE_APPROVAL_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0324_v2_rate_approval_gate BEFORE UPDATE OF status ON v2_staff_cost_rates
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_rate_approval_gate();

-- v2_evidence_no_delete
CREATE FUNCTION pi_compat.v2_evidence_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_EVIDENCE_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0325_v2_evidence_no_delete BEFORE DELETE ON v2_task_evidence
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_evidence_no_delete();

-- v2_evidence_update_guard
CREATE FUNCTION pi_compat.v2_evidence_update_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='submitted' OR NEW.status NOT IN('verified','rejected')
 OR NEW.task_id!=OLD.task_id OR NEW.document_id IS DISTINCT FROM OLD.document_id
 OR NEW.reference!=OLD.reference OR NEW.kind!=OLD.kind) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_EVIDENCE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0326_v2_evidence_update_guard BEFORE UPDATE ON v2_task_evidence
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_evidence_update_guard();

-- v2_evidence_scope
CREATE FUNCTION pi_compat.v2_evidence_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t WHERE t.id=NEW.task_id AND t.status NOT IN('completed','cancelled'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_TERMINAL';
  END IF;
  IF (NEW.document_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM documents d JOIN v2_maintenance_tasks t ON t.id=NEW.task_id
 JOIN work_orders w ON w.id=t.work_order_id WHERE d.id=NEW.document_id
 AND d.property_id IS NOT DISTINCT FROM w.property_id AND d.scheme_id IS NOT DISTINCT FROM w.scheme_id AND d.status='issued')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_EVIDENCE_DOCUMENT_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0327_v2_evidence_scope BEFORE INSERT ON v2_task_evidence
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_evidence_scope();

-- v2_legacy_staff_assignment_collision
CREATE FUNCTION pi_compat.v2_legacy_staff_assignment_collision() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.assigned_staff_id IS NOT NULL AND NEW.booking_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (EXISTS(
 SELECT 1 FROM bookings b JOIN v2_capacity_resources r ON r.staff_user_id=NEW.assigned_staff_id AND r.kind='staff'
 JOIN v2_resource_allocations a ON a.resource_id=r.id AND a.status='confirmed'
 JOIN v2_maintenance_tasks t ON t.id=a.task_id
 WHERE b.id=NEW.booking_id AND t.work_order_id!=NEW.id
 AND b.reserved_start<a.ends_at AND b.reserved_end>a.starts_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_STAFF_CAPACITY_CONFLICT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0328_v2_legacy_staff_assignment_collision BEFORE UPDATE OF assigned_staff_id ON work_orders
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_legacy_staff_assignment_collision();

-- v2_allocation_no_delete
CREATE FUNCTION pi_compat.v2_allocation_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ALLOCATION_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0329_v2_allocation_no_delete BEFORE DELETE ON v2_resource_allocations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_allocation_no_delete();

-- v2_allocation_status_guard
CREATE FUNCTION pi_compat.v2_allocation_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='confirmed' OR NEW.status NOT IN('released','completed')
 OR NEW.id!=OLD.id OR NEW.task_id!=OLD.task_id OR NEW.resource_id!=OLD.resource_id
 OR NEW.starts_at!=OLD.starts_at OR NEW.ends_at!=OLD.ends_at) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ALLOCATION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0330_v2_allocation_status_guard BEFORE UPDATE ON v2_resource_allocations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_allocation_status_guard();

-- v2_allocation_guard
CREATE FUNCTION pi_compat.v2_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_capacity_resources r WHERE r.id=NEW.resource_id AND r.active=1)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_RESOURCE_INACTIVE';
  END IF;
  IF (NOT EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id
 WHERE t.id=NEW.task_id AND t.status IN('assigned','scheduled') AND w.status NOT IN('completed','cancelled'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_NOT_SCHEDULABLE';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_capacity_resources r WHERE r.id=NEW.resource_id AND r.kind IN('staff','contractor')
 AND NOT EXISTS(SELECT 1 FROM v2_task_assignments a WHERE a.task_id=NEW.task_id
 AND a.status='confirmed' AND (a.staff_user_id=r.staff_user_id AND r.kind='staff'
 OR a.contractor_id=r.contractor_id AND r.kind='contractor')))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_RESOURCE_UNASSIGNED';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_capacity_resources r JOIN v2_maintenance_tasks t ON t.id=NEW.task_id
 WHERE r.id=NEW.resource_id AND r.kind IN('staff','contractor') AND NOT EXISTS(
 SELECT 1 FROM v2_resource_skills s WHERE s.resource_id=r.id AND s.trade=t.trade))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_RESOURCE_TRADE_MISMATCH';
  END IF;
  IF (NEW.starts_at>=NEW.ends_at OR
 (pi_compat.julianday(NEW.ends_at)-pi_compat.julianday(NEW.starts_at))*24*60>720 OR
 pi_compat.strftime('%Y-%m-%d',NEW.starts_at,'+8 hours')!=pi_compat.strftime('%Y-%m-%d',NEW.ends_at,'+8 hours') OR
 CAST(pi_compat.strftime('%M',NEW.starts_at,'+8 hours') AS BIGINT)%15!=0 OR
 CAST(pi_compat.strftime('%s',NEW.starts_at) AS BIGINT)%60!=0) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_RESOURCE_TIME_INVALID';
  END IF;
  IF (NOT EXISTS(
 SELECT 1 FROM v2_roster_windows r WHERE r.resource_id=NEW.resource_id
 AND r.weekday=CASE CAST(pi_compat.strftime('%w',NEW.starts_at,'+8 hours') AS BIGINT)
 WHEN 0 THEN 7 ELSE CAST(pi_compat.strftime('%w',NEW.starts_at,'+8 hours') AS BIGINT) END
 AND r.starts_minute <= (CAST(pi_compat.strftime('%H',NEW.starts_at,'+8 hours') AS BIGINT)*60+CAST(pi_compat.strftime('%M',NEW.starts_at,'+8 hours') AS BIGINT))
 AND r.ends_minute >= (CAST(pi_compat.strftime('%H',NEW.ends_at,'+8 hours') AS BIGINT)*60+CAST(pi_compat.strftime('%M',NEW.ends_at,'+8 hours') AS BIGINT)))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_OUTSIDE_ROSTER';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_resource_allocations a WHERE a.resource_id=NEW.resource_id AND a.status='confirmed'
 AND a.starts_at<NEW.ends_at AND a.ends_at>NEW.starts_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_RESOURCE_DOUBLE_BOOKED';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_capacity_blocks b WHERE b.resource_id=NEW.resource_id
 AND b.starts_at<NEW.ends_at AND b.ends_at>NEW.starts_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_RESOURCE_BLOCKED';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_capacity_resources r JOIN work_orders w ON w.assigned_staff_id=r.staff_user_id
 JOIN bookings b ON b.id=w.booking_id JOIN v2_maintenance_tasks t ON t.id=NEW.task_id
 WHERE r.id=NEW.resource_id AND r.kind='staff' AND b.status!='cancelled'
 AND w.id!=t.work_order_id AND b.reserved_start<NEW.ends_at AND b.reserved_end>NEW.starts_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_STAFF_LEGACY_BOOKING_CONFLICT';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id
 JOIN bookings b ON b.id=w.booking_id WHERE t.id=NEW.task_id AND b.status!='cancelled'
 AND (NEW.starts_at<b.starts_at OR NEW.ends_at>b.ends_at))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_BOOKED_JOB_WINDOW_MISMATCH';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_capacity_resources r JOIN v2_task_assignments a ON a.contractor_id=r.contractor_id
 JOIN v2_maintenance_tasks t ON t.id=a.task_id WHERE r.id=NEW.resource_id AND r.kind='contractor'
 AND t.id=NEW.task_id AND a.status='confirmed' AND (
 NOT EXISTS(SELECT 1 FROM v2_contractor_credentials c WHERE c.contractor_id=r.contractor_id
 AND c.credential_type='insurance' AND c.status='verified' AND c.valid_until>NEW.ends_at)
 OR (t.trade IN('electrical','plumbing','fire') AND NOT EXISTS(
 SELECT 1 FROM v2_contractor_credentials c WHERE c.contractor_id=r.contractor_id
 AND c.credential_type='licence' AND c.trade=t.trade AND c.status='verified' AND c.valid_until>NEW.ends_at))
 OR EXISTS(SELECT 1 FROM v2_task_credential_requirements cr WHERE cr.task_id=t.id
 AND NOT EXISTS(SELECT 1 FROM v2_contractor_credentials c
 WHERE c.contractor_id=r.contractor_id AND c.credential_type=cr.credential_type
 AND (c.trade=t.trade OR c.trade='general') AND c.status='verified' AND c.valid_until>NEW.ends_at))
 ))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CONTRACTOR_CREDENTIAL_EXPIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0331_v2_allocation_guard BEFORE INSERT ON v2_resource_allocations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_allocation_guard();

-- v2_capacity_block_guard
CREATE FUNCTION pi_compat.v2_capacity_block_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (EXISTS(
 SELECT 1 FROM v2_resource_allocations a WHERE a.resource_id=NEW.resource_id AND a.status='confirmed'
 AND a.starts_at<NEW.ends_at AND a.ends_at>NEW.starts_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_BLOCK_ALLOCATION_CONFLICT';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_capacity_resources r JOIN work_orders w ON w.assigned_staff_id=r.staff_user_id
 JOIN bookings b ON b.id=w.booking_id WHERE r.id=NEW.resource_id AND r.kind='staff' AND b.status!='cancelled'
 AND b.reserved_start<NEW.ends_at AND b.reserved_end>NEW.starts_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_BLOCK_BOOKING_CONFLICT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0332_v2_capacity_block_guard BEFORE INSERT ON v2_capacity_blocks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_capacity_block_guard();

-- v2_assignment_no_delete
CREATE FUNCTION pi_compat.v2_assignment_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ASSIGNMENT_HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0333_v2_assignment_no_delete BEFORE DELETE ON v2_task_assignments
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_assignment_no_delete();

-- v2_assignment_release_only
CREATE FUNCTION pi_compat.v2_assignment_release_only() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='confirmed' OR NEW.status!='released'
OR NEW.task_id!=OLD.task_id OR NEW.staff_user_id IS DISTINCT FROM OLD.staff_user_id
OR NEW.contractor_id IS DISTINCT FROM OLD.contractor_id) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ASSIGNMENT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0334_v2_assignment_release_only BEFORE UPDATE ON v2_task_assignments
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_assignment_release_only();

-- v2_assignment_guard
CREATE FUNCTION pi_compat.v2_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id
 WHERE t.id=NEW.task_id AND t.status IN('scoped','awaiting_approval','approved','assigned')
 AND w.status NOT IN('completed','cancelled'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_NOT_ASSIGNABLE';
  END IF;
  IF (NEW.staff_user_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM staff_profiles s JOIN users u ON u.id=s.user_id WHERE s.user_id=NEW.staff_user_id
 AND s.active=1 AND u.active=1 AND s.role IN('administrator','operations_manager','inspector'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_STAFF_INACTIVE';
  END IF;
  IF (NEW.contractor_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM contractors c WHERE c.id=NEW.contractor_id AND c.active=1)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CONTRACTOR_INACTIVE';
  END IF;
  IF (NEW.contractor_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_contractor_credentials c WHERE c.contractor_id=NEW.contractor_id
 AND c.credential_type='insurance' AND c.status='verified' AND c.valid_until>NEW.assigned_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CONTRACTOR_INSURANCE_REQUIRED';
  END IF;
  IF (NEW.contractor_id IS NOT NULL AND
 (SELECT trade FROM v2_maintenance_tasks WHERE id=NEW.task_id) IN('electrical','plumbing','fire')
 AND NOT EXISTS(SELECT 1 FROM v2_contractor_credentials c JOIN v2_maintenance_tasks t ON t.id=NEW.task_id
 WHERE c.contractor_id=NEW.contractor_id AND c.credential_type='licence'
 AND c.trade=t.trade AND c.status='verified' AND c.valid_until>NEW.assigned_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TRADE_LICENCE_REQUIRED';
  END IF;
  IF (NEW.contractor_id IS NOT NULL AND EXISTS(
 SELECT 1 FROM v2_task_credential_requirements r WHERE r.task_id=NEW.task_id AND NOT EXISTS(
 SELECT 1 FROM v2_contractor_credentials c JOIN v2_maintenance_tasks t ON t.id=NEW.task_id
 WHERE c.contractor_id=NEW.contractor_id AND c.credential_type=r.credential_type
 AND (c.trade=t.trade OR c.trade='general') AND c.status='verified' AND c.valid_until>NEW.assigned_at))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CONTRACTOR_CREDENTIAL_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0335_v2_assignment_guard BEFORE INSERT ON v2_task_assignments
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_assignment_guard();

-- v2_task_requirement_lock
CREATE FUNCTION pi_compat.v2_task_requirement_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF ((SELECT status FROM v2_maintenance_tasks WHERE id=NEW.task_id)!='scoped') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_SCOPE_LOCKED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0336_v2_task_requirement_lock BEFORE INSERT ON v2_task_credential_requirements
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_task_requirement_lock();

-- v2_credential_immutable
CREATE FUNCTION pi_compat.v2_credential_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_CREDENTIAL_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0337_v2_credential_immutable BEFORE UPDATE OF contractor_id,credential_type,trade,credential_reference,verification_reference,verified_by,verified_at,valid_until,created_at ON v2_contractor_credentials
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_credential_immutable();

-- v2_parent_order_close
CREATE FUNCTION pi_compat.v2_parent_order_close() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status IN('completed','cancelled') AND OLD.status!=NEW.status) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t WHERE t.work_order_id=NEW.id
 AND t.status NOT IN('completed','cancelled'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_WORK_PACKAGE_OPEN';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0338_v2_parent_order_close BEFORE UPDATE OF status ON work_orders
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_parent_order_close();

-- v2_task_status_guard
CREATE FUNCTION pi_compat.v2_task_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status != OLD.status) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT (
 (OLD.status='scoped' AND NEW.status IN('awaiting_approval','approved','assigned','cancelled')) OR
 (OLD.status='awaiting_approval' AND NEW.status IN('approved','cancelled')) OR
 (OLD.status='approved' AND NEW.status IN('assigned','cancelled')) OR
 (OLD.status='assigned' AND NEW.status IN('scheduled','in_progress','cancelled')) OR
 (OLD.status='scheduled' AND NEW.status IN('assigned','in_progress','cancelled')) OR
 (OLD.status='in_progress' AND NEW.status IN('evidence_pending','completed','cancelled')) OR
 (OLD.status='evidence_pending' AND NEW.status IN('in_progress','completed','cancelled')))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_TRANSITION';
  END IF;
  IF (NOT EXISTS(
 SELECT 1 FROM work_orders w WHERE w.id=NEW.work_order_id AND w.status NOT IN('completed','cancelled'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ORDER_TERMINAL';
  END IF;
  IF (NEW.status IN
 ('approved','assigned','scheduled','in_progress','evidence_pending','completed') AND EXISTS(
 SELECT 1 FROM work_orders w WHERE w.id=NEW.work_order_id
 AND (NEW.approval_required=1 OR w.approval_required=1)
 AND NOT EXISTS(SELECT 1 FROM approvals a WHERE a.work_order_id=w.id AND a.status='approved'
 AND a.amount_cents >= (SELECT COALESCE(SUM(t.budget_ceiling_cents),0)
 FROM v2_maintenance_tasks t WHERE t.work_order_id=w.id AND t.status!='cancelled')))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_APPROVAL_REQUIRED';
  END IF;
  IF (NEW.status IN
 ('assigned','scheduled','in_progress','evidence_pending','completed') AND NOT EXISTS(
 SELECT 1 FROM v2_task_assignments a WHERE a.task_id=NEW.id AND a.status='confirmed')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_ASSIGNMENT_REQUIRED';
  END IF;
  IF (NEW.status='completed' AND NOT EXISTS(
 SELECT 1 FROM v2_task_evidence e WHERE e.task_id=NEW.id AND e.status='verified'
 AND (e.kind=NEW.evidence_kind OR NEW.evidence_kind='note'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_EVIDENCE_REQUIRED';
  END IF;
  IF (NEW.status='completed' AND (
 EXISTS(SELECT 1 FROM v2_time_entries e WHERE e.task_id=NEW.id AND e.status='submitted')
 OR EXISTS(SELECT 1 FROM v2_external_costs c WHERE c.task_id=NEW.id AND c.status='submitted'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_REVIEW_PENDING';
  END IF;
  IF (NEW.status='completed'
 AND (NEW.completed_by IS NULL OR NEW.completed_at IS NULL OR LENGTH(TRIM(COALESCE(NEW.completion_summary,'')))<4)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_CLOSEOUT_ACTOR';
  END IF;
  IF (NEW.status IN('completed','cancelled')
 AND EXISTS(SELECT 1 FROM v2_resource_allocations a WHERE a.task_id=NEW.id AND a.status='confirmed')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_ALLOCATION_OPEN';
  END IF;
  IF (NEW.status IN('scheduled','in_progress','evidence_pending','completed')
 AND EXISTS(SELECT 1 FROM v2_task_assignments a WHERE a.task_id=NEW.id AND a.contractor_id IS NOT NULL
 AND a.status='confirmed' AND NOT EXISTS(SELECT 1 FROM v2_contractor_credentials c
 WHERE c.contractor_id=a.contractor_id AND c.credential_type='insurance' AND c.status='verified'
 AND c.valid_until>pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now')))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_CREDENTIAL_REVOKED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0339_v2_task_status_guard BEFORE UPDATE OF status ON v2_maintenance_tasks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_task_status_guard();

-- v2_task_scope_update
CREATE FUNCTION pi_compat.v2_task_scope_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.asset_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_assets a JOIN work_orders w ON w.id=NEW.work_order_id WHERE a.id=NEW.asset_id
 AND (a.property_id IS NOT DISTINCT FROM w.property_id AND a.scheme_id IS NOT DISTINCT FROM w.scheme_id))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_ASSET_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0340_v2_task_scope_update BEFORE UPDATE OF asset_id ON v2_maintenance_tasks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_task_scope_update();

-- v2_task_immutable_scope
CREATE FUNCTION pi_compat.v2_task_immutable_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='scoped') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_SCOPE_LOCKED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0341_v2_task_immutable_scope BEFORE UPDATE OF work_order_id,asset_id,trade,approval_required,budget_ceiling_cents,evidence_kind ON v2_maintenance_tasks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_task_immutable_scope();

-- v2_task_insert_scope
CREATE FUNCTION pi_compat.v2_task_insert_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM work_orders w WHERE w.id=NEW.work_order_id AND w.status NOT IN('completed','cancelled'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ORDER_TERMINAL';
  END IF;
  IF (NEW.asset_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_assets a JOIN work_orders w ON w.id=NEW.work_order_id WHERE a.id=NEW.asset_id
 AND (a.property_id IS NOT DISTINCT FROM w.property_id AND a.scheme_id IS NOT DISTINCT FROM w.scheme_id))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_TASK_ASSET_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0342_v2_task_insert_scope BEFORE INSERT ON v2_maintenance_tasks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_task_insert_scope();

-- v2_scheme_lot_sync
CREATE FUNCTION pi_compat.v2_scheme_lot_sync() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  INSERT INTO v2_assets(id,scheme_id,parent_id,kind,name,created_at)
 VALUES('v2:lot:'||NEW.id,NEW.scheme_id,COALESCE('v2:building:'||NEW.building_id,'v2:scheme:'||NEW.scheme_id),'lot',NEW.lot_number,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'));
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0343_v2_scheme_lot_sync AFTER INSERT ON strata_lots
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_scheme_lot_sync();

-- v2_scheme_area_sync
CREATE FUNCTION pi_compat.v2_scheme_area_sync() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  INSERT INTO v2_assets(id,scheme_id,parent_id,kind,name,created_at)
 VALUES('v2:area:'||NEW.id,NEW.scheme_id,COALESCE('v2:building:'||NEW.building_id,'v2:scheme:'||NEW.scheme_id),'common_area',NEW.name,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'));
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0344_v2_scheme_area_sync AFTER INSERT ON common_property_areas
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_scheme_area_sync();

-- v2_scheme_building_sync
CREATE FUNCTION pi_compat.v2_scheme_building_sync() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  INSERT INTO v2_assets(id,scheme_id,parent_id,kind,name,created_at)
 VALUES('v2:building:'||NEW.id,NEW.scheme_id,'v2:scheme:'||NEW.scheme_id,'building',NEW.name,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'));
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0345_v2_scheme_building_sync AFTER INSERT ON scheme_buildings
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_scheme_building_sync();

-- v2_scheme_root
CREATE FUNCTION pi_compat.v2_scheme_root() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  INSERT INTO v2_assets(id,scheme_id,kind,name,created_at) VALUES('v2:scheme:'||NEW.id,NEW.id,'site',NEW.name,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'));
  INSERT INTO v2_asset_markets(id,scheme_id,market_code) VALUES('v2:market:scheme:'||NEW.id,NEW.id,'STR');
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0346_v2_scheme_root AFTER INSERT ON strata_schemes
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_scheme_root();

-- v2_property_root
CREATE FUNCTION pi_compat.v2_property_root() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  INSERT INTO v2_assets(id,property_id,kind,name,created_at) VALUES('v2:property:'||NEW.id,NEW.id,'site',NEW.address,to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'));
  INSERT INTO v2_asset_markets(id,property_id,market_code) VALUES('v2:market:property:'||NEW.id,NEW.id,CASE NEW.sector WHEN 'residential' THEN 'RES' WHEN 'commercial' THEN 'COM' ELSE 'STR' END);
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0347_v2_property_root AFTER INSERT ON properties
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_property_root();

-- v2_quote_immutable_d
CREATE FUNCTION pi_compat.v2_quote_immutable_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_QUOTE_SNAPSHOT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0348_v2_quote_immutable_d BEFORE DELETE ON v2_quote_snapshots
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_quote_immutable_d();

-- v2_quote_immutable_u
CREATE FUNCTION pi_compat.v2_quote_immutable_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_QUOTE_SNAPSHOT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0349_v2_quote_immutable_u BEFORE UPDATE ON v2_quote_snapshots
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_quote_immutable_u();

-- v2_quote_scope_gate
CREATE FUNCTION pi_compat.v2_quote_scope_gate() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS (
 SELECT 1 FROM v2_rate_cards r WHERE r.id=NEW.rate_card_id AND r.market_code=NEW.market_code AND r.status='approved')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_RATE_NOT_APPROVED';
  END IF;
  IF (NEW.service_code IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_market_service_rules mr JOIN v2_services s ON s.code=mr.service_code
 WHERE mr.market_code=NEW.market_code AND mr.service_code=NEW.service_code AND mr.status='approved' AND s.status='approved')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_QUOTE_SERVICE_NOT_APPROVED';
  END IF;
  IF (NEW.engagement_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_engagements e WHERE e.id=NEW.engagement_id AND e.client_id=NEW.client_id
 AND e.property_id IS NOT DISTINCT FROM NEW.property_id AND e.scheme_id IS NOT DISTINCT FROM NEW.scheme_id AND e.market_code=NEW.market_code)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_QUOTE_ENGAGEMENT_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0350_v2_quote_scope_gate BEFORE INSERT ON v2_quote_snapshots
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_quote_scope_gate();

-- v2_rate_card_approval
CREATE FUNCTION pi_compat.v2_rate_card_approval() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR LENGTH(TRIM(COALESCE(NEW.approval_reference,'')))<4) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_RATE_CARD_REVIEW_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0351_v2_rate_card_approval BEFORE UPDATE OF status ON v2_rate_cards
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_rate_card_approval();

-- v2_rate_card_lock
CREATE FUNCTION pi_compat.v2_rate_card_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_RATE_CARD_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0352_v2_rate_card_lock BEFORE UPDATE ON v2_rate_cards
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_rate_card_lock();

-- v2_usage_immutable_d
CREATE FUNCTION pi_compat.v2_usage_immutable_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_USAGE_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0353_v2_usage_immutable_d BEFORE DELETE ON v2_usage_ledger
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_usage_immutable_d();

-- v2_usage_immutable_u
CREATE FUNCTION pi_compat.v2_usage_immutable_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_USAGE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0354_v2_usage_immutable_u BEFORE UPDATE ON v2_usage_ledger
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_usage_immutable_u();

-- v2_usage_limit
CREATE FUNCTION pi_compat.v2_usage_limit() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_subscription_periods s JOIN v2_engagements e ON e.id=s.engagement_id
 JOIN v2_plan_versions p ON p.id=s.plan_id JOIN v2_plan_services ps ON ps.plan_id=p.id
 JOIN v2_market_service_rules mr ON mr.market_code=e.market_code AND mr.service_code=ps.service_code
 WHERE s.id=NEW.subscription_id AND s.status='active' AND e.status='active'
 AND p.status='approved' AND ps.inclusion='included' AND ps.service_code=NEW.service_code
 AND mr.status='approved' AND NEW.created_at>=s.period_start AND NEW.created_at<s.period_end
 AND EXISTS(SELECT 1 FROM v2_services ss WHERE ss.code=NEW.service_code AND ss.status='approved'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_USAGE_NOT_INCLUDED';
  END IF;
  IF ((NEW.work_order_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM work_orders o JOIN v2_subscription_periods s ON s.id=NEW.subscription_id
 JOIN v2_engagements e ON e.id=s.engagement_id WHERE o.id=NEW.work_order_id
 AND o.client_id=e.client_id AND o.property_id IS NOT DISTINCT FROM e.property_id AND o.scheme_id IS NOT DISTINCT FROM e.scheme_id))
 OR (NEW.booking_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM bookings b JOIN v2_subscription_periods s ON s.id=NEW.subscription_id
 JOIN v2_engagements e ON e.id=s.engagement_id WHERE b.id=NEW.booking_id
 AND b.client_id=e.client_id AND b.property_id=e.property_id AND e.scheme_id IS NULL))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_USAGE_CONTEXT_MISMATCH';
  END IF;
  IF ((SELECT COALESCE(SUM(u.quantity),0) FROM v2_usage_ledger u WHERE u.subscription_id=NEW.subscription_id AND u.metric=NEW.metric)+NEW.quantity >
 (SELECT CASE NEW.metric WHEN 'hours_milli' THEN p.included_hours_milli
 WHEN 'visits' THEN p.included_visits WHEN 'tickets' THEN p.included_tickets
 ELSE p.included_reports END
 FROM v2_subscription_periods s JOIN v2_plan_versions p ON p.id=s.plan_id WHERE s.id=NEW.subscription_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ENTITLEMENT_EXCEEDED';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_plan_entitlements pe JOIN v2_subscription_periods sp ON sp.plan_id=pe.plan_id
 WHERE sp.id=NEW.subscription_id AND pe.service_code=NEW.service_code AND pe.metric=NEW.metric
 AND (SELECT COALESCE(SUM(u.quantity),0) FROM v2_usage_ledger u WHERE u.subscription_id=NEW.subscription_id
 AND u.metric=NEW.metric AND u.service_code=NEW.service_code)+NEW.quantity>pe.limit_quantity)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_SERVICE_ALLOWANCE_EXCEEDED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0355_v2_usage_limit BEFORE INSERT ON v2_usage_ledger
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_usage_limit();

-- v2_subscription_lock
CREATE FUNCTION pi_compat.v2_subscription_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_SUBSCRIPTION_LOCKED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0356_v2_subscription_lock BEFORE UPDATE OF engagement_id,plan_id,period_start,period_end,agreed_monthly_cents ON v2_subscription_periods
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_subscription_lock();

-- v2_subscription_gate
CREATE FUNCTION pi_compat.v2_subscription_gate() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
 SELECT 1 FROM v2_engagements e JOIN v2_plan_versions p ON p.id=NEW.plan_id
 WHERE e.id=NEW.engagement_id AND e.status='active' AND p.status='approved'
 AND p.market_code=e.market_code AND e.starts_at<=NEW.period_start
 AND (e.ends_at IS NULL OR NEW.period_end<=e.ends_at)
 AND p.monthly_fee_cents=NEW.agreed_monthly_cents)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_SUBSCRIPTION_SCOPE';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_subscription_periods s WHERE s.engagement_id=NEW.engagement_id
 AND s.period_start<NEW.period_end AND s.period_end>NEW.period_start)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_SUBSCRIPTION_PERIOD_OVERLAP';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0357_v2_subscription_gate BEFORE INSERT ON v2_subscription_periods
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_subscription_gate();

-- v2_plan_entitlements_delete_gate
CREATE FUNCTION pi_compat.v2_plan_entitlements_delete_gate() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF ((SELECT status FROM v2_plan_versions WHERE id=OLD.plan_id)!='draft') IS NOT TRUE THEN RETURN OLD; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_APPROVED_PLAN_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0358_v2_plan_entitlements_delete_gate BEFORE DELETE ON v2_plan_entitlements
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_plan_entitlements_delete_gate();

-- v2_plan_entitlements_update_gate
CREATE FUNCTION pi_compat.v2_plan_entitlements_update_gate() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF ((SELECT status FROM v2_plan_versions WHERE id=OLD.plan_id)!='draft') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_APPROVED_PLAN_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0359_v2_plan_entitlements_update_gate BEFORE UPDATE ON v2_plan_entitlements
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_plan_entitlements_update_gate();

-- v2_plan_entitlements_insert_gate
CREATE FUNCTION pi_compat.v2_plan_entitlements_insert_gate() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF ((SELECT status FROM v2_plan_versions WHERE id=NEW.plan_id)!='draft') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_APPROVED_PLAN_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0360_v2_plan_entitlements_insert_gate BEFORE INSERT ON v2_plan_entitlements
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_plan_entitlements_insert_gate();

-- v2_plan_services_delete_gate
CREATE FUNCTION pi_compat.v2_plan_services_delete_gate() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF ((SELECT status FROM v2_plan_versions WHERE id=OLD.plan_id)!='draft') IS NOT TRUE THEN RETURN OLD; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_APPROVED_PLAN_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0361_v2_plan_services_delete_gate BEFORE DELETE ON v2_plan_services
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_plan_services_delete_gate();

-- v2_plan_services_update_gate
CREATE FUNCTION pi_compat.v2_plan_services_update_gate() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF ((SELECT status FROM v2_plan_versions WHERE id=OLD.plan_id)!='draft') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_APPROVED_PLAN_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0362_v2_plan_services_update_gate BEFORE UPDATE ON v2_plan_services
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_plan_services_update_gate();

-- v2_plan_services_insert_gate
CREATE FUNCTION pi_compat.v2_plan_services_insert_gate() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF ((SELECT status FROM v2_plan_versions WHERE id=NEW.plan_id)!='draft') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_APPROVED_PLAN_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0363_v2_plan_services_insert_gate BEFORE INSERT ON v2_plan_services
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_plan_services_insert_gate();

-- v2_plan_approve_gate
CREATE FUNCTION pi_compat.v2_plan_approve_gate() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.monthly_fee_cents IS NULL OR NEW.included_hours_milli IS NULL
 OR NEW.included_visits IS NULL OR NEW.included_tickets IS NULL OR NEW.included_reports IS NULL
 OR NEW.approved_by IS NULL OR NEW.approved_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PLAN_NOT_READY';
  END IF;
  IF (EXISTS(
 SELECT 1 FROM v2_plan_services ps LEFT JOIN v2_market_service_rules r ON r.market_code=NEW.market_code
 AND r.service_code=ps.service_code
 WHERE ps.plan_id=NEW.id AND ps.inclusion='included' AND (COALESCE(r.status,'blocked')!='approved' OR NOT EXISTS(SELECT 1 FROM v2_services vs WHERE vs.code=ps.service_code AND vs.status='approved')))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_UNAPPROVED_PLAN_SERVICES';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0364_v2_plan_approve_gate BEFORE UPDATE OF status ON v2_plan_versions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_plan_approve_gate();

-- v2_plan_version_delete
CREATE FUNCTION pi_compat.v2_plan_version_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_PLAN_HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0365_v2_plan_version_delete BEFORE DELETE ON v2_plan_versions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_plan_version_delete();

-- v2_plan_version_immutable
CREATE FUNCTION pi_compat.v2_plan_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_APPROVED_PLAN_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0366_v2_plan_version_immutable BEFORE UPDATE ON v2_plan_versions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_plan_version_immutable();

-- v2_engagement_scope_lock
CREATE FUNCTION pi_compat.v2_engagement_scope_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status!='draft') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ENGAGEMENT_SCOPE_LOCKED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0367_v2_engagement_scope_lock BEFORE UPDATE OF client_id,property_id,scheme_id,market_code,starts_at ON v2_engagements
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_engagement_scope_lock();

-- v2_engagement_activation
CREATE FUNCTION pi_compat.v2_engagement_activation() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='active' AND OLD.status!='active') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.authority_reference IS NULL OR NEW.verified_by IS NULL
 OR NEW.verified_at IS NULL OR NEW.ends_at IS NOT NULL AND pi_compat.julianday(NEW.ends_at)<=pi_compat.julianday('now')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_UNVERIFIED_ENGAGEMENT';
  END IF;
  IF (NOT EXISTS(
 SELECT 1 FROM v2_asset_markets am JOIN v2_markets m ON m.code=am.market_code AND m.enabled=1 WHERE am.market_code=NEW.market_code AND am.status='approved'
 AND am.property_id IS NOT DISTINCT FROM NEW.property_id AND am.scheme_id IS NOT DISTINCT FROM NEW.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_UNAPPROVED_MARKET';
  END IF;
  IF (NOT EXISTS(
   SELECT 1 FROM client_property_links l WHERE NEW.property_id IS NOT NULL
   AND l.client_id=NEW.client_id AND l.property_id=NEW.property_id
   AND l.starts_at<=pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (l.ends_at IS NULL OR l.ends_at>pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 ) AND NOT EXISTS(
   SELECT 1 FROM scheme_client_links l WHERE NEW.scheme_id IS NOT NULL
   AND l.client_id=NEW.client_id AND l.scheme_id=NEW.scheme_id
   AND l.starts_at<=pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (l.ends_at IS NULL OR l.ends_at>pi_compat.strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ENGAGEMENT_RELATIONSHIP_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0368_v2_engagement_activation BEFORE UPDATE OF status ON v2_engagements
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_engagement_activation();

-- v2_asset_market_approval
CREATE FUNCTION pi_compat.v2_asset_market_approval() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.verified_by IS NULL OR NEW.verified_at IS NULL OR LENGTH(TRIM(COALESCE(NEW.verification_reference,'')))<4) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ASSET_MARKET_REVIEW_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0369_v2_asset_market_approval BEFORE UPDATE OF status ON v2_asset_markets
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_asset_market_approval();

-- v2_asset_update_scope
CREATE FUNCTION pi_compat.v2_asset_update_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.parent_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM v2_assets p WHERE p.id=NEW.parent_id
 AND p.property_id IS NOT DISTINCT FROM NEW.property_id AND p.scheme_id IS NOT DISTINCT FROM NEW.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ASSET_SCOPE_MISMATCH';
  END IF;
  IF ((WITH RECURSIVE ancestry(id) AS (
 SELECT NEW.parent_id UNION ALL SELECT p.parent_id FROM v2_assets p JOIN ancestry a ON p.id=a.id WHERE p.parent_id IS NOT NULL
 )  SELECT (EXISTS(SELECT 1 FROM ancestry WHERE id=NEW.id)))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ASSET_CYCLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0370_v2_asset_update_scope BEFORE UPDATE OF parent_id,property_id,scheme_id ON v2_assets
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_asset_update_scope();

-- v2_asset_insert_scope
CREATE FUNCTION pi_compat.v2_asset_insert_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.parent_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS (
 SELECT 1 FROM v2_assets p WHERE p.id=NEW.parent_id
 AND p.property_id IS NOT DISTINCT FROM NEW.property_id AND p.scheme_id IS NOT DISTINCT FROM NEW.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_ASSET_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0371_v2_asset_insert_scope BEFORE INSERT ON v2_assets
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_asset_insert_scope();

-- v2_market_rule_review
CREATE FUNCTION pi_compat.v2_market_rule_review() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.verified_by IS NULL OR NEW.verified_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_MARKET_RULE_REVIEW_REQUIRED';
  END IF;
  IF (NOT EXISTS(SELECT 1 FROM v2_services s WHERE s.code=NEW.service_code AND s.status='approved')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_SERVICE_NOT_APPROVED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0372_v2_market_rule_review BEFORE UPDATE OF status ON v2_market_service_rules
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_market_rule_review();

-- v2_service_revisions_immutable_d
CREATE FUNCTION pi_compat.v2_service_revisions_immutable_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_REVISION_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0373_v2_service_revisions_immutable_d BEFORE DELETE ON v2_service_revisions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_service_revisions_immutable_d();

-- v2_service_revisions_immutable_u
CREATE FUNCTION pi_compat.v2_service_revisions_immutable_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_REVISION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0374_v2_service_revisions_immutable_u BEFORE UPDATE ON v2_service_revisions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_service_revisions_immutable_u();

-- v2_service_review_gate
CREATE FUNCTION pi_compat.v2_service_review_gate() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR LENGTH(TRIM(COALESCE(NEW.approval_reference,'')))<4) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_SERVICE_REVIEW_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0375_v2_service_review_gate BEFORE UPDATE OF status ON v2_services
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_service_review_gate();

-- v2_service_approved_lock
CREATE FUNCTION pi_compat.v2_service_approved_lock() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status='approved') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'V2_APPROVED_SERVICE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0376_v2_service_approved_lock BEFORE UPDATE ON v2_services
  FOR EACH ROW EXECUTE FUNCTION pi_compat.v2_service_approved_lock();

-- report_context_immutable
CREATE FUNCTION pi_compat.report_context_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REPORT_CONTEXT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0377_report_context_immutable BEFORE UPDATE OF work_order_id,client_id,property_id,scheme_id,tenancy_id,booking_id,template_id,template_version,layout_snapshot_json,baseline_version_id ON inspection_reports
  FOR EACH ROW EXECUTE FUNCTION pi_compat.report_context_immutable();

-- report_sync_immutable_delete
CREATE FUNCTION pi_compat.report_sync_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REPORT_SYNC_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0378_report_sync_immutable_delete BEFORE DELETE ON report_sync_receipts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.report_sync_immutable_delete();

-- report_sync_immutable_update
CREATE FUNCTION pi_compat.report_sync_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REPORT_SYNC_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0379_report_sync_immutable_update BEFORE UPDATE ON report_sync_receipts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.report_sync_immutable_update();

-- report_review_immutable_delete
CREATE FUNCTION pi_compat.report_review_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REPORT_REVIEW_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0380_report_review_immutable_delete BEFORE DELETE ON report_review_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.report_review_immutable_delete();

-- report_review_immutable_update
CREATE FUNCTION pi_compat.report_review_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REPORT_REVIEW_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0381_report_review_immutable_update BEFORE UPDATE ON report_review_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.report_review_immutable_update();

-- report_version_immutable_delete
CREATE FUNCTION pi_compat.report_version_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REPORT_VERSION_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0382_report_version_immutable_delete BEFORE DELETE ON report_versions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.report_version_immutable_delete();

-- report_version_immutable_update
CREATE FUNCTION pi_compat.report_version_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'REPORT_VERSION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0383_report_version_immutable_update BEFORE UPDATE ON report_versions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.report_version_immutable_update();

-- open_home_inspection_reports_no_delete
CREATE FUNCTION pi_compat.open_home_inspection_reports_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OPEN_HOME_REPORT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0384_open_home_inspection_reports_no_delete BEFORE DELETE ON open_home_inspection_reports
  FOR EACH ROW EXECUTE FUNCTION pi_compat.open_home_inspection_reports_no_delete();

-- open_home_inspection_reports_no_update
CREATE FUNCTION pi_compat.open_home_inspection_reports_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OPEN_HOME_REPORT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0385_open_home_inspection_reports_no_update BEFORE UPDATE ON open_home_inspection_reports
  FOR EACH ROW EXECUTE FUNCTION pi_compat.open_home_inspection_reports_no_update();

-- open_home_inspection_reports_session_guard
CREATE FUNCTION pi_compat.open_home_inspection_reports_session_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS (
  SELECT 1 FROM leasing_sessions s WHERE s.id=NEW.session_id AND s.listing_id=NEW.listing_id
   AND s.status IN('scheduled','completed') AND s.ends_at=NEW.session_end_at
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OPEN_HOME_REPORT_SESSION_INVALID';
  END IF;
  IF (NOT EXISTS (
  SELECT 1 FROM open_home_report_settings settings
  WHERE settings.listing_id=NEW.listing_id AND settings.enabled=1
    AND settings.recipient_user_id=NEW.recipient_user_id
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OPEN_HOME_REPORT_RECIPIENT_INVALID';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0386_open_home_inspection_reports_session_guard BEFORE INSERT ON open_home_inspection_reports
  FOR EACH ROW EXECUTE FUNCTION pi_compat.open_home_inspection_reports_session_guard();

-- open_home_report_settings_authority_update
CREATE FUNCTION pi_compat.open_home_report_settings_authority_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.recipient_user_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS (
  SELECT 1 FROM leasing_listings l
  JOIN client_memberships m ON m.client_id IN(l.instructed_by_client_id,l.owner_client_id)
  JOIN clients c ON c.id=m.client_id
  JOIN users u ON u.id=m.user_id
  WHERE l.id=NEW.listing_id AND m.user_id=NEW.recipient_user_id AND m.active=1
    AND m.role IN('owner','admin') AND c.status='active'
    AND u.active=1 AND u.verified_at IS NOT NULL
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OPEN_HOME_REPORT_RECIPIENT_UNAUTHORISED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0387_open_home_report_settings_authority_update BEFORE UPDATE ON open_home_report_settings
  FOR EACH ROW EXECUTE FUNCTION pi_compat.open_home_report_settings_authority_update();

-- open_home_report_settings_authority_insert
CREATE FUNCTION pi_compat.open_home_report_settings_authority_insert() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.recipient_user_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS (
  SELECT 1 FROM leasing_listings l
  JOIN client_memberships m ON m.client_id IN(l.instructed_by_client_id,l.owner_client_id)
  JOIN clients c ON c.id=m.client_id
  JOIN users u ON u.id=m.user_id
  WHERE l.id=NEW.listing_id AND m.user_id=NEW.recipient_user_id AND m.active=1
    AND m.role IN('owner','admin') AND c.status='active'
    AND u.active=1 AND u.verified_at IS NOT NULL
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OPEN_HOME_REPORT_RECIPIENT_UNAUTHORISED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0388_open_home_report_settings_authority_insert BEFORE INSERT ON open_home_report_settings
  FOR EACH ROW EXECUTE FUNCTION pi_compat.open_home_report_settings_authority_insert();

-- bond_payout_reconciliations_immutable_delete
CREATE FUNCTION pi_compat.bond_payout_reconciliations_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BOND_RECONCILIATION_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0389_bond_payout_reconciliations_immutable_delete BEFORE DELETE ON bond_payout_reconciliations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.bond_payout_reconciliations_immutable_delete();

-- bond_payout_reconciliations_immutable_update
CREATE FUNCTION pi_compat.bond_payout_reconciliations_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BOND_RECONCILIATION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0390_bond_payout_reconciliations_immutable_update BEFORE UPDATE ON bond_payout_reconciliations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.bond_payout_reconciliations_immutable_update();

-- bond_external_verifications_immutable_delete
CREATE FUNCTION pi_compat.bond_external_verifications_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BOND_VERIFICATION_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0391_bond_external_verifications_immutable_delete BEFORE DELETE ON bond_external_verifications
  FOR EACH ROW EXECUTE FUNCTION pi_compat.bond_external_verifications_immutable_delete();

-- bond_external_verifications_immutable_update
CREATE FUNCTION pi_compat.bond_external_verifications_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BOND_VERIFICATION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0392_bond_external_verifications_immutable_update BEFORE UPDATE ON bond_external_verifications
  FOR EACH ROW EXECUTE FUNCTION pi_compat.bond_external_verifications_immutable_update();

-- bond_contributions_immutable_delete
CREATE FUNCTION pi_compat.bond_contributions_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BOND_CONTRIBUTION_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0393_bond_contributions_immutable_delete BEFORE DELETE ON bond_contributions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.bond_contributions_immutable_delete();

-- bond_contributions_immutable_update
CREATE FUNCTION pi_compat.bond_contributions_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BOND_CONTRIBUTION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0394_bond_contributions_immutable_update BEFORE UPDATE ON bond_contributions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.bond_contributions_immutable_update();

-- bond_allocations_immutable_delete
CREATE FUNCTION pi_compat.bond_allocations_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BOND_ALLOCATION_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0395_bond_allocations_immutable_delete BEFORE DELETE ON bond_allocations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.bond_allocations_immutable_delete();

-- bond_allocations_immutable_update
CREATE FUNCTION pi_compat.bond_allocations_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BOND_ALLOCATION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0396_bond_allocations_immutable_update BEFORE UPDATE ON bond_allocations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.bond_allocations_immutable_update();

-- bond_transactions_confirmed_immutable
CREATE FUNCTION pi_compat.bond_transactions_confirmed_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status='confirmed') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BOND_CONFIRMED_TRANSACTION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0397_bond_transactions_confirmed_immutable BEFORE UPDATE OF code,general_delta_cents,pet_delta_cents,details_envelope,channel,external_reference,confirmation_document_id ON bond_transactions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.bond_transactions_confirmed_immutable();

-- bond_receipts_immutable_update
CREATE FUNCTION pi_compat.bond_receipts_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BOND_RECEIPT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0398_bond_receipts_immutable_update BEFORE UPDATE OF amount_cents,kind,payer_envelope,payment_reference,paid_at ON bond_receipts
  FOR EACH ROW EXECUTE FUNCTION pi_compat.bond_receipts_immutable_update();

-- bond_events_immutable_delete
CREATE FUNCTION pi_compat.bond_events_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BOND_HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0399_bond_events_immutable_delete BEFORE DELETE ON bond_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.bond_events_immutable_delete();

-- bond_events_immutable_update
CREATE FUNCTION pi_compat.bond_events_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'BOND_HISTORY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0400_bond_events_immutable_update BEFORE UPDATE ON bond_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.bond_events_immutable_update();

-- wa_restricted_cases_residential_i
CREATE FUNCTION pi_compat.wa_restricted_cases_residential_i() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS (
  SELECT 1 FROM tenancies t JOIN properties p ON p.id=t.property_id
  WHERE t.id=NEW.tenancy_id AND p.sector='residential'
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RESTRICTED_FORM_RESIDENTIAL_ONLY';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0401_wa_restricted_cases_residential_i BEFORE INSERT ON restricted_form_cases
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_restricted_cases_residential_i();

-- wa_form_verifications_immutable_d
CREATE FUNCTION pi_compat.wa_form_verifications_immutable_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0402_wa_form_verifications_immutable_d BEFORE DELETE ON wa_residential_form_verifications
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_verifications_immutable_d();

-- wa_form_verifications_immutable_u
CREATE FUNCTION pi_compat.wa_form_verifications_immutable_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0403_wa_form_verifications_immutable_u BEFORE UPDATE ON wa_residential_form_verifications
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_verifications_immutable_u();

-- wa_form_reminder_no_delete
CREATE FUNCTION pi_compat.wa_form_reminder_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0404_wa_form_reminder_no_delete BEFORE DELETE ON wa_residential_form_reminders
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_reminder_no_delete();

-- wa_form_reminder_no_update
CREATE FUNCTION pi_compat.wa_form_reminder_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0405_wa_form_reminder_no_update BEFORE UPDATE ON wa_residential_form_reminders
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_reminder_no_update();

-- wa_form_booking_guard_u
CREATE FUNCTION pi_compat.wa_form_booking_guard_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.booking_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM bookings b WHERE b.id=NEW.booking_id AND b.property_id=NEW.property_id AND b.status IN('confirmed','completed'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WA_FORM_BOOKING_PROPERTY_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0406_wa_form_booking_guard_u BEFORE UPDATE OF booking_id ON wa_residential_form_cases
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_booking_guard_u();

-- wa_form_booking_guard_i
CREATE FUNCTION pi_compat.wa_form_booking_guard_i() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.booking_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM bookings b WHERE b.id=NEW.booking_id AND b.property_id=NEW.property_id AND b.status IN('confirmed','completed'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WA_FORM_BOOKING_PROPERTY_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0407_wa_form_booking_guard_i BEFORE INSERT ON wa_residential_form_cases
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_booking_guard_i();

-- wa_form_signatures_immutable_d
CREATE FUNCTION pi_compat.wa_form_signatures_immutable_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0408_wa_form_signatures_immutable_d BEFORE DELETE ON wa_residential_form_signatures
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_signatures_immutable_d();

-- wa_form_signatures_immutable_u
CREATE FUNCTION pi_compat.wa_form_signatures_immutable_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0409_wa_form_signatures_immutable_u BEFORE UPDATE ON wa_residential_form_signatures
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_signatures_immutable_u();

-- wa_form_external_immutable_d
CREATE FUNCTION pi_compat.wa_form_external_immutable_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0410_wa_form_external_immutable_d BEFORE DELETE ON wa_residential_form_external_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_external_immutable_d();

-- wa_form_external_immutable_u
CREATE FUNCTION pi_compat.wa_form_external_immutable_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0411_wa_form_external_immutable_u BEFORE UPDATE ON wa_residential_form_external_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_external_immutable_u();

-- wa_form_decisions_immutable_d
CREATE FUNCTION pi_compat.wa_form_decisions_immutable_d() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0412_wa_form_decisions_immutable_d BEFORE DELETE ON wa_residential_form_decisions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_decisions_immutable_d();

-- wa_form_decisions_immutable_u
CREATE FUNCTION pi_compat.wa_form_decisions_immutable_u() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0413_wa_form_decisions_immutable_u BEFORE UPDATE ON wa_residential_form_decisions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_decisions_immutable_u();

-- wa_form_response_no_delete
CREATE FUNCTION pi_compat.wa_form_response_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0414_wa_form_response_no_delete BEFORE DELETE ON wa_residential_form_responses
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_response_no_delete();

-- wa_form_response_no_update
CREATE FUNCTION pi_compat.wa_form_response_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0415_wa_form_response_no_update BEFORE UPDATE ON wa_residential_form_responses
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_response_no_update();

-- wa_form_delivery_no_delete
CREATE FUNCTION pi_compat.wa_form_delivery_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0416_wa_form_delivery_no_delete BEFORE DELETE ON wa_residential_form_delivery
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_delivery_no_delete();

-- wa_form_delivery_no_update
CREATE FUNCTION pi_compat.wa_form_delivery_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0417_wa_form_delivery_no_update BEFORE UPDATE ON wa_residential_form_delivery
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_delivery_no_update();

-- wa_form_events_no_delete
CREATE FUNCTION pi_compat.wa_form_events_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0418_wa_form_events_no_delete BEFORE DELETE ON wa_residential_form_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_events_no_delete();

-- wa_form_events_no_update
CREATE FUNCTION pi_compat.wa_form_events_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0419_wa_form_events_no_update BEFORE UPDATE ON wa_residential_form_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_form_events_no_update();

-- wa_forms_residential_scope_immutable
CREATE FUNCTION pi_compat.wa_forms_residential_scope_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WA_FORM_SCOPE_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0420_wa_forms_residential_scope_immutable BEFORE UPDATE OF tenancy_id,property_id,form_code,initiator_id,initiator_kind,form_stage ON wa_residential_form_cases
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_forms_residential_scope_immutable();

-- wa_forms_residential_create
CREATE FUNCTION pi_compat.wa_forms_residential_create() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(
    SELECT 1 FROM tenancies t JOIN properties p ON p.id=t.property_id
    WHERE t.id=NEW.tenancy_id AND p.id=NEW.property_id AND p.sector='residential'
  )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WA_FORMS_RESIDENTIAL_ONLY';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0421_wa_forms_residential_create BEFORE INSERT ON wa_residential_form_cases
  FOR EACH ROW EXECUTE FUNCTION pi_compat.wa_forms_residential_create();

-- open_home_sheet_events_guard
CREATE FUNCTION pi_compat.open_home_sheet_events_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status='synced' OR NEW.checkin_id!=OLD.checkin_id OR NEW.id!=OLD.id
   OR NEW.status!='synced' OR NEW.synced_at IS NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OPEN_HOME_SHEET_EVENT_INVALID_TRANSITION';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0422_open_home_sheet_events_guard BEFORE UPDATE ON open_home_sheet_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.open_home_sheet_events_guard();

-- open_home_sheet_events_no_delete
CREATE FUNCTION pi_compat.open_home_sheet_events_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OPEN_HOME_SHEET_EVENT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0423_open_home_sheet_events_no_delete BEFORE DELETE ON open_home_sheet_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.open_home_sheet_events_no_delete();

-- leasing_checkins_session_guard
CREATE FUNCTION pi_compat.leasing_checkins_session_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS (
   SELECT 1 FROM leasing_sessions s JOIN leasing_listings l ON l.id=s.listing_id
   WHERE s.id=NEW.session_id AND s.listing_id=NEW.listing_id
   AND s.status='scheduled' AND l.status='published'
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OPEN_HOME_SESSION_NOT_LINKED';
  END IF;
  IF (NEW.registered_lead_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM leasing_leads r
   WHERE r.id=NEW.registered_lead_id AND r.session_id=NEW.session_id
   AND r.listing_id=NEW.listing_id AND r.status='active' AND r.kind='inspection'
   AND r.email_hash=NEW.email_hash
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'OPEN_HOME_LEAD_NOT_LINKED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0424_leasing_checkins_session_guard BEFORE INSERT ON leasing_checkins
  FOR EACH ROW EXECUTE FUNCTION pi_compat.leasing_checkins_session_guard();

-- rental_recipient_change_guard
CREATE FUNCTION pi_compat.rental_recipient_change_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (COALESCE(OLD.application_recipient_email,'')!=COALESCE(NEW.application_recipient_email,'')
 AND EXISTS(SELECT 1 FROM rental_applications a WHERE a.listing_id=OLD.id
 AND a.status IN('draft','submitted','information_requested','ready_for_handoff','forwarded'))) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_RECIPIENT_CHANGE_REQUIRES_RECONCILIATION';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0425_rental_recipient_change_guard BEFORE UPDATE OF application_recipient_email ON leasing_listings
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_recipient_change_guard();

-- rental_invitation_requires_editable_application
CREATE FUNCTION pi_compat.rental_invitation_requires_editable_application() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM rental_applications a WHERE a.id=NEW.application_id
 AND a.status IN('draft','information_requested'))) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_INVITATIONS_CLOSED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0426_rental_invitation_requires_editable_application BEFORE INSERT ON rental_applicants
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_invitation_requires_editable_application();

-- rental_upload_requires_editable_application
CREATE FUNCTION pi_compat.rental_upload_requires_editable_application() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM rental_applications a WHERE a.id=NEW.application_id
 AND a.status IN('draft','information_requested'))) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_DOCUMENT_UPLOAD_CLOSED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0427_rental_upload_requires_editable_application BEFORE INSERT ON rental_application_documents
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_upload_requires_editable_application();

-- rental_submission_immutable_delete
CREATE FUNCTION pi_compat.rental_submission_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM rental_application_purge_permits p WHERE p.application_id=OLD.application_id)) IS NOT TRUE THEN RETURN OLD; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_SUBMISSION_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0428_rental_submission_immutable_delete BEFORE DELETE ON rental_application_submissions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_submission_immutable_delete();

-- rental_events_immutable_delete
CREATE FUNCTION pi_compat.rental_events_immutable_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM rental_application_purge_permits p WHERE p.application_id=OLD.application_id)) IS NOT TRUE THEN RETURN OLD; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_APPLICATION_HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0429_rental_events_immutable_delete BEFORE DELETE ON rental_application_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_events_immutable_delete();

-- rental_handoff_requires_review
CREATE FUNCTION pi_compat.rental_handoff_requires_review() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (EXISTS(SELECT 1 FROM rental_application_documents d
 WHERE d.application_id=NEW.application_id AND d.review_status='quarantined')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'DOCUMENTS_PENDING_MALWARE_REVIEW';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0430_rental_handoff_requires_review BEFORE INSERT ON rental_application_handoffs
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_handoff_requires_review();

-- rental_forwarded_requires_confirmed_handoff
CREATE FUNCTION pi_compat.rental_forwarded_requires_confirmed_handoff() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='forwarded' AND NOT EXISTS(
  SELECT 1 FROM rental_application_handoffs h
   WHERE h.application_id=NEW.id AND h.status='delivered')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AGENCY_EMAIL_DELIVERY_NOT_CONFIRMED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0431_rental_forwarded_requires_confirmed_handoff BEFORE UPDATE OF status ON rental_applications
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_forwarded_requires_confirmed_handoff();

-- rental_scan_verdict_not_reversed
CREATE FUNCTION pi_compat.rental_scan_verdict_not_reversed() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.scan_status IN('clean','unsafe') AND NEW.scan_status!=OLD.scan_status) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SCAN_VERDICT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0432_rental_scan_verdict_not_reversed BEFORE UPDATE OF scan_status ON rental_application_documents
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_scan_verdict_not_reversed();

-- rental_release_requires_clean_scan
CREATE FUNCTION pi_compat.rental_release_requires_clean_scan() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.review_status='released' AND (OLD.scan_status!='clean' OR NEW.scan_status!='clean')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRUSTED_CLEAN_SCAN_REQUIRED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0433_rental_release_requires_clean_scan BEFORE UPDATE OF review_status ON rental_application_documents
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_release_requires_clean_scan();

-- rental_submission_applicant_guard
CREATE FUNCTION pi_compat.rental_submission_applicant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM rental_applicants r WHERE r.id=NEW.submitted_by_applicant_id
 AND r.application_id=NEW.application_id AND r.role='primary')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_SUBMISSION_PRIMARY_REQUIRED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0434_rental_submission_applicant_guard BEFORE INSERT ON rental_application_submissions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_submission_applicant_guard();

-- rental_submission_immutable_update
CREATE FUNCTION pi_compat.rental_submission_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_SUBMISSION_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0435_rental_submission_immutable_update BEFORE UPDATE ON rental_application_submissions
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_submission_immutable_update();

-- rental_application_document_parent_guard
CREATE FUNCTION pi_compat.rental_application_document_parent_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS(SELECT 1 FROM rental_applicants a
 WHERE a.id=NEW.applicant_id AND a.application_id=NEW.application_id AND a.state!='removed')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_DOCUMENT_APPLICANT_MISMATCH';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0436_rental_application_document_parent_guard BEFORE INSERT ON rental_application_documents
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_application_document_parent_guard();

-- leasing_application_mode_active_draft_guard
CREATE FUNCTION pi_compat.leasing_application_mode_active_draft_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.application_mode='proinspect' AND NEW.application_mode!='proinspect' AND EXISTS (
 SELECT 1 FROM rental_applications a WHERE a.listing_id=OLD.id
 AND a.status IN ('draft','submitted','information_requested','ready_for_handoff','forwarded'))) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ACTIVE_APPLICATIONS_REQUIRE_TRANSITION';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0437_leasing_application_mode_active_draft_guard BEFORE UPDATE OF application_mode ON leasing_listings
  FOR EACH ROW EXECUTE FUNCTION pi_compat.leasing_application_mode_active_draft_guard();

-- rental_submitted_at_required
CREATE FUNCTION pi_compat.rental_submitted_at_required() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status IN('submitted','ready_for_handoff','forwarded','decision_recorded') AND NEW.submitted_at IS NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'APPLICATION_SUBMISSION_REQUIRED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0438_rental_submitted_at_required BEFORE UPDATE OF status ON rental_applications
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_submitted_at_required();

-- rental_events_immutable_update
CREATE FUNCTION pi_compat.rental_events_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RENTAL_APPLICATION_HISTORY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0439_rental_events_immutable_update BEFORE UPDATE ON rental_application_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_events_immutable_update();

-- rental_applicant_owner_guard
CREATE FUNCTION pi_compat.rental_applicant_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.ordinal=1 AND NEW.role!='primary') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PRIMARY_APPLICANT_REQUIRED';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0440_rental_applicant_owner_guard BEFORE INSERT ON rental_applicants
  FOR EACH ROW EXECUTE FUNCTION pi_compat.rental_applicant_owner_guard();

-- leasing_application_settings_guard
CREATE FUNCTION pi_compat.leasing_application_settings_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.application_mode='external' AND (NEW.application_url IS NULL OR NEW.application_url NOT ILIKE 'https://%')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXTERNAL_APPLICATION_URL_REQUIRED';
  END IF;
  IF (NEW.application_mode='proinspect' AND NEW.application_url IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EXTERNAL_APPLICATION_PRECEDENCE';
  END IF;
  IF (NEW.application_mode='proinspect' AND NEW.kind!='residential') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RESIDENTIAL_APPLICATION_ONLY';
  END IF;
  IF (NEW.application_mode='proinspect'
   AND (LENGTH(TRIM(COALESCE(NEW.application_authority_reference,'')))<5
      OR LENGTH(TRIM(COALESCE(NEW.application_recipient_email,'')))<6)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'APPLICATION_AUTHORITY_REQUIRED';
  END IF;
  IF (NEW.application_mode='proinspect'
   AND (NEW.tenancy_database_notice_mode='unconfigured' OR
     (NEW.tenancy_database_notice_mode='configured' AND pi_compat.json_length(NEW.tenancy_database_notice_json)<1))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TENANCY_DATABASE_NOTICE_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0441_leasing_application_settings_guard BEFORE UPDATE OF application_mode,application_url,
 application_authority_reference,application_recipient_email,tenancy_database_notice_mode,tenancy_database_notice_json ON leasing_listings
  FOR EACH ROW EXECUTE FUNCTION pi_compat.leasing_application_settings_guard();

-- leasing_publish_requires_photo
CREATE FUNCTION pi_compat.leasing_publish_requires_photo() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status='published' AND OLD.status!='published') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM leasing_photos WHERE listing_id=NEW.id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEASING_PHOTO_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0442_leasing_publish_requires_photo BEFORE UPDATE OF status ON leasing_listings
  FOR EACH ROW EXECUTE FUNCTION pi_compat.leasing_publish_requires_photo();

-- leasing_email_events_no_delete
CREATE FUNCTION pi_compat.leasing_email_events_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEASING_EVENT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0443_leasing_email_events_no_delete BEFORE DELETE ON leasing_email_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.leasing_email_events_no_delete();

-- leasing_email_events_no_update
CREATE FUNCTION pi_compat.leasing_email_events_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEASING_EVENT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0444_leasing_email_events_no_update BEFORE UPDATE ON leasing_email_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.leasing_email_events_no_update();

-- leasing_property_party_update
CREATE FUNCTION pi_compat.leasing_property_party_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS (SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.sector=NEW.kind)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEASING_SECTOR_MISMATCH';
  END IF;
  IF (NOT EXISTS (
 SELECT 1 FROM client_property_links l WHERE l.property_id=NEW.property_id AND l.client_id=NEW.instructed_by_client_id AND l.ends_at IS NULL
 UNION SELECT 1 FROM property_management_relationships m WHERE m.property_id=NEW.property_id AND m.manager_client_id=NEW.instructed_by_client_id AND m.ends_at IS NULL
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEASING_INSTRUCTION_NOT_AUTHORISED';
  END IF;
  IF (NEW.owner_client_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM client_property_links l WHERE l.property_id=NEW.property_id AND l.client_id=NEW.owner_client_id AND l.role IN('owner','landlord') AND l.ends_at IS NULL
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEASING_OWNER_INVALID';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0445_leasing_property_party_update BEFORE UPDATE OF property_id,instructed_by_client_id,owner_client_id,kind ON leasing_listings
  FOR EACH ROW EXECUTE FUNCTION pi_compat.leasing_property_party_update();

-- leasing_property_party_guard
CREATE FUNCTION pi_compat.leasing_property_party_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NOT EXISTS (SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.sector=NEW.kind)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEASING_SECTOR_MISMATCH';
  END IF;
  IF (NOT EXISTS (
 SELECT 1 FROM client_property_links l WHERE l.property_id=NEW.property_id AND l.client_id=NEW.instructed_by_client_id AND l.ends_at IS NULL
 UNION SELECT 1 FROM property_management_relationships m WHERE m.property_id=NEW.property_id AND m.manager_client_id=NEW.instructed_by_client_id AND m.ends_at IS NULL
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEASING_INSTRUCTION_NOT_AUTHORISED';
  END IF;
  IF (NEW.owner_client_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM client_property_links l WHERE l.property_id=NEW.property_id AND l.client_id=NEW.owner_client_id AND l.role IN('owner','landlord') AND l.ends_at IS NULL
 )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LEASING_OWNER_INVALID';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0446_leasing_property_party_guard BEFORE INSERT ON leasing_listings
  FOR EACH ROW EXECUTE FUNCTION pi_compat.leasing_property_party_guard();

-- guest_client_no_entitlements
CREATE FUNCTION pi_compat.guest_client_no_entitlements() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.client_id='cli_guest_transactions') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'GUEST_ENTITLEMENTS_FORBIDDEN';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0447_guest_client_no_entitlements BEFORE INSERT ON client_entitlements
  FOR EACH ROW EXECUTE FUNCTION pi_compat.guest_client_no_entitlements();

-- guest_client_no_memberships
CREATE FUNCTION pi_compat.guest_client_no_memberships() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.client_id='cli_guest_transactions') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'GUEST_MEMBERSHIPS_FORBIDDEN';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0448_guest_client_no_memberships BEFORE INSERT ON client_memberships
  FOR EACH ROW EXECUTE FUNCTION pi_compat.guest_client_no_memberships();

-- guest_client_no_activation
CREATE FUNCTION pi_compat.guest_client_no_activation() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.id='cli_guest_transactions' AND NEW.status='active') IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'GUEST_CLIENT_CANNOT_ACTIVATE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0449_guest_client_no_activation BEFORE UPDATE OF status ON clients
  FOR EACH ROW EXECUTE FUNCTION pi_compat.guest_client_no_activation();

-- enquiry_events_no_delete
CREATE FUNCTION pi_compat.enquiry_events_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HISTORY_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0450_enquiry_events_no_delete BEFORE DELETE ON enquiry_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.enquiry_events_no_delete();

-- enquiry_events_no_update
CREATE FUNCTION pi_compat.enquiry_events_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'HISTORY_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0451_enquiry_events_no_update BEFORE UPDATE ON enquiry_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.enquiry_events_no_update();

-- schedule_block_insert_guard
CREATE FUNCTION pi_compat.schedule_block_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (EXISTS(SELECT 1 FROM bookings b WHERE b.resource_id=NEW.resource_id AND b.status!='cancelled' AND b.reserved_start<NEW.ends_at AND b.reserved_end>NEW.starts_at)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SCHEDULE_CONFLICT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0452_schedule_block_insert_guard BEFORE INSERT ON schedule_blocks
  FOR EACH ROW EXECUTE FUNCTION pi_compat.schedule_block_insert_guard();

-- portal_invitation_scope
CREATE FUNCTION pi_compat.portal_invitation_scope() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF ((NEW.client_id IS NOT NULL AND NEW.role NOT IN('admin','member','viewer')) OR (NEW.scheme_id IS NOT NULL AND NEW.role NOT IN('resident','owner','council_member'))) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'INVITATION_ROLE_MISMATCH';
  END IF;
  IF (NEW.lot_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM strata_lots l WHERE l.id=NEW.lot_id AND l.scheme_id=NEW.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SCHEME_LOT_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0453_portal_invitation_scope BEFORE INSERT ON portal_invitations
  FOR EACH ROW EXECUTE FUNCTION pi_compat.portal_invitation_scope();

-- scheme_membership_update_guard
CREATE FUNCTION pi_compat.scheme_membership_update_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.lot_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM strata_lots l WHERE l.id=NEW.lot_id AND l.scheme_id=NEW.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SCHEME_LOT_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0454_scheme_membership_update_guard BEFORE UPDATE OF scheme_id,lot_id ON scheme_memberships
  FOR EACH ROW EXECUTE FUNCTION pi_compat.scheme_membership_update_guard();

-- area_building_guard
CREATE FUNCTION pi_compat.area_building_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.building_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM scheme_buildings b WHERE b.id=NEW.building_id AND b.scheme_id=NEW.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SCHEME_BUILDING_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0455_area_building_guard BEFORE INSERT ON common_property_areas
  FOR EACH ROW EXECUTE FUNCTION pi_compat.area_building_guard();

-- lot_building_guard
CREATE FUNCTION pi_compat.lot_building_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.building_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM scheme_buildings b WHERE b.id=NEW.building_id AND b.scheme_id=NEW.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SCHEME_BUILDING_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0456_lot_building_guard BEFORE INSERT ON strata_lots
  FOR EACH ROW EXECUTE FUNCTION pi_compat.lot_building_guard();

-- request_scheme_lot_guard
CREATE FUNCTION pi_compat.request_scheme_lot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.lot_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM strata_lots l WHERE l.id=NEW.lot_id AND l.scheme_id=NEW.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SCHEME_LOT_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0457_request_scheme_lot_guard BEFORE INSERT ON requests
  FOR EACH ROW EXECUTE FUNCTION pi_compat.request_scheme_lot_guard();

-- request_scheme_area_guard
CREATE FUNCTION pi_compat.request_scheme_area_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.area_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM common_property_areas a WHERE a.id=NEW.area_id AND a.scheme_id=NEW.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SCHEME_AREA_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0458_request_scheme_area_guard BEFORE INSERT ON requests
  FOR EACH ROW EXECUTE FUNCTION pi_compat.request_scheme_area_guard();

-- work_order_approval_gate
CREATE FUNCTION pi_compat.work_order_approval_gate() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.approval_required=1 AND NEW.status IN('approved','assigned','scheduled','in_progress','report_pending','completed')) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (COALESCE((SELECT status FROM approvals WHERE work_order_id=NEW.id ORDER BY created_at DESC,pi_rowid DESC LIMIT 1),'missing')!='approved') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'APPROVAL_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0459_work_order_approval_gate BEFORE UPDATE OF status ON work_orders
  FOR EACH ROW EXECUTE FUNCTION pi_compat.work_order_approval_gate();

-- payment_events_no_delete
CREATE FUNCTION pi_compat.payment_events_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0460_payment_events_no_delete BEFORE DELETE ON payment_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.payment_events_no_delete();

-- payment_events_no_update
CREATE FUNCTION pi_compat.payment_events_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0461_payment_events_no_update BEFORE UPDATE ON payment_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.payment_events_no_update();

-- scheme_membership_lot_guard
CREATE FUNCTION pi_compat.scheme_membership_lot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.lot_id IS NOT NULL) IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM strata_lots l WHERE l.id=NEW.lot_id AND l.scheme_id=NEW.scheme_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SCHEME_LOT_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0462_scheme_membership_lot_guard BEFORE INSERT ON scheme_memberships
  FOR EACH ROW EXECUTE FUNCTION pi_compat.scheme_membership_lot_guard();

-- self_management_owner
CREATE FUNCTION pi_compat.self_management_owner() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.mode='self_managed') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (NOT EXISTS(SELECT 1 FROM client_property_links l JOIN properties p ON p.id=l.property_id JOIN clients c ON c.id=l.client_id WHERE l.property_id=NEW.property_id AND l.client_id=NEW.manager_client_id AND l.role IN('owner','landlord') AND l.ends_at IS NULL AND p.sector='residential' AND c.client_type='landlord')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SELF_MANAGEMENT_REQUIRES_OWNER';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0463_self_management_owner BEFORE INSERT ON property_management_relationships
  FOR EACH ROW EXECUTE FUNCTION pi_compat.self_management_owner();

-- restricted_audit_no_delete
CREATE FUNCTION pi_compat.restricted_audit_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0464_restricted_audit_no_delete BEFORE DELETE ON restricted_audit
  FOR EACH ROW EXECUTE FUNCTION pi_compat.restricted_audit_no_delete();

-- restricted_audit_no_update
CREATE FUNCTION pi_compat.restricted_audit_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0465_restricted_audit_no_update BEFORE UPDATE ON restricted_audit
  FOR EACH ROW EXECUTE FUNCTION pi_compat.restricted_audit_no_update();

-- audit_no_delete
CREATE FUNCTION pi_compat.audit_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN OLD;
END $$;
CREATE TRIGGER pi_0466_audit_no_delete BEFORE DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.audit_no_delete();

-- audit_no_update
CREATE FUNCTION pi_compat.audit_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'AUDIT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0467_audit_no_update BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION pi_compat.audit_no_update();

-- issued_document_immutable
CREATE FUNCTION pi_compat.issued_document_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (OLD.status IN('issued','archived')) IS NOT TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ISSUED_DOCUMENT_IMMUTABLE';
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0468_issued_document_immutable BEFORE UPDATE OF object_key,sha256,size,content_type,version ON documents
  FOR EACH ROW EXECUTE FUNCTION pi_compat.issued_document_immutable();

-- booking_overlap_update
CREATE FUNCTION pi_compat.booking_overlap_update() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status!='cancelled') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (EXISTS(SELECT 1 FROM bookings b WHERE b.id!=NEW.id AND b.resource_id=NEW.resource_id AND b.status!='cancelled' AND b.reserved_start<NEW.reserved_end AND b.reserved_end>NEW.reserved_start)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SCHEDULE_CONFLICT';
  END IF;
  IF (EXISTS(SELECT 1 FROM schedule_blocks s WHERE s.resource_id=NEW.resource_id AND s.starts_at<NEW.reserved_end AND s.ends_at>NEW.reserved_start)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SCHEDULE_BLOCKED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0469_booking_overlap_update BEFORE UPDATE OF starts_at,ends_at,reserved_start,reserved_end,resource_id,status ON bookings
  FOR EACH ROW EXECUTE FUNCTION pi_compat.booking_overlap_update();

-- booking_overlap_insert
CREATE FUNCTION pi_compat.booking_overlap_insert() RETURNS trigger LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  IF (NEW.status!='cancelled') IS NOT TRUE THEN RETURN NEW; END IF;
  IF (EXISTS(SELECT 1 FROM bookings b WHERE b.resource_id=NEW.resource_id AND b.status!='cancelled' AND b.reserved_start<NEW.reserved_end AND b.reserved_end>NEW.reserved_start)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SCHEDULE_CONFLICT';
  END IF;
  IF (EXISTS(SELECT 1 FROM schedule_blocks s WHERE s.resource_id=NEW.resource_id AND s.starts_at<NEW.reserved_end AND s.ends_at>NEW.reserved_start)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SCHEDULE_BLOCKED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pi_0470_booking_overlap_insert BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION pi_compat.booking_overlap_insert();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON users FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON sessions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON login_tokens FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON auth_rate_limits FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON staff_profiles FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON clients FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON client_memberships FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON properties FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON client_property_links FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON property_management_relationships FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON portfolio_assignments FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON tenancies FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON tenancy_memberships FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON invitations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON strata_schemes FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON scheme_client_links FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON scheme_buildings FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON strata_lots FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON common_property_areas FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON scheme_memberships FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON scheme_authority_profiles FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON building_notices FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON services FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON schedule_resources FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON schedule_blocks FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bookings FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON booking_access_secrets FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON requests FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON contractors FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON work_orders FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON approvals FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON payments FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON subscriptions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON documents FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON document_grants FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON document_requests FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON statutory_forms FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON restricted_form_cases FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON restricted_case_grants FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON restricted_evidence FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON restricted_audit FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON notifications FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON communications FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON outbox_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON settings FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON leads FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON mutation_guards FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON tenant_inspections FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON client_entitlements FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON organisation_applications FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON portal_invitations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON portfolio_owners FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON management_authorities FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON portfolio_imports FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bulk_booking_runs FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON recurring_plans FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON plan_occurrences FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON council_responses FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON request_comments FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON request_attachments FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON payment_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON webhook_receipts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON report_handoffs FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON integration_deliveries FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON statutory_case_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON pcr_responses FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON restricted_reviewers FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON action_receipts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON marketing_enquiries FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON enquiry_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON notice_dispatch_jobs FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON notice_deliveries FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON user_preferences FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON booking_calendar_sync FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON guest_service_orders FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON guest_access_links FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON guest_request_limits FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON guest_reminder_deliveries FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON leasing_listings FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON leasing_photos FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON leasing_sessions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON leasing_leads FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON leasing_email_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_applications FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_applicants FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_application_documents FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_application_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_application_submissions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_application_handoffs FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_application_privacy_requests FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_application_purge_permits FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_application_purge_receipts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_document_scan_receipts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON leasing_checkins FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON open_home_sheet_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON open_home_sheet_nonces FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON wa_residential_form_templates FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON wa_residential_form_cases FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON wa_residential_form_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON wa_residential_form_delivery FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON wa_residential_form_responses FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON wa_residential_form_decisions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON wa_residential_form_external_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON wa_residential_form_signatures FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON wa_residential_form_reminders FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON wa_residential_form_verifications FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bonds FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_parties FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_transactions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_receipts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_claims FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_evidence FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_cases FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_deadlines FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_notices FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_alert_dispatches FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_preparations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_contributions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_allocations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_external_verifications FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_payout_reconciliations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bond_exception_cases FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON open_home_report_settings FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON open_home_inspection_reports FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON report_templates FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON report_layouts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON inspection_reports FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON report_drafts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON report_versions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON report_review_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON report_evidence FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON report_render_manifests FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON report_responses FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON report_maintenance_candidates FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON report_sync_receipts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_markets FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_services FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_service_revisions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_market_service_rules FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_assets FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_asset_markets FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_engagements FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_plan_versions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_plan_services FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_plan_entitlements FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_subscription_periods FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_usage_ledger FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_rate_cards FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_quote_snapshots FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_maintenance_tasks FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_contractor_credentials FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_task_credential_requirements FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_task_assignments FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_capacity_resources FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_resource_skills FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_roster_windows FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_capacity_blocks FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_resource_allocations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_task_evidence FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_staff_cost_rates FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_task_entitlement_links FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_time_entries FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_external_costs FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_asset_details FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_asset_conditions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_asset_warranties FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_preventive_plans FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_preventive_occurrences FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_compliance_obligations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_compliance_evidence FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_compliance_actions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_asset_risks FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_sector_packs FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_sector_modules FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_sector_release_checks FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_sector_module_clearances FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_sector_rollouts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_sector_records FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_enterprise_portfolios FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_enterprise_portfolio_members FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_capital_programmes FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_capital_projects FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_capital_milestones FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_capital_commitments FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_capital_forecasts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_saved_report_definitions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_report_snapshots FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v2_enterprise_alerts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON stripe_billing_links FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON stripe_billing_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON contractor_payment_plans FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON contractor_connect_recipients FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON contractor_payment_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON contractor_connect_webhook_receipts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_listing_recipient_challenges FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_listing_approvals FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_document_scan_jobs FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_handoff_receipts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_application_outcomes FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON property_report_bridge_handoffs FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rent_route_plans FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rent_external_money_records FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rent_external_verifications FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON restricted_form2_preparations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON restricted_form2_reviews FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rent_connect_sandbox_accounts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON wa_agreement_envelopes FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON wa_agreement_signers FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON wa_agreement_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON agency_owner_grants FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON agency_owner_report_shares FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON agency_commercial_agreements FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON agency_contract_rates FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON agency_billable_work FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON agency_monthly_statements FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON agency_statement_lines FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v4_service_requests FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v4_request_links FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON v4_request_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON payment_checkout_attempts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON payment_reconciliation_items FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON payment_refund_observations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON payment_disputes FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON refund_requests FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON billing_accounts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON agency_invoice_exports FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON billing_invoices FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON billing_reconciliations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON legal_document_versions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON legal_acceptance_receipts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON building_manager_assignments FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON building_asset_links FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON building_operational_items FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON building_operational_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON building_plan_requests FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON building_move_requests FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON building_access_devices FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON building_report_grants FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON building_notice_drafts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON notice_supersessions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON notice_revision_history FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON council_conflict_declarations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON council_response_history FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON service_sale_variants FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON feature_release_approvals FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_lease_register FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_lease_tasks FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_lease_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON agency_owner_invitations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON pcr_routine_discount_entitlements FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON pcr_routine_discount_redemptions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON pcr_discount_reservations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON residential_paid_property_enrollments FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON stripe_subscription_invoice_observations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON stripe_subscription_risk_holds FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_application_reference_checks FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_lease_revisions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_charge_rules FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_lease_charges FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_obligation_reviews FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_task_successors FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_lease_exceptions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_exception_assignments FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON report_render_reviews FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON billing_invoice_contacts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON billing_invoice_dispatches FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON billing_invoice_dispatch_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_tenancy_handovers FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_tenancy_handover_people FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON legacy_included_property_grants FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON account_subscription_preferences FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON residential_paid_service_allowances FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON client_service_interests FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_application_permissions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_application_flows FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_flow_recipient_challenges FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_applications FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_application_people FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_applicant_entities FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_people_roles FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_application_links FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_application_sessions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_application_evidence FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_application_scan_receipts FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_application_offers FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_application_submissions FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_application_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_application_referrals FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_referral_grants FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_application_privacy_requests FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_application_purge_permits FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON property_application_management FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON managed_rental_intake_releases FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON managed_rental_document_releases FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON managed_rental_temporary_releases FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_temporary_documents FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON rental_temporary_packages FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON account_experience_tags FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON co_living_sites FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON co_living_spaces FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON co_living_occupancies FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_occupancies FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_occupant_invitations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_occupant_memberships FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON commercial_occupant_requests FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON council_appointment_reviews FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON registered_booking_payment_links FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON user_portal_preferences FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON co_living_lease_terms FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON co_living_occupancy_events FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON co_living_area_inspections FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON strata_amenities FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON strata_amenity_requests FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON report_photo_annotations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON invoice_credit_proposals FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();

CREATE TRIGGER pi_serialize_write BEFORE INSERT OR UPDATE OR DELETE ON bank_reconciliation_observations FOR EACH STATEMENT EXECUTE FUNCTION pi_compat.writer_lock();
