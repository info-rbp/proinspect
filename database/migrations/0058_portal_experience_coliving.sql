-- Portal consolidation: experience tags are presentation hints, never authorisation grants.
CREATE TABLE account_experience_tags (
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tag TEXT NOT NULL CHECK(tag IN ('co_living','student_living','professional_portfolio','multi_site','priority_operations')),
  set_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(client_id,tag)
) STRICT;
CREATE INDEX account_experience_tags_tag ON account_experience_tags(tag,client_id);

-- Residential co-living is one canonical property with multiple separately scoped tenancies.
CREATE TABLE co_living_sites (
  property_id TEXT PRIMARY KEY REFERENCES properties(id) ON DELETE RESTRICT,
  allocation_mode TEXT NOT NULL CHECK(allocation_mode IN ('room','bed')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER co_living_site_residential BEFORE INSERT ON co_living_sites
BEGIN
  SELECT RAISE(ABORT,'CO_LIVING_RESIDENTIAL_ONLY') WHERE NOT EXISTS
   (SELECT 1 FROM properties p WHERE p.id=NEW.property_id AND p.sector='residential' AND p.archived_at IS NULL);
END;

CREATE TABLE co_living_spaces (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES co_living_sites(property_id),
  label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 64),
  space_type TEXT NOT NULL CHECK(space_type IN ('room','bed','shared_area')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(property_id,label)
) STRICT;
CREATE INDEX co_living_spaces_property ON co_living_spaces(property_id,space_type,active);
CREATE TRIGGER co_living_space_mode BEFORE INSERT ON co_living_spaces
BEGIN
  SELECT RAISE(ABORT,'CO_LIVING_SPACE_MODE') WHERE NEW.space_type NOT IN ('shared_area',(SELECT allocation_mode FROM co_living_sites WHERE property_id=NEW.property_id));
END;

CREATE TABLE co_living_occupancies (
  tenancy_id TEXT PRIMARY KEY REFERENCES tenancies(id) ON DELETE RESTRICT,
  space_id TEXT NOT NULL REFERENCES co_living_spaces(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX co_living_occupancy_space ON co_living_occupancies(space_id,tenancy_id);
-- SQLite serialises writes: the insert trigger prevents double-assigning a room/bed
-- even when concurrent requests both passed an earlier application availability check.
CREATE TRIGGER co_living_occupancy_guard BEFORE INSERT ON co_living_occupancies
BEGIN
  SELECT RAISE(ABORT,'CO_LIVING_SPACE_NOT_PRIVATE') WHERE NOT EXISTS (
    SELECT 1 FROM co_living_spaces s JOIN tenancies t ON t.property_id=s.property_id
    WHERE s.id=NEW.space_id AND t.id=NEW.tenancy_id AND s.active=1
      AND s.space_type IN ('room','bed')
  );
  SELECT RAISE(ABORT,'CO_LIVING_OCCUPANCY_CONFLICT') WHERE EXISTS (
    SELECT 1 FROM co_living_occupancies o
    JOIN tenancies prior ON prior.id=o.tenancy_id
    JOIN tenancies incoming ON incoming.id=NEW.tenancy_id
    WHERE o.space_id=NEW.space_id AND prior.status IN ('pending','active')
      AND incoming.status IN ('pending','active')
      AND (prior.ends_at IS NULL OR prior.ends_at>incoming.starts_at)
      AND (incoming.ends_at IS NULL OR prior.starts_at<incoming.ends_at)
  );
END;
-- Existing tenancy/occupancy links cannot be reassigned by changing identifiers.
CREATE TRIGGER co_living_occupancy_immutable BEFORE UPDATE OF tenancy_id,space_id ON co_living_occupancies
BEGIN SELECT RAISE(ABORT,'CO_LIVING_OCCUPANCY_IMMUTABLE'); END;
