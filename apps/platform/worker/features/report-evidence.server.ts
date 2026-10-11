import { z } from 'zod';
import { type Env,assert,statement,now,uid } from '../../../../packages/database/types';
import type { Principal,Workspace } from '../../../../packages/domain/index';
import { digest } from '../../../../packages/auth/crypto';
import { activity } from '../../../../packages/operations/core';
import { accessReport,manager } from './reports.server';

export async function uploadReportEvidence(env:Env,user:Principal,w:Workspace,reportId:string,form:FormData){
 const row=await accessReport(env,user,w,reportId,'edit');
 const photo=form.get('file');
 assert(photo instanceof File,422,'PHOTO_REQUIRED','Choose an inspection photo.');
 assert(photo.size>=24 && photo.size<=5*1024*1024,413,'PHOTO_SIZE','Use a JPEG image smaller than 5 MB.');
 assert(photo.type==='image/jpeg',422,'PHOTO_JPEG_REQUIRED','Upload a JPEG image. Convert other formats before uploading.');
 const bytes=await photo.arrayBuffer(),signature=new Uint8Array(bytes.slice(0,4));
 assert(signature[0]===0xff&&signature[1]===0xd8&&signature[2]===0xff,422,'INVALID_JPEG','The file is not a JPEG image.');
 const sha=await digest(bytes),previous=await statement(env.DB,'SELECT id,status FROM report_evidence WHERE report_id=? AND sha256=?',reportId,sha).first();
 if(previous)return {...previous,replayed:true};
 const areaId=String(form.get('areaId')??''),componentId=String(form.get('componentId')??'');
 assert(/^[A-Za-z0-9_-]{1,100}$/.test(areaId),422,'AREA_REQUIRED','Select a report area.');
 assert(!componentId||/^[A-Za-z0-9_-]{1,100}$/.test(componentId),422,'COMPONENT_INVALID','Select an existing component.');
 const draft=await statement(env.DB,'SELECT content_json,revision FROM report_drafts WHERE report_id=?',reportId).first<{content_json:string,revision:number}>();
 assert(draft,409,'REPORT_DRAFT_REQUIRED','Report draft missing.');
 const data=JSON.parse(draft.content_json),area=data.areas.find((a:{id:string})=>a.id===areaId);
 assert(area&&(!componentId||area.components.some((c:{id:string})=>c.id===componentId)),422,'EVIDENCE_CONTEXT','The evidence target must exist in the report draft.');
 const target=componentId?area.components.find((c:{id:string})=>c.id===componentId):area;
 const linked=componentId?'photoIds':'overviewPhotoIds';
 const modified=structuredClone(data) as {areas:typeof data.areas};
 const areaNew=modified.areas.find((a:{id:string})=>a.id===areaId)!;
 const node=componentId?areaNew.components.find((c:{id:string})=>c.id===componentId)!:areaNew;
 if(!Array.isArray(node[linked]))node[linked]=[];
 const id=uid('evid'),key=`report-evidence/${reportId}/${id}.jpg`,at=now();
 node[linked].push(id);
 await env.DOCUMENTS.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'},customMetadata:{sha256:sha}});
 try{
  await env.DB.batch([
   statement(env.DB,`INSERT INTO report_evidence(id,report_id,area_id,component_id,object_key,content_type,size,sha256,status,uploaded_by,uploaded_at)
     VALUES(?,?,?,?,?,'image/jpeg',?,?,'pending',?,?)`,id,reportId,areaId,componentId,key,photo.size,sha,user.id,at),
   statement(env.DB,'UPDATE report_drafts SET content_json=?,revision=revision+1,updated_by=?,updated_at=? WHERE report_id=? AND revision=?',JSON.stringify(modified),user.id,at,reportId,draft.revision),
   statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
   statement(env.DB,"UPDATE inspection_reports SET revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status IN('draft','changes_requested')",at,reportId,row.revision),
   statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
   activity(env,user,'report.evidence_uploaded','report_evidence',id,row.property_id,row.scheme_id,{reportId}),
   statement(env.DB,'DELETE FROM mutation_guards')
  ]);
 }catch(e){await env.DOCUMENTS.delete(key);throw e;}
 return {id,status:'pending',sha256:sha};
}
export async function reviewReportEvidence(env:Env,user:Principal,w:Workspace,reportId:string,id:string,input:unknown){
 const report=await accessReport(env,user,w,reportId);
 const d=z.object({decision:z.enum(['accepted','rejected'])}).parse(input);
 assert(w.kind==='staff'&&(manager(user,w)||report.reviewer_id===user.id),403,'EVIDENCE_REVIEWER_REQUIRED','A reviewer or operations manager is required.');
 assert(['draft','changes_requested','submitted'].includes(report.status),409,'REPORT_LOCKED','Evidence cannot change after approval.');
 const evidence=await statement(env.DB,'SELECT id,status,uploaded_by FROM report_evidence WHERE id=? AND report_id=?',id,reportId).first<{id:string;status:string;uploaded_by:string}>();
 assert(evidence,404,'EVIDENCE_NOT_FOUND','Evidence not found.');
 assert(evidence.uploaded_by!==user.id,403,'EVIDENCE_INDEPENDENCE','Another authorised person must review your uploaded evidence.');
 assert(evidence.status==='pending',409,'EVIDENCE_ALREADY_REVIEWED','Evidence has already been reviewed.');
 await env.DB.batch([
  statement(env.DB,'UPDATE report_evidence SET status=?,reviewed_by=?,reviewed_at=? WHERE id=? AND report_id=? AND status=?',d.decision,user.id,now(),id,reportId,'pending'),
  activity(env,user,'report.evidence_reviewed','report_evidence',id,report.property_id,report.scheme_id,{status:d.decision})
 ]);
 return {id,status:d.decision};
}
export async function downloadReportEvidence(env:Env,user:Principal,w:Workspace,reportId:string,id:string):Promise<Response>{
 // Raw inspection evidence is never served directly to customer portals.
 await accessReport(env,user,w,reportId);
 assert(w.kind==='staff',404,'EVIDENCE_NOT_FOUND','Evidence not found.');
 const evidence=await statement(env.DB,'SELECT object_key FROM report_evidence WHERE id=? AND report_id=?',id,reportId).first<{object_key:string}>();
 assert(evidence,404,'EVIDENCE_NOT_FOUND','Evidence not found.');
 const object=await env.DOCUMENTS.get(evidence.object_key);
 assert(object,404,'EVIDENCE_NOT_FOUND','Evidence not found.');
 return new Response(object.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','Content-Disposition':'inline; filename="inspection-evidence.jpg"','X-Content-Type-Options':'nosniff'}});
}
