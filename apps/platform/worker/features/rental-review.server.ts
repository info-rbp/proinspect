import { z } from 'zod';
import { statement, assert, uid, now, type Env } from '../../../../packages/database/types';
import { seal, unseal } from '../../../../packages/auth/crypto';
import { mailEvent } from '../../../../packages/notifications/server';
import { operationsWrite } from '../../../../packages/authorization/server';
import type { Principal } from '../../../../packages/domain/index';
import { FORM18_VERSION, type Form18Answers } from '../../../../packages/marketing/form18';

function staff(user:Principal){
 operationsWrite(user);
 assert(user.staffRole==='administrator'||user.staffRole==='operations_manager',403,
 'STAFF_REQUIRED','Authorised operations staff only.');
}
async function appRow(env:Env,id:string){
 const r=await statement(env.DB,"SELECT a.*,l.display_address,l.kind,l.slug,l.title,l.agent_name,l.instructed_by_client_id,l.application_recipient_email,l.tenancy_database_notice_mode,l.tenancy_database_notice_json FROM rental_applications a JOIN leasing_listings l ON l.id=a.listing_id WHERE a.id=?",id).first<Record<string,any>>();
 assert(r,404,'RENTAL_APPLICATION_NOT_FOUND','Application unavailable.');
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
 const documents=(await statement(env.DB,"SELECT id,applicant_id,category,filename,content_type,size_bytes,review_status,uploaded_at,reviewed_at FROM rental_application_documents WHERE application_id=? ORDER BY uploaded_at DESC",id).all()).results;
 const history=(await statement(env.DB,"SELECT id,kind,created_at,actor_applicant_id,actor_staff_id FROM rental_application_events WHERE application_id=? ORDER BY created_at,id LIMIT 250",id).all()).results;
 const latest=await statement(env.DB,'SELECT id,version,snapshot_envelope,created_at FROM rental_application_submissions WHERE application_id=? ORDER BY version DESC LIMIT 1',id).first<{id:string;version:number;snapshot_envelope:string;created_at:string}>();
 const latestSubmission=latest?{version:latest.version,createdAt:latest.created_at,
  record:await unseal<Record<string,any>>(env.DATA_ENCRYPTION_KEY,'rental-submission:'+latest.id,latest.snapshot_envelope)}:null;
 const notice=app.notice_envelope?await unseal<Record<string,unknown>>(env.DATA_ENCRYPTION_KEY,'rental-notice:'+id,app.notice_envelope):
  {mode:app.tenancy_database_notice_mode,entries:JSON.parse(app.tenancy_database_notice_json)};
 await statement(env.DB,"INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?, 'rental_application.viewed','rental_application',?,'{}',?)",
  uid('aud'),user.id,id,now()).run();
 return {latestSubmission,application:{id:app.id,reference:app.reference,status:app.status,version:app.version,submittedAt:app.submitted_at,
  property:app.display_address,title:app.title,leasingRepresentative:app.agent_name,instructingClientId:app.instructed_by_client_id,
  forwardedAt:app.forwarded_at,noticeVersion:app.consent_version},applicants,documents,notice,history};
}
export async function updateRentalStatus(env:Env,user:Principal,id:string,input:unknown){
 staff(user);const app=await appRow(env,id);
 const d=z.object({version:z.number().int().positive(),
  status:z.enum(['information_requested','ready_for_handoff','forwarded','decision_recorded']),
  note:z.string().trim().min(10).max(1200)}).parse(input);
 const valid:Record<string,string[]>={
  submitted:['information_requested','ready_for_handoff'],
  information_requested:[],
  ready_for_handoff:['forwarded'],
  forwarded:['decision_recorded'],
 };
 assert(valid[app.status]?.includes(d.status),409,'APPLICATION_TRANSITION','This state transition is not permitted.');
 if(d.status==='ready_for_handoff'){
  const unreviewed=await statement(env.DB,"SELECT COUNT(*) AS n FROM rental_application_documents WHERE application_id=? AND review_status='quarantined'",id).first<{n:number}>();
  assert((unreviewed?.n??0)===0,409,'DOCUMENTS_UNREVIEWED','Review or reject quarantined documents before forwarding.');
 }
 const t=now();
 const statements=[
  statement(env.DB,"UPDATE rental_applications SET status=?,version=version+1,updated_at=?,forwarded_at=CASE WHEN ?='forwarded' THEN ? ELSE forwarded_at END,decision_recorded_at=CASE WHEN ?='decision_recorded' THEN ? ELSE decision_recorded_at END WHERE id=? AND version=?",
   d.status,t,d.status,t,d.status,t,id,d.version),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  await audit(env,id,d.status,user.id,{note:d.note}),
 ];
 if(d.status==='information_requested'){
  const primary=await statement(env.DB,"SELECT id,answers_envelope FROM rental_applicants WHERE application_id=? AND ordinal=1",id).first<{id:string;answers_envelope:string}>();
  assert(primary,409,'PRIMARY_MISSING','Primary applicant missing.');
  const answers=await unseal<Form18Answers>(env.DATA_ENCRYPTION_KEY,'rental-applicant:'+primary.id,primary.answers_envelope);
  const link=env.APP_ORIGIN+'/properties-for-lease/residential/'+app.slug+'/apply';
  statements.push(await mailEvent(env,'rental.more_information',{to:answers.identity.email,subject:'More information requested for '+app.reference,
   heading:'Your rental application requires more information',body:'Please use the original private application link or request a fresh link from the property page. ProInspect will not request financial or identity documents by ordinary email.',
   facts:{Reference:app.reference},href:link,sensitive:true}));
 }
 if(d.status==='forwarded'){
  assert(app.application_recipient_email,409,'RECIPIENT_NOT_CONFIGURED','A verified agency/landlord recipient must be configured.');
  statements.push(await mailEvent(env,'rental.application.forwarded',{to:app.application_recipient_email,
   subject:'Rental application ready for secure handoff — '+app.reference,
   heading:'Rental application ready for review',
   body:'A ProInspect residential application is ready. Request access through the previously agreed secure handoff channel. Personal documents and application answers are not included in this email.',
   facts:{Reference:app.reference,Property:app.display_address},sensitive:true}));
 }
 statements.push(statement(env.DB,'DELETE FROM mutation_guards'));
 await env.DB.batch(statements);
 return {ok:true,status:d.status};
}
export async function reviewRentalDocument(env:Env,user:Principal,appId:string,docId:string,input:unknown){
 staff(user);assert(user.staffRole==='administrator',403,'SECURITY_REVIEW_REQUIRED','Administrator review required.');
 await appRow(env,appId);
 const d=z.object({status:z.enum(['released','rejected']),scanReference:z.string().trim().min(8).max(180)}).parse(input);
 const row=await statement(env.DB,"SELECT id FROM rental_application_documents WHERE application_id=? AND id=? AND review_status='quarantined'",appId,docId).first();
 assert(row,409,'DOCUMENT_REVIEWED','This document has already been reviewed or is not associated with the application.');
 await env.DB.batch([
  statement(env.DB,"UPDATE rental_application_documents SET review_status=?,reviewed_by=?,reviewed_at=? WHERE application_id=? AND id=? AND review_status='quarantined'",d.status,user.id,now(),appId,docId),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  await audit(env,appId,'document_reviewed',user.id,{documentId:docId,status:d.status,scanReference:d.scanReference}),
  statement(env.DB,'DELETE FROM mutation_guards'),
 ]);
 return {ok:true};
}
export async function rentalDocumentDownload(env:Env,user:Principal,appId:string,docId:string,quarantine=false){
 staff(user);await appRow(env,appId);
 const doc=await statement(env.DB,"SELECT id,object_key,filename,review_status FROM rental_application_documents WHERE application_id=? AND id=?",appId,docId).first<{id:string;object_key:string;filename:string;review_status:string}>();
 assert(doc,404,'DOCUMENT_NOT_FOUND','Document unavailable.');
 assert(doc.review_status==='released'||(quarantine&&doc.review_status==='quarantined'&&user.staffRole==='administrator'),
 403,'DOCUMENT_QUARANTINED','The document has not passed controlled security review.');
 const obj=await env.RESTRICTED_DOCUMENTS.get(doc.object_key);assert(obj,404,'DOCUMENT_UNAVAILABLE','Document not found.');
 await env.DB.batch([
  statement(env.DB,"INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?, 'rental_document.downloaded','rental_application_document',?,'{}',?)",
   uid('aud'),user.id,doc.id,now()),
  await audit(env,appId,'document_reviewed',user.id,{documentId:docId,action:quarantine?'quarantine_download':'released_download'}),
 ]);
 const name=doc.filename.replace(/[^a-zA-Z0-9 ._()-]/g,'_').slice(0,110)||'document';
 return new Response(obj.body,{headers:{'Content-Type':'application/octet-stream',
  'Content-Disposition':'attachment; filename="'+name+'"',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
