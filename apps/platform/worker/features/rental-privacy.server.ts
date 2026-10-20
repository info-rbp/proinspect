import { z } from 'zod';
import { assert, now, statement, uid, type Env } from '../../../../packages/database/types';
import { digest, seal, unseal } from '../../../../packages/auth/crypto';
import { hasRentalRetentionPolicy } from '../../../../packages/marketing/rental-retention';
import { operationsWrite } from '../../../../packages/authorization/server';
import { tokenAccess } from './rental-applications.server';
import type { Principal } from '../../../../packages/domain/index';

const requestSchema=z.object({
 kind:z.enum(['access','correction','erasure']),
 note:z.string().trim().max(1200).default(''),
});
type PurgeReason='retention_expired'|'privacy_request'|'operational_remediation';
function administrator(user:Principal){
 operationsWrite(user);
 assert(user.staffRole==='administrator',403,'PRIVACY_ADMIN_REQUIRED','Administrator approval is required.');
}
export async function requestRentalPrivacy(env:Env,token:string,input:unknown){
 const {person,app}=await tokenAccess(env,token);
 const details=requestSchema.parse(input);
 const pending=await statement(env.DB,"SELECT id FROM rental_application_privacy_requests WHERE applicant_id=? AND kind=? AND status IN('requested','in_review')",
  person.id,details.kind).first();
 if(pending)return {recorded:true,alreadyOpen:true};
 const id=uid('rpr'),stamp=now();
 await statement(env.DB,'INSERT INTO rental_application_privacy_requests(id,application_id,applicant_id,kind,request_envelope,created_at) VALUES(?,?,?,?,?,?)',
 id,app.id,person.id,details.kind,
 await seal(env.DATA_ENCRYPTION_KEY,'rental-privacy:'+id,{note:details.note,submittedAt:stamp}),stamp).run();
 return {recorded:true};
}
export async function listRentalPrivacyRequests(env:Env,user:Principal,appId:string){
 administrator(user);
 const rows=(await statement(env.DB,"SELECT id,kind,status,applicant_id,created_at,request_envelope FROM rental_application_privacy_requests WHERE application_id=? ORDER BY created_at DESC LIMIT 40",appId)
  .all<{id:string;kind:string;status:string;applicant_id:string;created_at:string;request_envelope:string}>()).results;
 return Promise.all(rows.map(async r=>({id:r.id,kind:r.kind,status:r.status,applicantId:r.applicant_id,
  createdAt:r.created_at,note:(await unseal<{note:string}>(env.DATA_ENCRYPTION_KEY,'rental-privacy:'+r.id,r.request_envelope)).note})));
}
export async function resolveRentalPrivacyRequest(env:Env,user:Principal,appId:string,requestId:string,input:unknown){
 administrator(user);
 const d=z.object({status:z.enum(['in_review','fulfilled','declined']),
  note:z.string().trim().min(12).max(1500)}).parse(input);
 const row=await statement(env.DB,"SELECT kind,status FROM rental_application_privacy_requests WHERE id=? AND application_id=? AND status IN('requested','in_review')",
  requestId,appId).first<{kind:string;status:string}>();
 assert(row,404,'PRIVACY_REQUEST_NOT_FOUND','Privacy request is not open.');
 assert(row.kind!=='erasure'||d.status!=='fulfilled',409,'ERASURE_REQUIRES_PURGE',
  'To fulfil erasure, use the separate approved purge action after the application has closed.');
 const t=now();
 await env.DB.batch([
  statement(env.DB,"UPDATE rental_application_privacy_requests SET status=?,closed_at=CASE WHEN ?='in_review' THEN NULL ELSE ? END,reviewed_by=? WHERE id=? AND application_id=? AND status IN('requested','in_review')",
   d.status,d.status,t,user.id,requestId,appId),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  statement(env.DB,"INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?,'rental_privacy.reviewed','rental_application',?,?,?)",
   uid('aud'),user.id,appId,JSON.stringify({requestId,kind:row.kind,status:d.status}),t),
  statement(env.DB,'DELETE FROM mutation_guards')
 ]);
 return {status:d.status};
}
export async function setRentalPrivacyHold(env:Env,user:Principal,appId:string,input:unknown){
 administrator(user);
 const d=z.object({holdUntil:z.string().datetime({offset:true}).nullable(),
  reason:z.string().trim().min(12).max(700)}).parse(input);
 if(d.holdUntil){
  const end=new Date(d.holdUntil).getTime();
  assert(end>Date.now()&&end<=Date.now()+366*86400000,422,'HOLD_DATE_INVALID',
   'Choose a future hold expiry within one year, subject to review.');
 }
 const row=await statement(env.DB,'SELECT id FROM rental_applications WHERE id=?',appId).first();
 assert(row,404,'APPLICATION_NOT_FOUND','Application unavailable.');
 await env.DB.batch([
  statement(env.DB,'UPDATE rental_applications SET privacy_hold_until=?,privacy_hold_reference_envelope=?,updated_at=? WHERE id=?',
    d.holdUntil,await seal(env.DATA_ENCRYPTION_KEY,'rental-hold:'+appId,{reason:d.reason,actor:user.id,at:now()}),now(),appId),
  statement(env.DB,"INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?,'rental_privacy.hold_changed','rental_application',?,?,?)",
    uid('aud'),user.id,appId,JSON.stringify({held:Boolean(d.holdUntil)}),now()),
 ]);
 return {held:Boolean(d.holdUntil)};
}
type PurgeRow={id:string;reference:string;status:string;retained_until:string|null;privacy_hold_until:string|null;version:number};
async function purgeRental(env:Env,appId:string,reason:PurgeReason,actorId:string|null){
 const app=await statement(env.DB,'SELECT id,reference,status,retained_until,privacy_hold_until,version FROM rental_applications WHERE id=?',appId).first<PurgeRow>();
 assert(app,404,'APPLICATION_NOT_FOUND','Application unavailable.');
 assert(!app.privacy_hold_until||app.privacy_hold_until<=now(),409,'RETENTION_HOLD','A current privacy/legal hold prevents erasure.');
 assert(['draft','withdrawn','decision_recorded'].includes(app.status),409,'APPLICATION_ACTIVE',
  'An active submitted application cannot be deleted before the authorised process is closed.');
 if(reason==='retention_expired')
  assert(app.retained_until&&app.retained_until<=now(),409,'RETENTION_NOT_DUE','Retention period has not elapsed.');
 const pending=await statement(env.DB,"SELECT id FROM rental_application_handoffs WHERE application_id=? AND status='awaiting_script'",appId).first();
 assert(!pending,409,'PENDING_AGENCY_HANDOFF','Cancel the outstanding handoff before purging.');
 // Close editing BEFORE reading the document manifest: uploads that started
 // before this operation are also rejected by the database trigger.
 if(app.status==='draft'){
  const closed=await statement(env.DB,"UPDATE rental_applications SET status='withdrawn',withdrawn_at=?,updated_at=?,version=version+1 WHERE id=? AND status='draft' AND version=?",
   now(),now(),appId,app.version).run();
  assert(closed.meta.changes===1,409,'APPLICATION_CHANGED','Application changed. Retry the privacy action.');
 }
 const docs=(await statement(env.DB,'SELECT id,object_key FROM rental_application_documents WHERE application_id=?',appId)
  .all<{id:string;object_key:string}>()).results;
 const applicants=await statement(env.DB,'SELECT COUNT(*) AS n FROM rental_applicants WHERE application_id=?',appId).first<{n:number}>();
 // If private object removal fails, D1 is intentionally left intact so the
 // scheduled purge can retry rather than leaving an untracked R2 object.
 for(const doc of docs)await env.RESTRICTED_DOCUMENTS.delete(doc.object_key);
 const receipt=uid('rpur'),t=now();
 const hashedReference=await digest(env.DATA_ENCRYPTION_KEY+':rental-purge:'+app.reference);
 await env.DB.batch([
  statement(env.DB,'INSERT INTO rental_application_purge_permits(application_id,reason,issued_at) VALUES(?,?,?)',appId,reason,t),
  statement(env.DB,'DELETE FROM rental_document_scan_receipts WHERE document_id IN(SELECT id FROM rental_application_documents WHERE application_id=?)',appId),
  statement(env.DB,'DELETE FROM rental_application_documents WHERE application_id=?',appId),
  statement(env.DB,'DELETE FROM rental_application_handoffs WHERE application_id=?',appId),
  statement(env.DB,'DELETE FROM rental_application_privacy_requests WHERE application_id=?',appId),
  statement(env.DB,'DELETE FROM rental_application_submissions WHERE application_id=?',appId),
  statement(env.DB,'DELETE FROM rental_application_events WHERE application_id=?',appId),
  statement(env.DB,'DELETE FROM rental_applicants WHERE application_id=?',appId),
  statement(env.DB,'DELETE FROM rental_applications WHERE id=?',appId),
  statement(env.DB,'DELETE FROM rental_application_purge_permits WHERE application_id=?',appId),
  statement(env.DB,'INSERT INTO rental_application_purge_receipts(id,reference_digest,reason,actor_user_id,document_count,applicant_count,purged_at) VALUES(?,?,?,?,?,?,?)',
   receipt,hashedReference,reason,actorId,docs.length,applicants?.n??0,t),
 ]);
 return {erased:true,documents:docs.length,receipt};
}
export async function eraseRentalForRequest(env:Env,user:Principal,appId:string,input:unknown){
 administrator(user);
 const d=z.object({privacyRequestId:z.string().min(5),confirm:z.literal('ERASE')}).parse(input);
 const request=await statement(env.DB,"SELECT id FROM rental_application_privacy_requests WHERE id=? AND application_id=? AND kind='erasure' AND status IN('requested','in_review')",
  d.privacyRequestId,appId).first();
 assert(request,409,'ERASURE_REQUEST_REQUIRED','A pending verified erasure request is required.');
 return purgeRental(env,appId,'privacy_request',user.id);
}
/** Scheduled privacy erasure is opt-in only after a written retention policy
 * and operational backups/R2 deletion procedures have been approved. */
export async function dispatchRentalRetention(env:Env){
 if(env.RENTAL_RETENTION_AUTOPURGE_ENABLED!=='true'||!hasRentalRetentionPolicy(env))return;
 const rows=(await statement(env.DB,"SELECT id FROM rental_applications WHERE retained_until IS NOT NULL AND retained_until<=? AND (privacy_hold_until IS NULL OR privacy_hold_until<=?) AND status IN('draft','withdrawn','decision_recorded') ORDER BY retained_until LIMIT 10",
 now(),now()).all<{id:string}>()).results;
 for(const row of rows){
  try{await purgeRental(env,row.id,'retention_expired',null);}
  catch(error){console.error(JSON.stringify({event:'rental.retention.purge_failed',code:error instanceof Error?'PURGE_REQUIRES_RETRY':'PURGE_FAILED'}));}
 }
}
