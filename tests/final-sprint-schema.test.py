"""Actual SQLite constraints and immutable deployed-history checks for the combined sprint."""
import hashlib,json,pathlib,sqlite3,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class FinalSprintSchema(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.template=sqlite3.connect(':memory:')
  for p in sorted((ROOT/'database/migrations').glob('*.sql')):cls.template.executescript(p.read_text())
 @classmethod
 def tearDownClass(cls):cls.template.close()
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.template.backup(self.db);self.db.execute('PRAGMA foreign_keys=ON')
  for ident in ['author','reviewer','outsider']:
   self.db.execute('INSERT INTO users(id,email,verified_at,created_at) VALUES(?,?,?,?)',(ident,ident+'@fixture.test','2026-10-01','2026-10-01'))
  for ident in ['author','reviewer']:self.db.execute("INSERT INTO staff_profiles(user_id,role) VALUES(?,'administrator')",(ident,))
  self.db.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('c','Fixture','landlord','2026-10-01')")
 def tearDown(self):self.db.close()
 def test_deployed_26_migrations_are_immutable(self):
  baseline=json.loads((ROOT/'config/final-sprint-migration-baseline.json').read_text());self.assertEqual(len(baseline),26)
  for name,sha in baseline.items():
   b=(ROOT/name).read_bytes();self.assertEqual(hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest(),sha,name)
 def test_no_feature_or_commercial_approval_is_seeded(self):
  for table in ['feature_release_approvals','legal_document_versions','service_sale_variants','billing_accounts','refund_requests','building_manager_assignments']:
   self.assertEqual(self.db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0],0,table)
 def legal(self):
  self.db.execute("INSERT INTO legal_document_versions(id,document_key,version_label,title,body_json,content_sha256,created_by,created_at) VALUES('d','privacy','1','Fixture','{}',?,'author','2026-10-01')",('a'*64,))
 def test_legal_approval_is_independent_verified_and_text_immutable(self):
  self.legal()
  for actor in ['author','outsider']:
   with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE legal_document_versions SET status='approved',approved_by=?,approved_at='2026-10-01',effective_at='2026-10-01',approval_reference='FIXTURE-APPROVAL' WHERE id='d'",(actor,))
  self.db.execute("UPDATE legal_document_versions SET status='approved',approved_by='reviewer',approved_at='2026-10-01',effective_at='2026-10-01',approval_reference='FIXTURE-APPROVAL' WHERE id='d'")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE legal_document_versions SET title='Other' WHERE id='d'")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("DELETE FROM legal_document_versions WHERE id='d'")
 def payment(self):
  self.db.execute("INSERT INTO payments(id,client_id,description,amount_ex_gst_cents,gst_cents,total_cents,status,created_at) VALUES('p','c','Fixture',10000,1000,11000,'payment_required','2026-10-01')")
 def attempt(self,id='a',amount=11000):
  self.db.execute("INSERT INTO payment_checkout_attempts(id,payment_id,payment_version,amount_cents,currency,client_id,description,success_url,cancel_url,status,created_at,updated_at) VALUES(?,'p',1,?,'AUD','c','Fixture','https://fixture.test/s','https://fixture.test/c','creating','2026-10-01','2026-10-01')",(id,amount))
 def test_checkout_attempt_immutability_single_active_and_snapshot(self):
  self.payment()
  with self.assertRaises(sqlite3.IntegrityError):self.attempt('wrong',1)
  self.attempt()
  with self.assertRaises(sqlite3.IntegrityError):self.attempt('b')
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE payment_checkout_attempts SET amount_cents=1 WHERE id='a'")
  self.db.execute("UPDATE payment_checkout_attempts SET status='expired' WHERE id='a'")
  self.attempt('b')
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("DELETE FROM payment_checkout_attempts WHERE id='a'")
 def test_refunds_cannot_exceed_original_total(self):
  self.payment()
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE payments SET refunded_cents=11001 WHERE id='p'")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE payments SET refunded_cents=-1 WHERE id='p'")
 def test_reconciliation_does_not_allow_unreviewed_or_rewritten_evidence(self):
  self.payment();self.db.execute("INSERT INTO payment_reconciliation_items(id,payment_id,provider_event_id,code,created_at) VALUES('r','p','evt','test','2026-10-01')")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE payment_reconciliation_items SET status='resolved' WHERE id='r'")
  self.db.execute("UPDATE payment_reconciliation_items SET status='resolved',resolved_by='reviewer',resolved_at='2026-10-02',evidence_reference='FIXTURE-EVIDENCE' WHERE id='r'")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE payment_reconciliation_items SET provider_event_id='other' WHERE id='r'")
  self.assertEqual(self.db.execute("SELECT status FROM payments WHERE id='p'").fetchone()[0],'payment_required')
 def test_entitlements_remain_independent_of_financial_configuration(self):
  self.assertEqual(self.db.execute("SELECT plan_code,status FROM subscriptions WHERE client_id='c'").fetchone(),('all_inclusive','active'))
  self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
 def test_populated_deployed_26_to_44_rehearsal(self):
  db=sqlite3.connect(':memory:');paths=sorted((ROOT/'database/migrations').glob('*.sql'))
  try:
   for p in paths[:26]:db.executescript(p.read_text())
   db.execute("INSERT INTO users(id,email,created_at) VALUES('preserved','preserved@fixture.test','2026-10-01')")
   db.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('preserved','Preserved','landlord','2026-10-01')")
   db.execute("INSERT INTO payments(id,client_id,description,amount_ex_gst_cents,gst_cents,total_cents,status,created_at) VALUES('preserved','preserved','Preserved',10000,1000,11000,'payment_required','2026-10-01')")
   tables=['users','clients','payments','subscriptions'];cols={t:[r[1] for r in db.execute('PRAGMA table_info('+t+')')] for t in tables}
   before={t:db.execute('SELECT '+','.join(cols[t])+' FROM '+t+' ORDER BY id').fetchall() for t in tables}
   for p in paths[26:]:db.executescript(p.read_text())
   for t in tables:self.assertEqual(before[t],db.execute('SELECT '+','.join(cols[t])+' FROM '+t+' ORDER BY id').fetchall(),t)
   self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[]);self.assertGreaterEqual(len(paths),47)
  finally:db.close()
if __name__=='__main__':unittest.main()
