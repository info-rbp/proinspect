"""Invoice delivery is separately reviewed and cannot be reconstructed by mutation.

These are isolated SQLite invariants, not authentic Stripe or email-provider acceptance.
"""
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def prepared():
    db = sqlite3.connect(':memory:')
    for migration in sorted((ROOT / 'database/migrations').glob('*.sql')):
        db.executescript(migration.read_text())
    for user, role, verified in [('preparer', 'operations_manager', '2026-10-27'),
                                 ('reviewer', 'administrator', '2026-10-27'),
                                 ('inactive', 'administrator', None)]:
        db.execute('INSERT INTO users(id,email,active,created_at,verified_at) VALUES(?,?,1,?,?)',
                   (user, user + '@example.test', '2026-10-27', verified))
        db.execute('INSERT INTO staff_profiles(user_id,role,active) VALUES(?,?,1)', (user, role))
    db.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('agency','Agency','agency','2026-10-27')")
    db.execute("INSERT INTO agency_commercial_agreements(id,client_id,reference,tier,pricing_model,base_monthly_cents,gst_basis_points,status,effective_at,created_by,approved_by,created_at) VALUES('agr','agency','AGR-TEST','custom','per_service',0,1000,'approved','2026-10-27','preparer','reviewer','2026-10-27')")
    db.execute("INSERT INTO agency_monthly_statements(id,agreement_id,period,subtotal_cents,gst_cents,total_cents,status,prepared_by,approved_by,created_at) VALUES('stmt','agr','2026-10',10000,1000,11000,'draft','preparer',NULL,'2026-10-27')")
    db.execute("INSERT INTO agency_statement_lines(id,statement_id,description,amount_cents) VALUES('ln','stmt','Inspection',10000)")
    db.execute("UPDATE agency_monthly_statements SET status='approved',approved_by='reviewer' WHERE id='stmt'")
    db.execute("INSERT INTO billing_invoices(stripe_invoice_id,client_id,statement_id,stripe_customer_id,currency,subtotal_cents,total_cents,remaining_cents,status,reconciliation,created_at,updated_at) VALUES('in_test','agency','stmt','cus_test','AUD',10000,11000,11000,'open','matched','2026-10-27','2026-10-27')")
    db.execute("INSERT INTO agency_invoice_exports(statement_id,client_id,snapshot_hash,status,due_days,terms_reference,stripe_invoice_id,requested_by,approved_by,created_at,updated_at) VALUES('stmt','agency',?,'finalized',14,'APPROVED-TERMS','in_test','preparer','reviewer','2026-10-27','2026-10-27')", ('a' * 64,))
    return db


class InvoiceDeliverySchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = prepared()
        self.db.execute("INSERT INTO billing_invoice_contacts(id,client_id,email,authority_reference,status,requested_by,created_at) VALUES('contact','agency','billing@example.test','APPROVED-ACCOUNT','pending','preparer','2026-10-27')")

    def tearDown(self):
        self.db.close()

    def approve(self):
        self.db.execute("UPDATE billing_invoice_contacts SET status='approved',approved_by='reviewer',approved_at='2026-10-27' WHERE id='contact'")

    def dispatch(self):
        self.db.execute("INSERT INTO billing_invoice_dispatches(statement_id,stripe_invoice_id,contact_id,customer_id,recipient_email,status,requested_by,approval_reference,created_at,updated_at) VALUES('stmt','in_test','contact','cus_test','billing@example.test','preparing','preparer','SEPARATE-SENDER-APPROVAL','2026-10-27','2026-10-27')")

    def test_self_approval_is_blocked_in_sql(self):
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'BILLING_CONTACT_INDEPENDENT_REVIEW'):
            self.db.execute("UPDATE billing_invoice_contacts SET status='approved',approved_by='preparer' WHERE id='contact'")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'BILLING_CONTACT_INDEPENDENT_REVIEW'):
            self.db.execute("UPDATE billing_invoice_contacts SET status='approved',approved_by='inactive' WHERE id='contact'")
        self.approve()
        self.assertEqual(self.db.execute("SELECT status FROM billing_invoice_contacts WHERE id='contact'").fetchone()[0], 'approved')

    def test_contact_replacement_and_immutable_history(self):
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'UNIQUE'):
            self.db.execute("INSERT INTO billing_invoice_contacts(id,client_id,email,authority_reference,status,requested_by,created_at) VALUES('second','agency','other@example.test','VALID-EVIDENCE','pending','preparer','2026-10-27')")
        self.approve()
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'BILLING_CONTACT_IMMUTABLE'):
            self.db.execute("UPDATE billing_invoice_contacts SET email='stranger@example.test' WHERE id='contact'")
        self.db.execute("UPDATE billing_invoice_contacts SET status='revoked',revoked_by='preparer',revoked_at='2026-10-27' WHERE id='contact'")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'BILLING_CONTACT_IMMUTABLE'):
            self.db.execute("UPDATE billing_invoice_contacts SET status='approved' WHERE id='contact'")
        self.db.execute("INSERT INTO billing_invoice_contacts(id,client_id,email,authority_reference,status,requested_by,created_at) VALUES('second','agency','other@example.test','VALID-EVIDENCE','pending','preparer','2026-10-27')")

    def test_dispatch_requires_current_approved_contact_and_matching_source(self):
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'BILLING_DISPATCH_REVIEW_REQUIRED'):
            self.dispatch()
        self.approve()
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'BILLING_DISPATCH_REVIEW_REQUIRED'):
            self.db.execute("INSERT INTO billing_invoice_dispatches(statement_id,stripe_invoice_id,contact_id,customer_id,recipient_email,status,requested_by,approval_reference,created_at,updated_at) VALUES('stmt','in_test','contact','cus_test','other@example.test','preparing','preparer','VALID-REFERENCE','2026-10-27','2026-10-27')")
        self.dispatch()
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'UNIQUE'):
            self.dispatch()

    def test_dispatch_evidence_cannot_be_redirected_or_erased(self):
        self.approve()
        self.dispatch()
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'BILLING_DISPATCH_IMMUTABLE'):
            self.db.execute("UPDATE billing_invoice_dispatches SET recipient_email='forged@example.test' WHERE statement_id='stmt'")
        self.db.execute("UPDATE billing_invoice_dispatches SET status='provider_accepted',provider_accepted_at='2026-10-27' WHERE statement_id='stmt'")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'BILLING_DISPATCH_IMMUTABLE'):
            self.db.execute("UPDATE billing_invoice_dispatches SET status='preparing' WHERE statement_id='stmt'")
        self.db.execute("INSERT INTO billing_invoice_dispatch_events(id,statement_id,event,actor_id,reference,created_at) VALUES('evt','stmt','provider_accepted','reviewer','in_test','2026-10-27')")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'BILLING_DISPATCH_EVENT_IMMUTABLE'):
            self.db.execute("DELETE FROM billing_invoice_dispatch_events WHERE id='evt'")
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])


if __name__ == '__main__':
    unittest.main()
