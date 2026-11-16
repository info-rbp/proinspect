-- 0058: distinct invited commercial occupants and independently reviewed council appointments.
-- Additive only: preserve historic tenancies, scheme memberships, documents and service bookings.
CREATE TABLE commercial_occupancies (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  premises_label TEXT NOT NULL CHECK(length(premises_label) BETWEEN 2 AND 160),
  relationship_kind TEXT NOT NULL CHECK(relationship_kind IN('tenant_contact','employee','contractor','other_occupant')),
  authority_reference TEXT NOT NULL CHECK(length(authority_reference) BETWEEN 4 AND 500),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','ended')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK(ends_at IS NULL OR ends_at>starts_at)
) STRICT;
CREATE INDEX commercial_occupancy_property ON commercial_occupancies(property_id,client_id,status);
CREATE TABLE commercial_occupant_invitations (
  token_hash TEXT PRIMARY KEY,
  occupancy_id TEXT NOT NULL REFERENCES commercial_occupancies(id),
  email TEXT NOT NULL COLLATE NOCASE,
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX commercial_occupant_invites_scope ON commercial_occupant_invitations(occupancy_id,expires_at);
CREATE TABLE commercial_occupant_memberships (
  id TEXT PRIMARY KEY,
  occupancy_id TEXT NOT NULL REFERENCES commercial_occupancies(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  granted_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(occupancy_id,user_id),
  CHECK(ends_at IS NULL OR ends_at>starts_at)
) STRICT;
CREATE INDEX commercial_occupant_member_lookup ON commercial_occupant_memberships(user_id,occupancy_id);
CREATE TABLE commercial_occupant_requests (
  id TEXT PRIMARY KEY,
  occupancy_id TEXT NOT NULL REFERENCES commercial_occupancies(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 4 AND 180),
  details TEXT NOT NULL CHECK(length(details) BETWEEN 10 AND 5000),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','under_review','closed')),
  manager_response TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX commercial_occupant_requests_scope ON commercial_occupant_requests(occupancy_id,created_at);

CREATE TABLE council_appointment_reviews (
  id TEXT PRIMARY KEY,
  scheme_id TEXT NOT NULL REFERENCES strata_schemes(id),
  lot_id TEXT REFERENCES strata_lots(id),
  email TEXT NOT NULL COLLATE NOCASE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  appointment_reference TEXT NOT NULL CHECK(length(appointment_reference) BETWEEN 8 AND 500),
  requested_by TEXT NOT NULL REFERENCES users(id),
  origin_client_id TEXT REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','declined')),
  reviewed_by TEXT REFERENCES users(id),
  review_reference TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  CHECK(ends_at>starts_at),
  CHECK((status='pending' AND reviewed_by IS NULL AND review_reference IS NULL AND reviewed_at IS NULL)
        OR (status IN('approved','declined') AND reviewed_by IS NOT NULL AND review_reference IS NOT NULL AND reviewed_at IS NOT NULL))
) STRICT;
CREATE INDEX council_appointment_review_scheme ON council_appointment_reviews(scheme_id,status,created_at);
ALTER TABLE portal_invitations ADD COLUMN council_review_id TEXT REFERENCES council_appointment_reviews(id);
CREATE UNIQUE INDEX portal_council_invite_review ON portal_invitations(council_review_id) WHERE council_review_id IS NOT NULL;
