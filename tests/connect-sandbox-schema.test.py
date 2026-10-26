import pathlib,sqlite3,unittest
class ConnectSandbox(unittest.TestCase):
 def test_only_self_managed_sandbox_records_are_immutable(self):
  db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
  for p in sorted(pathlib.Path('database/migrations').glob('*.sql')):db.executescript(p.read_text())
  db.execute("INSERT INTO users(id,email,created_at) VALUES('owner','owner@example.test','2026-10-01')")
  db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('prop','Sample','Perth','6000','sample','residential','2026-10-01')")
  db.execute("INSERT INTO tenancies(id,property_id,status,starts_at) VALUES('tn','prop','active','2026-10-01')")
  for ident,mode,route in [('agency','agency_managed','agency_trust_external'),('self','self_managed','landlord_connect_candidate')]:
   db.execute('INSERT INTO rent_route_plans(id,tenancy_id,property_id,manager_mode,route,amount_cents,frequency,policy_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    (ident,'tn','prop',mode,route,40000,'weekly','WA_RENT_ROUTING_OCT_2026','owner','2026-10-25'))
  def add(plan):
   db.execute("INSERT INTO rent_connect_sandbox_accounts(id,plan_id,account_id,environment,created_by,created_at,updated_at) VALUES(?,?,?,'sandbox','owner','2026-10-25','2026-10-25')",('x',plan,'acct_test'))
  with self.assertRaises(sqlite3.IntegrityError):add('agency')
  add('self')
  with self.assertRaises(sqlite3.IntegrityError):db.execute("UPDATE rent_connect_sandbox_accounts SET account_id='acct_wrong' WHERE id='x'")
  with self.assertRaises(sqlite3.IntegrityError):db.execute("DELETE FROM rent_connect_sandbox_accounts WHERE id='x'")
  self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
  db.close()
if __name__=='__main__':unittest.main()
