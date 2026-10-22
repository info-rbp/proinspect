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

    def test_calendar_sync_jobs_are_versioned_idempotent_and_lease_safe(self):
        booking_id = 'bkg_' + 'a' * 32
        event_id = 'pi' + 'a' * 32
        stamp = '2026-10-19T12:00:00.000Z'
        self.booking(booking_id, '2026-10-27T01:00:00.000Z', '2026-10-27T02:00:00.000Z')
        sql = (
            "INSERT INTO booking_calendar_sync(booking_id,event_id,target_version,status,next_attempt_at,updated_at) "
            "VALUES(?,?,?,'pending',?,?) ON CONFLICT(booking_id) DO UPDATE SET "
            "target_version=excluded.target_version,status='pending',attempts=0,next_attempt_at=excluded.next_attempt_at,"
            "updated_at=excluded.updated_at,lease_token=NULL,lease_until=NULL,error_code=NULL "
            "WHERE excluded.target_version>booking_calendar_sync.target_version"
        )
        self.db.execute(sql, (booking_id, event_id, 1, stamp, stamp))
        self.db.execute(
            "UPDATE booking_calendar_sync SET status='synced',synced_version=1 WHERE booking_id=?",
            (booking_id,),
        )
        self.db.execute(sql, (booking_id, event_id, 1, stamp, stamp))
        self.assertEqual(
            self.db.execute(
                "SELECT status,synced_version,target_version FROM booking_calendar_sync WHERE booking_id=?",
                (booking_id,),
            ).fetchone(),
            ('synced', 1, 1),
        )
        self.db.execute("UPDATE bookings SET version=2 WHERE id=?", (booking_id,))
        self.db.execute(sql, (booking_id, event_id, 2, stamp, stamp))
        self.assertEqual(
            self.db.execute(
                "SELECT status,synced_version,target_version FROM booking_calendar_sync WHERE booking_id=?",
                (booking_id,),
            ).fetchone(),
            ('pending', 1, 2),
        )
        self.booking('bkg_' + 'b' * 32, '2026-10-27T03:00:00.000Z', '2026-10-27T04:00:00.000Z')
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(sql, ('bkg_' + 'b' * 32, event_id, 1, stamp, stamp))

    def test_wa_residential_form_schema_enforces_property_sector_and_immutable_evidence(self):
        self.db.execute(
            "INSERT INTO tenancies(id,property_id,status,starts_at) VALUES('ten_res','p','active','2026-01-01')"
        )
        self.db.execute(
            "INSERT INTO wa_residential_form_cases(id,tenancy_id,property_id,form_code,form_stage,initiator_id,initiator_kind,data_envelope,created_at,updated_at) VALUES('case1','ten_res','p','WA_FORM_25','active','u','tenant','encrypted','2026-01-01','2026-01-01')"
        )
        self.db.execute(
            "INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('p_com','2 Test St','Perth','6000','2|perth|6000','commercial','2026-01-01')"
        )
        self.db.execute(
            "INSERT INTO tenancies(id,property_id,status,starts_at) VALUES('ten_com','p_com','active','2026-01-01')"
        )
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'WA_FORMS_RESIDENTIAL_ONLY'):
            self.db.execute(
                "INSERT INTO wa_residential_form_cases(id,tenancy_id,property_id,form_code,form_stage,initiator_id,initiator_kind,data_envelope,created_at,updated_at) VALUES('case2','ten_com','p_com','WA_FORM_25','active','u','tenant','encrypted','2026-01-01','2026-01-01')"
            )
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'WA_FORM_SCOPE_IMMUTABLE'):
            self.db.execute("UPDATE wa_residential_form_cases SET property_id='p_com' WHERE id='case1'")
        # Confidential Form 2 must never be stored for a commercial tenancy,
        # even through a future API path that forgets to check the sector.
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'RESTRICTED_FORM_RESIDENTIAL_ONLY'):
            self.db.execute(
                "INSERT INTO restricted_form_cases(id,applicant_user_id,tenancy_id,envelope,created_at) VALUES('restricted_com','u','ten_com','sealed','2026-01-01')"
            )
        self.db.execute(
            "INSERT INTO restricted_form_cases(id,applicant_user_id,tenancy_id,envelope,created_at) VALUES('restricted_res','u','ten_res','sealed','2026-01-01')"
        )
        self.db.execute(
            "INSERT INTO wa_residential_form_events(id,case_id,actor_id,action,created_at) VALUES('event1','case1','u','draft_created','2026-01-01')"
        )
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'AUDIT_IMMUTABLE'):
            self.db.execute("DELETE FROM wa_residential_form_events WHERE id='event1'")
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


    def test_v2_market_catalogue_and_staging_only(self):
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM v2_markets").fetchone()[0],11)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM v2_services").fetchone()[0],69)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM v2_plan_versions").fetchone()[0],33)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM v2_services WHERE status='approved'").fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM v2_market_service_rules WHERE status='approved'").fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM v2_plan_versions WHERE status='approved'").fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM v2_rate_cards WHERE status='approved'").fetchone()[0],0)

    def test_v2_auto_assets_and_cross_scope_rejected(self):
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM v2_assets WHERE property_id='p' AND kind='site'").fetchone()[0],1)
        self.db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('q','2 Test St','Perth','6000','2|perth|6000','residential','2026-01-01')")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM v2_assets WHERE property_id='q' AND kind='site'").fetchone()[0],1)
        with self.assertRaisesRegex(sqlite3.IntegrityError,'V2_ASSET_SCOPE_MISMATCH'):
            self.db.execute("INSERT INTO v2_assets(id,property_id,parent_id,kind,name,created_at) VALUES('bad','q','v2:property:p','equipment','Leak sensor','2026-01-01')")
        self.db.execute("INSERT INTO v2_assets(id,property_id,parent_id,kind,name,created_at) VALUES('child','p','v2:property:p','plant','HVAC','2026-01-01')")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'V2_ASSET_CYCLE'):
            self.db.execute("UPDATE v2_assets SET parent_id='child' WHERE id='v2:property:p'")

    def test_v2_only_approved_engagements_and_approved_plans_can_subscribe(self):
        self.db.execute("INSERT INTO v2_engagements(id,client_id,property_id,market_code,reference,scope_summary,starts_at,created_by,created_at) VALUES('eng','c','p','RES','SIGNED-REFERENCE','Inspections','2026-01-01','u','2026-01-01')")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'V2_UNVERIFIED_ENGAGEMENT'):
            self.db.execute("UPDATE v2_engagements SET status='active' WHERE id='eng'")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'V2_SUBSCRIPTION_SCOPE'):
            self.db.execute("INSERT INTO v2_subscription_periods(id,engagement_id,plan_id,period_start,period_end,agreed_monthly_cents,created_by,created_at) VALUES('sub','eng','RES:standard:v1','2026-01-01','2027-01-01',0,'u','2026-01-01')")

    def test_v2_advanced_modules_seed_only_unreviewed(self):
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM v2_sector_packs').fetchone()[0], 11)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM v2_sector_modules').fetchone()[0], 55)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM v2_sector_release_checks').fetchone()[0], 77)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM v2_sector_modules WHERE status='approved'").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM v2_sector_release_checks WHERE status='verified'").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM v2_sector_rollouts WHERE status IN('pilot','live')").fetchone()[0], 0)

    def test_v2_verified_condition_history_changes_asset_score(self):
        self.db.execute("INSERT INTO v2_asset_details(asset_id,asset_code,criticality,updated_by,updated_at) VALUES('v2:property:p','TEST-ASSET-1','high','u','2026-01-01')")
        self.db.execute("INSERT INTO v2_asset_conditions(id,asset_id,score,observed_on,method,summary,observed_by,created_at) VALUES('c1','v2:property:p',2,'2026-10-01','visual','Condition assessment','u','2026-10-01')")
        self.assertIsNone(self.db.execute("SELECT last_condition_score FROM v2_asset_details WHERE asset_id='v2:property:p'").fetchone()[0])
        self.db.execute("INSERT INTO users(id,email,created_at) VALUES('u2','reviewer@example.test','2026-01-01')")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'V2_CONDITION_SELF_REVIEW'):
            self.db.execute("UPDATE v2_asset_conditions SET status='verified',verified_by='u',verified_at='2026-10-02',verification_reference='SELF-REVIEW-REJECT' WHERE id='c1'")
        self.db.execute("UPDATE v2_asset_conditions SET status='verified',verified_by='u2',verified_at='2026-10-02',verification_reference='INSPECTION-REVIEW-001' WHERE id='c1'")
        self.assertEqual(self.db.execute("SELECT last_condition_score FROM v2_asset_details WHERE asset_id='v2:property:p'").fetchone()[0], 2)
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'V2_CONDITION_HISTORY_LOCKED'):
            self.db.execute("DELETE FROM v2_asset_conditions WHERE id='c1'")

    def test_v2_preventive_and_compliance_need_active_matching_engagement(self):
        self.db.execute("INSERT INTO v2_engagements(id,client_id,property_id,market_code,reference,scope_summary,starts_at,created_by,created_at) VALUES('draft-eng','c','p','RES','DRAFT-PM-001','Draft work','2026-01-01','u','2026-01-01')")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'V2_PM_ENGAGEMENT_SCOPE'):
            self.db.execute("INSERT INTO v2_preventive_plans(id,engagement_id,asset_id,service_code,title,instructions,cadence_months,next_due,created_by,created_at,updated_at) VALUES('plan','draft-eng','v2:property:p','V2-001','Roof checks','Visual review',3,'2026-11-01','u','2026-01-01','2026-01-01')")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'V2_COMPLIANCE_SCOPE'):
            self.db.execute("INSERT INTO v2_compliance_obligations(id,engagement_id,asset_id,title,category,source_reference,requirement_summary,accountable_party,next_review_on,created_by,created_at,updated_at) VALUES('obl','draft-eng','v2:property:p','Fire tracking','fire','EXT-AUTH-1','External assessment','owner','2026-11-01','u','2026-01-01','2026-01-01')")

    def test_v2_specialist_pack_cannot_skip_release_reviews(self):
        with self.assertRaisesRegex(sqlite3.IntegrityError,'V2_PACK_RELEASE_CHECKS_MISSING'):
            self.db.execute("UPDATE v2_sector_packs SET status='approved',approval_reference='SIGNED-TEST',approved_by='u',approved_at='2026-10-11' WHERE id='RES:pack:v1'")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'V2_MODULE_REVIEW_REQUIRED'):
            self.db.execute("UPDATE v2_sector_modules SET status='approved' WHERE code='RES-M01'")

    def test_v2_enterprise_portfolio_rejects_unrelated_property(self):
        self.db.execute("INSERT INTO v2_enterprise_portfolios(id,client_id,name,purpose,authority_reference,created_by,created_at) VALUES('portfolio','c','Portfolio','Asset reports','SIGNED-PORTFOLIO','u','2026-01-01')")
        self.db.execute("INSERT INTO v2_enterprise_portfolio_members(id,portfolio_id,property_id,verified_by,authority_reference,added_at) VALUES('member','portfolio','p','u','CURRENT-CLIENT-LINK','2026-10-11')")
        self.db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('unrelated','99 Remote St','Perth','6000','99|perth|6000','residential','2026-01-01')")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'V2_PORTFOLIO_NOT_AUTHORISED'):
            self.db.execute("INSERT INTO v2_enterprise_portfolio_members(id,portfolio_id,property_id,verified_by,authority_reference,added_at) VALUES('bad','portfolio','unrelated','u','NOT-AUTHORISED','2026-10-11')")


    def test_v2_compliance_evidence_requires_separate_reviewer(self):
        self.db.execute("INSERT INTO users(id,email,created_at) VALUES('u2','second-reviewer@example.test','2026-01-01')")
        self.db.execute("INSERT INTO v2_engagements(id,client_id,property_id,market_code,reference,scope_summary,status,starts_at,created_by,created_at) VALUES('draft-eng','c','p','RES','DRAFT-ENGAGEMENT-001','Review evidence','active','2026-01-01','u','2026-01-01')")
        self.db.execute("INSERT INTO v2_compliance_obligations(id,engagement_id,asset_id,title,category,source_reference,requirement_summary,accountable_party,next_review_on,created_by,created_at,updated_at) VALUES('test-obl','draft-eng','v2:property:p','External review','fire','AUTHORITY-REFERENCE','External certificate','qualified_provider','2026-11-01','u','2026-01-01','2026-01-01')")
        self.db.execute("INSERT INTO v2_compliance_evidence(id,obligation_id,kind,provider_name,evidence_reference,issued_on,recorded_by,created_at) VALUES('test-evidence','test-obl','inspection','Independent supplier','EVIDENCE-REF','2026-10-01','u','2026-10-01')")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'V2_COMPLIANCE_EVIDENCE_SELF_REVIEW'):
            self.db.execute("UPDATE v2_compliance_evidence SET status='verified',reviewed_by='u',reviewed_at='2026-10-02',independent_check_reference='SELF-REVIEW-INVALID' WHERE id='test-evidence'")
        self.db.execute("UPDATE v2_compliance_evidence SET status='verified',reviewed_by='u2',reviewed_at='2026-10-02',independent_check_reference='INDEPENDENT-CHECK-001' WHERE id='test-evidence'")

    def test_v2_migration_numbers_unique_and_contiguous(self):
        """V2 migrations append one version at a time; never reuse a deployed version."""
        import re
        paths = sorted(pathlib.Path('database/migrations').glob('*.sql'))
        versions = []
        for path in paths:
            match = re.fullmatch(r'(\d{4})_[a-z0-9_]+\.sql', path.name)
            self.assertIsNotNone(match, f'Unexpected migration filename: {path.name}')
            versions.append(int(match.group(1)))
        self.assertEqual(sorted(versions), list(range(1, len(paths) + 1)),
                         'Migration numbers must be unique and contiguous; rename new migrations instead of reusing old numbers')

    def test_v2_accepted_migrations_remain_byte_for_byte_unchanged(self):
        """Protect the exact migrated schema that passed main acceptance."""
        import hashlib
        import json
        manifest = json.loads(pathlib.Path('.github/v2-migration-baseline.json').read_text())
        for path_name, expected_git_sha in manifest['baseline_migrations'].items():
            payload = pathlib.Path(path_name).read_bytes()
            git_blob = b'blob ' + str(len(payload)).encode('ascii') + b'\x00' + payload
            actual_sha = hashlib.sha1(git_blob).hexdigest()
            self.assertEqual(actual_sha, expected_git_sha,
                             f'Previously accepted migration changed: {path_name}; create an additive migration instead')

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
        self.assertEqual(self.db.execute("SELECT count(*) FROM clients WHERE id!='cli_guest_transactions'").fetchone()[0], 4)
        self.assertEqual(
            self.db.execute("SELECT status,client_type FROM clients WHERE id='cli_guest_transactions'").fetchone(),
            ('inactive','other'),
        )
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

    def test_guest_purchase_is_not_a_subscription_or_membership(self):
        self.assertEqual(self.db.execute("SELECT status FROM clients WHERE id='cli_guest_transactions'").fetchone()[0], 'inactive')
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM subscriptions WHERE client_id='cli_guest_transactions'").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM client_memberships WHERE client_id='cli_guest_transactions'").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM client_entitlements WHERE client_id='cli_guest_transactions'").fetchone()[0], 0)
        with self.assertRaisesRegex(sqlite3.IntegrityError,'GUEST_CLIENT_CANNOT_ACTIVATE'):
            self.db.execute("UPDATE clients SET status='active' WHERE id='cli_guest_transactions'")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'GUEST_MEMBERSHIPS_FORBIDDEN'):
            self.db.execute("INSERT INTO client_memberships(id,client_id,user_id,role,created_at) VALUES('guestbad','cli_guest_transactions','u','owner','2026-01-01')")
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])

    def test_guest_order_keys_and_access_tokens_are_unique(self):
        self.seed()
        self.db.execute("INSERT INTO guest_service_orders(id,reference,request_key,fingerprint,envelope,service_id,sector,price_basis,price_ex_gst_cents,created_at,updated_at) VALUES('g1','G-1','k1','hash','encrypted','routine-inspection','residential','published',12000,'2026-01-01','2026-01-01')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO guest_service_orders(id,reference,request_key,fingerprint,envelope,service_id,sector,price_basis,price_ex_gst_cents,created_at,updated_at) VALUES('g2','G-2','k1','hash','encrypted','routine-inspection','residential','published',12000,'2026-01-01','2026-01-01')")
        self.db.execute("INSERT INTO guest_access_links(token_hash,order_id,purpose,expires_at,created_at) VALUES('tokenhash','g1','verify','2027-01-01','2026-01-01')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO guest_access_links(token_hash,order_id,purpose,expires_at,created_at) VALUES('tokenhash','g1','manage','2027-01-01','2026-01-01')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO guest_access_links(token_hash,order_id,purpose,expires_at,created_at) VALUES('badreport','g1','report','2027-01-01','2026-01-01')")

if __name__=='__main__': unittest.main()