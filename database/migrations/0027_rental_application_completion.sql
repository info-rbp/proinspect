-- Rental applications priorities 1-5. Additive migration; does not activate intake or delivery.
-- All sensitive external integrations remain explicitly disabled until provider and legal acceptance.
ALTER TABLE leasing_listings ADD COLUMN rental_approval_state TEXT NOT NULL DEFAULT 'pending'
 CHECK(rental_approval_state IN ('pending','approved'));
ALTER TABLE leasing_listings ADD COLUMN rental_approval_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leasing_listings ADD COLUMN rental_approved_at TEXT;
ALTER TABLE leasing_listings ADD COLUMN rental_approved_by TEXT REFERENCES users(id);
ALTER TABLE leasing_listings ADD COLUMN rental_approved_notice_version TEXT;
ALTER TABLE leasing_listings ADD COLUMN rental_recipient_verified_at TEXT;

CREATE TABLE rental_listing_recipient_challenges (
 id TEXT PRIMARY KEY,
 listing_id TEXT NOT NULL REFERENCES leasing_listings(id),
 recipient_hash TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 expires_at TEXT NOT NULL,
 requested_at TEXT NOT NULL,
 requested_by TEXT NOT NULL REFERENCES users(id),
 verified_at TEXT,
 CHECK(verified_at IS NULL OR verified_at>=requested_at)
) STRICT;
CREATE INDEX rental_recipient_challenge_listing ON rental_listing_recipient_challenges(listing_id,requested_at DESC);

CREATE TABLE rental_listing_approvals (
 id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES leasing_listings(id),
 approval_version INTEGER NOT NULL,
 authority_reference TEXT NOT NULL,
 authority_attestation_envelope TEXT NOT NULL,
 privacy_notice_version TEXT NOT NULL,
 recipient_challenge_id TEXT NOT NULL REFERENCES rental_listing_recipient_challenges(id),
 approved_by TEXT NOT NULL REFERENCES users(id), approved_at TEXT NOT NULL,
 UNIQUE(listing_id,approval_version)
) STRICT;
CREATE TRIGGER rental_listing_approval_immutable_update BEFORE UPDATE ON rental_listing_approvals
 BEGIN SELECT RAISE(ABORT,'RENTAL_APPROVAL_IMMUTABLE'); END;
CREATE TRIGGER rental_listing_approval_immutable_delete BEFORE DELETE ON rental_listing_approvals
 BEGIN SELECT RAISE(ABORT,'RENTAL_APPROVAL_IMMUTABLE'); END;

-- Any changed application authority, recipient, notices, route, or represented party
-- voids prior approval. A recipient must verify anew if the address changes.
CREATE TRIGGER rental_listing_changes_revoke_approval
AFTER UPDATE OF application_mode,application_url,application_authority_reference,
 application_recipient_email,tenancy_database_notice_mode,tenancy_database_notice_json,
 instructed_by_client_id,agent_name,agent_role,property_id
ON leasing_listings
WHEN OLD.application_mode IS NOT NEW.application_mode
 OR OLD.application_url IS NOT NEW.application_url
 OR OLD.application_authority_reference IS NOT NEW.application_authority_reference
 OR OLD.application_recipient_email IS NOT NEW.application_recipient_email
 OR OLD.tenancy_database_notice_mode IS NOT NEW.tenancy_database_notice_mode
 OR OLD.tenancy_database_notice_json IS NOT NEW.tenancy_database_notice_json
 OR OLD.instructed_by_client_id IS NOT NEW.instructed_by_client_id
 OR OLD.agent_name IS NOT NEW.agent_name
 OR OLD.agent_role IS NOT NEW.agent_role OR OLD.property_id IS NOT NEW.property_id
BEGIN
 UPDATE leasing_listings
 SET rental_approval_state='pending',rental_approved_at=NULL,
 rental_approved_by=NULL,rental_approved_notice_version=NULL,
 rental_recipient_verified_at=CASE WHEN OLD.application_recipient_email IS NOT NEW.application_recipient_email
 THEN NULL ELSE rental_recipient_verified_at END
 WHERE id=NEW.id;
END;

CREATE TRIGGER rental_listing_approved_requires_evidence
BEFORE UPDATE OF rental_approval_state ON leasing_listings
WHEN NEW.rental_approval_state='approved'
AND (NEW.application_mode!='proinspect' OR NEW.kind!='residential'
 OR NEW.application_url IS NOT NULL OR NEW.rental_recipient_verified_at IS NULL
 OR NEW.rental_approved_by IS NULL OR NEW.rental_approved_at IS NULL
 OR NEW.rental_approved_notice_version IS NULL)
BEGIN SELECT RAISE(ABORT,'RENTAL_APPLICATION_APPROVAL_REQUIRED'); END;

-- A private scan endpoint is expected to scan bytes supplied through a verified
-- outbound Worker request; it never receives a public R2 URL.
CREATE TABLE rental_document_scan_jobs (
 document_id TEXT PRIMARY KEY REFERENCES rental_application_documents(id),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),
 next_attempt_at TEXT NOT NULL,
 last_error_code TEXT,
 last_attempt_at TEXT,
 completed_at TEXT
) STRICT;
CREATE INDEX rental_scan_jobs_due ON rental_document_scan_jobs(next_attempt_at,completed_at);

CREATE TABLE rental_handoff_receipts (
 id TEXT PRIMARY KEY,
 handoff_id TEXT NOT NULL UNIQUE REFERENCES rental_application_handoffs(id),
 idempotency_key TEXT NOT NULL UNIQUE,
 recipient_hash TEXT NOT NULL,
 message_reference TEXT NOT NULL,
 accepted_at TEXT NOT NULL
) STRICT;
-- An Apps Script email-provider acceptance receipt is necessary to mark
-- a handoff as sent, but does NOT establish delivery to the recipient's inbox.
DROP TRIGGER rental_handoff_cannot_claim_delivery;
CREATE TRIGGER rental_handoff_requires_script_receipt
BEFORE UPDATE OF status ON rental_application_handoffs
WHEN NEW.status='delivered' AND NOT EXISTS (
 SELECT 1 FROM rental_handoff_receipts r WHERE r.handoff_id=NEW.id
 AND r.idempotency_key=NEW.idempotency_key AND r.recipient_hash=NEW.recipient_hash
)
BEGIN SELECT RAISE(ABORT,'RENTAL_SCRIPT_RECEIPT_REQUIRED'); END;
ALTER TABLE rental_application_handoffs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rental_application_handoffs ADD COLUMN next_attempt_at TEXT;
ALTER TABLE rental_application_handoffs ADD COLUMN last_error_code TEXT;
CREATE INDEX rental_handoff_retry_due ON rental_application_handoffs(status,next_attempt_at);

CREATE TABLE rental_application_outcomes (
 id TEXT PRIMARY KEY,application_id TEXT NOT NULL UNIQUE REFERENCES rental_applications(id),
 outcome TEXT NOT NULL CHECK(outcome IN ('successful','unsuccessful')),
 authority_reference TEXT NOT NULL,details_envelope TEXT NOT NULL,
 recorded_by TEXT NOT NULL REFERENCES users(id), recorded_at TEXT NOT NULL,
 applicant_notification_at TEXT
) STRICT;
CREATE TRIGGER rental_outcome_immutable_update BEFORE UPDATE ON rental_application_outcomes
 WHEN NEW.outcome!=OLD.outcome OR NEW.authority_reference!=OLD.authority_reference
 OR NEW.details_envelope!=OLD.details_envelope OR NEW.recorded_by!=OLD.recorded_by
 OR NEW.recorded_at!=OLD.recorded_at
BEGIN SELECT RAISE(ABORT,'RENTAL_OUTCOME_IMMUTABLE'); END;
CREATE TRIGGER rental_outcome_immutable_delete BEFORE DELETE ON rental_application_outcomes
 WHEN NOT EXISTS(SELECT 1 FROM rental_application_purge_permits p WHERE p.application_id=OLD.application_id)
BEGIN SELECT RAISE(ABORT,'RENTAL_OUTCOME_IMMUTABLE'); END;

-- Preserve minimal audit evidence when privacy erasure is lawfully performed.
-- Outcome rows must be deleted before their parent during an authorised purge.
