import { z } from 'zod';
import { statement, assert, uid, now, type Env } from '../../../../packages/database/types';
import { seal, unseal } from '../../../../packages/auth/crypto';
import { mailEvent } from '../../../../packages/notifications/server';
import { operationsWrite } from '../../../../packages/authorization/server';
import type { Principal } from '../../../../packages/domain/index';
import { type Form18Answers } from '../../../../packages/marketing/form18';
import { stageRentalAppsScriptHandoff } from './rental-handoff.server';
import { listRentalPrivacyRequests } from './rental-privacy.server';

function staff(user:Principal){
 operationsWrite(user);
 assert(user.staffRole==='administrator'||user.staffRole==='operations_manager',403,
 'STAFF_REQUIRED','Authorised operations staff only.');
}
async function appRow(env:Env,id:string){
 const r=await statement(env.DB,"SELECT a.*,l.display_address,l.kind,l.slug,l.title,l.agent_name,l.instructed_by_client_id,l.application_recipient_email,l.tenancy_database_notice_mode,l.tenancy_database_notice_json FROM rental_applications a JOIN leasing_listings l ON l.id=a.listing_id WHERE a.id=?",id).first<Record<string,any>>();
 assert(r&&r.status!=='draft',404,'RENTAL_APPLICATION_NOT_FOUND','Application unavailable.');
 return r;
}
async function audit(env:Env,appId:string,kind:string,staffId:string,details:unknown){
 const id=uid('rae');
 return statement(env.DB,'INSERT INTO rental_application_events(id,application_id,actor_staff_id,kind,envelope,created_at) VALUES(?,?,?,?,?,?)',
  id,appId,staffId,kind,await seal(env.DATA_ENCRYPTION_KEY,'rental-event:'+id,details),now());
}
export async function listRentalApplications(env:Env,user:Principal,listingId?:string){
 staff(user);
 return {applications:(await statement(env.DB,"SELECT a.id,a.reference,a.status,a.version,a.submitted_at,a.started_at,l.display_address,l.title,l.agent_name,c.name AS instructing_client,(SELECT COUNT(*) FROM rental_applicants p WHERE p.application_id=a.id AND p.state!='removed') AS applicant_count FROM rental_applications a JOIN leasing_listings l ON l.id=a.listing_id JOIN clients c ON c.id=l.instructed_by_client_id WHERE (? IS NULL OR a.listing_id=?) AND a.status!='draft' ORDER BY a.submitted_at DESC,a.id LIMIT 120",listingId??null,listingId??null).all()).results};
}
export async function rentalStaffDetail(env:Env,user:Principal,id:string){
 staff(user);const app=await appRow(env,id);
 const rows=(await statement(env.DB,"SELECT id,ordinal,role,state,declared_at,answers_envelope FROM rental_applicants WHERE application_id=? AND state!='removed' ORDER BY ordinal",id).all<Record<string,any>>()).results;
 const applicants=[];
 for(const p of rows){
  const answers=await unseal<Form18Answers>(env.DATA_ENCRYPTION_KEY,'rental-applicant:'+p.id,p.answers_envelope);
  applicants.push({id:p.id,ordinal:p.ordinal,role:p.role,state:p.state,declaredAt:p.declared_at,answers});
 }
 const documents=(await statement(env.DB,"SELECT id,applicant_id,category,filename,content_type,size_bytes,review_status,scan_status,scanned_at,uploaded_at,reviewed_at FROM rental_application_documents WHERE application_id=? ORDER BY uploaded_at DESC",id).all()).results;
 const history=(await statement(env.DB,"SELECT id,kind,created_at,actor_applicant_id,actor_staff_id FROM rental_application_events WHERE application_id=? ORDER BY created_at,id LIMIT 250",id).all()).results;
 const latest=await statement(env.DB,'SELECT id,version,snapshot_envelope,created_at FROM rental_application_submissions WHERE application_id=? ORDER BY version DESC LIMIT 1',id).first<{id:string;version:number;snapshot_envelope:string;created_at:string}>();
 const latestSubmission=latest?{version:latest.version,createdAt:latest.created_at,
  record:await unseal<Record<string,any>>(env.DATA_ENCRYPTION_KEY,'rental-submission:'+latest.id,latest.snapshot_envelope)}:null;
 const handoffs=(await statement(env.DB,"SELECT id,status,format_version,staged_at,delivered_at FROM rental_application_handoffs WHERE application_id=? ORDER BY staged_at DESC",id).all()).results;
 const privacyRequests=user.staffRole==='administrator'?await listRentalPrivacyRequests(env,user,id):[];
 const notice=app.notice_envelope?await unseal<Record<string,unknown>>(env.DATA_ENCRYPTION_KEY,'rental-notice:'+id,app.notice_envelope):
  {mode:app.tenancy_database_notice_mode,entries:JSON.parse(app.tenancy_database_notice_json)};
 await statement(env.DB,"INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?, 'rental_application.viewed','rental_application',?,'{}',?)",
  uid('aud'),user.id,id,now()).run();
 return {latestSubmission,handoffs,privacyRequests,privacyHoldUntil:app.privacy_hold_until,retainedUntil:app.retained_until,application:{id:app.id,reference:app.reference,status:app.status,version:app.version,submittedAt:app.submitted_at,
  property:app.display_address,title:app.title,leasingRepresentative:app.agent_name,instructingClientId:app.instructed_by_client_id,
  forwardedAt:app.forwarded_at,noticeVersion:app.consent_version},applicants,documents,notice,history};
}
export async function updateRentalStatus(env:Env,user:Principal,id:string,input:unknown){
 staff(user);const app=await appRow(env,id);
 const d=z.object({version:z.number().int().positive(),
  status:z.enum(['information_requested','ready_for_handoff']),
  note:z.string().trim().min(10).max(1200)}).parse(input);
 const valid:Record<string,string[]>={
  submitted:['information_requested','ready_for_handoff'],
  information_requested:[],
  ready_for_handoff:[],
  forwarded:[],
 };
 assert(valid[app.status]?.includes(d.status),409,'APPLICATION_TRANSITION','This state transition is not permitted.');
 let handoff:Awaited<ReturnType<typeof stageRentalAppsScriptHandoff>>|null=null;
 if(d.status==='ready_for_handoff')handoff=await stageRentalAppsScriptHandoff(env,app as Parameters<typeof stageRentalAppsScriptHandoff>[1]);
 const t=now();
 const statements=[
  statement(env.DB,"UPDATE rental_applications SET status=?,version=version+1,updated_at=?,review_request_envelope=CASE WHEN ?='information_requested' THEN ? ELSE review_request_envelope END WHERE id=? AND version=?",
   d.status,t,d.status,d.status==='information_requested'?await seal(env.DATA_ENCRYPTION_KEY,'rental-followup:'+id,{instructions:d.note,at:t}):null,id,d.version),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  await audit(env,id,d.status,user.id,{note:d.note,deliveryMethod:'future_google_apps_script'}),
 ];
 if(handoff)statements.push(handoff.stage);
 if(d.status==='information_requested'){
  statements.push(statement(env.DB,"UPDATE rental_applicants SET state='in_progress',declared_at=NULL,notice_digest=NULL,version=version+1,updated_at=? WHERE application_id=? AND state='complete'",t,id));
  const primary=await statement(env.DB,"SELECT id,answers_envelope FROM rental_applicants WHERE application_id=? AND ordinal=1",id).first<{id:string;answers_envelope:string}>();
  assert(primary,409,'PRIMARY_MISSING','Primary applicant missing.');
  const answers=await unseal<Form18Answers>(env.DATA_ENCRYPTION_KEY,'rental-applicant:'+primary.id,primary.answers_envelope);
  const link=env.APP_ORIGIN+'/properties-for-lease/residential/'+app.slug+'/apply';
  statements.push(await mailEvent(env,'rental.more_information',{to:answers.identity.email,subject:'More information requested for '+app.reference,
   heading:'Your rental application requires more information',body:'Please use the original private application link or request a fresh link from the property page. ProInspect will not request financial or identity documents by ordinary email.',
   facts:{Reference:app.reference},href:link,sensitive:true}));
 }
 statements.push(statement(env.DB,'DELETE FROM mutation_guards'));
 await env.DB.batch(statements);
 return {ok:true,status:d.status,delivery:handoff?'awaiting_google_apps_script':null};
}
export async function reviewRentalDocument(env:Env,user:Principal,appId:string,docId:string,input:unknown){
 staff(user);assert(user.staffRole==='administrator',403,'SECURITY_REVIEW_REQUIRED','Administrator review required.');
 await appRow(env,appId);
 const d=z.object({status:z.enum(['released','rejected']),note:z.string().trim().min(8).max(300)}).parse(input);
 const row=await statement(env.DB,"SELECT id,scan_status FROM rental_application_documents WHERE application_id=? AND id=? AND review_status='quarantined'",appId,docId).first<{id:string;scan_status:string}>();
 assert(row,409,'DOCUMENT_REVIEWED','Document is no longer awaiting review.');
 assert(d.status!=='released'||row.scan_status==='clean',409,'TRUSTED_SCAN_REQUIRED','Only an independently scanned clean document can be released.');
 await env.DB.batch([
  statement(env.DB,"UPDATE rental_application_documents SET review_status=?,reviewed_by=?,reviewed_at=? WHERE application_id=? AND id=? AND review_status='quarantined'",d.status,user.id,now(),appId,docId),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  await audit(env,appId,'document_reviewed',user.id,{documentId:docId,status:d.status,note:d.note,scanStatus:row.scan_status}),
  statement(env.DB,'DELETE FROM mutation_guards'),
 ]);
 return {ok:true};
}
export async function rentalDocumentDownload(env:Env,user:Principal,appId:string,docId:string,quarantine=false){
 staff(user);await appRow(env,appId);
 const doc=await statement(env.DB,"SELECT id,object_key,filename,review_status,scan_status FROM rental_application_documents WHERE application_id=? AND id=?",appId,docId).first<{id:string;object_key:string;filename:string;review_status:string;scan_status:string}>();
 assert(doc,404,'DOCUMENT_NOT_FOUND','Document unavailable.');
 assert(doc.review_status==='released'&&doc.scan_status==='clean',
 403,'DOCUMENT_QUARANTINED','Document is unavailable until an approved malware scanner confirms it is clean.');
 const obj=await env.RESTRICTED_DOCUMENTS.get(doc.object_key);assert(obj,404,'DOCUMENT_UNAVAILABLE','Document not found.');
 await env.DB.batch([
  statement(env.DB,"INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?, 'rental_document.downloaded','rental_application_document',?,'{}',?)",
   uid('aud'),user.id,doc.id,now()),
  await audit(env,appId,'document_reviewed',user.id,{documentId:docId,action:'released_download'}),
 ]);
 const name=doc.filename.replace(/[^a-zA-Z0-9 ._()-]/g,'_').slice(0,110)||'document';
 return new Response(obj.body,{headers:{'Content-Type':'application/octet-stream',
  'Content-Disposition':'attachment; filename="'+name+'"',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
