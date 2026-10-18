import { z } from 'zod';
import { assert, now, statement, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { reference, version, activity, guard, clearGuard } from '../../../../packages/operations/core';
import { operationsWrite } from '../../../../packages/authorization/server';
import { waResidentialCase } from './wa-residential.server';

import { editableRequirements, manualIssueRequirements } from './wa-review-gates.server';
export { waIssueReadiness, manualIssueRequirements } from './wa-review-gates.server';
/** Staff must identify specific external evidence for each high-risk issue gate. */
export async function waVerifyRequirement(env:Env,user:Principal,w:Workspace,id:string,input:unknown){
 assert(w.kind==='staff',403,'STAFF_REVIEW_REQUIRED','Only authorised Staff may verify statutory prerequisites.');
 operationsWrite(user);
 const {c,t}=await waResidentialCase(env,user,w,id);
 const q=z.object({requirement:z.enum(editableRequirements),evidenceReference:reference}).parse(input);
 assert(manualIssueRequirements(c.form_code).includes(q.requirement),422,'REQUIREMENT_NOT_APPLICABLE',
   'This requirement does not apply to the selected form.');
 const rid=uid('wvr');
 await env.DB.batch([
  statement(env.DB,'INSERT INTO wa_residential_form_verifications(id,case_id,verified_by,requirement,evidence_reference,created_at) VALUES(?,?,?,?,?,?)',
   rid,id,user.id,q.requirement,q.evidenceReference,now()),
  statement(env.DB,'INSERT INTO wa_residential_form_events(id,case_id,actor_id,action,reference,created_at) VALUES(?,?,?,?,?,?)',
   uid('wfe'),id,user.id,'prerequisite_reviewed',q.evidenceReference,now()),
  activity(env,user,'wa_form.prerequisite_reviewed','wa_form',id,t.property_id,null,{requirement:q.requirement}),
 ]);
 return {id,requirement:q.requirement,reviewed:true,legalServiceConfirmed:false};
}
export async function waCompleteAdministrativeCase(env:Env,user:Principal,w:Workspace,id:string,input:unknown){
 assert(w.kind==='staff',403,'STAFF_REVIEW_REQUIRED','Only authorised Staff can complete a statutory case.');
 operationsWrite(user);
 const {c,t}=await waResidentialCase(env,user,w,id);
 const q=z.object({version,completionReference:reference}).parse(input);
 assert(c.version===q.version,409,'WA_FORM_CHANGED','The case changed since it was loaded.');
 assert(['document_issued','service_evidence_recorded','external_confirmed'].includes(c.status),
   409,'FORM_NOT_ISSUED','The official document must be issued before administrative finalisation.');
 assert(c.issued_document_id,409,'OFFICIAL_DOCUMENT_REQUIRED','A verified issued PDF is required.');
 if(c.form_code==='WA_FORM_19') assert(!c.notice_invalidated_at,409,'ENTRY_NOTICE_STALE',
   'A changed booking requires a replacement notice and revised evidence.');
 if(['WA_FORM_25','WA_FORM_26'].includes(c.form_code))
   assert(c.decision_status,409,'DECISION_REQUIRED','Record and notify the landlord response before closing this request.');
 if(c.form_stage==='bond')
   assert(['confirmed','determined','finalised'].includes(c.external_status??''),409,
     'EXTERNAL_CONFIRMATION_REQUIRED','Record a real external authority confirmation before closing a bond case.');
 if(c.form_code==='WA_FORM_1AA'){
  const signatures=(await statement(env.DB,
   "SELECT DISTINCT signer_kind FROM wa_residential_form_signatures WHERE case_id=?",id).all<{signer_kind:string}>()).results;
  const kinds=new Set(signatures.map(s=>s.signer_kind));
  assert(kinds.has('tenant')&&kinds.has('landlord'),409,'SIGNATURE_EVIDENCE_REQUIRED',
   'Verify signed official document evidence for landlord and tenant before administrative closure.');
 }
 const delivery=(await statement(env.DB,
   "SELECT id FROM wa_residential_form_delivery WHERE case_id=? AND outcome='delivered' LIMIT 1",id).first());
 assert(delivery||c.form_stage==='bond',409,'DELIVERY_EVIDENCE_REQUIRED',
   'Record delivery evidence for the issued document before closing the workflow.');
 await env.DB.batch([
  statement(env.DB,"UPDATE wa_residential_form_cases SET status='completed',completed_at=?,completion_reference=?,updated_at=?,version=version+1 WHERE id=? AND version=?",
   now(),q.completionReference,now(),id,q.version),
  guard(env),
  statement(env.DB,'INSERT INTO wa_residential_form_events(id,case_id,actor_id,action,reference,created_at) VALUES(?,?,?,?,?,?)',
   uid('wfe'),id,user.id,'administratively_completed',q.completionReference,now()),
  activity(env,user,'wa_form.administratively_completed','wa_form',id,t.property_id,null,{formCode:c.form_code}),
  clearGuard(env),
 ]);
 return {id,status:'completed',administrativelyComplete:true,legalValidityCertified:false};
}
