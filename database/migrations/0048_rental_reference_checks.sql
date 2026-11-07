-- Additive manual reference checks. Does not activate rental application intake.
CREATE TABLE rental_application_reference_checks (
 id TEXT PRIMARY KEY,
 application_id TEXT NOT NULL REFERENCES rental_applications(id),
 applicant_id TEXT NOT NULL REFERENCES rental_applicants(id),
 target TEXT NOT NULL CHECK(target IN('previous_lessor','employer','personal_1','personal_2')),
 outcome TEXT NOT NULL CHECK(outcome IN('contact_attempted','confirmed','not_confirmed','unable_to_contact','not_applicable')),
 method TEXT NOT NULL CHECK(method IN('phone','email','other','not_contacted')),
 details_envelope TEXT NOT NULL,
 recorded_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX rental_reference_checks_application ON rental_application_reference_checks(application_id,applicant_id,created_at DESC);
CREATE TRIGGER rental_reference_check_applicant_guard BEFORE INSERT ON rental_application_reference_checks
WHEN NOT EXISTS(SELECT 1 FROM rental_applicants a
  WHERE a.id=NEW.applicant_id AND a.application_id=NEW.application_id AND a.state='complete')
 OR NOT EXISTS(SELECT 1 FROM rental_applications r WHERE r.id=NEW.application_id AND r.status IN('submitted','ready_for_handoff'))
BEGIN SELECT RAISE(ABORT,'RENTAL_REFERENCE_APPLICANT_OR_STATUS_INVALID'); END;
CREATE TRIGGER rental_reference_check_immutable_update BEFORE UPDATE ON rental_application_reference_checks
BEGIN SELECT RAISE(ABORT,'RENTAL_REFERENCE_CHECK_IMMUTABLE'); END;
CREATE TRIGGER rental_reference_check_immutable_delete BEFORE DELETE ON rental_application_reference_checks
WHEN NOT EXISTS(SELECT 1 FROM rental_application_purge_permits p WHERE p.application_id=OLD.application_id)
BEGIN SELECT RAISE(ABORT,'RENTAL_REFERENCE_CHECK_IMMUTABLE'); END;
