"""Isolated schema smoke tests for the additive Cash Client booking migration."""
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "database" / "migrations" / "0064_direct_inspection_booking_cash_terms.sql"


def db():
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript("""
    CREATE TABLE clients(id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE users(id TEXT PRIMARY KEY);
    CREATE TABLE bookings(id TEXT PRIMARY KEY);
    CREATE TABLE payments(id TEXT PRIMARY KEY);
    CREATE TABLE services(id TEXT PRIMARY KEY, price_ex_gst_cents INTEGER, booking_mode TEXT);
    INSERT INTO users VALUES('requester'),('reviewer');
    INSERT INTO clients VALUES('cli_cash','active');
    INSERT INTO bookings VALUES('bkg_a'),('bkg_b');
    INSERT INTO payments VALUES('pay_a'),('pay_b');
    INSERT INTO services VALUES('property-condition-report',NULL,'request');
    INSERT INTO services VALUES('final-exit-inspection',NULL,'request');
    INSERT INTO services VALUES('routine-inspection',NULL,'request');
    INSERT INTO services VALUES('already-approved',19900,'instant');
    """)
    conn.executescript(MIGRATION.read_text())
    return conn


class CashBookingSchemaTests(unittest.TestCase):
    def test_source_prices_and_other_services(self):
        conn = db()
        rows = conn.execute("SELECT id,price_ex_gst_cents,booking_mode FROM services ORDER BY id").fetchall()
        self.assertIn(("property-condition-report", 20000, "instant"), rows)
        self.assertIn(("final-exit-inspection", 10000, "instant"), rows)
        self.assertIn(("routine-inspection", 6000, "instant"), rows)
        self.assertIn(("already-approved", 19900, "instant"), rows)

    def test_single_pending_decision_and_separate_effective_terms(self):
        conn = db()
        conn.execute("""INSERT INTO cash_payment_term_requests
        (id,client_id,term_code,credit_limit_cents,reason,status,requested_by,created_at)
        VALUES('ctr_1','cli_cash','net_7',50000,'Reviewed request','pending','requester','2026-11-21')""")
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute("""INSERT INTO cash_payment_term_requests
            (id,client_id,term_code,reason,status,requested_by,created_at)
            VALUES('ctr_2','cli_cash','eom_7','Duplicate pending','pending','requester','2026-11-21')""")
        self.assertEqual(conn.execute(
            "SELECT COUNT(*) FROM cash_client_terms WHERE client_id='cli_cash'"
        ).fetchone()[0], 0)
        conn.execute("""UPDATE cash_payment_term_requests SET status='approved',
        reviewed_by='reviewer' WHERE id='ctr_1'""")
        conn.execute("""INSERT INTO cash_client_terms
        (client_id,term_code,credit_limit_cents,source_request_id,approved_by,approved_at)
        VALUES('cli_cash','net_7',50000,'ctr_1','reviewer','2026-11-21')""")
        self.assertEqual(conn.execute(
            "SELECT term_code FROM cash_client_terms WHERE client_id='cli_cash'"
        ).fetchone()[0], "net_7")

    def test_invoice_line_link_cannot_be_double_billed(self):
        conn = db()
        conn.execute("""INSERT INTO cash_invoice_batches
        (id,client_id,term_code,period,subtotal_cents,gst_cents,total_cents,status,prepared_by,created_at)
        VALUES('cin_1','cli_cash','net_7','booking:bkg_a',10000,1000,11000,'prepared','requester','2026-11-21')""")
        conn.execute("""INSERT INTO cash_invoice_batches
        (id,client_id,term_code,period,subtotal_cents,gst_cents,total_cents,status,prepared_by,created_at)
        VALUES('cin_2','cli_cash','net_7','booking:bkg_b',10000,1000,11000,'prepared','reviewer','2026-11-21')""")
        conn.execute("INSERT INTO cash_invoice_items VALUES('bkg_a','cin_1')")
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO cash_invoice_items VALUES('bkg_a','cin_2')")


if __name__ == "__main__":
    unittest.main()
