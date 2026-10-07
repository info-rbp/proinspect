-- Public enquiries are not client accounts and never grant property authority.
CREATE TABLE marketing_enquiries (
 id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, request_key TEXT NOT NULL UNIQUE,
 fingerprint TEXT NOT NULL, envelope TEXT NOT NULL,
 service_id TEXT REFERENCES services(id), enquiry_kind TEXT NOT NULL CHECK(enquiry_kind IN('service','portfolio','strata','other')),
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN('new','reviewing','awaiting_customer','qualified','closed','spam')),
 assigned_user_id TEXT REFERENCES users(id), linked_client_id TEXT REFERENCES clients(id),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX enquiries_queue ON marketing_enquiries(status,created_at,id);
CREATE TABLE enquiry_events (
 id TEXT PRIMARY KEY, enquiry_id TEXT NOT NULL REFERENCES marketing_enquiries(id),
 actor_id TEXT REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN('received','updated','reply','linked')),
 envelope TEXT NOT NULL, outbox_id TEXT REFERENCES outbox_events(id), created_at TEXT NOT NULL
) STRICT;
CREATE INDEX enquiry_events_parent ON enquiry_events(enquiry_id,created_at);
CREATE TRIGGER enquiry_events_no_update BEFORE UPDATE ON enquiry_events BEGIN SELECT RAISE(ABORT,'HISTORY_IMMUTABLE'); END;
CREATE TRIGGER enquiry_events_no_delete BEFORE DELETE ON enquiry_events BEGIN SELECT RAISE(ABORT,'HISTORY_IMMUTABLE'); END;

ALTER TABLE building_notices ADD COLUMN withdrawn_at TEXT;
CREATE TABLE notice_dispatch_jobs (
 notice_id TEXT PRIMARY KEY REFERENCES building_notices(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','completed','cancelled','failed')),
 cursor_user_id TEXT NOT NULL DEFAULT '', lease_token TEXT, lease_until TEXT,
 attempts INTEGER NOT NULL DEFAULT 0, available_at TEXT NOT NULL, last_error TEXT, completed_at TEXT
) STRICT;
CREATE INDEX notices_dispatch ON notice_dispatch_jobs(status,available_at);
CREATE TABLE notice_deliveries (
 notice_id TEXT NOT NULL REFERENCES building_notices(id), user_id TEXT NOT NULL REFERENCES users(id),
 notification_id TEXT NOT NULL UNIQUE, outbox_id TEXT NOT NULL UNIQUE REFERENCES outbox_events(id),
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN('queued','sent','suppressed','failed')),
 created_at TEXT NOT NULL, delivered_at TEXT, PRIMARY KEY(notice_id,user_id)
) STRICT;
-- Do not email historical announcements. Pending future announcements are picked up.
INSERT INTO notice_dispatch_jobs(notice_id,status,available_at,completed_at)
 SELECT id,CASE WHEN starts_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 'pending' ELSE 'completed' END,
 starts_at,CASE WHEN starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END
 FROM building_notices;
