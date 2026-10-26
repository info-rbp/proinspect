-- Immutable approved text and transaction-bound consent. No approval is seeded.
CREATE TABLE legal_document_versions (
 id TEXT PRIMARY KEY,
 document_key TEXT NOT NULL CHECK(document_key IN('privacy','terms','website-terms','platform-terms','booking-policy','service-scopes','subscription-terms')),
 version_label TEXT NOT NULL,
 title TEXT NOT NULL,
 body_json TEXT NOT NULL CHECK(json_valid(body_json)),
 content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','withdrawn')),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 approved_by TEXT REFERENCES users(id),
 approved_at TEXT,
 effective_at TEXT,
 approval_reference TEXT,
 withdrawn_by TEXT REFERENCES users(id),
 withdrawn_at TEXT,
 withdrawal_reason TEXT,
 UNIQUE(document_key,version_label),
 CHECK(status!='approved' OR (approved_by IS NOT NULL AND approved_by!=created_by AND approved_at IS NOT NULL AND effective_at IS NOT NULL AND length(approval_reference)>=8))
) STRICT;
CREATE INDEX legal_document_current ON legal_document_versions(document_key,status,effective_at);
CREATE TABLE legal_acceptance_receipts (
 id TEXT PRIMARY KEY,
 subject_kind TEXT NOT NULL CHECK(subject_kind IN('user','guest','rental','request')),
 subject_id TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN('onboarding','guest-intake','booking','payment','subscription','rental')),
 transaction_id TEXT NOT NULL,
 document_id TEXT NOT NULL REFERENCES legal_document_versions(id),
 content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
 acknowledgement TEXT NOT NULL CHECK(acknowledgement IN('privacy_notice','contract')),
 snapshot_sha256 TEXT NOT NULL CHECK(length(snapshot_sha256)=64),
 created_at TEXT NOT NULL,
 UNIQUE(subject_kind,subject_id,purpose,transaction_id,document_id)
) STRICT;
CREATE TRIGGER legal_text_immutable BEFORE UPDATE OF document_key,version_label,title,body_json,content_sha256,created_by,created_at ON legal_document_versions BEGIN SELECT RAISE(ABORT,'LEGAL_VERSION_IMMUTABLE'); END;
CREATE TRIGGER legal_version_no_delete BEFORE DELETE ON legal_document_versions BEGIN SELECT RAISE(ABORT,'LEGAL_VERSION_IMMUTABLE'); END;
CREATE TRIGGER legal_status_transition BEFORE UPDATE OF status ON legal_document_versions WHEN NOT((OLD.status='draft' AND NEW.status IN('approved','withdrawn')) OR (OLD.status='approved' AND NEW.status='withdrawn')) BEGIN SELECT RAISE(ABORT,'LEGAL_STATUS_INVALID'); END;
CREATE TRIGGER legal_independent_approval BEFORE UPDATE OF status ON legal_document_versions WHEN NEW.status='approved' BEGIN
 SELECT RAISE(ABORT,'LEGAL_APPROVER_REQUIRED') WHERE NOT EXISTS(SELECT 1 FROM staff_profiles s JOIN users u ON u.id=s.user_id WHERE s.user_id=NEW.approved_by AND s.role='administrator' AND s.active=1 AND u.active=1 AND u.verified_at IS NOT NULL) OR NEW.approved_by=NEW.created_by;
END;
CREATE TRIGGER legal_receipt_current BEFORE INSERT ON legal_acceptance_receipts BEGIN
 SELECT RAISE(ABORT,'LEGAL_VERSION_CHANGED') WHERE NOT EXISTS(SELECT 1 FROM legal_document_versions v WHERE v.id=NEW.document_id AND v.content_sha256=NEW.content_sha256 AND v.status='approved' AND v.effective_at<=NEW.created_at);
END;
CREATE TRIGGER legal_receipt_no_update BEFORE UPDATE ON legal_acceptance_receipts BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER legal_receipt_no_delete BEFORE DELETE ON legal_acceptance_receipts BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
