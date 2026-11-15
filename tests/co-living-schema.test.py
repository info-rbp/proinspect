"""Additive co-living migration rehearsal and database isolation invariants."""
from pathlib import Path
import sqlite3
import unittest

ROOT=Path(__file__).resolve().parents[1]
MIGRATIONS=sorted((ROOT/'database/migrations').glob('*.sql'))

class CoLivingSchema(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for path in MIGRATIONS:
            self.db.executescript(path.read_text())
        self.db.execute("INSERT INTO users(id,email,created_at) VALUES('u','verified@example.test','2026-11-01')")
        self.db.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('c','Example Landlord','landlord','2026-11-01')")
        for identity,sector in [('p','residential'),('q','commercial')]:
            self.db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES(?,?,?,?,?,?,?)",
              (identity,identity+' Example Street','Perth','6000',identity+'-unique',sector,'2026-11-01'))
    def tearDown(self):
        self.db.close()
    def test_residential_only_mode_and_immutable_room_allocation(self):
        with self.assertRaisesRegex(sqlite3.IntegrityError,'CO_LIVING_RESIDENTIAL_ONLY'):
            self.db.execute("INSERT INTO co_living_sites VALUES('q','room','u','2026-11-01')")
        self.db.execute("INSERT INTO co_living_sites VALUES('p','room','u','2026-11-01')")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'CO_LIVING_SPACE_MODE'):
            self.db.execute("INSERT INTO co_living_spaces(id,property_id,label,space_type,created_by,created_at) VALUES('bad','p','Bed A','bed','u','2026-11-01')")
        for ident,label,kind in [('r1','Room 1','room'),('r2','Room 2','room'),('shared','Shared kitchen','shared_area')]:
            self.db.execute("INSERT INTO co_living_spaces(id,property_id,label,space_type,created_by,created_at) VALUES(?,?,?,?,?,?)",
                (ident,'p',label,kind,'u','2026-11-01'))
        for ident,start,end in [('t1','2026-11-01','2026-12-01'),('t2','2026-11-15','2026-12-15'),('t3','2026-12-01',None)]:
            self.db.execute("INSERT INTO tenancies(id,property_id,status,starts_at,ends_at) VALUES(?,'p','active',?,?)",(ident,start,end))
        self.db.execute("INSERT INTO co_living_occupancies VALUES('t1','r1','u','2026-11-01')")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'CO_LIVING_OCCUPANCY_CONFLICT'):
            self.db.execute("INSERT INTO co_living_occupancies VALUES('t2','r1','u','2026-11-15')")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'CO_LIVING_SPACE_NOT_PRIVATE'):
            self.db.execute("INSERT INTO co_living_occupancies VALUES('t2','shared','u','2026-11-15')")
        self.db.execute("INSERT INTO co_living_occupancies VALUES('t2','r2','u','2026-11-15')")
        self.db.execute("INSERT INTO co_living_occupancies VALUES('t3','r1','u','2026-12-01')")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'CO_LIVING_OCCUPANCY_IMMUTABLE'):
            self.db.execute("UPDATE co_living_occupancies SET space_id='r2' WHERE tenancy_id='t3'")
        self.db.execute("INSERT INTO account_experience_tags VALUES('c','co_living','u','2026-11-01')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO account_experience_tags VALUES('c','made_up_entitlement','u','2026-11-01')")
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(),[])
    def test_request_space_foreign_keys_and_historical_data_survive_additive_migration(self):
        self.db.execute("INSERT INTO co_living_sites VALUES('p','bed','u','2026-11-01')")
        self.db.execute("INSERT INTO co_living_spaces(id,property_id,label,space_type,created_by,created_at) VALUES('bed1','p','Bed 1','bed','u','2026-11-01')")
        self.db.execute("INSERT INTO requests(id,reference,property_id,created_by,source,category,title,details,priority,co_living_space_id,created_at,updated_at) VALUES('req','REQ-01','p','u','tenant','maintenance','Sink leak','Water leaking under sink','routine','bed1','2026-11-01','2026-11-01')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE requests SET co_living_space_id='missing' WHERE id='req'")
        self.assertEqual(self.db.execute("SELECT co_living_space_id FROM requests WHERE id='req'").fetchone(),('bed1',))
        self.assertEqual(self.db.execute("PRAGMA integrity_check").fetchone()[0],'ok')

if __name__=='__main__':
    unittest.main()
