import {z} from 'zod';
import {assert,statement,now,uid,type Env} from '../../../../packages/database/types';
import {digest,seal,unseal,randomToken} from '../../../../packages/auth/crypto';
import {operationsWrite} from '../../../../packages/authorization/server';
import type {Principal} from '../../../../packages/domain/index';
import {documentCategorySchema} from '../../../../packages/marketing/form18';
import {PUBLIC_COMPANY} from '../../../../packages/marketing/public-facts';
import {TEMPORARY_RENTAL_POLICY_VERSION} from '../../../../packages/marketing/temporary-rental-policy';
import {mailEvent} from '../../../../packages/notifications/server';
import {authorisedRentalPackage,packageRecipientHash} from '../../../../packages/notifications/rental-package';
import {isTemporaryManagedApplication,managedApplicationListing,managedIntakeRelease} from './managed-rental-intake.server';

type Metadata={filename:string;category:string;contentType:string};
type TemporaryDocument={id:string;application_id:string;applicant_id:string;object_key:string;metadata_envelope:string|null;size_bytes:number;sha256:string;state:string;stored_at:string|null;uploaded_at:string;delete_after:string;reviewed_at:string|null};
const deadline=(days:number)=>new Date(Date.now()+days*86400000).toISOString();
const editStates=['draft','information_requested'];
function administrator(user:Principal){operationsWrite(user);assert(user.staffRole==='administrator',403,'DOCUMENT_ADMIN_REQUIRED','An authorised administrator must perform document security review and sharing.');}
export async function hasTemporaryDocuments(env:Env){return Boolean(await statement(env.DB,"SELECT name FROM sqlite_schema WHERE type='table' AND name='rental_temporary_documents'").first());}
async function audit(env:Env,appId:string,actor:string,action:string,details:Record<string,unknown>={}){
 return statement(env.DB,"INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?,?,'rental_application',?,?,?)",uid('aud'),actor,'rental_temporary.'+action,appId,JSON.stringify(details),now());
}
async function encryptionKey(env:Env){return crypto.subtle.importKey('raw',Uint8Array.from(atob(env.DATA_ENCRYPTION_KEY),c=>c.charCodeAt(0)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function encryptFile(env:Env,id:string,sha:string,bytes:Uint8Array<ArrayBuffer>){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('temporary-rental:'+id+':'+sha)},await encryptionKey(env),bytes));
 const output=new Uint8Array(12+encrypted.length);output.set(iv);output.set(encrypted,12);return output;
}
async function readFile(env:Env,doc:TemporaryDocument){
 const object=await env.RESTRICTED_DOCUMENTS.get(doc.object_key);assert(object,410,'DOCUMENT_EXPIRED','This document is no longer available.');
 assert(object.size===doc.size_bytes+28&&object.size<=5242908,409,'DOCUMENT_INTEGRITY','Document storage verification failed.');
 const bytes=new Uint8Array(await object.arrayBuffer());
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12),additionalData:new TextEncoder().encode('temporary-rental:'+doc.id+':'+doc.sha256)},await encryptionKey(env),bytes.subarray(12));
 assert(await digest(plain)===doc.sha256,409,'DOCUMENT_INTEGRITY','Document storage verification failed.');return plain;
}
function signature(type:string,b:Uint8Array){
 if(type==='application/pdf')return b.length>10&&new TextDecoder().decode(b.subarray(0,5))==='%PDF-'&&new TextDecoder().decode(b.subarray(Math.max(0,b.length-1024))).includes('%%EOF');
 if(type==='image/jpeg')return b.length>4&&b[0]===255&&b[1]===216&&b[2]===255&&b[b.length-2]===255&&b[b.length-1]===217;
 if(type==='image/png')return b.length>24&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);
 return type==='image/webp'&&b.length>16&&new TextDecoder().decode(b.subarray(0,4))==='RIFF'&&new TextDecoder().decode(b.subarray(8,12))==='WEBP';
}
export async function temporaryDocumentList(env:Env,applicationId:string,applicantId?:string){
 if(!await hasTemporaryDocuments(env))return [];
 const rows=(await statement(env.DB,"SELECT * FROM rental_temporary_documents WHERE application_id=? AND (? IS NULL OR applicant_id=?) AND state!='purged' ORDER BY uploaded_at,id",applicationId,applicantId??null,applicantId??null).all<TemporaryDocument>()).results;
 return Promise.all(rows.map(async r=>({id:r.id,applicant_id:r.applicant_id,size_bytes:r.size_bytes,sha256:r.sha256,state:r.state,stored_at:r.stored_at,uploaded_at:r.uploaded_at,delete_after:r.delete_after,reviewed_at:r.reviewed_at,...await unseal<Metadata>(env.DATA_ENCRYPTION_KEY,'temporary-document:'+r.id,r.metadata_envelope!)})));
}
export async function uploadTemporaryDocument(env:Env,context:{person:{id:string};app:{id:string;status:string;consent_version:string};l:{id:string}},form:FormData){
 const {person,app,l}=context;
 assert((await managedIntakeRelease(env))?.intake_mode==='temporary_documents'&&isTemporaryManagedApplication(app.consent_version)&&await managedApplicationListing(env,l.id),503,'DOCUMENT_UPLOADS_DISABLED','Temporary document uploads are not enabled for this application.');
 assert(editStates.includes(app.status),409,'UPLOAD_CLOSED','Documents cannot be changed after submission.');
 const file=form.get('file'),category=documentCategorySchema.parse(form.get('category'));
 assert(file instanceof File&&file.size>0&&file.size<=5242880,413,'DOCUMENT_SIZE','Choose a supporting file up to 5 MB.');
 const extensions:Record<string,RegExp>={'application/pdf':/\.pdf$/i,'image/jpeg':/\.jpe?g$/i,'image/png':/\.png$/i,'image/webp':/\.webp$/i};
 assert(extensions[file.type]?.test(file.name)&&!/[\x00-\x1f]/.test(file.name),422,'DOCUMENT_TYPE','Choose a PDF, JPEG, PNG or WebP file with its matching file extension.');
 const bytes=new Uint8Array(await file.arrayBuffer());assert(signature(file.type,bytes),422,'DOCUMENT_INVALID','The file contents do not match the selected format.');
 const sha=await digest(bytes.buffer),id=uid('rtd'),objectKey='rental-temporary/'+crypto.randomUUID();
 const duplicate=await statement(env.DB,"SELECT id FROM rental_temporary_documents WHERE applicant_id=? AND sha256=? AND state!='purged'",person.id,sha).first();
 assert(!duplicate,409,'DOCUMENT_DUPLICATE','This file has already been uploaded.');
 const count=await statement(env.DB,"SELECT (SELECT COUNT(*) FROM rental_temporary_documents WHERE applicant_id=? AND state!='purged') AS n,COALESCE(SUM(size_bytes),0) AS size FROM rental_temporary_documents WHERE application_id=? AND state!='purged'",person.id,app.id).first<{n:number;size:number}>();
 assert((count?.n??0)<10,422,'DOCUMENT_LIMIT','Each applicant may upload up to ten active documents.');
 assert((count?.size??0)+file.size<=52428800,422,'DOCUMENT_STORAGE_LIMIT','This application has reached its 50 MB document allowance.');
 const metadata=await seal(env.DATA_ENCRYPTION_KEY,'temporary-document:'+id,{filename:file.name.replace(/[^a-zA-Z0-9 .()_-]/g,'_').slice(-100),category,contentType:file.type});
 // Reserve the tracked object key BEFORE storage. Cleanup can retry a failed or
 // interrupted put without leaving an untracked applicant object in R2.
 await statement(env.DB,'INSERT INTO rental_temporary_documents(id,application_id,applicant_id,object_key,metadata_envelope,size_bytes,sha256,uploaded_at,delete_after) VALUES(?,?,?,?,?,?,?,?,?)',id,app.id,person.id,objectKey,metadata,file.size,sha,now(),deadline(14)).run();
 try{await env.RESTRICTED_DOCUMENTS.put(objectKey,await encryptFile(env,id,sha,bytes),{httpMetadata:{contentType:'application/octet-stream'}});}
 catch(error){await statement(env.DB,"UPDATE rental_temporary_documents SET state='purging',delete_after=? WHERE id=?",now(),id).run();throw error;}
 const stored=await statement(env.DB,"UPDATE rental_temporary_documents SET stored_at=? WHERE id=? AND state='quarantined' AND EXISTS(SELECT 1 FROM rental_applications a JOIN rental_applicants p ON p.application_id=a.id WHERE a.id=? AND p.id=? AND p.state!='removed' AND a.status IN('draft','information_requested'))",now(),id,app.id,person.id).run();
 if(stored.meta.changes!==1){await env.RESTRICTED_DOCUMENTS.delete(objectKey);await purgeTemporaryDocument(env,id);assert(false,409,'UPLOAD_CLOSED','The application changed while uploading. Your file was removed.');}
 return {uploaded:true,quarantined:true};
}
async function purgeTemporaryDocument(env:Env,id:string){
 const doc=await statement(env.DB,"UPDATE rental_temporary_documents SET state='purging' WHERE id=? AND state!='purged' RETURNING *",id).first<TemporaryDocument>();
 if(!doc)return;
 await env.RESTRICTED_DOCUMENTS.delete(doc.object_key);
 await statement(env.DB,"UPDATE rental_temporary_documents SET state='purged',metadata_envelope=NULL,security_evidence_envelope=NULL,purged_at=? WHERE id=? AND state='purging'",now(),id).run();
}
export async function removeTemporaryDocument(env:Env,appId:string,applicantId:string,id:string){
 const row=await statement(env.DB,"UPDATE rental_temporary_documents SET state='purging' WHERE id=? AND application_id=? AND applicant_id=? AND state!='purged' AND EXISTS(SELECT 1 FROM rental_applications a WHERE a.id=? AND a.status IN('draft','information_requested') AND (a.privacy_hold_until IS NULL OR a.privacy_hold_until<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))) RETURNING id",id,appId,applicantId,appId).first();
 assert(row,409,'DOCUMENT_REMOVE_CLOSED','This file cannot be removed from the current application state.');await purgeTemporaryDocument(env,id);return {deleted:true};
}
export async function purgeTemporaryApplication(env:Env,appId:string,applicantId?:string){
 if(!await hasTemporaryDocuments(env))return;
 const docs=(await statement(env.DB,"SELECT id FROM rental_temporary_documents WHERE application_id=? AND (? IS NULL OR applicant_id=?) AND state!='purged'",appId,applicantId??null,applicantId??null).all<{id:string}>()).results;
 for(const doc of docs)await purgeTemporaryDocument(env,doc.id);
 if(!applicantId){
  // Revoke queued access and clear sensitive outbox payloads before deleting
  // references during an approved full application purge.
  await statement(env.DB,"UPDATE outbox_events SET status='failed',envelope='{}',error_code='RENTAL_PACKAGE_ERASED',lease_token=NULL,lease_until=NULL WHERE id IN(SELECT outbox_id FROM rental_temporary_packages WHERE application_id=?)",appId).run();
  await statement(env.DB,'DELETE FROM rental_temporary_packages WHERE application_id=?',appId).run();
 }
 await statement(env.DB,'DELETE FROM rental_temporary_documents WHERE application_id=? AND (? IS NULL OR applicant_id=?)',appId,applicantId??null,applicantId??null).run();
}
export async function dispatchTemporaryDocumentRetention(env:Env){
 if(!await hasTemporaryDocuments(env))return;
 // Independent of the upload release flag: disabling new collection must not
 // disable erasure. Holds suppress physical deletion, never normal expiry.
 const rows=(await statement(env.DB,"SELECT d.id FROM rental_temporary_documents d JOIN rental_applications a ON a.id=d.application_id WHERE d.state!='purged' AND d.delete_after<=? AND (a.privacy_hold_until IS NULL OR a.privacy_hold_until<=?) ORDER BY d.delete_after LIMIT 20",now(),now()).all<{id:string}>()).results;
 for(const row of rows){try{await purgeTemporaryDocument(env,row.id);}catch{console.error(JSON.stringify({event:'rental_temporary.purge_retry'}));}}
 await statement(env.DB,"UPDATE outbox_events SET status=CASE WHEN status='sent' THEN 'sent' ELSE 'failed' END,envelope='{}',error_code='RENTAL_PACKAGE_EXPIRED',lease_token=NULL,lease_until=NULL WHERE id IN(SELECT outbox_id FROM rental_temporary_packages WHERE expires_at<=? OR revoked_at IS NOT NULL)",now()).run();
}
export async function temporarySecurityDownload(env:Env,user:Principal,appId:string,id:string,acknowledged:boolean){
 administrator(user);assert(acknowledged,422,'SCAN_ACKNOWLEDGEMENT_REQUIRED','Confirm that this unscanned file will be checked on a managed device.');
 const doc=await statement(env.DB,"SELECT d.* FROM rental_temporary_documents d JOIN rental_applications a ON a.id=d.application_id WHERE d.id=? AND d.application_id=? AND d.state='quarantined' AND d.stored_at IS NOT NULL AND d.delete_after>? AND a.status='submitted' AND (a.privacy_hold_until IS NULL OR a.privacy_hold_until<=?)",id,appId,now(),now()).first<TemporaryDocument>();
 assert(doc,404,'DOCUMENT_UNAVAILABLE','This document is not available for security review.');
 const bytes=await readFile(env,doc),metadata=await unseal<Metadata>(env.DATA_ENCRYPTION_KEY,'temporary-document:'+id,doc.metadata_envelope!);
 await (await audit(env,appId,user.id,'security_download',{documentId:id,unscanned:true})).run();
 return fileResponse(bytes,'UNSCANNED-'+metadata.filename);
}
export async function reviewTemporaryDocument(env:Env,user:Principal,appId:string,id:string,input:unknown){
 administrator(user);
 const d=z.object({decision:z.enum(['approved','rejected']),sha256:z.string().regex(/^[a-f0-9]{64}$/),engine:z.string().trim().min(3).max(100),definitionsAt:z.string().datetime({offset:true}),scannedAt:z.string().datetime({offset:true}),evidenceReference:z.string().trim().min(12).max(300),confirmManagedDevice:z.literal(true),confirmAntivirusResult:z.literal(true)}).parse(input);
 const stamp=now(),clock=Date.now();
 assert(Date.parse(d.scannedAt)<=clock+60000&&Date.parse(d.scannedAt)>=clock-24*3600000&&Date.parse(d.definitionsAt)<=clock+60000&&Date.parse(d.definitionsAt)>=clock-72*3600000,422,'SECURITY_CHECK_STALE','Record a scan from the past 24 hours with antivirus definitions from the past 72 hours.');
 const doc=await statement(env.DB,"SELECT d.* FROM rental_temporary_documents d JOIN rental_applications a ON a.id=d.application_id WHERE d.id=? AND d.application_id=? AND d.state='quarantined' AND d.stored_at IS NOT NULL AND d.delete_after>? AND a.status='submitted' AND (a.privacy_hold_until IS NULL OR a.privacy_hold_until<=?)",id,appId,stamp,stamp).first<TemporaryDocument>();
 assert(doc&&doc.sha256===d.sha256,409,'DOCUMENT_CHANGED','The current file does not match the recorded antivirus check.');
 await env.DB.batch([
  statement(env.DB,"UPDATE rental_temporary_documents SET state=?,security_evidence_envelope=?,reviewed_by=?,reviewed_at=? WHERE id=? AND state='quarantined' AND sha256=? AND delete_after>? AND EXISTS(SELECT 1 FROM rental_applications a WHERE a.id=? AND a.status='submitted' AND (a.privacy_hold_until IS NULL OR a.privacy_hold_until<=?))",d.decision,await seal(env.DATA_ENCRYPTION_KEY,'temporary-security:'+id,{...d,mode:'manual_antivirus',recordedAt:stamp}),user.id,stamp,id,d.sha256,stamp,appId,stamp),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),await audit(env,appId,user.id,'security_review',{documentId:id,decision:d.decision,mode:'manual_antivirus'}),statement(env.DB,'DELETE FROM mutation_guards'),
 ]);return {reviewed:true};
}
export async function stageTemporaryPackage(env:Env,user:Principal,appId:string,input:unknown){
 administrator(user);
 z.object({confirmAuthority:z.literal(true),confirmRecipients:z.literal(true),confirmSecurityReview:z.literal(true)}).parse(input);
 assert((await managedIntakeRelease(env))?.intake_mode==='temporary_documents',503,'TEMPORARY_RELEASE_REQUIRED','The interim document release is not enabled.');
 const app=await statement(env.DB,"SELECT a.*,l.application_recipient_email,l.rental_recipient_verified_at,l.property_id FROM rental_applications a JOIN leasing_listings l ON l.id=a.listing_id WHERE a.id=?",appId).first<{id:string;listing_id:string;status:string;consent_version:string;reference:string;application_recipient_email:string|null;rental_recipient_verified_at:string|null;property_id:string;privacy_hold_until:string|null}>();
 assert(app&&app.status==='submitted'&&isTemporaryManagedApplication(app.consent_version)&&await managedApplicationListing(env,app.listing_id),409,'SHARING_NOT_AVAILABLE','A submitted managed-property application with the current notice is required.');
 assert(!app.privacy_hold_until||app.privacy_hold_until<=now(),409,'PRIVACY_HOLD_ACTIVE','Resolve the privacy hold before sharing.');
 assert(app.application_recipient_email&&app.rental_recipient_verified_at,409,'RECIPIENT_UNVERIFIED','Verify the landlord or representative inbox before sharing.');
 const to=z.string().email().parse(app.application_recipient_email.trim().toLowerCase()),cc=z.string().email().parse((env.OPERATIONS_EMAIL??PUBLIC_COMPANY.email).trim().toLowerCase());
 assert(to!==cc,422,'RECIPIENT_SETTINGS','Configure the landlord and ProInspect copy as separate recipients.');
 const snapshot=await statement(env.DB,'SELECT id FROM rental_application_submissions WHERE application_id=? ORDER BY version DESC LIMIT 1',appId).first<{id:string}>();assert(snapshot,409,'SUBMISSION_REQUIRED','A submitted application record is required.');
 const existing=await statement(env.DB,'SELECT id,outbox_id FROM rental_temporary_packages WHERE application_id=? AND submission_id=?',appId,snapshot.id).first<{id:string;outbox_id:string}>();
 if(existing)return {staged:true,id:existing.id,replayed:true};
 const docs=await temporaryDocumentList(env,appId);
 assert(!docs.some(d=>d.state==='quarantined'||d.state==='purging'||d.state==='approved'&&d.delete_after<=now()),409,'DOCUMENTS_UNREVIEWED','Complete current antivirus review or remove unavailable supporting files before sharing.');
 const management=await statement(env.DB,"SELECT version FROM property_application_management WHERE property_id=? AND provider='proinspect'",app.property_id).first<{version:number}>();assert(management,409,'MANAGEMENT_CHANGED','Property management changed.');
 const id=uid('rtp'),token=randomToken(),outboxId=uid('evt'),stamp=now();
 const job=await mailEvent(env,'rental.temporary.package',{to,cc:[cc],subject:'Private rental application — '+app.reference,heading:'Rental application ready for your review',body:'ProInspect has approved this application package for your authorised tenancy review. Use the private link below. Supporting files were checked manually using antivirus before sharing. The link expires seven days after successful sending. Do not forward it or use it for an unrelated purpose. No documents are attached to this email.',href:env.APP_ORIGIN+'/rental-package/'+token,sensitive:true,rentalPackage:{id}},outboxId);
 await env.DB.batch([
  job,
  statement(env.DB,'INSERT INTO rental_temporary_packages(id,application_id,submission_id,outbox_id,token_hash,recipient_envelope,recipient_hash,cc_hash,management_version,recipient_verified_at,document_ids_json,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,appId,snapshot.id,outboxId,await digest(token),await seal(env.DATA_ENCRYPTION_KEY,'temporary-package-recipient:'+id,{to,cc}),await packageRecipientHash(env,to),await packageRecipientHash(env,cc),management.version,app.rental_recipient_verified_at,JSON.stringify(docs.filter(d=>d.state==='approved').map(d=>d.id)),user.id,stamp,deadline(14)),
  await audit(env,appId,user.id,'package_staged',{packageId:id,submissionId:snapshot.id}),
 ]);return {staged:true,id};
}
export async function temporaryPackageAccess(env:Env,token:string,documentId?:string){
 assert(/^[a-f0-9]{64}$/.test(token)&&await hasTemporaryDocuments(env),404,'PACKAGE_UNAVAILABLE','This private application package is unavailable.');
 const lookup=await statement(env.DB,'SELECT id FROM rental_temporary_packages WHERE token_hash=?',await digest(token)).first<{id:string}>();
 const pkg=lookup?await authorisedRentalPackage(env,lookup.id):null;assert(pkg,410,'PACKAGE_EXPIRED','This application package has expired or access has been revoked.');
 if(documentId){
  assert((JSON.parse(pkg.document_ids_json) as string[]).includes(documentId),404,'DOCUMENT_UNAVAILABLE','Document unavailable.');
  const doc=await statement(env.DB,"SELECT * FROM rental_temporary_documents WHERE id=? AND application_id=? AND state='approved' AND delete_after>?",documentId,pkg.application_id,now()).first<TemporaryDocument>();assert(doc,410,'DOCUMENT_EXPIRED','Document unavailable.');
  const metadata=await unseal<Metadata>(env.DATA_ENCRYPTION_KEY,'temporary-document:'+doc.id,doc.metadata_envelope!);return fileResponse(await readFile(env,doc),metadata.filename);
 }
 const submission=await statement(env.DB,'SELECT snapshot_envelope FROM rental_application_submissions WHERE id=?',pkg.submission_id).first<{snapshot_envelope:string}>();assert(submission,410,'PACKAGE_UNAVAILABLE','Application unavailable.');
 const snapshot=await unseal<Record<string,unknown>>(env.DATA_ENCRYPTION_KEY,'rental-submission:'+pkg.submission_id,submission.snapshot_envelope);
 const documents=(await temporaryDocumentList(env,pkg.application_id)).filter(d=>(JSON.parse(pkg.document_ids_json) as string[]).includes(d.id));
 return {snapshot,documents,expiresAt:pkg.expires_at};
}
export async function controlTemporaryPackage(env:Env,user:Principal,appId:string,id:string,action:'retry'|'revoke'){
 administrator(user);
 const row=await statement(env.DB,'SELECT p.*,o.status AS outbox_status FROM rental_temporary_packages p JOIN outbox_events o ON o.id=p.outbox_id WHERE p.id=? AND p.application_id=?',id,appId).first<{outbox_id:string;outbox_status:string;created_at:string;sent_at:string|null;revoked_at:string|null}>();
 assert(row,404,'PACKAGE_UNAVAILABLE','Package unavailable.');
 if(action==='revoke'){
  await env.DB.batch([
   statement(env.DB,'UPDATE rental_temporary_packages SET revoked_at=COALESCE(revoked_at,?) WHERE id=?',now(),id),
   statement(env.DB,"UPDATE outbox_events SET status=CASE WHEN status='sent' THEN status ELSE 'failed' END,error_code='RENTAL_PACKAGE_REVOKED' WHERE id=?",row.outbox_id),
   await audit(env,appId,user.id,'package_revoked',{packageId:id}),
  ]);return {revoked:true};
 }
 assert(!row.sent_at&&!row.revoked_at&&row.outbox_status==='failed'&&Date.parse(row.created_at)>Date.now()-23*3600000,409,'PACKAGE_RECONCILIATION_REQUIRED','This package cannot be resent automatically. Check provider delivery records before further action.');
 assert(await authorisedRentalPackage(env,id,true),409,'PACKAGE_NOT_READY','Resolve recipient verification, security review or privacy restrictions before retrying.');
 await env.DB.batch([
  statement(env.DB,"UPDATE outbox_events SET status='pending',attempts=0,available_at=?,error_code=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND status='failed'",now(),row.outbox_id),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  await audit(env,appId,user.id,'package_retry',{packageId:id}),statement(env.DB,'DELETE FROM mutation_guards'),
 ]);return {queued:true};
}
function fileResponse(bytes:ArrayBuffer,filename:string){return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+filename.replace(/[^a-zA-Z0-9 .()_-]/g,'_').slice(-110)+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'}});}
