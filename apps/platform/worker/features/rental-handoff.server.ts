import { assert,now,statement,uid,type Env } from '../../../../packages/database/types';
import { digest,seal } from '../../../../packages/auth/crypto';

type Subject={id:string;reference:string;application_recipient_email:string|null;
 display_address:string;title:string;agent_name:string;instructed_by_client_id:string};
/**
 * This prepares a durable, recipient-bound manifest. No email is sent.
 * The future Apps Script adapter must authenticate, retrieve the immutable
 * submission through a scoped transport, compose an email, and return a
 * validated delivery receipt before "forwarded" can be set.
 */
export async function stageRentalAppsScriptHandoff(env:Env,app:Subject){
 assert(app.application_recipient_email,409,'AGENCY_EMAIL_NOT_CONFIGURED',
  'Configure an authorised agency or landlord email before staging an application.');
 const snapshot=await statement(env.DB,"SELECT id,version FROM rental_application_submissions WHERE application_id=? ORDER BY version DESC LIMIT 1",
  app.id).first<{id:string;version:number}>();
 assert(snapshot,409,'SUBMISSION_REQUIRED','A completed application record is required.');
 const pending=await statement(env.DB,"SELECT COUNT(*) AS n FROM rental_application_documents WHERE application_id=? AND review_status='quarantined'",
  app.id).first<{n:number}>();
 assert((pending?.n??0)===0,409,'DOCUMENTS_UNREVIEWED',
  'Review or reject all quarantined documents before staging agency delivery.');
 const id=uid('rhf'),recipient=app.application_recipient_email.trim().toLowerCase(),stamp=now();
 const idempotencyKey='rental-email-v1:'+app.id+':'+snapshot.version;
 return {
  stage:statement(env.DB,"INSERT INTO rental_application_handoffs(id,application_id,submission_id,idempotency_key,recipient_hash,recipient_envelope,format_version,staged_at) VALUES(?,?,?,?,?,?,?,?)",
   id,app.id,snapshot.id,idempotencyKey,
   await digest(env.DATA_ENCRYPTION_KEY+':handoff-recipient:'+recipient),
   await seal(env.DATA_ENCRYPTION_KEY,'rental-handoff:'+id,
    {recipient,reference:app.reference,property:app.display_address,
     agentName:app.agent_name,instructingClientId:app.instructed_by_client_id,
     submissionVersion:snapshot.version,formatVersion:'proinspect-rental-email-v1'}),
   'proinspect-rental-email-v1',stamp),
  handoffId:id,submissionVersion:snapshot.version,
 };
}
