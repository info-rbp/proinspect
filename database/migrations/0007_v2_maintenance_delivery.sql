-- ProInspect V2 Work Package 2: maintenance delivery, verified labour/costs and capacity.
-- Additive only. No changes to legacy customer booking capacity or accepted migrations.
CREATE TABLE v2_maintenance_tasks (
 id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL REFERENCES work_orders(id),
 asset_id TEXT REFERENCES v2_assets(id),
 title TEXT NOT NULL, instructions TEXT NOT NULL DEFAULT '',
 public_summary TEXT NOT NULL DEFAULT '', trade TEXT NOT NULL CHECK(trade IN
 ('general','inspections','cleaning','grounds','carpentry','electrical','plumbing','fire','hvac','access','compliance')),
 priority TEXT NOT NULL DEFAULT 'routine' CHECK(priority IN('routine','urgent','emergency')),
 status TEXT NOT NULL DEFAULT 'scoped' CHECK(status IN
 ('scoped','awaiting_approval','approved','assigned','scheduled','in_progress','evidence_pending','completed','cancelled')),
 approval_required INTEGER NOT NULL DEFAULT 0 CHECK(approval_required IN(0,1)),
 budget_ceiling_cents INTEGER NOT NULL DEFAULT 0 CHECK(budget_ceiling_cents>=0),
 evidence_kind TEXT NOT NULL DEFAULT 'note' CHECK(evidence_kind IN('note','photo','report','certificate')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL, completed_by TEXT REFERENCES users(id), completed_at TEXT
) STRICT;
CREATE INDEX v2_tasks_work_order ON v2_maintenance_tasks(work_order_id,status);
CREATE INDEX v2_tasks_asset ON v2_maintenance_tasks(asset_id,status);

CREATE TRIGGER v2_task_insert_scope BEFORE INSERT ON v2_maintenance_tasks
BEGIN
 SELECT RAISE(ABORT,'V2_ORDER_TERMINAL') WHERE NOT EXISTS(
 SELECT 1 FROM work_orders w WHERE w.id=NEW.work_order_id AND w.status NOT IN('completed','cancelled'));
 SELECT RAISE(ABORT,'V2_TASK_ASSET_SCOPE') WHERE NEW.asset_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_assets a JOIN work_orders w ON w.id=NEW.work_order_id WHERE a.id=NEW.asset_id
 AND (a.property_id IS w.property_id AND a.scheme_id IS w.scheme_id));
END;
CREATE TRIGGER v2_task_immutable_scope BEFORE UPDATE OF work_order_id,asset_id,trade,approval_required,budget_ceiling_cents,evidence_kind ON v2_maintenance_tasks
WHEN OLD.status!='scoped'
BEGIN SELECT RAISE(ABORT,'V2_TASK_SCOPE_LOCKED'); END;
CREATE TRIGGER v2_task_scope_update BEFORE UPDATE OF asset_id ON v2_maintenance_tasks
BEGIN
 SELECT RAISE(ABORT,'V2_TASK_ASSET_SCOPE') WHERE NEW.asset_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_assets a JOIN work_orders w ON w.id=NEW.work_order_id WHERE a.id=NEW.asset_id
 AND (a.property_id IS w.property_id AND a.scheme_id IS w.scheme_id));
END;
CREATE TRIGGER v2_task_status_guard BEFORE UPDATE OF status ON v2_maintenance_tasks
WHEN NEW.status != OLD.status
BEGIN
 SELECT RAISE(ABORT,'V2_TASK_TRANSITION') WHERE NOT (
 (OLD.status='scoped' AND NEW.status IN('awaiting_approval','approved','assigned','cancelled')) OR
 (OLD.status='awaiting_approval' AND NEW.status IN('approved','cancelled')) OR
 (OLD.status='approved' AND NEW.status IN('assigned','cancelled')) OR
 (OLD.status='assigned' AND NEW.status IN('scheduled','in_progress','cancelled')) OR
 (OLD.status='scheduled' AND NEW.status IN('assigned','in_progress','cancelled')) OR
 (OLD.status='in_progress' AND NEW.status IN('evidence_pending','completed','cancelled')) OR
 (OLD.status='evidence_pending' AND NEW.status IN('in_progress','completed','cancelled')));
 SELECT RAISE(ABORT,'V2_ORDER_TERMINAL') WHERE NOT EXISTS(
 SELECT 1 FROM work_orders w WHERE w.id=NEW.work_order_id AND w.status NOT IN('completed','cancelled'));
 SELECT RAISE(ABORT,'V2_TASK_APPROVAL_REQUIRED') WHERE NEW.status IN
 ('approved','assigned','scheduled','in_progress','evidence_pending','completed') AND EXISTS(
 SELECT 1 FROM work_orders w WHERE w.id=NEW.work_order_id
 AND (NEW.approval_required=1 OR w.approval_required=1)
 AND NOT EXISTS(SELECT 1 FROM approvals a WHERE a.work_order_id=w.id AND a.status='approved'
 AND a.amount_cents >= (SELECT COALESCE(SUM(t.budget_ceiling_cents),0)
 FROM v2_maintenance_tasks t WHERE t.work_order_id=w.id AND t.status!='cancelled')));
 SELECT RAISE(ABORT,'V2_TASK_ASSIGNMENT_REQUIRED') WHERE NEW.status IN
 ('assigned','scheduled','in_progress','evidence_pending','completed') AND NOT EXISTS(
 SELECT 1 FROM v2_task_assignments a WHERE a.task_id=NEW.id AND a.status='confirmed');
 SELECT RAISE(ABORT,'V2_TASK_EVIDENCE_REQUIRED') WHERE NEW.status='completed' AND NOT EXISTS(
 SELECT 1 FROM v2_task_evidence e WHERE e.task_id=NEW.id AND e.status='verified'
 AND (e.kind=NEW.evidence_kind OR NEW.evidence_kind='note'));
 SELECT RAISE(ABORT,'V2_TASK_REVIEW_PENDING') WHERE NEW.status='completed' AND (
 EXISTS(SELECT 1 FROM v2_time_entries e WHERE e.task_id=NEW.id AND e.status='submitted')
 OR EXISTS(SELECT 1 FROM v2_external_costs c WHERE c.task_id=NEW.id AND c.status='submitted'));
 SELECT RAISE(ABORT,'V2_TASK_CLOSEOUT_ACTOR') WHERE NEW.status='completed'
 AND (NEW.completed_by IS NULL OR NEW.completed_at IS NULL);
END;
CREATE TRIGGER v2_parent_order_close BEFORE UPDATE OF status ON work_orders
WHEN NEW.status IN('completed','cancelled') AND OLD.status!=NEW.status
BEGIN
 SELECT RAISE(ABORT,'V2_WORK_PACKAGE_OPEN') WHERE EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t WHERE t.work_order_id=NEW.id
 AND t.status NOT IN('completed','cancelled'));
END;

-- Contractor qualifications: verified evidence references, not uploaded ID documents.
CREATE TABLE v2_contractor_credentials (
 id TEXT PRIMARY KEY, contractor_id TEXT NOT NULL REFERENCES contractors(id),
 credential_type TEXT NOT NULL CHECK(credential_type IN('insurance','licence','competency','site_induction')),
 trade TEXT NOT NULL DEFAULT 'general' CHECK(trade IN
 ('general','inspections','cleaning','grounds','carpentry','electrical','plumbing','fire','hvac','access','compliance')),
 credential_reference TEXT NOT NULL, verification_reference TEXT NOT NULL,
 verified_by TEXT NOT NULL REFERENCES users(id), verified_at TEXT NOT NULL,
 valid_until TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'verified' CHECK(status IN('verified','revoked')),
 created_at TEXT NOT NULL, CHECK(valid_until>verified_at)
) STRICT;
CREATE INDEX v2_credentials_contractor ON v2_contractor_credentials(contractor_id,credential_type,status,valid_until);
CREATE TRIGGER v2_credential_immutable BEFORE UPDATE OF contractor_id,credential_type,trade,credential_reference,verification_reference,verified_by,verified_at,valid_until,created_at ON v2_contractor_credentials
BEGIN SELECT RAISE(ABORT,'V2_CREDENTIAL_IMMUTABLE'); END;
CREATE TABLE v2_task_credential_requirements (
 task_id TEXT NOT NULL REFERENCES v2_maintenance_tasks(id),
 credential_type TEXT NOT NULL CHECK(credential_type IN('insurance','licence','competency','site_induction')),
 PRIMARY KEY(task_id,credential_type)
) STRICT;
CREATE TRIGGER v2_task_requirement_lock BEFORE INSERT ON v2_task_credential_requirements
WHEN (SELECT status FROM v2_maintenance_tasks WHERE id=NEW.task_id)!='scoped'
BEGIN SELECT RAISE(ABORT,'V2_TASK_SCOPE_LOCKED'); END;

CREATE TABLE v2_task_assignments (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES v2_maintenance_tasks(id),
 staff_user_id TEXT REFERENCES staff_profiles(user_id),
 contractor_id TEXT REFERENCES contractors(id),
 status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN('confirmed','released')),
 instruction_reference TEXT NOT NULL, assigned_by TEXT NOT NULL REFERENCES users(id),
 assigned_at TEXT NOT NULL, released_at TEXT,
 CHECK((staff_user_id IS NOT NULL)+(contractor_id IS NOT NULL)=1)
) STRICT;
CREATE UNIQUE INDEX v2_active_staff_task ON v2_task_assignments(task_id,staff_user_id) WHERE staff_user_id IS NOT NULL AND status='confirmed';
CREATE UNIQUE INDEX v2_active_contractor_task ON v2_task_assignments(task_id,contractor_id) WHERE contractor_id IS NOT NULL AND status='confirmed';
CREATE INDEX v2_assignments_staff ON v2_task_assignments(staff_user_id,status);
CREATE INDEX v2_assignments_contractor ON v2_task_assignments(contractor_id,status);

CREATE TRIGGER v2_assignment_guard BEFORE INSERT ON v2_task_assignments
BEGIN
 SELECT RAISE(ABORT,'V2_TASK_NOT_ASSIGNABLE') WHERE NOT EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id
 WHERE t.id=NEW.task_id AND t.status IN('scoped','awaiting_approval','approved','assigned')
 AND w.status NOT IN('completed','cancelled'));
 SELECT RAISE(ABORT,'V2_STAFF_INACTIVE') WHERE NEW.staff_user_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM staff_profiles s JOIN users u ON u.id=s.user_id WHERE s.user_id=NEW.staff_user_id
 AND s.active=1 AND u.active=1 AND s.role IN('administrator','operations_manager','inspector'));
 SELECT RAISE(ABORT,'V2_CONTRACTOR_INACTIVE') WHERE NEW.contractor_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM contractors c WHERE c.id=NEW.contractor_id AND c.active=1);
 SELECT RAISE(ABORT,'V2_CONTRACTOR_INSURANCE_REQUIRED') WHERE NEW.contractor_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM v2_contractor_credentials c WHERE c.contractor_id=NEW.contractor_id
 AND c.credential_type='insurance' AND c.status='verified' AND c.valid_until>NEW.assigned_at);
 SELECT RAISE(ABORT,'V2_TRADE_LICENCE_REQUIRED') WHERE NEW.contractor_id IS NOT NULL AND
 (SELECT trade FROM v2_maintenance_tasks WHERE id=NEW.task_id) IN('electrical','plumbing','fire')
 AND NOT EXISTS(SELECT 1 FROM v2_contractor_credentials c JOIN v2_maintenance_tasks t ON t.id=NEW.task_id
 WHERE c.contractor_id=NEW.contractor_id AND c.credential_type='licence'
 AND c.trade=t.trade AND c.status='verified' AND c.valid_until>NEW.assigned_at);
 SELECT RAISE(ABORT,'V2_CONTRACTOR_CREDENTIAL_REQUIRED') WHERE NEW.contractor_id IS NOT NULL AND EXISTS(
 SELECT 1 FROM v2_task_credential_requirements r WHERE r.task_id=NEW.task_id AND NOT EXISTS(
 SELECT 1 FROM v2_contractor_credentials c JOIN v2_maintenance_tasks t ON t.id=NEW.task_id
 WHERE c.contractor_id=NEW.contractor_id AND c.credential_type=r.credential_type
 AND (c.trade=t.trade OR c.trade='general') AND c.status='verified' AND c.valid_until>NEW.assigned_at));
END;
CREATE TRIGGER v2_assignment_release_only BEFORE UPDATE ON v2_task_assignments
WHEN OLD.status!='confirmed' OR NEW.status!='released'
OR NEW.task_id!=OLD.task_id OR NEW.staff_user_id IS NOT OLD.staff_user_id
OR NEW.contractor_id IS NOT OLD.contractor_id
BEGIN SELECT RAISE(ABORT,'V2_ASSIGNMENT_IMMUTABLE'); END;
CREATE TRIGGER v2_assignment_no_delete BEFORE DELETE ON v2_task_assignments
BEGIN SELECT RAISE(ABORT,'V2_ASSIGNMENT_HISTORY_IMMUTABLE'); END;

-- Internal resource calendar. Existing public 'default' booking capacity remains independent.
CREATE TABLE v2_capacity_resources (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN('staff','contractor','equipment','vehicle','space')),
 name TEXT NOT NULL, staff_user_id TEXT REFERENCES staff_profiles(user_id),
 contractor_id TEXT REFERENCES contractors(id), region TEXT NOT NULL DEFAULT 'Perth WA',
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK((kind='staff' AND staff_user_id IS NOT NULL AND contractor_id IS NULL) OR
 (kind='contractor' AND contractor_id IS NOT NULL AND staff_user_id IS NULL) OR
 (kind IN('equipment','vehicle','space') AND staff_user_id IS NULL AND contractor_id IS NULL))
) STRICT;
CREATE UNIQUE INDEX v2_staff_resource_once ON v2_capacity_resources(staff_user_id) WHERE staff_user_id IS NOT NULL;
CREATE UNIQUE INDEX v2_contractor_resource_once ON v2_capacity_resources(contractor_id) WHERE contractor_id IS NOT NULL;
CREATE TABLE v2_resource_skills (
 resource_id TEXT NOT NULL REFERENCES v2_capacity_resources(id),
 trade TEXT NOT NULL CHECK(trade IN
 ('general','inspections','cleaning','grounds','carpentry','electrical','plumbing','fire','hvac','access','compliance')),
 verified_by TEXT NOT NULL REFERENCES users(id), verified_at TEXT NOT NULL,
 PRIMARY KEY(resource_id,trade)
) STRICT;
CREATE TABLE v2_roster_windows (
 id TEXT PRIMARY KEY, resource_id TEXT NOT NULL REFERENCES v2_capacity_resources(id),
 weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),
 starts_minute INTEGER NOT NULL CHECK(starts_minute BETWEEN 0 AND 1425),
 ends_minute INTEGER NOT NULL CHECK(ends_minute BETWEEN 15 AND 1440),
 CHECK(ends_minute>starts_minute)
) STRICT;
CREATE INDEX v2_roster_resource ON v2_roster_windows(resource_id,weekday);
CREATE TABLE v2_capacity_blocks (
 id TEXT PRIMARY KEY, resource_id TEXT NOT NULL REFERENCES v2_capacity_resources(id),
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 reason TEXT NOT NULL, recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 CHECK(ends_at>starts_at)
) STRICT;
CREATE INDEX v2_blocks_range ON v2_capacity_blocks(resource_id,starts_at,ends_at);
CREATE TABLE v2_resource_allocations (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES v2_maintenance_tasks(id),
 resource_id TEXT NOT NULL REFERENCES v2_capacity_resources(id),
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN('confirmed','released','completed')),
 allocation_reference TEXT NOT NULL, allocated_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK(ends_at>starts_at),
 UNIQUE(task_id,resource_id,starts_at)
) STRICT;
CREATE INDEX v2_allocations_range ON v2_resource_allocations(resource_id,status,starts_at,ends_at);
CREATE INDEX v2_allocations_task ON v2_resource_allocations(task_id,status);
CREATE TRIGGER v2_capacity_block_guard BEFORE INSERT ON v2_capacity_blocks
BEGIN
 SELECT RAISE(ABORT,'V2_BLOCK_ALLOCATION_CONFLICT') WHERE EXISTS(
 SELECT 1 FROM v2_resource_allocations a WHERE a.resource_id=NEW.resource_id AND a.status='confirmed'
 AND a.starts_at<NEW.ends_at AND a.ends_at>NEW.starts_at);
 SELECT RAISE(ABORT,'V2_BLOCK_BOOKING_CONFLICT') WHERE EXISTS(
 SELECT 1 FROM v2_capacity_resources r JOIN work_orders w ON w.assigned_staff_id=r.staff_user_id
 JOIN bookings b ON b.id=w.booking_id WHERE r.id=NEW.resource_id AND r.kind='staff' AND b.status!='cancelled'
 AND b.reserved_start<NEW.ends_at AND b.reserved_end>NEW.starts_at);
END;
CREATE TRIGGER v2_allocation_guard BEFORE INSERT ON v2_resource_allocations
BEGIN
 SELECT RAISE(ABORT,'V2_RESOURCE_INACTIVE') WHERE NOT EXISTS(
 SELECT 1 FROM v2_capacity_resources r WHERE r.id=NEW.resource_id AND r.active=1);
 SELECT RAISE(ABORT,'V2_TASK_NOT_SCHEDULABLE') WHERE NOT EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id
 WHERE t.id=NEW.task_id AND t.status IN('assigned','scheduled') AND w.status NOT IN('completed','cancelled'));
 SELECT RAISE(ABORT,'V2_TASK_RESOURCE_UNASSIGNED') WHERE EXISTS(
 SELECT 1 FROM v2_capacity_resources r WHERE r.id=NEW.resource_id AND r.kind IN('staff','contractor')
 AND NOT EXISTS(SELECT 1 FROM v2_task_assignments a WHERE a.task_id=NEW.task_id
 AND a.status='confirmed' AND (a.staff_user_id=r.staff_user_id AND r.kind='staff'
 OR a.contractor_id=r.contractor_id AND r.kind='contractor')));
 SELECT RAISE(ABORT,'V2_RESOURCE_TRADE_MISMATCH') WHERE EXISTS(
 SELECT 1 FROM v2_capacity_resources r JOIN v2_maintenance_tasks t ON t.id=NEW.task_id
 WHERE r.id=NEW.resource_id AND r.kind IN('staff','contractor') AND NOT EXISTS(
 SELECT 1 FROM v2_resource_skills s WHERE s.resource_id=r.id AND s.trade=t.trade));
 SELECT RAISE(ABORT,'V2_RESOURCE_TIME_INVALID') WHERE
 NEW.starts_at>=NEW.ends_at OR
 (julianday(NEW.ends_at)-julianday(NEW.starts_at))*24*60>720 OR
 strftime('%Y-%m-%d',NEW.starts_at,'+8 hours')!=strftime('%Y-%m-%d',NEW.ends_at,'+8 hours') OR
 CAST(strftime('%M',NEW.starts_at,'+8 hours') AS INTEGER)%15!=0 OR
 CAST(strftime('%s',NEW.starts_at) AS INTEGER)%60!=0;
 SELECT RAISE(ABORT,'V2_OUTSIDE_ROSTER') WHERE NOT EXISTS(
 SELECT 1 FROM v2_roster_windows r WHERE r.resource_id=NEW.resource_id
 AND r.weekday=CASE CAST(strftime('%w',NEW.starts_at,'+8 hours') AS INTEGER)
 WHEN 0 THEN 7 ELSE CAST(strftime('%w',NEW.starts_at,'+8 hours') AS INTEGER) END
 AND r.starts_minute <= (CAST(strftime('%H',NEW.starts_at,'+8 hours') AS INTEGER)*60+CAST(strftime('%M',NEW.starts_at,'+8 hours') AS INTEGER))
 AND r.ends_minute >= (CAST(strftime('%H',NEW.ends_at,'+8 hours') AS INTEGER)*60+CAST(strftime('%M',NEW.ends_at,'+8 hours') AS INTEGER)));
 SELECT RAISE(ABORT,'V2_RESOURCE_DOUBLE_BOOKED') WHERE EXISTS(
 SELECT 1 FROM v2_resource_allocations a WHERE a.resource_id=NEW.resource_id AND a.status='confirmed'
 AND a.starts_at<NEW.ends_at AND a.ends_at>NEW.starts_at);
 SELECT RAISE(ABORT,'V2_RESOURCE_BLOCKED') WHERE EXISTS(
 SELECT 1 FROM v2_capacity_blocks b WHERE b.resource_id=NEW.resource_id
 AND b.starts_at<NEW.ends_at AND b.ends_at>NEW.starts_at);
 SELECT RAISE(ABORT,'V2_STAFF_LEGACY_BOOKING_CONFLICT') WHERE EXISTS(
 SELECT 1 FROM v2_capacity_resources r JOIN work_orders w ON w.assigned_staff_id=r.staff_user_id
 JOIN bookings b ON b.id=w.booking_id JOIN v2_maintenance_tasks t ON t.id=NEW.task_id
 WHERE r.id=NEW.resource_id AND r.kind='staff' AND b.status!='cancelled'
 AND w.id!=t.work_order_id AND b.reserved_start<NEW.ends_at AND b.reserved_end>NEW.starts_at);
 SELECT RAISE(ABORT,'V2_BOOKED_JOB_WINDOW_MISMATCH') WHERE EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id
 JOIN bookings b ON b.id=w.booking_id WHERE t.id=NEW.task_id AND b.status!='cancelled'
 AND (NEW.starts_at<b.starts_at OR NEW.ends_at>b.ends_at));
 SELECT RAISE(ABORT,'V2_CONTRACTOR_CREDENTIAL_EXPIRED') WHERE EXISTS(
 SELECT 1 FROM v2_capacity_resources r JOIN v2_task_assignments a ON a.contractor_id=r.contractor_id
 JOIN v2_maintenance_tasks t ON t.id=a.task_id WHERE r.id=NEW.resource_id AND r.kind='contractor'
 AND t.id=NEW.task_id AND a.status='confirmed' AND (
 NOT EXISTS(SELECT 1 FROM v2_contractor_credentials c WHERE c.contractor_id=r.contractor_id
 AND c.credential_type='insurance' AND c.status='verified' AND c.valid_until>NEW.ends_at)
 OR (t.trade IN('electrical','plumbing','fire') AND NOT EXISTS(
 SELECT 1 FROM v2_contractor_credentials c WHERE c.contractor_id=r.contractor_id
 AND c.credential_type='licence' AND c.trade=t.trade AND c.status='verified' AND c.valid_until>NEW.ends_at))
 OR EXISTS(SELECT 1 FROM v2_task_credential_requirements cr WHERE cr.task_id=t.id
 AND NOT EXISTS(SELECT 1 FROM v2_contractor_credentials c
 WHERE c.contractor_id=r.contractor_id AND c.credential_type=cr.credential_type
 AND (c.trade=t.trade OR c.trade='general') AND c.status='verified' AND c.valid_until>NEW.ends_at))
 ));
END;
CREATE TRIGGER v2_allocation_status_guard BEFORE UPDATE ON v2_resource_allocations
WHEN OLD.status!='confirmed' OR NEW.status NOT IN('released','completed')
 OR NEW.id!=OLD.id OR NEW.task_id!=OLD.task_id OR NEW.resource_id!=OLD.resource_id
 OR NEW.starts_at!=OLD.starts_at OR NEW.ends_at!=OLD.ends_at
BEGIN SELECT RAISE(ABORT,'V2_ALLOCATION_IMMUTABLE'); END;
CREATE TRIGGER v2_allocation_no_delete BEFORE DELETE ON v2_resource_allocations
BEGIN SELECT RAISE(ABORT,'V2_ALLOCATION_IMMUTABLE'); END;
-- Legacy booking-to-staff assignment must not double-book a staff member already allocated to V2 work.
CREATE TRIGGER v2_legacy_staff_assignment_collision BEFORE UPDATE OF assigned_staff_id ON work_orders
WHEN NEW.assigned_staff_id IS NOT NULL AND NEW.booking_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'V2_STAFF_CAPACITY_CONFLICT') WHERE EXISTS(
 SELECT 1 FROM bookings b JOIN v2_capacity_resources r ON r.staff_user_id=NEW.assigned_staff_id AND r.kind='staff'
 JOIN v2_resource_allocations a ON a.resource_id=r.id AND a.status='confirmed'
 JOIN v2_maintenance_tasks t ON t.id=a.task_id
 WHERE b.id=NEW.booking_id AND t.work_order_id!=NEW.id
 AND b.reserved_start<a.ends_at AND b.reserved_end>a.starts_at);
END;

-- Evidence is a reference to existing, explicitly granted private documents or reviewed closeout notes.
CREATE TABLE v2_task_evidence (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES v2_maintenance_tasks(id),
 kind TEXT NOT NULL CHECK(kind IN('note','photo','report','invoice','certificate')),
 document_id TEXT REFERENCES documents(id), reference TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','verified','rejected')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 verified_by TEXT REFERENCES users(id), verified_at TEXT,
 CHECK(status!='verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
) STRICT;
CREATE INDEX v2_evidence_task ON v2_task_evidence(task_id,status);
CREATE TRIGGER v2_evidence_scope BEFORE INSERT ON v2_task_evidence
BEGIN
 SELECT RAISE(ABORT,'V2_TASK_TERMINAL') WHERE NOT EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t WHERE t.id=NEW.task_id AND t.status NOT IN('completed','cancelled'));
 SELECT RAISE(ABORT,'V2_EVIDENCE_DOCUMENT_SCOPE') WHERE NEW.document_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM documents d JOIN v2_maintenance_tasks t ON t.id=NEW.task_id
 JOIN work_orders w ON w.id=t.work_order_id WHERE d.id=NEW.document_id
 AND d.property_id IS w.property_id AND d.scheme_id IS w.scheme_id AND d.status='issued');
END;
CREATE TRIGGER v2_evidence_update_guard BEFORE UPDATE ON v2_task_evidence
WHEN OLD.status!='submitted' OR NEW.status NOT IN('verified','rejected')
 OR NEW.task_id!=OLD.task_id OR NEW.document_id IS NOT OLD.document_id
 OR NEW.reference!=OLD.reference OR NEW.kind!=OLD.kind
BEGIN SELECT RAISE(ABORT,'V2_EVIDENCE_IMMUTABLE'); END;
CREATE TRIGGER v2_evidence_no_delete BEFORE DELETE ON v2_task_evidence
BEGIN SELECT RAISE(ABORT,'V2_EVIDENCE_IMMUTABLE'); END;

-- Approved staff cost rates are historical immutable versions, never public account data.
CREATE TABLE v2_staff_cost_rates (
 id TEXT PRIMARY KEY, staff_user_id TEXT NOT NULL REFERENCES staff_profiles(user_id),
 effective_from TEXT NOT NULL, hourly_cost_cents INTEGER NOT NULL CHECK(hourly_cost_cents>=0),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved')),
 approval_reference TEXT, approved_by TEXT REFERENCES users(id), approved_at TEXT,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(staff_user_id,effective_from)
) STRICT;
CREATE TRIGGER v2_rate_approval_gate BEFORE UPDATE OF status ON v2_staff_cost_rates WHEN NEW.status='approved'
BEGIN SELECT RAISE(ABORT,'V2_RATE_APPROVAL_REQUIRED') WHERE NEW.approved_by IS NULL
 OR NEW.approved_at IS NULL OR LENGTH(TRIM(COALESCE(NEW.approval_reference,'')))<4; END;
CREATE TRIGGER v2_staff_rate_lock BEFORE UPDATE ON v2_staff_cost_rates WHEN OLD.status='approved'
BEGIN SELECT RAISE(ABORT,'V2_STAFF_RATE_IMMUTABLE'); END;
CREATE TRIGGER v2_staff_rate_delete BEFORE DELETE ON v2_staff_cost_rates
BEGIN SELECT RAISE(ABORT,'V2_STAFF_RATE_IMMUTABLE'); END;
CREATE TABLE v2_task_entitlement_links (
 task_id TEXT PRIMARY KEY REFERENCES v2_maintenance_tasks(id),
 subscription_id TEXT NOT NULL REFERENCES v2_subscription_periods(id),
 service_code TEXT NOT NULL REFERENCES v2_services(code),
 linked_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER v2_entitlement_scope BEFORE INSERT ON v2_task_entitlement_links
BEGIN
 SELECT RAISE(ABORT,'V2_TASK_ENTITLEMENT_SCOPE') WHERE NOT EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id
 JOIN v2_subscription_periods s ON s.id=NEW.subscription_id
 JOIN v2_engagements e ON e.id=s.engagement_id JOIN v2_plan_services ps ON ps.plan_id=s.plan_id
 JOIN v2_market_service_rules mr ON mr.market_code=e.market_code AND mr.service_code=NEW.service_code
 WHERE t.id=NEW.task_id AND t.status NOT IN('completed','cancelled')
 AND w.client_id=e.client_id AND w.property_id IS e.property_id AND w.scheme_id IS e.scheme_id
 AND s.status='active' AND e.status='active'
 AND ps.service_code=NEW.service_code AND ps.inclusion='included' AND mr.status='approved'
 AND EXISTS(SELECT 1 FROM v2_services ss WHERE ss.code=NEW.service_code AND ss.status='approved'));
END;
CREATE TRIGGER v2_entitlement_immutable_u BEFORE UPDATE ON v2_task_entitlement_links
BEGIN SELECT RAISE(ABORT,'V2_ENTITLEMENT_LINK_IMMUTABLE'); END;
CREATE TRIGGER v2_entitlement_immutable_d BEFORE DELETE ON v2_task_entitlement_links
BEGIN SELECT RAISE(ABORT,'V2_ENTITLEMENT_LINK_IMMUTABLE'); END;
CREATE TABLE v2_time_entries (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES v2_maintenance_tasks(id),
 staff_user_id TEXT NOT NULL REFERENCES staff_profiles(user_id),
 started_at TEXT NOT NULL, ended_at TEXT NOT NULL,
 minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 720),
 activity_kind TEXT NOT NULL CHECK(activity_kind IN('on_site','travel','inspection','coordination','administration')),
 note TEXT NOT NULL DEFAULT '', source_key TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','approved','rejected')),
 rate_id TEXT REFERENCES v2_staff_cost_rates(id), hourly_cost_cents INTEGER CHECK(hourly_cost_cents>=0),
 cost_cents INTEGER CHECK(cost_cents>=0),
 reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, submitted_at TEXT NOT NULL,
 CHECK(ended_at>started_at),
 CHECK(status!='approved' OR (rate_id IS NOT NULL AND hourly_cost_cents IS NOT NULL
 AND cost_cents IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 UNIQUE(staff_user_id,source_key)
) STRICT;
CREATE INDEX v2_time_task ON v2_time_entries(task_id,status);
CREATE INDEX v2_time_staff ON v2_time_entries(staff_user_id,started_at,status);
CREATE TRIGGER v2_time_insert_guard BEFORE INSERT ON v2_time_entries
BEGIN
 SELECT RAISE(ABORT,'V2_TIME_TASK_INVALID') WHERE NOT EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id
 WHERE t.id=NEW.task_id AND t.status IN('assigned','scheduled','in_progress','evidence_pending')
 AND w.status NOT IN('completed','cancelled'));
 SELECT RAISE(ABORT,'V2_TIME_NOT_ASSIGNED') WHERE NOT EXISTS(
 SELECT 1 FROM v2_task_assignments a WHERE a.task_id=NEW.task_id
 AND a.staff_user_id=NEW.staff_user_id AND a.status='confirmed');
 SELECT RAISE(ABORT,'V2_TIME_INVALID') WHERE
 NEW.ended_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') OR
 ABS((julianday(NEW.ended_at)-julianday(NEW.started_at))*1440-NEW.minutes)>0.02;
 SELECT RAISE(ABORT,'V2_TIME_OVERLAP') WHERE EXISTS(
 SELECT 1 FROM v2_time_entries e WHERE e.staff_user_id=NEW.staff_user_id
 AND e.status IN('submitted','approved') AND e.started_at<NEW.ended_at AND e.ended_at>NEW.started_at);
END;
CREATE TRIGGER v2_time_review_guard BEFORE UPDATE ON v2_time_entries
WHEN OLD.status!='submitted' OR NEW.status NOT IN('approved','rejected')
 OR NEW.id!=OLD.id OR NEW.task_id!=OLD.task_id OR NEW.staff_user_id!=OLD.staff_user_id
 OR NEW.started_at!=OLD.started_at OR NEW.ended_at!=OLD.ended_at
 OR NEW.minutes!=OLD.minutes OR NEW.source_key!=OLD.source_key
BEGIN SELECT RAISE(ABORT,'V2_TIME_IMMUTABLE'); END;
CREATE TRIGGER v2_time_no_delete BEFORE DELETE ON v2_time_entries
BEGIN SELECT RAISE(ABORT,'V2_TIME_IMMUTABLE'); END;
CREATE TABLE v2_external_costs (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES v2_maintenance_tasks(id),
 contractor_id TEXT REFERENCES contractors(id), category TEXT NOT NULL CHECK(category IN
 ('contractor','materials','equipment','travel','other')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
 invoice_reference TEXT NOT NULL, source_key TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','approved','rejected')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT,
 CHECK(status!='approved' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 UNIQUE(task_id,source_key)
) STRICT;
CREATE INDEX v2_cost_task ON v2_external_costs(task_id,status);
CREATE TRIGGER v2_external_cost_guard BEFORE INSERT ON v2_external_costs
BEGIN
 SELECT RAISE(ABORT,'V2_COST_TASK_INVALID') WHERE NOT EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id
 WHERE t.id=NEW.task_id AND t.status NOT IN('completed','cancelled')
 AND w.status NOT IN('completed','cancelled'));
 SELECT RAISE(ABORT,'V2_COST_CONTRACTOR_UNASSIGNED') WHERE NEW.contractor_id IS NOT NULL AND
 NOT EXISTS(SELECT 1 FROM v2_task_assignments a WHERE a.task_id=NEW.task_id
 AND a.contractor_id=NEW.contractor_id AND a.status='confirmed');
END;
CREATE TRIGGER v2_external_cost_review_guard BEFORE UPDATE ON v2_external_costs
WHEN OLD.status!='submitted' OR NEW.status NOT IN('approved','rejected')
 OR NEW.task_id!=OLD.task_id OR NEW.amount_cents!=OLD.amount_cents
 OR NEW.category!=OLD.category OR NEW.contractor_id IS NOT OLD.contractor_id
 OR NEW.invoice_reference!=OLD.invoice_reference OR NEW.source_key!=OLD.source_key
BEGIN SELECT RAISE(ABORT,'V2_COST_IMMUTABLE'); END;
CREATE TRIGGER v2_external_cost_no_delete BEFORE DELETE ON v2_external_costs
BEGIN SELECT RAISE(ABORT,'V2_COST_IMMUTABLE'); END;

-- No unreviewed cost may be approved beyond the scoped task budget. Quote/approval changes require rescoping.
CREATE TRIGGER v2_time_budget_guard BEFORE UPDATE OF status ON v2_time_entries WHEN NEW.status='approved'
BEGIN
 SELECT RAISE(ABORT,'V2_TASK_BUDGET_EXCEEDED') WHERE EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t WHERE t.id=NEW.task_id AND t.budget_ceiling_cents>0
 AND ((SELECT COALESCE(SUM(e.cost_cents),0) FROM v2_time_entries e WHERE e.task_id=t.id AND e.status='approved')
 + (SELECT COALESCE(SUM(c.amount_cents),0) FROM v2_external_costs c WHERE c.task_id=t.id AND c.status='approved')
 + NEW.cost_cents)>t.budget_ceiling_cents);
END;
CREATE TRIGGER v2_cost_budget_guard BEFORE UPDATE OF status ON v2_external_costs WHEN NEW.status='approved'
BEGIN
 SELECT RAISE(ABORT,'V2_TASK_BUDGET_EXCEEDED') WHERE EXISTS(
 SELECT 1 FROM v2_maintenance_tasks t WHERE t.id=NEW.task_id AND t.budget_ceiling_cents>0
 AND ((SELECT COALESCE(SUM(e.cost_cents),0) FROM v2_time_entries e WHERE e.task_id=t.id AND e.status='approved')
 + (SELECT COALESCE(SUM(c.amount_cents),0) FROM v2_external_costs c WHERE c.task_id=t.id AND c.status='approved')
 + NEW.amount_cents)>t.budget_ceiling_cents);
END;
