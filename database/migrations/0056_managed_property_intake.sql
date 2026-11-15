-- Explicit property classification and owner-authorised, document-free intake.
-- No property classifications, releases, applications or permissions are seeded.
CREATE TABLE property_application_management (
 property_id TEXT PRIMARY KEY REFERENCES properties(id),
 provider TEXT NOT NULL CHECK(provider IN('proinspect','external','unconfirmed')),
 authority_reference TEXT NOT NULL CHECK(length(authority_reference)>=8),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE managed_rental_intake_releases (
 id TEXT PRIMARY KEY, environment TEXT NOT NULL CHECK(environment IN('staging','production')),
 source_sha TEXT NOT NULL CHECK(length(source_sha)=40),
 policy_version TEXT NOT NULL, policy_sha256 TEXT NOT NULL CHECK(length(policy_sha256)=64),
 intake_mode TEXT NOT NULL CHECK(intake_mode='details_only'),
 authorized_by TEXT NOT NULL, authorization_reference TEXT NOT NULL CHECK(length(authorization_reference)>=12),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 created_at TEXT NOT NULL, UNIQUE(environment,source_sha)
) STRICT;
CREATE TRIGGER managed_rental_release_immutable BEFORE UPDATE OF id,environment,source_sha,policy_version,policy_sha256,intake_mode,authorized_by,authorization_reference,created_at ON managed_rental_intake_releases
 BEGIN SELECT RAISE(ABORT,'MANAGED_RELEASE_IMMUTABLE'); END;
