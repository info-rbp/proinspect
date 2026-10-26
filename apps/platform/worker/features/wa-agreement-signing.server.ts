import { requireReleaseApproval } from './release-governance.server';
import {z} from 'zod';
import {assert,now,statement,uid,type Env} from '../../../../packages/database/types';
import type {Principal,Workspace} from '../../../../packages/domain/index';
import {seal,unseal} from '../../../../packages/auth/crypto';
import {recordId,reference,version,guard,clearGuard,activity} from '../../../../packages/operations/core';
import {operationsWrite} from '../../../../packages/authorization/server';
import {mailEvent} from '../../../../packages/notifications/server';
import {validateForm1AA} from '../../../../packages/wa-residential/form1aa';
import {waResidentialCase} from './wa-residential.server';
type Envelope={id:string;case_id:string;tenancy_id:string;property_id:string;source_document_id:string;source_sha256:string;template_version:string;status:string;version:number;executed_document_id:string|null};
type Signer={user_id:string;role:'tenant'|'landlord';status:string;consented_at:string|null;display_name:string};
const enabled=async(env:Env)=>{assert(env.WA_AGREEMENT_ESIGN_ENABLED==='true',503,'WA_ESIGN_DISABLED','Official agreement signing has not passed its legal and operational release gates.');await requireReleaseApproval(env,'agreement_signing');};
async function getCase(env:Env,user:Principal,w:Workspace,id:string){
 const {c,t}=await waResidentialCase(env,user,w,id);
 assert(c.form_code==='WA_FORM_1AA',422,'AGREEMENT_ONLY','Only Form 1AA can use agreement signing.');
 return {c,t};
}
async function getEnvelope(env:Env,id:string){
 return statement(env.DB,'SELECT * FROM wa_agreement_envelopes WHERE case_id=?',id).first<Envelope>();
}
async function getSigners(env:Env,eid:string){
 return (await statement(env.DB,`SELECT s.user_id,s.role,s.status,s.consented_at,u.display_name
 FROM wa_agreement_signers s JOIN users u ON u.id=s.user_id WHERE s.envelope_id=? ORDER BY s.role DESC,s.user_id`,eid).all<Signer>()).results;
}
export async function signingStatus(env:Env,user:Principal,w:Workspace,id:string){
 const {c,t}=await getCase(env,user,w,id);
 const e=await getEnvelope(env,id);
 if(!e)return {exists:false,enabled:env.WA_AGREEMENT_ESIGN_ENABLED==='true',caseStatus:c.status,requiredOfficialSource:true};
 const people=await getSigners(env,e.id);
 if(w.kind==='tenant')assert(people.some(p=>p.user_id===user.id&&p.role==='tenant'),403,'SIGNER_ONLY','This agreement is not assigned to your verified tenancy identity.');
 return {exists:true,enabled:env.WA_AGREEMENT_ESIGN_ENABLED==='true',status:e.status,version:e.version,caseId:id,tenancyId:t.id,
  sourceDocumentId:e.source_document_id,sourceSha256:e.source_sha256,executedDocumentId:e.executed_document_id,
  templateVersion:e.template_version,signers:people,me:people.find(p=>p.user_id===user.id)??null,
  signingIntentOnly:true,legalExecutionConfirmed:false};
}
export async function prepareAgreement(env:Env,user:Principal,w:Workspace,id:string,input:unknown){
 await enabled(env);
 assert(['landlord','property-manager','staff'].includes(w.kind),403,'MANAGER_ONLY','Only an authorised manager or Staff may initiate signing.');
 if(w.kind==='staff')operationsWrite(user);
 const {c,t}=await getCase(env,user,w,id);
 assert(c.status==='document_issued'&&c.issued_document_id&&c.template_version,409,'OFFICIAL_PDF_REQUIRED','Staff must approve and issue the current official tenancy PDF before inviting signers.');
 assert(!await getEnvelope(env,id),409,'ENVELOPE_ALREADY_EXISTS','Prepare a new reviewed case for replacement agreements.');
 const q=z.object({lessorUserId:recordId,tenantUserIds:z.array(recordId).min(1).max(15),reviewReference:reference}).parse(input);
 const ids=new Set(q.tenantUserIds);
 assert(ids.size===q.tenantUserIds.length&&!ids.has(q.lessorUserId),422,'DUPLICATE_SIGNER','Every participant must have their own verified identity.');
 const tenants=(await statement(env.DB,`SELECT m.user_id,u.email FROM tenancy_memberships m JOIN users u ON u.id=m.user_id
 WHERE m.tenancy_id=? AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?) AND u.active=1 AND u.verified_at IS NOT NULL`,t.id,now(),now()).all<{user_id:string;email:string}>()).results;
 assert(tenants.length===ids.size&&tenants.every(p=>ids.has(p.user_id)),422,'ALL_TENANTS_REQUIRED','All active verified tenancy members must be signers.');
 const lessor=await statement(env.DB,`SELECT u.id,u.email,pm.manager_client_id,e.workspace_kind FROM property_management_relationships pm
 JOIN clients c ON c.id=pm.manager_client_id AND c.status='active'
 JOIN client_memberships m ON m.client_id=c.id AND m.active=1 AND m.role IN('owner','admin')
 JOIN users u ON u.id=m.user_id AND u.active=1 AND u.verified_at IS NOT NULL
 JOIN client_entitlements e ON e.client_id=pm.manager_client_id AND e.active=1 AND e.workspace_kind IN('landlord','property-manager')
 WHERE pm.property_id=? AND pm.ends_at IS NULL AND u.id=? LIMIT 1`,t.property_id,q.lessorUserId)
  .first<{id:string;email:string;manager_client_id:string;workspace_kind:string}>();
 assert(lessor,403,'LESSOR_AUTHORITY_REQUIRED','Select a currently verified authorised lessor or manager signatory.');
 if(w.kind!=='staff')assert(w.scopeId===lessor.manager_client_id&&user.id===lessor.id,403,'LESSOR_AUTHORITY_REQUIRED','You may invite only on behalf of your own managed property.');
 const template=await statement(env.DB,`SELECT object_key FROM wa_residential_form_templates WHERE form_code='WA_FORM_1AA' AND version=? AND release_approved_at IS NOT NULL AND retired_at IS NULL`,c.template_version).first<{object_key:string}>();
 assert(template?.object_key&&await env.DOCUMENTS.head(template.object_key),409,'OFFICIAL_MASTER_REQUIRED','The independent official-master review and verified R2 bytes are required.');
 const doc=await statement(env.DB,`SELECT d.id,d.sha256,d.object_key FROM documents d JOIN document_grants g ON g.document_id=d.id
 WHERE d.id=? AND d.tenancy_id=? AND d.property_id=? AND d.status='issued' AND d.category='tenancy_document'
 AND d.content_type='application/pdf' AND g.recipient_kind='tenancy' AND g.recipient_id=?`,c.issued_document_id,t.id,t.property_id,t.id)
  .first<{id:string;sha256:string;object_key:string}>();
 assert(doc&&await env.DOCUMENTS.head(doc.object_key),409,'OFFICIAL_DOCUMENT_NOT_ISSUED','The approved, granted tenancy PDF must be present in private R2.');
 const intake=await unseal<{answers:Record<string,unknown>}>(env.DATA_ENCRYPTION_KEY,`wa-form:${id}`,c.data_envelope);
 const missing=validateForm1AA(intake.answers,tenants.length);
 assert(!missing.length,422,'AGREEMENT_FIELDS_MISSING','Complete the approved Form 1AA data: '+missing.join('; ').slice(0,800));
 const eid=uid('wae'),time=now();
 const participants=[...tenants.map(p=>({id:p.user_id,email:p.email,role:'tenant' as const,
  href:`/w/tenant/${t.id}/tenancies/${t.id}/wa-forms/${id}`})),
 {id:lessor.id,email:lessor.email,role:'landlord' as const,
  href:`/w/${lessor.workspace_kind}/${lessor.manager_client_id}/tenancies/${t.id}/wa-forms/${id}`}];
 await env.DB.batch([
 statement(env.DB,`INSERT INTO wa_agreement_envelopes(id,case_id,tenancy_id,property_id,source_document_id,source_sha256,template_version,prepared_by,prepared_at) VALUES(?,?,?,?,?,?,?,?,?)`,
 eid,id,t.id,t.property_id,doc.id,doc.sha256,c.template_version,user.id,time),
 ...participants.map(p=>statement(env.DB,`INSERT INTO wa_agreement_signers(id,envelope_id,user_id,role,source_sha256) VALUES(?,?,?,?,?)`,
 uid('was'),eid,p.id,p.role,doc.sha256)),
 statement(env.DB,'INSERT INTO wa_agreement_events(id,envelope_id,actor_id,action,reference,created_at) VALUES(?,?,?,?,?,?)',uid('waev'),eid,user.id,'invited',q.reviewReference,time),
 activity(env,user,'wa_agreement.invited','wa_agreement',eid,t.property_id),
 ...await Promise.all(participants.map(p=>mailEvent(env,'wa_agreement.signer_invited',{
 to:p.email,subject:'Review your WA tenancy agreement',heading:'Tenancy agreement ready to review',
 body:'Sign in to your authorised ProInspect workspace and review the exact approved agreement. No agreement is executed until all required signatures and a completed official PDF are verified.',
 href:env.APP_ORIGIN+p.href,sensitive:true},`wa_invite_${eid}_${p.id}`))),
 ]);
 return {id:eid,status:'collecting',invited:participants.length,executed:false};
}
export async function consentAgreement(env:Env,user:Principal,w:Workspace,id:string,input:unknown){
 await enabled(env);
 const {t}=await getCase(env,user,w,id),e=await getEnvelope(env,id);
 assert(e?.status==='collecting',409,'NOT_SIGNABLE','No pending signing invitation exists.');
 const q=z.object({version,sha256:z.string().regex(/^[a-f0-9]{64}$/),typedName:z.string().trim().min(2).max(150),
 consent:z.literal(true),intent:z.literal('I agree to sign this reviewed agreement electronically')}).parse(input);
 assert(q.version===e.version&&q.sha256===e.source_sha256,409,'DOCUMENT_CHANGED','Reload and review the exact approved official PDF.');
 const signer=await statement(env.DB,'SELECT id,role,status FROM wa_agreement_signers WHERE envelope_id=? AND user_id=?',e.id,user.id)
  .first<{id:string;role:string;status:string}>();
 assert(signer?.status==='pending',403,'NOT_A_PENDING_SIGNER','Only your own pending task can be accepted.');
 assert(signer.role==='tenant'?w.kind==='tenant':['landlord','property-manager'].includes(w.kind),403,'WORKSPACE_MISMATCH','Use the assigned signing workspace.');
 const stillAuthorised=signer.role==='tenant'
 ?await statement(env.DB,`SELECT 1 FROM tenancy_memberships WHERE tenancy_id=? AND user_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)`,t.id,user.id,now(),now()).first()
 :await statement(env.DB,`SELECT 1 FROM property_management_relationships pm JOIN client_memberships m ON m.client_id=pm.manager_client_id AND m.active=1 AND m.role IN('owner','admin')
 WHERE pm.property_id=? AND pm.ends_at IS NULL AND m.user_id=?`,t.property_id,user.id).first();
 assert(stillAuthorised,403,'SIGNER_REVOKED','Your signing authority is no longer current.');
 const time=now(),sealed=await seal(env.DATA_ENCRYPTION_KEY,`wa-intent:${signer.id}`,{name:q.typedName,userId:user.id,intent:q.intent,sha256:q.sha256,at:time});
 await env.DB.batch([
 statement(env.DB,"UPDATE wa_agreement_signers SET status='consented',consent_envelope=?,consented_at=? WHERE id=? AND status='pending'",sealed,time,signer.id),guard(env),
 statement(env.DB,"UPDATE wa_agreement_envelopes SET version=version+1 WHERE id=? AND version=? AND status='collecting'",e.id,q.version),guard(env),
 statement(env.DB,'INSERT INTO wa_agreement_events(id,envelope_id,actor_id,action,created_at) VALUES(?,?,?,?,?)',uid('waev'),e.id,user.id,'intent_consented',time),
 activity(env,user,'wa_agreement.intent_consented','wa_agreement',e.id,t.property_id),clearGuard(env),
 ]);
 await statement(env.DB,`UPDATE wa_agreement_envelopes SET status='all_consented',version=version+1 WHERE id=? AND status='collecting'
 AND NOT EXISTS(SELECT 1 FROM wa_agreement_signers WHERE envelope_id=? AND status='pending')`,e.id,e.id).run();
 return {id:e.id,intentRecorded:true,pdfDigitallySigned:false,legallyExecuted:false};
}
export async function finaliseAgreement(env:Env,user:Principal,w:Workspace,id:string,input:unknown){
 await enabled(env);assert(w.kind==='staff',403,'STAFF_REQUIRED','Only Staff can verify executed official PDFs.');operationsWrite(user);
 const {t}=await getCase(env,user,w,id),e=await getEnvelope(env,id);
 assert(e?.status==='all_consented',409,'SIGNATURES_OUTSTANDING','All named signers must record consent first.');
 const q=z.object({version,documentId:recordId,method:z.enum(['wet_ink','stylus','external_provider']),evidenceReference:reference,reviewReference:reference}).parse(input);
 assert(q.version===e.version&&q.documentId!==e.source_document_id,409,'SOURCE_UNCHANGED','Provide a distinct, genuinely signed official PDF.');
 const d=await statement(env.DB,`SELECT d.id,d.sha256,d.object_key FROM documents d JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='tenancy' AND g.recipient_id=?
 WHERE d.id=? AND d.tenancy_id=? AND d.property_id=? AND d.status='issued' AND d.category='tenancy_document' AND d.content_type='application/pdf'`,t.id,q.documentId,t.id,t.property_id)
 .first<{id:string;sha256:string;object_key:string}>();
 assert(d&&d.sha256!==e.source_sha256&&await env.DOCUMENTS.head(d.object_key),422,'SIGNED_PDF_NOT_VERIFIED','A different reviewed and issued signed official PDF is required.');
 const people=await getSigners(env,e.id);
 assert(people.length>=2&&people.every(p=>p.status==='consented'),409,'SIGNING_INCOMPLETE','All required identities must have consented.');
 const manager=await statement(env.DB,`SELECT pm.manager_client_id FROM property_management_relationships pm
 WHERE pm.property_id=? AND pm.ends_at IS NULL`,t.property_id).first<{manager_client_id:string}>();
 assert(manager,403,'LESSOR_AUTHORITY_CHANGED','The property manager changed; re-authorise the signed copy before distribution.');
 for(const p of people){
  const current=p.role==='tenant'
    ?await statement(env.DB,`SELECT 1 FROM tenancy_memberships m JOIN users u ON u.id=m.user_id AND u.active=1 AND u.verified_at IS NOT NULL
     WHERE m.tenancy_id=? AND m.user_id=? AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?)`,t.id,p.user_id,now(),now()).first()
    :await statement(env.DB,`SELECT 1 FROM client_memberships m JOIN users u ON u.id=m.user_id AND u.active=1 AND u.verified_at IS NOT NULL
     WHERE m.client_id=? AND m.user_id=? AND m.active=1 AND m.role IN('owner','admin')`,manager.manager_client_id,p.user_id).first();
  assert(current,403,'SIGNER_ACCESS_REVOKED','A signer lost current authority; do not distribute until reviewed.');
 }
 const time=now(),messages=[];
 for(const p of people){
  const u=await statement(env.DB,'SELECT email FROM users WHERE id=? AND active=1',p.user_id).first<{email:string}>();
  if(!u)continue;
  messages.push(await mailEvent(env,'wa_agreement.executed_copy',{
   to:u.email,subject:'Completed tenancy agreement available',heading:'Executed agreement available',
   body:'The reviewed completed agreement has been issued to your tenancy document record. Sign in to access your granted copy.',
   href:env.APP_ORIGIN+'/workspaces',sensitive:true},`wa_final_${e.id}_${p.user_id}`));
 }
 await env.DB.batch([
 statement(env.DB,"UPDATE wa_agreement_envelopes SET status='executed',executed_document_id=?,executed_at=?,reviewed_by=?,review_reference=?,version=version+1 WHERE id=? AND version=? AND status='all_consented'",q.documentId,time,user.id,q.reviewReference,e.id,q.version),guard(env),
 statement(env.DB,"UPDATE wa_residential_form_cases SET issued_document_id=?,version=version+1,updated_at=? WHERE id=? AND issued_document_id=?",q.documentId,time,id,e.source_document_id),guard(env),
 ...people.map(p=>statement(env.DB,'INSERT INTO wa_residential_form_signatures(id,case_id,actor_id,signer_kind,method,signed_document_id,evidence_reference,verified_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
 uid('wsg'),id,user.id,p.role,q.method,q.documentId,q.evidenceReference,time,time)),
 statement(env.DB,'INSERT INTO wa_agreement_events(id,envelope_id,actor_id,action,reference,created_at) VALUES(?,?,?,?,?,?)',uid('waev'),e.id,user.id,'executed_document_verified',q.reviewReference,time),
 activity(env,user,'wa_agreement.executed','wa_agreement',e.id,t.property_id),
 ...messages,clearGuard(env),
 ]);
 return {id:e.id,status:'executed',executedDocumentId:q.documentId,legalServiceConfirmed:false};
}
export async function voidAgreement(env:Env,user:Principal,w:Workspace,id:string,input:unknown){
 await enabled(env);assert(['landlord','property-manager','staff'].includes(w.kind),403,'MANAGER_REQUIRED','Only a manager or reviewer can void a pending agreement.');
 if(w.kind==='staff')operationsWrite(user);
 const {t}=await getCase(env,user,w,id),e=await getEnvelope(env,id);
 assert(e&&['collecting','all_consented'].includes(e.status),409,'CANNOT_VOID','Only pending agreements can be voided.');
 if(w.kind!=='staff'){
  const allowed=await statement(env.DB,`SELECT 1 FROM property_management_relationships pm
   JOIN client_memberships m ON m.client_id=pm.manager_client_id AND m.active=1 AND m.role IN('owner','admin')
   WHERE pm.property_id=? AND pm.manager_client_id=? AND pm.ends_at IS NULL AND m.user_id=?`,t.property_id,w.scopeId,user.id).first();
  assert(allowed,403,'LESSOR_AUTHORITY_REQUIRED','Only the current authorised lessor/manager can void an agreement.');
 }
 const q=z.object({version,reason:z.string().trim().min(10).max(2000)}).parse(input);
 assert(e.version===q.version,409,'AGREEMENT_CHANGED','Refresh the signing record.');
 await env.DB.batch([
 statement(env.DB,"UPDATE wa_agreement_envelopes SET status='void',voided_at=?,voided_by=?,void_reason=?,version=version+1 WHERE id=? AND version=? AND status IN('collecting','all_consented')",now(),user.id,q.reason,e.id,q.version),guard(env),
 statement(env.DB,'INSERT INTO wa_agreement_events(id,envelope_id,actor_id,action,created_at) VALUES(?,?,?,?,?)',uid('waev'),e.id,user.id,'voided',now()),
 activity(env,user,'wa_agreement.voided','wa_agreement',e.id,t.property_id),clearGuard(env),
 ]);
 return {id:e.id,status:'void'};
}
