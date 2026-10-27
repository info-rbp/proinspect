"""Synthetic SQLite acceptance; no deployed rates, customer records or approvals are written."""
import hashlib,json,pathlib,sqlite3,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Discounts(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.template=sqlite3.connect(':memory:')
  for p in sorted((ROOT/'database/migrations').glob('*.sql')):cls.template.executescript(p.read_text())
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.template.backup(self.db);self.db.execute('PRAGMA foreign_keys=ON')
  self.db.execute("INSERT OR IGNORE INTO schedule_resources(id,name) VALUES('default','Fixture')")
  for s in ['property-condition-report','routine-inspection']:
   self.db.execute("INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,booking_mode,price_ex_gst_cents) VALUES(?,?,'test','[\"residential\"]','Fixture',60,'instant',10000)",(s,s))
  for p in ['property','other']:
   self.db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES(?,?,'Perth','6000',?,'residential','2026-01-01')",(p,p+' Fixture Street',p))
  self.order('source',0,source=True)
  self.db.execute("UPDATE payments SET status='paid',provider='stripe' WHERE id='pay_source'")
  self.db.execute("INSERT INTO pcr_routine_discount_entitlements(id,guest_order_id,purchaser_email_hash,source_payment_id,created_at,updated_at) VALUES('e','source','same','pay_source','2026-01-01','2026-01-01')")
 def tearDown(self):self.db.close()
 def order(self,id,n,source=False,owner='same',prop='property'):
  start=f'2026-11-{n+1:02}T01:00:00Z';end=f'2026-11-{n+1:02}T02:00:00Z';service='property-condition-report' if source else 'routine-inspection'
  self.db.execute("INSERT INTO bookings(id,reference,client_id,user_id,property_id,service_id,resource_id,starts_at,ends_at,reserved_start,reserved_end,price_ex_gst_cents,snapshot_json,request_key,fingerprint,created_at) VALUES(?,?,'cli_guest_transactions','usr_guest_booking_system',?,?,'default',?,?,?,?,8000,'{}',?,?,'2026-01-01')",('b_'+id,'B_'+id,prop,service,start,end,start,end,id,id))
  self.db.execute("INSERT INTO work_orders(id,reference,client_id,property_id,booking_id,title,status,created_at,updated_at) VALUES(?,?,'cli_guest_transactions',?,?,'Fixture','scheduled','2026-01-01','2026-01-01')",('w_'+id,'W_'+id,prop,'b_'+id))
  self.db.execute("INSERT INTO payments(id,client_id,property_id,work_order_id,description,amount_ex_gst_cents,gst_cents,total_cents,status,created_at,updated_at) VALUES(?,'cli_guest_transactions',?,?,'Fixture',8000,800,8800,'payment_required','2026-01-01','2026-01-01')",('pay_'+id,prop,'w_'+id))
  self.db.execute("INSERT INTO guest_service_orders(id,reference,request_key,fingerprint,envelope,service_id,sector,status,price_basis,price_ex_gst_cents,property_id,booking_id,verified_at,offer_code,purchaser_email_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,'residential','confirmed','published',8000,?,?,'2026-01-01',?,?,'2026-01-01','2026-01-01')",(id,'G_'+id,id,id,'encrypted-fixture',service,prop,'b_'+id,'pcr100' if source else None,owner))
 def reserve(self,id,n=1,owner='same',prop='property'):
  self.order(id,n,owner=owner,prop=prop)
  self.db.execute("INSERT INTO pcr_discount_reservations(id,entitlement_id,guest_order_id,payment_id,property_id,base_ex_gst_cents,base_gst_cents,discount_cents,total_cents,created_at,updated_at) VALUES(?,'e',?,?,?,10000,1000,2200,8800,'2026-01-01','2026-01-01')",('r_'+id,id,'pay_'+id,prop))
 def remaining(self):return self.db.execute("SELECT uses_remaining FROM pcr_routine_discount_entitlements WHERE id='e'").fetchone()[0]
 def test_exactly_four_uses_without_fifth_or_cross_purchaser(self):
  for i in range(1,5):self.reserve('target'+str(i),i)
  self.assertEqual(self.remaining(),0)
  with self.assertRaises(sqlite3.IntegrityError):self.reserve('fifth',5)
  self.assertEqual(self.remaining(),0)
 def test_other_property_and_purchaser_cannot_reserve(self):
  with self.assertRaises(sqlite3.IntegrityError):self.reserve('outsider',1,owner='outsider')
  with self.assertRaises(sqlite3.IntegrityError):self.reserve('another',2,prop='other')
  self.assertEqual(self.remaining(),4)
 def test_only_unstarted_cancelled_payment_releases_once(self):
  self.reserve('target')
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE pcr_discount_reservations SET status='released' WHERE id='r_target'")
  self.db.execute("UPDATE guest_service_orders SET status='cancelled' WHERE id='target'")
  self.db.execute("UPDATE pcr_discount_reservations SET status='released' WHERE id='r_target'")
  self.assertEqual(self.remaining(),4)
  self.db.execute("UPDATE pcr_discount_reservations SET status='released' WHERE id='r_target'")
  self.assertEqual(self.remaining(),4)
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE pcr_discount_reservations SET status='reserved' WHERE id='r_target'")
 def test_even_a_failed_attempt_requires_review_before_release(self):
  self.reserve('target')
  self.db.execute("INSERT INTO payment_checkout_attempts(id,payment_id,payment_version,amount_cents,currency,client_id,description,success_url,cancel_url,status,created_at,updated_at) VALUES('a','pay_target',1,8800,'AUD','cli_guest_transactions','Fixture','https://fixture.test/s','https://fixture.test/c','failed','2026-01-01','2026-01-01')")
  self.db.execute("UPDATE guest_service_orders SET status='cancelled' WHERE id='target'")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE pcr_discount_reservations SET status='released' WHERE id='r_target'")
  self.assertEqual(self.remaining(),3)
 def test_settlement_consumes_reservation_without_second_decrement(self):
  self.reserve('target')
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE pcr_discount_reservations SET status='redeemed' WHERE id='r_target'")
  self.db.execute("UPDATE payments SET status='paid',provider='stripe' WHERE id='pay_target'")
  self.db.execute("UPDATE pcr_discount_reservations SET status='redeemed' WHERE id='r_target'")
  self.db.execute("UPDATE pcr_discount_reservations SET status='redeemed' WHERE id='r_target'")
  self.assertEqual(self.remaining(),3);self.assertEqual(self.db.execute('SELECT COUNT(*) FROM pcr_routine_discount_redemptions').fetchone()[0],1)
 def test_suspended_refunded_source_cannot_create_new_reservations(self):
  self.db.execute("UPDATE payments SET refunded_cents=100 WHERE id='pay_source'")
  with self.assertRaises(sqlite3.IntegrityError):self.reserve('refund_target')
  self.db.execute("UPDATE pcr_routine_discount_entitlements SET status='suspended' WHERE id='e'")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE pcr_routine_discount_entitlements SET status='active' WHERE id='e'")
 def test_immutable_identity_and_financial_history(self):
  self.reserve('target')
  for sql in ["DELETE FROM pcr_discount_reservations", "DELETE FROM pcr_routine_discount_entitlements", "UPDATE pcr_discount_reservations SET discount_cents=1", "UPDATE pcr_routine_discount_entitlements SET purchaser_email_hash='other'"]:
   with self.assertRaises(sqlite3.IntegrityError):self.db.execute(sql)
  self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
 def test_all_44_deployed_migrations_remain_byte_identical(self):
  manifest=json.loads((ROOT/'config/pcr-migration-baseline.json').read_text());self.assertEqual(len(manifest),44)
  for path,sha in manifest.items():
   b=(ROOT/path).read_bytes();self.assertEqual(hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest(),sha,path)
 def test_upgrade_from_44_preserves_existing_rows(self):
  db=sqlite3.connect(':memory:');paths=sorted((ROOT/'database/migrations').glob('*.sql'))
  try:
   for p in paths[:44]:db.executescript(p.read_text())
   db.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('retained','Retained','landlord','2026-01-01')")
   before=db.execute('SELECT * FROM subscriptions').fetchall()
   for p in paths[44:]:db.executescript(p.read_text())
   self.assertEqual(db.execute('SELECT * FROM subscriptions').fetchall(),before);self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
   self.assertEqual(db.execute('SELECT COUNT(*) FROM pcr_routine_discount_entitlements').fetchone()[0],0)
  finally:db.close()
if __name__=='__main__':unittest.main()
