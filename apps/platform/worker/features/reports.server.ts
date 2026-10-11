import { z } from 'zod';
import { type Env,assert,statement,now,uid,AppError } from '../../../../packages/database/types';
import type { Principal,Workspace } from '../../../../packages/domain/index';
import { operationsWrite, workOrderAccess } from '../../../../packages/authorization/server';
import { documentScope } from '../../../../packages/authorization/documents';
import { guard,clearGuard,activity } from '../../../../packages/operations/core';
import { digest,unseal } from '../../../../packages/auth/crypto';
import { reportPolicyForService,type ServiceReportContract } from '../../../../packages/report-engine/policy';
import { reportDraftSchema, initialReportDraft,qualityReview,type ReportReviewContext,type ReportDraft } from '../../../../packages/report-engine/adapter';

export interface ReportRow {
 id:string;work_order_id:string;client_id:string|null;property_id:string|null;scheme_id:string|null;
 tenancy_id:string|null;booking_id:string|null;service_id:string|null;
 report_type:string;profile:string;output_kind:string;template_id:string;template_version:number;
 layout_snapshot_json:string;baseline_version_id:string|null;status:string;revision:number;
 inspector_id:string|null;reviewer_id:string|null;approved_version_id:string|null;
 issued_document_id:string|null;created_by:string;created_at:string;updated_at:string;
}
function staffActor(user:Principal,w:Workspace) {
 assert(w.kind==='staff' && user.staffRole && user.staffRole!=='read_only',403,'REPORT_STAFF_REQUIRED','An active Staff account is required.');
}
export function manager(user:Principal,w:Workspace){staffActor(user,w);return user.staffRole==='administrator'||user.staffRole==='operations_manager';}
function mayReadStaff(row:ReportRow,user:Principal,w:Workspace) {
 if(w.kind!=='staff'||!user.staffRole)return false;
 return ['administrator','operations_manager'].includes(user.staffRole)||row.inspector_id===user.id||row.reviewer_id===user.id;
}
function mayEdit(row:ReportRow,user:Principal,w:Workspace){
 return w.kind==='staff'&&!!user.staffRole&&user.staffRole!=='read_only'&&
 (manager(user,w)||row.inspector_id===user.id);
}
function policy(row:ReportRow):ServiceReportContract {
 return reportPolicyForService(row.service_id??'')??{
  type:row.report_type as ServiceReportContract['type'],profile:row.profile as ServiceReportContract['profile'],
  output:row.output_kind as ServiceReportContract['output'],
  needsBaseline:row.report_type==='exit'||row.report_type==='comparison',tenancyResponse:row.report_type==='entry'&&row.profile==='residential',
 };
}
export function reviewContext(row:ReportRow):ReportReviewContext {
 return {id:row.id,workOrderId:row.work_order_id,propertyId:row.property_id,schemeId:row.scheme_id,
 tenancyId:row.tenancy_id,templateId:row.template_id,templateVersion:row.template_version,layoutId:row.id,
 reportType:row.report_type,profile:row.profile,baselineVersionId:row.baseline_version_id,outputKind:row.output_kind};
}
export async function accessReport(env:Env,user:Principal,w:Workspace,id:string,mode:'read'|'edit'|'review'|'issue'='read') {
 const row=await statement(env.DB,'SELECT * FROM inspection_reports WHERE id=?',id).first<ReportRow>();
 assert(row,404,'REPORT_NOT_FOUND','Report not found.');
 if(w.kind!=='staff'){
   assert(mode==='read'&&row.status==='issued'&&row.issued_document_id,404,'REPORT_NOT_FOUND','Report not found.');
   const scope=documentScope(user,w,'d');
   const doc=await statement(env.DB,`SELECT d.id FROM documents d WHERE d.id=? AND d.status='issued' AND (${scope.sql})`,
     row.issued_document_id,...scope.values).first();
   assert(doc,404,'REPORT_NOT_FOUND','Report not found.');
   return row;
 }
 assert(mayReadStaff(row,user,w),404,'REPORT_NOT_FOUND','Report not found.');
 if(mode==='edit') assert(mayEdit(row,user,w)&&['draft','changes_requested'].includes(row.status),403,'REPORT_EDIT_FORBIDDEN','This report cannot be edited.');
 if(mode==='review') {
   staffActor(user,w);
   assert(row.reviewer_id===user.id && row.inspector_id!==user.id && row.created_by!==user.id,
     403,'REVIEW_SEPARATION','An independently assigned reviewer is required.');
 }
 if(mode==='issue') assert(manager(user,w),403,'REPORT_ISSUER_REQUIRED','Operations approval is required to issue a report.');
 return row;
}
function json(data:unknown){return JSON.stringify(data);}
export async function createReport(env:Env,user:Principal,w:Workspace,input:unknown) {
 staffActor(user,w);
 const d=z.object({workOrderId:z.string().min(5).max(100),tenancyId:z.string().max(100).optional(),
  baselineVersionId:z.string().max(100).optional(),reportType:z.enum(['entry','routine','exit','comparison','maintenance']).optional()}).parse(input);
 const order=await workOrderAccess(env,user,w,d.workOrderId,true);
 assert(!['completed','cancelled'].includes(order.status),409,'ORDER_CLOSED','A completed or cancelled Work Order cannot start a report.');
 const existing=await statement(env.DB,'SELECT id FROM inspection_reports WHERE work_order_id=?',d.workOrderId).first<{id:string}>();
 if(existing)return {id:existing.id,replayed:true};
 const booking=order.booking_id?await statement(env.DB,'SELECT service_id FROM bookings WHERE id=?',order.booking_id).first<{service_id:string}>():null;
 const serviceId=booking?.service_id??null,contract=serviceId?reportPolicyForService(serviceId):null;
 assert(!serviceId||contract,422,'SERVICE_REPORT_POLICY','The booked service has no accepted report contract.');
 const property=order.property_id?await statement(env.DB,'SELECT sector FROM properties WHERE id=?',order.property_id).first<{sector:string}>():null;
 const profile=contract?.profile==='attendance'?'attendance':
   order.scheme_id?'strata':property?.sector==='commercial'?'commercial':contract?.profile??'residential';
 const reportType=contract?.type??d.reportType??'maintenance',output=contract?.output??'inspection';
 if(d.tenancyId) {
   const tenancy=await statement(env.DB,'SELECT id FROM tenancies WHERE id=? AND property_id=?',d.tenancyId,order.property_id).first();
   assert(tenancy&&!order.scheme_id,422,'TENANCY_CONTEXT','Choose a tenancy linked to this residential Work Order.');
 }
 let baseline: {id:string}|null=null;
 if(d.baselineVersionId){
   baseline=await statement(env.DB,`SELECT v.id FROM report_versions v JOIN inspection_reports r ON r.id=v.report_id
     WHERE v.id=? AND r.property_id=? AND (? IS NULL OR r.tenancy_id=?) AND r.report_type='entry'
     AND r.status IN('issued','archived')`,d.baselineVersionId,order.property_id,d.tenancyId??null,d.tenancyId??null).first<{id:string}>();
   assert(baseline,422,'BASELINE_CONTEXT','The immutable Entry version must belong to this property and tenancy.');
 }
 const id=uid('rpt'),templateId=`system_${reportType}_${profile}_v1`,at=now();
 const draft=initialReportDraft(profile);
 // No replacement identity, no implicit tenancy access, no browser-authoritative client reference.
 await env.DB.batch([
   statement(env.DB,`INSERT INTO report_templates(id,report_type,profile,template_version,status,snapshot_json,published_at)
     VALUES(?,?,?,1,'published',?,?) ON CONFLICT(id) DO NOTHING`,templateId,reportType,profile,json({source:'Report Creation App',templateId,version:1,type:reportType,profile}),at),
   statement(env.DB,`INSERT INTO inspection_reports(id,work_order_id,client_id,property_id,scheme_id,tenancy_id,booking_id,service_id,report_type,profile,output_kind,
     template_id,template_version,layout_snapshot_json,baseline_version_id,status,inspector_id,created_by,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?, 'draft',?,?,?,?)`,
       id,order.id,order.client_id,order.property_id,order.scheme_id,d.tenancyId??null,order.booking_id,serviceId,
       reportType,profile,output,templateId,json({version:1,context:order.scheme_id?'scheme':'property',areas:draft.areas}),baseline?.id??null,
       order.assigned_staff_id??user.id,user.id,at,at),
   statement(env.DB,'INSERT INTO report_drafts(report_id,revision,content_json,updated_by,updated_at) VALUES(?,1,?,?,?)',id,json(draft),user.id,at),
   activity(env,user,'report.created','inspection_report',id,order.property_id,order.scheme_id,{workOrderId:order.id,reportType})
 ]);
 return {id,status:'draft',revision:1};
}
export async function listReports(env:Env,user:Principal,w:Workspace) {
 if(w.kind==='staff'){
  assert(user.staffRole,403,'STAFF_REQUIRED','Staff access is required.');
  const manager=['administrator','operations_manager'].includes(user.staffRole);
  const q=manager?'1=1':'(r.inspector_id=? OR r.reviewer_id=?)';
  const values=manager?[]:[user.id,user.id];
  return {reports:(await statement(env.DB,`SELECT r.id,r.work_order_id,r.status,r.report_type,r.profile,r.updated_at,r.issued_document_id,w.reference AS work_order_reference
     FROM inspection_reports r JOIN work_orders w ON w.id=r.work_order_id WHERE ${q} ORDER BY r.updated_at DESC LIMIT 100`,...values).all()).results};
 }
 const scope=documentScope(user,w,'d');
 return {reports:(await statement(env.DB,`SELECT r.id,r.work_order_id,r.status,r.report_type,r.profile,r.updated_at,r.issued_document_id,w.reference AS work_order_reference
 FROM inspection_reports r JOIN documents d ON d.id=r.issued_document_id JOIN work_orders w ON w.id=r.work_order_id
 WHERE r.status='issued' AND d.status='issued' AND (${scope.sql}) ORDER BY r.updated_at DESC LIMIT 100`,...scope.values).all()).results};
}
export async function reportDetail(env:Env,user:Principal,w:Workspace,id:string) {
 const row=await accessReport(env,user,w,id);
 if(w.kind!=='staff'){
   const targets=w.kind==='tenant'&&row.approved_version_id
     ?await statement(env.DB,'SELECT content_json FROM report_versions WHERE id=?',row.approved_version_id).first<{content_json:string}>()
     :null;
   const snapshot=targets?reportDraftSchema.parse(JSON.parse(targets.content_json)):null;
   return {report:{id:row.id,status:row.status,report_type:row.report_type,profile:row.profile,
     work_order_id:row.work_order_id,issued_document_id:row.issued_document_id},
     responseTargets:snapshot?.areas.map(area=>({id:area.id,name:area.name,
       components:area.components.map(c=>({id:c.id,name:c.component}))}))??[]};
 }
 const draft=await statement(env.DB,'SELECT revision,content_json FROM report_drafts WHERE report_id=?',id).first<{revision:number,content_json:string}>();
 const versions=(await statement(env.DB,'SELECT id,sequence,created_at,content_sha256 FROM report_versions WHERE report_id=? ORDER BY sequence DESC',id).all()).results;
 const evidence=(await statement(env.DB,'SELECT id,area_id,component_id,content_type,sha256,status,uploaded_at FROM report_evidence WHERE report_id=? ORDER BY uploaded_at DESC LIMIT 250',id).all()).results;
 const reviews=(await statement(env.DB,'SELECT reviewer_id,decision,comment,created_at FROM report_review_events WHERE report_id=? ORDER BY created_at DESC LIMIT 60',id).all()).results;
 const privileged=['administrator','operations_manager'].includes(user.staffRole??'')||row.reviewer_id===user.id;
 const rawResponses=privileged?(await statement(env.DB,`SELECT p.id,p.user_id,p.status,p.created_at,p.response_envelope
   FROM report_responses p JOIN report_versions v ON v.id=p.report_version_id WHERE v.report_id=?
   ORDER BY p.created_at DESC LIMIT 50`,id).all<{id:string,user_id:string,status:string,created_at:string,response_envelope:string}>()).results:[];
 const responses=await Promise.all(rawResponses.map(async r=>({id:r.id,userId:r.user_id,status:r.status,createdAt:r.created_at,
    content:await unseal(env.DATA_ENCRYPTION_KEY,'report-response:'+r.id,r.response_envelope)})));
 const maintenanceCandidates=privileged&&row.approved_version_id
   ?(await statement(env.DB,`SELECT id,area_id,component_id,finding,request_id FROM report_maintenance_candidates
       WHERE report_version_id=? ORDER BY created_at DESC LIMIT 80`,row.approved_version_id).all()).results:[];
 return {report:row,draft:draft?{revision:draft.revision,content:JSON.parse(draft.content_json)}:null,
   versions,evidence,reviews,responses,maintenanceCandidates};
}
export async function saveReport(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
 const row=await accessReport(env,user,w,id,'edit');
 const d=z.object({revision:z.number().int().positive(),content:reportDraftSchema,operationId:z.string().regex(/^[A-Za-z0-9_-]{8,100}$/).optional()}).parse(input);
 const content=json(d.content);
 assert(content.length<=450000,413,'REPORT_TOO_LARGE','Use evidence uploads rather than embedding photographs in a draft.');
 const fingerprint=await digest(content);
 if(d.operationId){
   const previous=await statement(env.DB,'SELECT fingerprint,result_revision FROM report_sync_receipts WHERE id=? AND report_id=? AND user_id=?',d.operationId,id,user.id).first<{fingerprint:string,result_revision:number}>();
   if(previous){assert(previous.fingerprint===fingerprint,409,'SYNC_REPLAY_CHANGED','A sync operation cannot be replayed with different content.');return {id,revision:previous.result_revision,replayed:true};}
 }
 assert(row.revision===d.revision,409,'REPORT_CHANGED','The report changed. Review and reconcile before synchronising.');
 const currentDraft=await statement(env.DB,'SELECT revision FROM report_drafts WHERE report_id=?',id).first<{revision:number}>();
 assert(currentDraft,409,'DRAFT_MISSING','This report has no draft.');
 const at=now(),updates=[
   statement(env.DB,"UPDATE inspection_reports SET revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status IN('draft','changes_requested')",at,id,d.revision),guard(env),
   statement(env.DB,'UPDATE report_drafts SET revision=revision+1,content_json=?,updated_by=?,updated_at=? WHERE report_id=? AND revision=?',content,user.id,at,id,currentDraft.revision),guard(env)
 ];
 if(d.operationId)updates.push(statement(env.DB,'INSERT INTO report_sync_receipts(id,report_id,user_id,expected_revision,result_revision,fingerprint,created_at) VALUES(?,?,?,?,?,?,?)',d.operationId,id,user.id,d.revision,d.revision+1,fingerprint,at));
 updates.push(activity(env,user,'report.draft_saved','inspection_report',id,row.property_id,row.scheme_id),clearGuard(env));
 await env.DB.batch(updates);
 return {id,revision:d.revision+1};
}
export async function assignReviewer(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
 assert(manager(user,w),403,'OPERATIONS_REQUIRED','An operations manager must assign reviewers.');
 const row=await accessReport(env,user,w,id);
 const d=z.object({reviewerId:z.string().min(5).max(100)}).parse(input);
 assert(row.inspector_id!==d.reviewerId && row.created_by!==d.reviewerId,422,'INDEPENDENCE_REQUIRED','Assign a reviewer who did not author or inspect this report.');
 const reviewer=await statement(env.DB,"SELECT user_id FROM staff_profiles WHERE user_id=? AND active=1 AND role!='read_only'",d.reviewerId).first();
 assert(reviewer,422,'REVIEWER_INVALID','Select an active reviewer.');
 assert(['draft','changes_requested','submitted'].includes(row.status),409,'REPORT_LOCKED','This report cannot be reassigned after approval.');
 const at=now();
 await env.DB.batch([statement(env.DB,'UPDATE inspection_reports SET reviewer_id=?,revision=revision+1,updated_at=? WHERE id=?',d.reviewerId,at,id),
 statement(env.DB,"INSERT INTO report_review_events(id,report_id,reviewer_id,decision,comment,created_at) VALUES(?,?,?,'assigned',NULL,?)",uid('rev'),id,d.reviewerId,at),
 activity(env,user,'report.reviewer_assigned','inspection_report',id,row.property_id,row.scheme_id)]);
 return {id,reviewerId:d.reviewerId};
}
export async function submitReport(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
 const row=await accessReport(env,user,w,id,'edit');
 const d=z.object({revision:z.number().int().positive()}).parse(input);
 assert(row.revision===d.revision,409,'REPORT_CHANGED','The report has changed.');
 assert(row.reviewer_id && row.reviewer_id!==row.inspector_id && row.reviewer_id!==row.created_by,409,'REVIEWER_REQUIRED','Assign an independent reviewer.');
 const draft=await statement(env.DB,'SELECT content_json FROM report_drafts WHERE report_id=?',id).first<{content_json:string}>();
 assert(draft,409,'DRAFT_MISSING','This report has no draft.');
 const content=reportDraftSchema.parse(JSON.parse(draft.content_json));
 const photos=(await statement(env.DB,'SELECT id,status,object_key FROM report_evidence WHERE report_id=?',id).all<{id:string,status:string,object_key:string}>()).results;
 const quality=qualityReview(content,reviewContext(row),policy(row),new Map(photos.map(p=>[p.id,p])));
 assert(quality.blockerCount===0 && quality.errorCount===0,409,'REPORT_QC_BLOCKED',quality.issues.filter(x=>x.severity==='blocker'||x.severity==='error').map(x=>x.message).slice(0,4).join(' ')||'Report quality requirements are incomplete.');
 const seq=Number((await statement(env.DB,'SELECT COALESCE(MAX(sequence),0) AS value FROM report_versions WHERE report_id=?',id).first<{value:number}>())?.value??0)+1;
 const at=now(),vId=uid('rver'),layoutHash=await digest(row.layout_snapshot_json);
 await env.DB.batch([
  statement(env.DB,'INSERT INTO report_versions(id,report_id,sequence,content_json,content_sha256,template_id,layout_sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',vId,id,seq,draft.content_json,await digest(draft.content_json),row.template_id,layoutHash,user.id,at),
  statement(env.DB,"UPDATE inspection_reports SET status='submitted',revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status IN('draft','changes_requested')",at,id,d.revision),guard(env),
  activity(env,user,'report.submitted','inspection_report',id,row.property_id,row.scheme_id,{versionId:vId,sequence:seq}),clearGuard(env)
 ]);
 return {id,status:'submitted',revision:d.revision+1,versionId:vId,quality};
}
export async function reviewReport(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
 const row=await accessReport(env,user,w,id,'review');
 assert(row.status==='submitted',409,'REVIEW_NOT_READY','Only a submitted report can be reviewed.');
 const d=z.object({decision:z.enum(['approved','changes_requested']),comment:z.string().trim().max(4000),revision:z.number().int().positive()}).parse(input);
 assert(row.revision===d.revision,409,'REPORT_CHANGED','The report has changed.');
 const version=await statement(env.DB,'SELECT id FROM report_versions WHERE report_id=? ORDER BY sequence DESC LIMIT 1',id).first<{id:string}>();
 assert(version,409,'VERSION_MISSING','Submit a report version first.');
 const at=now();
 await env.DB.batch([
 statement(env.DB,'UPDATE inspection_reports SET status=?,approved_version_id=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status=?',d.decision==='approved'?'approved':'changes_requested',d.decision==='approved'?version.id:null,at,id,d.revision,'submitted'),guard(env),
 statement(env.DB,'INSERT INTO report_review_events(id,report_id,report_version_id,reviewer_id,decision,comment,created_at) VALUES(?,?,?,?,?,?,?)',uid('rev'),id,version.id,user.id,d.decision,d.comment,at),
 activity(env,user,'report.reviewed','inspection_report',id,row.property_id,row.scheme_id,{decision:d.decision,versionId:version.id}),clearGuard(env)
 ]);
 return {id,status:d.decision,revision:d.revision+1};
}
