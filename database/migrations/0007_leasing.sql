-- Public leasing listings are approved projections of canonical properties, never tenancy records.
CREATE TABLE leasing_listings (
 id TEXT PRIMARY KEY,
 property_id TEXT NOT NULL REFERENCES properties(id),
 instructed_by_client_id TEXT NOT NULL REFERENCES clients(id),
 owner_client_id TEXT REFERENCES clients(id),
 kind TEXT NOT NULL CHECK(kind IN('residential','commercial')),
 slug TEXT NOT NULL,
 title TEXT NOT NULL,
 description TEXT NOT NULL,
 display_address TEXT NOT NULL,
 suburb TEXT NOT NULL,
 postcode TEXT NOT NULL,
 price_cents INTEGER CHECK(price_cents IS NULL OR price_cents >= 0),
 price_period TEXT NOT NULL DEFAULT 'week' CHECK(price_period IN('week','year','on_application')),
 bedrooms INTEGER CHECK(bedrooms IS NULL OR bedrooms BETWEEN 0 AND 30),
 bathrooms INTEGER CHECK(bathrooms IS NULL OR bathrooms BETWEEN 0 AND 30),
 parking INTEGER CHECK(parking IS NULL OR parking BETWEEN 0 AND 100),
 area_sqm INTEGER CHECK(area_sqm IS NULL OR area_sqm BETWEEN 0 AND 10000000),
 available_from TEXT,
 agent_name TEXT NOT NULL,
 agent_role TEXT NOT NULL CHECK(agent_role IN('landlord','property_manager','leasing_agent')),
 application_url TEXT,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','withdrawn','leased')),
 published_at TEXT, created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(kind,slug)
) STRICT;
CREATE UNIQUE INDEX leasing_one_live_per_property ON leasing_listings(property_id) WHERE status IN('draft','published');
CREATE INDEX leasing_public_search ON leasing_listings(status,kind,suburb,published_at);
CREATE INDEX leasing_owner_lookup ON leasing_listings(instructed_by_client_id,property_id);
CREATE TRIGGER leasing_property_party_guard BEFORE INSERT ON leasing_listings BEGIN
 SELECT RAISE(ABORT,'LEASING_SECTOR_MISMATCH') WHERE NOT EXISTS (SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.sector=NEW.kind);
 SELECT RAISE(ABORT,'LEASING_INSTRUCTION_NOT_AUTHORISED') WHERE NOT EXISTS (
 SELECT 1 FROM client_property_links l WHERE l.property_id=NEW.property_id AND l.client_id=NEW.instructed_by_client_id AND l.ends_at IS NULL
 UNION SELECT 1 FROM property_management_relationships m WHERE m.property_id=NEW.property_id AND m.manager_client_id=NEW.instructed_by_client_id AND m.ends_at IS NULL
 );
 SELECT RAISE(ABORT,'LEASING_OWNER_INVALID') WHERE NEW.owner_client_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM client_property_links l WHERE l.property_id=NEW.property_id AND l.client_id=NEW.owner_client_id AND l.role IN('owner','landlord') AND l.ends_at IS NULL
 );
END;
CREATE TRIGGER leasing_property_party_update BEFORE UPDATE OF property_id,instructed_by_client_id,owner_client_id,kind ON leasing_listings BEGIN
 SELECT RAISE(ABORT,'LEASING_SECTOR_MISMATCH') WHERE NOT EXISTS (SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.sector=NEW.kind);
 SELECT RAISE(ABORT,'LEASING_INSTRUCTION_NOT_AUTHORISED') WHERE NOT EXISTS (
 SELECT 1 FROM client_property_links l WHERE l.property_id=NEW.property_id AND l.client_id=NEW.instructed_by_client_id AND l.ends_at IS NULL
 UNION SELECT 1 FROM property_management_relationships m WHERE m.property_id=NEW.property_id AND m.manager_client_id=NEW.instructed_by_client_id AND m.ends_at IS NULL
 );
 SELECT RAISE(ABORT,'LEASING_OWNER_INVALID') WHERE NEW.owner_client_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM client_property_links l WHERE l.property_id=NEW.property_id AND l.client_id=NEW.owner_client_id AND l.role IN('owner','landlord') AND l.ends_at IS NULL
 );
END;
CREATE TABLE leasing_photos (
 id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES leasing_listings(id),
 object_key TEXT NOT NULL UNIQUE, content_type TEXT NOT NULL CHECK(content_type IN('image/jpeg','image/png','image/webp')),
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 6000001),
 alt_text TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX leasing_photos_listing ON leasing_photos(listing_id,sort_order,id);
CREATE TABLE leasing_sessions (
 id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES leasing_listings(id),
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 capacity INTEGER CHECK(capacity IS NULL OR capacity BETWEEN 1 AND 200),
 booked_count INTEGER NOT NULL DEFAULT 0 CHECK(booked_count>=0),
 status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','cancelled','completed')),
 instructions TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), CHECK(ends_at>starts_at),
 CHECK(capacity IS NULL OR booked_count<=capacity)
) STRICT;
CREATE INDEX leasing_upcoming_sessions ON leasing_sessions(listing_id,status,starts_at);
CREATE TABLE leasing_leads (
 id TEXT PRIMARY KEY,
 listing_id TEXT NOT NULL REFERENCES leasing_listings(id),
 session_id TEXT REFERENCES leasing_sessions(id),
 kind TEXT NOT NULL CHECK(kind IN('inspection','interest')),
 request_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
 email_hash TEXT NOT NULL, envelope TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','cancelled')),
 cancel_token_hash TEXT NOT NULL UNIQUE,
 reminder_queued_at TEXT, created_at TEXT NOT NULL, cancelled_at TEXT,
 CHECK((kind='inspection' AND session_id IS NOT NULL) OR (kind='interest' AND session_id IS NULL))
) STRICT;
CREATE UNIQUE INDEX leasing_inspection_contact ON leasing_leads(session_id,email_hash) WHERE kind='inspection' AND status='active';
CREATE UNIQUE INDEX leasing_interest_contact ON leasing_leads(listing_id,email_hash) WHERE kind='interest' AND status='active';
CREATE INDEX leasing_leads_session ON leasing_leads(session_id,status);
-- Integration-neutral business events. The Google Apps Script adapter is deliberately not enabled.
-- Envelopes contain encrypted event context; contacts stay encrypted in leasing_leads.
CREATE TABLE leasing_email_events (
 id TEXT PRIMARY KEY,
 lead_id TEXT NOT NULL REFERENCES leasing_leads(id),
 kind TEXT NOT NULL CHECK(kind IN('registration.received','interest.received','registration.cancelled','session.updated','session.cancelled','session.reminder')),
 envelope TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending_integration' CHECK(status='pending_integration'),
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX leasing_email_pending ON leasing_email_events(status,created_at);
CREATE TRIGGER leasing_email_events_no_update BEFORE UPDATE ON leasing_email_events BEGIN SELECT RAISE(ABORT,'LEASING_EVENT_IMMUTABLE'); END;
CREATE TRIGGER leasing_email_events_no_delete BEFORE DELETE ON leasing_email_events BEGIN SELECT RAISE(ABORT,'LEASING_EVENT_IMMUTABLE'); END;
CREATE TRIGGER leasing_publish_requires_photo BEFORE UPDATE OF status ON leasing_listings
 WHEN NEW.status='published' AND OLD.status!='published'
 BEGIN SELECT RAISE(ABORT,'LEASING_PHOTO_REQUIRED') WHERE NOT EXISTS(SELECT 1 FROM leasing_photos WHERE listing_id=NEW.id); END;
