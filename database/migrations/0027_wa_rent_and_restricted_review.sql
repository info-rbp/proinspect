-- Planning-only residential rent register. Never create a Stripe charge, payout, trust
-- account, bond payment or statutory notice merely by inserting into these tables.
CREATE TABLE rent_route_plans (
 id TEXT PRIMARY KEY,
 tenancy_id TEXT NOT NULL REFERENCES tenancies(id),
 property_id TEXT NOT NULL REFERENCES properties(id),
 manager_mode TEXT NOT NULL CHECK(manager_mode IN('self_managed','agency_managed')),
 route TEXT NOT NULL CHECK(route IN('agency_trust_external','landlord_direct_external','landlord_connect_candidate')),
 currency TEXT NOT NULL DEFAULT 'aud' CHECK(currency='aud'),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0 AND amount_cents<=100000000),
 frequency TEXT NOT NULL CHECK(frequency IN('weekly','fortnightly','monthly')),
 status TEXT NOT NULL DEFAULT 'proposal_only' CHECK(status='proposal_only'),
 policy_version TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 CHECK((manager_mode='agency_managed' AND route='agency_trust_external') OR
       (manager_mode='self_managed' AND route IN('landlord_direct_external','landlord_connect_candidate')))
) STRICT;
CREATE INDEX rent_route_plans_tenancy ON rent_route_plans(tenancy_id,created_at);
CREATE TRIGGER rent_plans_residential_insert BEFORE INSERT ON rent_route_plans
 WHEN NOT EXISTS(SELECT 1 FROM tenancies t JOIN properties p ON p.id=t.property_id
   WHERE t.id=NEW.tenancy_id AND p.id=NEW.property_id AND p.sector='residential')
 BEGIN SELECT RAISE(ABORT,'RENT_RESIDENTIAL_ONLY'); END;
CREATE TRIGGER rent_plans_immutable_update BEFORE UPDATE ON rent_route_plans
 BEGIN SELECT RAISE(ABORT,'RENT_PLAN_IMMUTABLE'); END;
CREATE TRIGGER rent_plans_immutable_delete BEFORE DELETE ON rent_route_plans
 BEGIN SELECT RAISE(ABORT,'RENT_PLAN_IMMUTABLE'); END;

-- External evidence is recorded but cannot establish payment or transfer on its own.
CREATE TABLE rent_external_money_records (
 id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES rent_route_plans(id),
 kind TEXT NOT NULL CHECK(kind IN('rent_received_external','owner_disbursement_external')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0 AND amount_cents<=100000000),
 source TEXT NOT NULL CHECK(source IN('agency_trust_statement','landlord_bank_statement','approved_external_ledger')),
 external_reference TEXT NOT NULL CHECK(length(external_reference) BETWEEN 4 AND 160),
 effective_at TEXT NOT NULL,
 recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(plan_id,kind,external_reference)
) STRICT;
CREATE TRIGGER rent_records_immutable_update BEFORE UPDATE ON rent_external_money_records
 BEGIN SELECT RAISE(ABORT,'RENT_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER rent_records_immutable_delete BEFORE DELETE ON rent_external_money_records
 BEGIN SELECT RAISE(ABORT,'RENT_EVIDENCE_IMMUTABLE'); END;
CREATE TABLE rent_external_verifications (
 id TEXT PRIMARY KEY, record_id TEXT NOT NULL UNIQUE REFERENCES rent_external_money_records(id),
 reviewed_by TEXT NOT NULL REFERENCES users(id),
 evidence_kind TEXT NOT NULL CHECK(evidence_kind IN('official_trust_ledger','bank_statement','accounting_reconciliation')),
 external_evidence_reference TEXT NOT NULL CHECK(length(external_evidence_reference) BETWEEN 4 AND 160),
 reviewed_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER rent_reviews_immutable_update BEFORE UPDATE ON rent_external_verifications
 BEGIN SELECT RAISE(ABORT,'RENT_VERIFICATION_IMMUTABLE'); END;
CREATE TRIGGER rent_reviews_immutable_delete BEFORE DELETE ON rent_external_verifications
 BEGIN SELECT RAISE(ABORT,'RENT_VERIFICATION_IMMUTABLE'); END;

-- Confidential Form 2 preparation. Not a legal notice, service event or payment.
CREATE TABLE restricted_form2_preparations (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES restricted_form_cases(id),
 encrypted_worksheet TEXT NOT NULL, official_form_code TEXT NOT NULL DEFAULT 'WA_FORM_2'
 CHECK(official_form_code='WA_FORM_2'),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status='draft'),
 prepared_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
) STRICT;
CREATE INDEX restricted_form2_case ON restricted_form2_preparations(case_id,created_at);
CREATE TRIGGER restricted_preparation_residential BEFORE INSERT ON restricted_form2_preparations
 WHEN NOT EXISTS(SELECT 1 FROM restricted_form_cases c JOIN tenancies t ON t.id=c.tenancy_id
 JOIN properties p ON p.id=t.property_id AND p.sector='residential' WHERE c.id=NEW.case_id)
 BEGIN SELECT RAISE(ABORT,'FORM2_RESIDENTIAL_ONLY'); END;
CREATE TRIGGER restricted_preparation_immutable_update BEFORE UPDATE ON restricted_form2_preparations
 BEGIN SELECT RAISE(ABORT,'FORM2_PREPARATION_IMMUTABLE'); END;
CREATE TRIGGER restricted_preparation_immutable_delete BEFORE DELETE ON restricted_form2_preparations
 BEGIN SELECT RAISE(ABORT,'FORM2_PREPARATION_IMMUTABLE'); END;
CREATE TABLE restricted_form2_reviews (
 id TEXT PRIMARY KEY, preparation_id TEXT NOT NULL UNIQUE REFERENCES restricted_form2_preparations(id),
 reviewer_id TEXT NOT NULL REFERENCES users(id),
 outcome TEXT NOT NULL CHECK(outcome IN('reviewed_for_manual_handling','requires_revision')),
 reviewed_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER restricted_review_immutable_update BEFORE UPDATE ON restricted_form2_reviews
 BEGIN SELECT RAISE(ABORT,'FORM2_REVIEW_IMMUTABLE'); END;
CREATE TRIGGER restricted_review_immutable_delete BEFORE DELETE ON restricted_form2_reviews
 BEGIN SELECT RAISE(ABORT,'FORM2_REVIEW_IMMUTABLE'); END;
-- Enforce reviewed disbursement balance atomically, including concurrent reviewers.
CREATE TRIGGER rent_independent_reviewer_guard BEFORE INSERT ON rent_external_verifications
 WHEN (SELECT recorded_by FROM rent_external_money_records WHERE id=NEW.record_id)=NEW.reviewed_by
 BEGIN SELECT RAISE(ABORT,'RENT_REVIEWER_MUST_DIFFER'); END;
CREATE TRIGGER rent_disbursement_balance_guard BEFORE INSERT ON rent_external_verifications
 WHEN (SELECT kind FROM rent_external_money_records WHERE id=NEW.record_id)='owner_disbursement_external'
  AND (
   COALESCE((SELECT SUM(e.amount_cents) FROM rent_external_money_records e
    JOIN rent_external_verifications v ON v.record_id=e.id
    WHERE e.plan_id=(SELECT plan_id FROM rent_external_money_records WHERE id=NEW.record_id)
      AND e.kind='rent_received_external'),0)
   - COALESCE((SELECT SUM(e.amount_cents) FROM rent_external_money_records e
    JOIN rent_external_verifications v ON v.record_id=e.id
    WHERE e.plan_id=(SELECT plan_id FROM rent_external_money_records WHERE id=NEW.record_id)
      AND e.kind='owner_disbursement_external'),0)
   < (SELECT amount_cents FROM rent_external_money_records WHERE id=NEW.record_id)
  )
 BEGIN SELECT RAISE(ABORT,'RENT_EXTERNAL_RECONCILIATION_EXCESS'); END;

-- Always require a second human for restricted Form 2 worksheet review.
CREATE TRIGGER restricted_form2_independent_review BEFORE INSERT ON restricted_form2_reviews
 WHEN NEW.reviewer_id=(SELECT prepared_by FROM restricted_form2_preparations WHERE id=NEW.preparation_id)
 BEGIN SELECT RAISE(ABORT,'FORM2_INDEPENDENT_REVIEW_REQUIRED'); END;
