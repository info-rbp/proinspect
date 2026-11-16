-- Opt-in transit storage only. No files, releases or recipients are enabled here.
CREATE TABLE managed_rental_temporary_releases (
 id TEXT PRIMARY KEY, environment TEXT NOT NULL CHECK(environment IN('staging','production')),
 source_sha TEXT NOT NULL CHECK(length(source_sha)=40),
 policy_version TEXT NOT NULL, policy_sha256 TEXT NOT NULL CHECK(length(policy_sha256)=64),
 intake_mode TEXT NOT NULL CHECK(intake_mode='temporary_documents'),
 authorized_by TEXT NOT NULL, authorization_reference TEXT NOT NULL CHECK(length(authorization_reference)>=12),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)), created_at TEXT NOT NULL,
 UNIQUE(environment,source_sha)
) STRICT;
CREATE TRIGGER rental_temporary_release_immutable BEFORE UPDATE OF id,environment,source_sha,policy_version,policy_sha256,intake_mode,authorized_by,authorization_reference,created_at ON managed_rental_temporary_releases
 BEGIN SELECT RAISE(ABORT,'TEMPORARY_RELEASE_IMMUTABLE'); END;

CREATE TABLE rental_temporary_documents (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES rental_applications(id),
 applicant_id TEXT NOT NULL REFERENCES rental_applicants(id),
 object_key TEXT NOT NULL UNIQUE, metadata_envelope TEXT,
 size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880), sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 state TEXT NOT NULL DEFAULT 'quarantined' CHECK(state IN('quarantined','approved','rejected','purging','purged')),
 security_evidence_envelope TEXT, reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT,
 uploaded_at TEXT NOT NULL, stored_at TEXT, delete_after TEXT NOT NULL, purged_at TEXT,
 CHECK(state!='approved' OR (security_evidence_envelope IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 CHECK(state!='purged' OR (metadata_envelope IS NULL AND security_evidence_envelope IS NULL AND purged_at IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX rental_temporary_duplicate_active ON rental_temporary_documents(applicant_id,sha256) WHERE state!='purged';
CREATE INDEX rental_temporary_due ON rental_temporary_documents(state,delete_after);
CREATE INDEX rental_temporary_parent ON rental_temporary_documents(application_id,applicant_id);
CREATE TRIGGER rental_temporary_upload_guard BEFORE INSERT ON rental_temporary_documents BEGIN
 SELECT RAISE(ABORT,'TEMPORARY_UPLOAD_CLOSED') WHERE NOT EXISTS(
  SELECT 1 FROM rental_applications a JOIN rental_applicants p ON p.application_id=a.id
  JOIN leasing_listings l ON l.id=a.listing_id JOIN property_application_management m ON m.property_id=l.property_id
  WHERE a.id=NEW.application_id AND p.id=NEW.applicant_id AND p.state!='removed'
  AND a.status IN('draft','information_requested') AND (a.privacy_hold_until IS NULL OR a.privacy_hold_until<=strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND INSTR(a.consent_version,'|managed-temporary:')>0
  AND m.provider='proinspect' AND l.status='published' AND l.application_mode='proinspect' AND l.application_url IS NULL);
 SELECT RAISE(ABORT,'TEMPORARY_DOCUMENT_LIMIT') WHERE
  (SELECT COUNT(*) FROM rental_temporary_documents WHERE applicant_id=NEW.applicant_id AND state!='purged')>=10;
 SELECT RAISE(ABORT,'TEMPORARY_STORAGE_LIMIT') WHERE
  COALESCE((SELECT SUM(size_bytes) FROM rental_temporary_documents WHERE application_id=NEW.application_id AND state!='purged'),0)+NEW.size_bytes>52428800;
END;
CREATE TRIGGER rental_temporary_manifest_immutable BEFORE UPDATE OF application_id,applicant_id,object_key,size_bytes,sha256,uploaded_at ON rental_temporary_documents
 BEGIN SELECT RAISE(ABORT,'TEMPORARY_DOCUMENT_IMMUTABLE'); END;
CREATE TRIGGER rental_temporary_review_guard BEFORE UPDATE OF state ON rental_temporary_documents
 WHEN (OLD.state IN('purging','purged') AND NEW.state NOT IN('purging','purged')) OR
 (NEW.state='approved' AND OLD.state!='quarantined')
 BEGIN SELECT RAISE(ABORT,'TEMPORARY_REVIEW_CLOSED'); END;

CREATE TABLE rental_temporary_packages (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES rental_applications(id),
 submission_id TEXT NOT NULL REFERENCES rental_application_submissions(id),
 outbox_id TEXT NOT NULL UNIQUE REFERENCES outbox_events(id), token_hash TEXT NOT NULL UNIQUE,
 recipient_envelope TEXT NOT NULL, recipient_hash TEXT NOT NULL, cc_hash TEXT NOT NULL,
 management_version INTEGER NOT NULL, recipient_verified_at TEXT NOT NULL,
 document_ids_json TEXT NOT NULL CHECK(json_valid(document_ids_json)),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 sent_at TEXT, provider_id TEXT, expires_at TEXT NOT NULL, revoked_at TEXT,
 UNIQUE(application_id,submission_id), CHECK(sent_at IS NULL OR provider_id IS NOT NULL)
) STRICT;
CREATE INDEX rental_temporary_package_parent ON rental_temporary_packages(application_id);
CREATE TRIGGER rental_temporary_package_immutable BEFORE UPDATE OF application_id,submission_id,outbox_id,token_hash,recipient_envelope,recipient_hash,cc_hash,management_version,recipient_verified_at,document_ids_json,created_by,created_at ON rental_temporary_packages
 BEGIN SELECT RAISE(ABORT,'TEMPORARY_PACKAGE_IMMUTABLE'); END;
CREATE TRIGGER rental_temporary_package_sent_once BEFORE UPDATE OF sent_at,provider_id,expires_at ON rental_temporary_packages
 WHEN OLD.sent_at IS NOT NULL AND (NEW.sent_at IS NOT OLD.sent_at OR NEW.provider_id IS NOT OLD.provider_id OR NEW.expires_at IS NOT OLD.expires_at)
 BEGIN SELECT RAISE(ABORT,'TEMPORARY_SEND_RECEIPT_IMMUTABLE'); END;
