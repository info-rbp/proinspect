import { z } from 'zod';
import { type Env,assert,statement,now,uid } from '../../../../packages/database/types';
import type { Principal,Workspace } from '../../../../packages/domain/index';
import { digest,seal } from '../../../../packages/auth/crypto';
import { guard,clearGuard,activity } from '../../../../packages/operations/core';
import { reportDraftSchema } from '../../../../packages/report-engine/adapter';
import { renderReportPdf, ReportPdfError } from '../../../../packages/report-engine/pdf';
import { issueDocument } from './documents.server';
import { accessReport, manager } from './reports.server';
import { documentScope } from '../../../../packages/authorization/documents';

export async function renderApprovedReport(env:Env,user:Principal,w:Workspace,id:string) {
 const report=await accessReport(env,user,w,id,'issue');
 assert(report.status==='approved',409,'REPORT_NOT_APPROVED','Independent reviewer approval is required before rendering.');
 assert(report.approved_version_id,409,'VERSION_REQUIRED','An approved version is required.');
 const prior=await statement(env.DB,'SELECT document_id FROM report_render_manifests WHERE report_version_id=?',report.approved_version_id).first<{document_id:string|null}>();
 if(prior?.document_id)return {documentId:prior.document_id,replayed:true};
 const version=await statement(env.DB,'SELECT id,content_json,content_sha256,layout_sha256,sequence FROM report_versions WHERE id=? AND report_id=?',report.approved_version_id,id).first<{id:string,content_json:string,content_sha256:string,layout_sha256:string,sequence:number}>();
 assert(version,409,'VERSION_MISSING','Approved report version missing.');
 assert(await digest(version.content_json)===version.content_sha256,409,'VERSION_HASH_MISMATCH','Report content integrity verification failed.');
 assert(await digest(report.layout_snapshot_json)===version.layout_sha256,409,'LAYOUT_HASH_MISMATCH','Report layout integrity verification failed.');
 const content=reportDraftSchema.parse(JSON.parse(version.content_json));
 const wanted=new Set(content.areas.flatMap(area=>[...area.overviewPhotoIds,...area.components.flatMap(c=>c.photoIds)]));
 const evidence=(await statement(env.DB,'SELECT id,object_key,sha256,status,size FROM report_evidence WHERE report_id=?',id)
    .all<{id:string,object_key:string,sha256:string,status:string,size:number}>()).results;
 const match=new Map(evidence.map(e=>[e.id,e])),photos=new Map<string,{bytes:Uint8Array,caption:string}>();
 let total=0;
 for(const photoId of wanted){
  const info=match.get(photoId);
  assert(info?.status==='accepted',409,'EVIDENCE_PENDING','Report evidence is missing or not independently accepted.');
  total+=info.size;
  assert(total<=15*1024*1024,413,'RENDER_LIMIT','Too many image bytes in the report. Split or optimise the photographic evidence.');
  const object=await env.DOCUMENTS.get(info.object_key);
  assert(object,409,'EVIDENCE_MISSING','Required evidence cannot be loaded.');
  const data=await object.arrayBuffer();
  assert(await digest(data)===info.sha256,409,'EVIDENCE_HASH_MISMATCH','Original evidence does not match its stored hash.');
  photos.set(photoId,{bytes:new Uint8Array(data),caption:'Inspection evidence '+photoId});
 }
 let pdf:Uint8Array;
 try{pdf=await renderReportPdf({title:'ProInspect '+report.report_type+' report',
  context:report.property_id?'Property '+report.property_id:'Scheme '+report.scheme_id,
  version:version.id,summary:content.summary,
  areas:content.areas.map(a=>({name:a.name,overviewPhotoIds:a.overviewPhotoIds,
    components:a.components.map(c=>({name:c.component,condition:c.conditionCategory,cleanliness:c.cleanlinessCategory,commentary:c.commentary,photoIds:c.photoIds,workingStatus:c.workingStatus,testStatus:c.testStatus,testMethod:c.testMethod,comparisonStatus:c.comparisonStatus,comparisonReviewStatus:c.comparisonReviewStatus,maintenanceRequired:c.maintenanceRequired,defects:c.defects}))})),photos});}catch(error){if(error instanceof ReportPdfError)assert(false,422,error.code,error.message);throw error;}
 assert(pdf.byteLength>20&&pdf.byteLength<20*1024*1024,413,'PDF_RENDER_SIZE','The generated PDF is too large.');
 const pdfHash=await digest(pdf.buffer as ArrayBuffer);
 const documentId=uid('doc'),key=`reports-native/${id}/${version.id}/${documentId}.pdf`,createdAt=now();
 const manifest={reportId:id,reportVersionId:version.id,contentSha256:version.content_sha256,
  layoutSha256:version.layout_sha256,templateId:report.template_id,templateVersion:report.template_version,
  rendererVersion:'proinspect-native-pdf-2',photoSha256:evidence.filter(e=>wanted.has(e.id)).map(e=>({id:e.id,sha256:e.sha256})),documentSha256:pdfHash};
 await env.DOCUMENTS.put(key,pdf,{httpMetadata:{contentType:'application/pdf'},customMetadata:{sha256:pdfHash,reportVersion:version.id}});
 try{
  await env.DB.batch([
   statement(env.DB,`INSERT INTO documents(id,property_id,scheme_id,tenancy_id,booking_id,work_order_id,title,category,object_key,content_type,size,sha256,version,status,created_by,created_at,source_report_id)
     VALUES(?,?,?,?,?,?,?,?,?,'application/pdf',?,?,1,'review',?,?,?)`,
     documentId,report.property_id,report.scheme_id,report.tenancy_id,report.booking_id,report.work_order_id,
     'Reviewed '+report.report_type+' report',report.report_type==='entry'?'property_condition_report':'service_report',
     key,pdf.length,pdfHash,user.id,createdAt,version.id),
   statement(env.DB,'INSERT INTO report_render_manifests(id,report_version_id,document_id,renderer_version,document_sha256,manifest_json,created_at) VALUES(?,?,?,?,?,?,?)',
     uid('manifest'),version.id,documentId,manifest.rendererVersion,pdfHash,JSON.stringify(manifest),createdAt),
   activity(env,user,'report.rendered','inspection_report',id,report.property_id,report.scheme_id,{documentId,versionId:version.id})
  ]);
 }catch(e){await env.DOCUMENTS.delete(key);throw e;}
 return {documentId,sha256:pdfHash,rendererVersion:manifest.rendererVersion};
}
export async function issueApprovedReport(env:Env,user:Principal,w:Workspace,id:string,input:unknown){
 const row=await accessReport(env,user,w,id,'issue');
 assert(['approved','issued'].includes(row.status)&&row.approved_version_id,409,'REPORT_NOT_APPROVED','Reviewer approval is required before issuing.');
 const d=z.object({audience:z.enum(['client','tenancy','scheme_resident','scheme_owner','scheme_council']),
   recipientId:z.string().min(5).max(100),reviewReference:z.string().trim().min(4).max(500)}).parse(input);
 if(d.audience==='tenancy') assert(!!row.tenancy_id&&d.recipientId===row.tenancy_id,422,'TENANCY_REPORT_CONTEXT','The report must be linked to this tenancy before issue.');
 if(d.audience.startsWith('scheme_')){
   assert(!!row.scheme_id&&!row.tenancy_id&&d.recipientId===row.scheme_id,403,'SCHEME_REPORT_SCOPE',
     'Scheme distribution requires a scheme-scoped report without private tenancy context.');
   const request=await statement(env.DB,`SELECT r.lot_id,r.tenancy_id,r.location_kind FROM work_orders w
     LEFT JOIN requests r ON r.id=w.request_id WHERE w.id=?`,row.work_order_id)
     .first<{lot_id:string|null,tenancy_id:string|null,location_kind:string|null}>();
   assert(!request?.lot_id&&!request?.tenancy_id&&request?.location_kind!=='lot',
     403,'PRIVATE_LOT_REPORT','Private lot findings cannot be published to a whole scheme.');
 }
 const manifest=await statement(env.DB,'SELECT document_id FROM report_render_manifests WHERE report_version_id=?',row.approved_version_id).first<{document_id:string|null}>();
 assert(manifest?.document_id,409,'RENDER_REQUIRED','Generate and review the approved PDF first.');
 // The existing ProInspect document issue function performs live recipient-context checks,
 // creates the precise audience grant, and queues notifications. No bypass for reporting.
 const issued=await issueDocument(env,user,w,manifest.document_id,d);
 if(row.status!=='issued'){
  await env.DB.batch([
   statement(env.DB,"UPDATE inspection_reports SET status='issued',issued_document_id=?,revision=revision+1,updated_at=? WHERE id=? AND status='approved' AND approved_version_id=?",manifest.document_id,now(),id,row.approved_version_id),guard(env),
   activity(env,user,'report.version_issued','inspection_report',id,row.property_id,row.scheme_id,{versionId:row.approved_version_id,documentId:manifest.document_id,audience:d.audience}),clearGuard(env)
  ]);
 }
 return {id,status:'issued',documentId:manifest.document_id,recipient:d.audience,issued};
}
export async function respondToIssuedReport(env:Env,user:Principal,w:Workspace,id:string,input:unknown){
 assert(w.kind==='tenant',403,'TENANT_REQUIRED','Open your authorised tenancy workspace.');
 const report=await accessReport(env,user,w,id);
 assert(report.status==='issued'&&report.tenancy_id===w.scopeId&&report.approved_version_id&&report.issued_document_id,
    404,'REPORT_NOT_FOUND','No issued report is available for this tenancy.');
 const scope=documentScope(user,w,'d');
 const granted=await statement(env.DB,`SELECT d.id FROM documents d WHERE d.id=? AND (${scope.sql}) AND d.status='issued'`,report.issued_document_id,...scope.values).first();
 assert(granted,404,'REPORT_NOT_FOUND','No report response permission is available.');
 const body=z.object({generalNote:z.string().trim().min(2).max(6000),
  entries:z.array(z.object({areaId:z.string().max(100),componentId:z.string().max(100).optional(),comment:z.string().trim().min(2).max(1500)})).max(80)}).parse(input);
 const original=await statement(env.DB,'SELECT content_json FROM report_versions WHERE id=? AND report_id=?',report.approved_version_id,id)
   .first<{content_json:string}>();
 assert(original,409,'REPORT_VERSION_MISSING','The issued version could not be validated.');
 const snapshot=reportDraftSchema.parse(JSON.parse(original.content_json));
 for(const entry of body.entries){
   const area=snapshot.areas.find(a=>a.id===entry.areaId);
   assert(area&&(!entry.componentId||area.components.some(c=>c.id===entry.componentId)),
     422,'RESPONSE_TARGET_INVALID','Choose a component or area from the exact issued version.');
 }
 const old=await statement(env.DB,'SELECT id FROM report_responses WHERE report_version_id=? AND user_id=?',report.approved_version_id,user.id).first<{id:string}>();
 if(old)return {id:old.id,replayed:true};
 const idReply=uid('rresponse'),at=now();
 await env.DB.batch([
   statement(env.DB,"INSERT INTO report_responses(id,report_version_id,document_id,tenancy_id,user_id,response_envelope,status,created_at) VALUES(?,?,?,?,?,?,'submitted',?)",
     idReply,report.approved_version_id,report.issued_document_id,w.scopeId,user.id,
     await seal(env.DATA_ENCRYPTION_KEY,'report-response:'+idReply,body),at),
   activity(env,user,'report.tenant_response_submitted','report_response',idReply,report.property_id,null,{reportId:id})
 ]);
 return {id:idReply,status:'submitted'};
}
export async function extractMaintenanceCandidates(env:Env,user:Principal,w:Workspace,id:string){
 const report=await accessReport(env,user,w,id,'issue');
 assert(['approved','issued'].includes(report.status)&&report.approved_version_id,409,'REPORT_NOT_REVIEWED','Review the report first.');
 const version=await statement(env.DB,'SELECT content_json FROM report_versions WHERE id=?',report.approved_version_id).first<{content_json:string}>();
 assert(version,409,'VERSION_MISSING','Approved version missing.');
 const draft=reportDraftSchema.parse(JSON.parse(version.content_json)),at=now();
 let added=0;
 for(const a of draft.areas)for(const c of a.components)if(c.maintenanceRequired){
  await statement(env.DB,`INSERT INTO report_maintenance_candidates(id,report_version_id,area_id,component_id,finding,created_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(report_version_id,area_id,component_id) DO NOTHING`,
    uid('maint'),report.approved_version_id,a.id,c.id,(a.name+': '+c.component+' - '+(c.commentary||c.defects.join('; '))).slice(0,800),at).run();
  added++;
 }
 return {reviewedCandidates:added,reportVersionId:report.approved_version_id,workOrdersCreated:0};
}

/** Reviewer/Operations outcomes are separate from the immutable issued PDF. */
export async function resolveReportResponse(env:Env,user:Principal,w:Workspace,id:string,responseId:string,input:unknown){
 const row=await accessReport(env,user,w,id);
 assert(w.kind==='staff'&&(manager(user,w)||row.reviewer_id===user.id),403,'RESPONSE_REVIEW_FORBIDDEN','A reporting reviewer is required.');
 const d=z.object({status:z.enum(['under_review','resolved']),resolutionNote:z.string().trim().min(4).max(3000)}).parse(input);
 const existing=await statement(env.DB,`SELECT r.id,r.status FROM report_responses r JOIN report_versions v ON v.id=r.report_version_id
     WHERE r.id=? AND v.report_id=?`,responseId,id).first<{id:string,status:string}>();
 assert(existing,404,'RESPONSE_NOT_FOUND','Report response not found.');
 if(existing.status===d.status)return {id:responseId,status:d.status,replayed:true};
 assert(existing.status!=='resolved',409,'RESPONSE_FINAL','The response review is already final.');
 await env.DB.batch([
   statement(env.DB,`UPDATE report_responses SET status=?,resolved_by=?,resolved_at=?
      WHERE id=? AND status IN('submitted','under_review')`,d.status,d.status==='resolved'?user.id:null,d.status==='resolved'?now():null,responseId),
   activity(env,user,'report.recipient_response_reviewed','report_response',responseId,row.property_id,row.scheme_id,
     {reportId:id,status:d.status,note:d.resolutionNote})
 ]);
 return {id:responseId,status:d.status};
}
/** Convert a reviewed maintenance finding into an existing ProInspect Request for triage. */
export async function createMaintenanceRequest(env:Env,user:Principal,w:Workspace,id:string,candidateId:string){
 const row=await accessReport(env,user,w,id,'issue');
 assert(row.approved_version_id,409,'VERSION_REQUIRED','The report requires a reviewed version.');
 const item=await statement(env.DB,'SELECT id,finding,request_id FROM report_maintenance_candidates WHERE id=? AND report_version_id=?',
   candidateId,row.approved_version_id).first<{id:string,finding:string,request_id:string|null}>();
 assert(item,404,'CANDIDATE_NOT_FOUND','Maintenance candidate not found.');
 if(item.request_id)return {requestId:item.request_id,replayed:true};
 const at=now(),requestId=uid('request'),reference='REQ-'+uid('r').slice(2,18);
 await env.DB.batch([
   statement(env.DB,`INSERT INTO requests(id,reference,client_id,property_id,scheme_id,created_by,source,category,title,details,priority,status,created_at,updated_at)
     VALUES(?,?,?,?,?,?,'staff','maintenance',?,?,'routine','submitted',?,?)`,
     requestId,reference,row.client_id,row.property_id,row.scheme_id,user.id,
     'Report follow-up: '+item.finding.slice(0,110),item.finding,at,at),
   statement(env.DB,'UPDATE report_maintenance_candidates SET request_id=? WHERE id=? AND request_id IS NULL',requestId,candidateId),
   guard(env),
   activity(env,user,'report.maintenance_request_created','request',requestId,row.property_id,row.scheme_id,
     {reportId:id,reportVersionId:row.approved_version_id,candidateId}),clearGuard(env)
 ]);
 return {requestId,reference,status:'submitted'};
}
