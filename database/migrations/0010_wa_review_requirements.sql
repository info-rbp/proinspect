-- Human-reviewed prerequisites for high-risk statutory documents.
-- These attest to underlying external evidence; they do NOT amount to a
-- determination that an email constituted legal service.
CREATE TABLE wa_residential_form_verifications (
 id TEXT PRIMARY KEY,
 case_id TEXT NOT NULL REFERENCES wa_residential_form_cases(id),
 verified_by TEXT NOT NULL REFERENCES users(id),
 requirement TEXT NOT NULL CHECK(requirement IN(
  'verified_prior_form_21','statutory_grounds_review','legal_service_review',
  'verified_rent_ledger','verified_grounds','verified_entry_purpose',
  'service_window_review','official_signature_policy','issued_pcr_report'
 )),
 evidence_reference TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(case_id,requirement)
) STRICT;
CREATE TRIGGER wa_form_verifications_immutable_u BEFORE UPDATE ON wa_residential_form_verifications
BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER wa_form_verifications_immutable_d BEFORE DELETE ON wa_residential_form_verifications
BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE INDEX wa_form_verifications_case ON wa_residential_form_verifications(case_id,requirement);

ALTER TABLE wa_residential_form_cases ADD COLUMN completed_at TEXT;
ALTER TABLE wa_residential_form_cases ADD COLUMN completion_reference TEXT;
