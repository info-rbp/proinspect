-- V2 WP4: independently reviewed sector packs. 11 markets / 55 draft configurable modules.
-- Sector records are operations metadata, NOT regulated patient, tenancy-case or clinical records.
CREATE TABLE v2_sector_packs(
 id TEXT PRIMARY KEY, market_code TEXT NOT NULL REFERENCES v2_markets(code),
 version INTEGER NOT NULL CHECK(version>0), label TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','approved','retired')),
 governance_boundary TEXT NOT NULL,
 approval_reference TEXT, approved_by TEXT REFERENCES users(id), approved_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(market_code,version)
) STRICT;
CREATE INDEX v2_pack_market ON v2_sector_packs(market_code,status);
CREATE TABLE v2_sector_modules(
 code TEXT PRIMARY KEY, pack_id TEXT NOT NULL REFERENCES v2_sector_packs(id),
 name TEXT NOT NULL, classification TEXT NOT NULL CHECK(classification IN
 ('operations','qualified_coordination','reserved_external')),
 purpose TEXT NOT NULL, required_fields_json TEXT NOT NULL CHECK(json_valid(required_fields_json)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','excluded')),
 review_reference TEXT, reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT
) STRICT;
CREATE INDEX v2_sector_modules_pack ON v2_sector_modules(pack_id,status);
CREATE TABLE v2_sector_release_checks(
 pack_id TEXT NOT NULL REFERENCES v2_sector_packs(id),
 check_code TEXT NOT NULL CHECK(check_code IN('governance','service_scope','pricing','insurance','credentials','privacy','workflow_acceptance')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','verified','rejected')),
 evidence_reference TEXT, verified_by TEXT REFERENCES users(id), verified_at TEXT,
 PRIMARY KEY(pack_id,check_code)
) STRICT;
CREATE TABLE v2_sector_module_clearances(
 id TEXT PRIMARY KEY, module_code TEXT NOT NULL REFERENCES v2_sector_modules(code),
 qualified_provider TEXT NOT NULL,
 credential_reference TEXT NOT NULL, independent_check_reference TEXT NOT NULL,
 valid_until TEXT NOT NULL, verified_by TEXT NOT NULL REFERENCES users(id), verified_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'verified' CHECK(status IN('verified','revoked')),
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX v2_clearances_module ON v2_sector_module_clearances(module_code,status,valid_until);
CREATE TRIGGER v2_sector_clearance_immutable BEFORE UPDATE ON v2_sector_module_clearances
WHEN OLD.status!='verified' OR NEW.status!='revoked'
 OR NEW.module_code!=OLD.module_code OR NEW.credential_reference!=OLD.credential_reference
 OR NEW.independent_check_reference!=OLD.independent_check_reference
BEGIN SELECT RAISE(ABORT,'V2_SECTOR_CLEARANCE_IMMUTABLE'); END;
CREATE TRIGGER v2_sector_clearance_delete BEFORE DELETE ON v2_sector_module_clearances
BEGIN SELECT RAISE(ABORT,'V2_SECTOR_CLEARANCE_IMMUTABLE'); END;
CREATE TRIGGER v2_sector_module_review BEFORE UPDATE OF status ON v2_sector_modules
WHEN NEW.status='approved'
BEGIN
 SELECT RAISE(ABORT,'V2_MODULE_REVIEW_REQUIRED') WHERE NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL
 OR LENGTH(TRIM(COALESCE(NEW.review_reference,'')))<4;
 SELECT RAISE(ABORT,'V2_RESERVED_PROVIDER_REQUIRED') WHERE NEW.classification='reserved_external' AND NOT EXISTS(
 SELECT 1 FROM v2_sector_module_clearances c WHERE c.module_code=NEW.code AND c.status='verified'
 AND c.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER v2_sector_module_locked BEFORE UPDATE ON v2_sector_modules
WHEN OLD.status IN('approved','excluded') AND
 (SELECT status FROM v2_sector_packs WHERE id=OLD.pack_id)='approved'
BEGIN SELECT RAISE(ABORT,'V2_APPROVED_PACK_LOCKED'); END;
CREATE TRIGGER v2_sector_pack_approval BEFORE UPDATE OF status ON v2_sector_packs
WHEN NEW.status='approved' AND OLD.status!='approved'
BEGIN
 SELECT RAISE(ABORT,'V2_PACK_REVIEW_REQUIRED') WHERE NEW.approved_by IS NULL OR NEW.approved_at IS NULL
 OR LENGTH(TRIM(COALESCE(NEW.approval_reference,'')))<4;
 SELECT RAISE(ABORT,'V2_PACK_RELEASE_CHECKS_MISSING') WHERE
 (SELECT COUNT(*) FROM v2_sector_release_checks c WHERE c.pack_id=NEW.id AND c.status='verified')!=7;
 SELECT RAISE(ABORT,'V2_PACK_MODULES_UNREVIEWED') WHERE
 EXISTS(SELECT 1 FROM v2_sector_modules m WHERE m.pack_id=NEW.id AND m.status='draft')
 OR NOT EXISTS(SELECT 1 FROM v2_sector_modules m WHERE m.pack_id=NEW.id AND m.status='approved');
 SELECT RAISE(ABORT,'V2_RESERVED_PROVIDER_REQUIRED') WHERE EXISTS(
 SELECT 1 FROM v2_sector_modules m WHERE m.pack_id=NEW.id AND m.classification='reserved_external'
 AND m.status='approved' AND NOT EXISTS(SELECT 1 FROM v2_sector_module_clearances c
 WHERE c.module_code=m.code AND c.status='verified'
 AND c.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')));
END;
CREATE TRIGGER v2_sector_pack_locked BEFORE UPDATE ON v2_sector_packs
WHEN OLD.status='approved' AND NEW.status!='retired'
BEGIN SELECT RAISE(ABORT,'V2_PACK_VERSION_IMMUTABLE'); END;
CREATE TRIGGER v2_sector_check_lock BEFORE UPDATE ON v2_sector_release_checks
WHEN (SELECT status FROM v2_sector_packs WHERE id=OLD.pack_id)='approved'
BEGIN SELECT RAISE(ABORT,'V2_PACK_VERSION_IMMUTABLE'); END;

CREATE TABLE v2_sector_rollouts(
 id TEXT PRIMARY KEY, pack_id TEXT NOT NULL REFERENCES v2_sector_packs(id),
 engagement_id TEXT NOT NULL REFERENCES v2_engagements(id),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','pilot','live','paused','ended')),
 authority_reference TEXT, approved_by TEXT REFERENCES users(id), approved_at TEXT,
 pilot_started_at TEXT, live_started_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(pack_id,engagement_id)
) STRICT;
CREATE INDEX v2_rollout_engagement ON v2_sector_rollouts(engagement_id,status);
CREATE TRIGGER v2_rollout_activation BEFORE UPDATE OF status ON v2_sector_rollouts
WHEN NEW.status IN('pilot','live') AND NEW.status!=OLD.status
BEGIN
 SELECT RAISE(ABORT,'V2_ROLLOUT_APPROVAL_REQUIRED') WHERE NEW.approved_by IS NULL OR NEW.approved_at IS NULL
 OR LENGTH(TRIM(COALESCE(NEW.authority_reference,'')))<4;
 SELECT RAISE(ABORT,'V2_ROLLOUT_STAGE_INVALID') WHERE NOT(
 (OLD.status='draft' AND NEW.status='pilot') OR
 (OLD.status='pilot' AND NEW.status='live') OR
 (OLD.status='paused' AND NEW.status='pilot'));
 SELECT RAISE(ABORT,'V2_ROLLOUT_MARKET_NOT_READY') WHERE NOT EXISTS(
 SELECT 1 FROM v2_sector_packs p JOIN v2_markets m ON m.code=p.market_code AND m.enabled=1
 JOIN v2_engagements e ON e.id=NEW.engagement_id AND e.market_code=p.market_code AND e.status='active'
 JOIN v2_asset_markets am ON am.market_code=p.market_code AND am.status='approved'
 AND am.property_id IS e.property_id AND am.scheme_id IS e.scheme_id
 WHERE p.id=NEW.pack_id AND p.status='approved');
 SELECT RAISE(ABORT,'V2_ROLLOUT_CLEARANCE_EXPIRED') WHERE EXISTS(
 SELECT 1 FROM v2_sector_modules sm WHERE sm.pack_id=NEW.pack_id
 AND sm.status='approved' AND sm.classification='reserved_external'
 AND NOT EXISTS(SELECT 1 FROM v2_sector_module_clearances c WHERE c.module_code=sm.code
 AND c.status='verified' AND c.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')));
END;
CREATE TRIGGER v2_rollout_scope_lock BEFORE UPDATE OF pack_id,engagement_id ON v2_sector_rollouts
BEGIN SELECT RAISE(ABORT,'V2_ROLLOUT_SCOPE_LOCKED'); END;
CREATE TABLE v2_sector_records(
 id TEXT PRIMARY KEY, rollout_id TEXT NOT NULL REFERENCES v2_sector_rollouts(id),
 module_code TEXT NOT NULL REFERENCES v2_sector_modules(code),
 asset_id TEXT REFERENCES v2_assets(id),
 source_key TEXT NOT NULL, facts_json TEXT NOT NULL CHECK(json_valid(facts_json)),
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','accepted','rejected')),
 recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, review_reference TEXT,
 UNIQUE(rollout_id,module_code,source_key),
 CHECK(status!='accepted' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND LENGTH(review_reference)>=4))
) STRICT;
CREATE INDEX v2_sector_records_scope ON v2_sector_records(rollout_id,module_code,status);
CREATE TRIGGER v2_sector_record_guard BEFORE INSERT ON v2_sector_records
BEGIN
 SELECT RAISE(ABORT,'V2_SECTOR_NOT_ACTIVATED') WHERE NOT EXISTS(
 SELECT 1 FROM v2_sector_rollouts r JOIN v2_sector_modules m ON m.pack_id=r.pack_id AND m.code=NEW.module_code
 JOIN v2_sector_packs p ON p.id=r.pack_id
 JOIN v2_engagements e ON e.id=r.engagement_id
 WHERE r.id=NEW.rollout_id AND r.status IN('pilot','live') AND m.status='approved'
 AND p.status='approved' AND e.status='active');
 SELECT RAISE(ABORT,'V2_SECTOR_ASSET_SCOPE') WHERE NEW.asset_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_sector_rollouts r JOIN v2_engagements e ON e.id=r.engagement_id
 JOIN v2_assets a ON a.id=NEW.asset_id
 WHERE r.id=NEW.rollout_id AND a.property_id IS e.property_id AND a.scheme_id IS e.scheme_id);
 SELECT RAISE(ABORT,'V2_SECTOR_CLEARANCE_EXPIRED') WHERE EXISTS(
 SELECT 1 FROM v2_sector_modules m WHERE m.code=NEW.module_code AND m.classification='reserved_external'
 AND NOT EXISTS(SELECT 1 FROM v2_sector_module_clearances c WHERE c.module_code=m.code AND c.status='verified'
 AND c.valid_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')));
END;
CREATE TRIGGER v2_sector_record_review_lock BEFORE UPDATE ON v2_sector_records
WHEN OLD.status!='submitted' OR NEW.status NOT IN('accepted','rejected')
 OR NEW.rollout_id!=OLD.rollout_id OR NEW.module_code!=OLD.module_code
 OR NEW.asset_id IS NOT OLD.asset_id OR NEW.source_key!=OLD.source_key OR NEW.facts_json!=OLD.facts_json
BEGIN SELECT RAISE(ABORT,'V2_SECTOR_RECORD_IMMUTABLE'); END;
CREATE TRIGGER v2_sector_record_delete BEFORE DELETE ON v2_sector_records
BEGIN SELECT RAISE(ABORT,'V2_SECTOR_RECORD_IMMUTABLE'); END;

-- Templates only: no pack, module or market activated by seed.
INSERT INTO v2_sector_packs(id,market_code,version,label,governance_boundary) VALUES('RES:pack:v1','RES',1,'Residential operations v1','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RES:pack:v1','governance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RES:pack:v1','service_scope');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RES:pack:v1','pricing');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RES:pack:v1','insurance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RES:pack:v1','credentials');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RES:pack:v1','privacy');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RES:pack:v1','workflow_acceptance');
INSERT INTO v2_sector_packs(id,market_code,version,label,governance_boundary) VALUES('COM:pack:v1','COM',1,'Commercial operations v1','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('COM:pack:v1','governance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('COM:pack:v1','service_scope');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('COM:pack:v1','pricing');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('COM:pack:v1','insurance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('COM:pack:v1','credentials');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('COM:pack:v1','privacy');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('COM:pack:v1','workflow_acceptance');
INSERT INTO v2_sector_packs(id,market_code,version,label,governance_boundary) VALUES('STR:pack:v1','STR',1,'Strata operations v1','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('STR:pack:v1','governance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('STR:pack:v1','service_scope');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('STR:pack:v1','pricing');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('STR:pack:v1','insurance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('STR:pack:v1','credentials');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('STR:pack:v1','privacy');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('STR:pack:v1','workflow_acceptance');
INSERT INTO v2_sector_packs(id,market_code,version,label,governance_boundary) VALUES('CTS:pack:v1','CTS',1,'Community Titles operations v1','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('CTS:pack:v1','governance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('CTS:pack:v1','service_scope');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('CTS:pack:v1','pricing');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('CTS:pack:v1','insurance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('CTS:pack:v1','credentials');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('CTS:pack:v1','privacy');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('CTS:pack:v1','workflow_acceptance');
INSERT INTO v2_sector_packs(id,market_code,version,label,governance_boundary) VALUES('STA:pack:v1','STA',1,'Short Stay operations v1','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('STA:pack:v1','governance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('STA:pack:v1','service_scope');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('STA:pack:v1','pricing');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('STA:pack:v1','insurance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('STA:pack:v1','credentials');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('STA:pack:v1','privacy');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('STA:pack:v1','workflow_acceptance');
INSERT INTO v2_sector_packs(id,market_code,version,label,governance_boundary) VALUES('SOC:pack:v1','SOC',1,'Social Housing operations v1','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('SOC:pack:v1','governance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('SOC:pack:v1','service_scope');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('SOC:pack:v1','pricing');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('SOC:pack:v1','insurance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('SOC:pack:v1','credentials');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('SOC:pack:v1','privacy');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('SOC:pack:v1','workflow_acceptance');
INSERT INTO v2_sector_packs(id,market_code,version,label,governance_boundary) VALUES('SDA:pack:v1','SDA',1,'Specialist Disability Accommodation operations v1','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('SDA:pack:v1','governance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('SDA:pack:v1','service_scope');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('SDA:pack:v1','pricing');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('SDA:pack:v1','insurance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('SDA:pack:v1','credentials');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('SDA:pack:v1','privacy');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('SDA:pack:v1','workflow_acceptance');
INSERT INTO v2_sector_packs(id,market_code,version,label,governance_boundary) VALUES('RET:pack:v1','RET',1,'Retirement Villages operations v1','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RET:pack:v1','governance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RET:pack:v1','service_scope');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RET:pack:v1','pricing');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RET:pack:v1','insurance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RET:pack:v1','credentials');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RET:pack:v1','privacy');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RET:pack:v1','workflow_acceptance');
INSERT INTO v2_sector_packs(id,market_code,version,label,governance_boundary) VALUES('AGE:pack:v1','AGE',1,'Aged Care operations v1','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('AGE:pack:v1','governance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('AGE:pack:v1','service_scope');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('AGE:pack:v1','pricing');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('AGE:pack:v1','insurance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('AGE:pack:v1','credentials');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('AGE:pack:v1','privacy');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('AGE:pack:v1','workflow_acceptance');
INSERT INTO v2_sector_packs(id,market_code,version,label,governance_boundary) VALUES('RUR:pack:v1','RUR',1,'Rural Agriculture operations v1','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RUR:pack:v1','governance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RUR:pack:v1','service_scope');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RUR:pack:v1','pricing');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RUR:pack:v1','insurance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RUR:pack:v1','credentials');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RUR:pack:v1','privacy');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('RUR:pack:v1','workflow_acceptance');
INSERT INTO v2_sector_packs(id,market_code,version,label,governance_boundary) VALUES('INS:pack:v1','INS',1,'Institutional and Public operations v1','ProInspect undertakes contracted property operations coordination only. Statutory, clinical, trust-account and governing appointments remain with the authorised third party.');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('INS:pack:v1','governance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('INS:pack:v1','service_scope');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('INS:pack:v1','pricing');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('INS:pack:v1','insurance');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('INS:pack:v1','credentials');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('INS:pack:v1','privacy');
INSERT INTO v2_sector_release_checks(pack_id,check_code) VALUES('INS:pack:v1','workflow_acceptance');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RES-M01','RES:pack:v1','Property inspection protocols','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RES-M02','RES:pack:v1','Tenancy turnover coordination','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RES-M03','RES:pack:v1','Owner authority and approvals','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RES-M04','RES:pack:v1','Resident access and notice liaison','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RES-M05','RES:pack:v1','Dwelling asset condition history','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('COM-M01','COM:pack:v1','Lease make-good condition survey','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('COM-M02','COM:pack:v1','Site and after-hours access','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('COM-M03','COM:pack:v1','Plant service scheduling','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('COM-M04','COM:pack:v1','Fitout and alteration registers','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('COM-M05','COM:pack:v1','Facilities contractor reporting','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('STR-M01','STR:pack:v1','Common property condition registers','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('STR-M02','STR:pack:v1','Building notice coordination','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('STR-M03','STR:pack:v1','Lot and common access coordination','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('STR-M04','STR:pack:v1','Shared plant servicing','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('STR-M05','STR:pack:v1','Strata authority and council liaison','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('CTS-M01','CTS:pack:v1','Community shared asset register','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('CTS-M02','CTS:pack:v1','Shared service request coordination','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('CTS-M03','CTS:pack:v1','Member notice distribution liaison','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('CTS-M04','CTS:pack:v1','Community facilities scheduling','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('CTS-M05','CTS:pack:v1','Community governance approvals liaison','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('STA-M01','STA:pack:v1','Property turnaround scheduling','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('STA-M02','STA:pack:v1','Guest access contractor coordination','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('STA-M03','STA:pack:v1','Presentation quality observations','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('STA-M04','STA:pack:v1','Rapid repair triage','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('STA-M05','STA:pack:v1','Furniture and amenity condition','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('SOC-M01','SOC:pack:v1','Supported housing asset maintenance','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('SOC-M02','SOC:pack:v1','Sensitive access protocols','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('SOC-M03','SOC:pack:v1','Housing provider approvals','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('SOC-M04','SOC:pack:v1','Housing condition inspection','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('SOC-M05','SOC:pack:v1','Case escalation handoff boundary','reserved_external','Reserved activity. ProInspect must not represent itself as licensed/appointed provider or store clinical records.','["authorityReference","qualifiedProviderReference","operationalScope"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('SDA-M01','SDA:pack:v1','Accessible facilities asset register','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('SDA-M02','SDA:pack:v1','Accessibility modification coordination','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('SDA-M03','SDA:pack:v1','SDA provider liaison','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('SDA-M04','SDA:pack:v1','Essential equipment servicing','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('SDA-M05','SDA:pack:v1','NDIS and clinical determinations','reserved_external','Reserved activity. ProInspect must not represent itself as licensed/appointed provider or store clinical records.','["authorityReference","qualifiedProviderReference","operationalScope"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RET-M01','RET:pack:v1','Village common amenity inspection','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RET-M02','RET:pack:v1','Resident works scheduling','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RET-M03','RET:pack:v1','Shared facilities maintenance','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RET-M04','RET:pack:v1','Village capital asset lifecycle','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RET-M05','RET:pack:v1','Retirement village statutory governance','reserved_external','Reserved activity. ProInspect must not represent itself as licensed/appointed provider or store clinical records.','["authorityReference","qualifiedProviderReference","operationalScope"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('AGE-M01','AGE:pack:v1','Facility plant and essential services','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('AGE-M02','AGE:pack:v1','Contractor site entry protocols','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('AGE-M03','AGE:pack:v1','Room access and infection controls liaison','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('AGE-M04','AGE:pack:v1','Aged care facility asset register','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('AGE-M05','AGE:pack:v1','Clinical and care compliance decisions','reserved_external','Reserved activity. ProInspect must not represent itself as licensed/appointed provider or store clinical records.','["authorityReference","qualifiedProviderReference","operationalScope"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RUR-M01','RUR:pack:v1','Water and irrigation asset checks','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RUR-M02','RUR:pack:v1','Fencing gate and tracks condition','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RUR-M03','RUR:pack:v1','Firebreak maintenance coordination','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RUR-M04','RUR:pack:v1','Remote workforce access scheduling','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('RUR-M05','RUR:pack:v1','Rural structures defect management','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('INS-M01','INS:pack:v1','Public facilities planned maintenance','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('INS-M02','INS:pack:v1','Asset condition portfolio register','operations','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('INS-M03','INS:pack:v1','Procurement authority support','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('INS-M04','INS:pack:v1','Restricted site access coordination','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
INSERT INTO v2_sector_modules(code,pack_id,name,classification,purpose,required_fields_json) VALUES('INS-M05','INS:pack:v1','Public incident response handoff','qualified_coordination','Operational coordination with a verified authority boundary; statutory decisions remain external.','["scopeReference","evidenceReference"]');
