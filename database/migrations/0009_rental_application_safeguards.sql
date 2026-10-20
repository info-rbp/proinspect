-- Rental application safety extensions. Form 18 is guidance, NOT a required application template.
-- Sensitive document release is impossible without a recorded trusted scanner result.
ALTER TABLE rental_application_documents ADD COLUMN scan_status TEXT NOT NULL DEFAULT 'pending'
 CHECK(scan_status IN('pending','clean','unsafe','error'));
ALTER TABLE rental_application_documents ADD COLUMN scan_report_envelope TEXT;
ALTER TABLE rental_application_documents ADD COLUMN scanned_at TEXT;
CREATE TRIGGER rental_release_requires_clean_scan BEFORE UPDATE OF review_status ON rental_application_documents
 WHEN NEW.review_status='released' AND (OLD.scan_status!='clean' OR NEW.scan_status!='clean')
 BEGIN SELECT RAISE(ABORT,'TRUSTED_CLEAN_SCAN_REQUIRED'); END;
CREATE TRIGGER rental_scan_verdict_not_reversed BEFORE UPDATE OF scan_status ON rental_application_documents
 WHEN OLD.scan_status IN('clean','unsafe') AND NEW.scan_status!=OLD.scan_status
 BEGIN SELECT RAISE(ABORT,'SCAN_VERDICT_IMMUTABLE'); END;

-- Stage a specific immutable submission for the future Google Apps Script
-- outbound email adapter. Nothing in this migration enables sending.
CREATE TABLE rental_application_handoffs (
 id TEXT PRIMARY KEY,
 application_id TEXT NOT NULL REFERENCES rental_applications(id),
 submission_id TEXT NOT NULL UNIQUE REFERENCES rental_application_submissions(id),
 idempotency_key TEXT NOT NULL UNIQUE,
 recipient_hash TEXT NOT NULL,
 recipient_envelope TEXT NOT NULL,
 format_version TEXT NOT NULL DEFAULT 'proinspect-rental-email-v1',
 status TEXT NOT NULL DEFAULT 'awaiting_script'
  CHECK(status IN('awaiting_script','delivered','cancelled')),
 delivery_reference TEXT,
 staged_at TEXT NOT NULL,
 delivered_at TEXT,
 CHECK(status!='delivered' OR (delivered_at IS NOT NULL AND delivery_reference IS NOT NULL))
) STRICT;
CREATE INDEX rental_handoffs_by_status ON rental_application_handoffs(status,staged_at);
CREATE TRIGGER rental_handoff_cannot_claim_delivery BEFORE UPDATE OF status ON rental_application_handoffs
 WHEN NEW.status='delivered'
 BEGIN SELECT RAISE(ABORT,'GOOGLE_SCRIPT_DELIVERY_NOT_YET_IMPLEMENTED'); END;
CREATE TRIGGER rental_forwarded_requires_confirmed_handoff BEFORE UPDATE OF status ON rental_applications
 WHEN NEW.status='forwarded' AND NOT EXISTS(
  SELECT 1 FROM rental_application_handoffs h
   WHERE h.application_id=NEW.id AND h.status='delivered')
 BEGIN SELECT RAISE(ABORT,'AGENCY_EMAIL_DELIVERY_NOT_CONFIRMED'); END;
CREATE TRIGGER rental_handoff_requires_review BEFORE INSERT ON rental_application_handoffs
 WHEN EXISTS(SELECT 1 FROM rental_application_documents d
 WHERE d.application_id=NEW.application_id AND d.review_status='quarantined')
 BEGIN SELECT RAISE(ABORT,'DOCUMENTS_PENDING_MALWARE_REVIEW'); END;

-- Retention is policy-controlled, never interpreted as a statutory period.
ALTER TABLE rental_applications ADD COLUMN privacy_hold_until TEXT;
ALTER TABLE rental_applications ADD COLUMN privacy_hold_reference_envelope TEXT;
CREATE INDEX rental_applications_retention_due ON rental_applications(retained_until,status);
CREATE TABLE rental_application_privacy_requests (
 id TEXT PRIMARY KEY,
 application_id TEXT NOT NULL REFERENCES rental_applications(id),
 applicant_id TEXT NOT NULL REFERENCES rental_applicants(id),
 kind TEXT NOT NULL CHECK(kind IN('access','correction','erasure')),
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN('requested','in_review','fulfilled','declined')),
 request_envelope TEXT NOT NULL,
 created_at TEXT NOT NULL,
 closed_at TEXT,
 reviewed_by TEXT REFERENCES users(id)
) STRICT;
CREATE INDEX rental_privacy_requests_status ON rental_application_privacy_requests(status,created_at);
CREATE INDEX rental_privacy_requests_parent ON rental_application_privacy_requests(application_id,applicant_id);

-- Allow deletion of historical envelopes ONLY as part of an authorised privacy purge.
-- Ordinary event/snapshot updates and deletions remain prohibited.
CREATE TABLE rental_application_purge_permits (
 application_id TEXT PRIMARY KEY,
 reason TEXT NOT NULL CHECK(reason IN('retention_expired','privacy_request','operational_remediation')),
 issued_at TEXT NOT NULL
) STRICT;
CREATE TABLE rental_application_purge_receipts (
 id TEXT PRIMARY KEY,
 reference_digest TEXT NOT NULL UNIQUE,
 reason TEXT NOT NULL CHECK(reason IN('retention_expired','privacy_request','operational_remediation')),
 actor_user_id TEXT REFERENCES users(id),
 document_count INTEGER NOT NULL CHECK(document_count>=0),
 applicant_count INTEGER NOT NULL CHECK(applicant_count>=0),
 purged_at TEXT NOT NULL
) STRICT;
DROP TRIGGER rental_events_immutable_delete;
CREATE TRIGGER rental_events_immutable_delete BEFORE DELETE ON rental_application_events
 WHEN NOT EXISTS(SELECT 1 FROM rental_application_purge_permits p WHERE p.application_id=OLD.application_id)
 BEGIN SELECT RAISE(ABORT,'RENTAL_APPLICATION_HISTORY_IMMUTABLE'); END;
DROP TRIGGER rental_submission_immutable_delete;
CREATE TRIGGER rental_submission_immutable_delete BEFORE DELETE ON rental_application_submissions
 WHEN NOT EXISTS(SELECT 1 FROM rental_application_purge_permits p WHERE p.application_id=OLD.application_id)
 BEGIN SELECT RAISE(ABORT,'RENTAL_SUBMISSION_IMMUTABLE'); END;

CREATE TABLE rental_document_scan_receipts (
 event_id TEXT PRIMARY KEY,
 document_id TEXT NOT NULL REFERENCES rental_application_documents(id),
 received_at TEXT NOT NULL
) STRICT;
CREATE INDEX rental_scan_receipts_doc ON rental_document_scan_receipts(document_id);

-- Bind declarations to the exact tenancy database notice presented to each applicant.
ALTER TABLE rental_applicants ADD COLUMN notice_digest TEXT;

-- A withdrawal or purge in progress must also block an upload that was
-- started before the application was withdrawn.
CREATE TRIGGER rental_upload_requires_editable_application BEFORE INSERT ON rental_application_documents
 WHEN NOT EXISTS(SELECT 1 FROM rental_applications a WHERE a.id=NEW.application_id
 AND a.status IN('draft','information_requested'))
 BEGIN SELECT RAISE(ABORT,'RENTAL_DOCUMENT_UPLOAD_CLOSED'); END;
CREATE UNIQUE INDEX rental_privacy_one_open_request ON rental_application_privacy_requests(applicant_id,kind)
 WHERE status IN('requested','in_review');
