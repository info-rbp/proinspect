import pathlib, sqlite3, unittest

class SchemaTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        for path in sorted(pathlib.Path('database/migrations').glob('*.sql')):
            self.db.executescript(path.read_text())
        self.db.execute("INSERT INTO users(id,email,created_at) VALUES('u','a@example.test','2026-01-01')")
        self.db.execute("INSERT INTO clients(id,name,client_type,created_at) VALUES('c','Landlord','landlord','2026-01-01')")
        self.db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('p','1 Test St','Perth','6000','1|perth|6000','residential','2026-01-01')")
        self.db.execute("INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES('l','c','p','owner','2026-01-01')")
        self.db.execute("INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes) VALUES('s','Routine','inspections','[\"residential\"]','Test',45)")
        self.db.execute("INSERT INTO schedule_resources VALUES('r','Inspection capacity',1)")
    def booking(self, ident, start, end):
        self.db.execute("INSERT INTO bookings(id,reference,client_id,user_id,property_id,service_id,resource_id,starts_at,ends_at,reserved_start,reserved_end,snapshot_json,request_key,fingerprint,created_at) VALUES(?,?,'c','u','p','s','r',?,?,?,?,'{}',?,'hash','2026-01-01')",(ident,ident,start,end,start,end,ident))
    def test_overlap_is_rejected_in_database(self):
        self.booking('a','2026-10-10T01:00:00.000Z','2026-10-10T02:00:00.000Z')
        with self.assertRaisesRegex(sqlite3.IntegrityError,'SCHEDULE_CONFLICT'):
            self.booking('b','2026-10-10T01:30:00.000Z','2026-10-10T02:30:00.000Z')
        self.booking('c','2026-10-10T02:00:00.000Z','2026-10-10T03:00:00.000Z')
    def test_cancel_releases_capacity(self):
        self.booking('a','2026-10-10T01:00:00.000Z','2026-10-10T02:00:00.000Z')
        self.db.execute("UPDATE bookings SET status='cancelled' WHERE id='a'")
        self.booking('b','2026-10-10T01:00:00.000Z','2026-10-10T02:00:00.000Z')
    def test_only_one_current_manager(self):
        self.db.execute("INSERT INTO property_management_relationships VALUES('m','p','c','self_managed','2026-01-01',NULL)")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO property_management_relationships VALUES('m2','p','c','agency_managed','2026-01-01',NULL)")
    def test_self_management_requires_ownership(self):
        self.db.execute("DELETE FROM client_property_links")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'SELF_MANAGEMENT_REQUIRES_OWNER'):
            self.db.execute("INSERT INTO property_management_relationships VALUES('m','p','c','self_managed','2026-01-01',NULL)")
    def test_audit_append_only(self):
        self.db.execute("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,created_at) VALUES('a','u','test','property','p','2026-01-01')")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'AUDIT_IMMUTABLE'):
            self.db.execute("DELETE FROM audit_events")
    def test_foreign_key_integrity(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO client_memberships VALUES('m','missing','u','owner',1,'2026-01-01')")
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
    def test_mutation_guard_rejects_lost_update(self):
        self.db.execute("UPDATE users SET display_name='x' WHERE id='does-not-exist'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('INSERT INTO mutation_guards VALUES(changes())')
    def test_entire_relationship_graph_exists(self):
        names={r[0] for r in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for name in ['scheme_memberships','strata_lots','tenancy_memberships','document_grants','restricted_form_cases','outbox_events','property_management_relationships']:
            self.assertIn(name,names)
    def test_enquiry_retry_key_and_append_only_history(self):
        self.db.execute("INSERT INTO marketing_enquiries(id,reference,request_key,fingerprint,envelope,enquiry_kind,created_at,updated_at) VALUES('e','ENQ-1','key','hash','encrypted','service','2026-01-01','2026-01-01')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO marketing_enquiries(id,reference,request_key,fingerprint,envelope,enquiry_kind,created_at,updated_at) VALUES('e2','ENQ-2','key','hash','encrypted','service','2026-01-01','2026-01-01')")
        self.db.execute("INSERT INTO enquiry_events(id,enquiry_id,kind,envelope,created_at) VALUES('event','e','received','encrypted','2026-01-01')")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'HISTORY_IMMUTABLE'):
            self.db.execute("DELETE FROM enquiry_events")
    def test_notice_recipient_and_outbox_are_unique(self):
        self.db.execute("INSERT INTO strata_schemes(id,name,scheme_number,created_at) VALUES('scheme','Example','SP-1','2026-01-01')")
        self.db.execute("INSERT INTO building_notices(id,scheme_id,title,body,audience,starts_at,created_by) VALUES('notice','scheme','Test','Test','residents','2026-01-01','u')")
        self.db.execute("INSERT INTO outbox_events(id,kind,envelope,available_at,created_at) VALUES('mail','building.notice_available','encrypted','2026-01-01','2026-01-01')")
        self.db.execute("INSERT INTO notice_deliveries(notice_id,user_id,notification_id,outbox_id,created_at) VALUES('notice','u','alert','mail','2026-01-01')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO notice_deliveries(notice_id,user_id,notification_id,outbox_id,created_at) VALUES('notice','u','alert2','mail','2026-01-01')")

if __name__=='__main__': unittest.main()
