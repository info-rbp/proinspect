import {z} from 'zod';
import {assert,statement,uid,now,type Env} from '../../../../packages/database/types';
import type {Principal,Workspace} from '../../../../packages/domain/index';
import {propertyAccess,propertiesFor,operationsWrite} from '../../../../packages/authorization/server';
import {seal,unseal} from '../../../../packages/auth/crypto';
import {recordId,reference,isoDate,version,guard,clearGuard,activity} from '../../../../packages/operations/core';
import {requireReleaseApproval} from './release-governance.server';
const kinds=['option_date','rent_review','insurance','compliance','make_good','handover','other'] as const;
async function scope(env:Env,user:Principal,w:Workspace,propertyId?:string,write=false){
 assert(env.COMMERCIAL_OPERATIONS_ENABLED==='true',503,'COMMERCIAL_OPERATIONS_DISABLED','Commercial lease operations are not enabled.');await requireReleaseApproval(env,'commercial');
 assert(['commercial','property-manager','staff'].includes(w.kind),403,'COMMERCIAL_WORKSPACE_REQUIRED','Use the authorised commercial or professional management workspace.');
 if(write&&w.kind==='staff')operationsWrite(user);
 if(propertyId){const p=await propertyAccess(env,user,w,propertyId,write);assert(p.sector==='commercial',422,'COMMERCIAL_ONLY','This register only supports commercial properties.');return p;}
 return null;
}
async function leaseAccess(env:Env,user:Principal,w:Workspace,id:string,write=false){const l=await statement(env.DB,'SELECT * FROM commercial_lease_register WHERE id=?',id).first<Record<string,any>>();assert(l,404,'COMMERCIAL_LEASE_NOT_FOUND','Lease record not found.');await scope(env,user,w,l.property_id,write);assert(w.kind==='staff'||l.client_id===w.scopeId,404,'COMMERCIAL_LEASE_NOT_FOUND','Lease record not found.');return l;}
async function issuedEvidence(env:Env,l:Record<string,any>,id:string){const d=await statement(env.DB,"SELECT d.id FROM documents d JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=? WHERE d.id=? AND d.property_id=? AND d.status='issued'",l.client_id,id,l.property_id).first();assert(d,422,'COMMERCIAL_EVIDENCE_SCOPE','Choose an issued document expressly shared with the commissioning client for this property.');}
function event(env:Env,user:Principal,l:string,t:string|null,action:string,ref:string){return statement(env.DB,'INSERT INTO commercial_lease_events(id,lease_id,task_id,actor_id,action,reference,created_at) VALUES(?,?,?,?,?,?,?)',uid('cle'),l,t,user.id,action,ref,now());}
export async function commercialData(env:Env,user:Principal,w:Workspace){
 await scope(env,user,w);const properties=(await propertiesFor(env,user,w)).filter(p=>p.sector==='commercial');const ids=properties.map(p=>p.id);
 const leases=ids.length?(await statement(env.DB,`SELECT * FROM commercial_lease_register WHERE property_id IN(${ids.map(()=>'?').join(',')}) ${w.kind==='staff'?'':'AND client_id=?'} ORDER BY ends_at LIMIT 100`,...ids,...(w.kind==='staff'?[]:[w.scopeId])).all<Record<string,any>>()).results:[];
 const output=[];for(const l of leases){const rows=(await statement(env.DB,'SELECT * FROM commercial_lease_tasks WHERE lease_id=? ORDER BY due_at LIMIT 200',l.id).all<Record<string,any>>()).results;output.push({...l,details_envelope:undefined,details:await unseal(env.DATA_ENCRYPTION_KEY,'commercial-lease:'+l.id,l.details_envelope),tasks:await Promise.all(rows.map(async t=>({...t,details_envelope:undefined,overdue:t.due_at<now()&&!['completed','cancelled'].includes(t.status),details:await unseal(env.DATA_ENCRYPTION_KEY,'commercial-task:'+t.id,t.details_envelope)})))});}
 return {properties:properties.map(p=>({id:p.id,address:p.address})),leases:output,kinds,notice:'Dates and obligations are recorded from approved source documents. This register does not calculate rent, serve notices, exercise options, certify compliance or execute a lease.'};
}
export async function commercialCommand(env:Env,user:Principal,w:Workspace,command:string,input:unknown){
 if(command==='create'){
  const d=z.object({propertyId:recordId,clientId:recordId.optional(),reference:reference,occupierName:z.string().trim().min(2).max(150),startsAt:isoDate,endsAt:isoDate,details:z.string().trim().min(10).max(6000),sourceDocumentId:recordId.optional()}).parse(input);await scope(env,user,w,d.propertyId,true);assert(d.endsAt>d.startsAt,422,'LEASE_DATES','End must follow commencement.');
  const clientId=w.kind==='staff'?d.clientId:w.scopeId;assert(clientId,422,'CLIENT_REQUIRED','Choose the commissioning client.');
  assert(await statement(env.DB,"SELECT 1 FROM client_property_links WHERE client_id=? AND property_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)",clientId,d.propertyId,now(),now()).first(),403,'COMMERCIAL_CLIENT_SCOPE','The commissioning client needs a current property relationship.');
  if(d.sourceDocumentId)await issuedEvidence(env,{client_id:clientId,property_id:d.propertyId},d.sourceDocumentId);
  const id=uid('clr'),t=now();await env.DB.batch([statement(env.DB,'INSERT INTO commercial_lease_register(id,property_id,client_id,reference,occupier_name,starts_at,ends_at,details_envelope,source_document_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,d.propertyId,clientId,d.reference,d.occupierName,d.startsAt,d.endsAt,await seal(env.DATA_ENCRYPTION_KEY,'commercial-lease:'+id,{text:d.details}),d.sourceDocumentId??null,user.id,t,t),event(env,user,id,null,'created',d.reference),activity(env,user,'commercial.lease_created','commercial_lease',id,d.propertyId)]);return {id};
 }
 if(command==='task'){
  const d=z.object({leaseId:recordId,kind:z.enum(kinds),title:z.string().trim().min(3).max(160),dueAt:isoDate,details:z.string().trim().min(5).max(6000),reference:reference,workOrderId:recordId.optional()}).parse(input);const l=await leaseAccess(env,user,w,d.leaseId,true);assert(l.status==='active',409,'LEASE_ENDED','An ended record cannot receive new operational tasks.');
  if(d.workOrderId)assert(await statement(env.DB,'SELECT id FROM work_orders WHERE id=? AND property_id=? AND client_id=?',d.workOrderId,l.property_id,l.client_id).first(),422,'WORK_ORDER_SCOPE','The work order must belong to this property and client.');
  const id=uid('clt'),t=now();await env.DB.batch([statement(env.DB,'INSERT INTO commercial_lease_tasks(id,lease_id,kind,title,due_at,details_envelope,work_order_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,l.id,d.kind,d.title,d.dueAt,await seal(env.DATA_ENCRYPTION_KEY,'commercial-task:'+id,{text:d.details}),d.workOrderId??null,user.id,t,t),event(env,user,l.id,id,'task_created',d.reference)]);return {id};
 }
 if(command==='task-status'){
  const d=z.object({taskId:recordId,version,status:z.enum(['in_progress','review_required','completed','cancelled']),reference,completionDocumentId:recordId.optional()}).parse(input);const t=await statement(env.DB,'SELECT * FROM commercial_lease_tasks WHERE id=?',d.taskId).first<Record<string,any>>();assert(t,404,'TASK_NOT_FOUND','Task not found.');const l=await leaseAccess(env,user,w,t.lease_id,true);assert(t.version===d.version&&!['completed','cancelled'].includes(t.status),409,'TASK_CHANGED','Reload the current task.');
  if(d.status==='completed'){operationsWrite(user);assert(user.id!==t.created_by&&t.status==='review_required'&&d.completionDocumentId,403,'INDEPENDENT_COMPLETION_REQUIRED','A different operations reviewer must verify an issued completion document.');await issuedEvidence(env,l,d.completionDocumentId);if(t.work_order_id)assert(await statement(env.DB,"SELECT id FROM work_orders WHERE id=? AND status='completed' AND property_id=? AND client_id=?",t.work_order_id,l.property_id,l.client_id).first(),409,'WORK_INCOMPLETE','The linked work order has not completed.');}
  await env.DB.batch([statement(env.DB,'UPDATE commercial_lease_tasks SET status=?,completion_document_id=?,reviewed_by=?,reviewed_at=?,completion_reference=?,version=version+1,updated_at=? WHERE id=? AND version=?',d.status,d.status==='completed'?d.completionDocumentId!:t.completion_document_id,d.status==='completed'?user.id:null,d.status==='completed'?now():null,d.status==='completed'?d.reference:null,now(),t.id,t.version),guard(env),event(env,user,l.id,t.id,'task_'+d.status,d.reference),clearGuard(env)]);return {id:t.id,status:d.status};
 }
 if(command==='end'){
  const d=z.object({leaseId:recordId,version,reference}).parse(input);const l=await leaseAccess(env,user,w,d.leaseId,true);assert(!await statement(env.DB,"SELECT id FROM commercial_lease_tasks WHERE lease_id=? AND status NOT IN('completed','cancelled') LIMIT 1",l.id).first(),409,'OPEN_OBLIGATIONS','Review or close outstanding operational obligations first.');await env.DB.batch([statement(env.DB,"UPDATE commercial_lease_register SET status='ended',version=version+1,updated_at=? WHERE id=? AND version=? AND status='active'",now(),l.id,d.version),guard(env),event(env,user,l.id,null,'record_ended',d.reference),clearGuard(env)]);return {id:l.id,status:'ended'};
 }
 assert(false,404,'COMMERCIAL_ACTION','Unknown operation.');
}
