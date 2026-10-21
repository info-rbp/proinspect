-- Public open-home attendance extends the approved Leasing listing/session model.
-- This is separate from advance registration (leasing_leads) and rental applications.
CREATE TABLE leasing_checkins (
 id TEXT PRIMARY KEY,
 listing_id TEXT NOT NULL REFERENCES leasing_listings(id),
 session_id TEXT NOT NULL REFERENCES leasing_sessions(id),
 registered_lead_id TEXT REFERENCES leasing_leads(id),
 request_key TEXT NOT NULL UNIQUE,
 fingerprint TEXT NOT NULL,
 email_hash TEXT NOT NULL,
 contact_envelope TEXT NOT NULL,
 source TEXT NOT NULL CHECK(source IN('web','qr')),
 consent_version TEXT NOT NULL,
 arrived_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(session_id,email_hash)
) STRICT;
CREATE INDEX leasing_checkins_by_session ON leasing_checkins(session_id,arrived_at);
CREATE INDEX leasing_checkins_by_listing ON leasing_checkins(listing_id,arrived_at);
CREATE TRIGGER leasing_checkins_session_guard BEFORE INSERT ON leasing_checkins BEGIN
 SELECT RAISE(ABORT,'OPEN_HOME_SESSION_NOT_LINKED') WHERE NOT EXISTS (
   SELECT 1 FROM leasing_sessions s JOIN leasing_listings l ON l.id=s.listing_id
   WHERE s.id=NEW.session_id AND s.listing_id=NEW.listing_id
   AND s.status='scheduled' AND l.status='published'
 );
 SELECT RAISE(ABORT,'OPEN_HOME_LEAD_NOT_LINKED')
 WHERE NEW.registered_lead_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM leasing_leads r
   WHERE r.id=NEW.registered_lead_id AND r.session_id=NEW.session_id
   AND r.listing_id=NEW.listing_id AND r.status='active' AND r.kind='inspection'
   AND r.email_hash=NEW.email_hash
 );
END;

-- Outbox is the integration boundary. Events remain pending until the future
-- Google Sheet and an authorised Apps Script job have been configured.
CREATE TABLE open_home_sheet_events (
 id TEXT PRIMARY KEY,
 checkin_id TEXT NOT NULL UNIQUE REFERENCES leasing_checkins(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','synced')),
 created_at TEXT NOT NULL,
 synced_at TEXT,
 sheet_row_number INTEGER CHECK(sheet_row_number IS NULL OR sheet_row_number>1),
 CHECK(status='pending' OR synced_at IS NOT NULL)
) STRICT;
CREATE INDEX open_home_sheet_pending ON open_home_sheet_events(status,created_at);
CREATE TRIGGER open_home_sheet_events_no_delete BEFORE DELETE ON open_home_sheet_events
 BEGIN SELECT RAISE(ABORT,'OPEN_HOME_SHEET_EVENT_IMMUTABLE'); END;
CREATE TRIGGER open_home_sheet_events_guard BEFORE UPDATE ON open_home_sheet_events
 WHEN OLD.status='synced' OR NEW.checkin_id!=OLD.checkin_id OR NEW.id!=OLD.id
   OR NEW.status!='synced' OR NEW.synced_at IS NULL
 BEGIN SELECT RAISE(ABORT,'OPEN_HOME_SHEET_EVENT_INVALID_TRANSITION'); END;

-- Prevent reuse of a signed Apps Script request, including after a network retry.
CREATE TABLE open_home_sheet_nonces (
 nonce_hash TEXT PRIMARY KEY,
 expires_at TEXT NOT NULL
) STRICT;
CREATE INDEX open_home_sheet_nonces_expiry ON open_home_sheet_nonces(expires_at);
