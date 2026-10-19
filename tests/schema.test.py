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
    def test_active_accounts_receive_all_inclusive_subscription_without_new_roles(self):
        row = self.db.execute(
            "SELECT plan_code,status,property_id,allowance_json FROM subscriptions WHERE client_id='c'"
        ).fetchone()
        self.assertEqual(row, ('all_inclusive', 'active', None, '{"includedServiceIds":["*"]}'))
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM subscriptions WHERE client_id='c'").fetchone()[0],
            1,
        )
        self.db.execute(
            "INSERT INTO clients(id,name,client_type,status,created_at) VALUES('pending','Pending','agency','pending','2026-01-01')"
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM subscriptions WHERE client_id='pending'").fetchone()[0],
            0,
        )
        self.db.execute("UPDATE clients SET status='active' WHERE id='pending'")
        self.assertEqual(
            self.db.execute("SELECT plan_code FROM subscriptions WHERE client_id='pending'").fetchone()[0],
            'all_inclusive',
        )
        self.db.execute(
            "UPDATE subscriptions SET status='paused' WHERE client_id='pending'"
        )
        self.db.execute("UPDATE clients SET status='inactive' WHERE id='pending'")
        self.db.execute("UPDATE clients SET status='active' WHERE id='pending'")
        self.assertEqual(
            self.db.execute("SELECT status FROM subscriptions WHERE client_id='pending'").fetchone()[0],
            'paused',
        )
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM subscriptions WHERE client_id='pending'").fetchone()[0],
            1,
        )
        # A billing entitlement is not a portal membership or an admin role.
        self.assertEqual(
            self.db.execute("SELECT COUNT(*) FROM client_entitlements WHERE client_id='pending'").fetchone()[0],
            0,
        )

    def test_leasing_listing_matches_canonical_property_and_client(self):
        self.db.execute("""INSERT INTO leasing_listings(
            id,property_id,instructed_by_client_id,kind,slug,title,description,
            display_address,suburb,postcode,agent_name,agent_role,created_by,created_at,updated_at
        ) VALUES('lst1','p','c','residential','perth-example','Property for lease',
          'An approved property for lease with a detailed description and representative.',
          '1 Test St','Perth','6000','Owner','landlord','u','2026-01-01','2026-01-01')""")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'LEASING_SECTOR_MISMATCH'):
            self.db.execute("""INSERT INTO leasing_listings(
              id,property_id,instructed_by_client_id,kind,slug,title,description,
              display_address,suburb,postcode,agent_name,agent_role,created_by,created_at,updated_at
            ) VALUES('lst2','p','c','commercial','other','Other','Example',
            '2 Test St','Perth','6000','Owner','landlord','u','2026-01-01','2026-01-01')""")
        self.assertEqual(self.db.execute(
            "SELECT instructed_by_client_id FROM leasing_listings WHERE id='lst1'").fetchone()[0], 'c')

    def test_leasing_publication_requires_approved_media(self):
        self.db.execute("""INSERT INTO leasing_listings(
          id,property_id,instructed_by_client_id,kind,slug,title,description,
          display_address,suburb,postcode,agent_name,agent_role,created_by,created_at,updated_at
        ) VALUES('lst1','p','c','residential','perth-example','Property for lease',
          'A property description that contains plenty of relevant information.',
          '1 Test St','Perth','6000','Owner','landlord','u','2026-01-01','2026-01-01')""")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'LEASING_PHOTO_REQUIRED'):
            self.db.execute("UPDATE leasing_listings SET status='published' WHERE id='lst1'")
        self.db.execute("""INSERT INTO leasing_photos(id,listing_id,object_key,content_type,size,alt_text,created_at)
          VALUES('photo','lst1','leasing/lst1/pic','image/jpeg',123,'Exterior view','2026-01-01')""")
        self.db.execute("UPDATE leasing_listings SET status='published' WHERE id='lst1'")
        self.assertEqual(self.db.execute("SELECT status FROM leasing_listings WHERE id='lst1'").fetchone()[0], 'published')

    def test_leasing_session_capacity_and_email_event_history(self):
        self.db.execute("""INSERT INTO leasing_listings(
          id,property_id,instructed_by_client_id,kind,slug,title,description,
          display_address,suburb,postcode,agent_name,agent_role,created_by,created_at,updated_at
        ) VALUES('lst1','p','c','residential','perth-example','Property for lease',
          'A property description that contains plenty of relevant information.',
          '1 Test St','Perth','6000','Owner','landlord','u','2026-01-01','2026-01-01')""")
        self.db.execute("""INSERT INTO leasing_sessions(id,listing_id,starts_at,ends_at,capacity,created_at,updated_at)
          VALUES('session','lst1','2026-11-01T01:00:00Z','2026-11-01T01:30:00Z',1,'2026-01-01','2026-01-01')""")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE leasing_sessions SET booked_count=2 WHERE id='session'")
        self.db.execute("""INSERT INTO leasing_leads(
         id,listing_id,session_id,kind,request_key,fingerprint,email_hash,envelope,cancel_token_hash,created_at
        ) VALUES('lead','lst1','session','inspection','key','hash','hashed-email','cipher','hashed-cancel','2026-01-01')""")
        self.db.execute("""INSERT INTO leasing_email_events(id,lead_id,kind,envelope,created_at)
         VALUES('event','lead','registration.received','encrypted','2026-01-01')""")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'LEASING_EVENT_IMMUTABLE'):
            self.db.execute("DELETE FROM leasing_email_events WHERE id='event'")

    def test_rental_application_authority_and_form18_notice_requirements(self):
        self.db.execute("""INSERT INTO leasing_listings(id,property_id,instructed_by_client_id,kind,slug,title,
         description,display_address,suburb,postcode,agent_name,agent_role,created_by,created_at,updated_at)
         VALUES('lst1','p','c','residential','example-rental','Example listing for rent',
         'Example property that is advertised to interested renters in Perth.',
         '1 Test St','Perth','6000','Property agency','leasing_agent','u','2026-01-01','2026-01-01')""")
        self.assertEqual(self.db.execute("SELECT application_mode FROM leasing_listings WHERE id='lst1'").fetchone()[0], 'unavailable')
        with self.assertRaisesRegex(sqlite3.IntegrityError,'APPLICATION_AUTHORITY_REQUIRED'):
            self.db.execute("UPDATE leasing_listings SET application_mode='proinspect' WHERE id='lst1'")
        self.db.execute("UPDATE leasing_listings SET application_authority_reference='SIGNED-123',application_recipient_email='agency@example.test' WHERE id='lst1'")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'TENANCY_DATABASE_NOTICE_REQUIRED'):
            self.db.execute("UPDATE leasing_listings SET application_mode='proinspect' WHERE id='lst1'")
        self.db.execute("UPDATE leasing_listings SET tenancy_database_notice_mode='not_used',application_mode='proinspect' WHERE id='lst1'")
        self.assertEqual(self.db.execute("SELECT application_mode FROM leasing_listings WHERE id='lst1'").fetchone()[0], 'proinspect')
        with self.assertRaisesRegex(sqlite3.IntegrityError,'EXTERNAL_APPLICATION_URL_REQUIRED'):
            self.db.execute("UPDATE leasing_listings SET application_mode='external' WHERE id='lst1'")

    def test_rental_applicants_and_documents_are_scoped_to_application(self):
        self.db.execute("""INSERT INTO leasing_listings(id,property_id,instructed_by_client_id,kind,slug,title,
         description,display_address,suburb,postcode,agent_name,agent_role,created_by,created_at,updated_at)
         VALUES('lst1','p','c','residential','example-rental','Example listing for rent',
         'Example property that is advertised to interested renters in Perth.',
         '1 Test St','Perth','6000','Property agency','leasing_agent','u','2026-01-01','2026-01-01')""")
        self.db.execute("""INSERT INTO rental_applications(id,listing_id,reference,started_at,updated_at)
         VALUES('app1','lst1','RNT-EXAMPLE','2026-01-01','2026-01-01')""")
        self.db.execute("""INSERT INTO rental_applicants(id,application_id,ordinal,role,email_hash,access_token_hash,
         access_expires_at,answers_envelope,created_at,updated_at) VALUES('ap1','app1',1,'primary','hash1','tok1',
         '2027-01-01','sealed','2026-01-01','2026-01-01')""")
        self.db.execute("""INSERT INTO rental_applicants(id,application_id,ordinal,role,email_hash,access_token_hash,
         access_expires_at,answers_envelope,created_at,updated_at) VALUES('ap2','app1',2,'coapplicant','hash2','tok2',
         '2027-01-01','sealed','2026-01-01','2026-01-01')""")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""INSERT INTO rental_applicants(id,application_id,ordinal,role,email_hash,access_token_hash,
             access_expires_at,answers_envelope,created_at,updated_at) VALUES('ap3','app1',2,'coapplicant','hash3','tok3',
             '2027-01-01','sealed','2026-01-01','2026-01-01')""")
        self.db.execute("""INSERT INTO rental_application_documents(id,application_id,applicant_id,object_key,category,
         filename,content_type,size_bytes,sha256,uploaded_at) VALUES('d1','app1','ap2','private/key','identity',
         'example.pdf','application/pdf',123,'hash-file','2026-01-01')""")
        self.assertEqual(self.db.execute("SELECT review_status FROM rental_application_documents WHERE id='d1'").fetchone()[0], 'quarantined')
        self.db.execute("""INSERT INTO rental_application_events(id,application_id,actor_applicant_id,kind,envelope,created_at)
         VALUES('e1','app1','ap1','started','encrypted','2026-01-01')""")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'RENTAL_APPLICATION_HISTORY_IMMUTABLE'):
            self.db.execute("DELETE FROM rental_application_events WHERE id='e1'")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'APPLICATION_SUBMISSION_REQUIRED'):
            self.db.execute("UPDATE rental_applications SET status='submitted' WHERE id='app1'")
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

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


class PortalTestingSeedTests(unittest.TestCase):
    """The owner-approved Google Admin aliases must receive only synthetic, scoped access."""

    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for migration in sorted(pathlib.Path('database/migrations').glob('*.sql')):
            self.db.executescript(migration.read_text())
        self.seed_path = pathlib.Path('scripts/portal-testing/seed-google-admin-aliases.sql')

    def seed(self):
        self.db.executescript(self.seed_path.read_text())

    def roles_for(self, email):
        rows = self.db.execute('''
          SELECT e.workspace_kind FROM client_memberships m
          JOIN clients c ON c.id=m.client_id
          JOIN client_entitlements e ON e.client_id=c.id AND e.active=1
          JOIN users u ON u.id=m.user_id
          WHERE u.email=? AND u.active=1 AND m.active=1 AND c.status='active'
          UNION
          SELECT 'tenant' FROM tenancy_memberships m JOIN tenancies t ON t.id=m.tenancy_id
          JOIN users u ON u.id=m.user_id
          WHERE u.email=? AND u.active=1 AND m.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
          UNION
          SELECT CASE WHEN m.role='council_member' THEN 'council' ELSE 'building' END
          FROM scheme_memberships m JOIN users u ON u.id=m.user_id
          WHERE u.email=? AND u.active=1 AND m.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
            AND (m.ends_at IS NULL OR m.ends_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          UNION
          SELECT 'staff' FROM staff_profiles sp JOIN users u ON u.id=sp.user_id
          WHERE u.email=? AND u.active=1 AND sp.active=1
        ''', (email,) * 4).fetchall()
        return {row[0] for row in rows}

    def test_all_eight_portals_are_scoped_and_idempotent(self):
        self.seed()
        expected = {
           'landlord-testing@proinspect.systems': 'landlord',
           'property-manager-testing@proinspect.systems': 'property-manager',
           'strata-manager-testing@proinspect.systems': 'strata-manager',
           'tenant-testing@proinspect.systems': 'tenant',
           'building-resident-testing@proinspect.systems': 'building',
           'building-council-testing@proinspect.systems': 'council',
           'commercial-testing@proinspect.systems': 'commercial',
           'staff-testing@proinspect.systems': 'staff',
        }
        for email, portal in expected.items():
            with self.subTest(email=email):
                self.assertEqual(self.roles_for(email), {portal})
        self.assertEqual(self.db.execute("SELECT role FROM staff_profiles WHERE user_id=(SELECT id FROM users WHERE email='staff-testing@proinspect.systems')").fetchone()[0], 'administrator')
        self.assertEqual(self.db.execute('SELECT count(*) FROM users WHERE verified_at IS NOT NULL').fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM login_tokens').fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM sessions').fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM services').fetchone()[0], 23)
        self.assertEqual(self.db.execute('SELECT count(*) FROM properties').fetchone()[0], 5)
        self.assertEqual(self.db.execute('SELECT count(*) FROM scheme_memberships').fetchone()[0], 2)
        self.assertEqual(self.db.execute('SELECT count(*) FROM clients').fetchone()[0], 4)
        before = [(name, self.db.execute('SELECT count(*) FROM ' + name).fetchone()[0])
                  for name in ['users','clients','client_memberships','client_entitlements','properties',
                               'scheme_client_links','scheme_memberships','tenancies','audit_events','services']]
        self.seed()
        after = [(name, self.db.execute('SELECT count(*) FROM ' + name).fetchone()[0])
                 for name, _ in before]
        self.assertEqual(before, after)
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_cross_role_property_relationships_are_real_and_isolated(self):
        self.seed()
        self.assertEqual(self.db.execute("SELECT mode FROM property_management_relationships WHERE property_id='prop_pi_test_landlord'").fetchone()[0], 'self_managed')
        self.assertEqual(self.db.execute("SELECT mode FROM property_management_relationships WHERE property_id='prop_pi_test_agency'").fetchone()[0], 'agency_managed')
        self.assertEqual(self.db.execute("SELECT mode FROM property_management_relationships WHERE property_id='prop_pi_test_commercial'").fetchone()[0], 'commercial_managed')
        self.assertEqual(self.db.execute("SELECT property_id FROM tenancies WHERE id='tnc_pi_test_landlord'").fetchone()[0], 'prop_pi_test_landlord')
        self.assertEqual(self.db.execute("SELECT count(*) FROM scheme_client_links WHERE client_id='cli_pi_test_strata' AND role='strata_manager'").fetchone()[0], 1)
        self.assertEqual(self.db.execute("SELECT count(*) FROM scheme_memberships WHERE role='council_member' AND ends_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").fetchone()[0], 1)
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_existing_email_identity_is_not_overwritten(self):
        self.db.execute("INSERT INTO users(id,email,display_name,created_at,verified_at) VALUES('usr_preexisting','landlord-testing@proinspect.systems','Existing name','2026-01-01','2026-02-01')")
        self.seed()
        user = self.db.execute("SELECT id,display_name,verified_at FROM users WHERE email='landlord-testing@proinspect.systems'").fetchone()
        self.assertEqual(user, ('usr_preexisting','Existing name','2026-02-01'))
        self.assertEqual(self.roles_for('landlord-testing@proinspect.systems'), {'landlord'})
        self.assertEqual(self.db.execute("SELECT user_id FROM client_memberships WHERE client_id='cli_pi_test_landlord'").fetchone()[0], 'usr_preexisting')
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

if __name__=='__main__': unittest.main()