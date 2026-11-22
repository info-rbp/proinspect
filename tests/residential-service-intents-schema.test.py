"""Additive Residential add-on and confidential request-intake schema invariants."""
from pathlib import Path
import sqlite3
import unittest

SQL = (Path(__file__).resolve().parents[1]/'database/migrations'/
       '0065_residential_service_intents.sql').read_text()

def db():
    c=sqlite3.connect(':memory:')
    c.execute('PRAGMA foreign_keys=ON')
    c.executescript('''
      CREATE TABLE bookings(id TEXT PRIMARY KEY);
      CREATE TABLE requests(id TEXT PRIMARY KEY);
      CREATE TABLE users(id TEXT PRIMARY KEY);
      CREATE TABLE services(id TEXT PRIMARY KEY,name TEXT,family TEXT,sectors_json TEXT,summary TEXT,
        duration_minutes INTEGER,buffer_before INTEGER,buffer_after INTEGER,notice_hours INTEGER,
        horizon_days INTEGER,price_ex_gst_cents INTEGER,booking_mode TEXT,active INTEGER);
      CREATE TABLE payments(id TEXT PRIMARY KEY,total_cents INTEGER);
      INSERT INTO bookings VALUES('bkg_test');
      INSERT INTO requests VALUES('req_test');
      INSERT INTO users VALUES('staff_test');
    ''')
    c.executescript(SQL)
    return c

class ServiceIntentSchemaTests(unittest.TestCase):
    def test_new_service_rows_are_request_only_and_unpriced(self):
        c=db()
        rows=c.execute("SELECT booking_mode,price_ex_gst_cents FROM services").fetchall()
        self.assertEqual(len(rows),16)
        self.assertTrue(all(mode=='request' and price is None for mode,price in rows))
    def test_addon_requested_without_any_payment(self):
        c=db()
        c.execute("""INSERT INTO booking_service_addon_intents
          (booking_id,addon_code,source_fee_candidate_ex_gst_cents,created_at)
          VALUES('bkg_test','inventory_with_pcr',15000,'2026-11-22')""")
        self.assertEqual(c.execute('SELECT status FROM booking_service_addon_intents').fetchone()[0],'requested')
        self.assertEqual(c.execute('SELECT COUNT(*) FROM payments').fetchone()[0],0)
        for code in ['inventory_with_pcr','form19_service','tenant_attendance_coordination']:
            self.assertIn(code,SQL)
    def test_no_invalid_addon_or_duplicates(self):
        c=db()
        c.execute("""INSERT INTO booking_service_addon_intents
          (booking_id,addon_code,source_fee_candidate_ex_gst_cents,created_at)
          VALUES('bkg_test','form19_service',4000,'2026-11-22')""")
        with self.assertRaises(sqlite3.IntegrityError):
            c.execute("""INSERT INTO booking_service_addon_intents
              (booking_id,addon_code,source_fee_candidate_ex_gst_cents,created_at)
              VALUES('bkg_test','form19_service',4000,'2026-11-22')""")
        with self.assertRaises(sqlite3.IntegrityError):
            c.execute("""INSERT INTO booking_service_addon_intents
              (booking_id,addon_code,source_fee_candidate_ex_gst_cents,created_at)
              VALUES('bkg_test','unapproved_charge',4000,'2026-11-22')""")
        with self.assertRaises(sqlite3.IntegrityError):
            c.execute("""INSERT INTO booking_service_addon_intents
              (booking_id,addon_code,source_fee_candidate_ex_gst_cents,created_at)
              VALUES('bkg_test','tenant_attendance_coordination',-1,'2026-11-22')""")
        with self.assertRaises(sqlite3.IntegrityError):
            c.execute("""UPDATE booking_service_addon_intents SET status='scope_accepted'
              WHERE addon_code='form19_service'""")
        c.execute("""UPDATE booking_service_addon_intents
          SET status='scope_accepted',reviewed_by='staff_test',reviewed_at='2026-11-22'
          WHERE addon_code='form19_service'""")
        self.assertEqual(c.execute('SELECT status FROM booking_service_addon_intents').fetchone()[0],
          'scope_accepted')
        self.assertEqual(c.execute('SELECT COUNT(*) FROM payments').fetchone()[0],0)
    def test_encrypted_intake_stays_property_request_scoped(self):
        c=db()
        c.execute("""INSERT INTO request_service_intakes
         (request_id,service_kind,encrypted_envelope,created_at)
         VALUES('req_test','open-home','encrypted-envelope','2026-11-22')""")
        self.assertEqual(c.execute(
          'SELECT service_kind FROM request_service_intakes WHERE request_id=?',('req_test',)
          ).fetchone()[0],'open-home')
        with self.assertRaises(sqlite3.IntegrityError):
            c.execute("""INSERT INTO request_service_intakes
              (request_id,service_kind,encrypted_envelope,created_at)
              VALUES('missing','insurance','encrypted-envelope','2026-11-22')""")
        self.assertEqual(c.execute('PRAGMA foreign_key_check').fetchall(),[])
if __name__=='__main__':
    unittest.main()
