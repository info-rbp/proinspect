-- WA residential bond register: additive, non-custodial, government submission remains external.
-- The default workflow reflects the Security Bond Release Application commenced 28 March 2026.
-- Legacy statutory_forms records are retained and deliberately not migrated into government status.
CREATE TABLE bonds (
 id TEXT PRIMARY KEY,
 tenancy_id TEXT NOT NULL UNIQUE REFERENCES tenancies(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 created_by TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','awaiting_lodgement','lodgement_submitted','active','variation_pending','release_pending','in_dispute','appeal_pending','payout_pending','released','exception')),
 bond_reference TEXT UNIQUE,
 general_cents INTEGER NOT NULL DEFAULT 0 CHECK(general_cents>=0),
 pet_cents INTEGER NOT NULL DEFAULT 0 CHECK(pet_cents>=0),
 held_general_cents INTEGER NOT NULL DEFAULT 0 CHECK(held_general_cents>=0),
 held_pet_cents INTEGER NOT NULL DEFAULT 0 CHECK(held_pet_cents>=0),
 weekly_rent_cents INTEGER NOT NULL CHECK(weekly_rent_cents>=0),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, confirmed_at TEXT,
 CHECK(held_general_cents<=general_cents OR status='released'),
 CHECK(held_pet_cents<=pet_cents OR status='released')
) STRICT;
CREATE INDEX bond_status ON bonds(status,updated_at);
CREATE TABLE bond_parties (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 user_id TEXT REFERENCES users(id), role TEXT NOT NULL CHECK(role IN('tenant','landlord','agent','estate')),
 name_envelope TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','confirmed','former')),
 external_reference TEXT, government_document_id TEXT REFERENCES documents(id),
 effective_at TEXT NOT NULL, ended_at TEXT,
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX bond_parties_bond ON bond_parties(bond_id,status);
CREATE TABLE bond_transactions (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 code TEXT NOT NULL CHECK(code IN(
 'B01','B02','B03','B04','B05','B06','B07','B08','B09',
 'B10','B11','B12','B13','B14','B15','B16','B17','B18',
 'B19','B20','B21','B22','B23')),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted','confirmed','rejected','cancelled')),
 general_delta_cents INTEGER NOT NULL DEFAULT 0, pet_delta_cents INTEGER NOT NULL DEFAULT 0,
 details_envelope TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
 channel TEXT CHECK(channel IN('manual','bondsonline','ecourts','other')),
 external_reference TEXT, submitted_at TEXT, confirmed_at TEXT,
 confirmation_document_id TEXT REFERENCES documents(id),
 confirmed_by TEXT REFERENCES users(id),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX bond_transactions_bond ON bond_transactions(bond_id,created_at);
CREATE UNIQUE INDEX bond_one_pending_submission ON bond_transactions(bond_id) WHERE status='submitted' AND code IN('B01','B02','B03','B04','B05','B06','B07','B08','B09','B10','B11','B12','B13','B14','B15','B19');
CREATE TABLE bond_receipts (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 transaction_id TEXT REFERENCES bond_transactions(id),
 kind TEXT NOT NULL CHECK(kind IN('general','pet')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 payer_envelope TEXT NOT NULL,
 payment_reference TEXT NOT NULL,
 paid_at TEXT NOT NULL, due_at TEXT NOT NULL,
 lodgement_confirmed_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
) STRICT;
CREATE INDEX bond_receipts_due ON bond_receipts(due_at) WHERE lodgement_confirmed_at IS NULL;
CREATE TABLE bond_claims (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 transaction_id TEXT NOT NULL REFERENCES bond_transactions(id),
 category TEXT NOT NULL CHECK(category IN(
 'property_damage','garden','carpet_cleaning','cleaning','pet_fumigation','keys_security',
 'unpaid_rent','unpaid_utilities','other_breach')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 explanation_envelope TEXT NOT NULL,
 evidence_document_id TEXT REFERENCES documents(id),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
) STRICT;
CREATE INDEX bond_claims_transaction ON bond_claims(transaction_id);
CREATE TABLE bond_evidence (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 transaction_id TEXT REFERENCES bond_transactions(id),
 document_id TEXT NOT NULL REFERENCES documents(id),
 category TEXT NOT NULL CHECK(category IN('lodgement','variation','release','claim','notice','dispute','court','government_confirmation','other')),
 submitted_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(bond_id,document_id,transaction_id)
) STRICT;
CREATE TABLE bond_cases (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 transaction_id TEXT NOT NULL REFERENCES bond_transactions(id),
 status TEXT NOT NULL DEFAULT 'notice_received' CHECK(status IN('notice_received','responded','referred','submissions','determined','appealed','declined','resolved')),
 decision_envelope TEXT, external_reference TEXT,
 decision_at TEXT, appeal_due_at TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX bond_cases_transaction ON bond_cases(transaction_id);
CREATE TABLE bond_deadlines (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 transaction_id TEXT REFERENCES bond_transactions(id),
 kind TEXT NOT NULL CHECK(kind IN('lodgement','response','submission','appeal','other')),
 source TEXT NOT NULL CHECK(source IN('receipt','government_notice','court','reviewed_rule')),
 due_at TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL
) STRICT;
CREATE INDEX bond_deadlines_due ON bond_deadlines(due_at) WHERE completed_at IS NULL;
CREATE TABLE bond_notices (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 transaction_id TEXT REFERENCES bond_transactions(id),
 case_id TEXT REFERENCES bond_cases(id),
 kind TEXT NOT NULL CHECK(kind IN('release_application','invitation_to_submit','commissioner_decision','appeal','variation','other')),
 government_reference TEXT NOT NULL, received_at TEXT NOT NULL, response_due_at TEXT,
 document_id TEXT REFERENCES documents(id),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE bond_events (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 transaction_id TEXT REFERENCES bond_transactions(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX bond_events_history ON bond_events(bond_id,created_at);
-- History and evidence are append-only; corrections create new transactions.
CREATE TRIGGER bond_events_immutable_update BEFORE UPDATE ON bond_events BEGIN SELECT RAISE(ABORT,'BOND_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER bond_events_immutable_delete BEFORE DELETE ON bond_events BEGIN SELECT RAISE(ABORT,'BOND_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER bond_receipts_immutable_update BEFORE UPDATE OF amount_cents,kind,payer_envelope,payment_reference,paid_at ON bond_receipts BEGIN SELECT RAISE(ABORT,'BOND_RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER bond_transactions_confirmed_immutable BEFORE UPDATE OF code,general_delta_cents,pet_delta_cents,details_envelope,channel,external_reference,confirmation_document_id ON bond_transactions WHEN OLD.status='confirmed' BEGIN SELECT RAISE(ABORT,'BOND_CONFIRMED_TRANSACTION_IMMUTABLE'); END;

CREATE TABLE bond_alert_dispatches (
 deadline_id TEXT NOT NULL REFERENCES bond_deadlines(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 phase TEXT NOT NULL CHECK(phase IN('approaching','overdue')),
 created_at TEXT NOT NULL,
 PRIMARY KEY(deadline_id,user_id,phase)
) STRICT;

-- Form worksheets are not substitutes for official Bonds Administration forms.
CREATE TABLE bond_preparations (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 transaction_id TEXT NOT NULL UNIQUE REFERENCES bond_transactions(id),
 official_form TEXT NOT NULL CHECK(official_form IN('lodgement','variation','release','external')),
 worksheet_envelope TEXT NOT NULL, policy_version TEXT NOT NULL,
 acknowledged_external INTEGER NOT NULL CHECK(acknowledged_external=1),
 prepared_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE bond_contributions (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 party_id TEXT NOT NULL REFERENCES bond_parties(id),
 receipt_id TEXT NOT NULL REFERENCES bond_receipts(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(bond_id,receipt_id,party_id)
) STRICT;
CREATE INDEX bond_contributions_receipt ON bond_contributions(receipt_id);
CREATE TABLE bond_allocations (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 transaction_id TEXT NOT NULL REFERENCES bond_transactions(id),
 recipient_kind TEXT NOT NULL CHECK(recipient_kind IN('tenant','landlord','housing_loan','new_bond')),
 party_id TEXT REFERENCES bond_parties(id), target_bond_id TEXT REFERENCES bonds(id),
 general_cents INTEGER NOT NULL DEFAULT 0 CHECK(general_cents>=0),
 pet_cents INTEGER NOT NULL DEFAULT 0 CHECK(pet_cents>=0),
 payment_reference TEXT,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK(general_cents+pet_cents>0),
 CHECK((recipient_kind='tenant' AND party_id IS NOT NULL AND target_bond_id IS NULL)
    OR (recipient_kind='new_bond' AND target_bond_id IS NOT NULL AND party_id IS NULL)
    OR (recipient_kind IN('landlord','housing_loan') AND target_bond_id IS NULL))
) STRICT;
CREATE INDEX bond_allocations_tx ON bond_allocations(transaction_id);
-- A staff review is a human attestation of an official document/reference, not direct government verification.
CREATE TABLE bond_external_verifications (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 transaction_id TEXT REFERENCES bond_transactions(id),
 document_id TEXT NOT NULL REFERENCES documents(id),
 external_reference TEXT NOT NULL,
 source_channel TEXT NOT NULL CHECK(source_channel IN('bondsonline','manual','ecourts','other')),
 verification_method TEXT NOT NULL CHECK(verification_method IN('government_portal','government_correspondence','official_certificate','court_record')),
 review_notes_envelope TEXT NOT NULL,
 result TEXT NOT NULL CHECK(result IN('verified','rejected')),
 reviewed_by TEXT NOT NULL REFERENCES users(id), reviewed_at TEXT NOT NULL,
 UNIQUE(bond_id,transaction_id,document_id,external_reference,reviewed_by)
) STRICT;
CREATE INDEX bond_verifications_documents ON bond_external_verifications(bond_id,document_id,transaction_id,result);
CREATE TABLE bond_payout_reconciliations (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 transaction_id TEXT NOT NULL UNIQUE REFERENCES bond_transactions(id),
 government_reference TEXT NOT NULL,
 government_document_id TEXT NOT NULL REFERENCES documents(id),
 general_cents INTEGER NOT NULL CHECK(general_cents>=0),
 pet_cents INTEGER NOT NULL CHECK(pet_cents>=0),
 outcome TEXT NOT NULL CHECK(outcome IN('matched','exception')),
 reconciled_by TEXT NOT NULL REFERENCES users(id),
 notes_envelope TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
-- Exceptions require caseworker review and are not shared with a tenant by default.
CREATE TABLE bond_exception_cases (
 id TEXT PRIMARY KEY, bond_id TEXT NOT NULL REFERENCES bonds(id),
 transaction_id TEXT REFERENCES bond_transactions(id),
 kind TEXT NOT NULL CHECK(kind IN('estate','failed_lodgement','payout_mismatch','missing_government_record','manual_review')),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','in_review','resolved','referred')),
 details_envelope TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 resolved_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX bond_exceptions_open ON bond_exception_cases(status,created_at);
-- No editing of confirmed payments, allocations, reviews or reconciliation.
CREATE TRIGGER bond_allocations_immutable_update BEFORE UPDATE ON bond_allocations BEGIN SELECT RAISE(ABORT,'BOND_ALLOCATION_IMMUTABLE'); END;
CREATE TRIGGER bond_allocations_immutable_delete BEFORE DELETE ON bond_allocations BEGIN SELECT RAISE(ABORT,'BOND_ALLOCATION_IMMUTABLE'); END;
CREATE TRIGGER bond_contributions_immutable_update BEFORE UPDATE ON bond_contributions BEGIN SELECT RAISE(ABORT,'BOND_CONTRIBUTION_IMMUTABLE'); END;
CREATE TRIGGER bond_contributions_immutable_delete BEFORE DELETE ON bond_contributions BEGIN SELECT RAISE(ABORT,'BOND_CONTRIBUTION_IMMUTABLE'); END;
CREATE TRIGGER bond_external_verifications_immutable_update BEFORE UPDATE ON bond_external_verifications BEGIN SELECT RAISE(ABORT,'BOND_VERIFICATION_IMMUTABLE'); END;
CREATE TRIGGER bond_external_verifications_immutable_delete BEFORE DELETE ON bond_external_verifications BEGIN SELECT RAISE(ABORT,'BOND_VERIFICATION_IMMUTABLE'); END;
CREATE TRIGGER bond_payout_reconciliations_immutable_update BEFORE UPDATE ON bond_payout_reconciliations BEGIN SELECT RAISE(ABORT,'BOND_RECONCILIATION_IMMUTABLE'); END;
CREATE TRIGGER bond_payout_reconciliations_immutable_delete BEFORE DELETE ON bond_payout_reconciliations BEGIN SELECT RAISE(ABORT,'BOND_RECONCILIATION_IMMUTABLE'); END;
