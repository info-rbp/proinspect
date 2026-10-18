import { z } from 'zod';
import { assert,now,statement,uid,type Env } from '../../../../packages/database/types';
import type { Principal,Workspace } from '../../../../packages/domain/index';
import { seal,unseal } from '../../../../packages/auth/crypto';
import { recordId,version,reference,activity,guard,clearGuard } from '../../../../packages/operations/core';
import { tenancyAccess } from './tenancies.server';
import { waAvailableForms,waForm,OFFICIAL_WA_FORMS_URL } from '../../../../packages/wa-residential/forms';
import { operationsWrite } from '../../../../packages/authorization/server';

async function scope(env:Env,user:Principal,w:Workspace,tenancyId:string,write=false){
  assert(['landlord','property-manager','tenant','staff'].includes(w.kind),403,'RESIDENTIAL_FORMS_ONLY','Residential tenancy forms are only available in residential Landlord, Property Manager, Tenant and Staff workspaces.');
  const t=await tenancyAccess(env,user,w,tenancyId,write && w.kind!=='tenant');
  const p=await statement(env.DB,'SELECT sector FROM properties WHERE id=?',t.property_id).first<{sector:string}>();
  assert(p?.sector==='residential',403,'RESIDENTIAL_FORMS_ONLY','WA residential forms cannot be applied to commercial property.');
  if(w.kind==='landlord'||w.kind==='property-manager'){
    const membership=await statement(env.DB,
      "SELECT 1 AS allowed FROM client_memberships m JOIN clients c ON c.id=m.client_id WHERE m.client_id=? AND m.user_id=? AND m.active=1 AND c.status='active' AND c.client_type IN('landlord','agency')",
      w.scopeId,user.id).first();
    assert(membership,403,'RESIDENTIAL_FORMS_ONLY','Residential management authority is required.');
  }
  if(write && w.kind==='staff') operationsWrite(user);
  return t;
}
async function entry(env:Env,user:Principal,w:Workspace,id:string){
 const c=await statement(env.DB,'SELECT * FROM wa_residential_form_cases WHERE id=?',id).first<Record<string,any>>();
 assert(c,404,'WA_FORM_NOT_FOUND','The form record is unavailable.');
 const t=await scope(env,user,w,c.tenancy_id);
 if(w.kind==='tenant') assert(c.initiator_id===user.id,
    403,'WA_FORM_PRIVATE','This record has not been issued to you.');
 return {c,t};
}
export async function waFormsData(env:Env,user:Principal,w:Workspace,tenancyId:string){
 await scope(env,user,w,tenancyId);
 const q=w.kind==='tenant'
   ? 'SELECT * FROM wa_residential_form_cases WHERE tenancy_id=? AND initiator_id=? ORDER BY created_at DESC'
   : 'SELECT * FROM wa_residential_form_cases WHERE tenancy_id=? ORDER BY created_at DESC';
 const rows=(await statement(env.DB,q,tenancyId,...(w.kind==='tenant'?[user.id]:[])).all<Record<string,any>>()).results;
 return {definitions:waAvailableForms(w.kind),source:OFFICIAL_WA_FORMS_URL,cases:await Promise.all(rows.map(async r=>({
  id:r.id,formCode:r.form_code,status:r.status,version:r.version,createdAt:r.created_at,
  dueAt:r.due_at,issuedDocumentId:r.issued_document_id,
  details: r.initiator_id===user.id || w.kind!=='tenant'
   ? await unseal(env.DATA_ENCRYPTION_KEY,`wa-form:${r.id}`,r.data_envelope):null,
 })))};
}
export async function waCreateForm(env:Env,user:Principal,w:Workspace,input:unknown){
 const q=z.object({tenancyId:recordId,formCode:z.string().max(64),answers:z.record(z.string(),z.union([z.string(),z.number()])),notes:z.string().max(4000).optional()}).parse(input);
 const t=await scope(env,user,w,q.tenancyId,w.kind!=='tenant');
 const f=waForm(q.formCode);
 assert(f&&waAvailableForms(w.kind).some(x=>x.code===q.formCode),422,'FORM_UNAVAILABLE','The selected form is not available to this user.');
 assert(t.status==='active'||f.stage==='bond',409,'TENANCY_ENDED','Only bond finalisation is permitted after the tenancy ends.');
 const values:Record<string,string|number>={};
 for(const field of f.fields){
  const v=q.answers[field.key];
  assert(!field.required||(v!==undefined&&String(v).trim()!==''),422,'FORM_FIELD_REQUIRED',`Complete ${field.label}.`);
  if(v!==undefined){
    assert(String(v).length<=2000,422,'FORM_FIELD_LENGTH','A field exceeds the supported length.');
    if(field.type==='number') assert(Number.isFinite(Number(v))&&Number(v)>=0,422,'FORM_NUMBER_INVALID',`Check ${field.label}.`);
    if(field.type==='date') assert(/^\d{4}-\d{2}-\d{2}$/.test(String(v))&&!Number.isNaN(Date.parse(String(v))),422,'FORM_DATE_INVALID',`Check ${field.label}.`);
    values[field.key]=v;
  }
 }
 assert(Object.keys(q.answers).every(k=>f.fields.some(field=>field.key===k)),422,'FORM_FIELD_UNKNOWN','An unsupported field was submitted.');
 const id=uid('waf'),time=now();
 await env.DB.batch([
  statement(env.DB,"INSERT INTO wa_residential_form_cases(id,tenancy_id,property_id,form_code,form_stage,initiator_id,initiator_kind,data_envelope,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    id,t.id,t.property_id,f.code,f.stage,user.id,w.kind==='tenant'?'tenant':'manager',
    await seal(env.DATA_ENCRYPTION_KEY,`wa-form:${id}`,{answers:values,notes:q.notes??''}),time,time),
  statement(env.DB,'INSERT INTO wa_residential_form_events(id,case_id,actor_id,action,created_at) VALUES(?,?,?,?,?)',uid('wfe'),id,user.id,'draft_created',time),
  activity(env,user,'wa_form.draft_created','wa_form',id,t.property_id,null,{formCode:f.code}),
 ]);
 return {id,status:'draft'};
}
export async function waUpdateForm(env:Env,user:Principal,w:Workspace,id:string,input:unknown){
 const {c,t}=await entry(env,user,w,id);
 const q=z.object({version,status:z.enum(['submitted','under_review','approved','withdrawn']),
   reviewReference:reference.optional()}).parse(input);
 if (q.status==='under_review'||q.status==='approved') {
   assert(w.kind==='staff',403,'STAFF_REVIEW_REQUIRED','Only an authorised ProInspect reviewer may approve an official form.');
   operationsWrite(user);
 }
 const allowed:Record<string,string[]>={draft:['submitted','withdrawn'],submitted:['under_review','withdrawn'],under_review:['approved','withdrawn']};
 assert(c.version===q.version&&allowed[c.status]?.includes(q.status),409,'WA_FORM_CHANGED','The record changed or cannot take this action.');
 if(q.status==='submitted') assert(c.initiator_id===user.id,403,'FORM_CREATOR_REQUIRED','Only the creator can submit the draft.');
 else if(q.status==='withdrawn') assert(c.initiator_id===user.id||w.kind==='staff',403,'FORM_CREATOR_REQUIRED','Only the creator or an authorised reviewer can withdraw the draft.');
 else{
   assert(w.kind==='staff',403,'STAFF_REVIEW_REQUIRED','Official document review requires an authorised ProInspect reviewer.');
   operationsWrite(user);
   assert(q.reviewReference,422,'REVIEW_REFERENCE_REQUIRED','Record the actual review decision and supporting reference.');
 }
 await env.DB.batch([
  statement(env.DB,'UPDATE wa_residential_form_cases SET status=?,version=version+1,reviewed_by=CASE WHEN ? THEN ? ELSE reviewed_by END,review_reference=COALESCE(?,review_reference),updated_at=? WHERE id=? AND version=?',
   q.status,q.status==='approved'?1:0,user.id,q.reviewReference??null,now(),id,q.version),
  guard(env),
  statement(env.DB,'INSERT INTO wa_residential_form_events(id,case_id,actor_id,action,reference,created_at) VALUES(?,?,?,?,?,?)',uid('wfe'),id,user.id,q.status,q.reviewReference??null,now()),
  activity(env,user,'wa_form.status_changed','wa_form',id,t.property_id,null,{status:q.status}),
  clearGuard(env),
 ]);
 return {id,status:q.status};
}
export async function waRecordDelivery(env:Env,user:Principal,w:Workspace,id:string,input:unknown){
 const {c,t}=await entry(env,user,w,id);
 assert(w.kind==='staff',403,'STAFF_REVIEW_REQUIRED','Only authorised Staff may register formal issue or delivery evidence.');
 operationsWrite(user);
 assert(c.status==='approved'||c.status==='document_issued'||c.status==='service_evidence_recorded',
 409,'FORM_NOT_APPROVED','Review the form before recording delivery.');
 const q=z.object({recipientKind:z.enum(['tenant','landlord','authority','other']),
   recipientReference:reference,deliveryMethod:z.enum(['in_person','post','email','government_portal','other']),
   deliveryAt:z.string().datetime({offset:true}),evidenceReference:reference,
   outcome:z.enum(['attempted','delivered','rejected','unconfirmed'])}).parse(input);
 const deliveredAt=new Date(q.deliveryAt).toISOString();
 assert(new Date(deliveredAt).getTime()<=Date.now()+60000,422,'INVALID_DELIVERY_DATE','Future delivery cannot be recorded as completed.');
 const did=uid('wad');
 await env.DB.batch([
  statement(env.DB,'INSERT INTO wa_residential_form_delivery(id,case_id,actor_id,recipient_kind,recipient_reference,delivery_method,delivery_at,evidence_reference,outcome,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
   did,id,user.id,q.recipientKind,q.recipientReference,q.deliveryMethod,deliveredAt,q.evidenceReference,q.outcome,now()),
  statement(env.DB,'INSERT INTO wa_residential_form_events(id,case_id,actor_id,action,reference,created_at) VALUES(?,?,?,?,?,?)',
   uid('wfe'),id,user.id,'delivery_recorded',q.evidenceReference,now()),
  activity(env,user,'wa_form.delivery_recorded','wa_form',id,t.property_id,null,{outcome:q.outcome}),
 ]);
 return {id:did,outcome:q.outcome,legalServiceConfirmed:false};
}
