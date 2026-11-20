import { assert,statement,now,type Env } from '../../../../packages/database/types';
import { checkedHttpsEndpoint,nextRetry } from '../../../../packages/marketing/rental-governance';
import { digest } from '../../../../packages/auth/crypto';
import { releaseFeatureReady } from './release-governance.server';
import {managedIntakeRelease,isScannedManagedApplication} from './managed-rental-intake.server';
import {recordRentalScan} from './rental-malware.server';
import {MAX_DOCUMENT_BYTES,scanMetadata,verifyPrivateScanResponse} from '../../../../packages/marketing/private-scan';

/** Private scanner adapter. A remote scanner must return a signed callback through
 * /api/internal/rental-document-scan; HTTP 200 alone never clears quarantine.
 * Disable until a provider with approved privacy terms and authenticated HTTPS
 * transport is provisioned. Do not emit document content into logs. */
export async function dispatchRentalScans(env:Env){
 if(!await releaseFeatureReady(env,'rental_scanner')||!await releaseFeatureReady(env,'rental'))return;
 const release=await managedIntakeRelease(env),privateMode=release?.intake_mode==='scanned_documents';
 const endpoint=checkedHttpsEndpoint(env.RENTAL_SCANNER_ENDPOINT,env.RENTAL_SCANNER_ALLOWED_HOST);
 const secret=env.RENTAL_SCANNER_OUTBOUND_SECRET;
 assert(privateMode?env.PRIVATE_DOCUMENT_SCANNER&&release.scanner_public_jwk:endpoint&&secret&&secret.length>=32,503,'SCAN_TRANSPORT_UNAVAILABLE','Private scanner is not configured.');
 const due=(await statement(env.DB,"SELECT j.document_id,j.attempts,d.application_id,d.object_key,d.sha256,d.content_type,a.consent_version FROM rental_document_scan_jobs j JOIN rental_application_documents d ON d.id=j.document_id JOIN rental_applications a ON a.id=d.application_id WHERE j.completed_at IS NULL AND j.attempts<8 AND j.next_attempt_at<=? AND d.scan_status='pending' AND d.review_status='quarantined' AND (?=0 OR INSTR(a.consent_version,'|managed-documents:')>0) ORDER BY j.next_attempt_at LIMIT 3",now(),privateMode?1:0)
  .all<{document_id:string;attempts:number;application_id:string;object_key:string;sha256:string;content_type:string;consent_version:string}>()).results;
 for(const job of due){
  if(privateMode&&!isScannedManagedApplication(job.consent_version))continue;
  const tries=job.attempts+1;
  const claim=await statement(env.DB,'UPDATE rental_document_scan_jobs SET attempts=?,last_attempt_at=?,next_attempt_at=? WHERE document_id=? AND attempts=? AND completed_at IS NULL',
   tries,now(),nextRetry(tries),job.document_id,job.attempts).run();
  if(claim.meta.changes!==1)continue;
  try{
   const obj=await env.RESTRICTED_DOCUMENTS.get(job.object_key);
   assert(obj,409,'SCAN_FILE_MISSING','Quarantined file not available.');
   assert(obj.size>=1&&obj.size<=MAX_DOCUMENT_BYTES,409,'SCAN_FILE_SIZE','Quarantined file size is invalid.');
   const bytes=await obj.arrayBuffer();
   assert(await digest(bytes)===job.sha256,409,'SCAN_FILE_CHANGED','Document digest changed.');
   if(privateMode){
    const meta=scanMetadata.parse({nonce:crypto.randomUUID(),documentId:job.document_id,sha256:job.sha256,sizeBytes:bytes.byteLength,contentType:job.content_type});
    const response=await env.PRIVATE_DOCUMENT_SCANNER!.fetch('https://private-scanner/scan',{method:'POST',headers:{
     'Content-Type':'application/octet-stream','X-ProInspect-Scan-Nonce':meta.nonce,'X-ProInspect-Scan-Metadata':btoa(JSON.stringify(meta))
    },body:bytes,signal:AbortSignal.timeout(160000)});
    const evidence=await verifyPrivateScanResponse(response,JSON.parse(release!.scanner_public_jwk!),meta.nonce,meta,Date.now(),{sourceSha:release!.scanner_source_sha!,baseImageDigest:release!.scanner_image_digest!});
    await recordRentalScan(env,{eventId:evidence.eventId,applicationId:job.application_id,documentId:job.document_id,sha256:job.sha256,
     verdict:evidence.verdict!,engine:evidence.engine.engineVersion,
     reference:'private:'+evidence.keyId+':'+evidence.engine.databaseVersion+':'+evidence.engine.definitionsUpdatedAt});
    continue;
   }
   const timestamp=Math.floor(Date.now()/1000).toString(),meta=JSON.stringify({
    documentId:job.document_id,applicationId:job.application_id,sha256:job.sha256,contentType:job.content_type,
    callbackUrl:env.APP_ORIGIN+'/api/internal/rental-document-scan'
   });
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret!),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   const payload=timestamp+'.'+meta+'.'+job.sha256;
   const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload)))].map(x=>x.toString(16).padStart(2,'0')).join('');
   const res=await fetch(endpoint!.href,{method:'POST',headers:{
    'Content-Type':'application/octet-stream','X-ProInspect-Scan-Metadata':btoa(meta),
    'X-ProInspect-Scan-Time':timestamp,'X-ProInspect-Scan-Signature':'sha256='+sig
   },body:bytes,signal:AbortSignal.timeout(25000)});
   if(!res.ok)throw Error('SCAN_PROVIDER_REJECTED');
   // Result remains quarantined until separately attested clean callback arrives.
  }catch(error){
   await statement(env.DB,'UPDATE rental_document_scan_jobs SET last_error_code=? WHERE document_id=?',
    error instanceof Error&&error.message==='SCAN_FILE_CHANGED'?'SCAN_FILE_CHANGED':'SCANNER_TRANSPORT_FAILED',job.document_id).run();
  }
 }
}
