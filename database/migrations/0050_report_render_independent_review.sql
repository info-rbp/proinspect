-- A report draft's QC approval is distinct from approval of the exact rendered bytes.
-- Additive review evidence. Existing documents remain unchanged and non-report documents
-- retain their normal issuance process. Deploy before the corresponding Worker code.
CREATE TABLE report_render_reviews (
 id TEXT PRIMARY KEY,
 report_version_id TEXT NOT NULL UNIQUE REFERENCES report_versions(id),
 document_id TEXT NOT NULL UNIQUE REFERENCES documents(id),
 document_sha256 TEXT NOT NULL CHECK(length(document_sha256)=64),
 reviewer_id TEXT NOT NULL REFERENCES users(id),
 decision TEXT NOT NULL CHECK(decision IN('accepted','rejected')),
 review_reference TEXT NOT NULL CHECK(length(trim(review_reference)) BETWEEN 8 AND 500),
 reviewed_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER report_render_review_source BEFORE INSERT ON report_render_reviews BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM report_render_manifests m
  JOIN documents d ON d.id=m.document_id
  JOIN report_versions v ON v.id=m.report_version_id
  JOIN inspection_reports r ON r.id=v.report_id
  JOIN users u ON u.id=NEW.reviewer_id AND u.active=1 AND u.verified_at IS NOT NULL
  JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1
  WHERE m.report_version_id=NEW.report_version_id AND m.document_id=NEW.document_id
    AND m.document_sha256=NEW.document_sha256 AND d.sha256=NEW.document_sha256
    AND d.status='review' AND r.approved_version_id=NEW.report_version_id
    AND r.status='approved' AND r.inspector_id IS NOT NEW.reviewer_id
    AND r.created_by IS NOT NEW.reviewer_id AND d.created_by IS NOT NEW.reviewer_id
    AND (r.reviewer_id=NEW.reviewer_id OR sp.role IN('administrator','operations_manager'))
 ) THEN RAISE(ABORT,'INDEPENDENT_RENDER_REVIEW_REQUIRED') END;
END;
CREATE TRIGGER report_render_review_immutable_update BEFORE UPDATE ON report_render_reviews
 BEGIN SELECT RAISE(ABORT,'RENDER_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER report_render_review_immutable_delete BEFORE DELETE ON report_render_reviews
 BEGIN SELECT RAISE(ABORT,'RENDER_REVIEW_IMMUTABLE'); END;
-- A generated report is never an ordinary upload: generic document issue and
-- recipient-grant paths must not bypass accepted rendered-byte evidence.
CREATE TRIGGER report_render_document_issue_guard BEFORE UPDATE OF status ON documents
 WHEN NEW.status='issued' AND OLD.status!='issued' AND EXISTS (
  SELECT 1 FROM report_render_manifests m WHERE m.document_id=OLD.id
 ) BEGIN
 SELECT CASE WHEN NOT EXISTS (
   SELECT 1 FROM report_render_manifests m
   JOIN report_render_reviews rv ON rv.report_version_id=m.report_version_id AND rv.document_id=m.document_id
   JOIN report_versions v ON v.id=m.report_version_id
   JOIN inspection_reports r ON r.id=v.report_id
   JOIN users u ON u.id=rv.reviewer_id AND u.active=1 AND u.verified_at IS NOT NULL
   JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1
   WHERE m.document_id=OLD.id AND rv.decision='accepted'
     AND rv.document_sha256=OLD.sha256 AND m.document_sha256=OLD.sha256
     AND r.approved_version_id=m.report_version_id AND r.status IN('approved','issued')
     AND r.inspector_id IS NOT rv.reviewer_id AND r.created_by IS NOT rv.reviewer_id
     AND OLD.created_by IS NOT rv.reviewer_id
 ) THEN RAISE(ABORT,'RENDER_DOCUMENT_REVIEW_REQUIRED') END;
END;
