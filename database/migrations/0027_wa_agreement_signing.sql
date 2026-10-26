-- Additive 0027; no changes to production migration history 0001-0026.
-- Source is an officially reviewed tenancy PDF; signatory consent alone is NOT an electronic PDF signature.
CREATE TABLE wa_agreement_envelopes(
 id TEXT PRIMARY KEY,
 case_id TEXT NOT NULL UNIQUE REFERENCES wa_residential_form_cases(id),
 tenancy_id TEXT NOT NULL REFERENCES tenancies(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 source_document_id TEXT NOT NULL REFERENCES documents(id),
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 template_version TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'collecting' CHECK(status IN('collecting','all_consented','executed','void')),
 prepared_by TEXT NOT NULL REFERENCES users(id),
 prepared_at TEXT NOT NULL,
 executed_document_id TEXT REFERENCES documents(id),
 executed_at TEXT,
 reviewed_by TEXT REFERENCES users(id),
 review_reference TEXT,
 voided_at TEXT,
 voided_by TEXT REFERENCES users(id),
 void_reason TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK((status='executed')=(executed_document_id IS NOT NULL)),
 CHECK((status='void')=(voided_at IS NOT NULL))
) STRICT;
CREATE TRIGGER wa_agreement_scope_create BEFORE INSERT ON wa_agreement_envelopes BEGIN
 SELECT RAISE(ABORT,'WA_AGREEMENT_SCOPE_MISMATCH') WHERE NOT EXISTS(
 SELECT 1 FROM wa_residential_form_cases c JOIN tenancies t ON t.id=c.tenancy_id
 JOIN properties p ON p.id=t.property_id
 WHERE c.id=NEW.case_id AND c.form_code='WA_FORM_1AA' AND c.tenancy_id=NEW.tenancy_id
 AND c.property_id=NEW.property_id AND p.sector='residential'
 AND c.issued_document_id=NEW.source_document_id AND c.template_version=NEW.template_version);
END;
CREATE TRIGGER wa_agreement_source_immutable BEFORE UPDATE OF case_id,tenancy_id,property_id,source_document_id,source_sha256,template_version,prepared_by,prepared_at ON wa_agreement_envelopes
 BEGIN SELECT RAISE(ABORT,'WA_AGREEMENT_SOURCE_IMMUTABLE'); END;
CREATE TABLE wa_agreement_signers(
 id TEXT PRIMARY KEY,
 envelope_id TEXT NOT NULL REFERENCES wa_agreement_envelopes(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 role TEXT NOT NULL CHECK(role IN('tenant','landlord')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','consented')),
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 consent_envelope TEXT,
 consented_at TEXT,
 UNIQUE(envelope_id,user_id)
) STRICT;
CREATE TRIGGER wa_agreement_signer_tenancy BEFORE INSERT ON wa_agreement_signers BEGIN
 SELECT RAISE(ABORT,'WA_SIGNER_NOT_TENANT') WHERE NEW.role='tenant' AND NOT EXISTS(
 SELECT 1 FROM wa_agreement_envelopes e JOIN tenancy_memberships m ON m.tenancy_id=e.tenancy_id
 WHERE e.id=NEW.envelope_id AND m.user_id=NEW.user_id AND m.ends_at IS NULL);
 SELECT RAISE(ABORT,'WA_SIGNER_NOT_MANAGER') WHERE NEW.role='landlord' AND NOT EXISTS(
 SELECT 1 FROM wa_agreement_envelopes e
 JOIN property_management_relationships pm ON pm.property_id=e.property_id AND pm.ends_at IS NULL
 JOIN client_memberships m ON m.client_id=pm.manager_client_id AND m.active=1 AND m.role IN('owner','admin')
 WHERE e.id=NEW.envelope_id AND m.user_id=NEW.user_id);
END;
CREATE TRIGGER wa_agreement_signed_consent_immutable BEFORE UPDATE OF consent_envelope,consented_at,source_sha256 ON wa_agreement_signers
 WHEN OLD.consented_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'WA_SIGNED_CONSENT_IMMUTABLE'); END;
CREATE TABLE wa_agreement_events(
 id TEXT PRIMARY KEY, envelope_id TEXT NOT NULL REFERENCES wa_agreement_envelopes(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL,
 reference TEXT, created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER wa_agreement_events_immutable_u BEFORE UPDATE ON wa_agreement_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER wa_agreement_events_immutable_d BEFORE DELETE ON wa_agreement_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
