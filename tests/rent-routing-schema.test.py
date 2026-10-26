"""Real SQLite 26-to-27 addition and zero-custody financial safety invariants."""
import pathlib, sqlite3, unittest

class RentPlanningSchema(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in sorted(pathlib.Path('database/migrations').glob('*.sql')):
            self.db.executescript(migration.read_text())
        for ident in ['owner','tenant','staff','other']:
            self.db.execute('INSERT INTO users(id,email,created_at) VALUES(?,?,?)',
                (ident,f'{ident}@example.test','2026-10-25'))
        for sector in ['residential','commercial']:
            self.db.execute('INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES(?,?,?,?,?,?,?)',
                (sector,'30 Synthetic Street','Perth','6000',sector,sector,'2026-10-25'))
            self.db.execute('INSERT INTO tenancies(id,property_id,status,starts_at) VALUES(?,?,?,?)',
                (sector,sector,'active','2026-10-01'))
        self.db.execute('INSERT INTO restricted_form_cases(id,applicant_user_id,tenancy_id,envelope,created_at) VALUES(?,?,?,?,?)',
                        ('case','tenant','residential','encrypted-case','2026-10-25'))

    def tearDown(self): self.db.close()

    def plan(self, ident='plan', tenancy='residential', mode='agency_managed', route='agency_trust_external'):
        self.db.execute('INSERT INTO rent_route_plans(id,tenancy_id,property_id,manager_mode,route,amount_cents,frequency,policy_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
            (ident,tenancy,tenancy,mode,route,42000,'weekly','WA_RENT_ROUTING_OCT_2026','owner','2026-10-25'))

    def record(self, ident,kind,amount):
        self.db.execute('INSERT INTO rent_external_money_records(id,plan_id,kind,amount_cents,source,external_reference,effective_at,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
            (ident,'plan',kind,amount,'agency_trust_statement','BANK-'+ident,'2026-10-25T03:00:00Z','owner','2026-10-25'))

    def verify(self, ident, reviewer='staff'):
        self.db.execute('INSERT INTO rent_external_verifications(id,record_id,reviewed_by,evidence_kind,external_evidence_reference,reviewed_at) VALUES(?,?,?,?,?,?)',
            ('review-'+ident,ident,reviewer,'official_trust_ledger','INDEP-'+ident,'2026-10-25'))

    def test_invalid_money_routes_and_commercial_denial(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.plan('wrong-agency',mode='agency_managed',route='landlord_connect_candidate')
        with self.assertRaises(sqlite3.IntegrityError):
            self.plan('wrong-landlord',mode='self_managed',route='agency_trust_external')
        with self.assertRaises(sqlite3.IntegrityError):
            self.plan('commercial',tenancy='commercial')
        self.plan()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE rent_route_plans SET amount_cents=1 WHERE id='plan'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM rent_route_plans WHERE id='plan'")

    def test_external_record_is_unverified_until_separate_reviewer(self):
        self.plan()
        self.record('received','rent_received_external',42000)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM rent_external_verifications').fetchone()[0],0)
        with self.assertRaises(sqlite3.IntegrityError): self.verify('received','owner')
        self.verify('received')
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM rent_external_verifications WHERE record_id='received'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE rent_external_money_records SET amount_cents=1 WHERE id='received'")

    def test_disbursement_guard_never_exceeds_independently_verified_external_receipts(self):
        self.plan()
        self.record('received','rent_received_external',42000)
        self.record('disbursed','owner_disbursement_external',43000)
        with self.assertRaises(sqlite3.IntegrityError):self.verify('disbursed')
        self.verify('received')
        with self.assertRaises(sqlite3.IntegrityError):self.verify('disbursed')
        self.record('disbursed-ok','owner_disbursement_external',41000)
        self.verify('disbursed-ok')
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM rent_external_verifications").fetchone()[0],2)
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_confidential_form2_requires_residential_case_and_independent_review(self):
        self.db.execute('INSERT INTO restricted_form2_preparations(id,case_id,encrypted_worksheet,prepared_by,created_at) VALUES(?,?,?,?,?)',
            ('prep','case','ciphertext','staff','2026-10-25'))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO restricted_form2_reviews(id,preparation_id,reviewer_id,outcome,reviewed_at) VALUES('bad','prep','staff','reviewed_for_manual_handling','2026-10-25')")
        self.db.execute("INSERT INTO restricted_form2_reviews(id,preparation_id,reviewer_id,outcome,reviewed_at) VALUES('ok','prep','other','reviewed_for_manual_handling','2026-10-25')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM restricted_form2_preparations WHERE id='prep'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE restricted_form2_reviews SET outcome='requires_revision' WHERE id='ok'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO restricted_form_cases(id,applicant_user_id,tenancy_id,envelope,created_at) VALUES('commercial-case','tenant','commercial','cipher','2026-10-25')")
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

if __name__=='__main__':unittest.main()
