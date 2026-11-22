import { z } from 'zod';
import { assert, now, statement, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { clientAdmin, clientMembership, operationsWrite, propertyAccess } from '../../../../packages/authorization/server';
import { guard, clearGuard, activity } from '../../../../packages/operations/core';
import { seal, unseal } from '../../../../packages/auth/crypto';
import {
  CO_LIVING_ONBOARDING_STAGES, CO_LIVING_STAGE_EXIT_GATES,
  evaluateCoLivingOnboardingStageExit, nextCoLivingOnboardingStage,
  type CoLivingOnboardingStage,
} from '../../../../packages/domain/co-living-onboarding';

const identifier = z.string().regex(/^[a-zA-Z0-9_-]{4,100}$/);
const ref = z.string().trim().min(8).max(500);
const cents = z.number().int().min(0).max(100000000);
const keySchema = z.string().trim().min(8).max(100);
type Row = Record<string, any>;

function staff(user:Principal,w:Workspace){
  assert(w.kind==='staff',403,'OPERATIONS_REQUIRED','Select ProInspect Operations.');
  operationsWrite(user);
}
async function owner(env:Env,user:Principal,w:Workspace){
  assert(w.kind==='landlord',403,'OWNER_REQUIRED','Select your authorised Residential owner account.');
  await clientAdmin(env,user,w);
}
async function project(env:Env,user:Principal,w:Workspace,id:string,write=false){
  const p=await statement(env.DB,
    'SELECT p.*, pr.address,pr.suburb,pr.sector,c.name AS client_name FROM co_living_onboarding_projects p JOIN properties pr ON pr.id=p.property_id JOIN clients c ON c.id=p.client_id WHERE p.id=?',id
  ).first<Row>();
  assert(p,404,'ONBOARDING_NOT_FOUND','Co-Living onboarding project not found.');
  if(w.kind==='staff'){staff(user,w);await propertyAccess(env,user,w,p.property_id,write);}
  else {
    assert(w.kind==='landlord'&&p.client_id===w.scopeId,404,'ONBOARDING_NOT_FOUND','Project not found in this account.');
    await clientMembership(env,user,w.scopeId,write);
    if(write)await owner(env,user,w);
    await propertyAccess(env,user,w,p.property_id,write);
  }
  return p;
}
function event(env:Env,user:Principal,p:Row,action:string,detail:string,requestKey:string|null){
  return statement(env.DB,
    'INSERT INTO co_living_onboarding_events(id,project_id,actor_id,action,detail,request_key,created_at) VALUES(?,?,?,?,?,?,?)',
    uid('cloe'),p.id,user.id,action,detail.slice(0,1000),requestKey,now());
}
function withAudit(env:Env,user:Principal,p:Row,action:string,detail:string,requestKey:string|null){
  return [event(env,user,p,action,detail,requestKey),
    activity(env,user,'co_living_onboarding.'+action,'property',p.property_id,p.property_id,null,{projectId:p.id})];
}
async function replay(env:Env,p:Row,key:string,action:string){
  const existing=await statement(env.DB,
    'SELECT id,action FROM co_living_onboarding_events WHERE project_id=? AND request_key=?',
    p.id,key).first<{id:string;action:string}>();
  if(existing){
    assert(existing.action===action,409,'REQUEST_KEY_REUSED','Use a new request key for a different action.');
    return {ok:true,replayed:true,message:'This action was already recorded.'};
  }
  return null;
}
async function stageData(env:Env,p:Row){
  const [checks,assessment,proposals,items,variations,tasks,events,listings]=await Promise.all([
    statement(env.DB,'SELECT * FROM co_living_onboarding_checks WHERE project_id=? ORDER BY stage,code',p.id).all<Row>(),
    statement(env.DB,'SELECT * FROM co_living_onboarding_assessments WHERE project_id=?',p.id).first<Row>(),
    statement(env.DB,'SELECT * FROM co_living_onboarding_proposals WHERE project_id=? ORDER BY version DESC LIMIT 30',p.id).all<Row>(),
    statement(env.DB,'SELECT * FROM co_living_onboarding_items WHERE project_id=? ORDER BY created_at DESC LIMIT 200',p.id).all<Row>(),
    statement(env.DB,'SELECT * FROM co_living_onboarding_variations WHERE project_id=? ORDER BY created_at DESC LIMIT 100',p.id).all<Row>(),
    statement(env.DB,'SELECT * FROM co_living_onboarding_tasks WHERE project_id=? ORDER BY created_at DESC LIMIT 200',p.id).all<Row>(),
    statement(env.DB,'SELECT id,action,detail,created_at FROM co_living_onboarding_events WHERE project_id=? ORDER BY created_at DESC LIMIT 150',p.id).all<Row>(),
    statement(env.DB,"SELECT x.id,x.listing_id,x.evidence_reference,l.title,l.status FROM co_living_onboarding_listing_links x JOIN leasing_listings l ON l.id=x.listing_id WHERE x.project_id=? ORDER BY x.created_at DESC",p.id).all<Row>()
  ]);
  return {checks:checks.results,assessment,proposals:proposals.results,items:items.results,variations:variations.results,tasks:tasks.results,events:events.results,listings:listings.results};
}
export async function coLivingOnboardingList(env:Env,user:Principal,w:Workspace){
  if(w.kind==='staff')staff(user,w);
  else {
    assert(w.kind==='landlord',403,'OWNER_REQUIRED','Choose your Residential owner account.');
    await clientMembership(env,user,w.scopeId);
  }
  const rows=(await statement(env.DB,
    'SELECT p.id,p.property_id,p.client_id,p.stage,p.status,p.updated_at,p.version,pr.address,pr.suburb,c.name AS client_name FROM co_living_onboarding_projects p JOIN properties pr ON pr.id=p.property_id JOIN clients c ON c.id=p.client_id WHERE (?=1 OR p.client_id=?) ORDER BY p.updated_at DESC LIMIT 200',
    w.kind==='staff'?1:0,w.kind==='staff'?'':w.scopeId).all<Row>()).results;
  const visible:Row[]=[];
  for(const p of rows){
    try{await propertyAccess(env,user,w,p.property_id);visible.push(p);}catch{ /* Never reveal a revoked property. */ }
  }
  return {projects:visible,stages:CO_LIVING_ONBOARDING_STAGES};
}
export async function coLivingOnboardingDetail(env:Env,user:Principal,w:Workspace,id:string){
  const p=await project(env,user,w,id);
  const d=await stageData(env,p);
  const internal=w.kind==='staff';
  const internalAssessment=internal&&d.assessment ? {
    ...d.assessment, internal_notes:
      (await unseal<{text:string}>(env.DATA_ENCRYPTION_KEY,'co-living-assessment:'+p.id,
        d.assessment.internal_notes_envelope)).text,
    internal_notes_envelope:undefined,
  } : null;
  const current=d.proposals.find((v:Row)=>v.status==='issued'||v.status==='accepted')??null;
  return {project:p,stages:CO_LIVING_ONBOARDING_STAGES,
    assessment:internal?internalAssessment:d.assessment?.status==='reviewed'?{
      visit_at:d.assessment.visit_at,summary:d.assessment.summary,
      proposed_rooms:d.assessment.proposed_rooms,evidence_reference:d.assessment.evidence_reference,status:d.assessment.status}:null,
    proposals:internal?d.proposals:d.proposals.filter((x:Row)=>x.status!=='draft'),
    currentProposal:current,
    items:d.items,
    variations:d.variations,
    tasks:internal?d.tasks:d.tasks.filter((x:Row)=>x.owner_visible===1),
    checks:d.checks.map((x:Row)=>({code:x.code,stage:x.stage,status:x.status,
      evidence_reference:internal?x.evidence_reference:null,submitted_at:x.submitted_at,reviewed_at:x.reviewed_at})),
    events:d.events,
    listings:d.listings,
    stageRequirements:CO_LIVING_STAGE_EXIT_GATES[p.stage as CoLivingOnboardingStage]??[],
    staff:internal,
  };
}
export async function createCoLivingOnboarding(env:Env,user:Principal,w:Workspace,input:unknown){
  await owner(env,user,w);
  const d=z.object({propertyId:identifier,objectives:z.string().trim().min(8).max(2000),
    consent:z.literal(true),requestKey:keySchema}).parse(input);
  await propertyAccess(env,user,w,d.propertyId,true);
  const previous=await statement(env.DB,
    "SELECT id FROM co_living_onboarding_projects WHERE property_id=? AND status IN('active','on_hold')",
    d.propertyId).first<{id:string}>();
  if(previous){
    const existing=await project(env,user,w,previous.id);
    return {ok:true,id:existing.id,existing:true,message:'Existing Co-Living onboarding opened.'};
  }
  const p={id:uid('clop'),property_id:d.propertyId};
  const time=now();
  await env.DB.batch([
    statement(env.DB,"INSERT INTO co_living_onboarding_projects(id,property_id,client_id,stage,status,objectives,created_by,created_at,updated_at) VALUES(?,?,?,'enquiry','active',?,?,?,?)",
      p.id,d.propertyId,w.scopeId,d.objectives,user.id,time,time),
    statement(env.DB,
      'INSERT INTO co_living_onboarding_events(id,project_id,actor_id,action,detail,request_key,created_at) VALUES(?,?,?,?,?,?,?)',
      uid('cloe'),p.id,user.id,'enquiry_created','Owner requested a Co-Living property assessment.',d.requestKey,time),
    activity(env,user,'co_living_onboarding.enquiry_created','property',d.propertyId,d.propertyId,null,{projectId:p.id})
  ]);
  return {ok:true,id:p.id,message:'Your Co-Living enquiry has been recorded.'};
}
async function stageEvidence(env:Env,p:Row,d:Awaited<ReturnType<typeof stageData>>){
  const checked:Record<string,boolean>={};
  for(const c of d.checks) if(c.status==='verified')checked[c.code]=true;
  if(p.stage==='site_visit')checked.assessment_reviewed=d.assessment?.status==='reviewed';
  const accepted=d.proposals.find((x:Row)=>x.status==='accepted');
  if(p.stage==='proposal'){
    checked.current_proposal_issued=Boolean(accepted);
    checked.establishment_budget_approved=Boolean(accepted);
  }
  if(p.stage==='proposal'){
    const ownerLink=await statement(env.DB,
      "SELECT l.property_id FROM client_property_links l WHERE l.client_id=? AND l.property_id=? AND l.role IN('owner','landlord') AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?) LIMIT 1",
      p.client_id,p.property_id,now(),now()).first();
    checked.verified_owner_authority=Boolean(ownerLink);
  }
  if(p.stage==='advertising'){
    const occupancy=await statement(env.DB,
      "SELECT COUNT(*) AS n FROM co_living_occupancies o JOIN tenancies t ON t.id=o.tenancy_id JOIN co_living_spaces s ON s.id=o.space_id WHERE s.property_id=? AND s.space_type IN('room','bed') AND t.status='active' AND t.starts_at<=? AND (t.ends_at IS NULL OR t.ends_at>?)",
      p.property_id,now(),now()).first<{n:number}>();
    checked.first_tenancy_active=(occupancy?.n??0)>0;
    const site=await statement(env.DB,'SELECT property_id FROM co_living_sites WHERE property_id=?',p.property_id).first();
    const listings=await statement(env.DB,
      "SELECT COUNT(*) AS n FROM co_living_onboarding_listing_links x JOIN leasing_listings l ON l.id=x.listing_id WHERE x.project_id=? AND l.property_id=? AND l.kind='residential' AND l.status IN('published','leased')",
      p.id,p.property_id).first<{n:number}>();
    checked.approved_listing_published=Boolean(site)&&(listings?.n??0)>0&&checked.approved_listing_published===true;
  }
  return checked;
}
export async function coLivingOnboardingCommand(env:Env,user:Principal,w:Workspace,id:string,input:unknown){
  const common=z.object({action:z.string().min(3).max(40),requestKey:keySchema});
  const a=common.parse(input),p=await project(env,user,w,id,true);
  assert(p.status==='active'||(a.action==='set_status'&&p.status==='on_hold'),409,'PROJECT_INACTIVE','The project is on hold or no longer active.');
  const existing=await replay(env,p,a.requestKey,a.action);
  if(existing)return existing;
  const data=input as Record<string,unknown>;
  const asStaff=()=>staff(user,w),asOwner=()=>owner(env,user,w);
  const requireStage=(stage:CoLivingOnboardingStage)=>{
    assert(p.stage===stage,409,'WRONG_STAGE','This action is not available at the current onboarding stage.');
  };
  if(a.action==='submit_check'){
    asStaff();
    const d=z.object({code:z.string().min(5).max(80),evidenceReference:ref}).parse(data);
    assert((CO_LIVING_STAGE_EXIT_GATES[p.stage as CoLivingOnboardingStage]??[]).includes(d.code as never),
      422,'CHECK_NOT_REQUIRED','Choose an evidence item for the current stage.');
    assert(!['assessment_reviewed','verified_owner_authority','current_proposal_issued',
      'establishment_budget_approved','first_tenancy_active'].includes(d.code),
      422,'AUTOMATED_CHECK','This check comes from verified system records.');
    const prior=await statement(env.DB,'SELECT status FROM co_living_onboarding_checks WHERE project_id=? AND code=?',p.id,d.code).first<{status:string}>();
    assert(prior?.status!=='verified',409,'CHECK_VERIFIED','A verified checklist item cannot be silently overwritten.');
    const stamp=now();
    await env.DB.batch([
      statement(env.DB,"INSERT INTO co_living_onboarding_checks(project_id,code,stage,status,evidence_reference,submitted_by,submitted_at) VALUES(?,?,?,'submitted',?,?,?) ON CONFLICT(project_id,code) DO UPDATE SET status='submitted',evidence_reference=excluded.evidence_reference,submitted_by=excluded.submitted_by,submitted_at=excluded.submitted_at,reviewed_by=NULL,reviewed_at=NULL WHERE status='rejected'",
        p.id,d.code,p.stage,d.evidenceReference,user.id,stamp),
      ...withAudit(env,user,p,a.action,d.code,a.requestKey)
    ]);
    return {ok:true,message:'Evidence submitted for independent review.'};
  }
  if(a.action==='review_check'){
    asStaff();
    const d=z.object({code:z.string().min(5).max(80),decision:z.enum(['verified','rejected'])}).parse(data);
    const row=await statement(env.DB,'SELECT submitted_by,status,stage FROM co_living_onboarding_checks WHERE project_id=? AND code=?',p.id,d.code).first<{submitted_by:string;status:string;stage:string}>();
    assert(row&&row.status==='submitted'&&row.stage===p.stage,409,'CHECK_NOT_PENDING','No reviewable checklist submission exists.');
    assert(row.submitted_by!==user.id,403,'INDEPENDENT_REVIEW','Evidence must be reviewed by another authorised person.');
    await env.DB.batch([
      statement(env.DB,"UPDATE co_living_onboarding_checks SET status=?,reviewed_by=?,reviewed_at=? WHERE project_id=? AND code=? AND status='submitted'",
        d.decision,user.id,now(),p.id,d.code),
      guard(env),...withAudit(env,user,p,a.action,d.code+':'+d.decision,a.requestKey),clearGuard(env)
    ]);
    return {ok:true,message:'Checklist decision recorded.'};
  }
  if(a.action==='save_assessment'){
    asStaff();requireStage('site_visit');
    const d=z.object({visitAt:z.string().datetime({offset:true}),summary:z.string().trim().min(8).max(3000),
      internalNotes:z.string().trim().min(8).max(4000),proposedRooms:z.number().int().min(1).max(100),
      evidenceReference:ref}).parse(data);
    await env.DB.batch([
      statement(env.DB,
        "INSERT INTO co_living_onboarding_assessments(project_id,visit_at,summary,internal_notes_envelope,proposed_rooms,evidence_reference,status,updated_by,updated_at) VALUES(?,?,?,?,?,?,'draft',?,?) ON CONFLICT(project_id) DO UPDATE SET visit_at=excluded.visit_at,summary=excluded.summary,internal_notes_envelope=excluded.internal_notes_envelope,proposed_rooms=excluded.proposed_rooms,evidence_reference=excluded.evidence_reference,status='draft',updated_by=excluded.updated_by,updated_at=excluded.updated_at,reviewed_by=NULL,reviewed_at=NULL",
        p.id,d.visitAt,d.summary,
        await seal(env.DATA_ENCRYPTION_KEY,'co-living-assessment:'+p.id,{text:d.internalNotes}),
        d.proposedRooms,d.evidenceReference,user.id,now()),
      ...withAudit(env,user,p,a.action,'Site assessment recorded',a.requestKey)
    ]);
    return {ok:true,message:'Site assessment saved for review.'};
  }
  if(a.action==='review_assessment'){
    asStaff();requireStage('site_visit');
    const row=await statement(env.DB,'SELECT status,updated_by FROM co_living_onboarding_assessments WHERE project_id=?',p.id).first<{status:string;updated_by:string}>();
    assert(row?.status==='draft',409,'ASSESSMENT_NOT_DRAFT','No draft assessment to review.');
    assert(row.updated_by!==user.id,403,'INDEPENDENT_REVIEW','Another authorised staff member must review the assessment.');
    await env.DB.batch([
      statement(env.DB,"UPDATE co_living_onboarding_assessments SET status='reviewed',reviewed_by=?,reviewed_at=? WHERE project_id=? AND status='draft'",user.id,now(),p.id),
      guard(env),...withAudit(env,user,p,a.action,'Site assessment reviewed',a.requestKey),clearGuard(env)
    ]);
    return {ok:true,message:'Assessment independently reviewed.'};
  }
  if(a.action==='draft_proposal'){
    asStaff();requireStage('proposal');
    const d=z.object({
      traditionalWeeklyCents:cents,roomWeeklyCents:cents,parkingWeeklyCents:cents,
      furnishingBudgetCents:cents,worksBudgetCents:cents,
      assumptions:z.string().trim().min(15).max(3000),
      agreementVersion:z.string().trim().min(3).max(120),documentReference:ref
    }).parse(data);
    assert(d.roomWeeklyCents+d.parkingWeeklyCents>0,422,'RENT_REQUIRED','A proposed rent is required.');
    const active=await statement(env.DB,"SELECT id FROM co_living_onboarding_proposals WHERE project_id=? AND status='accepted'",p.id).first();
    assert(!active,409,'PROPOSAL_ALREADY_ACCEPTED','Use a separately approved variation for changes after acceptance.');
    const prior=await statement(env.DB,'SELECT COALESCE(MAX(version),0) AS v FROM co_living_onboarding_proposals WHERE project_id=?',p.id).first<{v:number}>();
    const version=(prior?.v??0)+1,idProposal=uid('cloprop');
    await env.DB.batch([
      statement(env.DB,
        "INSERT INTO co_living_onboarding_proposals(id,project_id,version,status,traditional_weekly_cents,room_weekly_cents,parking_weekly_cents,furnishing_budget_cents,works_budget_cents,assumptions,agreement_version,document_reference,created_by,created_at) VALUES(?,?,?,'draft',?,?,?,?,?,?,?,?,?,?)",
        idProposal,p.id,version,d.traditionalWeeklyCents,d.roomWeeklyCents,d.parkingWeeklyCents,
        d.furnishingBudgetCents,d.worksBudgetCents,d.assumptions,d.agreementVersion,d.documentReference,user.id,now()),
      ...withAudit(env,user,p,a.action,'Draft proposal version '+version,a.requestKey)
    ]);
    return {ok:true,proposalId:idProposal,version,message:'Proposal draft recorded; independent issue review is required.'};
  }
  if(a.action==='issue_proposal'){
    asStaff();requireStage('proposal');
    const d=z.object({proposalId:identifier}).parse(data);
    const row=await statement(env.DB,'SELECT status,created_by FROM co_living_onboarding_proposals WHERE id=? AND project_id=?',d.proposalId,p.id).first<{status:string;created_by:string}>();
    assert(row?.status==='draft',409,'PROPOSAL_NOT_DRAFT','Only a current draft can be issued.');
    assert(row.created_by!==user.id,403,'INDEPENDENT_REVIEW','A different authorised reviewer must issue this proposal.');
    await env.DB.batch([
      statement(env.DB,"UPDATE co_living_onboarding_proposals SET status='superseded' WHERE project_id=? AND status='issued'",p.id),
      statement(env.DB,"UPDATE co_living_onboarding_proposals SET status='issued',reviewed_by=?,issued_at=? WHERE id=? AND project_id=? AND status='draft'",user.id,now(),d.proposalId,p.id),
      guard(env),...withAudit(env,user,p,a.action,'Proposal independently issued',a.requestKey),clearGuard(env)
    ]);
    return {ok:true,message:'Reviewed proposal issued for owner consideration.'};
  }
  if(a.action==='owner_decision'){
    await asOwner();requireStage('proposal');
    const d=z.object({proposalId:identifier,version:z.number().int().positive(),
      decision:z.enum(['approved','declined','changes_requested']),note:z.string().trim().min(3).max(1000)}).parse(data);
    const row=await statement(env.DB,
      'SELECT id,status,version FROM co_living_onboarding_proposals WHERE id=? AND project_id=?',d.proposalId,p.id).first<{id:string;status:string;version:number}>();
    assert(row?.status==='issued'&&row.version===d.version,409,'STALE_PROPOSAL','Reload and review the current issued proposal.');
    const status=d.decision==='approved'?'accepted':d.decision;
    await env.DB.batch([
      statement(env.DB,'UPDATE co_living_onboarding_proposals SET status=? WHERE id=? AND project_id=? AND status=?',status,row.id,p.id,'issued'),
      guard(env),
      statement(env.DB,
        'INSERT INTO co_living_onboarding_decisions(id,proposal_id,project_id,proposal_version,decision,note,actor_id,decided_at) VALUES(?,?,?,?,?,?,?,?)',
        uid('clod'),row.id,p.id,row.version,d.decision,d.note,user.id,now()),
      ...withAudit(env,user,p,a.action,d.decision+': '+d.note,a.requestKey),clearGuard(env)
    ]);
    return {ok:true,message:d.decision==='approved'?'Owner approval recorded. Signed agreement and other gate evidence still required.':'Owner decision recorded.'};
  }
  if(a.action==='add_task'){
    asStaff();
    const d=z.object({title:z.string().trim().min(5).max(240),
      dueAt:z.string().datetime({offset:true}).nullable().optional(),
      ownerVisible:z.boolean()}).parse(data);
    await env.DB.batch([
      statement(env.DB,"INSERT INTO co_living_onboarding_tasks(id,project_id,stage,title,status,due_at,owner_visible,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,'open',?,?,?,?,?,?)",
        uid('clot'),p.id,p.stage,d.title,d.dueAt??null,d.ownerVisible?1:0,user.id,user.id,now(),now()),
      ...withAudit(env,user,p,a.action,d.title,a.requestKey)
    ]);
    return {ok:true,message:'Project task created.'};
  }
  if(a.action==='update_task'){
    asStaff();
    const d=z.object({taskId:identifier,status:z.enum(['open','blocked','completed']),
      evidenceReference:ref}).parse(data);
    const row=await statement(env.DB,'SELECT stage FROM co_living_onboarding_tasks WHERE id=? AND project_id=?',d.taskId,p.id).first<{stage:string}>();
    assert(row&&row.stage===p.stage,409,'TASK_NOT_CURRENT','Choose a task in the active project stage.');
    await env.DB.batch([
      statement(env.DB,'UPDATE co_living_onboarding_tasks SET status=?,evidence_reference=?,updated_by=?,updated_at=? WHERE id=? AND project_id=?',
        d.status,d.evidenceReference,user.id,now(),d.taskId,p.id),
      ...withAudit(env,user,p,a.action,d.taskId+':'+d.status,a.requestKey)
    ]);
    return {ok:true,message:'Task status updated.'};
  }
  if(a.action==='add_item'){
    asStaff();requireStage('implementation');
    const d=z.object({spaceLabel:z.string().trim().min(2).max(100),itemName:z.string().trim().min(3).max(180),
      supplier:z.string().trim().min(2).max(160),quantity:z.number().int().min(1).max(100),unitCostCents:cents}).parse(data);
    await env.DB.batch([
      statement(env.DB,"INSERT INTO co_living_onboarding_items(id,project_id,space_label,item_name,supplier,quantity,unit_cost_cents,status,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'planned',?,?,?)",
        uid('cloi'),p.id,d.spaceLabel,d.itemName,d.supplier,d.quantity,d.unitCostCents,user.id,now(),now()),
      ...withAudit(env,user,p,a.action,d.itemName,a.requestKey)
    ]);
    return {ok:true,message:'Furnishing item added; no purchase was made.'};
  }
  if(a.action==='update_item'){
    asStaff();requireStage('implementation');
    const d=z.object({itemId:identifier,status:z.enum(['planned','quoted','ordered','delivered','installed']),
      actualTotalCents:cents.nullable().optional(),receiptReference:z.string().max(500).nullable().optional(),
      warrantyReference:z.string().max(500).nullable().optional()}).parse(data);
    const item=await statement(env.DB,'SELECT * FROM co_living_onboarding_items WHERE id=? AND project_id=?',d.itemId,p.id).first<Row>();
    assert(item,404,'ITEM_NOT_FOUND','Furnishing item not found.');
    const order=['planned','quoted','ordered','delivered','installed'];
    assert(order.indexOf(d.status)>=order.indexOf(item.status),409,'ITEM_REGRESSION','Item procurement status cannot move backwards.');
    const accepted=await statement(env.DB,"SELECT furnishing_budget_cents,works_budget_cents FROM co_living_onboarding_proposals WHERE project_id=? AND status='accepted'",p.id)
      .first<{furnishing_budget_cents:number;works_budget_cents:number}>();
    assert(accepted,409,'PROPOSAL_REQUIRED','Owner-approved establishment scope is required.');
    const variation=await statement(env.DB,"SELECT COALESCE(SUM(extra_budget_cents),0) AS v FROM co_living_onboarding_variations WHERE project_id=? AND status='approved'",p.id)
      .first<{v:number}>();
    const committed=await statement(env.DB,
      "SELECT COALESCE(SUM(CASE WHEN actual_total_cents IS NULL THEN quantity*unit_cost_cents ELSE actual_total_cents END),0) AS v FROM co_living_onboarding_items WHERE project_id=? AND id!=? AND status IN('ordered','delivered','installed')",
      p.id,item.id).first<{v:number}>();
    const nextCost=(d.actualTotalCents??item.actual_total_cents??item.unit_cost_cents*item.quantity) as number;
    const budget=accepted.furnishing_budget_cents+accepted.works_budget_cents+(variation?.v??0);
    if(order.indexOf(d.status)>=2)assert((committed?.v??0)+nextCost<=budget,409,'BUDGET_APPROVAL_REQUIRED','Approved budget is insufficient; request an owner variation.');
    await env.DB.batch([
      statement(env.DB,
        'UPDATE co_living_onboarding_items SET status=?,actual_total_cents=?,receipt_reference=?,warranty_reference=?,updated_by=?,updated_at=? WHERE id=? AND project_id=?',
        d.status,d.actualTotalCents??item.actual_total_cents,d.receiptReference??item.receipt_reference,
        d.warrantyReference??item.warranty_reference,user.id,now(),item.id,p.id),
      ...withAudit(env,user,p,a.action,item.id+':'+d.status,a.requestKey)
    ]);
    return {ok:true,message:'Procurement record updated. This records progress, not a supplier payment.'};
  }
  if(a.action==='link_listing'){
    asStaff();requireStage('advertising');
    const d=z.object({listingId:identifier,evidenceReference:ref}).parse(data);
    const configured=await statement(env.DB,
      'SELECT property_id FROM co_living_sites WHERE property_id=?',p.property_id).first();
    assert(configured,409,'CO_LIVING_SETUP_REQUIRED','Configure the approved room allocation before linking a property advertisement.');
    const listing=await statement(env.DB,
      "SELECT id FROM leasing_listings WHERE id=? AND property_id=? AND kind='residential' AND status IN('published','leased')",
      d.listingId,p.property_id).first();
    assert(listing,409,'PUBLISHED_LISTING_REQUIRED','The published Residential listing must belong to this property.');
    await env.DB.batch([
      statement(env.DB,
        'INSERT INTO co_living_onboarding_listing_links(id,project_id,listing_id,evidence_reference,linked_by,created_at) VALUES(?,?,?,?,?,?)',
        uid('clol'),p.id,d.listingId,d.evidenceReference,user.id,now()),
      ...withAudit(env,user,p,a.action,'Room listing evidence linked',a.requestKey)
    ]);
    return {ok:true,message:'Existing approved property-level advertisement linked. Room tenancies remain separately tracked.'};
  }
  if(a.action==='request_variation'){
    asStaff();requireStage('implementation');
    const d=z.object({description:z.string().trim().min(8).max(500),extraBudgetCents:z.number().int().min(1).max(100000000)}).parse(data);
    await env.DB.batch([
      statement(env.DB,"INSERT INTO co_living_onboarding_variations(id,project_id,description,extra_budget_cents,status,requested_by,created_at) VALUES(?,?,?,?,'pending',?,?)",
        uid('clov'),p.id,d.description,d.extraBudgetCents,user.id,now()),
      ...withAudit(env,user,p,a.action,d.description,a.requestKey)
    ]);
    return {ok:true,message:'Additional budget sent for owner decision.'};
  }
  if(a.action==='variation_decision'){
    await asOwner();requireStage('implementation');
    const d=z.object({variationId:identifier,decision:z.enum(['approved','declined'])}).parse(data);
    await env.DB.batch([
      statement(env.DB,"UPDATE co_living_onboarding_variations SET status=?,decided_by=?,decided_at=? WHERE id=? AND project_id=? AND status='pending'",
        d.decision,user.id,now(),d.variationId,p.id),
      guard(env),...withAudit(env,user,p,a.action,d.variationId+':'+d.decision,a.requestKey),clearGuard(env)
    ]);
    return {ok:true,message:'Budget variation decision recorded.'};
  }
  if(a.action==='advance'){
    asStaff();
    const d=z.object({version:z.number().int().positive()}).parse(data);
    assert(d.version===p.version,409,'STALE_ONBOARDING','Reload the onboarding project before advancing.');
    const next=nextCoLivingOnboardingStage(p.stage as CoLivingOnboardingStage);
    assert(next,409,'PROJECT_COMPLETE','The property is already at the operational stage.');
    const all=await stageData(env,p);
    const evidence=await stageEvidence(env,p,all);
    const ready=evaluateCoLivingOnboardingStageExit(p.stage as CoLivingOnboardingStage,evidence);
    assert(ready.ready,409,'STAGE_NOT_READY','Stage has outstanding requirements: '+ready.missing.join(', '));
    const pending=all.tasks.filter((t:Row)=>t.stage===p.stage&&t.status!=='completed');
    assert(pending.length===0,409,'TASKS_INCOMPLETE','Complete or resolve the current stage tasks before advancing.');
    await env.DB.batch([
      statement(env.DB,
        "UPDATE co_living_onboarding_projects SET stage=?,status=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status='active'",
        next,next==='tenanted'?'completed':'active',now(),p.id,p.version),
      guard(env),
      ...withAudit(env,user,p,a.action,p.stage+' -> '+next,a.requestKey),
      clearGuard(env)
    ]);
    return {ok:true,stage:next,message:next==='tenanted'?'Property handed over to ongoing Co-Living operations.':'Stage advanced to '+next+'.'};
  }
  if(a.action==='set_status'){
    asStaff();
    const d=z.object({status:z.enum(['active','on_hold','withdrawn']),version:z.number().int().positive(),
      reason:z.string().trim().min(8).max(500)}).parse(data);
    assert(p.status!=='completed'&&p.status!=='withdrawn',409,'PROJECT_CLOSED','Completed or withdrawn projects cannot be reopened.');
    assert(d.version===p.version,409,'STALE_ONBOARDING','Reload before changing project status.');
    await env.DB.batch([
      statement(env.DB,
        "UPDATE co_living_onboarding_projects SET status=?,version=version+1,updated_at=? WHERE id=? AND version=?",
        d.status,now(),p.id,p.version),
      guard(env),
      ...withAudit(env,user,p,a.action,d.status+': '+d.reason,a.requestKey),
      clearGuard(env)
    ]);
    return {ok:true,message:'Project status updated.'};
  }
  assert(false,422,'UNKNOWN_ACTION','Unknown onboarding action.');
}
