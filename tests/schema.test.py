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
        self.db.execute("UPDATE v2_asset_conditions SET status='verified',verified_by='u',verified_at='2026-10-02',verification_reference='INSPECTION-REVIEW-001' WHERE id='c1'")
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

if __name__=='__main__': unittest.main()
