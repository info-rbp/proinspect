-- Client-entered Residential property characteristics and confidential tenancy
-- information. These records never provision tenant portal memberships, issue
-- invitations, grant property authority or create billing entitlements.
-- Property-wide facts are separate from the time-bound tenancy information.
CREATE TABLE residential_property_profiles (
 property_id TEXT PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
 bedrooms INTEGER NOT NULL CHECK(bedrooms BETWEEN 0 AND 40),
 bathrooms INTEGER NOT NULL CHECK(bathrooms BETWEEN 0 AND 40),
 ensuites INTEGER NOT NULL CHECK(ensuites BETWEEN 0 AND bathrooms),
 separate_toilets INTEGER NOT NULL CHECK(separate_toilets BETWEEN 0 AND 40),
 car_spaces INTEGER NOT NULL CHECK(car_spaces BETWEEN 0 AND 40),
 furnishing TEXT NOT NULL CHECK(furnishing IN('unfurnished','part_furnished','furnished','unknown')),
 notes_envelope TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by TEXT NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE residential_property_tenancy_snapshots (
 id TEXT PRIMARY KEY,
 property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
 occupancy_status TEXT NOT NULL CHECK(occupancy_status IN('tenanted','upcoming','vacant','unknown')),
 lease_type TEXT CHECK(lease_type IN('fixed','periodic','unknown')),
 starts_on TEXT,
 ends_on TEXT,
 tenants_envelope TEXT,
 tenant_count INTEGER NOT NULL DEFAULT 0 CHECK(tenant_count BETWEEN 0 AND 10),
 fingerprint TEXT NOT NULL,
 is_current INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN(0,1)),
 recorded_by TEXT NOT NULL REFERENCES users(id),
 recorded_at TEXT NOT NULL,
 CHECK(ends_on IS NULL OR starts_on IS NULL OR ends_on>starts_on),
 CHECK(occupancy_status IN('tenanted','upcoming') OR
       (lease_type IS NULL AND starts_on IS NULL AND ends_on IS NULL AND tenant_count=0 AND tenants_envelope IS NULL))
) STRICT;
CREATE UNIQUE INDEX residential_tenancy_one_current
 ON residential_property_tenancy_snapshots(property_id) WHERE is_current=1;
CREATE INDEX residential_tenancy_property_history
 ON residential_property_tenancy_snapshots(property_id,recorded_at DESC);
