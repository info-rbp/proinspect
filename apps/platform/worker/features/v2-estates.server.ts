import {z} from 'zod';
import {assert,statement,now,uid,type Env} from '../../../../packages/database/types';
import type {Principal,Workspace} from '../../../../packages/domain/index';
import {operationsWrite} from '../../../../packages/authorization/server';
import {activity,guard,clearGuard,recordId,reference,shortText,dateOnly,nextMonthDate,isoDate} from '../../../../packages/operations/core';
const assetId=z.string().regex(/^[A-Za-z0-9:_-]+$/).max(180);
const amount=z.coerce.number().int().min(0).max(1_000_000_000);
const statusDecision=z.enum(['verified','rejected']);
function admin(user:Principal,w:Workspace){
 assert(w.kind==='staff'&&['administrator','operations_manager'].includes(user.staffRole??''),403,
 'V2_ASSET_STAFF_REQUIRED','Only authorised operations staff can maintain asset and compliance registers.');
 operationsWrite(user);
}
async function tx(env:Env,user:Principal,sql:string,args:(string|number|null)[],event:string,kind:string,id:string){
 await env.DB.batch([statement(env.DB,sql,...args),guard(env),activity(env,user,event,kind,id),clearGuard(env)]);
}
async function assetContext(env:Env,id:string){
 const a=await statement(env.DB,'SELECT id,property_id,scheme_id,status FROM v2_assets WHERE id=?',id).first<{id:string;property_id:string|null;scheme_id:string|null;status:string}>();
 assert(a&&a.status==='active',404,'V2_ASSET_UNKNOWN','Active asset not found.');
 return a;
}
async function engagementContext(env:Env,id:string,asset:string){
 const e=await statement(env.DB,'SELECT e.* FROM v2_engagements e JOIN v2_assets a ON a.property_id IS e.property_id AND a.scheme_id IS e.scheme_id WHERE e.id=? AND a.id=? AND e.status=?',
  id,asset,'active').first<Record<string,any>>();
 assert(e,409,'V2_ASSET_ENGAGEMENT_SCOPE','An active matching service engagement is required.');
 return e;
}
export async function estateRegister(env:Env,user:Principal,w:Workspace){
 admin(user,w);
 const queries=[
  "SELECT a.id,a.name,a.kind,a.property_id,a.scheme_id,a.parent_id,a.status,d.asset_code,d.manufacturer,d.model,d.serial_number,d.commissioned_on,d.design_life_months,d.replacement_cost_cents,d.criticality,d.lifecycle_status,d.last_condition_score,d.version AS profile_version FROM v2_assets a LEFT JOIN v2_asset_details d ON d.asset_id=a.id ORDER BY a.created_at DESC LIMIT 350",
  "SELECT c.id,c.asset_id,c.score,c.method,c.observed_on,c.summary,c.status,c.verification_reference FROM v2_asset_conditions c ORDER BY c.created_at DESC LIMIT 150",
  "SELECT id,asset_id,provider,warranty_reference,expires_on FROM v2_asset_warranties ORDER BY expires_on LIMIT 150",
  "SELECT p.id,p.asset_id,p.engagement_id,p.service_code,p.title,p.cadence_months,p.next_due,p.status,p.version,p.lead_days FROM v2_preventive_plans p ORDER BY p.next_due LIMIT 150",
  "SELECT o.id,o.plan_id,o.due_on,o.work_order_id,o.status,o.skip_reason FROM v2_preventive_occurrences o ORDER BY o.created_at DESC LIMIT 100",
  "SELECT o.id,o.asset_id,o.engagement_id,o.category,o.title,o.source_reference,o.accountable_party,o.next_review_on,o.status,o.version, (SELECT MAX(ce.expires_on) FROM v2_compliance_evidence ce WHERE ce.obligation_id=o.id AND ce.status='verified') AS evidence_expires_on FROM v2_compliance_obligations o ORDER BY o.next_review_on LIMIT 150",
  "SELECT id,obligation_id,kind,provider_name,evidence_reference,issued_on,expires_on,status FROM v2_compliance_evidence ORDER BY created_at DESC LIMIT 150",
  "SELECT id,obligation_id,action_text,assignee_id,due_on,status FROM v2_compliance_actions ORDER BY due_on LIMIT 150",
  "SELECT id,asset_id,category,summary,likelihood,impact,mitigation,next_review_on,status,owner_staff_id FROM v2_asset_risks ORDER BY next_review_on LIMIT 150",
  "SELECT id,reference,client_id,market_code,property_id,scheme_id,scope_summary FROM v2_engagements WHERE status='active' ORDER BY created_at DESC LIMIT 200",
  "SELECT code,name,family FROM v2_services WHERE status='approved' ORDER BY code",
  "SELECT s.user_id AS id,u.display_name,u.email FROM staff_profiles s JOIN users u ON u.id=s.user_id WHERE s.active=1 AND u.active=1 AND s.role IN('administrator','operations_manager','inspector') ORDER BY u.display_name LIMIT 150"
 ];
 const names=['assets','conditions','warranties','preventivePlans','occurrences','obligations','complianceEvidence','actions','risks','engagements','approvedServices','staff'];
 const results=await Promise.all(queries.map(s=>statement(env.DB,s).all()));
 const data:Record<string,unknown>={generatedAt:now(),basis:'Operational evidence and review dates, not a statutory compliance certificate'};
 results.forEach((r,i)=>data[names[i]]=r.results);
 return data;
}
export async function estateCommand(env:Env,user:Principal,w:Workspace,route:string[],input:unknown){
 admin(user,w);
 const [part,id,act]=route;
 if(part==='profiles'&&!id){
  const d=z.object({assetId,assetCode:reference,manufacturer:z.string().trim().max(150).optional(),
   model:z.string().trim().max(150).optional(),serialNumber:z.string().trim().max(150).optional(),
   commissionedOn:dateOnly.optional(),designLifeMonths:amount.optional(),replacementCostCents:amount.optional(),
   criticality:z.enum(['low','normal','high','critical']).default('normal'),
   lifecycleStatus:z.enum(['operational','restricted','out_of_service','retired']).default('operational'),
   notes:z.string().trim().max(1500).default(''),version:z.coerce.number().int().positive().optional()}).parse(input);
  await assetContext(env,d.assetId);
  const old=await statement(env.DB,'SELECT version FROM v2_asset_details WHERE asset_id=?',d.assetId).first<{version:number}>();
  if(old)assert(old.version===d.version,409,'V2_ASSET_PROFILE_STALE','The asset profile has changed.');
  else assert(d.version===undefined,409,'V2_ASSET_PROFILE_STALE','Create the asset profile first.');
  const sql=old?'UPDATE v2_asset_details SET manufacturer=?,model=?,serial_number=?,commissioned_on=?,design_life_months=?,replacement_cost_cents=?,criticality=?,lifecycle_status=?,notes=?,version=version+1,updated_by=?,updated_at=? WHERE asset_id=? AND version=?':
   'INSERT INTO v2_asset_details(manufacturer,model,serial_number,commissioned_on,design_life_months,replacement_cost_cents,criticality,lifecycle_status,notes,updated_by,updated_at,asset_id,asset_code) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)';
  const common=[d.manufacturer??null,d.model??null,d.serialNumber??null,d.commissionedOn??null,
    d.designLifeMonths??null,d.replacementCostCents??null,d.criticality,d.lifecycleStatus,d.notes,user.id,now(),d.assetId];
  await env.DB.batch([statement(env.DB,sql,...(old?[...common,d.version!]:[...common,d.assetCode])),guard(env),
    activity(env,user,old?'v2.asset_profile_updated':'v2.asset_profile_created','asset',d.assetId),clearGuard(env)]);
  return {id:d.assetId,version:(old?.version??0)+1};
 }
 if(part==='conditions'&&!id){
  const d=z.object({assetId,score:z.coerce.number().int().min(1).max(5),observedOn:dateOnly,
   method:z.enum(['visual','functional','professional_report']),summary:reference,evidenceDocumentId:recordId.optional()}).parse(input);
  await assetContext(env,d.assetId);
  const key=uid('v2condition');
  await env.DB.batch([statement(env.DB,'INSERT INTO v2_asset_conditions(id,asset_id,score,observed_on,method,summary,evidence_document_id,observed_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    key,d.assetId,d.score,d.observedOn,d.method,d.summary,d.evidenceDocumentId??null,user.id,now()),
    activity(env,user,'v2.asset_condition_recorded','asset-condition',key)]);
  return {id:key};
 }
 if(part==='conditions'&&id&&act==='review'){
  const d=z.object({status:statusDecision,verificationReference:reference}).parse(input);
  const previous=await statement(env.DB,'SELECT observed_by,status FROM v2_asset_conditions WHERE id=?',id).first<{observed_by:string;status:string}>();
  assert(previous&&previous.status==='submitted',409,'V2_CONDITION_ALREADY_REVIEWED','This observation is no longer awaiting review.');
  assert(previous.observed_by!==user.id,403,'V2_CONDITION_SELF_REVIEW','A separate staff member must verify this observation.');
  await tx(env,user,"UPDATE v2_asset_conditions SET status=?,verified_by=?,verified_at=?,verification_reference=? WHERE id=? AND status='submitted'",
    [d.status,user.id,now(),d.verificationReference,id],'v2.asset_condition_reviewed','asset-condition',id);
  return {id,status:d.status};
 }
 if(part==='warranties'&&!id){
  const d=z.object({assetId,provider:shortText,warrantyReference:reference,
    startsOn:dateOnly.optional(),expiresOn:dateOnly,evidenceDocumentId:recordId.optional(),verificationReference:reference}).parse(input);
  await assetContext(env,d.assetId);
  const key=uid('v2warranty');
  await env.DB.batch([statement(env.DB,
    'INSERT INTO v2_asset_warranties(id,asset_id,provider,warranty_reference,starts_on,expires_on,evidence_document_id,verification_reference,reviewed_by,reviewed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    key,d.assetId,d.provider,d.warrantyReference,d.startsOn??null,d.expiresOn,d.evidenceDocumentId??null,d.verificationReference,user.id,now(),now()),
    activity(env,user,'v2.warranty_verified','asset-warranty',key)]);
  return {id:key};
 }
 if(part==='plans'&&!id){
  const d=z.object({assetId,engagementId:recordId,serviceCode:assetId,title:shortText,instructions:reference,
    cadenceMonths:z.coerce.number().int().min(1).max(120),leadDays:z.coerce.number().int().min(0).max(180),
    nextDue:dateOnly}).parse(input);
  await engagementContext(env,d.engagementId,d.assetId);
  const key=uid('v2pm'),t=now();
  await env.DB.batch([statement(env.DB,
    'INSERT INTO v2_preventive_plans(id,engagement_id,asset_id,service_code,title,instructions,cadence_months,lead_days,next_due,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    key,d.engagementId,d.assetId,d.serviceCode,d.title,d.instructions,d.cadenceMonths,d.leadDays,d.nextDue,user.id,t,t),
    activity(env,user,'v2.pm_plan_drafted','preventive-plan',key)]);
  return {id:key};
 }
 if(part==='plans'&&id&&act==='state'){
  const d=z.object({status:z.enum(['active','paused','retired']),authorityReference:reference,version:z.coerce.number().int().positive()}).parse(input);
  const old=await statement(env.DB,'SELECT version FROM v2_preventive_plans WHERE id=?',id).first<{version:number}>();
  assert(old&&old.version===d.version,409,'V2_PM_PLAN_STALE','Reload the preventive plan.');
  await tx(env,user,
    'UPDATE v2_preventive_plans SET status=?,authority_reference=?,verified_by=?,verified_at=?,version=version+1,updated_at=? WHERE id=? AND version=?',
    [d.status,d.authorityReference,user.id,now(),now(),id,d.version],
    'v2.pm_plan_state','preventive-plan',id);
  return {id,status:d.status};
 }
 if(part==='plans'&&id&&(act==='issue'||act==='skip')){
  const d=z.object({authorityReference:reference,reason:reference.optional()}).parse(input);
  const p=await statement(env.DB,
    'SELECT p.*,e.client_id,e.property_id,e.scheme_id,e.status AS engagement_status FROM v2_preventive_plans p JOIN v2_engagements e ON e.id=p.engagement_id WHERE p.id=?',
    id).first<Record<string,any>>();
  assert(p&&p.status==='active'&&p.engagement_status==='active',409,'V2_PM_INACTIVE','The preventive programme or engagement is inactive.');
  const current=await statement(env.DB,'SELECT id,work_order_id,status FROM v2_preventive_occurrences WHERE plan_id=? AND due_on=?',
    id,p.next_due).first();
  if(current)return {id:current.id,replayed:true,workOrderId:(current as any).work_order_id};
  const today=now().slice(0,10),issuedDate=Date.parse(p.next_due+'T00:00:00Z');
  assert(issuedDate<=Date.parse(today+'T00:00:00Z')+Math.max(0,p.lead_days)*86400000,409,
    'V2_PM_TOO_EARLY','This planned attendance is outside the issue window.');
  if(act==='skip')assert(d.reason,422,'V2_PM_SKIP_REASON','Explain the authorised skip.');
  const occ=uid('v2occ'),wo=uid('wo'),task=uid('v2task'),time=now(),next=nextMonthDate(p.next_due,p.cadence_months);
  const writes=[];
  if(act==='issue'){
    const referenceNo='WO-PM-'+crypto.randomUUID().slice(0,10).toUpperCase();
    writes.push(statement(env.DB,
      "INSERT INTO work_orders(id,reference,client_id,property_id,scheme_id,title,status,priority,created_at,updated_at) VALUES(?,?,?,?,?,?,'triage','routine',?,?)",
      wo,referenceNo,p.client_id,p.property_id,p.scheme_id,p.title,time,time));
    writes.push(statement(env.DB,
      "INSERT INTO v2_maintenance_tasks(id,work_order_id,asset_id,title,instructions,trade,priority,budget_ceiling_cents,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'general','routine',0,?,?,?)",
      task,wo,p.asset_id,p.title,p.instructions,user.id,time,time));
  }
  writes.push(statement(env.DB,
    'INSERT INTO v2_preventive_occurrences(id,plan_id,due_on,work_order_id,status,authority_reference,skip_reason,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    occ,id,p.next_due,act==='issue'?wo:null,act==='issue'?'issued':'skipped',d.authorityReference,act==='skip'?d.reason!:null,user.id,time));
  writes.push(statement(env.DB,"UPDATE v2_preventive_plans SET next_due=?,version=version+1,updated_at=? WHERE id=? AND next_due=? AND status='active'",
    next,time,id,p.next_due),guard(env),activity(env,user,act==='issue'?'v2.pm_occurrence_issued':'v2.pm_occurrence_skipped',
    'preventive-occurrence',occ,p.property_id,p.scheme_id),clearGuard(env));
  await env.DB.batch(writes);
  return {id:occ,workOrderId:act==='issue'?wo:null,taskId:act==='issue'?task:null,nextDue:next};
 }
 if(part==='obligations'&&!id){
  const d=z.object({assetId,engagementId:recordId,title:shortText,
    category:z.enum(['fire','electrical','water','lift','accessibility','environment','essential_services','safety','other']),
    jurisdiction:shortText,sourceReference:reference,requirementSummary:reference,
    accountableParty:z.enum(['owner','appointed_manager','operator','qualified_provider','government_authority']),
    recurrenceMonths:z.coerce.number().int().min(1).max(120).optional(),nextReviewOn:dateOnly}).parse(input);
  await engagementContext(env,d.engagementId,d.assetId);
  const key=uid('v2obl'),t=now();
  await env.DB.batch([statement(env.DB,
    'INSERT INTO v2_compliance_obligations(id,engagement_id,asset_id,title,category,jurisdiction,source_reference,requirement_summary,accountable_party,recurrence_months,next_review_on,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    key,d.engagementId,d.assetId,d.title,d.category,d.jurisdiction,d.sourceReference,d.requirementSummary,d.accountableParty,d.recurrenceMonths??null,d.nextReviewOn,user.id,t,t),
    activity(env,user,'v2.compliance_obligation_drafted','compliance-obligation',key)]);
  return {id:key};
 }
 if(part==='obligations'&&id&&act==='state'){
  const d=z.object({status:z.enum(['tracked','paused','retired']),reviewReference:reference,version:z.coerce.number().int().positive()}).parse(input);
  await tx(env,user,'UPDATE v2_compliance_obligations SET status=?,review_reference=?,reviewed_by=?,reviewed_at=?,version=version+1,updated_at=? WHERE id=? AND version=?',
    [d.status,d.reviewReference,user.id,now(),now(),id,d.version],
    'v2.compliance_obligation_reviewed','compliance-obligation',id);
  return {id,status:d.status};
 }
 if(part==='compliance-evidence'&&!id){
  const d=z.object({obligationId:recordId,documentId:recordId.optional(),
    kind:z.enum(['certificate','inspection','service_record','correspondence','other']),
    providerName:shortText,evidenceReference:reference,issuedOn:dateOnly,expiresOn:dateOnly.optional()}).parse(input);
  const key=uid('v2ce');
  await env.DB.batch([statement(env.DB,
    'INSERT INTO v2_compliance_evidence(id,obligation_id,document_id,kind,provider_name,evidence_reference,issued_on,expires_on,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    key,d.obligationId,d.documentId??null,d.kind,d.providerName,d.evidenceReference,d.issuedOn,d.expiresOn??null,user.id,now()),
    activity(env,user,'v2.compliance_evidence_submitted','compliance-evidence',key)]);
  return {id:key};
 }
 if(part==='compliance-evidence'&&id&&act==='review'){
  const d=z.object({status:statusDecision,independentCheckReference:reference}).parse(input);
  const previous=await statement(env.DB,'SELECT recorded_by,status FROM v2_compliance_evidence WHERE id=?',id).first<{recorded_by:string;status:string}>();
  assert(previous&&previous.status==='submitted',409,'V2_COMPLIANCE_EVIDENCE_ALREADY_REVIEWED','This evidence has already been reviewed.');
  assert(previous.recorded_by!==user.id,403,'V2_COMPLIANCE_EVIDENCE_SELF_REVIEW','A separate staff member must review compliance evidence.');
  await tx(env,user,"UPDATE v2_compliance_evidence SET status=?,reviewed_by=?,reviewed_at=?,independent_check_reference=? WHERE id=? AND status='submitted'",
    [d.status,user.id,now(),d.independentCheckReference,id],
    'v2.compliance_evidence_reviewed','compliance-evidence',id);
  return {id,status:d.status};
 }
 if(part==='actions'&&!id){
  const d=z.object({obligationId:recordId,actionText:reference,dueOn:dateOnly,assigneeId:recordId}).parse(input);
  const key=uid('v2ca'),t=now();
  await env.DB.batch([statement(env.DB,'INSERT INTO v2_compliance_actions(id,obligation_id,action_text,due_on,assignee_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
    key,d.obligationId,d.actionText,d.dueOn,d.assigneeId,user.id,t),
    activity(env,user,'v2.compliance_action_opened','compliance-action',key)]);
  return {id:key};
 }
 if(part==='actions'&&id&&act==='close'){
  const d=z.object({status:z.enum(['done','cancelled']),completionReference:reference}).parse(input);
  await tx(env,user,"UPDATE v2_compliance_actions SET status=?,completion_reference=?,closed_by=?,closed_at=? WHERE id=? AND status='open'",
    [d.status,d.completionReference,user.id,now(),id],
    'v2.compliance_action_closed','compliance-action',id);
  return {id,status:d.status};
 }
 if(part==='risks'&&!id){
  const d=z.object({assetId,category:z.enum(['condition','safety','failure','compliance','financial','service','other']),
    summary:reference,likelihood:z.coerce.number().int().min(1).max(5),impact:z.coerce.number().int().min(1).max(5),
    mitigation:reference,nextReviewOn:dateOnly,ownerStaffId:recordId}).parse(input);
  await assetContext(env,d.assetId);
  const key=uid('v2risk');
  await env.DB.batch([statement(env.DB,
    'INSERT INTO v2_asset_risks(id,asset_id,category,summary,likelihood,impact,mitigation,next_review_on,owner_staff_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    key,d.assetId,d.category,d.summary,d.likelihood,d.impact,d.mitigation,d.nextReviewOn,d.ownerStaffId,user.id,now()),
    activity(env,user,'v2.asset_risk_opened','asset-risk',key)]);
  return {id:key};
 }
 if(part==='risks'&&id&&act==='close'){
  const d=z.object({status:z.enum(['mitigated','accepted']),closureReference:reference}).parse(input);
  await tx(env,user,"UPDATE v2_asset_risks SET status=?,closure_reference=?,reviewed_by=?,reviewed_at=? WHERE id=? AND status='open'",
    [d.status,d.closureReference,user.id,now(),id],
    'v2.asset_risk_reviewed','asset-risk',id);
  return {id,status:d.status};
 }
 assert(false,404,'V2_ESTATE_OPERATION_UNKNOWN','This register action does not exist.');
}
