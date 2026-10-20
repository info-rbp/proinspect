import { hasRentalRetentionPolicy,retentionDeadline } from '../../../../packages/marketing/rental-retention';
import { z } from 'zod';
import { now, uid, assert, statement, type Env } from '../../../../packages/database/types';
import { digest, seal, unseal, randomToken } from '../../../../packages/auth/crypto';
import { mailEvent } from '../../../../packages/notifications/server';
import { isLocal } from '../../../../packages/auth/server';
import {
 ANSWER_STEPS, FORM18_VERSION, cleanSection, allDetailsComplete, initialAnswers,
 startApplicationSchema, inviteApplicantSchema, documentCategorySchema, maskedEmail,
 type AnswerStep, type Form18Answers,
} from '../../../../packages/marketing/form18';

type RentalRow={id:string;listing_id:string;reference:string;status:string;version:number;submitted_at:string|null;notice_envelope:string|null;review_request_envelope:string|null;started_at:string};
type ApplicantRow={id:string;application_id:string;role:string;ordinal:number;state:string;email_hash:string;answers_envelope:string;version:number;access_expires_at:string;declared_at:string|null;notice_digest:string|null};
type RentalListing={id:string;slug:string;title:string;display_address:string;suburb:string;postcode:string;agent_name:string;agent_role:string;application_mode:string;tenancy_database_notice_mode:string;tenancy_database_notice_json:string;application_recipient_email:string|null;status:string;kind:string};
export const rentalEnabled=(env:Env)=>env.RENTAL_APPLICATIONS_ENABLED==='true'&&Boolean(env.DATA_ENCRYPTION_KEY&&env.RESTRICTED_DOCUMENTS&&hasRentalRetentionPolicy(env));
const expiry=()=>new Date(Date.now()+30*86400000).toISOString();
const mailLink=(env:Env,token:string)=>env.APP_ORIGIN+'/rental-application/'+token;
const emailHash=(env:Env,email:string)=>digest(env.DATA_ENCRYPTION_KEY+':rental-applicant:'+email.trim().toLowerCase());

async function event(env:Env,appId:string,kind:string,detail:unknown,applicantId?:string,staffId?:string){
 const id=uid('rae');
 return statement(env.DB,'INSERT INTO rental_application_events(id,application_id,actor_applicant_id,actor_staff_id,kind,envelope,created_at) VALUES(?,?,?,?,?,?,?)',
  id,appId,applicantId??null,staffId??null,kind,await seal(env.DATA_ENCRYPTION_KEY,'rental-event:'+id,detail),now());
}
async function limit(env:Env,scope:string,max:number){
 const key=await digest(env.DATA_ENCRYPTION_KEY+':rental-rate:'+scope),time=now();
 const r=await statement(env.DB,'INSERT INTO auth_rate_limits(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING attempts',
 key,new Date(Date.now()+900000).toISOString(),time,time).first<{attempts:number}>();
 assert(r&&r.attempts<=max,429,'RENTAL_RATE_LIMIT','Too many requests. Please try later.');
}
async function turnstile(env:Env,request:Request,token?:string){
 if(isLocal(request,env))return;
 assert(env.MARKETING_TURNSTILE_SECRET_KEY&&token,503,'RENTAL_SECURITY','The security check is not configured.');
 const res=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
  method:'POST',body:new URLSearchParams({secret:env.MARKETING_TURNSTILE_SECRET_KEY,response:token}),signal:AbortSignal.timeout(10000)
 });
 const result=await res.json() as {success:boolean;hostname?:string;action?:string};
 assert(res.ok&&result.success&&result.hostname===new URL(env.APP_ORIGIN).hostname&&result.action==='rental_application',
  403,'RENTAL_SECURITY_CHECK','Security verification has expired. Please try again.');
}
async function listing(env:Env,id:string){
 const r=await statement(env.DB,'SELECT id,kind,slug,title,display_address,suburb,postcode,agent_name,agent_role,status,application_mode,tenancy_database_notice_mode,tenancy_database_notice_json,application_recipient_email FROM leasing_listings WHERE id=?',id).first<RentalListing>();
 assert(r,404,'PROPERTY_NOT_AVAILABLE','Property not available.');
 return r;
}
function active(r:RentalListing){
 assert(r.kind==='residential'&&r.status==='published'&&r.application_mode==='proinspect',404,
 'RENTAL_APPLICATION_UNAVAILABLE','This property does not accept ProInspect applications.');
}
function enabled(env:Env){assert(rentalEnabled(env),503,'RENTAL_NOT_ENABLED','This application service is not yet available.');}
export async function rentalStartPage(env:Env,slug:string){
 const row=await statement(env.DB,"SELECT id,kind,slug,title,display_address,suburb,postcode,agent_name,agent_role,status,application_mode,tenancy_database_notice_mode,tenancy_database_notice_json,application_recipient_email FROM leasing_listings WHERE kind='residential' AND slug=? AND status='published' AND application_mode='proinspect'",slug).first<RentalListing>();
 assert(row,404,'RENTAL_APPLICATION_UNAVAILABLE','Online applications are unavailable for this property.');
 return {listing:{id:row.id,slug:row.slug,title:row.title,address:row.display_address,suburb:row.suburb,agentName:row.agent_name},
  enabled:rentalEnabled(env),siteKey:env.MARKETING_TURNSTILE_SITE_KEY??''};
}
export async function startRental(env:Env,request:Request,listingId:string,input:unknown,security?:string){
 enabled(env);
 const d=startApplicationSchema.parse(input);
 const l=await listing(env,listingId);active(l);
 const ip=await digest(env.DATA_ENCRYPTION_KEY+':applicant:'+String(request.headers.get('CF-Connecting-IP')??'unknown'));
 await limit(env,'origin:'+ip,5);await limit(env,'email:'+d.email,4);
 await turnstile(env,request,security);
 const hash=await emailHash(env,d.email),token=randomToken(),tokenHash=await digest(token),t=now();
 const existing=await statement(env.DB,"SELECT a.id AS application_id,p.id AS applicant_id FROM rental_applicants p JOIN rental_applications a ON a.id=p.application_id WHERE a.listing_id=? AND a.status IN('draft','information_requested') AND p.ordinal=1 AND p.email_hash=? ORDER BY a.started_at DESC LIMIT 1",listingId,hash).first<{application_id:string;applicant_id:string}>();
 if(existing){
  await env.DB.batch([
   statement(env.DB,'UPDATE rental_applicants SET access_token_hash=?,access_expires_at=?,updated_at=? WHERE id=?',tokenHash,expiry(),t,existing.applicant_id),
   await event(env,existing.application_id,'resumed',{channel:'email'},existing.applicant_id),
   await mailEvent(env,'rental.application.resume',{to:d.email,subject:'Resume your ProInspect rental application',heading:'Continue your application',body:'Use this private link to return to your unfinished rental application. Do not forward it.',href:mailLink(env,token),sensitive:true}),
  ]);
  return {sent:true};
 }
 const appId=uid('rapp'),applicantId=uid('rap'),reference='RNT-'+crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase();
 await env.DB.batch([
  statement(env.DB,"INSERT INTO rental_applications(id,listing_id,reference,status,started_at,updated_at,consent_version,retained_until) VALUES(?,?,?,'draft',?,?,?,?)",appId,listingId,reference,t,t,FORM18_VERSION,retentionDeadline(env,'draft')),
  statement(env.DB,"INSERT INTO rental_applicants(id,application_id,ordinal,role,email_hash,access_token_hash,access_expires_at,answers_envelope,state,created_at,updated_at) VALUES(?,?,1,'primary',?,?,?,?,'in_progress',?,?)",
    applicantId,appId,hash,tokenHash,expiry(),await seal(env.DATA_ENCRYPTION_KEY,'rental-applicant:'+applicantId,initialAnswers(d.name,d.email)),t,t),
  await event(env,appId,'started',{propertyId:listingId,formVersion:FORM18_VERSION},applicantId),
  await mailEvent(env,'rental.application.started',{to:d.email,subject:'Your ProInspect rental application link',heading:'Start your rental application',body:'Use this private link to complete your residential application. You may save and return later. This is not a tenancy offer.',href:mailLink(env,token),sensitive:true}),
 ]);
 return {sent:true};
}
export async function tokenAccess(env:Env,token:string){
 enabled(env);
 assert(/^[a-f0-9]{64}$/.test(token),404,'APPLICATION_LINK_INVALID','Application link unavailable.');
 const tokenHash=await digest(token);
 const person=await statement(env.DB,"SELECT id,application_id,role,ordinal,state,email_hash,answers_envelope,version,access_expires_at,declared_at,notice_digest FROM rental_applicants WHERE access_token_hash=? AND access_expires_at>? AND state!='removed'",tokenHash,now()).first<ApplicantRow>();
 assert(person,404,'APPLICATION_LINK_EXPIRED','This application link is unavailable or expired.');
 const app=await statement(env.DB,'SELECT * FROM rental_applications WHERE id=?',person.application_id).first<RentalRow>();
 assert(app,404,'APPLICATION_UNAVAILABLE','Application unavailable.');
 const l=await listing(env,app.listing_id);
 const answers=await unseal<Form18Answers>(env.DATA_ENCRYPTION_KEY,'rental-applicant:'+person.id,person.answers_envelope);
 return {person,app,l,answers};
}
export async function rentalPage(env:Env,token:string){
 const {person,app,l,answers}=await tokenAccess(env,token);
 const documents=(await statement(env.DB,'SELECT id,category,filename,size_bytes,review_status,uploaded_at FROM rental_application_documents WHERE applicant_id=? ORDER BY uploaded_at DESC',person.id).all()).results;
 const expectedNotice=await digest(JSON.stringify([l.tenancy_database_notice_mode,l.tenancy_database_notice_json,l.agent_name]));
 const noticeMatches=person.notice_digest===expectedNotice;
 const household:{ordinal:number;state:string;maskedEmail:string;name:string}[]=[];
 if(person.role==='primary'){
  const rows=(await statement(env.DB,"SELECT id,ordinal,state,notice_digest,answers_envelope FROM rental_applicants WHERE application_id=? AND state!='removed' ORDER BY ordinal",app.id).all<{id:string;ordinal:number;state:string;notice_digest:string|null;answers_envelope:string}>()).results;
  for(const p of rows){
   const details=await unseal<Form18Answers>(env.DATA_ENCRYPTION_KEY,'rental-applicant:'+p.id,p.answers_envelope);
   household.push({ordinal:p.ordinal,state:p.state==='complete'&&p.notice_digest!==expectedNotice&&allowedEdit(app.status)?'needs_review':p.state,maskedEmail:maskedEmail(details.identity?.email??''),name:details.identity?.fullName??'Applicant'});
  }
 }
 const configuredNotice=app.notice_envelope?await unseal<{mode:string;entries:{name:string;operatorContact:string;accessInstructions:string}[]}>(env.DATA_ENCRYPTION_KEY,'rental-notice:'+app.id,app.notice_envelope):null;
 const notice=(configuredNotice?.entries??JSON.parse(l.tenancy_database_notice_json)) as {name:string;operatorContact:string;accessInstructions:string}[];
 const moreInformation=app.status==='information_requested'&&app.review_request_envelope?
  await unseal<{instructions:string}>(env.DATA_ENCRYPTION_KEY,'rental-followup:'+app.id,app.review_request_envelope):null;
 const privacyRequests=(await statement(env.DB,"SELECT kind,status,created_at FROM rental_application_privacy_requests WHERE applicant_id=? ORDER BY created_at DESC LIMIT 12",person.id).all()).results;
 return {reference:app.reference,status:app.status,version:person.version,role:person.role,ordinal:person.ordinal,
  state:person.state,noticeMatches,declaredAt:person.declared_at,submittedAt:app.submitted_at,
  property:{title:l.title,address:l.display_address,suburb:l.suburb,agentName:l.agent_name},
  notice:{mode:configuredNotice?.mode??l.tenancy_database_notice_mode,entries:notice},moreInformation,privacyRequests,answers,documents,household};
}
const allowedEdit=(status:string)=>['draft','information_requested'].includes(status);
export async function saveRentalSection(env:Env,token:string,section:AnswerStep,raw:Record<string,unknown>,version:number){
 const {person,app,answers}=await tokenAccess(env,token);
 assert(allowedEdit(app.status),409,'APPLICATION_LOCKED','Submitted applications cannot be edited without a new information request.');
 assert(ANSWER_STEPS.includes(section),422,'SECTION_INVALID','Choose a form section.');
 assert(person.version===version,409,'DRAFT_CHANGED','This draft has changed. Reload before saving.');
 if(section==='identity')raw.email=answers.identity?.email??'';
 const values=cleanSection(section,raw);
 const updated={...answers,[section]:values};
 const result=await env.DB.batch([
  statement(env.DB,"UPDATE rental_applicants SET answers_envelope=?,state='in_progress',declared_at=NULL,notice_digest=NULL,version=version+1,updated_at=? WHERE id=? AND version=? AND state!='removed' AND EXISTS(SELECT 1 FROM rental_applications a WHERE a.id=rental_applicants.application_id AND a.status IN('draft','information_requested'))",
    await seal(env.DATA_ENCRYPTION_KEY,'rental-applicant:'+person.id,updated),now(),person.id,version),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  await event(env,app.id,'section_saved',{section},person.id),
  statement(env.DB,'DELETE FROM mutation_guards'),
 ]);
 assert(result[0].meta.changes===1,409,'DRAFT_CHANGED','Your draft has changed; reload before retrying.');
 return {saved:true};
}
export async function inviteRentalApplicant(env:Env,token:string,input:unknown){
 const {person,app}=await tokenAccess(env,token);
 assert(person.role==='primary'&&allowedEdit(app.status),403,'INVITE_NOT_ALLOWED','Only the primary applicant can invite others before submission.');
 const d=inviteApplicantSchema.parse(input),hash=await emailHash(env,d.email);
 const registered=(await statement(env.DB,"SELECT id,ordinal FROM rental_applicants WHERE application_id=? AND state!='removed' ORDER BY ordinal",app.id).all()).results;
 assert(registered.length<10,422,'APPLICANT_LIMIT','You can add up to ten applicants.');
 const used=await statement(env.DB,'SELECT id FROM rental_applicants WHERE application_id=? AND email_hash=?',app.id,hash).first();
 assert(!used,409,'ALREADY_INVITED','This email has already been added.');
 const usedOrders=(await statement(env.DB,'SELECT ordinal FROM rental_applicants WHERE application_id=?',app.id).all<{ordinal:number}>()).results.map(x=>x.ordinal);
 const ordinal=Array.from({length:10},(_,i)=>i+1).find(x=>!usedOrders.includes(x));
 assert(ordinal&&ordinal>1,422,'APPLICANT_LIMIT','Maximum applicants reached.');
 const invite=uid('rap'),secret=randomToken(),t=now();
 await env.DB.batch([
  statement(env.DB,"INSERT INTO rental_applicants(id,application_id,ordinal,role,email_hash,access_token_hash,access_expires_at,answers_envelope,created_at,updated_at) VALUES(?,?,?,'coapplicant',?,?,?,?,?,?)",
   invite,app.id,ordinal,hash,await digest(secret),expiry(),await seal(env.DATA_ENCRYPTION_KEY,'rental-applicant:'+invite,initialAnswers(d.name,d.email)),t,t),
  await event(env,app.id,'coapplicant_invited',{ordinal},person.id),
  await mailEvent(env,'rental.coapplicant.invited',{to:d.email,subject:'Complete your part of a rental application',heading:'You have been invited to apply',body:'The primary applicant invited you to complete your own rental application details. Your answers and documents are private and are not shared with other applicants.',href:mailLink(env,secret),sensitive:true}),
 ]);
 return {invited:true};
}
export async function resendRentalInvitation(env:Env,token:string,ordinal:number){
 const {person,app}=await tokenAccess(env,token);
 assert(person.role==='primary'&&app.status==='draft'&&ordinal>1,403,
  'RESEND_NOT_ALLOWED','Only the primary applicant may resend an invitation before submission.');
 const match=await statement(env.DB,"SELECT id,answers_envelope,state FROM rental_applicants WHERE application_id=? AND ordinal=? AND state!='removed'",
  app.id,ordinal).first<{id:string;answers_envelope:string;state:string}>();
 assert(match,404,'APPLICANT_NOT_FOUND','Applicant unavailable.');
 await limit(env,'resend:'+match.id,5);
 const answers=await unseal<Form18Answers>(env.DATA_ENCRYPTION_KEY,'rental-applicant:'+match.id,match.answers_envelope);
 const address=answers.identity?.email;
 assert(address,409,'APPLICANT_EMAIL_MISSING','Applicant email is unavailable.');
 const secret=randomToken();
 await env.DB.batch([
  statement(env.DB,'UPDATE rental_applicants SET access_token_hash=?,access_expires_at=?,updated_at=? WHERE id=?',
   await digest(secret),expiry(),now(),match.id),
  await event(env,app.id,'coapplicant_invited',{ordinal,resent:true},person.id),
  await mailEvent(env,'rental.coapplicant.reminder',{to:address,
   subject:'Your private rental application link',
   heading:'Continue your part of the application',
   body:'You have a new secure link to complete or review your own rental application information. Do not forward this link.',
   href:mailLink(env,secret),sensitive:true}),
 ]);
 return {resent:true};
}
export async function removeRentalApplicant(env:Env,token:string,ordinal:number){
 const {person,app}=await tokenAccess(env,token);
 assert(person.role==='primary'&&app.status==='draft'&&ordinal>1,403,'REMOVE_NOT_ALLOWED','Only invited applicants may be removed before submission.');
 const match=await statement(env.DB,"SELECT id FROM rental_applicants WHERE application_id=? AND ordinal=? AND state!='removed'",app.id,ordinal).first<{id:string}>();
 assert(match,404,'APPLICANT_NOT_FOUND','Applicant not found.');
 const files=(await statement(env.DB,'SELECT object_key FROM rental_application_documents WHERE applicant_id=?',match.id).all<{object_key:string}>()).results;
 await env.DB.batch([
  statement(env.DB,'DELETE FROM rental_application_documents WHERE applicant_id=?',match.id),
  statement(env.DB,"UPDATE rental_applicants SET state='removed',access_token_hash=?,updated_at=? WHERE id=? AND state!='removed'",await digest(randomToken()),now(),match.id),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  await event(env,app.id,'coapplicant_removed',{ordinal,documentsRemoved:files.length},person.id),
  statement(env.DB,'DELETE FROM mutation_guards'),
 ]);
 for(const f of files)await env.RESTRICTED_DOCUMENTS.delete(f.object_key);
 return {removed:true};
}
export async function finishRentalApplicant(env:Env,token:string,consent:unknown,version:number){
 const {person,app,answers}=await tokenAccess(env,token);
 assert(allowedEdit(app.status),409,'APPLICATION_LOCKED','This application has already been submitted.');
 assert(person.version===version,409,'DRAFT_CHANGED','Reload your information before declaring.');
 assert(allDetailsComplete(answers),422,'APPLICATION_INCOMPLETE','Complete the required application sections before declaring.');
 const d=z.object({accurate:z.literal(true),shareWithRepresentative:z.literal(true),
  notAnAgreement:z.literal(true),noticeAcknowledged:z.literal(true)}).parse(consent);
 const l=await listing(env,app.listing_id);
 assert(l.tenancy_database_notice_mode!=='unconfigured',503,'TENANCY_NOTICE_REQUIRED','Database notice has not been configured.');
 const noticeDigest=await digest(JSON.stringify([l.tenancy_database_notice_mode,l.tenancy_database_notice_json,l.agent_name]));
 const t=now();
 await env.DB.batch([
  statement(env.DB,"UPDATE rental_applicants SET state='complete',declared_at=?,notice_digest=?,version=version+1,updated_at=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM rental_applications a WHERE a.id=rental_applicants.application_id AND a.status IN('draft','information_requested'))",t,noticeDigest,t,person.id,version),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  await event(env,app.id,'applicant_completed',{formVersion:FORM18_VERSION,noticeMode:l.tenancy_database_notice_mode,declarations:d,at:t},person.id),
  statement(env.DB,'DELETE FROM mutation_guards'),
 ]);
 return {complete:true};
}
export async function submitRental(env:Env,token:string){
 const {person,app,l,answers}=await tokenAccess(env,token);
 assert(person.role==='primary'&&allowedEdit(app.status),403,'SUBMISSION_NOT_ALLOWED','Only the primary applicant submits the household application.');
 active(l);
 const rows=(await statement(env.DB,"SELECT id,ordinal,state,declared_at,notice_digest FROM rental_applicants WHERE application_id=? AND state!='removed'",app.id).all<{id:string;ordinal:number;state:string;declared_at:string|null;notice_digest:string|null}>()).results;
 assert(rows.length>=1&&rows.every(x=>x.state==='complete'&&Boolean(x.declared_at)),422,'APPLICANTS_INCOMPLETE',
  'Every included applicant must complete their declaration before the application can be submitted.');
 const noticeDigest=await digest(JSON.stringify([l.tenancy_database_notice_mode,l.tenancy_database_notice_json,l.agent_name]));
 assert(rows.every(x=>x.notice_digest===noticeDigest),409,'NOTICE_CHANGED','The tenancy database notice has changed. Every applicant must review and declare again.');
 assert(l.application_recipient_email&&l.tenancy_database_notice_mode!=='unconfigured',503,'APPLICATION_SETTINGS_REQUIRED','The application arrangements require review.');
 const notice={mode:l.tenancy_database_notice_mode,entries:JSON.parse(l.tenancy_database_notice_json),
  representative:l.agent_name,property:l.display_address,formVersion:FORM18_VERSION};
 const stamp=now();
 const completePeople=await Promise.all(rows.map(async row=>{
  const record=await statement(env.DB,'SELECT answers_envelope FROM rental_applicants WHERE id=?',row.id).first<{answers_envelope:string}>();
  assert(record,409,'APPLICANTS_INCOMPLETE','An applicant could not be read.');
  return {ordinal:row.ordinal,declaredAt:row.declared_at,
   answers:await unseal<Form18Answers>(env.DATA_ENCRYPTION_KEY,'rental-applicant:'+row.id,record.answers_envelope)};
 }));
 const fileManifest=(await statement(env.DB,'SELECT applicant_id,category,filename,size_bytes,sha256,review_status FROM rental_application_documents WHERE application_id=? ORDER BY uploaded_at',app.id).all()).results;
 const prior=await statement(env.DB,'SELECT COALESCE(MAX(version),0) AS n FROM rental_application_submissions WHERE application_id=?',app.id).first<{n:number}>();
 const snapshotVersion=(prior?.n??0)+1;
 assert(snapshotVersion<=30,422,'SUBMISSION_LIMIT','Submission history requires staff review.');
 const snapshot={reference:app.reference,formVersion:FORM18_VERSION,submittedAt:stamp,
  property:l.display_address,leasingRepresentative:l.agent_name,
  applicants:completePeople,notice,documents:fileManifest};
 const submissionId=uid('ras');
 await env.DB.batch([
  statement(env.DB,"UPDATE rental_applications SET status='submitted',notice_envelope=?,submitted_at=COALESCE(submitted_at,?),retained_until=?,updated_at=?,version=version+1 WHERE id=? AND status IN('draft','information_requested') AND version=?",
   await seal(env.DATA_ENCRYPTION_KEY,'rental-notice:'+app.id,notice),stamp,retentionDeadline(env,'submitted'),stamp,app.id,app.version),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  statement(env.DB,'INSERT INTO rental_application_submissions(id,application_id,submitted_by_applicant_id,version,form_version,snapshot_envelope,created_at) VALUES(?,?,?,?,?,?,?)',
   submissionId,app.id,person.id,snapshotVersion,FORM18_VERSION,
   await seal(env.DATA_ENCRYPTION_KEY,'rental-submission:'+submissionId,snapshot),stamp),
  await event(env,app.id,'submitted',{reference:app.reference,applicantCount:rows.length,formVersion:FORM18_VERSION},person.id),
  await mailEvent(env,'rental.application.received',{to:answers.identity?.email,subject:'Rental application received — '+app.reference,
   heading:'Your rental application was received',body:'We have recorded your application for '+l.title+'. The responsible landlord or licensed leasing representative makes the decision. This is not a tenancy agreement or offer.',
   facts:{Reference:app.reference,Property:l.display_address},sensitive:true}),
  ...(env.OPERATIONS_EMAIL?[await mailEvent(env,'rental.application.operations',{to:env.OPERATIONS_EMAIL,
   subject:'Residential application ready — '+app.reference,heading:'A residential rental application needs review',
   body:'An encrypted residential application was submitted. Open the restricted staff application queue to review and forward it securely.',
   facts:{Reference:app.reference,Property:l.display_address}})]:[]),
  statement(env.DB,'DELETE FROM mutation_guards'),
 ]);
 return {submitted:true,reference:app.reference};
}
export async function withdrawRental(env:Env,token:string){
 const {person,app}=await tokenAccess(env,token);
 assert(person.role==='primary'&&!['withdrawn','decision_recorded'].includes(app.status),403,'WITHDRAW_NOT_ALLOWED','Only the primary applicant can withdraw an active application.');
 const stamp=now();
 await env.DB.batch([
  statement(env.DB,"UPDATE rental_applications SET status='withdrawn',withdrawn_at=?,retained_until=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND status NOT IN('withdrawn','decision_recorded')",
   stamp,retentionDeadline(env,'withdrawn'),stamp,app.id,app.version),
  statement(env.DB,"UPDATE rental_application_handoffs SET status='cancelled' WHERE application_id=? AND status='awaiting_script'",app.id),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  await event(env,app.id,'withdrawn',{at:stamp},person.id),
  statement(env.DB,'DELETE FROM mutation_guards'),
 ]);
 return {withdrawn:true};
}
function validMagic(type:string,bytes:Uint8Array){
 if(type==='application/pdf')return bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45;
 if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(type==='image/png')return bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
 if(type==='image/webp')return bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80;
 return false;
}
export async function uploadRentalDocument(env:Env,token:string,form:FormData){
 const {person,app}=await tokenAccess(env,token);
 assert(allowedEdit(app.status),409,'UPLOAD_CLOSED','Documents cannot be changed after submission.');
 const file=form.get('file'),category=documentCategorySchema.parse(form.get('category'));
 assert(file instanceof File&&file.size>=1&&file.size<=8388608,413,'DOCUMENT_SIZE','Choose a file up to 8 MB.');
 assert(['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type),422,'DOCUMENT_TYPE','Upload PDF, JPEG, PNG or WebP only.');
 const count=await statement(env.DB,'SELECT COUNT(*) AS n FROM rental_application_documents WHERE applicant_id=?',person.id).first<{n:number}>();
 assert((count?.n??0)<10,422,'DOCUMENT_LIMIT','Each applicant may add up to ten documents.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 assert(validMagic(file.type,bytes),422,'DOCUMENT_INVALID','The uploaded file does not match its selected type.');
 const sha=await digest(bytes.buffer),filename=file.name.replace(/[^a-zA-Z0-9 .()_-]/g,'_').slice(0,100)||'document';
 const duplicate=await statement(env.DB,'SELECT id FROM rental_application_documents WHERE applicant_id=? AND sha256=?',person.id,sha).first();
 assert(!duplicate,409,'DOCUMENT_DUPLICATE','This file has already been uploaded.');
 const id=uid('rad'),objectKey='rental-applications/'+app.id+'/'+person.id+'/'+id;
 await env.RESTRICTED_DOCUMENTS.put(objectKey,bytes,{httpMetadata:{contentType:'application/octet-stream'}});
 try{
  await env.DB.batch([
   statement(env.DB,'INSERT INTO rental_application_documents(id,application_id,applicant_id,object_key,category,filename,content_type,size_bytes,sha256,uploaded_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
   id,app.id,person.id,objectKey,category,filename,file.type,file.size,sha,now()),
   await event(env,app.id,'document_uploaded',{documentId:id,category},person.id),
  ]);
 }catch(error){await env.RESTRICTED_DOCUMENTS.delete(objectKey);throw error;}
 return {uploaded:true};
}
export async function deleteRentalDocument(env:Env,token:string,docId:string){
 const {person,app}=await tokenAccess(env,token);
 assert(allowedEdit(app.status),409,'APPLICATION_LOCKED','Documents cannot be changed after submission.');
 const row=await statement(env.DB,'SELECT id,object_key FROM rental_application_documents WHERE id=? AND applicant_id=? AND application_id=?',
 docId,person.id,app.id).first<{id:string;object_key:string}>();
 assert(row,404,'DOCUMENT_NOT_FOUND','Document unavailable.');
 await env.RESTRICTED_DOCUMENTS.delete(row.object_key);
 await env.DB.batch([
  statement(env.DB,'DELETE FROM rental_document_scan_receipts WHERE document_id=?',row.id),
  statement(env.DB,'DELETE FROM rental_application_documents WHERE id=? AND applicant_id=?',row.id,person.id),
  await event(env,app.id,'document_removed',{documentId:row.id},person.id),
 ]);
 return {deleted:true};
}
