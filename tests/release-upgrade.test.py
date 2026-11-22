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
   self.assertGreaterEqual(len(additions),43)
   all_names=sorted(pathlib.Path('database/migrations').glob('*.sql'))
   self.assertEqual([p.name[:4] for p in all_names],[str(i).zfill(4) for i in range(1,len(all_names)+1)])
   self.assertEqual([p.name for p in all_names[57:62]],['0058_temporary_rental_documents.sql','0059_portal_experience_coliving.sql','0060_resident_occupancies_and_council_appointments.sql','0061_registered_workflows_and_preferences.sql','0062_finance_reviews_and_photo_annotations.sql'])
   for path in additions:db.executescript(path.read_text())
   for table,rows in snapshots.items():self.assertEqual(db.execute('SELECT * FROM '+table+' ORDER BY id').fetchall(),rows,table)
   self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
   self.assertEqual(db.execute("SELECT COUNT(*) FROM v2_sector_modules WHERE status='approved'").fetchone()[0],0)
   self.assertEqual(db.execute("SELECT COUNT(*) FROM v2_sector_release_checks WHERE status='verified'").fetchone()[0],0)
  finally:db.close()
 def test_pr124_0063_to_0067_isolated_backup_recovery(self):
  """Synthetic source rehearsal, not hosted D1/R2 recovery acceptance."""
  paths=sorted(pathlib.Path('database/migrations').glob('*.sql'))
  self.assertEqual([p.name for p in paths[63:]], [
   '0064_direct_inspection_booking_cash_terms.sql',
   '0065_residential_service_intents.sql',
   '0066_residential_property_profiles.sql',
   '0067_co_living_onboarding.sql'])
  baseline=sqlite3.connect(':memory:');baseline.execute('PRAGMA foreign_keys=ON')
  for migration in paths[:63]:baseline.executescript(migration.read_text())
  baseline.execute("INSERT INTO users(id,email,created_at) VALUES('pr124-owner','pr124@example.test','2026-11-22')")
  baseline.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('pr124-client','Existing account','landlord','2026-11-22')")
  baseline.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('pr124-property','17 Recovery Street','Perth','6000','pr124|recovery|wa','residential','2026-11-22')")
  baseline.execute("INSERT INTO work_orders(id,reference,client_id,property_id,title,status,created_at,updated_at) VALUES('pr124-work','PR124-WO','pr124-client','pr124-property','Existing job','triage','2026-11-22','2026-11-22')")
  baseline.execute("""INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active)
   VALUES('property-condition-report','Existing PCR','inspections','["residential"]','Existing authorised service',90,10,10,72,60,12345,'instant',1)""")
  baseline.commit()
  preserved={table:baseline.execute('SELECT * FROM '+table+' ORDER BY 1').fetchall() for table in ('users','clients','properties','work_orders')}
  approved=baseline.execute("SELECT * FROM services WHERE id='property-condition-report'").fetchone()
  snapshot=sqlite3.connect(':memory:');baseline.backup(snapshot)
  for candidate in (baseline,sqlite3.connect(':memory:')):
   if candidate is not baseline:snapshot.backup(candidate)
   candidate.execute('PRAGMA foreign_keys=ON')
   for migration in paths[63:]:candidate.executescript(migration.read_text())
   for table,rows in preserved.items():self.assertEqual(candidate.execute('SELECT * FROM '+table+' ORDER BY 1').fetchall(),rows,table)
   self.assertEqual(candidate.execute("SELECT * FROM services WHERE id='property-condition-report'").fetchone(),approved)
   self.assertEqual(candidate.execute('PRAGMA foreign_key_check').fetchall(),[])
   self.assertEqual(candidate.execute('PRAGMA quick_check').fetchone()[0],'ok')
   for table in ('cash_client_terms','cash_invoice_batches','booking_service_addon_intents','residential_property_profiles','residential_property_tenancy_snapshots','co_living_onboarding_projects'):
    self.assertEqual(candidate.execute('SELECT count(*) FROM '+table).fetchone()[0],0,table)
   self.assertGreaterEqual(candidate.execute("SELECT count(*) FROM services WHERE booking_mode='request' AND price_ex_gst_cents IS NULL").fetchone()[0],7)
   self.assertEqual(candidate.execute("SELECT count(*) FROM inspection_price_candidates WHERE review_status='approved'").fetchone()[0],0)
   if candidate is not baseline:candidate.close()
  self.assertEqual(snapshot.execute('PRAGMA quick_check').fetchone()[0],'ok')
  self.assertEqual(snapshot.execute("SELECT name FROM sqlite_master WHERE name='co_living_onboarding_projects'").fetchone(),None)
  snapshot.close();baseline.close()

if __name__=='__main__':unittest.main()
