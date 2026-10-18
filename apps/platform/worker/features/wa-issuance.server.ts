import { z } from 'zod';
import { assert, now, statement, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { unseal } from '../../../../packages/auth/crypto';
import { reference, version, activity, guard, clearGuard } from '../../../../packages/operations/core';
import { operationsWrite } from '../../../../packages/authorization/server';
import { preIssueDependencies } from '../../../../packages/wa-residential/rules';
import { waResidentialCase } from './wa-residential.server';

const editableRequirements=[
 'verified_prior_form_21','statutory_grounds_review','legal_service_review',
 'verified_rent_ledger','verified_grounds','verified_entry_purpose',
 'service_window_review','official_signature_policy',
] as const;
type Requirement=typeof editableRequirements[number];
export function manualIssueRequirements(code:string):Requirement[]{
  const all=preIssueDependencies(code);
  const required=all.filter((d):d is Requirement=>editableRequirements.includes(d as Requirement));
  if(code==='WA_FORM_1A') required.push('legal_service_review');
  if(code==='WA_FORM_1AA') required.push('official_signature_policy');
  if(code==='WA_FORM_10'||code==='WA_FORM_20'||code==='WA_FORM_22') required.push('statutory_grounds_review');
  return [...new Set(required)];
}
export async function waIssueReadiness(env:Env,c:Record<string,any>){
 const required=manualIssueRequirements(c.form_code);
 const rows=(await statement(env.DB,
  'SELECT requirement FROM wa_residential_form_verifications WHERE case_id=?',c.id).all<{requirement:Requirement}>()).results;
 const checked=new Set(rows.map(r=>r.requirement));
 const missing=required.filter(x=>!checked.has(x));
 const checks:string[]=[];
 if(c.form_code==='WA_FORM_19'){
  if(!c.booking_id||c.notice_invalidated_at||!c.notice_booking_starts_at)
    checks.push('active_booking');
  else {
    const booking=await statement(env.DB,
      "SELECT id FROM bookings WHERE id=? AND property_id=? AND starts_at=? AND status='confirmed'",
      c.booking_id,c.property_id,c.notice_booking_starts_at).first();
    if(!booking) checks.push('active_booking');
  }
 }
 if(c.form_code==='WA_FORM_1A'){
  const envelope=await unseal<{answers?:Record<string,string>}>(env.DATA_ENCRYPTION_KEY,
    `wa-form:${c.id}`,c.data_envelope);
  const ref=envelope.answers?.breachFormReference??'';
  const prior=await statement(env.DB,`SELECT p.id FROM wa_residential_form_cases p
     JOIN wa_residential_form_delivery d ON d.case_id=p.id AND d.outcome='delivered'
     WHERE p.id=? AND p.tenancy_id=? AND p.property_id=? AND p.form_code='WA_FORM_21'
       AND p.issued_document_id IS NOT NULL AND p.status IN('document_issued','service_evidence_recorded','completed')
     LIMIT 1`,ref,c.tenancy_id,c.property_id).first();
  if(!prior) checks.push('linked_form_21_with_delivery_evidence');
 }
 return {ready:missing.length===0&&checks.length===0,missing:[...missing,...checks],
   legallyCertified:false,statutoryEffectEstablished:false};
}
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
