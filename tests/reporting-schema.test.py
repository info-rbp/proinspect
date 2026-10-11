import pathlib,sqlite3,unittest
class ReportingSchema(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.execute('PRAGMA foreign_keys=ON')
  for file in sorted(pathlib.Path('database/migrations').glob('*.sql')):self.db.executescript(file.read_text())
  c=self.db
  c.execute("INSERT INTO users(id,email,created_at) VALUES('staff','staff@example.test','2026-01-01')")
  c.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('client','Owner','landlord','2026-01-01')")
  c.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('property','1 Report Road','Perth','6000','report_1','residential','2026-01-01')")
  c.execute("INSERT INTO work_orders(id,reference,client_id,property_id,title,status,created_at,updated_at) VALUES('work','WORK-1','client','property','Example','assigned','2026-01-01','2026-01-01')")
  c.execute("INSERT INTO report_templates(id,report_type,profile,template_version,status,snapshot_json,published_at) VALUES('tpl','routine','residential',1,'published','{}','2026-01-01')")
  c.execute("INSERT INTO inspection_reports(id,work_order_id,client_id,property_id,report_type,profile,output_kind,template_id,template_version,layout_snapshot_json,created_by,created_at,updated_at) VALUES('r','work','client','property','routine','residential','inspection','tpl',1,'{}','staff','2026-01-01','2026-01-01')")
 def test_versions_are_append_only(self):
  self.db.execute("INSERT INTO report_versions(id,report_id,sequence,content_json,content_sha256,template_id,layout_sha256,created_by,created_at) VALUES('v','r',1,'{}',?, 'tpl',?, 'staff','2026-01-01')",('0'*64,'1'*64))
  with self.assertRaisesRegex(sqlite3.IntegrityError,'REPORT_VERSION_IMMUTABLE'):
   self.db.execute("UPDATE report_versions SET content_json='[]' WHERE id='v'")
  with self.assertRaisesRegex(sqlite3.IntegrityError,'REPORT_VERSION_IMMUTABLE'):
   self.db.execute("DELETE FROM report_versions WHERE id='v'")
 def test_report_context_cannot_be_retargeted(self):
  with self.assertRaisesRegex(sqlite3.IntegrityError,'REPORT_CONTEXT_IMMUTABLE'):
   self.db.execute("UPDATE inspection_reports SET property_id=NULL,scheme_id='other' WHERE id='r'")
 def test_one_report_per_work_order(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO inspection_reports(id,work_order_id,property_id,report_type,profile,output_kind,template_id,template_version,layout_snapshot_json,created_by,created_at,updated_at) VALUES('r2','work','property','routine','residential','inspection','tpl',1,'{}','staff','2026-01-01','2026-01-01')")
 def test_evidence_has_bounded_types_and_size(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO report_evidence(id,report_id,object_key,content_type,size,sha256,uploaded_by,uploaded_at) VALUES('e','r','e.png','image/png',6000000,?, 'staff','2026-01-01')",('a'*64,))
 def test_sync_receipts_are_immutable(self):
  self.db.execute("INSERT INTO report_sync_receipts(id,report_id,user_id,expected_revision,result_revision,fingerprint,created_at) VALUES('receipt','r','staff',1,2,?,'2026-01-01')",('a'*64,))
  with self.assertRaisesRegex(sqlite3.IntegrityError,'REPORT_SYNC_IMMUTABLE'):
   self.db.execute("DELETE FROM report_sync_receipts WHERE id='receipt'")
 def test_report_review_decisions_are_append_only(self):
  self.db.execute("INSERT INTO report_review_events(id,report_id,reviewer_id,decision,created_at) VALUES('review','r','staff','assigned','2026-01-01')")
  with self.assertRaisesRegex(sqlite3.IntegrityError,'REPORT_REVIEW_IMMUTABLE'):
   self.db.execute("UPDATE report_review_events SET decision='approved' WHERE id='review'")
 def test_foreign_key_graph(self):
  self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
if __name__=='__main__':unittest.main()
