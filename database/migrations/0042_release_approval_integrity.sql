-- Configuration flags alone cannot constitute hosted/legal/provider acceptance.
CREATE TABLE feature_release_approvals (
 id TEXT PRIMARY KEY,
 feature TEXT NOT NULL,
 environment TEXT NOT NULL CHECK(environment IN('staging','production')),
 source_sha TEXT NOT NULL CHECK(length(source_sha)=40),
 evidence_reference TEXT NOT NULL CHECK(length(evidence_reference)>=8),
 expires_at TEXT NOT NULL,
 requested_by TEXT NOT NULL REFERENCES users(id),
 requested_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN('requested','approved','rejected','revoked')),
 reviewed_by TEXT REFERENCES users(id),
 reviewed_at TEXT,
 review_reference TEXT,
 CHECK(status!='approved' OR (reviewed_by IS NOT NULL AND reviewed_by!=requested_by AND reviewed_at IS NOT NULL AND length(review_reference)>=8))
) STRICT;
CREATE INDEX release_approval_lookup ON feature_release_approvals(feature,environment,source_sha,status,expires_at);
CREATE TRIGGER release_approval_scope_immutable BEFORE UPDATE OF feature,environment,source_sha,evidence_reference,expires_at,requested_by,requested_at ON feature_release_approvals BEGIN SELECT RAISE(ABORT,'RELEASE_SCOPE_IMMUTABLE'); END;
CREATE TRIGGER release_approval_transition BEFORE UPDATE OF status ON feature_release_approvals WHEN NOT((OLD.status='requested' AND NEW.status IN('approved','rejected')) OR (OLD.status='approved' AND NEW.status='revoked')) BEGIN SELECT RAISE(ABORT,'RELEASE_STATUS_INVALID'); END;
CREATE TRIGGER release_independent_reviewer BEFORE UPDATE OF status ON feature_release_approvals WHEN NEW.status='approved' BEGIN
 SELECT RAISE(ABORT,'RELEASE_REVIEWER_REQUIRED') WHERE NEW.reviewed_by=NEW.requested_by OR NOT EXISTS(SELECT 1 FROM staff_profiles s JOIN users u ON u.id=s.user_id WHERE s.user_id=NEW.reviewed_by AND s.role='administrator' AND s.active=1 AND u.active=1 AND u.verified_at IS NOT NULL);
END;
CREATE TRIGGER release_no_delete BEFORE DELETE ON feature_release_approvals BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
