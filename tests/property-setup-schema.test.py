"""Residential property profile migration, tenancy-history and isolation tests."""
from pathlib import Path
import sqlite3
import unittest

MIGRATIONS=sorted((Path(__file__).resolve().parents[1]/'database/migrations').glob('*.sql'))

class ResidentialPropertySetupSchema(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for path in MIGRATIONS:
            self.db.executescript(path.read_text())
        self.db.execute("INSERT INTO users(id,email,created_at) VALUES('owner','owner@example.test','2026-11-01')")
        self.db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('p','20 Sample Road','Perth','6000','sample-20','residential','2026-11-01')")
    def tearDown(self):
        self.db.close()
    def profile(self,ensuites=1,bathrooms=2,parking=2):
        return ("INSERT INTO residential_property_profiles(property_id,bedrooms,bathrooms,ensuites,separate_toilets,car_spaces,furnishing,notes_envelope,updated_by,updated_at) VALUES('p',4,?,?,?,?,?,'{encrypted}','owner','2026-11-01')",
            (bathrooms,ensuites,1,parking,'part_furnished'))
    def snapshot(self,identity,status='tenanted',current=1):
        self.db.execute("""INSERT INTO residential_property_tenancy_snapshots
        (id,property_id,occupancy_status,lease_type,starts_on,ends_on,
         tenants_envelope,tenant_count,fingerprint,is_current,recorded_by,recorded_at)
        VALUES(?,'p',?,'fixed','2026-11-01','2027-11-01',
         '{"v":1,"ciphertext":"encrypted"}',2,?,?,'owner','2026-11-01')""",
         (identity,status,identity,current))
    def test_profile_room_totals_and_parking_are_bounded(self):
        sql,values=self.profile()
        self.db.execute(sql,values)
        self.assertEqual(self.db.execute(
            'SELECT bedrooms,bathrooms,ensuites,car_spaces FROM residential_property_profiles'
            ).fetchone(),(4,2,1,2))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('UPDATE residential_property_profiles SET ensuites=3')
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('UPDATE residential_property_profiles SET car_spaces=-1')
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE residential_property_profiles SET furnishing='secret_category'")
        self.assertEqual(self.db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
    def test_current_tenancy_is_unique_and_history_is_preserved(self):
        self.snapshot('s1')
        with self.assertRaises(sqlite3.IntegrityError):
            self.snapshot('s2')
        self.db.execute("UPDATE residential_property_tenancy_snapshots SET is_current=0 WHERE id='s1'")
        self.snapshot('s2')
        self.assertEqual(self.db.execute(
            'SELECT id,is_current FROM residential_property_tenancy_snapshots ORDER BY id'
            ).fetchall(),[('s1',0),('s2',1)])
    def test_vacant_properties_must_not_have_contacts_or_a_lease(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.snapshot('bad',status='vacant')
        self.db.execute("""INSERT INTO residential_property_tenancy_snapshots
          (id,property_id,occupancy_status,tenant_count,fingerprint,recorded_by,recorded_at)
          VALUES('empty','p','vacant',0,'empty-fingerprint','owner','2026-11-01')""")
        self.assertEqual(self.db.execute('SELECT lease_type,tenants_envelope FROM residential_property_tenancy_snapshots').fetchone(),(None,None))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM invitations').fetchone()[0],0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM tenancy_memberships').fetchone()[0],0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM account_subscription_preferences').fetchone()[0],0)
    def test_missing_property_or_user_cannot_be_linked(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""INSERT INTO residential_property_profiles
              (property_id,bedrooms,bathrooms,ensuites,separate_toilets,car_spaces,
              furnishing,updated_by,updated_at)
              VALUES('not-owned',1,1,0,0,0,'unknown','owner','2026-11-01')""")
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

if __name__=='__main__':
    unittest.main()
