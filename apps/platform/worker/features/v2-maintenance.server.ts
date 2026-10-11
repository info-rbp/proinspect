import { z } from 'zod';
import { assert, now, statement, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { operationsWrite, workOrderAccess } from '../../../../packages/authorization/server';
import { activity, recordId, shortText, reference, isoDate, guard, clearGuard } from '../../../../packages/operations/core';
const ident=z.string().regex(/^[a-zA-Z0-9_:-]+$/).max(180);
const whole=(max=100000000)=>z.coerce.number().int().min(0).max(max);
const actionStates=['scoped','awaiting_approval','approved','assigned','scheduled','in_progress','evidence_pending','completed','cancelled'] as const;
const trades=['general','inspections','cleaning','grounds','carpentry','electrical','plumbing','fire','hvac','access','compliance'] as const;
const metrics=['hours_milli','visits','tickets','reports'] as const;
function editor(user:Principal,w:Workspace){assert(w.kind==='staff',403,'STAFF_REQUIRED','Staff workspace required.');operationsWrite(user);}
function reader(user:Principal,w:Workspace){assert(w.kind==='staff'&&user.staffRole&&user.staffRole!=='inspector',403,'OPERATIONS_REQUIRED','Operations access required.');}
async function task(env:Env,id:string) {
 const row=await statement(env.DB,'SELECT t.*,w.property_id,w.scheme_id,w.client_id,w.status AS order_status FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id WHERE t.id=?',id).first<Record<string,any>>();
 assert(row,404,'TASK_NOT_FOUND','Maintenance task unavailable.');return row;
}
async function record(env:Env,user:Principal,sql:string,args:(string|number|null)[],name:string,entity:string,id:string,propertyId:string|null=null,schemeId:string|null=null){
 await env.DB.batch([statement(env.DB,sql,...args),guard(env),activity(env,user,name,entity,id,propertyId,schemeId),clearGuard(env)]);
}
export async function maintenanceData(env:Env,user:Principal,w:Workspace,orderId:string|null) {
 reader(user,w);
 const where=orderId?' WHERE t.work_order_id=?':'';
 if(orderId)await workOrderAccess(env,user,w,orderId);
 const tasks=await statement(env.DB,'SELECT t.*,w.reference AS work_reference,w.title AS work_title FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id'+where+' ORDER BY t.created_at DESC LIMIT 200',...(orderId?[orderId]:[])).all();
 const [assignments,resources,skills,rosters,blocks,allocations,evidence,time,cost,rates,credentials,links,staff,contractors,orders,assets,subscriptions]=await Promise.all([
  statement(env.DB,'SELECT * FROM v2_task_assignments ORDER BY assigned_at DESC LIMIT 200').all(),
  statement(env.DB,'SELECT * FROM v2_capacity_resources ORDER BY name LIMIT 200').all(),
  statement(env.DB,'SELECT * FROM v2_resource_skills LIMIT 300').all(),
  statement(env.DB,'SELECT * FROM v2_roster_windows LIMIT 500').all(),
  statement(env.DB,'SELECT * FROM v2_capacity_blocks ORDER BY starts_at DESC LIMIT 200').all(),
  statement(env.DB,'SELECT * FROM v2_resource_allocations ORDER BY starts_at DESC LIMIT 300').all(),
  statement(env.DB,'SELECT id,task_id,kind,document_id,reference,status,created_at FROM v2_task_evidence ORDER BY created_at DESC LIMIT 200').all(),
  statement(env.DB,'SELECT id,task_id,staff_user_id,started_at,ended_at,minutes,activity_kind,status,cost_cents,source_key FROM v2_time_entries ORDER BY submitted_at DESC LIMIT 300').all(),
  statement(env.DB,'SELECT id,task_id,contractor_id,category,amount_cents,invoice_reference,status FROM v2_external_costs ORDER BY created_at DESC LIMIT 300').all(),
  statement(env.DB,'SELECT id,staff_user_id,effective_from,hourly_cost_cents,status FROM v2_staff_cost_rates ORDER BY effective_from DESC LIMIT 200').all(),
  statement(env.DB,'SELECT id,contractor_id,credential_type,trade,valid_until,status FROM v2_contractor_credentials ORDER BY created_at DESC LIMIT 200').all(),
  statement(env.DB,'SELECT * FROM v2_task_entitlement_links LIMIT 200').all(),
  statement(env.DB,"SELECT s.user_id AS id,u.email,u.display_name,s.role FROM staff_profiles s JOIN users u ON u.id=s.user_id WHERE s.active=1 AND u.active=1 AND s.role!='read_only' LIMIT 200").all(),
  statement(env.DB,'SELECT id,name,email FROM contractors WHERE active=1 ORDER BY name LIMIT 200').all(),
  statement(env.DB,"SELECT id,reference,title,status,client_id,property_id,scheme_id FROM work_orders WHERE status NOT IN('completed','cancelled') ORDER BY updated_at DESC LIMIT 250").all(),
  statement(env.DB,'SELECT id,name,property_id,scheme_id FROM v2_assets WHERE status=? LIMIT 300','active').all(),
  statement(env.DB,"SELECT s.id,e.reference AS engagement_reference,p.market_code FROM v2_subscription_periods s JOIN v2_engagements e ON e.id=s.engagement_id JOIN v2_plan_versions p ON p.id=s.plan_id WHERE s.status='active' AND e.status='active' LIMIT 200").all()
 ]);
 return {tasks:tasks.results,assignments:assignments.results,resources:resources.results,skills:skills.results,rosters:rosters.results,
 blocks:blocks.results,allocations:allocations.results,evidence:evidence.results,time:time.results,cost:cost.results,rates:rates.results,
 credentials:credentials.results,links:links.results,staff:staff.results,contractors:contractors.results,orders:orders.results,
 assets:assets.results,subscriptions:subscriptions.results};
}
export async function maintenanceCommand(env:Env,user:Principal,w:Workspace,route:string[],input:unknown) {
 const [kind,key,verb]=route;
 // Inspector may submit own time/evidence, never alter finance or allocations.
 const inspectorAllowed=user.staffRole==='inspector'&&w.kind==='staff'&&
  ((kind==='time'&&!key)||(kind==='evidence'&&!key));
 if(!inspectorAllowed) editor(user,w);
 const d=input;
 if(kind==='tasks'&&!key){
  const x=z.object({workOrderId:recordId,assetId:ident.optional(),title:shortText,instructions:z.string().max(3000).default(''),
   publicSummary:z.string().max(200).default(''),trade:z.enum(trades),priority:z.enum(['routine','urgent','emergency']).default('routine'),
   approvalRequired:z.boolean().default(false),budgetCeilingCents:whole(),evidenceKind:z.enum(['note','photo','report','certificate']).default('note')}).parse(d);
  const wo=await workOrderAccess(env,user,w,x.workOrderId,true);
  assert(!['completed','cancelled'].includes(wo.status),409,'ORDER_TERMINAL','Work order is closed.');
  const taskId=uid('v2task'),t=now();
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_maintenance_tasks(id,work_order_id,asset_id,title,instructions,public_summary,trade,priority,approval_required,budget_ceiling_cents,evidence_kind,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
   taskId,x.workOrderId,x.assetId??null,x.title,x.instructions,x.publicSummary,x.trade,x.priority,x.approvalRequired?1:0,x.budgetCeilingCents,x.evidenceKind,user.id,t,t),
   activity(env,user,'v2.task_created','maintenance-task',taskId,wo.property_id,wo.scheme_id)]);
  return {id:taskId};
 }
 if(kind==='tasks'&&key&&verb==='status'){
  const x=z.object({status:z.enum(actionStates),version:whole(),completionNotes:z.string().max(2000).optional()}).parse(d);
  const t=await task(env,key);assert(t.version===x.version,409,'TASK_STALE','The task has changed.');
  if(x.status==='completed') assert(x.completionNotes&&x.completionNotes.trim().length>=4,422,'CLOSEOUT_NOTES_REQUIRED','Provide a closeout reference after verification of evidence.');
  await record(env,user,'UPDATE v2_maintenance_tasks SET status=?,version=version+1,updated_at=?,completed_by=?,completed_at=? WHERE id=? AND version=?',
   [x.status,now(),x.status==='completed'?user.id:null,x.status==='completed'?now():null,key,x.version],
   'v2.task_status_changed','maintenance-task',key,t.property_id,t.scheme_id);
  return {id:key,status:x.status};
 }
 if(kind==='tasks'&&key&&verb==='requirement'){
  const x=z.object({credentialType:z.enum(['insurance','licence','competency','site_induction'])}).parse(d);
  const t=await task(env,key);assert(t.status==='scoped',409,'TASK_SCOPE_LOCKED','Task already started.');
  await env.DB.batch([statement(env.DB,'INSERT INTO v2_task_credential_requirements(task_id,credential_type) VALUES(?,?) ON CONFLICT DO NOTHING',key,x.credentialType),
   activity(env,user,'v2.task_credential_required','maintenance-task',key,t.property_id,t.scheme_id)]);
  return {taskId:key};
 }
 if(kind==='credentials'&&!key){
  const x=z.object({contractorId:recordId,credentialType:z.enum(['insurance','licence','competency','site_induction']),trade:z.enum(trades),
   credentialReference:reference,verificationReference:reference,validUntil:isoDate}).parse(d);
  assert(x.validUntil>now(),422,'CREDENTIAL_EXPIRED','Credential expiry must be future.');
  const credentialId=uid('v2cred');
  await env.DB.batch([statement(env.DB,
    'INSERT INTO v2_contractor_credentials(id,contractor_id,credential_type,trade,credential_reference,verification_reference,verified_by,verified_at,valid_until,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    credentialId,x.contractorId,x.credentialType,x.trade,x.credentialReference,x.verificationReference,user.id,now(),x.validUntil,now()),
    activity(env,user,'v2.contractor_credential_verified','contractor-credential',credentialId)]);
  return {id:credentialId};
 }
 if(kind==='credentials'&&key&&verb==='revoke'){
  await record(env,user,"UPDATE v2_contractor_credentials SET status='revoked' WHERE id=? AND status='verified'",
   [key],'v2.credential_revoked','contractor-credential',key);
  return {id:key,status:'revoked'};
 }
 if(kind==='assignments'&&!key){
  const x=z.object({taskId:recordId,staffUserId:recordId.optional(),contractorId:recordId.optional(),instructionReference:reference}).parse(d);
  assert(Boolean(x.staffUserId)!==Boolean(x.contractorId),422,'ASSIGNEE_REQUIRED','Choose exactly one staff member or supplier.');
  const t=await task(env,x.taskId),assignmentId=uid('v2asg');
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_task_assignments(id,task_id,staff_user_id,contractor_id,instruction_reference,assigned_by,assigned_at) VALUES(?,?,?,?,?,?,?)',
   assignmentId,x.taskId,x.staffUserId??null,x.contractorId??null,x.instructionReference,user.id,now()),
   activity(env,user,'v2.task_assigned','task-assignment',assignmentId,t.property_id,t.scheme_id)]);
  return {id:assignmentId};
 }
 if(kind==='assignments'&&key&&verb==='release'){
  await record(env,user,"UPDATE v2_task_assignments SET status='released',released_at=? WHERE id=? AND status='confirmed'",
  [now(),key],'v2.assignment_released','task-assignment',key);return {id:key,status:'released'};
 }
 if(kind==='resources'&&!key){
  const x=z.object({name:shortText,kind:z.enum(['staff','contractor','equipment','vehicle','space']),
   staffUserId:recordId.optional(),contractorId:recordId.optional(),region:z.string().trim().min(2).max(120).default('Perth WA')}).parse(d);
  const resourceId=uid('v2res');await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_capacity_resources(id,kind,name,staff_user_id,contractor_id,region,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)',
   resourceId,x.kind,x.name,x.staffUserId??null,x.contractorId??null,x.region,user.id,now()),
   activity(env,user,'v2.capacity_resource_created','resource',resourceId)]);
  return {id:resourceId};
 }
 if(kind==='resources'&&key&&verb==='skill'){
  const x=z.object({trade:z.enum(trades)}).parse(d);
  await env.DB.batch([statement(env.DB,'INSERT INTO v2_resource_skills(resource_id,trade,verified_by,verified_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',key,x.trade,user.id,now()),
   activity(env,user,'v2.resource_skill_verified','resource',key)]);
  return {id:key,trade:x.trade};
 }
 if(kind==='resources'&&key&&verb==='roster'){
  const x=z.object({weekday:z.coerce.number().int().min(1).max(7),startsMinute:whole(1425),endsMinute:whole(1440)}).parse(d);
  assert(x.endsMinute>x.startsMinute,422,'ROSTER_WINDOW_INVALID','End must follow start.');
  const rosterId=uid('v2rot');await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_roster_windows(id,resource_id,weekday,starts_minute,ends_minute) VALUES(?,?,?,?,?)',
    rosterId,key,x.weekday,x.startsMinute,x.endsMinute),activity(env,user,'v2.roster_added','resource',key)]);
  return {id:rosterId};
 }
 if(kind==='blocks'&&!key){
  const x=z.object({resourceId:recordId,startsAt:isoDate,endsAt:isoDate,reason:reference}).parse(d);
  assert(x.endsAt>x.startsAt,422,'BLOCK_DATES','Invalid unavailable period.');
  const blockId=uid('v2block');await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_capacity_blocks(id,resource_id,starts_at,ends_at,reason,recorded_by,created_at) VALUES(?,?,?,?,?,?,?)',
   blockId,x.resourceId,x.startsAt,x.endsAt,x.reason,user.id,now()),
   activity(env,user,'v2.capacity_blocked','resource',x.resourceId)]);
  return {id:blockId};
 }
 if(kind==='allocations'&&!key){
  const x=z.object({taskId:recordId,resourceId:recordId,startsAt:isoDate,endsAt:isoDate,allocationReference:reference}).parse(d);
  assert(x.endsAt>x.startsAt,422,'ALLOCATION_DATES','End must follow start.');
  const t=await task(env,x.taskId),allocationId=uid('v2alloc');
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_resource_allocations(id,task_id,resource_id,starts_at,ends_at,allocation_reference,allocated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
   allocationId,x.taskId,x.resourceId,x.startsAt,x.endsAt,x.allocationReference,user.id,now(),now()),
   activity(env,user,'v2.resource_allocated','allocation',allocationId,t.property_id,t.scheme_id)]);
  return {id:allocationId};
 }
 if(kind==='allocations'&&key&&verb==='release'){
  const x=z.object({status:z.enum(['released','completed'])}).parse(d);
  await record(env,user,"UPDATE v2_resource_allocations SET status=?,updated_at=? WHERE id=? AND status='confirmed'",
   [x.status,now(),key],'v2.allocation_updated','allocation',key);
  return {id:key,status:x.status};
 }
 if(kind==='evidence'&&!key){
  const x=z.object({taskId:recordId,kind:z.enum(['note','photo','report','invoice','certificate']),
    documentId:recordId.optional(),reference:reference}).parse(d);
  const t=await task(env,x.taskId);
  if(user.staffRole==='inspector')await workOrderAccess(env,user,w,t.work_order_id,true);
  if(x.kind!=='note')assert(x.documentId,422,'DOCUMENT_REQUIRED','Non-note evidence must be an issued, authorised document.');
  const evidenceId=uid('v2ev');await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_task_evidence(id,task_id,kind,document_id,reference,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
   evidenceId,x.taskId,x.kind,x.documentId??null,x.reference,user.id,now()),
   activity(env,user,'v2.task_evidence_submitted','evidence',evidenceId,t.property_id,t.scheme_id)]);
  return {id:evidenceId};
 }
 if(kind==='evidence'&&key&&verb==='review'){
  const x=z.object({status:z.enum(['verified','rejected'])}).parse(d);
  await record(env,user,"UPDATE v2_task_evidence SET status=?,verified_by=?,verified_at=? WHERE id=? AND status='submitted'",
   [x.status,user.id,now(),key],'v2.evidence_reviewed','evidence',key);
  return {id:key,status:x.status};
 }
 if(kind==='rates'&&!key){
  const x=z.object({staffUserId:recordId,effectiveFrom:isoDate,hourlyCostCents:whole(10_000_000)}).parse(d);
  const rateId=uid('v2rate');await env.DB.batch([statement(env.DB,
  'INSERT INTO v2_staff_cost_rates(id,staff_user_id,effective_from,hourly_cost_cents,created_by,created_at) VALUES(?,?,?,?,?,?)',
  rateId,x.staffUserId,x.effectiveFrom,x.hourlyCostCents,user.id,now()),activity(env,user,'v2.staff_cost_rate_drafted','staff-rate',rateId)]);
  return {id:rateId};
 }
 if(kind==='rates'&&key&&verb==='approve'){
  const x=z.object({approvalReference:reference}).parse(d);
  await record(env,user,"UPDATE v2_staff_cost_rates SET status='approved',approved_by=?,approved_at=?,approval_reference=? WHERE id=? AND status='draft'",
    [user.id,now(),x.approvalReference,key],'v2.staff_cost_rate_approved','staff-rate',key);
  return {id:key,status:'approved'};
 }
 if(kind==='time'&&!key){
  const x=z.object({taskId:recordId,staffUserId:recordId,startedAt:isoDate,endedAt:isoDate,
   activityKind:z.enum(['on_site','travel','inspection','coordination','administration']),note:z.string().max(1000).default(''),sourceKey:reference}).parse(d);
  if(user.staffRole==='inspector'){
   assert(x.staffUserId===user.id,403,'SELF_TIME_ONLY','Inspectors may submit only their own time.');
   const t=await task(env,x.taskId);await workOrderAccess(env,user,w,t.work_order_id,true);
  }
  const minutes=Math.round((Date.parse(x.endedAt)-Date.parse(x.startedAt))/60000);
  assert(minutes>=1&&minutes<=720&&x.endedAt<=now(),422,'TIME_INVALID','Record a completed interval up to twelve hours.');
  const timeId=uid('v2time');await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_time_entries(id,task_id,staff_user_id,started_at,ended_at,minutes,activity_kind,note,source_key,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
   timeId,x.taskId,x.staffUserId,x.startedAt,x.endedAt,minutes,x.activityKind,x.note,x.sourceKey,now()),
   activity(env,user,'v2.time_submitted','time-entry',timeId)]);
  return {id:timeId,minutes};
 }
 if(kind==='time'&&key&&verb==='review'){
  const x=z.object({status:z.enum(['approved','rejected'])}).parse(d);
  const e=await statement(env.DB,'SELECT * FROM v2_time_entries WHERE id=?',key).first<Record<string,any>>();
  assert(e&&e.status==='submitted',409,'TIME_NOT_REVIEWABLE','Time entry is already reviewed.');
  assert(e.staff_user_id!==user.id,403,'SELF_TIME_APPROVAL','Staff cannot approve their own time.');
  if(x.status==='rejected'){
   await record(env,user,"UPDATE v2_time_entries SET status='rejected',reviewed_by=?,reviewed_at=? WHERE id=? AND status='submitted'",
   [user.id,now(),key],'v2.time_rejected','time-entry',key);return {id:key,status:x.status};
  }
  const rate=await statement(env.DB,"SELECT * FROM v2_staff_cost_rates WHERE staff_user_id=? AND status='approved' AND effective_from<=? ORDER BY effective_from DESC LIMIT 1",
   e.staff_user_id,e.started_at).first<Record<string,any>>();
  assert(rate,409,'COST_RATE_NOT_APPROVED','An effective approved staff cost rate is required.');
  const cents=Math.ceil(e.minutes*rate.hourly_cost_cents/60);
  assert(Number.isSafeInteger(cents),422,'COST_OVERFLOW','Calculated cost is too large.');
  const linked=await statement(env.DB,'SELECT * FROM v2_task_entitlement_links WHERE task_id=?',e.task_id).first<{subscription_id:string;service_code:string}>();
  const statements=[statement(env.DB,
    "UPDATE v2_time_entries SET status='approved',rate_id=?,hourly_cost_cents=?,cost_cents=?,reviewed_by=?,reviewed_at=? WHERE id=? AND status='submitted'",
    rate.id,rate.hourly_cost_cents,cents,user.id,now(),key),guard(env)];
  if(linked)statements.push(statement(env.DB,
    "INSERT INTO v2_usage_ledger(id,subscription_id,service_code,metric,quantity,source_key,work_order_id,created_by,created_at) SELECT ?,?,?,'hours_milli',?, ?,t.work_order_id,?,? FROM v2_maintenance_tasks t WHERE t.id=?",
    uid('v2usage'),linked.subscription_id,linked.service_code,Math.ceil(e.minutes*1000/60),
    'v2time:'+key,user.id,now(),e.task_id));
  statements.push(activity(env,user,'v2.time_approved','time-entry',key),clearGuard(env));
  await env.DB.batch(statements);
  return {id:key,status:'approved',costCents:cents};
 }
 if(kind==='costs'&&!key){
  const x=z.object({taskId:recordId,contractorId:recordId.optional(),
   category:z.enum(['contractor','materials','equipment','travel','other']),amountCents:whole(100_000_000),
   invoiceReference:reference,sourceKey:reference}).parse(d);
  const costId=uid('v2cost');await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_external_costs(id,task_id,contractor_id,category,amount_cents,invoice_reference,source_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
   costId,x.taskId,x.contractorId??null,x.category,x.amountCents,x.invoiceReference,x.sourceKey,user.id,now()),
   activity(env,user,'v2.cost_submitted','external-cost',costId)]);
  return {id:costId};
 }
 if(kind==='costs'&&key&&verb==='review'){
  const x=z.object({status:z.enum(['approved','rejected'])}).parse(d);
  await record(env,user,"UPDATE v2_external_costs SET status=?,reviewed_by=?,reviewed_at=? WHERE id=? AND status='submitted'",
   [x.status,user.id,now(),key],'v2.cost_reviewed','external-cost',key);
  return {id:key,status:x.status};
 }
 if(kind==='entitlements'&&!key){
  const x=z.object({taskId:recordId,subscriptionId:recordId,serviceCode:ident}).parse(d);
  const linkId=x.taskId;await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_task_entitlement_links(task_id,subscription_id,service_code,linked_by,created_at) VALUES(?,?,?,?,?)',
   x.taskId,x.subscriptionId,x.serviceCode,user.id,now()),
   activity(env,user,'v2.task_entitlement_linked','maintenance-task',linkId)]);
  return {taskId:linkId};
 }
 assert(false,404,'MAINTENANCE_OPERATION_UNKNOWN','Unknown maintenance operation.');
}