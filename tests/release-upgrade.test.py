import hashlib,json,pathlib,sqlite3,unittest
class ReleaseUpgrade(unittest.TestCase):
 def test_nonempty_nineteen_migration_upgrade_and_immutable_baseline(self):
  manifest=json.loads(pathlib.Path('.github/release-migration-baseline.json').read_text())['migrations']
  db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
  try:
   for path,sha in manifest.items():
    raw=pathlib.Path(path).read_bytes()
    self.assertEqual(hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),sha,path)
    db.executescript(raw.decode())
   db.execute("INSERT INTO users(id,email,created_at) VALUES('upgrade-owner','upgrade@example.test','2026-10-01')")
   db.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('upgrade-client','Synthetic upgrade','landlord','2026-10-01')")
   db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('upgrade-property','19 Upgrade Street','Perth','6000','upgrade-19','residential','2026-10-01')")
   db.execute("INSERT INTO work_orders(id,reference,client_id,property_id,title,status,created_at,updated_at) VALUES('upgrade-work','UPGRADE-WO','upgrade-client','upgrade-property','Existing work','triage','2026-10-01','2026-10-01')")
   snapshots={table:db.execute('SELECT * FROM '+table+' ORDER BY id').fetchall() for table in ['users','clients','properties','work_orders']}
   additions=[p for p in sorted(pathlib.Path('database/migrations').glob('*.sql')) if str(p) not in manifest]
   self.assertEqual(len(additions),8)
   self.assertEqual(additions[-1].name,"0027_v4_service_requests.sql")
   for path in additions:db.executescript(path.read_text())
   for table,rows in snapshots.items():self.assertEqual(db.execute('SELECT * FROM '+table+' ORDER BY id').fetchall(),rows,table)
   self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
   self.assertEqual(db.execute("SELECT COUNT(*) FROM v2_sector_modules WHERE status='approved'").fetchone()[0],0)
   self.assertEqual(db.execute("SELECT COUNT(*) FROM v2_sector_release_checks WHERE status='verified'").fetchone()[0],0)
  finally:db.close()
if __name__=='__main__':unittest.main()
