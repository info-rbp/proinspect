import { z } from 'zod';
import { assert, now, statement, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { seal, unseal } from '../../../../packages/auth/crypto';
import { boundedFile, recordId, reference, version, activity, guard, clearGuard } from '../../../../packages/operations/core';
import { operationsWrite } from '../../../../packages/authorization/server';
import { mailEvent } from '../../../../packages/notifications/server';
import { waForm } from '../../../../packages/wa-residential/forms';
import { responseDeadline, WA_ADVISORY_RULE_VERSION } from '../../../../packages/wa-residential/rules';
import { waResidentialCase, waResidentialScope } from './wa-residential.server';

/**
 * Response rights are based on workspace plus original tenancy relationships.
 * None of these operations communicates a confidential Form 2 case.
 */
const iso=z.string().datetime({offset:true}).transform(v=>new Date(v).toISOString());
async function manager(env:Env,user:Principal,w:Workspace,tenancyId:string) {
 assert(['landlord','property-manager','staff'].includes(w.kind),403,'MANAGER_REQUIRED',
   'An authorised residential manager or Staff reviewer is required.');
 const t=await waResidentialScope(env,user,w,tenancyId,w.kind!=='staff');
 if(w.kind==='staff') operationsWrite(user);
 return t;
}
function timeInPast(value:string) {
 assert(new Date(value).getTime()<=Date.now()+60000,422,'FUTURE_EVIDENCE','The evidence timestamp cannot be in the future.');
}
async function log(env:Env,user:Principal,c:{id:string;property_id:string},action:string,ref:string|null=null) {
 return [
  statement(env.DB,'INSERT INTO wa_residential_form_events(id,case_id,actor_id,action,reference,created_at) VALUES(?,?,?,?,?,?)',
     uid('wfe'),c.id,user.id,action,ref,now()),
  activity(env,user,'wa_form.'+action,'wa_form',c.id,c.property_id,null,{action}),
 ];
}
/** Register actual receipt of a pet/minor-modification request; timer remains advisory. */
export async function waConfirmReceipt(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
 const {c}=await waResidentialCase(env,user,w,id);
 await manager(env,user,w,c.tenancy_id);
 const q=z.object({version,receivedAt:iso,evidenceReference:reference}).parse(input);
 assert(['WA_FORM_25','WA_FORM_26'].includes(c.form_code),422,'RECEIPT_RULE_UNAVAILABLE',
  'The 14-day advisory clock is only configured for forms 25 and 26.');
 assert(['submitted','under_review','approved'].includes(c.status),409,'FORM_NOT_SUBMITTED','Submit the request first.');
 assert(c.received_at===null,409,'RECEIPT_ALREADY_RECORDED','Receipt has already been recorded.');
 assert(c.version===q.version,409,'WA_FORM_CHANGED','Refresh the form before recording receipt.');
 timeInPast(q.receivedAt);
 const advisory=responseDeadline(c.form_code,q.receivedAt)!;
 await env.DB.batch([
  statement(env.DB,'UPDATE wa_residential_form_cases SET received_at=?,due_at=?,due_basis=?,deadline_rule_version=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND received_at IS NULL',
     q.receivedAt,advisory.dueAt,advisory.basis,advisory.ruleVersion,now(),id,q.version),
  guard(env),
  ...(await log(env,user,c,'receipt_recorded',q.evidenceReference)),
  clearGuard(env),
 ]);
 return {id,receivedAt:q.receivedAt,...advisory,legalServiceConfirmed:false};
}
export async function waDecision(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
 const {c}=await waResidentialCase(env,user,w,id);
 await manager(env,user,w,c.tenancy_id);
 assert(c.initiator_kind==='tenant'&&['WA_FORM_24','WA_FORM_25','WA_FORM_26','WA_FORM_27'].includes(c.form_code),
   422,'DECISION_UNAVAILABLE','This form does not use the tenant request decision workflow.');
 const q=z.object({version,decision:z.enum(['approved','refused','approved_with_conditions','information_requested']),
   explanation:z.string().trim().min(10).max(4000),authorityReference:reference.optional()}).parse(input);
 assert(['submitted','under_review','approved','document_issued'].includes(c.status),409,'FORM_NOT_SUBMITTED','A submitted request is required.');
 assert(c.version===q.version&&!c.decision_status,409,'WA_FORM_CHANGED','The decision has changed or was already recorded.');
 if(['WA_FORM_25','WA_FORM_26'].includes(c.form_code)) {
   assert(c.received_at,409,'RECEIPT_REQUIRED','First verify the actual date the landlord received this request.');
   if(['refused','approved_with_conditions'].includes(q.decision))
     assert(q.authorityReference,422,'LEGAL_AUTHORITY_REQUIRED',
       'Refusal or conditions require a reviewed statutory basis and any applicable Commissioner authorisation.');
 }
 const decisionId=uid('wdc');
 const encrypted=await seal(env.DATA_ENCRYPTION_KEY,`wa-decision:${decisionId}`,{explanation:q.explanation});
 await env.DB.batch([
  statement(env.DB,'INSERT INTO wa_residential_form_decisions(id,case_id,actor_id,decision,explanation_envelope,authority_reference,created_at) VALUES(?,?,?,?,?,?,?)',
   decisionId,id,user.id,q.decision,encrypted,q.authorityReference??null,now()),
  statement(env.DB,'UPDATE wa_residential_form_cases SET decision_status=?,decision_at=?,version=version+1,updated_at=? WHERE id=? AND version=? AND decision_status IS NULL',
   q.decision,now(),now(),id,q.version),
  guard(env),
  ...(await log(env,user,c,'decision_recorded',q.authorityReference??null)),
  clearGuard(env),
 ]);
 // Inform the actual applicant without including evidence or sensitive text.
 const u=await statement(env.DB,'SELECT email FROM users WHERE id=? AND active=1',c.initiator_id).first<{email:string}>();
 if(u) await mailEvent(env,'wa_form.decision_recorded',{
    to:u.email,subject:'Your tenancy form has been reviewed',heading:'Tenancy form update',
    body:'A response to your residential tenancy form request has been recorded. Sign in to view your authorised tenancy records.',
    href:`${env.APP_ORIGIN}/w/tenant/${c.tenancy_id}/tenancies/${c.tenancy_id}/wa-forms`,
    sensitive:true,
 });
 return {id,decision:q.decision,decisionId,legalDecisionConfirmed:false};
}
export async function waExternalEvent(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
 assert(w.kind==='staff',403,'STAFF_REVIEW_REQUIRED','External authority events require authorised Staff.');
 operationsWrite(user);
 const {c}=await waResidentialCase(env,user,w,id);
 const form=waForm(c.form_code);
 assert(form?.stage==='bond',422,'EXTERNAL_WORKFLOW_UNAVAILABLE','This external record is for bond cases only.');
 const q=z.object({version,action:z.enum(['prepared','submitted','confirmed','rejected','disputed','determined','appealed','finalised']),
    provider:z.enum(['bonds_administration','magistrates_court','other']),
    externalReference:reference,evidenceReference:reference,effectiveAt:iso}).parse(input);
 timeInPast(q.effectiveAt);
 assert(c.version===q.version,409,'WA_FORM_CHANGED','The case changed; refresh before updating the external result.');
 if(q.action!=='prepared') assert(['approved','document_issued','service_evidence_recorded','external_submitted','external_confirmed','disputed'].includes(c.status),
     409,'FORM_NOT_REVIEWED','A reviewed form is required before an external submission or determination can be recorded.');
 if(q.action==='confirmed'||q.action==='determined'||q.action==='finalised')
   assert((c.external_status==='submitted'||c.external_status==='disputed'||c.external_status==='determined') || q.provider==='bonds_administration',
      409,'PRIOR_EVENT_REQUIRED','Verify the corresponding external authority event first.');
 const e=uid('wex');
 await env.DB.batch([
  statement(env.DB,'INSERT INTO wa_residential_form_external_events(id,case_id,actor_id,action,provider,external_reference,evidence_reference,effective_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
     e,id,user.id,q.action,q.provider,q.externalReference,q.evidenceReference,q.effectiveAt,now()),
  statement(env.DB,'UPDATE wa_residential_form_cases SET external_status=?,external_status_at=?,external_reference=?,version=version+1,updated_at=? WHERE id=? AND version=?',
     q.action,q.effectiveAt,q.externalReference,now(),id,q.version),
  guard(env),
  ...(await log(env,user,c,'external_event_recorded',q.evidenceReference)),
  clearGuard(env),
 ]);
 return {id,eventId:e,status:q.action,recordedExternalEvidence:true,
   externallyVerifiedByProInspect:false,governmentTransactionPerformed:false};
}
export async function waSignatureEvidence(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
 const {c,t}=await waResidentialCase(env,user,w,id);
 assert(['landlord','property-manager','staff'].includes(w.kind),403,'SIGNATURE_RECORD_FORBIDDEN','Only authorised managers or reviewers can record signature evidence.');
 await manager(env,user,w,c.tenancy_id);
 const q=z.object({signedDocumentId:recordId,signerKind:z.enum(['tenant','landlord','staff_witness','external']),
    method:z.enum(['wet_ink','stylus','external_provider']),evidenceReference:reference,verifiedAt:iso}).parse(input);
 timeInPast(q.verifiedAt);
 assert(c.issued_document_id===q.signedDocumentId,409,'SIGNED_DOCUMENT_MISMATCH','The signed evidence must match the issued official document.');
 if(['WA_BOND_LODGEMENT','WA_BOND_VARIATION','WA_BOND_RELEASE'].includes(c.form_code))
  assert(q.method==='wet_ink'||q.method==='stylus',422,'BOND_SIGNATURE_METHOD',
     'Manual WA bond forms require a physical pen or stylus signature, not pasted or e-signature software.');
 const e=uid('wsg');
 await env.DB.batch([
  statement(env.DB,'INSERT INTO wa_residential_form_signatures(id,case_id,actor_id,signer_kind,method,signed_document_id,evidence_reference,verified_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
     e,id,user.id,q.signerKind,q.method,q.signedDocumentId,q.evidenceReference,q.verifiedAt,now()),
  ...(await log(env,user,c,'signature_evidence_recorded',q.evidenceReference)),
 ]);
 return {id,signatureEvidenceId:e,signingPerformedInsideProInspect:false};
}
export async function waCaseDetail(env:Env,user:Principal,w:Workspace,id:string) {
 const {c}=await waResidentialCase(env,user,w,id);
 const cases=await statement(env.DB,'SELECT id,actor_id,action,reference,created_at FROM wa_residential_form_events WHERE case_id=? ORDER BY created_at',
   id).all();
 const deliveries=await statement(env.DB,'SELECT id,recipient_kind,delivery_method,delivery_at,outcome,created_at FROM wa_residential_form_delivery WHERE case_id=? ORDER BY created_at',
   id).all();
 const external=await statement(env.DB,'SELECT id,action,provider,external_reference,effective_at FROM wa_residential_form_external_events WHERE case_id=? ORDER BY created_at',
   id).all();
 const decisions=await statement(env.DB,'SELECT id,decision,explanation_envelope,created_at FROM wa_residential_form_decisions WHERE case_id=? ORDER BY created_at',id).all<{
  id:string;decision:string;explanation_envelope:string;created_at:string;
 }>();
 return {id,formCode:c.form_code,status:c.status,decision:c.decision_status,receiptAt:c.received_at,dueAt:c.due_at,
  dueBasis:c.due_basis,ruleVersion:c.deadline_rule_version,legalClockCertified:false,
  legalServiceConfirmed:false,issuedDocumentId:c.issued_document_id,
  events:cases.results,deliveries:deliveries.results,externalEvents:external.results,
  decisions:await Promise.all(decisions.results.map(async d=>({id:d.id,decision:d.decision,
    explanation:(await unseal<{explanation:string}>(env.DATA_ENCRYPTION_KEY,`wa-decision:${d.id}`,d.explanation_envelope)).explanation,
    createdAt:d.created_at,
  })))};
}
export async function waReviewQueue(env:Env,user:Principal,w:Workspace){
 assert(w.kind==='staff',403,'STAFF_REQUIRED','Only Staff can view the residential form review queue.');
 operationsWrite(user);
 const rows=await statement(env.DB,
   `SELECT f.id,f.tenancy_id,f.form_code,f.form_stage,f.status,f.created_at,f.due_at,
      p.address,p.suburb,p.sector
     FROM wa_residential_form_cases f JOIN properties p ON p.id=f.property_id
     WHERE p.sector='residential' AND f.status NOT IN('completed','withdrawn')
     ORDER BY f.created_at DESC LIMIT 100`).all();
 return {forms:rows.results,includesConfidential:false};
}
/** Store bytes, not just a staff-entered hash. Legal approval still requires review. */
export async function waUploadTemplate(env:Env,user:Principal,w:Workspace,form:FormData) {
 assert(w.kind==='staff',403,'STAFF_REVIEW_REQUIRED','Only authorised Staff can upload official template assets.');
 operationsWrite(user);
 const q=z.object({
   formCode:z.string().max(64),
   templateVersion:z.string().trim().min(4).max(80),
   officialSourceUrl:z.string().url(),
   legalReviewReference:reference,
 }).parse({
   formCode:form.get('formCode'),templateVersion:form.get('templateVersion'),
   officialSourceUrl:form.get('officialSourceUrl'),legalReviewReference:form.get('legalReviewReference'),
 });
 assert(waForm(q.formCode),422,'FORM_UNAVAILABLE','Use a registered WA residential form code.');
 const url=new URL(q.officialSourceUrl);
 assert(url.protocol==='https:' && ['www.consumerprotection.wa.gov.au','consumerprotection.wa.gov.au'].includes(url.hostname),
     422,'OFFICIAL_SOURCE_REQUIRED','The official template must come from WA Consumer Protection.');
 const file=await boundedFile(form);
 assert(file.mime==='application/pdf',422,'PDF_REQUIRED','Only an official PDF template is permitted.');
 const path=`wa-residential/master/${q.formCode}/${uid('template')}.pdf`;
 await env.DOCUMENTS.put(path,file.bytes,{httpMetadata:{contentType:'application/pdf'},
    customMetadata:{sha256:file.hash,formCode:q.formCode}});
 try{
   await env.DB.batch([
    statement(env.DB,`INSERT INTO wa_residential_form_templates(
      form_code,version,official_source_url,official_sha256,reviewed_by,legal_review_reference,approved_at,object_key,file_size)
      VALUES(?,?,?,?,?,?,?,?,?)`,q.formCode,q.templateVersion,q.officialSourceUrl,file.hash,
      user.id,q.legalReviewReference,now(),path,file.file.size),
    activity(env,user,'wa_form.official_template_uploaded','wa_template',
      q.formCode,null,null,{templateVersion:q.templateVersion,sha256:file.hash}),
   ]);
 }catch(e){await env.DOCUMENTS.delete(path);throw e;}
 return {formCode:q.formCode,version:q.templateVersion,sha256:file.hash,reviewed: true,
   templateNeedsIndependentLegalSignoff:true};
}
