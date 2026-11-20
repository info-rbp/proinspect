-- Additive, empty release configuration. Does not enable uploads, rewrite
-- application records or alter any previously applied migration.
CREATE TABLE managed_rental_document_releases (
 id TEXT PRIMARY KEY,
 environment TEXT NOT NULL CHECK(environment IN('staging','production')),
 source_sha TEXT NOT NULL CHECK(length(source_sha)=40),
 policy_version TEXT NOT NULL, policy_sha256 TEXT NOT NULL CHECK(length(policy_sha256)=64),
 intake_mode TEXT NOT NULL CHECK(intake_mode='scanned_documents'),
 scanner_worker_name TEXT NOT NULL,
 scanner_source_sha TEXT NOT NULL CHECK(length(scanner_source_sha)=40),
 scanner_image_digest TEXT NOT NULL CHECK(length(scanner_image_digest)=64),
 scanner_key_id TEXT NOT NULL CHECK(length(scanner_key_id)=64),
 scanner_public_jwk TEXT NOT NULL CHECK(json_valid(scanner_public_jwk) AND json_extract(scanner_public_jwk,'$.kty')='EC' AND json_extract(scanner_public_jwk,'$.crv')='P-256' AND json_extract(scanner_public_jwk,'$.d') IS NULL),
 scanner_test_sha256 TEXT NOT NULL CHECK(length(scanner_test_sha256)=64),
 scanner_verified_at TEXT NOT NULL,
 authorized_by TEXT NOT NULL, authorization_reference TEXT NOT NULL CHECK(length(authorization_reference)>=12),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)), created_at TEXT NOT NULL,
 UNIQUE(environment,source_sha)
) STRICT;
CREATE TRIGGER managed_document_release_immutable
 BEFORE UPDATE OF id,environment,source_sha,policy_version,policy_sha256,intake_mode,scanner_worker_name,scanner_source_sha,scanner_image_digest,scanner_key_id,scanner_public_jwk,scanner_test_sha256,scanner_verified_at,authorized_by,authorization_reference,created_at
 ON managed_rental_document_releases
 BEGIN SELECT RAISE(ABORT,'DOCUMENT_RELEASE_IMMUTABLE'); END;
-- Enforce the existing per-applicant limit even for simultaneous requests.
CREATE TRIGGER rental_document_count_limit BEFORE INSERT ON rental_application_documents
 WHEN (SELECT COUNT(*) FROM rental_application_documents WHERE applicant_id=NEW.applicant_id)>=10
 BEGIN SELECT RAISE(ABORT,'RENTAL_DOCUMENT_LIMIT'); END;
