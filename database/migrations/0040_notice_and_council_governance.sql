CREATE TABLE building_notice_drafts (
 id TEXT PRIMARY KEY,
 building_id TEXT NOT NULL REFERENCES scheme_buildings(id),
 scheme_id TEXT NOT NULL REFERENCES strata_schemes(id),
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 audience TEXT NOT NULL CHECK(audience IN('residents','owners','council','all_members')),
 content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
 starts_at TEXT NOT NULL,
 expires_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','published','rejected')),
 reviewed_by TEXT REFERENCES users(id),
 review_reference TEXT,
 reviewed_at TEXT,
 notice_id TEXT UNIQUE REFERENCES building_notices(id)
) STRICT;
CREATE TRIGGER notice_draft_building_scope BEFORE INSERT ON building_notice_drafts BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM scheme_buildings WHERE id=NEW.building_id AND scheme_id=NEW.scheme_id) THEN RAISE(ABORT,'NOTICE_BUILDING_SCOPE') END; END;
CREATE TRIGGER notice_draft_immutable BEFORE UPDATE ON building_notice_drafts WHEN NEW.building_id!=OLD.building_id OR NEW.scheme_id!=OLD.scheme_id OR NEW.title!=OLD.title OR NEW.body!=OLD.body OR NEW.audience!=OLD.audience OR NEW.content_sha256!=OLD.content_sha256 OR NEW.starts_at!=OLD.starts_at OR NEW.expires_at IS NOT OLD.expires_at OR NEW.created_by!=OLD.created_by OR NEW.created_at!=OLD.created_at BEGIN SELECT RAISE(ABORT,'NOTICE_DRAFT_IMMUTABLE'); END;
CREATE TRIGGER notice_draft_review BEFORE UPDATE ON building_notice_drafts BEGIN SELECT CASE WHEN OLD.status!='submitted' OR NEW.status NOT IN('published','rejected') OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL OR length(COALESCE(NEW.review_reference,''))<8 OR (NEW.status='published' AND NEW.notice_id IS NULL) THEN RAISE(ABORT,'INDEPENDENT_NOTICE_REVIEW_REQUIRED') END; END;
CREATE TABLE notice_supersessions (
 old_notice_id TEXT PRIMARY KEY REFERENCES building_notices(id),
 new_notice_id TEXT NOT NULL UNIQUE REFERENCES building_notices(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 reference TEXT NOT NULL,
 created_at TEXT NOT NULL,
 CHECK(old_notice_id!=new_notice_id)
) STRICT;
CREATE TRIGGER notice_supersession_scope BEFORE INSERT ON notice_supersessions BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM building_notices old JOIN building_notices next ON next.scheme_id=old.scheme_id WHERE old.id=NEW.old_notice_id AND next.id=NEW.new_notice_id AND old.withdrawn_at IS NOT NULL) THEN RAISE(ABORT,'NOTICE_REVISION_SCOPE') END; END;
CREATE TABLE notice_revision_history (
 notice_id TEXT NOT NULL REFERENCES building_notices(id),
 version INTEGER NOT NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 audience TEXT NOT NULL,
 starts_at TEXT NOT NULL,
 expires_at TEXT,
 withdrawn_at TEXT,
 recorded_at TEXT NOT NULL,
 PRIMARY KEY(notice_id,version)
) STRICT;
INSERT INTO notice_revision_history SELECT id,version,title,body,audience,starts_at,expires_at,withdrawn_at,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM building_notices;
CREATE TRIGGER notice_insert_history AFTER INSERT ON building_notices BEGIN INSERT INTO notice_revision_history VALUES(NEW.id,NEW.version,NEW.title,NEW.body,NEW.audience,NEW.starts_at,NEW.expires_at,NEW.withdrawn_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
CREATE TRIGGER notice_update_history AFTER UPDATE ON building_notices WHEN NEW.version!=OLD.version BEGIN INSERT INTO notice_revision_history VALUES(NEW.id,NEW.version,NEW.title,NEW.body,NEW.audience,NEW.starts_at,NEW.expires_at,NEW.withdrawn_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
CREATE TRIGGER notice_history_no_update BEFORE UPDATE ON notice_revision_history BEGIN SELECT RAISE(ABORT,'NOTICE_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER notice_history_no_delete BEFORE DELETE ON notice_revision_history BEGIN SELECT RAISE(ABORT,'NOTICE_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER notice_supersession_no_update BEFORE UPDATE ON notice_supersessions BEGIN SELECT RAISE(ABORT,'NOTICE_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER notice_supersession_no_delete BEFORE DELETE ON notice_supersessions BEGIN SELECT RAISE(ABORT,'NOTICE_HISTORY_IMMUTABLE'); END;
CREATE TABLE council_conflict_declarations (
 approval_id TEXT NOT NULL REFERENCES approvals(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL CHECK(status IN('clear','declared','unsure')),
 reason_envelope TEXT,
 declared_at TEXT NOT NULL,
 PRIMARY KEY(approval_id,user_id),
 CHECK(status='clear' OR reason_envelope IS NOT NULL)
) STRICT;
CREATE TRIGGER council_declaration_scope BEFORE INSERT ON council_conflict_declarations BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM approvals a JOIN scheme_memberships m ON m.scheme_id=a.scheme_id AND m.user_id=NEW.user_id AND m.role='council_member' AND m.starts_at<=NEW.declared_at AND (m.ends_at IS NULL OR m.ends_at>NEW.declared_at) WHERE a.id=NEW.approval_id AND a.decision_scope='council' AND a.status='pending') THEN RAISE(ABORT,'COUNCIL_DECLARATION_SCOPE') END; END;
CREATE TRIGGER council_declaration_no_update BEFORE UPDATE ON council_conflict_declarations BEGIN SELECT RAISE(ABORT,'COUNCIL_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER council_declaration_no_delete BEFORE DELETE ON council_conflict_declarations BEGIN SELECT RAISE(ABORT,'COUNCIL_HISTORY_IMMUTABLE'); END;
CREATE TABLE council_response_history (
 id INTEGER PRIMARY KEY,
 approval_id TEXT NOT NULL REFERENCES approvals(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 membership_id TEXT NOT NULL REFERENCES scheme_memberships(id),
 response TEXT NOT NULL,
 comment TEXT NOT NULL,
 created_at TEXT NOT NULL
) STRICT;
INSERT INTO council_response_history(approval_id,user_id,membership_id,response,comment,created_at) SELECT approval_id,user_id,membership_id,response,comment,created_at FROM council_responses;
CREATE TRIGGER council_response_insert_history AFTER INSERT ON council_responses BEGIN INSERT INTO council_response_history(approval_id,user_id,membership_id,response,comment,created_at) VALUES(NEW.approval_id,NEW.user_id,NEW.membership_id,NEW.response,NEW.comment,NEW.created_at); END;
CREATE TRIGGER council_response_update_history AFTER UPDATE ON council_responses BEGIN INSERT INTO council_response_history(approval_id,user_id,membership_id,response,comment,created_at) VALUES(NEW.approval_id,NEW.user_id,NEW.membership_id,NEW.response,NEW.comment,NEW.created_at); END;
CREATE TRIGGER council_response_history_no_update BEFORE UPDATE ON council_response_history BEGIN SELECT RAISE(ABORT,'COUNCIL_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER council_response_history_no_delete BEFORE DELETE ON council_response_history BEGIN SELECT RAISE(ABORT,'COUNCIL_HISTORY_IMMUTABLE'); END;
