import pathlib,sqlite3,unittest
class V4Schema(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('PRAGMA foreign_keys=ON')
  for p in sorted(pathlib.Path('database/migrations').glob('*.sql')):self.db.executescript(p.read_text())
  self.stamp='2026-10-25T00:00:00.000Z'
  self.db.execute("INSERT INTO users(id,email,created_at) VALUES('u','u@example.test',?)",(self.stamp,))
 def create(self,ident='req1'):
  self.db.execute('INSERT INTO v4_service_requests(id,reference,request_key,fingerprint,service_code,sector,workflow_code,intake_envelope,rate_snapshot_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
   (ident,ident,ident,'hash','RES-036','residential','LEASE_AGREEMENT','sealed','{}',self.stamp,self.stamp))
 def tearDown(self):self.db.close()
 def test_one_use_private_links_and_scoped_audit(self):
  self.create()
  self.db.execute("INSERT INTO v4_request_links(token_hash,request_id,purpose,expires_at,created_at) VALUES('hash','req1','verify',?,?)",(self.stamp,self.stamp))
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO v4_request_links(token_hash,request_id,purpose,expires_at,created_at) VALUES('hash','req1','verify',?,?)",(self.stamp,self.stamp))
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO v4_request_links(token_hash,request_id,purpose,expires_at,created_at) VALUES('new','missing','manage',?,?)",(self.stamp,self.stamp))
  self.db.execute("INSERT INTO v4_request_events(id,request_id,action,actor_id,version,created_at) VALUES('e','req1','submitted','u',1,?)",(self.stamp,))
 def test_status_constraints_fail_closed(self):
  self.create()
  for status in ['quoted','completed','completely_open']:
   with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE v4_service_requests SET status=? WHERE id=?',(status,'req1'))
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE v4_service_requests SET quantity=0 WHERE id=?',('req1',))
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE v4_service_requests SET quote_cents=-1 WHERE id=?',('req1',))
 def test_no_new_portal_memberships_or_subscription_entitlements(self):
  self.create();self.assertEqual(self.db.execute('SELECT COUNT(*) FROM subscriptions').fetchone()[0],0)
  self.assertEqual(self.db.execute('SELECT COUNT(*) FROM client_memberships').fetchone()[0],0)
  self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
if __name__=='__main__':unittest.main()
