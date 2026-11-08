"""Rehearse deployed 0001-0048 -> additive 0049-0052 in isolated SQLite.

This is source-schema evidence, not a hosted D1/R2 restoration or provider acceptance.
"""
from pathlib import Path
import sqlite3
import unittest

ROOT=Path(__file__).resolve().parents[1]

class CommercialReportingFinanceUpgrade(unittest.TestCase):
    def paths(self):
        p=sorted((ROOT/'database/migrations').glob('*.sql'))
        self.assertEqual(len(p),52,'Expected 48 deployed + 4 additive migrations')
        self.assertEqual([f.name[:4] for f in p],[f'{i:04d}' for i in range(1,53)])
        self.assertEqual([f.name for f in p[48:]],[
            '0049_commercial_source_lifecycle.sql',
            '0050_report_render_independent_review.sql',
            '0051_invoice_delivery_reviews.sql',
            '0052_rental_tenancy_handover.sql'])
        return p

    def test_populated_upgrade_preserves_existing_records_and_references(self):
        db=sqlite3.connect(':memory:')
        db.execute('PRAGMA foreign_keys=ON')
        try:
            paths=self.paths()
            for path in paths[:48]: db.executescript(path.read_text())
            db.execute("INSERT INTO users(id,email,verified_at,created_at) VALUES('upgrade_author','upgrade-author@example.invalid','2026-11-08','2026-11-08')")
            db.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('upgrade_client','Synthetic agency','agency','2026-11-08')")
            db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('upgrade_property','17 Isolated Street','Perth','6000','isolated|perth|wa|6000','commercial','2026-11-08')")
            db.execute("INSERT INTO work_orders(id,reference,client_id,property_id,title,status,created_at,updated_at) VALUES('upgrade_work','SYNTHETIC-UPGRADE','upgrade_client','upgrade_property','Isolated test job','triage','2026-11-08','2026-11-08')")
            original={}
            for name in ('users','clients','properties','work_orders','subscriptions','billing_invoices'):
                cols=','.join(row[1] for row in db.execute('PRAGMA table_info('+name+')'))
                original[name]=(cols,db.execute('SELECT '+cols+' FROM '+name).fetchall())
            for path in paths[48:]: db.executescript(path.read_text())
            for table,(cols,rows) in original.items():
                self.assertEqual(db.execute('SELECT '+cols+' FROM '+table).fetchall(),rows,table)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            for table in ('commercial_lease_revisions','commercial_charge_rules','commercial_lease_charges',
                'commercial_obligation_reviews','commercial_lease_exceptions','report_render_reviews',
                'billing_invoice_contacts','billing_invoice_dispatches','billing_invoice_dispatch_events'):
                self.assertEqual(db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0],0,table)
            self.assertEqual(db.execute('SELECT count(*) FROM feature_release_approvals').fetchone()[0],0,
                'Migration must not invent a release approval')
        finally:
            db.close()

if __name__=='__main__':
    unittest.main()
