import { assert, statement, uid, now, type Env } from '../../../../packages/database/types';
import { seal, unseal } from '../../../../packages/auth/crypto';
import { mailEvent } from '../../../../packages/notifications/server';
import { operationsWrite } from '../../../../packages/authorization/server';
import { rentalOutcomeInput } from '../../../../packages/marketing/rental-governance';
import type { Principal } from '../../../../packages/domain/index';
import type { Form18Answers } from '../../../../packages/marketing/form18';

/** Records the actual agency/landlord decision; ProInspect does not score applicants. */
export async function recordRentalOutcome(env:Env,user:Principal,id:string,input:unknown){
 operationsWrite(user);
 assert(user.staffRole==='administrator'||user.staffRole==='operations_manager',403,'OUTCOME_STAFF_REQUIRED','Restricted Staff action.');
 const d=rentalOutcomeInput.parse(input);
 const app=await statement(env.DB,'SELECT id,version,status,reference,privacy_hold_until FROM rental_applications WHERE id=?',id)
  .first<{id:string;version:number;status:string;reference:string;privacy_hold_until:string|null}>();
 assert(app&&app.version===d.version,409,'OUTCOME_STALE','The application changed. Reload before recording the decision.');
 assert(app.status==='forwarded',409,'NOT_FORWARDED','The application must have been forwarded and acknowledged before recording an outcome.');
 assert(!app.privacy_hold_until||app.privacy_hold_until<=now(),409,'PRIVACY_HOLD','Review the active privacy hold.');
 const sent=await statement(env.DB,"SELECT id FROM rental_application_handoffs WHERE application_id=? AND status='delivered'",id).first();
 assert(sent,409,'DELIVERY_REQUIRED','A provider acceptance receipt is required.');
 const prior=await statement(env.DB,'SELECT id FROM rental_application_outcomes WHERE application_id=?',id).first();
 assert(!prior,409,'OUTCOME_RECORDED','An agency decision has already been recorded.');
 const people=(await statement(env.DB,"SELECT id,answers_envelope FROM rental_applicants WHERE application_id=? AND state!='removed'",id)
  .all<{id:string;answers_envelope:string}>()).results;
 const outId=uid('ro'),t=now(),messages=[];
 for(const person of people){
  const answers=await unseal<Form18Answers>(env.DATA_ENCRYPTION_KEY,'rental-applicant:'+person.id,person.answers_envelope);
  const email=answers.identity?.email;
  if(email)messages.push(await mailEvent(env,'rental.application.outcome',{to:email,
   subject:'Rental application update — '+app.reference,
   heading:'Update on your rental application',body:d.outcome==='successful'?
    'The responsible leasing representative has informed ProInspect that your application was successful. Contact that representative for the next steps. This message is not a tenancy offer or agreement.':
    'The responsible leasing representative has informed ProInspect that your application was unsuccessful. ProInspect does not assess or rank applicants.',
   facts:{Reference:app.reference},sensitive:true}));
 }
 await env.DB.batch([
  statement(env.DB,'INSERT INTO rental_application_outcomes(id,application_id,outcome,authority_reference,details_envelope,recorded_by,recorded_at,applicant_notification_at) VALUES(?,?,?,?,?,?,?,?)',
   outId,id,d.outcome,d.authorityReference,
   await seal(env.DATA_ENCRYPTION_KEY,'rental-outcome:'+outId,{note:d.note,recordedBy:user.id,decisionSource:d.authorityReference}),
   user.id,t,messages.length?t:null),
  statement(env.DB,"UPDATE rental_applications SET status='decision_recorded',decision_recorded_at=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND status='forwarded'",
   t,t,id,d.version),
  ...messages,
 ]);
 return {recorded:true,notificationsQueued:messages.length};
}
