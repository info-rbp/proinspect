import { z } from 'zod';
import { statement, assert, now, uid, type Env } from '../../../../packages/database/types';
import { digest, seal, unseal } from '../../../../packages/auth/crypto';
import { isLocal } from '../../../../packages/auth/server';
import { operationsWrite } from '../../../../packages/authorization/server';
import { enquirySchema, ENQUIRY_STATES, canTransitionEnquiry, verifyEnquiry, type EnquiryInput } from '../../../../packages/marketing/enquiry';
import { mailEvent } from '../../../../packages/notifications/server';
import { activity, guard, clearGuard, version, recordId, reference, replay, receipt } from '../../../../packages/operations/core';
import type { Principal, Workspace } from '../../../../packages/domain/index';

async function limit(env:Env,bucket:string,max:number) {
 const time=now(),hash=await digest(`${env.DATA_ENCRYPTION_KEY}:enquiry:${bucket}`);
 const count=await statement(env.DB,`INSERT INTO auth_rate_limits(bucket,attempts,expires_at) VALUES(?,1,?)
 ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,
 expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`,hash,new Date(Date.now()+900000).toISOString(),time,time).first<{attempts:number}>();
 assert(count&&count.attempts<=max,429,'ENQUIRY_RATE_LIMITED','Too many submissions. Please try again later.');
}
export async function receiveEnquiry(env:Env,request:Request) {
 assert(env.ENQUIRY_GATEWAY_SECRET && env.DATA_ENCRYPTION_KEY,503,'ENQUIRY_NOT_CONFIGURED','Enquiries are not available yet.');
 assert(Number(request.headers.get('content-length')??0)<=20000,413,'ENQUIRY_TOO_LARGE','The enquiry exceeds the size limit.');
 const raw=await request.text();
 assert(new TextEncoder().encode(raw).byteLength<=20000,413,'ENQUIRY_TOO_LARGE','The enquiry exceeds the size limit.');
 assert(await verifyEnquiry(env.ENQUIRY_GATEWAY_SECRET,request.headers.get('X-Enquiry-Time')??'',request.headers.get('X-Enquiry-Signature')??'',raw),403,'ENQUIRY_GATEWAY_INVALID','Use the ProInspect contact form.');
 let decoded:unknown;try {decoded=JSON.parse(raw);}catch {assert(false,400,'ENQUIRY_INVALID','The enquiry is not valid JSON.');}
 const payload=z.object({origin:z.string().url(),clientKey:z.string().regex(/^[a-f0-9]{64}$/),turnstile:z.string().max(2048).optional(),input:enquirySchema}).parse(decoded);
 const expected=env.MARKETING_ORIGIN??'http://localhost:5174';
 assert(payload.origin===expected,403,'ENQUIRY_ORIGIN_INVALID','Use the ProInspect contact form.');
 const d=payload.input,fingerprint=await digest(JSON.stringify(d));
 const existing=await statement(env.DB,'SELECT id,reference,fingerprint FROM marketing_enquiries WHERE request_key=?',d.requestKey).first<{id:string;reference:string;fingerprint:string}>();
 if(existing){assert(existing.fingerprint===fingerprint,409,'ENQUIRY_RETRY_CHANGED','The retry differs from the original enquiry. Start a new enquiry.');return {reference:existing.reference,replayed:true};}
 await limit(env,`source:${payload.clientKey}`,10);
 await limit(env,`email:${d.email}`,5);
 if(!isLocal(request,env)) {
  assert(env.MARKETING_TURNSTILE_SECRET_KEY&&payload.turnstile,503,'ENQUIRY_SECURITY_REQUIRED','Complete the security check before sending.');
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
   method:'POST',body:new URLSearchParams({secret:env.MARKETING_TURNSTILE_SECRET_KEY,response:payload.turnstile,idempotency_key:d.requestKey}),signal:AbortSignal.timeout(10000)});
  const result=await response.json() as {success:boolean;hostname?:string;action?:string};
  assert(response.ok&&result.success&&result.hostname===new URL(expected).hostname&&result.action==='enquiry',403,'ENQUIRY_SECURITY_FAILED','The security check expired. Please try again.');
 }
 if(d.serviceId)assert(await statement(env.DB,'SELECT id FROM services WHERE id=? AND active=1',d.serviceId).first(),422,'SERVICE_UNAVAILABLE','Choose an available service.');
 const id=uid('enq'),ref=`ENQ-${crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase()}`,time=now(),eventId=uid('eqe');
 const batch=[
  statement(env.DB,`INSERT INTO marketing_enquiries(id,reference,request_key,fingerprint,envelope,service_id,enquiry_kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`,id,ref,d.requestKey,fingerprint,await seal(env.DATA_ENCRYPTION_KEY,`enquiry:${id}`,d),d.serviceId??null,d.kind,time,time),
  statement(env.DB,`INSERT INTO enquiry_events(id,enquiry_id,kind,envelope,created_at) VALUES(?,?,'received',?,?)`,eventId,id,await seal(env.DATA_ENCRYPTION_KEY,`enquiry-event:${eventId}`,{message:'Received from the public marketing contact form; contact permission recorded.'}),time),
  statement(env.DB,`INSERT INTO notifications(id,user_id,title,message,href,created_at) SELECT 'ntf_'||?||'_'||u.id,u.id,'New marketing enquiry',?, ?,? FROM users u JOIN staff_profiles sp ON sp.user_id=u.id WHERE u.active=1 AND sp.active=1 AND sp.role IN('administrator','operations_manager')`,id,ref,`/w/staff/operations/enquiries/${id}`,time),
  statement(env.DB,"INSERT INTO audit_events(id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,'enquiry.received','enquiry',?,'{}',?)",uid('aud'),id,time),
 ];
 if(env.OPERATIONS_EMAIL)batch.push(await mailEvent(env,'enquiry.received',{to:env.OPERATIONS_EMAIL,subject:`New ProInspect enquiry ${ref}`,heading:'A new enquiry needs review',body:'Open the Staff enquiry queue to review the request and decide the next action.',href:`${env.APP_ORIGIN}/w/staff/operations/enquiries/${id}`}));
 try {await env.DB.batch(batch);} catch(error) {
  // Concurrent retries resolve to the one committed enquiry; no duplicate mail is queued.
  const found=await statement(env.DB,'SELECT reference,fingerprint FROM marketing_enquiries WHERE request_key=?',d.requestKey).first<{reference:string;fingerprint:string}>();
  if(found&&found.fingerprint===fingerprint)return {reference:found.reference,replayed:true};
  throw error;
 }
 return {reference:ref,replayed:false};
}
function access(user:Principal,w:Workspace) {assert(w.kind==='staff',403,'STAFF_REQUIRED','Use the Staff workspace.');operationsWrite(user);}
async function row(env:Env,id:string) {const r=await statement(env.DB,'SELECT * FROM marketing_enquiries WHERE id=?',id).first<Record<string,any>>();assert(r,404,'ENQUIRY_NOT_FOUND','Enquiry not found.');return r;}
export async function listEnquiries(env:Env,user:Principal,w:Workspace,url:URL) {
 access(user,w);
 const status=url.searchParams.get('status')||'',after=url.searchParams.get('after')||'',q=(url.searchParams.get('q')||'').trim();
 assert(!status||(ENQUIRY_STATES as readonly string[]).includes(status),422,'FILTER_INVALID','Choose an enquiry status.');
 assert(q.length<=60,422,'FILTER_INVALID','The reference is too long.');
 let cursor:any=null;if(after)cursor=await row(env,recordId.parse(after));
 const rows=(await statement(env.DB,`SELECT e.*,u.display_name AS assigned_name FROM marketing_enquiries e LEFT JOIN users u ON u.id=e.assigned_user_id
 WHERE (?='' OR e.status=?) AND (?='' OR e.reference=?) AND (? IS NULL OR e.created_at<? OR (e.created_at=? AND e.id<?))
 ORDER BY e.created_at DESC,e.id DESC LIMIT 26`,status,status,q,q.toUpperCase(),cursor?.created_at??null,cursor?.created_at??null,cursor?.created_at??null,cursor?.id??null).all<Record<string,any>>()).results;
 const items=[];
 for(const r of rows.slice(0,25)){const d=await unseal<EnquiryInput>(env.DATA_ENCRYPTION_KEY,`enquiry:${r.id}`,r.envelope);items.push({id:r.id,reference:r.reference,name:d.name,organisation:d.organisation,kind:r.enquiry_kind,status:r.status,created_at:r.created_at,assigned_name:r.assigned_name});}
 const counts=(await statement(env.DB,'SELECT status,COUNT(*) AS count FROM marketing_enquiries GROUP BY status').all()).results;
 return {items,counts,next:rows.length>25?rows[24].id:null,status,q};
}
export async function enquiryDetail(env:Env,user:Principal,w:Workspace,id:string) {
 access(user,w);const r=await row(env,id),contact=await unseal<EnquiryInput>(env.DATA_ENCRYPTION_KEY,`enquiry:${id}`,r.envelope);
 const events=(await statement(env.DB,`SELECT e.*,u.display_name AS actor_name,o.status AS delivery_status,o.error_code FROM enquiry_events e LEFT JOIN users u ON u.id=e.actor_id LEFT JOIN outbox_events o ON o.id=e.outbox_id WHERE enquiry_id=? ORDER BY e.created_at,e.id`,id).all<Record<string,any>>()).results;
 const history=[];for(const e of events)history.push({id:e.id,kind:e.kind,created_at:e.created_at,actor_name:e.actor_name,delivery_status:e.delivery_status,error_code:e.error_code,...await unseal<Record<string,unknown>>(env.DATA_ENCRYPTION_KEY,`enquiry-event:${e.id}`,e.envelope)});
 const staff=(await statement(env.DB,"SELECT u.id,u.display_name,u.email FROM users u JOIN staff_profiles sp ON sp.user_id=u.id WHERE u.active=1 AND sp.active=1 AND sp.role IN('administrator','operations_manager') ORDER BY u.display_name").all()).results;
 await activity(env,user,'enquiry.viewed','enquiry',id).run();
 return {enquiry:{id:r.id,reference:r.reference,status:r.status,version:r.version,assigned_user_id:r.assigned_user_id,linked_client_id:r.linked_client_id,created_at:r.created_at},contact,history,staff};
}
export async function updateEnquiry(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
 access(user,w);const d=z.object({version,status:z.enum(ENQUIRY_STATES),assignedUserId:recordId.optional(),note:z.string().trim().min(4).max(2000)}).parse(input),r=await row(env,id);
 assert(canTransitionEnquiry(r.status,d.status),422,'ENQUIRY_TRANSITION','Reopen this enquiry before changing its status.');
 if(d.assignedUserId)assert(await statement(env.DB,"SELECT sp.user_id FROM staff_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.user_id=? AND sp.active=1 AND u.active=1 AND sp.role IN('administrator','operations_manager')",d.assignedUserId).first(),422,'ASSIGNEE_INVALID','Choose an authorised Staff operator.');
 const event=uid('eqe');
 await env.DB.batch([
 statement(env.DB,'UPDATE marketing_enquiries SET status=?,assigned_user_id=?,version=version+1,updated_at=? WHERE id=? AND version=?',d.status,d.assignedUserId??null,now(),id,d.version),guard(env),
 statement(env.DB,"INSERT INTO enquiry_events(id,enquiry_id,actor_id,kind,envelope,created_at) VALUES(?,?,?,'updated',?,?)",event,id,user.id,await seal(env.DATA_ENCRYPTION_KEY,`enquiry-event:${event}`,{message:d.note,status:d.status}),now()),
 activity(env,user,'enquiry.updated','enquiry',id),clearGuard(env)]);return {ok:true};
}
export async function replyToEnquiry(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
 access(user,w);const d=z.object({version,requestKey:z.string().uuid(),message:z.string().trim().min(10).max(4000)}).parse(input);
 const prior=await replay(env,user,`enquiry.reply:${id}`,d.requestKey,d);if(prior.result)return prior.result;
 const r=await row(env,id);assert(!['closed','spam'].includes(r.status),422,'ENQUIRY_CLOSED','Reopen this enquiry before replying.');
 const contact=await unseal<EnquiryInput>(env.DATA_ENCRYPTION_KEY,`enquiry:${id}`,r.envelope),event=uid('eqe'),mail=uid('evt'),result={ok:true,queued:true};
 await env.DB.batch([
 statement(env.DB,"UPDATE marketing_enquiries SET status='awaiting_customer',version=version+1,updated_at=? WHERE id=? AND version=?",now(),id,d.version),guard(env),
 await mailEvent(env,'enquiry.reply',{to:contact.email,subject:`ProInspect enquiry ${r.reference}`,heading:`Your enquiry ${r.reference}`,body:d.message,href:`${env.APP_ORIGIN}/signin`},mail),
 statement(env.DB,"INSERT INTO enquiry_events(id,enquiry_id,actor_id,kind,envelope,outbox_id,created_at) VALUES(?,?,?,'reply',?,?,?)",event,id,user.id,await seal(env.DATA_ENCRYPTION_KEY,`enquiry-event:${event}`,{message:d.message}),mail,now()),
 activity(env,user,'enquiry.reply_queued','enquiry',id),receipt(env,user,`enquiry.reply:${id}`,d.requestKey,prior.fingerprint,result),clearGuard(env)]);return result;
}
export async function linkEnquiry(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
 access(user,w);const d=z.object({version,clientId:recordId,reference}).parse(input);await row(env,id);
 assert(await statement(env.DB,'SELECT id FROM clients WHERE id=?',d.clientId).first(),422,'CLIENT_NOT_FOUND','Choose an existing verified client account.');
 const event=uid('eqe');await env.DB.batch([
 statement(env.DB,'UPDATE marketing_enquiries SET linked_client_id=?,version=version+1,updated_at=? WHERE id=? AND version=?',d.clientId,now(),id,d.version),guard(env),
 statement(env.DB,"INSERT INTO enquiry_events(id,enquiry_id,actor_id,kind,envelope,created_at) VALUES(?,?,?,'linked',?,?)",event,id,user.id,await seal(env.DATA_ENCRYPTION_KEY,`enquiry-event:${event}`,{message:d.reference,clientId:d.clientId}),now()),
 activity(env,user,'enquiry.client_linked','enquiry',id),clearGuard(env)]);return {ok:true};
}
