-- Residential Form 18-based online applications are strictly separate from tenancy records.
-- Existing external application URLs retain their precedence when this migration is applied.
ALTER TABLE leasing_listings ADD COLUMN application_mode TEXT NOT NULL DEFAULT 'unavailable'
 CHECK(application_mode IN('external','proinspect','unavailable'));
ALTER TABLE leasing_listings ADD COLUMN application_authority_reference TEXT;
ALTER TABLE leasing_listings ADD COLUMN application_recipient_email TEXT;
ALTER TABLE leasing_listings ADD COLUMN tenancy_database_notice_mode TEXT NOT NULL DEFAULT 'unconfigured'
 CHECK(tenancy_database_notice_mode IN('unconfigured','not_used','configured'));
ALTER TABLE leasing_listings ADD COLUMN tenancy_database_notice_json TEXT NOT NULL DEFAULT '[]'
 CHECK(json_valid(tenancy_database_notice_json));
UPDATE leasing_listings SET application_mode='external' WHERE application_url IS NOT NULL AND application_url LIKE 'https://%';

-- A published ProInspect application must have explicit client authority and a
-- named authorised contact. Never infer application authority from a normal inspection booking.
CREATE TRIGGER leasing_application_settings_guard BEFORE UPDATE OF application_mode,application_url,
 application_authority_reference,application_recipient_email,tenancy_database_notice_mode,tenancy_database_notice_json
 ON leasing_listings
BEGIN
 SELECT RAISE(ABORT,'EXTERNAL_APPLICATION_URL_REQUIRED') WHERE
   NEW.application_mode='external' AND (NEW.application_url IS NULL OR NEW.application_url NOT LIKE 'https://%');
 SELECT RAISE(ABORT,'EXTERNAL_APPLICATION_PRECEDENCE') WHERE NEW.application_mode='proinspect' AND NEW.application_url IS NOT NULL;
 SELECT RAISE(ABORT,'RESIDENTIAL_APPLICATION_ONLY') WHERE NEW.application_mode='proinspect' AND NEW.kind!='residential';
 SELECT RAISE(ABORT,'APPLICATION_AUTHORITY_REQUIRED') WHERE NEW.application_mode='proinspect'
   AND (LENGTH(TRIM(COALESCE(NEW.application_authority_reference,'')))<5
      OR LENGTH(TRIM(COALESCE(NEW.application_recipient_email,'')))<6);
 SELECT RAISE(ABORT,'TENANCY_DATABASE_NOTICE_REQUIRED') WHERE NEW.application_mode='proinspect'
   AND (NEW.tenancy_database_notice_mode='unconfigured' OR
     (NEW.tenancy_database_notice_mode='configured' AND json_array_length(NEW.tenancy_database_notice_json)<1));
END;

CREATE TABLE rental_applications (
 id TEXT PRIMARY KEY,
 listing_id TEXT NOT NULL REFERENCES leasing_listings(id),
 reference TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'draft'
  CHECK(status IN('draft','submitted','information_requested','ready_for_handoff','forwarded','decision_recorded','withdrawn')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 notice_envelope TEXT,
 consent_version TEXT NOT NULL DEFAULT 'form18-digital-2026-10',
 started_at TEXT NOT NULL, submitted_at TEXT, updated_at TEXT NOT NULL,
 forwarded_at TEXT, decision_recorded_at TEXT, withdrawn_at TEXT,
 retained_until TEXT
) STRICT;
CREATE INDEX rental_applications_by_listing ON rental_applications(listing_id,status,started_at);
CREATE INDEX rental_applications_by_status ON rental_applications(status,submitted_at,id);

CREATE TABLE rental_applicants (
 id TEXT PRIMARY KEY,
 application_id TEXT NOT NULL REFERENCES rental_applications(id),
 ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 10),
 role TEXT NOT NULL CHECK(role IN('primary','coapplicant')),
 email_hash TEXT NOT NULL,
 access_token_hash TEXT NOT NULL UNIQUE,
 access_expires_at TEXT NOT NULL,
 answers_envelope TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'invited'
   CHECK(state IN('invited','in_progress','complete','removed')),
 declared_at TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(application_id,ordinal), UNIQUE(application_id,email_hash),
 CHECK(ordinal=1 OR role='coapplicant')
) STRICT;
CREATE INDEX rental_applicants_parent ON rental_applicants(application_id,state);
CREATE INDEX rental_applicants_email ON rental_applicants(email_hash,application_id);
CREATE TRIGGER rental_applicant_owner_guard BEFORE INSERT ON rental_applicants
 WHEN NEW.ordinal=1 AND NEW.role!='primary'
 BEGIN SELECT RAISE(ABORT,'PRIMARY_APPLICANT_REQUIRED'); END;

CREATE TABLE rental_application_documents (
 id TEXT PRIMARY KEY,
 application_id TEXT NOT NULL REFERENCES rental_applications(id),
 applicant_id TEXT NOT NULL REFERENCES rental_applicants(id),
 object_key TEXT NOT NULL UNIQUE,
 category TEXT NOT NULL CHECK(category IN('identity','income','rental_history','other')),
 filename TEXT NOT NULL, content_type TEXT NOT NULL
  CHECK(content_type IN('application/pdf','image/jpeg','image/png','image/webp')),
 size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 8388608),
 sha256 TEXT NOT NULL,
 review_status TEXT NOT NULL DEFAULT 'quarantined'
   CHECK(review_status IN('quarantined','released','rejected')),
 uploaded_at TEXT NOT NULL, reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT
) STRICT;
CREATE INDEX rental_docs_applicant ON rental_application_documents(applicant_id,uploaded_at);
CREATE INDEX rental_docs_application ON rental_application_documents(application_id,review_status);

CREATE TABLE rental_application_events (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES rental_applications(id),
 actor_applicant_id TEXT REFERENCES rental_applicants(id), actor_staff_id TEXT REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN(
  'started','resumed','coapplicant_invited','coapplicant_removed',
  'section_saved','document_uploaded','document_removed','document_reviewed',
  'applicant_completed','submitted','information_requested','ready_for_handoff',
  'forwarded','decision_recorded','withdrawn')),
 envelope TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE INDEX rental_events_application ON rental_application_events(application_id,created_at);
CREATE TRIGGER rental_events_immutable_update BEFORE UPDATE ON rental_application_events BEGIN
 SELECT RAISE(ABORT,'RENTAL_APPLICATION_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER rental_events_immutable_delete BEFORE DELETE ON rental_application_events BEGIN
 SELECT RAISE(ABORT,'RENTAL_APPLICATION_HISTORY_IMMUTABLE'); END;

-- Preserve submitted records: applicant changes after submission require an
-- explicit information-request status, never an unobserved edit.
CREATE TRIGGER rental_submitted_at_required BEFORE UPDATE OF status ON rental_applications
 WHEN NEW.status IN('submitted','ready_for_handoff','forwarded','decision_recorded') AND NEW.submitted_at IS NULL
 BEGIN SELECT RAISE(ABORT,'APPLICATION_SUBMISSION_REQUIRED'); END;

-- Do not strand an unfinished ProInspect household application when a listing
-- is reconfigured for an agency's external portal.
CREATE TRIGGER leasing_application_mode_active_draft_guard BEFORE UPDATE OF application_mode ON leasing_listings
 WHEN OLD.application_mode='proinspect' AND NEW.application_mode!='proinspect' AND EXISTS (
 SELECT 1 FROM rental_applications a WHERE a.listing_id=OLD.id
 AND a.status IN ('draft','submitted','information_requested','ready_for_handoff','forwarded'))
 BEGIN SELECT RAISE(ABORT,'ACTIVE_APPLICATIONS_REQUIRE_TRANSITION'); END;
-- Prevent cross-application applicant/document references even if called by
-- another future backend route.
CREATE TRIGGER rental_application_document_parent_guard BEFORE INSERT ON rental_application_documents
 WHEN NOT EXISTS(SELECT 1 FROM rental_applicants a
 WHERE a.id=NEW.applicant_id AND a.application_id=NEW.application_id AND a.state!='removed')
 BEGIN SELECT RAISE(ABORT,'RENTAL_DOCUMENT_APPLICANT_MISMATCH'); END;

-- Each submitted Form 18 record is an immutable encrypted snapshot. Later
-- information requests create new revisions rather than changing legal history.
CREATE TABLE rental_application_submissions (
 id TEXT PRIMARY KEY,
 application_id TEXT NOT NULL REFERENCES rental_applications(id),
 submitted_by_applicant_id TEXT NOT NULL REFERENCES rental_applicants(id),
 version INTEGER NOT NULL CHECK(version BETWEEN 1 AND 30),
 form_version TEXT NOT NULL,
 snapshot_envelope TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(application_id,version)
) STRICT;
CREATE INDEX rental_submission_history ON rental_application_submissions(application_id,version DESC);
CREATE TRIGGER rental_submission_immutable_update BEFORE UPDATE ON rental_application_submissions BEGIN
 SELECT RAISE(ABORT,'RENTAL_SUBMISSION_IMMUTABLE'); END;
CREATE TRIGGER rental_submission_immutable_delete BEFORE DELETE ON rental_application_submissions BEGIN
 SELECT RAISE(ABORT,'RENTAL_SUBMISSION_IMMUTABLE'); END;
CREATE TRIGGER rental_submission_applicant_guard BEFORE INSERT ON rental_application_submissions
 WHEN NOT EXISTS(SELECT 1 FROM rental_applicants r WHERE r.id=NEW.submitted_by_applicant_id
 AND r.application_id=NEW.application_id AND r.role='primary')
 BEGIN SELECT RAISE(ABORT,'RENTAL_SUBMISSION_PRIMARY_REQUIRED'); END;
