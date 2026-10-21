-- Automatic open-home reports are generated the day after the inspection at 09:00 AWST.
-- A verified, active member of the currently authorised instructing client
-- (or recorded owner client) must be selected; never use the rental application recipient.
CREATE TABLE open_home_report_settings (
 listing_id TEXT PRIMARY KEY REFERENCES leasing_listings(id),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 recipient_user_id TEXT REFERENCES users(id),
 authority_reference TEXT NOT NULL DEFAULT '',
 configured_by TEXT NOT NULL REFERENCES users(id),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 updated_at TEXT NOT NULL,
 CHECK(enabled=0 OR (recipient_user_id IS NOT NULL AND length(authority_reference)>=5))
) STRICT;

CREATE TRIGGER open_home_report_settings_authority_insert BEFORE INSERT ON open_home_report_settings
WHEN NEW.recipient_user_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'OPEN_HOME_REPORT_RECIPIENT_UNAUTHORISED') WHERE NOT EXISTS (
  SELECT 1 FROM leasing_listings l
  JOIN client_memberships m ON m.client_id IN(l.instructed_by_client_id,l.owner_client_id)
  JOIN clients c ON c.id=m.client_id
  JOIN users u ON u.id=m.user_id
  WHERE l.id=NEW.listing_id AND m.user_id=NEW.recipient_user_id AND m.active=1
    AND m.role IN('owner','admin') AND c.status='active'
    AND u.active=1 AND u.verified_at IS NOT NULL
 );
END;
CREATE TRIGGER open_home_report_settings_authority_update BEFORE UPDATE ON open_home_report_settings
WHEN NEW.recipient_user_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'OPEN_HOME_REPORT_RECIPIENT_UNAUTHORISED') WHERE NOT EXISTS (
  SELECT 1 FROM leasing_listings l
  JOIN client_memberships m ON m.client_id IN(l.instructed_by_client_id,l.owner_client_id)
  JOIN clients c ON c.id=m.client_id
  JOIN users u ON u.id=m.user_id
  WHERE l.id=NEW.listing_id AND m.user_id=NEW.recipient_user_id AND m.active=1
    AND m.role IN('owner','admin') AND c.status='active'
    AND u.active=1 AND u.verified_at IS NOT NULL
 );
END;

CREATE TABLE open_home_inspection_reports (
 session_id TEXT PRIMARY KEY REFERENCES leasing_sessions(id),
 listing_id TEXT NOT NULL REFERENCES leasing_listings(id),
 outbox_id TEXT NOT NULL UNIQUE REFERENCES outbox_events(id),
 recipient_user_id TEXT NOT NULL REFERENCES users(id),
 session_end_at TEXT NOT NULL,
 report_date_perth TEXT NOT NULL,
 attendance_count INTEGER NOT NULL CHECK(attendance_count>=0),
 preregistered_arrivals INTEGER NOT NULL CHECK(preregistered_arrivals>=0),
 walk_in_arrivals INTEGER NOT NULL CHECK(walk_in_arrivals>=0),
 registered_count INTEGER NOT NULL CHECK(registered_count>=0),
 queued_at TEXT NOT NULL,
 CHECK(attendance_count=preregistered_arrivals+walk_in_arrivals)
) STRICT;
CREATE INDEX open_home_inspection_reports_listing ON open_home_inspection_reports(listing_id,queued_at);
CREATE TRIGGER open_home_inspection_reports_session_guard BEFORE INSERT ON open_home_inspection_reports BEGIN
 SELECT RAISE(ABORT,'OPEN_HOME_REPORT_SESSION_INVALID') WHERE NOT EXISTS (
  SELECT 1 FROM leasing_sessions s WHERE s.id=NEW.session_id AND s.listing_id=NEW.listing_id
   AND s.status IN('scheduled','completed') AND s.ends_at=NEW.session_end_at
 );
 SELECT RAISE(ABORT,'OPEN_HOME_REPORT_RECIPIENT_INVALID') WHERE NOT EXISTS (
  SELECT 1 FROM open_home_report_settings settings
  WHERE settings.listing_id=NEW.listing_id AND settings.enabled=1
    AND settings.recipient_user_id=NEW.recipient_user_id
 );
END;
CREATE TRIGGER open_home_inspection_reports_no_update BEFORE UPDATE ON open_home_inspection_reports
BEGIN SELECT RAISE(ABORT,'OPEN_HOME_REPORT_IMMUTABLE'); END;
CREATE TRIGGER open_home_inspection_reports_no_delete BEFORE DELETE ON open_home_inspection_reports
BEGIN SELECT RAISE(ABORT,'OPEN_HOME_REPORT_IMMUTABLE'); END;
