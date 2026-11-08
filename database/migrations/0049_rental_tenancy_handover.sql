-- Secure, idempotent link from an independently recorded agency outcome to an
-- UNEXECUTED / pending tenancy. This migration does not enable public intake.
-- Activation requires a separately verified executed official WA Form 1AA.
CREATE TABLE rental_tenancy_handovers (
 id TEXT PRIMARY KEY,
 application_id TEXT NOT NULL UNIQUE REFERENCES rental_applications(id),
 outcome_id TEXT NOT NULL UNIQUE REFERENCES rental_application_outcomes(id),
 submission_id TEXT NOT NULL REFERENCES rental_application_submissions(id),
 listing_id TEXT NOT NULL REFERENCES leasing_listings(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 tenancy_id TEXT NOT NULL UNIQUE REFERENCES tenancies(id),
 request_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'awaiting_agreement'
  CHECK(status IN('awaiting_agreement','activated')),
 authority_reference TEXT NOT NULL CHECK(length(trim(authority_reference))>=8),
 terms_envelope TEXT NOT NULL,
 applicant_count INTEGER NOT NULL CHECK(applicant_count BETWEEN 1 AND 10),
 initiated_by TEXT NOT NULL REFERENCES users(id),
 initiated_at TEXT NOT NULL,
 activated_by TEXT REFERENCES users(id),
 activated_at TEXT,
 activation_reference TEXT,
 CHECK((status='activated')=(activated_at IS NOT NULL))
) STRICT;
CREATE INDEX rental_handover_tenancy_status ON rental_tenancy_handovers(tenancy_id,status);

CREATE TABLE rental_tenancy_handover_people (
 id TEXT PRIMARY KEY,
 handover_id TEXT NOT NULL REFERENCES rental_tenancy_handovers(id),
 applicant_ordinal INTEGER NOT NULL CHECK(applicant_ordinal BETWEEN 1 AND 10),
 email_hash TEXT NOT NULL CHECK(length(email_hash)=64),
 invitation_token_hash TEXT NOT NULL UNIQUE CHECK(length(invitation_token_hash)=64),
 invited_at TEXT NOT NULL,
 UNIQUE(handover_id,applicant_ordinal), UNIQUE(handover_id,email_hash)
) STRICT;

CREATE TRIGGER rental_handover_source_guard BEFORE INSERT ON rental_tenancy_handovers BEGIN
 SELECT RAISE(ABORT,'HANDOVER_APPLICATION_NOT_APPROVED') WHERE NOT EXISTS (
  SELECT 1 FROM rental_applications a
  JOIN rental_application_outcomes o ON o.application_id=a.id AND o.outcome='successful'
  JOIN rental_application_submissions s ON s.application_id=a.id
  JOIN leasing_listings l ON l.id=a.listing_id
  JOIN properties p ON p.id=l.property_id AND p.sector='residential'
  JOIN tenancies t ON t.id=NEW.tenancy_id AND t.property_id=p.id AND t.status='pending'
  WHERE a.id=NEW.application_id AND a.status='decision_recorded'
    AND (a.privacy_hold_until IS NULL OR a.privacy_hold_until<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    AND o.id=NEW.outcome_id AND s.id=NEW.submission_id
    AND l.id=NEW.listing_id AND l.property_id=NEW.property_id
    AND l.instructed_by_client_id IN (
      SELECT pm.manager_client_id FROM property_management_relationships pm
       WHERE pm.property_id=p.id AND pm.ends_at IS NULL)
    AND EXISTS (SELECT 1 FROM rental_application_handoffs h
      WHERE h.application_id=a.id AND h.status='delivered')
 );
 SELECT RAISE(ABORT,'HANDOVER_TENANCY_OVERLAP') WHERE EXISTS(
   SELECT 1 FROM tenancies proposed JOIN tenancies other
     ON other.property_id=proposed.property_id AND other.id!=proposed.id
   WHERE proposed.id=NEW.tenancy_id AND other.status IN('pending','active')
     AND (other.ends_at IS NULL OR other.ends_at>proposed.starts_at)
     AND (proposed.ends_at IS NULL OR other.starts_at<proposed.ends_at)
 );
END;

CREATE TRIGGER rental_handover_immutable BEFORE UPDATE OF
 application_id,outcome_id,submission_id,listing_id,property_id,tenancy_id,request_key,
 authority_reference,terms_envelope,applicant_count,initiated_by,initiated_at
 ON rental_tenancy_handovers
 BEGIN SELECT RAISE(ABORT,'HANDOVER_SOURCE_IMMUTABLE'); END;
CREATE TRIGGER rental_handover_no_delete BEFORE DELETE ON rental_tenancy_handovers
 BEGIN SELECT RAISE(ABORT,'HANDOVER_REQUIRES_RETENTION_REVIEW'); END;

CREATE TRIGGER rental_handover_activate_guard BEFORE UPDATE OF status
 ON rental_tenancy_handovers
 WHEN NEW.status='activated'
 BEGIN
  SELECT RAISE(ABORT,'HANDOVER_ALREADY_FINALISED') WHERE OLD.status!='awaiting_agreement';
  SELECT RAISE(ABORT,'HANDOVER_MISSING_EXECUTED_FORM_1AA') WHERE NOT EXISTS(
   SELECT 1 FROM wa_agreement_envelopes e
   JOIN wa_residential_form_cases c ON c.id=e.case_id
   JOIN documents d ON d.id=e.executed_document_id AND d.status='issued'
   WHERE e.tenancy_id=NEW.tenancy_id AND e.property_id=NEW.property_id
     AND e.status='executed' AND e.executed_document_id IS NOT NULL
     AND c.form_code='WA_FORM_1AA' AND c.tenancy_id=NEW.tenancy_id
  );
 END;
CREATE TRIGGER rental_handover_people_immutable BEFORE UPDATE ON rental_tenancy_handover_people
 BEGIN SELECT RAISE(ABORT,'HANDOVER_PARTICIPANTS_IMMUTABLE'); END;
CREATE TRIGGER rental_handover_people_no_delete BEFORE DELETE ON rental_tenancy_handover_people
 BEGIN SELECT RAISE(ABORT,'HANDOVER_PARTICIPANTS_IMMUTABLE'); END;
