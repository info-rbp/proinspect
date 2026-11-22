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
    def test_candidate_prices_do_not_activate_direct_booking(self):
        conn = db()
        # Applying the migration alone must not approve prices or switch the
        # public catalogue from request/quote to instant paid appointments.
        rows = conn.execute(
            "SELECT id,price_ex_gst_cents,booking_mode FROM services ORDER BY id"
        ).fetchall()
        self.assertIn(("property-condition-report", None, "request"), rows)
        self.assertIn(("final-exit-inspection", None, "request"), rows)
        self.assertIn(("routine-inspection", None, "request"), rows)
        self.assertIn(("already-approved", 19900, "instant"), rows)
        candidates = conn.execute(
            "SELECT service_id,candidate_ex_gst_cents,review_status "
            "FROM inspection_price_candidates ORDER BY service_id"
        ).fetchall()
        self.assertEqual(candidates, [
            ("final-exit-inspection", 10000, "pending_review"),
            ("property-condition-report", 20000, "pending_review"),
            ("routine-inspection", 6000, "pending_review"),
        ])
        self.assertFalse(any(row[0] == "already-approved" for row in candidates))

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

    def test_credit_limits_are_enforced_even_without_api_validation(self):
        # The D1 database must reject unsafe finance writes independently of
        # the route guard and application-level Zod checks.
        for term, limit in [('net_7', None), ('eom_7', 0),
                            ('net_7', -10), ('eom_7', 100000001)]:
            conn = db()
            with self.subTest(term=term, limit=limit):
                with self.assertRaises(sqlite3.IntegrityError):
                    conn.execute("""INSERT INTO cash_payment_term_requests
                        (id,client_id,term_code,credit_limit_cents,reason,
                         status,requested_by,created_at)
                        VALUES('ctr_invalid','cli_cash',?,?,'Reviewed request',
                               'pending','requester','2026-11-21')""", (term, limit))
        conn = db()
        conn.execute("""INSERT INTO cash_payment_term_requests
            (id,client_id,term_code,credit_limit_cents,reason,
             status,requested_by,created_at)
            VALUES('ctr_prepaid','cli_cash','upon_booking',NULL,'Reviewed request',
                   'approved','requester','2026-11-21')""")
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute("""INSERT INTO cash_client_terms
                (client_id,term_code,credit_limit_cents,source_request_id,
                 approved_by,approved_at)
                VALUES('cli_cash','net_7',NULL,'ctr_prepaid',
                       'reviewer','2026-11-21')""")
        conn.execute("""INSERT INTO cash_client_terms
            (client_id,term_code,credit_limit_cents,source_request_id,
             approved_by,approved_at)
            VALUES('cli_cash','upon_booking',NULL,'ctr_prepaid',
                   'reviewer','2026-11-21')""")
        self.assertEqual(conn.execute(
            "SELECT term_code,credit_limit_cents FROM cash_client_terms"
        ).fetchone(), ('upon_booking', None))

    def test_finance_review_does_not_activate_candidate_prices(self):
        conn = db()
        conn.execute("""UPDATE inspection_price_candidates
            SET review_status='approved'
            WHERE service_id='property-condition-report'""")
        self.assertEqual(conn.execute(
            "SELECT price_ex_gst_cents,booking_mode FROM services "
            "WHERE id='property-condition-report'"
        ).fetchone(), (None, 'request'))

    def test_invoice_line_link_cannot_be_double_billed(self):
        conn = db()
        conn.execute("""INSERT INTO cash_invoice_batches
        (id,client_id,term_code,period,subtotal_cents,gst_cents,total_cents,status,prepared_by,created_at)
        VALUES('cin_1','cli_cash','net_7','booking:bkg_a',10000,1000,11000,'prepared','requester','2026-11-21')""")
        conn.execute("""INSERT INTO cash_invoice_batches
        (id,client_id,term_code,period,subtotal_cents,gst_cents,total_cents,status,prepared_by,created_at)
        VALUES('cin_2','cli_cash','net_7','booking:bkg_b',10000,1000,11000,'prepared','reviewer','2026-11-21')""")
        for booking_id,payment_id in [('bkg_a','pay_a'),('bkg_b','pay_b')]:
            conn.execute("""INSERT INTO cash_booking_charges
            (booking_id,payment_id,client_id,term_code,amount_ex_gst_cents,gst_cents,status,created_at)
            VALUES(?,?, 'cli_cash','net_7',10000,1000,'ready_to_invoice','2026-11-21')""",
            (booking_id,payment_id))
        conn.execute("INSERT INTO cash_invoice_items VALUES('bkg_a','cin_1')")
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO cash_invoice_items VALUES('bkg_a','cin_2')")


if __name__ == "__main__":
    unittest.main()
