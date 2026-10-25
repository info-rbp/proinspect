import { assert,statement,now,type Env } from '../../../../packages/database/types';
import { checkedHttpsEndpoint,nextRetry } from '../../../../packages/marketing/rental-governance';
import { digest,unseal } from '../../../../packages/auth/crypto';
import type { Form18Answers } from '../../../../packages/marketing/form18';

/** HMAC-signed Google Apps Script transport, disabled without explicit opt-in.
 * Sensitive scanned files are not attached; only approved staff can download them.
 * A mail service acceptance receipt is not inbox delivery confirmation. */
export async function dispatchRentalHandoffs(env:Env){
 if(env.RENTAL_APPS_SCRIPT_ENABLED!=='true')return;
 const endpoint=checkedHttpsEndpoint(env.RENTAL_APPS_SCRIPT_ENDPOINT,env.RENTAL_APPS_SCRIPT_ALLOWED_HOST);
 const secret=env.RENTAL_APPS_SCRIPT_SECRET;
 assert(endpoint&&secret&&secret.length>=32,503,'HANDOFF_NOT_CONFIGURED','Approved Apps Script integration is missing.');
 const due=(await statement(env.DB,"SELECT h.*,a.status AS application_status,a.privacy_hold_until,s.snapshot_envelope,l.application_recipient_email,l.rental_approval_state FROM rental_application_handoffs h JOIN rental_applications a ON a.id=h.application_id JOIN rental_application_submissions s ON s.id=h.submission_id JOIN leasing_listings l ON l.id=a.listing_id WHERE h.status='awaiting_script' AND (h.next_attempt_at IS NULL OR h.next_attempt_at<=?) AND h.attempt_count<8 ORDER BY h.staged_at LIMIT 5",now())
  .all<Record<string,any>>()).results;
 for(const h of due){
  const next=h.attempt_count+1;
  const claimed=await statement(env.DB,"UPDATE rental_application_handoffs SET attempt_count=?,next_attempt_at=? WHERE id=? AND attempt_count=? AND status='awaiting_script'",
   next,nextRetry(next),h.id,h.attempt_count).run();
  if(claimed.meta.changes!==1)continue;
  try{
   assert(h.application_status==='ready_for_handoff'&&h.rental_approval_state==='approved',409,'HANDOFF_BLOCKED','Application not authorised.');
   assert(!h.privacy_hold_until||h.privacy_hold_until<=now(),409,'HANDOFF_HOLD','Active privacy hold.');
   const recipient=await unseal<{recipient:string}>(env.DATA_ENCRYPTION_KEY,'rental-handoff:'+h.id,h.recipient_envelope);
   assert(recipient.recipient===h.application_recipient_email,409,'HANDOFF_RECIPIENT_CHANGED','Application recipient changed.');
   const snapshot=await unseal<Record<string,any>>(env.DATA_ENCRYPTION_KEY,'rental-submission:'+h.submission_id,h.snapshot_envelope);
   const pending=await statement(env.DB,"SELECT id FROM rental_application_documents WHERE application_id=? AND review_status='quarantined'",h.application_id).first();
   assert(!pending,409,'DOCUMENTS_UNREVIEWED','Not all documents have been reviewed.');
   const body=JSON.stringify({contractVersion:'proinspect-rental-email-v1',handoffId:h.id,
    idempotencyKey:h.idempotency_key,recipient:recipient.recipient,reference:snapshot.reference,
    property:snapshot.property,submittedAt:snapshot.submittedAt,applicants:snapshot.applicants,
    notices:snapshot.notice,
    documents:(await statement(env.DB,"SELECT id,filename,category,sha256 FROM rental_application_documents WHERE application_id=? AND review_status='released' AND scan_status='clean'",
     h.application_id).all()).results.map((d:any)=>({reference:d.id,filename:d.filename,category:d.category,sha256:d.sha256}))});
   const stamp=Math.floor(Date.now()/1000).toString();
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(stamp+'.'+body)))].map(x=>x.toString(16).padStart(2,'0')).join('');
   const res=await fetch(endpoint.href,{method:'POST',headers:{'Content-Type':'application/json',
    'X-ProInspect-Time':stamp,'X-ProInspect-Signature':'sha256='+sig},body,signal:AbortSignal.timeout(20000)});
   if(!res.ok)throw Error('SCRIPT_TRANSPORT');
   const receipt=await res.json() as {accepted?:boolean;idempotencyKey?:string;messageReference?:string};
   assert(receipt.accepted===true&&receipt.idempotencyKey===h.idempotency_key&&typeof receipt.messageReference==='string'&&receipt.messageReference.length>=6,
    502,'SCRIPT_RECEIPT_INVALID','Provider did not confirm mail submission.');
   const t=now();
   await env.DB.batch([
    statement(env.DB,'INSERT OR IGNORE INTO rental_handoff_receipts(id,handoff_id,idempotency_key,recipient_hash,message_reference,accepted_at) VALUES(?,?,?,?,?,?)',
     'rrp_'+h.id,h.id,h.idempotency_key,h.recipient_hash,receipt.messageReference,t),
    statement(env.DB,"UPDATE rental_application_handoffs SET status='delivered',delivery_reference=?,delivered_at=? WHERE id=? AND status='awaiting_script'",
     receipt.messageReference,t,h.id),
    statement(env.DB,"UPDATE rental_applications SET status='forwarded',forwarded_at=?,updated_at=?,version=version+1 WHERE id=? AND status='ready_for_handoff'",
     t,t,h.application_id)
   ]);
  }catch{
   await statement(env.DB,'UPDATE rental_application_handoffs SET last_error_code=? WHERE id=?','DELIVERY_RETRY_REQUIRED',h.id).run();
  }
 }
}
