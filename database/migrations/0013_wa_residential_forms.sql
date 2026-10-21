-- Dedicated Western Australian RESIDENTIAL tenancy workflow.
-- Do not apply prescribed residential form rules to commercial sector properties.
-- Existing statutory_forms records are preserved unchanged for historical review.
CREATE TABLE wa_residential_form_templates (
  form_code TEXT NOT NULL,
  version TEXT NOT NULL,
  official_source_url TEXT NOT NULL,
  official_sha256 TEXT NOT NULL CHECK(length(official_sha256)=64),
  reviewed_by TEXT NOT NULL REFERENCES users(id),
  legal_review_reference TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  retired_at TEXT,
  PRIMARY KEY(form_code,version)
) STRICT;

CREATE TABLE wa_residential_form_cases (
  id TEXT PRIMARY KEY,
  tenancy_id TEXT NOT NULL REFERENCES tenancies(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  form_code TEXT NOT NULL,
  form_stage TEXT NOT NULL CHECK(form_stage IN('commencement','active','breach','ending','bond')),
  initiator_id TEXT NOT NULL REFERENCES users(id),
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
  issued_document_id TEXT REFERENCES documents(id),
  reviewed_by TEXT REFERENCES users(id),
  review_reference TEXT,
  external_reference TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((template_version IS NULL AND issued_document_id IS NULL) OR template_version IS NOT NULL)
) STRICT;
CREATE INDEX wa_forms_by_tenancy ON wa_residential_form_cases(tenancy_id,status,created_at);
CREATE INDEX wa_forms_by_deadline ON wa_residential_form_cases(status,due_at) WHERE due_at IS NOT NULL;

-- Keep both the case and its property fixed so later unrelated relationships
-- cannot silently re-scope a document and its tenant access.
CREATE TRIGGER wa_forms_residential_create BEFORE INSERT ON wa_residential_form_cases
BEGIN
  SELECT RAISE(ABORT,'WA_FORMS_RESIDENTIAL_ONLY')
  WHERE NOT EXISTS(
    SELECT 1 FROM tenancies t JOIN properties p ON p.id=t.property_id
    WHERE t.id=NEW.tenancy_id AND p.id=NEW.property_id AND p.sector='residential'
  );
END;
CREATE TRIGGER wa_forms_residential_scope_immutable
BEFORE UPDATE OF tenancy_id,property_id,form_code,initiator_id,initiator_kind,form_stage
ON wa_residential_form_cases
BEGIN SELECT RAISE(ABORT,'WA_FORM_SCOPE_IMMUTABLE'); END;

CREATE TABLE wa_residential_form_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES wa_residential_form_cases(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  reference TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX wa_form_events_case ON wa_residential_form_events(case_id,created_at);
CREATE TRIGGER wa_form_events_no_update BEFORE UPDATE ON wa_residential_form_events
BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER wa_form_events_no_delete BEFORE DELETE ON wa_residential_form_events
BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;

-- Recording an external attempt, acknowledgement or delivery is separate
-- from pretending that a notice was legally served or a bond was lodged.
CREATE TABLE wa_residential_form_delivery (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES wa_residential_form_cases(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  recipient_kind TEXT NOT NULL CHECK(recipient_kind IN('tenant','landlord','authority','other')),
  recipient_reference TEXT NOT NULL,
  delivery_method TEXT NOT NULL CHECK(delivery_method IN('in_person','post','email','government_portal','other')),
  delivery_at TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN('attempted','delivered','rejected','unconfirmed')),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX wa_form_delivery_case ON wa_residential_form_delivery(case_id,created_at);
CREATE TRIGGER wa_form_delivery_no_update BEFORE UPDATE ON wa_residential_form_delivery
BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER wa_form_delivery_no_delete BEFORE DELETE ON wa_residential_form_delivery
BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;

CREATE TABLE wa_residential_form_responses (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES wa_residential_form_cases(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  answer TEXT NOT NULL CHECK(answer IN('approved','declined','changes_requested','acknowledged','disputed')),
  envelope TEXT NOT NULL,
  reference TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX wa_form_responses_case ON wa_residential_form_responses(case_id,created_at);
CREATE TRIGGER wa_form_response_no_update BEFORE UPDATE ON wa_residential_form_responses
BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER wa_form_response_no_delete BEFORE DELETE ON wa_residential_form_responses
BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
