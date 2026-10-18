-- Extend draft-only WA residential intake into a controlled operational case workflow.
-- All data remains isolated from commercial property records.
ALTER TABLE wa_residential_form_cases ADD COLUMN received_at TEXT;
ALTER TABLE wa_residential_form_cases ADD COLUMN deadline_rule_version TEXT;
ALTER TABLE wa_residential_form_cases ADD COLUMN decision_status TEXT CHECK(decision_status IS NULL OR decision_status IN('approved','refused','approved_with_conditions','information_requested','disputed','acknowledged'));
ALTER TABLE wa_residential_form_cases ADD COLUMN decision_at TEXT;
ALTER TABLE wa_residential_form_cases ADD COLUMN external_status TEXT CHECK(external_status IS NULL OR external_status IN('prepared','submitted','confirmed','rejected','disputed','determined','appealed','finalised'));
ALTER TABLE wa_residential_form_cases ADD COLUMN external_status_at TEXT;
ALTER TABLE wa_residential_form_cases ADD COLUMN booking_id TEXT REFERENCES bookings(id);
CREATE INDEX wa_form_booking ON wa_residential_form_cases(booking_id) WHERE booking_id IS NOT NULL;
ALTER TABLE wa_residential_form_templates ADD COLUMN object_key TEXT;
ALTER TABLE wa_residential_form_templates ADD COLUMN file_size INTEGER CHECK(file_size IS NULL OR (file_size>0 AND file_size<=10485760));

CREATE TABLE wa_residential_form_decisions (
 id TEXT PRIMARY KEY,
 case_id TEXT NOT NULL REFERENCES wa_residential_form_cases(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 decision TEXT NOT NULL CHECK(decision IN('approved','refused','approved_with_conditions','information_requested','disputed','acknowledged')),
 explanation_envelope TEXT NOT NULL,
 authority_reference TEXT,
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX wa_form_decisions_case ON wa_residential_form_decisions(case_id,created_at);
CREATE TRIGGER wa_form_decisions_immutable_u BEFORE UPDATE ON wa_residential_form_decisions BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER wa_form_decisions_immutable_d BEFORE DELETE ON wa_residential_form_decisions BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;

CREATE TABLE wa_residential_form_external_events (
 id TEXT PRIMARY KEY,
 case_id TEXT NOT NULL REFERENCES wa_residential_form_cases(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL CHECK(action IN('prepared','submitted','confirmed','rejected','disputed','determined','appealed','finalised')),
 provider TEXT NOT NULL,
 external_reference TEXT NOT NULL,
 evidence_reference TEXT NOT NULL,
 effective_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(case_id,action,external_reference)
) STRICT;
CREATE INDEX wa_form_external_case ON wa_residential_form_external_events(case_id,created_at);
CREATE TRIGGER wa_form_external_immutable_u BEFORE UPDATE ON wa_residential_form_external_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER wa_form_external_immutable_d BEFORE DELETE ON wa_residential_form_external_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;

CREATE TABLE wa_residential_form_signatures (
 id TEXT PRIMARY KEY,
 case_id TEXT NOT NULL REFERENCES wa_residential_form_cases(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 signer_kind TEXT NOT NULL CHECK(signer_kind IN('tenant','landlord','staff_witness','external')),
 method TEXT NOT NULL CHECK(method IN('wet_ink','stylus','external_provider')),
 signed_document_id TEXT NOT NULL REFERENCES documents(id),
 evidence_reference TEXT NOT NULL,
 verified_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(case_id,signer_kind,actor_id,signed_document_id)
) STRICT;
CREATE INDEX wa_form_signatures_case ON wa_residential_form_signatures(case_id,created_at);
CREATE TRIGGER wa_form_signatures_immutable_u BEFORE UPDATE ON wa_residential_form_signatures BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER wa_form_signatures_immutable_d BEFORE DELETE ON wa_residential_form_signatures BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;

-- Avoid double booking linkage and cross-property mistakes even in bypassed API writes.
CREATE TRIGGER wa_form_booking_guard_i BEFORE INSERT ON wa_residential_form_cases
WHEN NEW.booking_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'WA_FORM_BOOKING_PROPERTY_MISMATCH')
 WHERE NOT EXISTS(SELECT 1 FROM bookings b WHERE b.id=NEW.booking_id AND b.property_id=NEW.property_id AND b.status IN('confirmed','completed'));
END;
CREATE TRIGGER wa_form_booking_guard_u BEFORE UPDATE OF booking_id ON wa_residential_form_cases
WHEN NEW.booking_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'WA_FORM_BOOKING_PROPERTY_MISMATCH')
 WHERE NOT EXISTS(SELECT 1 FROM bookings b WHERE b.id=NEW.booking_id AND b.property_id=NEW.property_id AND b.status IN('confirmed','completed'));
END;
