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

if __name__=='__main__': unittest.main()
