-- WA residential bond register: additive, non-custodial, government submission remains external.
-- The default workflow reflects the Security Bond Release Application commenced 28 March 2026.
-- Legacy statutory_forms records are retained and deliberately not migrated into government status.
CREATE TABLE bonds (
 id TEXT PRIMARY KEY,
 tenancy_id TEXT NOT NULL UNIQUE REFERENCES tenancies(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 created_by TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','awaiting_lodgement','lodgement_submitted','active','variation_pending','release_pending','in_dispute','appeal_pending','released','exception')),
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
