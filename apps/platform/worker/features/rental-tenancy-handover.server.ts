import { assert, now, statement, uid, type Env } from '../../../../packages/database/types';
import type { Principal } from '../../../../packages/domain/index';
import { operationsWrite } from '../../../../packages/authorization/server';
import { digest, randomToken, seal, unseal } from '../../../../packages/auth/crypto';
import { mailEvent } from '../../../../packages/notifications/server';
import { requireReleaseApproval } from './release-governance.server';
function enabled(env:Env){assert(env.RENTAL_TENANCY_HANDOVER_ENABLED==='true',503,'HANDOVER_DISABLED','Tenancy handover has not passed hosted release acceptance.');}
import { agreementMatchesPreparedTerms, preparedTenancyDates, tenancyActivationInput, tenancyHandoverInput, tenancyVoidInput } from '../../../../packages/marketing/rental-tenancy-handover';
import { validateForm1AA } from '../../../../packages/wa-residential/form1aa';

type Handover={id:string;application_id:string;tenancy_id:string;property_id:string;status:string;terms_envelope:string;applicant_count:number};
type Person={applicant_ordinal:number;email_hash:string};
type Application={id:string;version:number;status:string;reference:string;privacy_hold_until:string|null;listing_id:string;property_id:string;application_mode:string;rental_approval_state:string;instructed_by_client_id:string;kind:string;listing_status:string};
type Snapshot={applicants:Array<{ordinal:number;answers:{identity?:{email?:string}}}>};
function staff(user:Principal){
 operationsWrite(user);
 assert(user.staffRole==='administrator'||user.staffRole==='operations_manager',403,'HANDOVER_STAFF_ONLY','Restricted leasing operations staff only.');
}
const hashEmail=(env:Env,email:string)=>digest(env.DATA_ENCRYPTION_KEY+':rental-applicant:'+email.toLowerCase());
async function state(env:Env,id:string){return statement(env.DB,'SELECT * FROM rental_tenancy_handovers WHERE application_id=?',id).first<Handover>();}
async function participants(env:Env,id:string){
 return (await statement(env.DB,'SELECT applicant_ordinal,email_hash FROM rental_tenancy_handover_people WHERE handover_id=? ORDER BY applicant_ordinal',id).all<Person>()).results;
}
async function matchingVerifiedMembers(env:Env,h:Handover){
 const people=await participants(env,h.id);
 const members=(await statement(env.DB,"SELECT u.email FROM tenancy_memberships m JOIN users u ON u.id=m.user_id WHERE m.tenancy_id=? AND m.ends_at IS NULL AND u.active=1 AND u.verified_at IS NOT NULL",h.tenancy_id).all<{email:string}>()).results;
 const expected=new Set(people.map(p=>p.email_hash));
 const actual=await Promise.all(members.map(p=>hashEmail(env,p.email)));
 return people.length===h.applicant_count&&members.length===people.length&&new Set(actual).size===expected.size&&actual.every(x=>expected.has(x));
}
async function execution(env:Env,h:Handover){
 return statement(env.DB,"SELECT e.case_id,e.executed_document_id,c.data_envelope,d.object_key,d.sha256 AS executed_sha,e.source_sha256 FROM wa_agreement_envelopes e JOIN wa_residential_form_cases c ON c.id=e.case_id JOIN documents d ON d.id=e.executed_document_id WHERE e.tenancy_id=? AND e.property_id=? AND e.status='executed' AND c.form_code='WA_FORM_1AA' AND c.tenancy_id=e.tenancy_id AND d.status='issued' AND d.tenancy_id=e.tenancy_id AND d.property_id=e.property_id AND d.content_type='application/pdf' ORDER BY e.executed_at DESC LIMIT 1",
 h.tenancy_id,h.property_id).first<{case_id:string;executed_document_id:string;data_envelope:string;object_key:string;executed_sha:string;source_sha256:string}>();
}
export async function rentalTenancyHandoverStatus(env:Env,user:Principal,appId:string){
 staff(user);
 if(env.RENTAL_TENANCY_HANDOVER_ENABLED!=='true')return {exists:false,configured:false};
 const h=await state(env,appId);
 if(!h)return {exists:false,configured:true};
 const tenancy=await statement(env.DB,'SELECT status,starts_at,ends_at FROM tenancies WHERE id=?',h.tenancy_id).first<{status:string;starts_at:string;ends_at:string|null}>();
 const verified=await matchingVerifiedMembers(env,h);
 const signed=Boolean(await execution(env,h));
 return {exists:true,id:h.id,tenancyId:h.tenancy_id,status:h.status,tenancyStatus:tenancy?.status??'unknown',startsAt:tenancy?.starts_at,endsAt:tenancy?.ends_at,
  invitedCount:h.applicant_count,allParticipantsVerified:verified,executedAgreementRecorded:signed,
  canActivate:h.status==='awaiting_agreement'&&tenancy?.status==='pending'&&verified&&signed,
  note:'Pending tenancy preparation is not a tenancy offer or an executed agreement.'};
}
export async function prepareRentalTenancyHandover(env:Env,user:Principal,appId:string,input:unknown){
 staff(user);
 enabled(env);
 await requireReleaseApproval(env,'rental_handover');
 await requireReleaseApproval(env,'rental');
 assert(env.DATA_ENCRYPTION_KEY,503,'HANDOVER_ENCRYPTION_UNAVAILABLE','Private tenant preparation is unavailable.');
 const d=tenancyHandoverInput.parse(input);
 const prior=await state(env,appId);
 if(prior){
  const key=await statement(env.DB,'SELECT request_key FROM rental_tenancy_handovers WHERE id=?',prior.id).first<{request_key:string}>();
  assert(key?.request_key===d.requestKey,409,'HANDOVER_EXISTS','An existing handover must be reviewed before another instruction.');
  return {id:prior.id,tenancyId:prior.tenancy_id,status:prior.status,replayed:true};
 }
 let times:{startsAt:string;endsAt:string|null};
 try{times=preparedTenancyDates(d.startsOn,d.endsOn);}catch{assert(false,422,'HANDOVER_DATES','Check the proposed Perth tenancy dates.');}
 const app=await statement(env.DB,"SELECT a.id,a.version,a.status,a.reference,a.privacy_hold_until,a.listing_id,l.property_id,l.application_mode,l.rental_approval_state,l.instructed_by_client_id,l.kind,l.status AS listing_status FROM rental_applications a JOIN leasing_listings l ON l.id=a.listing_id WHERE a.id=?",appId).first<Application>();
 assert(app&&app.version===d.applicationVersion&&app.status==='decision_recorded',409,'HANDOVER_APPLICATION_CHANGED','A current completed rental application is required.');
 assert(!app.privacy_hold_until||app.privacy_hold_until<=now(),409,'HANDOVER_PRIVACY_HOLD','A privacy/legal hold prevents onboarding.');
 assert(app.kind==='residential'&&app.application_mode==='proinspect'&&app.rental_approval_state==='approved'&&['published','leased'].includes(app.listing_status),409,'HANDOVER_LEASING_AUTHORITY','This residential listing is not authorised for intake.');
 const authority=await statement(env.DB,'SELECT id FROM property_management_relationships WHERE property_id=? AND manager_client_id=? AND ends_at IS NULL',app.property_id,app.instructed_by_client_id).first();
 assert(authority,403,'HANDOVER_MANAGER_CHANGED','Current management authority must be verified.');
 const outcome=await statement(env.DB,"SELECT id FROM rental_application_outcomes WHERE application_id=? AND outcome='successful'",appId).first<{id:string}>();
 assert(outcome,409,'HANDOVER_DECISION_REQUIRED','Only a recorded successful lessor decision may begin a handover.');
 const receipt=await statement(env.DB,"SELECT id FROM rental_application_handoffs WHERE application_id=? AND status='delivered'",appId).first();
 assert(receipt,409,'HANDOVER_DELIVERY_REQUIRED','A signed provider acceptance receipt is required.');
 const erasure=await statement(env.DB,"SELECT id FROM rental_application_privacy_requests WHERE application_id=? AND kind='erasure' AND status IN('requested','in_review')",appId).first();
 assert(!erasure,409,'HANDOVER_ERASURE_REVIEW','Resolve the applicant privacy request first.');
 const submission=await statement(env.DB,'SELECT id,snapshot_envelope FROM rental_application_submissions WHERE application_id=? ORDER BY version DESC LIMIT 1',appId).first<{id:string;snapshot_envelope:string}>();
 assert(submission,409,'HANDOVER_SUBMISSION_REQUIRED','The immutable final household submission is required.');
 const snap=await unseal<Snapshot>(env.DATA_ENCRYPTION_KEY,'rental-submission:'+submission.id,submission.snapshot_envelope);
 const source=(await statement(env.DB,"SELECT ordinal,email_hash,state FROM rental_applicants WHERE application_id=? AND state!='removed' ORDER BY ordinal",appId).all<{ordinal:number;email_hash:string;state:string}>()).results;
 assert(Array.isArray(snap.applicants)&&source.length>=1&&source.length<=10&&source.length===snap.applicants.length&&source.every(p=>p.state==='complete'),409,'HANDOVER_APPLICANTS_INCOMPLETE','Every adult must have submitted a completed application and declaration.');
 const emails:string[]=[],unique=new Set<string>();
 for(const person of source){
  const snapshot=snap.applicants.find(p=>p.ordinal===person.ordinal);
  const address=String(snapshot?.answers?.identity?.email??'').trim().toLowerCase();
  assert(address.length<=254&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address),422,'HANDOVER_EMAIL_REQUIRED','Each adult must have a valid invitation address.');
  const hashed=await hashEmail(env,address);
  assert(person.email_hash===hashed&&!unique.has(hashed),409,'HANDOVER_APPLICANT_MISMATCH','Invitations must match the immutable applicant declarations.');
  unique.add(hashed);emails.push(address);
 }
 const overlap=await statement(env.DB,"SELECT id FROM tenancies WHERE property_id=? AND status IN('pending','active') AND (ends_at IS NULL OR ends_at>?) AND (? IS NULL OR starts_at<?) LIMIT 1",app.property_id,times.startsAt,times.endsAt,times.endsAt).first();
 assert(!overlap,409,'HANDOVER_TENANCY_OVERLAP','A pending or active tenancy overlaps the proposed dates.');
 const stamp=now(),tid=uid('tnc'),hid=uid('rth');
 const rows:ReturnType<typeof statement>[]=[
  statement(env.DB,"INSERT INTO tenancies(id,property_id,status,starts_at,ends_at,reference) VALUES(?,?,'pending',?,?,?)",tid,app.property_id,times.startsAt,times.endsAt,app.reference),
  statement(env.DB,'INSERT INTO rental_tenancy_handovers(id,application_id,outcome_id,submission_id,listing_id,property_id,tenancy_id,request_key,authority_reference,terms_envelope,applicant_count,initiated_by,initiated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
   hid,appId,outcome.id,submission.id,app.listing_id,app.property_id,tid,d.requestKey,d.writtenOfferReference,
   await seal(env.DATA_ENCRYPTION_KEY,'rental-tenancy-handover:'+hid,{startsOn:d.startsOn,endsOn:d.endsOn??null,approvedBy:user.id}),emails.length,user.id,stamp)
 ];
 for(let i=0;i<emails.length;i++){
  const token=randomToken(),hash=await digest(token);
  rows.push(statement(env.DB,'INSERT INTO rental_tenancy_handover_people(id,handover_id,applicant_ordinal,email_hash,invitation_token_hash,invited_at) VALUES(?,?,?,?,?,?)',
   uid('rhp'),hid,source[i].ordinal,await hashEmail(env,emails[i]),hash,stamp));
  rows.push(statement(env.DB,"INSERT INTO invitations(token_hash,email,tenancy_id,role,expires_at,created_by,created_at) VALUES(?,?,?,'tenant',?,?,?)",
   hash,emails[i],tid,new Date(Date.now()+7*86400000).toISOString(),user.id,stamp));
  rows.push(await mailEvent(env,'rental.tenancy.pending_invitation',{
   to:emails[i],subject:'ProInspect: review your proposed tenancy',
   heading:'Verify your proposed tenancy access',
   body:'The responsible lessor has asked ProInspect to prepare a tenancy record. Sign in with this address to review authorised documents. This is not a tenancy offer or executed agreement.',
   href:env.APP_ORIGIN+'/invitations/accept?token='+token,sensitive:true},'rth_invite_'+hid+'_'+(i+1)));
 }
 rows.push(statement(env.DB,'INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)',
 uid('aud'),user.id,'rental.handover.prepared','rental_tenancy_handover',hid,JSON.stringify({tenancyId:tid,applicantCount:emails.length}),stamp));
 await env.DB.batch(rows);
 return {id:hid,tenancyId:tid,status:'awaiting_agreement',invitationsQueued:emails.length,replayed:false,legallyExecuted:false};
}

export async function activateRentalTenancyHandover(env:Env,user:Principal,appId:string,input:unknown){
 staff(user);
 enabled(env);
 await requireReleaseApproval(env,'rental_handover');
 await requireReleaseApproval(env,'agreement_signing');
 const d=tenancyActivationInput.parse(input),h=await state(env,appId);
 assert(h&&h.status==='awaiting_agreement',409,'HANDOVER_NOT_PENDING','Only a pending handover may be activated.');
 const t=await statement(env.DB,'SELECT status,starts_at,ends_at FROM tenancies WHERE id=?',h.tenancy_id)
 .first<{status:string;starts_at:string;ends_at:string|null}>();
 assert(t?.status==='pending',409,'HANDOVER_TENANCY_NOT_PENDING','An unexecuted tenancy must remain pending.');
 const app=await statement(env.DB,'SELECT privacy_hold_until FROM rental_applications WHERE id=?',appId)
 .first<{privacy_hold_until:string|null}>();
 assert(app&&(!app.privacy_hold_until||app.privacy_hold_until<=now()),409,'HANDOVER_PRIVACY_HOLD','Resolve any active privacy/legal hold.');
 const erasure=await statement(env.DB,"SELECT id FROM rental_application_privacy_requests WHERE application_id=? AND kind='erasure' AND status IN('requested','in_review')",appId).first();
 assert(!erasure,409,'HANDOVER_ERASURE_REVIEW','An unresolved erasure request blocks activation.');
 assert(await matchingVerifiedMembers(env,h),409,'HANDOVER_PARTICIPANTS_UNVERIFIED',
 'Every original adult applicant must independently verify their tenant invitation.');
 const e=await execution(env,h);
 assert(e&&e.executed_sha!==e.source_sha256&&await env.DOCUMENTS.head(e.object_key),409,'HANDOVER_EXECUTION_REQUIRED',
 'A distinct, independently verified executed official Form 1AA PDF must be issued.');
 const terms=await unseal<{startsOn:string;endsOn:string|null}>(env.DATA_ENCRYPTION_KEY,
  'rental-tenancy-handover:'+h.id,h.terms_envelope);
 const form=await unseal<{answers:Record<string,unknown>}>(env.DATA_ENCRYPTION_KEY,
  'wa-form:'+e.case_id,e.data_envelope);
 assert(agreementMatchesPreparedTerms(form.answers,terms.startsOn,terms.endsOn),409,
 'HANDOVER_AGREEMENT_TERMS_MISMATCH','The executed Form 1AA dates differ from the instructed tenancy terms.');
 assert(validateForm1AA(form.answers,h.applicant_count).length===0,409,
 'HANDOVER_AGREEMENT_FIELDS','The current Form 1AA has incomplete mandatory agreement fields.');
 const stamp=now();
 await env.DB.batch([
  statement(env.DB,"UPDATE tenancies SET status='active' WHERE id=? AND status='pending'",h.tenancy_id),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  statement(env.DB,"UPDATE rental_tenancy_handovers SET status='activated',activated_by=?,activated_at=?,activation_reference=? WHERE id=? AND status='awaiting_agreement'",
   user.id,stamp,d.activationReference,h.id),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  statement(env.DB,'DELETE FROM mutation_guards'),
  statement(env.DB,'INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)',
   uid('aud'),user.id,'rental.handover.activated','rental_tenancy_handover',h.id,
   JSON.stringify({tenancyId:h.tenancy_id,agreementCaseId:e.case_id,executedDocumentId:e.executed_document_id}),stamp)
 ]);
 return {id:h.id,tenancyId:h.tenancy_id,status:'activated',agreementCaseId:e.case_id};
}
export async function voidRentalTenancyHandover(env:Env,user:Principal,appId:string,input:unknown){
 staff(user);
 enabled(env);
 const d=tenancyVoidInput.parse(input),h=await state(env,appId);
 assert(h&&h.status==='awaiting_agreement',409,'HANDOVER_NOT_PENDING','Only an unexecuted pending handover can be voided.');
 const agreement=await statement(env.DB,"SELECT id FROM wa_agreement_envelopes WHERE tenancy_id=? AND status!='void'",h.tenancy_id).first();
 assert(!agreement,409,'HANDOVER_AGREEMENT_EXISTS','Void the associated Form 1AA signing case through its own controlled workflow first.');
 const stamp=now();
 await env.DB.batch([
  statement(env.DB,'UPDATE invitations SET expires_at=? WHERE tenancy_id=? AND consumed_at IS NULL',stamp,h.tenancy_id),
  statement(env.DB,'UPDATE tenancy_memberships SET ends_at=? WHERE tenancy_id=? AND ends_at IS NULL',stamp,h.tenancy_id),
  statement(env.DB,"UPDATE tenancies SET status='ended' WHERE id=? AND status='pending'",h.tenancy_id),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  statement(env.DB,"UPDATE rental_tenancy_handovers SET status='void',voided_at=?,voided_by=?,void_reference=? WHERE id=? AND status='awaiting_agreement'",
   stamp,user.id,d.reasonReference,h.id),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  statement(env.DB,'DELETE FROM mutation_guards'),
  statement(env.DB,'INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)',
   uid('aud'),user.id,'rental.handover.voided','rental_tenancy_handover',h.id,
   JSON.stringify({tenancyId:h.tenancy_id,reference:d.reasonReference}),stamp),
 ]);
 return {id:h.id,status:'void',tenancyId:h.tenancy_id};
}
