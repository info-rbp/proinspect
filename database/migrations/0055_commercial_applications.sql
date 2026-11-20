-- Isolated additive commercial intake. No existing rental/listing checks are weakened.
-- No flags, authority, recipients, real offers or applications are seeded.
CREATE TABLE commercial_application_permissions(
 user_id TEXT PRIMARY KEY REFERENCES users(id), can_configure INTEGER NOT NULL DEFAULT 0 CHECK(can_configure IN(0,1)),
 can_review INTEGER NOT NULL DEFAULT 0 CHECK(can_review IN(0,1)),active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 granted_by TEXT NOT NULL REFERENCES users(id),granted_at TEXT NOT NULL,reference TEXT NOT NULL
) STRICT;
CREATE TABLE commercial_application_flows(
 id TEXT PRIMARY KEY,listing_id TEXT NOT NULL REFERENCES leasing_listings(id),version INTEGER NOT NULL CHECK(version>0),
 mode TEXT NOT NULL CHECK(mode='proinspect_commercial'),status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','revoked')),
 config_envelope TEXT NOT NULL,config_sha256 TEXT NOT NULL CHECK(length(config_sha256)=64),recipient_hash TEXT NOT NULL,
 recipient_verified_at TEXT,created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,
 approved_by TEXT REFERENCES users(id),approved_at TEXT,approval_reference TEXT,UNIQUE(listing_id,version)
) STRICT;
CREATE UNIQUE INDEX commercial_one_approved_flow ON commercial_application_flows(listing_id) WHERE status='approved';
CREATE TRIGGER commercial_flow_listing_guard BEFORE INSERT ON commercial_application_flows
 WHEN NOT EXISTS(SELECT 1 FROM leasing_listings l WHERE l.id=NEW.listing_id AND l.kind='commercial')
 BEGIN SELECT RAISE(ABORT,'COMMERCIAL_LISTING_REQUIRED'); END;
CREATE TRIGGER commercial_flow_immutable_scope BEFORE UPDATE OF listing_id,version,mode,config_envelope,config_sha256,recipient_hash,created_by,created_at ON commercial_application_flows
 BEGIN SELECT RAISE(ABORT,'COMMERCIAL_FLOW_SCOPE_IMMUTABLE'); END;
CREATE TRIGGER commercial_listing_change_revokes_flow AFTER UPDATE OF property_id,instructed_by_client_id,agent_name,agent_role,application_url,kind ON leasing_listings
 WHEN OLD.property_id IS NOT NEW.property_id OR OLD.instructed_by_client_id IS NOT NEW.instructed_by_client_id
 OR OLD.agent_name IS NOT NEW.agent_name OR OLD.agent_role IS NOT NEW.agent_role OR OLD.application_url IS NOT NEW.application_url OR OLD.kind IS NOT NEW.kind
 BEGIN UPDATE commercial_application_flows SET status='revoked' WHERE listing_id=NEW.id AND status='approved'; END;
CREATE TRIGGER commercial_flow_approval_guard BEFORE UPDATE OF status ON commercial_application_flows
 WHEN NEW.status='approved' AND (OLD.status!='draft' OR NEW.recipient_verified_at IS NULL OR NEW.approved_by IS NULL OR NEW.approved_by=NEW.created_by OR NEW.approved_at IS NULL OR length(COALESCE(NEW.approval_reference,''))<8)
 BEGIN SELECT RAISE(ABORT,'COMMERCIAL_INDEPENDENT_AUTHORITY_REQUIRED'); END;
CREATE TABLE commercial_flow_recipient_challenges(
 token_hash TEXT PRIMARY KEY,flow_id TEXT NOT NULL REFERENCES commercial_application_flows(id),expires_at TEXT NOT NULL,used_at TEXT
) STRICT;
CREATE TABLE commercial_applications(
 id TEXT PRIMARY KEY,flow_id TEXT NOT NULL REFERENCES commercial_application_flows(id),reference TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','invited','in_progress','ready','submitted','scanning_validation','referred','decision_recorded','closed','withdrawn','expired','needs_information','blocked')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),shared_envelope TEXT NOT NULL,scope_sha256 TEXT NOT NULL CHECK(length(scope_sha256)=64),
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,submitted_at TEXT,retained_until TEXT NOT NULL,privacy_hold_until TEXT,purged_at TEXT
) STRICT;
CREATE TABLE commercial_application_people(
 id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES commercial_applications(id),email_hash TEXT NOT NULL,
 lead INTEGER NOT NULL DEFAULT 0 CHECK(lead IN(0,1)),profile_envelope TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'invited' CHECK(state IN('invited','in_progress','ready','withdrawn','removed')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),declared_scope_sha256 TEXT,declared_notice_sha256 TEXT,declared_at TEXT,
 UNIQUE(application_id,email_hash),UNIQUE(application_id,id)
) STRICT;
CREATE UNIQUE INDEX commercial_one_lead ON commercial_application_people(application_id) WHERE lead=1;
CREATE TABLE commercial_applicant_entities(
 id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES commercial_applications(id),
 entity_type TEXT NOT NULL CHECK(entity_type IN('individual','sole_trader','company','partnership','trust','corporate_trustee','association','other_overseas','joint')),
 envelope TEXT NOT NULL,UNIQUE(application_id,id)
) STRICT;
CREATE TABLE commercial_people_roles(
 application_id TEXT NOT NULL,person_id TEXT NOT NULL,entity_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN('contact','director','partner','trustee_officer','signatory','guarantor')),authority_envelope TEXT NOT NULL,
 PRIMARY KEY(application_id,person_id,entity_id,role),
 FOREIGN KEY(application_id,person_id) REFERENCES commercial_application_people(application_id,id),
 FOREIGN KEY(application_id,entity_id) REFERENCES commercial_applicant_entities(application_id,id)
) STRICT;
CREATE TABLE commercial_application_links(
 token_hash TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES commercial_application_people(id),expires_at TEXT NOT NULL,consumed_at TEXT
) STRICT;
CREATE TABLE commercial_application_sessions(
 token_hash TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES commercial_application_people(id),expires_at TEXT NOT NULL,revoked_at TEXT
) STRICT;
CREATE TABLE commercial_application_evidence(
 id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES commercial_applications(id),person_id TEXT NOT NULL,entity_id TEXT,
 category TEXT NOT NULL CHECK(category IN('financial_year','bas_quarter','registry','trust_authority','partnership_authority','association_authority','identity','guarantee','fitout_plan','alternative','other')),
 period_label TEXT NOT NULL DEFAULT '',object_key TEXT NOT NULL UNIQUE,metadata_envelope TEXT NOT NULL,sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 scan_status TEXT NOT NULL DEFAULT 'pending' CHECK(scan_status IN('pending','clean','unsafe','error')),
 review_status TEXT NOT NULL DEFAULT 'quarantined' CHECK(review_status IN('quarantined','released','rejected')),
 scan_requested_at TEXT,scan_reference_envelope TEXT,reviewed_by TEXT REFERENCES users(id),uploaded_at TEXT NOT NULL,
 FOREIGN KEY(application_id,person_id) REFERENCES commercial_application_people(application_id,id),
 FOREIGN KEY(application_id,entity_id) REFERENCES commercial_applicant_entities(application_id,id)
) STRICT;
CREATE UNIQUE INDEX commercial_evidence_duplicate ON commercial_application_evidence(application_id,person_id,sha256);
CREATE UNIQUE INDEX commercial_evidence_period ON commercial_application_evidence(application_id,entity_id,category,period_label) WHERE category IN('financial_year','bas_quarter');
CREATE TRIGGER commercial_evidence_release_guard BEFORE UPDATE OF review_status ON commercial_application_evidence
 WHEN NEW.review_status='released' AND (NEW.scan_status!='clean' OR OLD.scan_status!='clean' OR NEW.reviewed_by IS NULL)
 BEGIN SELECT RAISE(ABORT,'COMMERCIAL_CLEAN_SCAN_REQUIRED'); END;
CREATE TRIGGER commercial_evidence_final_scan BEFORE UPDATE OF scan_status ON commercial_application_evidence
 WHEN OLD.scan_status IN('clean','unsafe') AND NEW.scan_status!=OLD.scan_status
 BEGIN SELECT RAISE(ABORT,'COMMERCIAL_SCAN_FINAL'); END;
CREATE TABLE commercial_application_scan_receipts(
 event_id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES commercial_application_evidence(id),received_at TEXT NOT NULL
) STRICT;
CREATE TABLE commercial_application_offers(
 id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES commercial_applications(id),version TEXT NOT NULL,
 envelope TEXT NOT NULL,sha256 TEXT NOT NULL CHECK(length(sha256)=64),expires_at TEXT NOT NULL,
 authorised_by TEXT NOT NULL REFERENCES users(id),authorised_at TEXT NOT NULL,UNIQUE(application_id,version)
) STRICT;
CREATE TABLE commercial_application_submissions(
 id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES commercial_applications(id),request_key TEXT NOT NULL UNIQUE,
 snapshot_envelope TEXT NOT NULL,sha256 TEXT NOT NULL CHECK(length(sha256)=64),submitted_by TEXT NOT NULL REFERENCES commercial_application_people(id),created_at TEXT NOT NULL
) STRICT;
CREATE TABLE commercial_application_events(
 id TEXT PRIMARY KEY,application_id TEXT REFERENCES commercial_applications(id),flow_id TEXT REFERENCES commercial_application_flows(id),
 actor_person_id TEXT REFERENCES commercial_application_people(id),actor_staff_id TEXT REFERENCES users(id),
 kind TEXT NOT NULL,envelope TEXT NOT NULL,created_at TEXT NOT NULL
) STRICT;
CREATE TABLE commercial_application_referrals(
 id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES commercial_applications(id),submission_id TEXT NOT NULL REFERENCES commercial_application_submissions(id),
 recipient_hash TEXT NOT NULL,idempotency_key TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN('prepared','sending','accepted','uncertain','bounced','revoked')),
 prepared_by TEXT NOT NULL REFERENCES users(id),prepared_at TEXT NOT NULL,receipt_envelope TEXT
) STRICT;
CREATE TABLE commercial_referral_grants(
 token_hash TEXT PRIMARY KEY,referral_id TEXT NOT NULL REFERENCES commercial_application_referrals(id),
 recipient_hash TEXT NOT NULL,expires_at TEXT NOT NULL
) STRICT;
CREATE TABLE commercial_application_privacy_requests(
 id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES commercial_applications(id),person_id TEXT NOT NULL REFERENCES commercial_application_people(id),
 kind TEXT NOT NULL CHECK(kind IN('access','correction','erasure')),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','resolved','denied')),
 envelope TEXT NOT NULL,created_at TEXT NOT NULL,resolution_envelope TEXT,resolved_by TEXT REFERENCES users(id),resolved_at TEXT
) STRICT;
CREATE TABLE commercial_application_purge_permits(
 application_id TEXT PRIMARY KEY REFERENCES commercial_applications(id),approved_by TEXT NOT NULL REFERENCES users(id),approved_at TEXT NOT NULL,verification_reference TEXT NOT NULL
) STRICT;
CREATE TRIGGER commercial_referral_receipt_guard BEFORE UPDATE OF status ON commercial_application_referrals
 WHEN NEW.status='accepted' AND (OLD.status NOT IN('sending','uncertain') OR NEW.receipt_envelope IS NULL)
 BEGIN SELECT RAISE(ABORT,'COMMERCIAL_SIGNED_RECEIPT_REQUIRED'); END;
CREATE TRIGGER commercial_referred_requires_receipt BEFORE UPDATE OF status ON commercial_applications
 WHEN NEW.status='referred' AND NOT EXISTS(SELECT 1 FROM commercial_application_referrals r WHERE r.application_id=NEW.id AND r.status='accepted' AND r.receipt_envelope IS NOT NULL)
 BEGIN SELECT RAISE(ABORT,'COMMERCIAL_REFERRAL_ACCEPTANCE_REQUIRED'); END;
CREATE TRIGGER commercial_submission_immutable_u BEFORE UPDATE ON commercial_application_submissions WHEN NOT EXISTS(SELECT 1 FROM commercial_application_purge_permits WHERE application_id=OLD.application_id) BEGIN SELECT RAISE(ABORT,'COMMERCIAL_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER commercial_submission_immutable_d BEFORE DELETE ON commercial_application_submissions BEGIN SELECT RAISE(ABORT,'COMMERCIAL_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER commercial_event_immutable_u BEFORE UPDATE ON commercial_application_events WHEN NOT EXISTS(SELECT 1 FROM commercial_application_purge_permits WHERE application_id=OLD.application_id) BEGIN SELECT RAISE(ABORT,'COMMERCIAL_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER commercial_event_immutable_d BEFORE DELETE ON commercial_application_events BEGIN SELECT RAISE(ABORT,'COMMERCIAL_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER commercial_offer_immutable_u BEFORE UPDATE ON commercial_application_offers WHEN NOT EXISTS(SELECT 1 FROM commercial_application_purge_permits WHERE application_id=OLD.application_id) BEGIN SELECT RAISE(ABORT,'COMMERCIAL_OFFER_IMMUTABLE'); END;
CREATE TRIGGER commercial_offer_immutable_d BEFORE DELETE ON commercial_application_offers BEGIN SELECT RAISE(ABORT,'COMMERCIAL_OFFER_IMMUTABLE'); END;
CREATE TRIGGER commercial_submission_identity_immutable BEFORE UPDATE OF id,application_id,request_key,sha256,submitted_by,created_at ON commercial_application_submissions BEGIN SELECT RAISE(ABORT,'COMMERCIAL_SNAPSHOT_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER commercial_event_identity_immutable BEFORE UPDATE OF id,application_id,flow_id,actor_person_id,actor_staff_id,kind,created_at ON commercial_application_events BEGIN SELECT RAISE(ABORT,'COMMERCIAL_AUDIT_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER commercial_offer_identity_immutable BEFORE UPDATE OF id,application_id,version,sha256,expires_at,authorised_by,authorised_at ON commercial_application_offers BEGIN SELECT RAISE(ABORT,'COMMERCIAL_OFFER_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER commercial_evidence_content_immutable BEFORE UPDATE OF id,application_id,person_id,entity_id,category,period_label,object_key,metadata_envelope,sha256,uploaded_at ON commercial_application_evidence
 BEGIN SELECT RAISE(ABORT,'COMMERCIAL_EVIDENCE_CONTENT_IMMUTABLE'); END;
CREATE TRIGGER commercial_submitted_evidence_delete BEFORE DELETE ON commercial_application_evidence
 WHEN NOT EXISTS(SELECT 1 FROM commercial_applications a WHERE a.id=OLD.application_id AND a.status IN('draft','invited','in_progress','ready','needs_information'))
 AND NOT EXISTS(SELECT 1 FROM commercial_application_purge_permits p WHERE p.application_id=OLD.application_id)
 BEGIN SELECT RAISE(ABORT,'COMMERCIAL_SUBMITTED_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER commercial_submission_parent_guard BEFORE INSERT ON commercial_application_submissions
 WHEN NOT EXISTS(SELECT 1 FROM commercial_application_people p JOIN commercial_applications a ON a.id=p.application_id WHERE p.id=NEW.submitted_by AND p.application_id=NEW.application_id AND p.lead=1 AND a.status='submitted')
 BEGIN SELECT RAISE(ABORT,'COMMERCIAL_SUBMISSION_OWNER_REQUIRED'); END;
CREATE TRIGGER commercial_referral_parent_guard BEFORE INSERT ON commercial_application_referrals
 WHEN NOT EXISTS(SELECT 1 FROM commercial_application_submissions s WHERE s.id=NEW.submission_id AND s.application_id=NEW.application_id)
 BEGIN SELECT RAISE(ABORT,'COMMERCIAL_REFERRAL_PARENT_REQUIRED'); END;
