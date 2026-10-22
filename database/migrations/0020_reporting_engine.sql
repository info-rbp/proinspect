-- Report Creation App integration. Additive to the existing D1 relationship graph.
-- All report data stays private. Nothing in this migration publishes a report or alters existing rows.
CREATE TABLE IF NOT EXISTS report_templates (
 id TEXT PRIMARY KEY, report_type TEXT NOT NULL CHECK(report_type IN('entry','routine','exit','comparison','maintenance')),
 profile TEXT NOT NULL CHECK(profile IN('residential','commercial','strata','attendance')),
 template_version INTEGER NOT NULL CHECK(template_version>0),
 status TEXT NOT NULL CHECK(status IN('published','retired')),
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 published_at TEXT NOT NULL, UNIQUE(report_type,profile,template_version)
);
CREATE TABLE IF NOT EXISTS report_layouts (
 id TEXT PRIMARY KEY, property_id TEXT REFERENCES properties(id), scheme_id TEXT REFERENCES strata_schemes(id),
 version INTEGER NOT NULL CHECK(version>0),
 definition_json TEXT NOT NULL CHECK(json_valid(definition_json)),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK((property_id IS NULL)!=(scheme_id IS NULL))
);
CREATE TABLE IF NOT EXISTS inspection_reports (
 id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL UNIQUE REFERENCES work_orders(id),
 client_id TEXT REFERENCES clients(id), property_id TEXT REFERENCES properties(id),
 scheme_id TEXT REFERENCES strata_schemes(id), tenancy_id TEXT REFERENCES tenancies(id),
 booking_id TEXT REFERENCES bookings(id),
 service_id TEXT REFERENCES services(id), report_type TEXT NOT NULL CHECK(report_type IN('entry','routine','exit','comparison','maintenance')),
 profile TEXT NOT NULL CHECK(profile IN('residential','commercial','strata','attendance')),
 output_kind TEXT NOT NULL CHECK(output_kind IN('inspection','attendance')),
 template_id TEXT NOT NULL REFERENCES report_templates(id),
 template_version INTEGER NOT NULL CHECK(template_version>0),
 layout_snapshot_json TEXT NOT NULL CHECK(json_valid(layout_snapshot_json)),
 baseline_version_id TEXT REFERENCES report_versions(id) DEFERRABLE INITIALLY DEFERRED,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted','changes_requested','approved','issued','archived')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 inspector_id TEXT REFERENCES users(id), reviewer_id TEXT REFERENCES users(id),
 approved_version_id TEXT REFERENCES report_versions(id) DEFERRABLE INITIALLY DEFERRED,
 issued_document_id TEXT REFERENCES documents(id),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK(property_id IS NOT NULL OR scheme_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_reports_client ON inspection_reports(client_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_reports_property ON inspection_reports(property_id,status);
CREATE INDEX IF NOT EXISTS idx_reports_scheme ON inspection_reports(scheme_id,status);
CREATE TABLE IF NOT EXISTS report_drafts (
 report_id TEXT PRIMARY KEY REFERENCES inspection_reports(id),
 revision INTEGER NOT NULL CHECK(revision>0),
 content_json TEXT NOT NULL CHECK(json_valid(content_json)),
 updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS report_versions (
 id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES inspection_reports(id),
 sequence INTEGER NOT NULL CHECK(sequence>0),
 content_json TEXT NOT NULL CHECK(json_valid(content_json)),
 content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
 template_id TEXT NOT NULL REFERENCES report_templates(id),
 layout_sha256 TEXT NOT NULL CHECK(length(layout_sha256)=64),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(report_id,sequence)
);
CREATE TRIGGER IF NOT EXISTS report_version_immutable_update BEFORE UPDATE ON report_versions BEGIN SELECT RAISE(ABORT,'REPORT_VERSION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS report_version_immutable_delete BEFORE DELETE ON report_versions BEGIN SELECT RAISE(ABORT,'REPORT_VERSION_IMMUTABLE'); END;
CREATE TABLE IF NOT EXISTS report_review_events (
 id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES inspection_reports(id),
 report_version_id TEXT REFERENCES report_versions(id),
 reviewer_id TEXT NOT NULL REFERENCES users(id),
 decision TEXT NOT NULL CHECK(decision IN('assigned','approved','changes_requested','rejected_evidence')),
 comment TEXT, created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS report_review_immutable_update BEFORE UPDATE ON report_review_events BEGIN SELECT RAISE(ABORT,'REPORT_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS report_review_immutable_delete BEFORE DELETE ON report_review_events BEGIN SELECT RAISE(ABORT,'REPORT_REVIEW_IMMUTABLE'); END;
CREATE TABLE IF NOT EXISTS report_evidence (
 id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES inspection_reports(id),
 area_id TEXT, component_id TEXT,
 object_key TEXT NOT NULL UNIQUE,
 content_type TEXT NOT NULL CHECK(content_type IN('image/jpeg','image/png','image/webp')),
 size INTEGER NOT NULL CHECK(size>0 AND size<=5242880),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','rejected')),
 uploaded_by TEXT NOT NULL REFERENCES users(id), reviewed_by TEXT REFERENCES users(id),
 uploaded_at TEXT NOT NULL, reviewed_at TEXT, UNIQUE(report_id,sha256)
);
CREATE TABLE IF NOT EXISTS report_render_manifests (
 id TEXT PRIMARY KEY, report_version_id TEXT NOT NULL UNIQUE REFERENCES report_versions(id),
 document_id TEXT REFERENCES documents(id),
 renderer_version TEXT NOT NULL, document_sha256 TEXT NOT NULL CHECK(length(document_sha256)=64),
 manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS report_responses (
 id TEXT PRIMARY KEY, report_version_id TEXT NOT NULL REFERENCES report_versions(id),
 document_id TEXT NOT NULL REFERENCES documents(id), tenancy_id TEXT NOT NULL REFERENCES tenancies(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 response_envelope TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','under_review','resolved')),
 created_at TEXT NOT NULL, resolved_by TEXT REFERENCES users(id), resolved_at TEXT,
 UNIQUE(report_version_id,user_id)
);
CREATE TABLE IF NOT EXISTS report_maintenance_candidates (
 id TEXT PRIMARY KEY, report_version_id TEXT NOT NULL REFERENCES report_versions(id),
 area_id TEXT NOT NULL, component_id TEXT NOT NULL, finding TEXT NOT NULL,
 request_id TEXT REFERENCES requests(id), created_at TEXT NOT NULL,
 UNIQUE(report_version_id,area_id,component_id)
);
CREATE TABLE IF NOT EXISTS report_sync_receipts (
 id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES inspection_reports(id),
 user_id TEXT NOT NULL REFERENCES users(id), expected_revision INTEGER NOT NULL,
 result_revision INTEGER NOT NULL, fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
 created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS report_sync_immutable_update BEFORE UPDATE ON report_sync_receipts BEGIN SELECT RAISE(ABORT,'REPORT_SYNC_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS report_sync_immutable_delete BEFORE DELETE ON report_sync_receipts BEGIN SELECT RAISE(ABORT,'REPORT_SYNC_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS report_context_immutable BEFORE UPDATE OF work_order_id,client_id,property_id,scheme_id,tenancy_id,booking_id,template_id,template_version,layout_snapshot_json,baseline_version_id ON inspection_reports BEGIN SELECT RAISE(ABORT,'REPORT_CONTEXT_IMMUTABLE'); END;
