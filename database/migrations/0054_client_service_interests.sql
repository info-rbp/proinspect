-- Client-level interest in a service area. Never an entitlement, property assignment or payment instruction.
CREATE TABLE client_service_interests (
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_area TEXT NOT NULL CHECK(service_area IN ('residential','commercial','strata','co-living','construction','leasing','maintenance')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(client_id, service_area)
);
CREATE INDEX client_service_interests_area ON client_service_interests(service_area, client_id);
