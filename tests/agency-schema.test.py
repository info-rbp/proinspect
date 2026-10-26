import sqlite3,pathlib,unittest
class AgencyOutsourcingSchema(unittest.TestCase):
 def test_additive_tables_and_safe_defaults(self):
  db=sqlite3.connect(':memory:')
  db.execute('PRAGMA foreign_keys=ON')
  try:
   for path in sorted(pathlib.Path('database/migrations').glob('*.sql')):
    db.executescript(path.read_text())
   for table in ['agency_owner_grants','agency_owner_report_shares','agency_commercial_agreements','agency_contract_rates','agency_billable_work','agency_monthly_statements','agency_statement_lines']:
    self.assertTrue(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone(),table)
   self.assertFalse(db.execute('SELECT 1 FROM agency_owner_grants LIMIT 1').fetchone())
   self.assertFalse(db.execute('SELECT 1 FROM agency_commercial_agreements LIMIT 1').fetchone())
   self.assertFalse(db.execute('SELECT 1 FROM agency_monthly_statements LIMIT 1').fetchone())
   self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
  finally:db.close()
if __name__=='__main__':unittest.main()
