-- Reporting photo annotations retain immutable JPEG originals and reviewed overlay provenance.
CREATE TABLE report_photo_annotations (
  evidence_id TEXT PRIMARY KEY REFERENCES report_evidence(id) ON DELETE RESTRICT,
  report_id TEXT NOT NULL REFERENCES inspection_reports(id) ON DELETE RESTRICT,
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
  annotations_json TEXT NOT NULL CHECK(json_valid(annotations_json)),
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK(review_status IN ('draft','accepted','rejected')),
  created_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  source_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX report_annotations_report ON report_photo_annotations(report_id,review_status);
CREATE TRIGGER report_annotations_immutable AFTER UPDATE ON report_photo_annotations
WHEN OLD.review_status='accepted'
BEGIN SELECT RAISE(ABORT,'REVIEWED_ANNOTATIONS_IMMUTABLE'); END;

-- Audited financial corrections are proposals, NOT Stripe credit-note, bank or refund transactions.
CREATE TABLE invoice_credit_proposals (
  id TEXT PRIMARY KEY,
  stripe_invoice_id TEXT NOT NULL REFERENCES billing_invoices(stripe_invoice_id) ON DELETE RESTRICT,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
  rationale TEXT NOT NULL CHECK(length(trim(rationale))>=8),
  evidence_reference TEXT NOT NULL CHECK(length(trim(evidence_reference))>=8),
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','rejected')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX invoice_credit_proposals_invoice ON invoice_credit_proposals(stripe_invoice_id,status);
CREATE TRIGGER invoice_credit_immutable BEFORE UPDATE ON invoice_credit_proposals
WHEN OLD.status IN ('approved','rejected')
BEGIN SELECT RAISE(ABORT,'CREDIT_PROPOSAL_IMMUTABLE'); END;

-- Independent bank/payout evidence observations do not change payment settlement.
CREATE TABLE bank_reconciliation_observations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  observed_amount_cents INTEGER NOT NULL CHECK(observed_amount_cents>=0),
  observation_type TEXT NOT NULL CHECK(observation_type IN ('bank_received','bank_returned','payout_match','payout_exception')),
  source_reference TEXT NOT NULL CHECK(length(trim(source_reference))>=8),
  status TEXT NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded','reviewed','disputed')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
) STRICT;
CREATE INDEX bank_observations_payment ON bank_reconciliation_observations(payment_id,status);
CREATE TRIGGER bank_observation_immutable BEFORE UPDATE ON bank_reconciliation_observations
WHEN OLD.status IN ('reviewed','disputed')
BEGIN SELECT RAISE(ABORT,'BANK_OBSERVATION_IMMUTABLE'); END;
