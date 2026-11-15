import { z } from 'zod';
import { assert,statement,now,uid,type Env } from '../../../../packages/database/types';
import type { Principal } from '../../../../packages/domain/index';
import { digest,randomToken,seal,unseal } from '../../../../packages/auth/crypto';
import { guard,clearGuard } from '../../../../packages/operations/core';
import { checkedHttpsEndpoint } from '../../../../packages/marketing/rental-governance';
import { verifyScanCallback } from './rental-malware.server';
import { boundedText } from '../../../../packages/http-bodies';
import { commercialPermission,commercialGate,commercialFlow,flowConfig,commercialEvent,type AppRow } from './commercial-intake.server';

async function signature(secret:string,timestamp:string,raw:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+raw)));
 return 'sha256='+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
async function smallResponse(response:Response){
 assert(Number(response.headers.get('content-length')??0)<=12000,502,'COMMERCIAL_PROVIDER_RESPONSE','Provider response too large.');
 const reader=response.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[],decoder=new TextDecoder();let size=0;
 for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>12000){await reader.cancel();assert(false,502,'COMMERCIAL_PROVIDER_RESPONSE','Provider response too large.');}chunks.push(part.value);}
 return chunks.map(c=>decoder.decode(c,{stream:true})).join('')+decoder.decode();
}
export async function dispatchCommercialScans(env:Env,user:Principal,applicationId:string){
 await commercialPermission(env,user,'review');await commercialGate(env);
 const app=await statement(env.DB,'SELECT flow_id FROM commercial_applications WHERE id=?',applicationId).first<{flow_id:string}>();assert(app,404,'COMMERCIAL_APPLICATION_UNAVAILABLE','Application unavailable.');await commercialFlow(env,app.flow_id);
 const endpoint=checkedHttpsEndpoint(env.COMMERCIAL_SCANNER_ENDPOINT,env.COMMERCIAL_SCANNER_ALLOWED_HOST);assert(endpoint,503,'COMMERCIAL_SCANNER_UNAVAILABLE','Private scanner unavailable.');
 const docs=(await statement(env.DB,"SELECT id,object_key,sha256 FROM commercial_application_evidence WHERE application_id=? AND scan_status IN('pending','error') AND review_status='quarantined' AND (scan_requested_at IS NULL OR scan_requested_at<?) ORDER BY uploaded_at LIMIT 3",applicationId,new Date(Date.now()-15*60000).toISOString()).all<{id:string;object_key:string;sha256:string}>()).results;
 for(const doc of docs){
  const claim=await statement(env.DB,"UPDATE commercial_application_evidence SET scan_status='pending',scan_requested_at=? WHERE id=? AND scan_status IN('pending','error') AND (scan_requested_at IS NULL OR scan_requested_at<?)",now(),doc.id,new Date(Date.now()-15*60000).toISOString()).run();if(claim.meta.changes!==1)continue;
  const object=await env.RESTRICTED_DOCUMENTS.get(doc.object_key);assert(object,409,'COMMERCIAL_DOCUMENT_MISSING','Quarantine object missing.');
  // No object URL or applicant PII leaves this authenticated, allowlisted transport.
  const response=await fetch(endpoint.href,{method:'POST',headers:{Authorization:'Bearer '+env.COMMERCIAL_SCANNER_TOKEN,'Content-Type':'application/octet-stream','X-ProInspect-Application':applicationId,'X-ProInspect-Document':doc.id,'X-ProInspect-SHA256':doc.sha256,'X-ProInspect-Callback':env.APP_ORIGIN+'/api/internal/commercial-document-scan'},body:object.body,redirect:'manual',signal:AbortSignal.timeout(15000)});
  assert(response.ok,502,'COMMERCIAL_SCAN_PENDING','Scanner has not confirmed receipt. File remains quarantined.');
  await response.body?.cancel();
 }
 return {requested:docs.length,clean:false};
}
export async function acceptCommercialScan(env:Env,request:Request){
 await commercialGate(env);
 const raw=await boundedText(request,8000);
 await verifyScanCallback(env.COMMERCIAL_SCANNER_WEBHOOK_SECRET??'',raw,request.headers.get('X-ProInspect-Time')??'',request.headers.get('X-ProInspect-Signature')??'');
 const d=z.object({eventId:z.uuid(),applicationId:z.string().min(3).max(100),documentId:z.string().min(3).max(100),sha256:z.string().regex(/^[a-f0-9]{64}$/),verdict:z.enum(['clean','unsafe','error']),engine:z.string().min(3).max(100),reference:z.string().min(8).max(240)}).parse(JSON.parse(raw));
 if(await statement(env.DB,'SELECT event_id FROM commercial_application_scan_receipts WHERE event_id=?',d.eventId).first())return {acknowledged:true,replayed:true};
 const app=await statement(env.DB,'SELECT flow_id FROM commercial_applications WHERE id=?',d.applicationId).first<{flow_id:string}>();assert(app,404,'COMMERCIAL_SCAN_DOCUMENT','Document unavailable.');await commercialFlow(env,app.flow_id);
 assert(await statement(env.DB,"SELECT id FROM commercial_application_evidence WHERE id=? AND application_id=? AND sha256=? AND scan_status IN('pending','error') AND review_status='quarantined'",d.documentId,d.applicationId,d.sha256).first(),409,'COMMERCIAL_SCAN_DOCUMENT_CHANGED','The file is no longer awaiting this scanner verdict.');
 await env.DB.batch([
  statement(env.DB,"UPDATE commercial_application_evidence SET scan_status=?,scan_reference_envelope=?,review_status=CASE WHEN ?='unsafe' THEN 'rejected' ELSE review_status END WHERE id=? AND application_id=? AND sha256=? AND scan_status IN('pending','error') AND review_status='quarantined'",d.verdict,await seal(env.DATA_ENCRYPTION_KEY,'commercial-scan:'+d.documentId,{engine:d.engine,reference:d.reference,at:now()}),d.verdict,d.documentId,d.applicationId,d.sha256),guard(env),
  statement(env.DB,'INSERT INTO commercial_application_scan_receipts(event_id,document_id,received_at) VALUES(?,?,?)',d.eventId,d.documentId,now()),
  await commercialEvent(env,d.applicationId,app.flow_id,'scan_verdict',{documentId:d.documentId,verdict:d.verdict,eventId:d.eventId}),clearGuard(env)]);
 return {acknowledged:true};
}
export async function reviewCommercialDocument(env:Env,user:Principal,applicationId:string,documentId:string,input:unknown){
 await commercialPermission(env,user,'review');
 const d=z.object({status:z.enum(['released','rejected']),note:z.string().min(10).max(1200)}).parse(input);
 const app=await statement(env.DB,'SELECT flow_id,status FROM commercial_applications WHERE id=?',applicationId).first<{flow_id:string;status:string}>();assert(app&&!['closed','withdrawn','expired'].includes(app.status),409,'COMMERCIAL_DOCUMENT_LOCKED','Document review is closed.');
 const doc=await statement(env.DB,'SELECT scan_status FROM commercial_application_evidence WHERE id=? AND application_id=?',documentId,applicationId).first<{scan_status:string}>();
 assert(doc&&(d.status!=='released'||doc.scan_status==='clean'),409,'COMMERCIAL_CLEAN_SCAN_REQUIRED','An authenticated clean scanner verdict is required.');
 await env.DB.batch([statement(env.DB,"UPDATE commercial_application_evidence SET review_status=?,reviewed_by=? WHERE id=? AND application_id=? AND review_status='quarantined'",d.status,user.id,documentId,applicationId),guard(env),
  await commercialEvent(env,applicationId,app.flow_id,'document_reviewed',{documentId,status:d.status,note:d.note},undefined,user.id),clearGuard(env)]);
 return {reviewed:true};
}
export async function downloadCommercialEvidence(env:Env,user:Principal,applicationId:string,documentId:string){
 await commercialPermission(env,user,'review');
 const doc=await statement(env.DB,"SELECT object_key,metadata_envelope FROM commercial_application_evidence WHERE id=? AND application_id=? AND scan_status='clean' AND review_status IN('quarantined','released')",documentId,applicationId).first<{object_key:string;metadata_envelope:string}>();assert(doc,404,'COMMERCIAL_DOCUMENT_UNAVAILABLE','Document unavailable until a clean scan.');
 const object=await env.RESTRICTED_DOCUMENTS.get(doc.object_key);assert(object,404,'COMMERCIAL_DOCUMENT_UNAVAILABLE','Document unavailable.');
 const metadata=await unseal<{filename:string;type:string}>(env.DATA_ENCRYPTION_KEY,'commercial-evidence:'+documentId,doc.metadata_envelope);
 await statement(env.DB,'INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)',uid('aud'),user.id,'commercial_evidence.downloaded','commercial_application',applicationId,JSON.stringify({documentId}),now()).run();
 return new Response(object.body,{headers:{'Content-Type':metadata.type,'Content-Disposition':'attachment; filename="'+metadata.filename+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
export async function prepareCommercialReferral(env:Env,user:Principal,applicationId:string,version:number,reviewReference:string,manualReviewConfirmed:boolean){
 await commercialPermission(env,user,'review');await commercialGate(env);
 const app=await statement(env.DB,'SELECT * FROM commercial_applications WHERE id=?',applicationId).first<AppRow>();assert(app&&app.status==='submitted'&&app.version===version,409,'COMMERCIAL_REFERRAL_STATE','Review the current submitted application.');
 assert(!app.privacy_hold_until||app.privacy_hold_until<=now(),409,'COMMERCIAL_PRIVACY_HOLD','Resolve the privacy hold.');
 const flow=await commercialFlow(env,app.flow_id),submission=await statement(env.DB,'SELECT id FROM commercial_application_submissions WHERE application_id=? ORDER BY created_at DESC,id DESC LIMIT 1',app.id).first<{id:string}>();assert(submission,409,'COMMERCIAL_SUBMISSION_REQUIRED','A sealed submission is required.');
 z.string().trim().min(8).max(240).parse(reviewReference);
 const sealed=await statement(env.DB,'SELECT snapshot_envelope FROM commercial_application_submissions WHERE id=?',submission.id).first<{snapshot_envelope:string}>();
 const snapshot=await unseal<{manualReview:string[]}>(env.DATA_ENCRYPTION_KEY,'commercial-submission:'+submission.id,sealed!.snapshot_envelope);
 assert(!snapshot.manualReview.length||manualReviewConfirmed,422,'COMMERCIAL_MANUAL_REVIEW_REQUIRED','Document completion of the flagged financial or legal-structure review before referral.');
 assert(!await statement(env.DB,"SELECT id FROM commercial_application_evidence WHERE application_id=? AND (scan_status!='clean' OR review_status!='released') LIMIT 1",app.id).first(),409,'COMMERCIAL_EVIDENCE_NOT_READY','All files require clean scan and authorised review.');
 const key='commercial:'+submission.id,existing=await statement(env.DB,'SELECT id,status FROM commercial_application_referrals WHERE idempotency_key=?',key).first<{id:string;status:string}>();if(existing)return existing;
 const id=uid('car');
 await env.DB.batch([statement(env.DB,'INSERT INTO commercial_application_referrals(id,application_id,submission_id,recipient_hash,idempotency_key,prepared_by,prepared_at) VALUES(?,?,?,?,?,?,?)',id,app.id,submission.id,flow.recipient_hash,key,user.id,now()),
  await commercialEvent(env,app.id,flow.id,'referral_prepared',{referralId:id,submissionId:submission.id,reviewReference,manualReviewConfirmed},undefined,user.id)]);
 return {id,status:'prepared'};
}
export async function reconcileCommercialReferral(env:Env,user:Principal,referralId:string,input:unknown){
 await commercialPermission(env,user,'review');
 const d=z.object({receipt:z.string().max(8000),timestamp:z.string(),signature:z.string(),reference:z.string().min(8).max(240)}).parse(input);
 await verifyScanCallback(env.COMMERCIAL_HANDOFF_SECRET??'',d.receipt,d.timestamp,d.signature);
 const r=await statement(env.DB,"SELECT r.*,a.flow_id,a.status AS application_status FROM commercial_application_referrals r JOIN commercial_applications a ON a.id=r.application_id WHERE r.id=? AND r.status IN('uncertain','accepted')",referralId).first<{id:string;application_id:string;flow_id:string;status:string;idempotency_key:string;recipient_hash:string;application_status:string}>();
 assert(r,409,'COMMERCIAL_RECONCILIATION_STATE','Only an uncertain or accepted referral can be reconciled.');
 const proof=z.object({outcome:z.enum(['accepted','bounced']),idempotencyKey:z.literal(r.idempotency_key),recipientHash:z.literal(r.recipient_hash),messageReference:z.string().min(8).max(240)}).parse(JSON.parse(d.receipt));
 const flow=await commercialFlow(env,r.flow_id,false);assert(flow.recipient_hash===r.recipient_hash,409,'COMMERCIAL_RECIPIENT_CHANGED','Recipient changed.');
 if(r.status==='accepted'&&proof.outcome==='accepted')return {reconciled:true,replayed:true,status:'accepted',automaticRetry:false};
 await env.DB.batch([
  statement(env.DB,'UPDATE commercial_application_referrals SET status=?,receipt_envelope=? WHERE id=? AND status=?',proof.outcome,await seal(env.DATA_ENCRYPTION_KEY,'commercial-referral:'+r.id,{...proof,reconciliationReference:d.reference}),r.id,r.status),guard(env),
  ...(proof.outcome==='accepted'&&r.application_status==='submitted'?[statement(env.DB,"UPDATE commercial_applications SET status='referred',version=version+1,updated_at=? WHERE id=? AND status='submitted' AND (privacy_hold_until IS NULL OR privacy_hold_until<=?)",now(),r.application_id,now()),guard(env)]:[]),
  ...(proof.outcome==='bounced'?[statement(env.DB,"UPDATE commercial_applications SET status='blocked',version=version+1,updated_at=? WHERE id=?",now(),r.application_id)]:[]),
  await commercialEvent(env,r.application_id,r.flow_id,'referral_reconciled',{referralId:r.id,outcome:proof.outcome,reference:d.reference,automaticRetry:false},undefined,user.id),clearGuard(env)]);
 return {reconciled:true,status:proof.outcome,automaticRetry:false};
}
export async function dispatchCommercialReferral(env:Env,user:Principal,referralId:string){
 await commercialPermission(env,user,'review');await commercialGate(env);
 const r=await statement(env.DB,'SELECT r.*,a.flow_id,a.status AS application_status,a.privacy_hold_until,s.sha256 AS snapshot_hash FROM commercial_application_referrals r JOIN commercial_applications a ON a.id=r.application_id JOIN commercial_application_submissions s ON s.id=r.submission_id WHERE r.id=?',referralId).first<{id:string;application_id:string;submission_id:string;recipient_hash:string;idempotency_key:string;status:string;flow_id:string;application_status:string;privacy_hold_until:string|null;snapshot_hash:string}>();
 assert(r,404,'COMMERCIAL_REFERRAL_UNAVAILABLE','Referral unavailable.');
 if(r.status==='accepted')return {accepted:true,replayed:true};
 assert(r.status==='prepared'&&r.application_status==='submitted'&&(!r.privacy_hold_until||r.privacy_hold_until<=now()),409,'COMMERCIAL_REFERRAL_HELD','Referral is held or requires reconciliation. Do not resend uncertain deliveries.');
 const flow=await commercialFlow(env,r.flow_id);assert(r.recipient_hash===flow.recipient_hash,409,'COMMERCIAL_RECIPIENT_CHANGED','Recipient changed.');const config=await flowConfig(env,flow);
 const endpoint=checkedHttpsEndpoint(env.COMMERCIAL_HANDOFF_ENDPOINT,env.COMMERCIAL_HANDOFF_ALLOWED_HOST);assert(endpoint,503,'COMMERCIAL_HANDOFF_UNAVAILABLE','Private provider unavailable.');
 const token=randomToken();
 await env.DB.batch([statement(env.DB,"UPDATE commercial_application_referrals SET status='sending' WHERE id=? AND status='prepared'",r.id),guard(env),
  statement(env.DB,'INSERT INTO commercial_referral_grants(token_hash,referral_id,recipient_hash,expires_at) VALUES(?,?,?,?)',await digest(token),r.id,r.recipient_hash,new Date(Date.now()+10*60000).toISOString()),clearGuard(env)]);
 const payload={contractVersion:'proinspect-commercial-handoff-v1',idempotencyKey:r.idempotency_key,recipient:config.recipient,recipientHash:r.recipient_hash,submissionHash:r.snapshot_hash,
  privateRetrieval:env.APP_ORIGIN+'/api/internal/commercial-referrals/'+token,expiresInSeconds:600,noEmailAttachments:true};
 const raw=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000));
 try{
  const response=await fetch(endpoint.href,{method:'POST',headers:{'Content-Type':'application/json','X-ProInspect-Time':timestamp,'X-ProInspect-Signature':await signature(env.COMMERCIAL_HANDOFF_SECRET!,timestamp,raw),'Idempotency-Key':r.idempotency_key},body:raw,redirect:'manual',signal:AbortSignal.timeout(15000)});
  const receiptRaw=await smallResponse(response);
  assert(response.ok,502,'COMMERCIAL_PROVIDER_PENDING','Provider has not confirmed acceptance.');
  await verifyScanCallback(env.COMMERCIAL_HANDOFF_SECRET!,receiptRaw,response.headers.get('X-ProInspect-Time')??'',response.headers.get('X-ProInspect-Signature')??'');
  const receipt=z.object({accepted:z.literal(true),idempotencyKey:z.literal(r.idempotency_key),recipientHash:z.literal(r.recipient_hash),messageReference:z.string().min(8).max(240)}).parse(JSON.parse(receiptRaw));
  await env.DB.batch([statement(env.DB,"UPDATE commercial_application_referrals SET status='accepted',receipt_envelope=? WHERE id=? AND status='sending'",await seal(env.DATA_ENCRYPTION_KEY,'commercial-referral:'+r.id,receipt),r.id),guard(env),
   statement(env.DB,"UPDATE commercial_applications SET status='referred',version=version+1,updated_at=? WHERE id=? AND status='submitted' AND (privacy_hold_until IS NULL OR privacy_hold_until<=?)",now(),r.application_id,now()),guard(env),
   await commercialEvent(env,r.application_id,flow.id,'referral_accepted',{referralId:r.id,messageReference:receipt.messageReference,inboxDeliveryConfirmed:false},undefined,user.id),clearGuard(env)]);
  return {accepted:true,inboxDeliveryConfirmed:false};
 }catch{
  await env.DB.batch([statement(env.DB,"UPDATE commercial_application_referrals SET status='uncertain' WHERE id=? AND status='sending'",r.id),
   await commercialEvent(env,r.application_id,flow.id,'referral_uncertain',{referralId:r.id,automaticRetry:false},undefined,user.id)]);
  return {accepted:false,status:'uncertain',requiresReconciliation:true};
 }
}
/** Authenticated provider retrieval: a short-lived grant plus signed exact-path request. */
export async function retrieveCommercialReferral(env:Env,request:Request,token:string,documentId?:string){
 await commercialGate(env);
 const path=new URL(request.url).pathname;
 await verifyScanCallback(env.COMMERCIAL_HANDOFF_SECRET??'',path,request.headers.get('X-ProInspect-Time')??'',request.headers.get('X-ProInspect-Signature')??'');
 const grant=await statement(env.DB,"SELECT r.*,a.flow_id,a.status AS application_status,a.privacy_hold_until FROM commercial_referral_grants g JOIN commercial_application_referrals r ON r.id=g.referral_id JOIN commercial_applications a ON a.id=r.application_id WHERE g.token_hash=? AND g.expires_at>? AND g.recipient_hash=r.recipient_hash AND r.status IN('sending','accepted')",await digest(token),now()).first<{id:string;application_id:string;submission_id:string;recipient_hash:string;flow_id:string;application_status:string;privacy_hold_until:string|null}>();
 assert(grant&&!['withdrawn','closed','blocked'].includes(grant.application_status)&&(!grant.privacy_hold_until||grant.privacy_hold_until<=now()),404,'COMMERCIAL_GRANT_UNAVAILABLE','Private referral unavailable.');
 const flow=await commercialFlow(env,grant.flow_id);assert(flow.recipient_hash===grant.recipient_hash,404,'COMMERCIAL_GRANT_UNAVAILABLE','Private referral unavailable.');
 const submission=await statement(env.DB,'SELECT snapshot_envelope,sha256 FROM commercial_application_submissions WHERE id=? AND application_id=?',grant.submission_id,grant.application_id).first<{snapshot_envelope:string;sha256:string}>();assert(submission,404,'COMMERCIAL_GRANT_UNAVAILABLE','Private referral unavailable.');
 const snapshot=await unseal<{documents:Array<{id:string;sha256:string}>}>(env.DATA_ENCRYPTION_KEY,'commercial-submission:'+grant.submission_id,submission.snapshot_envelope);
 if(!documentId)return Response.json({snapshot,sha256:submission.sha256},{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 const permitted=snapshot.documents.find(d=>d.id===documentId);assert(permitted,404,'COMMERCIAL_DOCUMENT_UNAVAILABLE','Document unavailable.');
 const doc=await statement(env.DB,"SELECT object_key,metadata_envelope FROM commercial_application_evidence WHERE id=? AND application_id=? AND sha256=? AND scan_status='clean' AND review_status='released'",documentId,grant.application_id,permitted.sha256).first<{object_key:string;metadata_envelope:string}>();assert(doc,404,'COMMERCIAL_DOCUMENT_UNAVAILABLE','Document unavailable.');
 const object=await env.RESTRICTED_DOCUMENTS.get(doc.object_key);assert(object,404,'COMMERCIAL_DOCUMENT_UNAVAILABLE','Document unavailable.');
 return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
