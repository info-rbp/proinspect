"""Real SQLite checks for source immutability, scoped evidence and review boundaries."""
import hashlib
import json
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class CommercialSchema(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template = sqlite3.connect(':memory:')
        for path in sorted((ROOT / 'database/migrations').glob('*.sql')):
            cls.template.executescript(path.read_text())

    @classmethod
    def tearDownClass(cls):
        cls.template.close()

    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.template.backup(self.db)
        self.db.execute('PRAGMA foreign_keys=ON')
        for actor in ['author', 'reviewer', 'outsider']:
            self.db.execute('INSERT INTO users(id,email,verified_at,created_at) VALUES(?,?,?,?)',
                            (actor, actor+'@fixture.test', '2026-10-01', '2026-10-01'))
        for actor in ['author', 'reviewer']:
            self.db.execute("INSERT INTO staff_profiles(user_id,role) VALUES(?,'operations_manager')", (actor,))
        for suffix in ['a', 'b']:
            self.db.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES(?,?,'agency','2026-10-01')", ('client_'+suffix, 'Fixture '+suffix))
            self.db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES(?,?,'Perth','6000',?,'commercial','2026-10-01')", ('property_'+suffix, 'Fixture '+suffix, 'key_'+suffix))
            self.db.execute("INSERT INTO documents(id,property_id,title,category,object_key,content_type,size,sha256,status,created_by,created_at,issued_at) VALUES(?,?,'Fixture','report',?,'application/pdf',20,?,'issued','author','2026-10-01','2026-10-01')", ('doc_'+suffix, 'property_'+suffix, suffix+'.pdf', 'a'*64))
            self.db.execute("INSERT INTO document_grants(document_id,recipient_kind,recipient_id,created_by,created_at) VALUES(?,'client',?,'author','2026-10-01')", ('doc_'+suffix, 'client_'+suffix))
        self.db.execute("INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES('scope','client_a','property_a','managing_agent','2020-01-01')")
        self.db.execute("INSERT INTO commercial_lease_register(id,property_id,client_id,reference,occupier_name,starts_at,ends_at,details_envelope,source_document_id,created_by,created_at,updated_at) VALUES('lease','property_a','client_a','LEASE-FIXTURE','Occupier','2023-01-01','2024-01-01','sealed','doc_a','author','2026-10-01','2026-10-01')")

    def tearDown(self):
        self.db.close()

    def insert(self, table, data):
        self.db.execute('INSERT INTO '+table+'('+','.join(data)+') VALUES('+','.join('?' for _ in data)+')', tuple(data.values()))

    def revision(self, **changes):
        record = dict(id='revision', lease_id='lease', base_version=1, kind='commencement', effective_at='2023-01-01', starts_at='2023-01-01', ends_at='2024-01-01', source_document_id='doc_a', source_reference='SOURCE-REFERENCE', terms_envelope='sealed', created_by='author', created_at='2026-10-01')
        record.update(changes)
        self.insert('commercial_lease_revisions', record)

    def approve(self, table, ident, actor='reviewer'):
        self.db.execute('UPDATE '+table+" SET status='approved',reviewed_by=?,reviewed_at='2026-10-02',review_reference='INDEPENDENT-REVIEW' WHERE id=?", (actor, ident))

    def rule(self):
        self.revision()
        self.approve('commercial_lease_revisions', 'revision')
        self.insert('commercial_charge_rules', dict(id='rule', lease_id='lease', revision_id='revision', source_document_id='doc_a', source_reference='SOURCE-REFERENCE', rule_json='{}', rule_sha256='b'*64, details_envelope='sealed', created_by='author', created_at='2026-10-01'))
        self.approve('commercial_charge_rules', 'rule')

    def charge(self, ident='charge', **changes):
        calculation = json.dumps(dict(subtotalCents=1000, gstCents=100, totalCents=1100, periodFrom='2023-01-01', periodTo='2023-02-01', obligationKey='rent', category='rent'))
        record = dict(id=ident, lease_id='lease', rule_id='rule', source_document_id='doc_a', source_reference='SOURCE-REFERENCE', calculation_json=calculation, calculation_sha256=hashlib.sha256(calculation.encode()).hexdigest(), subtotal_cents=1000, gst_cents=100, total_cents=1100, created_by='author', created_at='2026-10-01')
        record.update(changes)
        self.insert('commercial_lease_charges', record)

    def test_all_46_deployed_files_remain_byte_identical(self):
        baseline = json.loads((ROOT/'config/handbook-migration-baseline.json').read_text())
        self.assertEqual(len(baseline['files']), 46)
        for path, digest in baseline['files'].items():
            self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(), digest, path)

    def test_revision_source_cannot_cross_client_or_be_preapproved(self):
        with self.assertRaises(sqlite3.IntegrityError): self.revision(source_document_id='doc_b')
        with self.assertRaises(sqlite3.IntegrityError): self.revision(status='approved')
        self.assertEqual(self.db.execute('SELECT count(*) FROM commercial_lease_revisions').fetchone()[0], 0)

    def test_revision_requires_independent_active_verified_operations_reviewer(self):
        self.revision()
        for actor in ['author', 'outsider']:
            with self.assertRaises(sqlite3.IntegrityError): self.approve('commercial_lease_revisions', 'revision', actor)
        self.db.execute("UPDATE staff_profiles SET active=0 WHERE user_id='reviewer'")
        with self.assertRaises(sqlite3.IntegrityError): self.approve('commercial_lease_revisions', 'revision')
        self.db.execute("UPDATE staff_profiles SET active=1 WHERE user_id='reviewer'")
        self.db.execute("UPDATE users SET verified_at=NULL WHERE id='reviewer'")
        with self.assertRaises(sqlite3.IntegrityError): self.approve('commercial_lease_revisions', 'revision')

    def test_revision_approval_advances_version_not_original_source(self):
        before = self.db.execute('SELECT starts_at,ends_at,details_envelope,source_document_id FROM commercial_lease_register').fetchall()
        self.revision()
        self.approve('commercial_lease_revisions', 'revision')
        self.assertEqual(self.db.execute('SELECT version FROM commercial_lease_register').fetchone()[0], 2)
        self.assertEqual(before, self.db.execute('SELECT starts_at,ends_at,details_envelope,source_document_id FROM commercial_lease_register').fetchall())
        for sql in ["UPDATE commercial_lease_revisions SET terms_envelope='changed'", "DELETE FROM commercial_lease_revisions", "UPDATE commercial_lease_revisions SET status='rejected'"]:
            with self.assertRaises(sqlite3.IntegrityError): self.db.execute(sql)

    def test_revision_rechecks_grants_and_concurrent_head(self):
        self.revision()
        self.revision(id='competing')
        self.db.execute("DELETE FROM document_grants WHERE document_id='doc_a'")
        with self.assertRaises(sqlite3.IntegrityError): self.approve('commercial_lease_revisions', 'revision')
        self.db.execute("INSERT INTO document_grants VALUES('doc_a','client','client_a','author','2026-10-01')")
        self.approve('commercial_lease_revisions', 'revision')
        with self.assertRaises(sqlite3.IntegrityError): self.approve('commercial_lease_revisions', 'competing')

    def test_charge_totals_cannot_disagree_with_immutable_calculation(self):
        self.rule()
        with self.assertRaises(sqlite3.IntegrityError): self.charge(subtotal_cents=1001, total_cents=1101)
        self.charge()
        with self.assertRaises(sqlite3.IntegrityError): self.approve('commercial_lease_charges', 'charge', 'author')
        self.approve('commercial_lease_charges', 'charge')
        for sql in ["DELETE FROM commercial_lease_charges", "UPDATE commercial_lease_charges SET source_reference='ALTERED-REFERENCE'", "UPDATE commercial_lease_charges SET total_cents=0"]:
            with self.assertRaises(sqlite3.IntegrityError): self.db.execute(sql)

    def test_closed_task_cannot_be_rewritten_or_closed_without_review(self):
        self.insert('commercial_lease_tasks', dict(id='task',lease_id='lease',kind='make_good',title='Fixture obligation',due_at='2026-11-01',details_envelope='sealed',created_by='author',created_at='2026-10-01',updated_at='2026-10-01'))
        with self.assertRaises(sqlite3.IntegrityError): self.db.execute("UPDATE commercial_lease_tasks SET status='completed',version=version+1,reviewed_by='reviewer',reviewed_at='2026-10-02',completion_document_id='doc_a',completion_reference='SOURCE-REFERENCE' WHERE id='task'")
        with self.assertRaises(sqlite3.IntegrityError): self.db.execute("UPDATE commercial_lease_tasks SET status='cancelled',version=version+1 WHERE id='task'")

    def test_exception_resolution_requires_scoped_evidence_and_different_reviewer(self):
        self.insert('commercial_lease_exceptions', dict(id='exception',lease_id='lease',kind='missing_document',source_reference='MISSING-REFERENCE',details_envelope='sealed',created_by='author',created_at='2026-10-01'))
        for actor,document in [('author','doc_a'),('outsider','doc_a'),('reviewer','doc_b')]:
            with self.assertRaises(sqlite3.IntegrityError): self.db.execute("UPDATE commercial_lease_exceptions SET status='resolved',resolved_by=?,resolved_at='2026-10-02',resolution_reference='RESOLUTION-EVIDENCE',resolution_document_id=? WHERE id='exception'", (actor,document))
        self.db.execute("UPDATE commercial_lease_exceptions SET status='resolved',resolved_by='reviewer',resolved_at='2026-10-02',resolution_reference='RESOLUTION-EVIDENCE',resolution_document_id='doc_a' WHERE id='exception'")
        with self.assertRaises(sqlite3.IntegrityError): self.db.execute('DELETE FROM commercial_lease_exceptions')
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_populated_46_to_current_additive_rehearsal_preserves_data(self):
        db = sqlite3.connect(':memory:')
        try:
            paths = sorted((ROOT/'database/migrations').glob('*.sql'))
            for p in paths[:46]: db.executescript(p.read_text())
            db.execute("INSERT INTO users(id,email,created_at) VALUES('preserved','preserved@fixture.test','2026-10-01')")
            db.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('preserved','Preserved','landlord','2026-10-01')")
            tables=['users','clients','subscriptions']
            columns={table:','.join(row[1] for row in db.execute('PRAGMA table_info('+table+')')) for table in tables}
            before={table:db.execute('SELECT '+columns[table]+' FROM '+table+' ORDER BY id').fetchall() for table in tables}
            for p in paths[46:]: db.executescript(p.read_text())
            for table in tables: self.assertEqual(before[table],db.execute('SELECT '+columns[table]+' FROM '+table+' ORDER BY id').fetchall())
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        finally: db.close()

if __name__ == '__main__': unittest.main()
