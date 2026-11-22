"""Co-Living property onboarding is an additive, independently reviewed workflow."""
from pathlib import Path
import sqlite3, unittest

ROOT=Path(__file__).resolve().parents[1]
MIGRATIONS=sorted((ROOT/'database/migrations').glob('*.sql'))

class CoLivingOnboardingSchema(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for path in MIGRATIONS:
            self.db.executescript(path.read_text())
        for uid in ('owner','writer','reviewer'):
            self.db.execute("INSERT INTO users(id,email,created_at) VALUES(?,?,?)",
                            (uid,uid+'@example.test','2026-11-22'))
        self.db.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('cl','Owner','landlord','2026-11-22')")
        for pid,sector in [('p','residential'),('bad','commercial')]:
            self.db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES(?,?,?,?,?,?,?)",
                            (pid,pid+' Example Street','Perth','6000',pid+'-unique',sector,'2026-11-22'))
        self.db.execute("INSERT INTO co_living_onboarding_projects(id,property_id,client_id,objectives,created_by,created_at,updated_at) VALUES('prj','p','cl','Prepare a six room shared property','owner','2026-11-22','2026-11-22')")
    def tearDown(self): self.db.close()

    def test_non_residential_properties_rejected_and_active_property_unique(self):
        with self.assertRaisesRegex(sqlite3.IntegrityError,'CO_LIVING_RESIDENTIAL_ONLY'):
            self.db.execute("INSERT INTO co_living_onboarding_projects(id,property_id,client_id,objectives,created_by,created_at,updated_at) VALUES('badprj','bad','cl','Make commercial shared house','owner','2026-11-22','2026-11-22')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO co_living_onboarding_projects(id,property_id,client_id,objectives,created_by,created_at,updated_at) VALUES('dup','p','cl','Duplicate active onboarding','owner','2026-11-22','2026-11-22')")
        self.db.execute("UPDATE co_living_onboarding_projects SET status='withdrawn' WHERE id='prj'")
        self.db.execute("INSERT INTO co_living_onboarding_projects(id,property_id,client_id,objectives,created_by,created_at,updated_at) VALUES('restarted','p','cl','New authorised request','owner','2026-11-22','2026-11-22')")

    def test_assessment_requires_second_reviewer(self):
        self.db.execute("""INSERT INTO co_living_onboarding_assessments
        (project_id,summary,internal_notes_envelope,proposed_rooms,evidence_reference,updated_by,updated_at)
        VALUES('prj','Reviewed internal assessment','encrypted-envelope-placeholder-test',6,'site-report-2026-11','writer','2026-11-22')""")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'INDEPENDENT_REVIEW_REQUIRED'):
            self.db.execute("UPDATE co_living_onboarding_assessments SET status='reviewed',reviewed_by='writer' WHERE project_id='prj'")
        self.db.execute("UPDATE co_living_onboarding_assessments SET status='reviewed',reviewed_by='reviewer' WHERE project_id='prj'")
        self.assertEqual(self.db.execute("SELECT status FROM co_living_onboarding_assessments").fetchone(),('reviewed',))

    def test_proposal_immutable_and_independent_issue(self):
        self.db.execute("""INSERT INTO co_living_onboarding_proposals
        (id,project_id,version,traditional_weekly_cents,room_weekly_cents,parking_weekly_cents,
         furnishing_budget_cents,works_budget_cents,assumptions,agreement_version,document_reference,
         created_by,created_at)
        VALUES('prop','prj',1,89000,205000,5000,2702500,0,
          'Illustrative six room rent assumptions','coliving-v1','reviewed-proposal-reference','writer','2026-11-22')""")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'INDEPENDENT_REVIEW_REQUIRED'):
            self.db.execute("UPDATE co_living_onboarding_proposals SET status='issued',reviewed_by='writer' WHERE id='prop'")
        self.db.execute("UPDATE co_living_onboarding_proposals SET status='issued',reviewed_by='reviewer' WHERE id='prop'")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'PROPOSAL_IMMUTABLE'):
            self.db.execute("UPDATE co_living_onboarding_proposals SET room_weekly_cents=210000 WHERE id='prop'")
        self.db.execute("""INSERT INTO co_living_onboarding_decisions
        (id,proposal_id,project_id,proposal_version,decision,note,actor_id,decided_at)
        VALUES('dec','prop','prj',1,'approved','Approved plan','owner','2026-11-22')""")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'DECISION_IMMUTABLE'):
            self.db.execute("UPDATE co_living_onboarding_decisions SET decision='declined' WHERE id='dec'")

    def test_financial_spend_cannot_exceed_owner_approved_budget_even_in_direct_sql(self):
        self.db.execute("""INSERT INTO co_living_onboarding_proposals
        (id,project_id,version,status,traditional_weekly_cents,room_weekly_cents,parking_weekly_cents,
         furnishing_budget_cents,works_budget_cents,assumptions,agreement_version,document_reference,
         created_by,created_at)
        VALUES('spendprop','prj',1,'accepted',89000,205000,5000,100000,0,
          'Illustrative low capital ceiling','coliving-v1','reviewed-owner-proposal','writer','2026-11-22')""")
        self.db.execute("""INSERT INTO co_living_onboarding_items
        (id,project_id,space_label,item_name,supplier,quantity,unit_cost_cents,updated_by,created_at,updated_at)
        VALUES('bed','prj','Bedroom 1','Bedframe','IKEA',1,110000,'writer','2026-11-22','2026-11-22')""")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'BUDGET_APPROVAL_REQUIRED'):
            self.db.execute("UPDATE co_living_onboarding_items SET status='ordered' WHERE id='bed'")
        self.db.execute("""INSERT INTO co_living_onboarding_variations
        (id,project_id,description,extra_budget_cents,status,requested_by,created_at)
        VALUES('extra','prj','Owner approved higher spend',25000,'approved','writer','2026-11-22')""")
        self.db.execute("UPDATE co_living_onboarding_items SET status='ordered' WHERE id='bed'")
        self.assertEqual(self.db.execute("SELECT status FROM co_living_onboarding_items WHERE id='bed'").fetchone(),('ordered',))

    def test_readiness_check_cannot_self_verify(self):
        self.db.execute("""INSERT INTO co_living_onboarding_checks
        (project_id,code,stage,status,evidence_reference,submitted_by,submitted_at)
        VALUES('prj','room_use_approved','implementation','submitted','external-approval-evidence','writer','2026-11-22')""")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'INDEPENDENT_REVIEW_REQUIRED'):
            self.db.execute("UPDATE co_living_onboarding_checks SET status='verified',reviewed_by='writer' WHERE project_id='prj'")
        self.db.execute("UPDATE co_living_onboarding_checks SET status='verified',reviewed_by='reviewer' WHERE project_id='prj'")
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
        self.assertEqual(self.db.execute('PRAGMA integrity_check').fetchone()[0],'ok')

if __name__=='__main__': unittest.main()
