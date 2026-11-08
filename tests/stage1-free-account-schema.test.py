"""Stage 1 account-first production-migration rehearsal. Pure local SQLite fixtures."""
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1]
PATHS = sorted((ROOT / 'database/migrations').glob('*.sql'))

class AccountFirstSchema(unittest.TestCase):
    def test_legacy_property_snapshot_and_future_free_registration(self):
        self.assertEqual(len(PATHS), 53)
        self.assertEqual(PATHS[-1].name, '0053_account_first_free_registration.sql')
        db = sqlite3.connect(':memory:')
        db.execute('PRAGMA foreign_keys=ON')
        try:
            for path in PATHS[:-1]:
                db.executescript(path.read_text())
            db.execute("INSERT INTO users(id,email,verified_at,created_at) VALUES('legacy_user','legacy@example.test','2026-10-01','2026-10-01')")
            db.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('legacy','Historic owner','landlord','2026-10-01')")
            db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('p_old','1 Test Road','Perth','6000','1-test-road','residential','2026-10-01')")
            db.execute("INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES('l_old','legacy','p_old','owner','2026-10-01')")
            self.assertEqual(db.execute("SELECT plan_code FROM subscriptions WHERE client_id='legacy'").fetchone()[0], 'all_inclusive')
            before = db.execute("SELECT id,client_id,property_id,plan_code,status,allowance_json FROM subscriptions ORDER BY id").fetchall()

            db.executescript(PATHS[-1].read_text())

            self.assertEqual(db.execute("SELECT id,client_id,property_id,plan_code,status,allowance_json FROM subscriptions ORDER BY id").fetchall(), before)
            self.assertEqual(db.execute("SELECT client_id,property_id FROM legacy_included_property_grants").fetchall(), [('legacy','p_old')])
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("DELETE FROM legacy_included_property_grants WHERE client_id='legacy'")

            db.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('fresh','Free customer','landlord','2026-11-08')")
            self.assertIsNone(db.execute("SELECT id FROM subscriptions WHERE client_id='fresh'").fetchone())
            self.assertIsNone(db.execute("SELECT id FROM billing_accounts WHERE client_id='fresh'").fetchone())
            db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('p_new','2 Test Road','Perth','6000','2-test-road','residential','2026-11-08')")
            db.execute("INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES('l_new','legacy','p_new','owner','2026-11-08')")
            self.assertIsNone(db.execute("SELECT 1 FROM legacy_included_property_grants WHERE property_id='p_new'").fetchone())
            self.assertIsNone(db.execute("SELECT 1 FROM residential_paid_property_enrollments WHERE property_id='p_new'").fetchone())
            db.execute("INSERT INTO account_subscription_preferences(client_id,updated_at) VALUES('fresh','2026-11-08')")
            self.assertEqual(db.execute("SELECT account_state,subscription_intent FROM account_subscription_preferences WHERE client_id='fresh'").fetchone(), ('registered','none'))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("INSERT INTO account_subscription_preferences(client_id,subscription_intent,updated_at) VALUES('legacy','subscribed','2026-11-08')")
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(),[])
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], 'ok')
        finally:
            db.close()

if __name__ == '__main__':
    unittest.main()
