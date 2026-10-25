import { z } from 'zod';
import type { Env } from '../../../../packages/database/types';
import { assert, statement, now, uid } from '../../../../packages/database/types';
import type { Principal } from '../../../../packages/domain/index';
import { randomToken, digest, seal, unseal } from '../../../../packages/auth/crypto';
import { isLocal, requireOrigin } from '../../../../packages/auth/server';
import { mailEvent } from '../../../../packages/notifications/server';
import { readJson, guard, clearGuard, activity } from '../../../../packages/operations/core';
import { v4Catalogue, v4Service, type V4Service } from '../../../../packages/v4/catalogue';
import { allowedForGuest, requestableStatus, validateAnswers, v4Price } from '../../../../packages/v4/workflows';

const requestSchema=z.object({
  requestKey:z.string().uuid(),serviceCode:z.string().regex(/^(RES|COM)-\d{3}$/),
  name:z.string().trim().min(2).max(120),email:z.email().max(254),
  phone:z.string().trim().min(6).max(40),street:z.string().trim().min(5).max(180),
  suburb:z.string().trim().min(2).max(100),postcode:z.string().regex(/^\d{4}$/),
  quantity:z.number().int().min(1).max(500).default(1),
  answers:z.record(z.string().max(80),z.union([z.string(),z.number()])).default({}),
  consent:z.literal(true),termsAcknowledged:z.literal(true),website:z.string().max(120).optional(),
  turnstile:z.string().max(4000).optional(),
});
export type V4Intake=z.infer<typeof requestSchema>;
type RecordRow={id:string;reference:string;service_code:string;sector:string;workflow_code:string;intake_envelope:string;
 rate_snapshot_json:string;quantity:number;status:string;version:number;quote_cents:number|null;quote_expires_at:string|null;verified_at:string|null;staff_note:string|null;completion_document_id:string|null};
const noCache={'Cache-Control':'private, no-store'};
function publicStatus(row:RecordRow){return {reference:row.reference,serviceCode:row.service_code,status:row.status,workflowCode:row.workflow_code,
  version:row.version,quotedExGstCents:row.status==='quoted'?row.quote_cents:null,quoteExpiresAt:row.status==='quoted'?row.quote_expires_at:null,
  documentReady:Boolean(row.completion_document_id)};}
async function limiter(env:Env,label:string,max=10){
 const bucket=await digest(env.DATA_ENCRYPTION_KEY+':v4:'+label),time=now();
 const expiry=new Date(Date.now()+15*60000).toISOString();
 const row=await statement(env.DB,
  'INSERT INTO guest_request_limits(bucket,attempts,expires_at) VALUES(?,1,?) '+
  'ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,'+
  'expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING attempts',
  bucket,expiry,time,time).first<{attempts:number}>();
 assert(row&&row.attempts<=max,429,'RATE_LIMIT','Too many requests; try again later.');
}
async function turnstile(request:Request,env:Env,token:string|undefined){
 if(isLocal(request,env))return;
 assert(env.TURNSTILE_SECRET_KEY&&token,503,'SECURITY_UNAVAILABLE','The security check is unavailable.');
 const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
  method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:token}),signal:AbortSignal.timeout(10000)});
 const result=await response.json() as {success?:boolean;hostname?:string;action?:string};
 assert(result.success&&result.hostname===new URL(env.APP_ORIGIN).hostname&&result.action==='guest_booking',
  403,'BOT_CHECK_FAILED','Complete the security check again.');
}
async function issueLink(env:Env,requestId:string,purpose:'verify'|'manage'|'quote',expiresMs:number){
 const token=randomToken();
 const tokenHash=await digest(token);
 return {token,entry:statement(env.DB,
   'INSERT INTO v4_request_links(token_hash,request_id,purpose,expires_at,created_at) VALUES(?,?,?,?,?)',
   tokenHash,requestId,purpose,new Date(Date.now()+expiresMs).toISOString(),now())};
}
async function lookup(env:Env,token:string,purpose:string){
 assert(/^[0-9a-f]{64}$/.test(token),404,'LINK_UNAVAILABLE','This private link is unavailable.');
 const row=await statement(env.DB,
 'SELECT l.token_hash,r.* FROM v4_request_links l JOIN v4_service_requests r ON r.id=l.request_id '+
 'WHERE l.token_hash=? AND l.purpose=? AND l.consumed_at IS NULL AND l.expires_at>?',
 await digest(token),purpose,now()).first<RecordRow&{token_hash:string}>();
 assert(row,404,'LINK_UNAVAILABLE','This private link is unavailable or expired.');return row;
}
async function notification(env:Env,to:string,row:Pick<RecordRow,'reference'|'service_code'>,subject:string,heading:string,body:string,href?:string){
 return mailEvent(env,'v4.service_request',{to,subject,heading,body,href,sensitive:Boolean(href),facts:{Reference:row.reference,Service:row.service_code}});
}
export async function publicCatalogue(env:Env,sector?:string){
 const all=await v4Catalogue();
 const preview=env.APP_ENV==='local'||env.V4_SERVICE_REQUESTS_ENABLED==='true';
 const selected=preview?all.services.filter(s=>(sector===undefined||s.sector===sector)&&allowedForGuest(s)):[];
 return {enabled:env.V4_SERVICE_REQUESTS_ENABLED==='true',sourceVersion:all.sourceVersion,
  disclaimer:'Prices are source PAYG schedule references; no online charge or appointment is confirmed by submitting a request.',
  services:selected.map(s=>({id:s.id,name:s.name,category:s.category,sector:s.sector,description:s.description,
   feeText:s.feeText,pricing:v4Price(s),pathway:s.pathway,workflowCode:s.workflowCode,
   requestStatus:requestableStatus(s)}))};
}
export async function publicService(env:Env,id:string){
 assert(env.APP_ENV==='local'||env.V4_SERVICE_REQUESTS_ENABLED==='true',503,'V4_INTAKE_DISABLED','Service requests are not activated.');
 const s=await v4Service(id);assert(s&&allowedForGuest(s),404,'SERVICE_UNAVAILABLE','This service is not available for public requests.');
 const wf=(await v4Catalogue()).workflows.find(x=>x.code===s.workflowCode);
 return {service:{...s,pricing:v4Price(s),requestStatus:requestableStatus(s)},workflow:wf,enabled:env.V4_SERVICE_REQUESTS_ENABLED==='true',turnstileKey:env.TURNSTILE_SITE_KEY??null};
}
export async function begin(request:Request,env:Env){
 requireOrigin(request,env);
 assert(env.V4_SERVICE_REQUESTS_ENABLED==='true',503,'V4_INTAKE_DISABLED','This service request pathway is not yet activated.');
 const data=requestSchema.parse(await readJson(request));
 assert(!data.website,422,'BOT_REJECTED','Invalid request.');
 await limiter(env,'ip:'+request.headers.get('CF-Connecting-IP'),12);
 await limiter(env,'email:'+data.email.toLowerCase(),5);
 await turnstile(request,env,data.turnstile);
 const service=await v4Service(data.serviceCode);
 assert(service&&allowedForGuest(service),422,'SERVICE_UNAVAILABLE','Choose an available service.');
 let answers:Record<string,string>={};
 try{answers=validateAnswers(service,data.answers)}catch{assert(false,422,'SERVICE_FIELDS','Check the required service information.');}
 const {turnstile:_turnstile,website:_website,...safeInput}=data;
 const intake={...safeInput,answers};
 const fingerprint=await digest(JSON.stringify(intake));
 const existing=await statement(env.DB,'SELECT fingerprint,reference FROM v4_service_requests WHERE request_key=?',data.requestKey)
  .first<{fingerprint:string;reference:string}>();
 if(existing){assert(existing.fingerprint===fingerprint,409,'REQUEST_KEY_REUSED','This request ID has already been used.');
  return {reference:existing.reference,status:'pending_verification',message:'Check your email for the verification link.'};}
 const id=uid('v4r'),reference='PI-SR-'+crypto.randomUUID().slice(0,8).toUpperCase(),time=now();
 const link=await issueLink(env,id,'verify',15*60000);
 const rate={sourceService:service.id,sourceVersion:'2026-10-25-workbook',sourceFee:service.feeText,
   quoteRequired:requestableStatus(service)==='quotation',pricing:v4Price(service,data.quantity),
   billingStatus:'NOT_CHARGED',scopeReviewRequired:true,subscriptionInclusionUnverified:true};
 const row={reference,service_code:service.id};
 await env.DB.batch([
  statement(env.DB,'INSERT INTO v4_service_requests(id,reference,request_key,fingerprint,service_code,sector,workflow_code,intake_envelope,rate_snapshot_json,quantity,status,created_at,updated_at) '+
   "VALUES(?,?,?,?,?,?,?,?,?,?,'pending_verification',?,?)",id,reference,data.requestKey,fingerprint,service.id,service.sector,service.workflowCode,
   await seal(env.DATA_ENCRYPTION_KEY,'v4-request:'+id,intake),JSON.stringify(rate),data.quantity,time,time),
  link.entry,
  statement(env.DB,'INSERT INTO v4_request_events(id,request_id,action,version,created_at) VALUES(?,?,?,?,?)',uid('ve'),id,'submitted',1,time),
  await notification(env,data.email,row,'Verify your ProInspect service request','Verify your email',
    'Confirm your email to submit this service request. No appointment has been reserved and no payment has been collected.',
    env.APP_ORIGIN+'/guest/request/verify?token='+link.token),
 ]);
 return {reference,status:'pending_verification',message:'Check your email to verify your request.',
   ...(isLocal(request,env)?{localVerifyToken:link.token}:{})};
}
export async function verify(request:Request,env:Env){
 requireOrigin(request,env);const data=z.object({token:z.string()}).parse(await readJson(request));
 await limiter(env,'verify:'+request.headers.get('CF-Connecting-IP'),25);
 const row=await lookup(env,data.token,'verify');
 assert(row.status==='pending_verification',409,'REQUEST_ALREADY_PROCESSED','This request has already been verified.');
 const manage=await issueLink(env,row.id,'manage',30*86400000),time=now();
 const input=await unseal<V4Intake>(env.DATA_ENCRYPTION_KEY,'v4-request:'+row.id,row.intake_envelope);
 await env.DB.batch([
  statement(env.DB,'UPDATE v4_request_links SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?',time,row.token_hash,time),guard(env),
  statement(env.DB,"UPDATE v4_service_requests SET status='submitted',verified_at=?,version=version+1,updated_at=? WHERE id=? AND status='pending_verification'",time,time,row.id),guard(env),
  manage.entry,clearGuard(env),
  statement(env.DB,'INSERT INTO v4_request_events(id,request_id,action,version,created_at) VALUES(?,?,?,?,?)',uid('ve'),row.id,'email_verified',row.version+1,time),
  await notification(env,input.email,row,'ProInspect service request received','Your request has been verified',
   'Our team will review the scope, authority and commercial terms. No service, document or legal notice has been issued.',
   env.APP_ORIGIN+'/guest/request/manage?token='+manage.token),
 ]);
 return {reference:row.reference,status:'submitted',message:'Verification complete. Check your inbox for a private status link.',
  ...(isLocal(request,env)?{localManageToken:manage.token}:{})};
}
export async function status(env:Env,token:string){return publicStatus(await lookup(env,token,'manage'));}
export async function cancel(request:Request,env:Env){
 requireOrigin(request,env);const d=z.object({token:z.string(),version:z.number().int().positive()}).parse(await readJson(request));
 const row=await lookup(env,d.token,'manage');
 assert(['submitted','under_review','awaiting_information','quoted'].includes(row.status),409,'CANCELLATION_REVIEW','Contact Staff to cancel an active or completed service.');
 const time=now();await env.DB.batch([
  statement(env.DB,"UPDATE v4_service_requests SET status='cancelled',version=version+1,updated_at=? WHERE id=? AND version=? AND status IN('submitted','under_review','awaiting_information','quoted')",time,row.id,d.version),guard(env),
  statement(env.DB,'INSERT INTO v4_request_events(id,request_id,action,version,created_at) VALUES(?,?,?,?,?)',uid('ve'),row.id,'guest_cancelled',d.version+1,time),clearGuard(env),
 ]);return {reference:row.reference,status:'cancelled'};
}
export async function quotePreview(env:Env,token:string){
 const row=await lookup(env,token,'quote'),time=now();
 assert(row.status==='quoted'&&row.quote_cents!==null&&Boolean(row.quote_expires_at&&row.quote_expires_at>time),
  409,'QUOTE_EXPIRED','This quotation has changed or expired.');
 return {reference:row.reference,serviceCode:row.service_code,priceExGstCents:row.quote_cents,
  gstCents:Math.round(row.quote_cents*0.1),expiresAt:row.quote_expires_at,
  message:'Acceptance does not collect a payment, reserve an appointment or issue a legal document.'};
}
export async function acceptQuote(request:Request,env:Env){
 requireOrigin(request,env);const data=z.object({token:z.string(),priceExGstCents:z.number().int().min(0),accept:z.literal(true)}).parse(await readJson(request));
 const row=await lookup(env,data.token,'quote');const time=now();
 assert(row.status==='quoted'&&row.quote_cents===data.priceExGstCents&&Boolean(row.quote_expires_at&&row.quote_expires_at>time),
  409,'QUOTE_CHANGED','The quotation is expired or has changed.');
 const manage=await issueLink(env,row.id,'manage',30*86400000);
 const input=await unseal<V4Intake>(env.DATA_ENCRYPTION_KEY,'v4-request:'+row.id,row.intake_envelope);
 await env.DB.batch([
  statement(env.DB,'UPDATE v4_request_links SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?',time,row.token_hash,time),guard(env),
  statement(env.DB,"UPDATE v4_service_requests SET status='approved',version=version+1,updated_at=? WHERE id=? AND version=? AND status='quoted' AND quote_cents=? AND quote_expires_at>?",time,row.id,row.version,row.quote_cents,time),guard(env),
  manage.entry,clearGuard(env),
  statement(env.DB,'INSERT INTO v4_request_events(id,request_id,action,version,created_at) VALUES(?,?,?,?,?)',uid('ve'),row.id,'quote_accepted',row.version+1,time),
  await notification(env,input.email,row,'Quotation accepted','Your quotation has been accepted',
   'Staff will confirm scheduling, document instructions and the approved payment method. Acceptance does not collect payment or reserve a timeslot.',
   env.APP_ORIGIN+'/guest/request/manage?token='+manage.token),
 ]);
 return {reference:row.reference,status:'approved',message:'Quotation accepted; awaiting Staff fulfilment.',
  ...(isLocal(request,env)?{localManageToken:manage.token}:{})};
}
function requireStaff(user:Principal){assert(['administrator','operations_manager'].includes(user.staffRole??''),403,'STAFF_REQUIRED','Operational Staff authority required.');}
export async function staffList(env:Env,user:Principal){
 requireStaff(user);
 const rows=await statement(env.DB,'SELECT id,reference,service_code,sector,status,version,created_at,updated_at,quantity FROM v4_service_requests ORDER BY created_at DESC LIMIT 100')
  .all<{id:string;reference:string;service_code:string;sector:string;status:string;version:number;created_at:string;updated_at:string;quantity:number}>();
 return {requests:rows.results};
}
export async function staffDetail(env:Env,user:Principal,id:string){
 requireStaff(user);const row=await statement(env.DB,'SELECT * FROM v4_service_requests WHERE id=?',id).first<RecordRow>();
 assert(row,404,'REQUEST_NOT_FOUND','Service request not found.');
 const intake=await unseal<V4Intake>(env.DATA_ENCRYPTION_KEY,'v4-request:'+row.id,row.intake_envelope);
 const events=await statement(env.DB,'SELECT action,version,created_at FROM v4_request_events WHERE request_id=? ORDER BY created_at DESC LIMIT 50',id).all();
 return {request:{...publicStatus(row),id:row.id,sector:row.sector,quantity:row.quantity,verifiedAt:row.verified_at,
  priceSnapshot:JSON.parse(row.rate_snapshot_json),quoteCents:row.quote_cents,completionDocumentId:row.completion_document_id},intake,events:events.results};
}
export async function staffChange(env:Env,user:Principal,id:string,body:unknown){
 requireStaff(user);
 const d=z.object({version:z.number().int().positive(),action:z.enum(['review','request_information','quote','approve','start','review_output','complete','decline']),
  note:z.string().trim().max(1000).optional(),priceExGstCents:z.number().int().min(0).max(100000000).optional(),validDays:z.number().int().min(1).max(30).optional(),
  documentId:z.string().regex(/^[a-zA-Z0-9_-]+$/).optional()}).parse(body);
 const row=await statement(env.DB,'SELECT * FROM v4_service_requests WHERE id=?',id).first<RecordRow>();
 assert(row&&row.verified_at,409,'REQUEST_NOT_READY','The guest must verify their request first.');
 assert(row.version===d.version,409,'STALE_REQUEST','This request has changed; reload.');
 const transitions:Record<string,{from:string[];to:string}>={
  review:{from:['submitted','awaiting_information'],to:'under_review'},
  request_information:{from:['submitted','under_review'],to:'awaiting_information'},
  quote:{from:['submitted','under_review','awaiting_information','quoted'],to:'quoted'},
  approve:{from:['submitted','under_review'],to:'approved'},
  start:{from:['approved'],to:'in_progress'},
  review_output:{from:['in_progress'],to:'awaiting_review'},
  complete:{from:['in_progress','awaiting_review'],to:'completed'},
  decline:{from:['submitted','under_review','awaiting_information','quoted'],to:'declined'},
 };
 const t=transitions[d.action];assert(t.from.includes(row.status),409,'INVALID_TRANSITION','The request cannot be moved to that status.');
 if(d.action==='quote')assert(d.priceExGstCents!==undefined,422,'QUOTE_REQUIRED','Enter an approved quotation amount.');
 if(d.action==='request_information')assert(Boolean(d.note?.trim()),422,'NOTE_REQUIRED','Explain what information is needed.');
 if(d.action==='approve')assert(Boolean(d.note?.trim()),422,'TERMS_REQUIRED','Record approved terms, inclusion or billing agreement.');
 if(d.action==='complete')assert(Boolean(d.note?.trim())||Boolean(d.documentId),422,'EVIDENCE_REQUIRED','Record a completion note or approved document.');
 if(d.documentId){
  assert(false,409,'DOCUMENT_SCOPE_PENDING','Final document linkage requires approved property and recipient authority controls.');
 }
 const time=now(),input=await unseal<V4Intake>(env.DATA_ENCRYPTION_KEY,'v4-request:'+id,row.intake_envelope);
 const link=d.action==='quote'?await issueLink(env,id,'quote',(d.validDays??14)*86400000):null;
 const expiry=d.action==='quote'?new Date(Date.now()+(d.validDays??14)*86400000).toISOString():null;
 const notificationEvent=await notification(env,input.email,row,
  d.action==='quote'?'ProInspect quotation ready':'ProInspect service request updated',
  d.action==='quote'?'Review your quotation':'Your service request has been updated',
  d.action==='quote'?'Please review the scope and amount in your private quotation. No appointment or payment has been processed.':
   'Your service request has progressed. Use your private status link or contact ProInspect if further information is required.',
  link?env.APP_ORIGIN+'/guest/request/quote?token='+link.token:undefined);
 const actions=[
  statement(env.DB,'UPDATE v4_service_requests SET status=?,version=version+1,staff_actor_id=?,staff_note=?,quote_cents=?,quote_expires_at=?,completion_document_id=COALESCE(?,completion_document_id),updated_at=? WHERE id=? AND version=? AND status=?',
   t.to,user.id,d.note??null,d.action==='quote'?d.priceExGstCents!:row.quote_cents,d.action==='quote'?expiry:row.quote_expires_at,d.documentId??null,time,id,row.version,row.status),guard(env),
 ];
 if(link){actions.push(statement(env.DB,"UPDATE v4_request_links SET consumed_at=? WHERE request_id=? AND purpose='quote' AND consumed_at IS NULL",time,id),link.entry);}
 actions.push(clearGuard(env),statement(env.DB,'INSERT INTO v4_request_events(id,request_id,action,actor_id,version,created_at) VALUES(?,?,?,?,?,?)',uid('ve'),id,d.action,user.id,d.version+1,time),activity(env,user,'v4.request.'+d.action,'v4_service_request',id),notificationEvent);
 await env.DB.batch(actions);
 return {ok:true,reference:row.reference,status:t.to,version:d.version+1};
}
