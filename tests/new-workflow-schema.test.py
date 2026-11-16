"""Additive 0059/0060 schema constraints. Synthetic local records only."""
from pathlib import Path
import sqlite3
import unittest

MIGRATIONS=sorted((Path(__file__).resolve().parents[1]/'database/migrations').glob('[0-9][0-9][0-9][0-9]_*.sql'))

class NewWorkflowSchema(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in MIGRATIONS:
            self.db.executescript(migration.read_text())
        self.db.execute("INSERT INTO users(id,email,created_at) VALUES('u','local@example.invalid','2026-11-01')")
        self.db.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('c','Local owner','landlord','2026-11-01')")
        self.db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('p','79 Local Street','Perth','6000','new-workflow-79','residential','2026-11-01')")
        self.db.execute("INSERT INTO tenancies(id,property_id,status,starts_at) VALUES('t','p','active','2026-11-01')")
        self.db.execute("INSERT INTO co_living_sites VALUES('p','room','u','2026-11-01')")
        self.db.execute("INSERT INTO co_living_spaces(id,property_id,label,space_type,created_by,created_at) VALUES('room','p','Room 1','room','u','2026-11-01')")
        self.db.execute("INSERT INTO co_living_spaces(id,property_id,label,space_type,created_by,created_at) VALUES('common','p','Kitchen','shared_area','u','2026-11-01')")
        self.db.execute("INSERT INTO co_living_occupancies VALUES('t','room','u','2026-11-01')")
    def tearDown(self):
        self.db.close()
    def test_migration_sequential_and_non_destructive(self):
        self.assertGreaterEqual(len(MIGRATIONS),60)
        self.assertTrue(all(m.name.startswith(f'{i:04d}_') for i,m in enumerate(MIGRATIONS,start=1)))
        self.assertEqual(MIGRATIONS[58].name,'0059_registered_workflows_and_preferences.sql')
        self.assertEqual(MIGRATIONS[59].name,'0060_finance_reviews_and_photo_annotations.sql')
        self.assertEqual(self.db.execute("SELECT id FROM tenancies WHERE id='t'").fetchone(),('t',))
        self.assertEqual(self.db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
    def test_explicit_user_preference_constraints(self):
        self.db.execute("INSERT INTO user_portal_preferences VALUES('u','residential','compact','co-living','2026-11-16')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE user_portal_preferences SET landing_section='admin' WHERE user_id='u'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO user_portal_preferences VALUES('u','resident','developer','overview','2026-11-16')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO user_portal_preferences VALUES('missing','resident','compact','overview','2026-11-16')")
    def test_room_terms_and_shared_area_report_guards(self):
        self.db.execute("INSERT INTO co_living_lease_terms(tenancy_id,rent_cents,rent_period,expected_bond_cents,utility_basis,source_reference,updated_by,updated_at) VALUES('t',35000,'weekly',70000,'equal_share','SYNTHETIC-TERMS','u','2026-11-16')")
        self.db.execute("INSERT INTO co_living_occupancy_events VALUES('event','t','check_in','2026-11-16','SYNTHETIC-REF','local-encrypted-placeholder','u','2026-11-16')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE co_living_lease_terms SET rent_cents=-1 WHERE tenancy_id='t'")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'CO_LIVING_SHARED_AREA_REQUIRED'):
            self.db.execute("INSERT INTO co_living_area_inspections(id,property_id,space_id,inspected_at,summary_envelope,created_by,created_at,updated_at) VALUES('bad','p','room','2026-11-16','cipher','u','2026-11-16','2026-11-16')")
        self.db.execute("INSERT INTO co_living_area_inspections(id,property_id,space_id,inspected_at,summary_envelope,created_by,created_at,updated_at) VALUES('good','p','common','2026-11-16','cipher','u','2026-11-16','2026-11-16')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE co_living_area_inspections SET status='published' WHERE id='good'")
        self.db.execute("UPDATE co_living_area_inspections SET status='published',public_summary='Reviewed shared space only',reviewed_by='u' WHERE id='good'")
    def test_amenity_approval_never_double_books(self):
        self.db.execute("INSERT INTO strata_schemes(id,name,created_at) VALUES('s','Local scheme','2026-11-01')")
        self.db.execute("INSERT INTO strata_amenities(id,scheme_id,name,created_by,created_at) VALUES('a','s','Meeting room','u','2026-11-16')")
        for i in ['r1','r2']:
            self.db.execute("INSERT INTO strata_amenity_requests(id,amenity_id,requester_id,starts_at,ends_at,created_at,updated_at) VALUES(?,'a','u','2026-12-01T10:00:00Z','2026-12-01T11:00:00Z','2026-11-16','2026-11-16')",(i,))
        self.db.execute("UPDATE strata_amenity_requests SET status='approved' WHERE id='r1'")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'AMENITY_SLOT_CONFLICT'):
            self.db.execute("UPDATE strata_amenity_requests SET status='approved' WHERE id='r2'")
    def test_credit_bank_and_annotation_require_real_source_ids(self):
        for table in ['invoice_credit_proposals','bank_reconciliation_observations','report_photo_annotations']:
            self.assertTrue(self.db.execute("SELECT name FROM sqlite_master WHERE name=?",(table,)).fetchone())
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO bank_reconciliation_observations(id,payment_id,observed_amount_cents,observation_type,source_reference,request_key,requested_by,created_at) VALUES('bad','missing',300,'bank_received','SYNTHETIC-REF','SYNTHETIC-KEY-12345','u','2026-11-16')")
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

if __name__=='__main__':
    unittest.main()
