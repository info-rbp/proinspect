-- Additive communications lifecycle. No remote migration is performed by CI.
ALTER TABLE building_notices ADD COLUMN withdrawn_at TEXT;
ALTER TABLE building_notices ADD COLUMN email_enabled INTEGER NOT NULL DEFAULT 0 CHECK(email_enabled IN(0,1));
ALTER TABLE notifications ADD COLUMN workspace_kind TEXT;
ALTER TABLE notifications ADD COLUMN scope_id TEXT;
ALTER TABLE notifications ADD COLUMN source_notice_id TEXT REFERENCES building_notices(id);
ALTER TABLE notifications ADD COLUMN source_notice_version INTEGER;
CREATE TABLE notice_deliveries (
 notice_id TEXT NOT NULL REFERENCES building_notices(id), notice_version INTEGER NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id), workspace_kind TEXT NOT NULL CHECK(workspace_kind IN('building','council')),
 notification_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
 PRIMARY KEY(notice_id,notice_version,user_id)
) STRICT;
CREATE TABLE notice_revisions (
 notice_id TEXT NOT NULL REFERENCES building_notices(id), version INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), actor_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 PRIMARY KEY(notice_id,version)
) STRICT;
CREATE TRIGGER notice_revision_no_update BEFORE UPDATE ON notice_revisions BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER notice_revision_no_delete BEFORE DELETE ON notice_revisions BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE INDEX notices_due ON building_notices(withdrawn_at,starts_at,expires_at);
CREATE INDEX notifications_workspace ON notifications(user_id,workspace_kind,scope_id,created_at);
