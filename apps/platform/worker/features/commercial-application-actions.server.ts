import { z } from 'zod';
import { assert,statement,now,uid,type Env } from '../../../../packages/database/types';
import { digest,seal,unseal } from '../../../../packages/auth/crypto';
import { guard,clearGuard } from '../../../../packages/operations/core';
import { mailEvent } from '../../../../packages/notifications/server';
import { COMMERCIAL_APPLICATION_VERSION,validateEntityGraph,sectionSchemas,personDetails,commercialReadiness,evidenceCategories,commercialOffer,type CommercialShared,type Evidence } from '../../../../packages/marketing/commercial-application';
import { commercialAccess,commercialEditable,commercialEvent,commercialEmailHash,commercialLimit,privateCommercialLink,type PersonRow,type Profile } from './commercial-intake.server';
import { validMagic } from './rental-applications.server';

function editable(status:string){assert(commercialEditable(status),409,'COMMERCIAL_APPLICATION_LOCKED','Request authorised corrections after submission.');}
async function revision(env:Env,id:string,version:number){
 return statement(env.DB,"UPDATE commercial_applications SET version=version+1,status='in_progress',updated_at=? WHERE id=? AND version=? AND status IN('draft','invited','in_progress','ready','needs_information')",now(),id,version);
}
export async function saveCommercialShared(env:Env,session:string,section:string,input:unknown,version:number){
 const a=await commercialAccess(env,session);editable(a.app.status);assert(a.person.lead===1,403,'COMMERCIAL_LEAD_REQUIRED','Only the lead can change shared business information.');
 assert(a.app.version===version,409,'COMMERCIAL_DRAFT_CHANGED','Reload before saving.');
 const people=(await statement(env.DB,"SELECT id FROM commercial_application_people WHERE application_id=? AND state!='removed'",a.app.id).all<{id:string}>()).results.map(p=>p.id);
 let value:unknown;
 if(section==='entity')value=validateEntityGraph(input,people);
 else {const schema=sectionSchemas[section as keyof typeof sectionSchemas];assert(schema,422,'COMMERCIAL_SECTION','Choose an application section.');value=schema.parse(input);}
 const shared={...a.shared,[section]:value};
 const offer=await statement(env.DB,'SELECT sha256 FROM commercial_application_offers WHERE application_id=? ORDER BY authorised_at DESC,id DESC LIMIT 1',a.app.id).first<{sha256:string}>();
 const hash=await digest(JSON.stringify([a.flow.config_sha256,shared,offer?.sha256??null]));
 const commands:D1PreparedStatement[]=[await revision(env,a.app.id,version),guard(env),
  statement(env.DB,'UPDATE commercial_applications SET shared_envelope=?,scope_sha256=? WHERE id=?',await seal(env.DATA_ENCRYPTION_KEY,'commercial-shared:'+a.app.id,shared),hash,a.app.id),
  statement(env.DB,"UPDATE commercial_application_people SET state='in_progress',declared_at=NULL,declared_scope_sha256=NULL,declared_notice_sha256=NULL,version=version+1 WHERE application_id=? AND state!='removed'",a.app.id)];
 if(section==='entity'){
  const entity=shared.entity!;
  const existing=(await statement(env.DB,'SELECT id FROM commercial_applicant_entities WHERE application_id=?',a.app.id).all<{id:string}>()).results;
  commands.push(statement(env.DB,'DELETE FROM commercial_people_roles WHERE application_id=?',a.app.id));
  for(const e of entity.entities)commands.push(statement(env.DB,'INSERT INTO commercial_applicant_entities(id,application_id,entity_type,envelope) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET entity_type=excluded.entity_type,envelope=excluded.envelope WHERE commercial_applicant_entities.application_id=excluded.application_id',e.id,a.app.id,e.entityType,await seal(env.DATA_ENCRYPTION_KEY,'commercial-entity:'+e.id,e)));
  for(const e of existing.filter(e=>!entity.entities.some(x=>x.id===e.id))){
   assert(!await statement(env.DB,'SELECT id FROM commercial_application_evidence WHERE application_id=? AND entity_id=? LIMIT 1',a.app.id,e.id).first(),409,'COMMERCIAL_ENTITY_HAS_EVIDENCE','Remove draft evidence before removing its entity.');
   commands.push(statement(env.DB,'DELETE FROM commercial_applicant_entities WHERE application_id=? AND id=?',a.app.id,e.id));
  }
  for(const r of entity.roles)commands.push(statement(env.DB,'INSERT INTO commercial_people_roles(application_id,person_id,entity_id,role,authority_envelope) VALUES(?,?,?,?,?)',a.app.id,r.personId,r.entityId,r.role,await seal(env.DATA_ENCRYPTION_KEY,'commercial-role:'+a.app.id+':'+r.personId+':'+r.entityId+':'+r.role,{authority:r.authorityEvidence})));
 }
 commands.push(await commercialEvent(env,a.app.id,a.flow.id,'shared_section_saved',{section,scopeHash:hash},a.person.id));
 if(section==='references'){
  const permission=shared.references?.accountantPermission;
  commands.push(await commercialEvent(env,a.app.id,a.flow.id,'accountant_permission',{granted:Boolean(permission),scope:permission?.scope??null,expiresAt:permission?.expiresAt??null},a.person.id));
 }
 commands.push(clearGuard(env));await env.DB.batch(commands);return {saved:true};
}
export async function inviteCommercialPerson(env:Env,session:string,input:unknown,version:number){
 const a=await commercialAccess(env,session);editable(a.app.status);assert(a.person.lead===1,403,'COMMERCIAL_LEAD_REQUIRED','Only the lead invites participants.');
 const d=z.object({name:z.string().trim().min(2).max(120),email:z.email().max(254).transform(s=>s.toLowerCase()),adultConfirmed:z.literal(true)}).parse(input);
 await commercialLimit(env,'invite:'+a.person.id,10);
 const hash=await commercialEmailHash(env,d.email),existing=await statement(env.DB,"SELECT id FROM commercial_application_people WHERE application_id=? AND email_hash=? AND state!='removed'",a.app.id,hash).first<{id:string}>();
 if(existing)return {personId:existing.id,alreadyIncluded:true}; // Assign multiple roles to one profile.
 const count=await statement(env.DB,"SELECT COUNT(*) AS n FROM commercial_application_people WHERE application_id=? AND state!='removed'",a.app.id).first<{n:number}>();assert((count?.n??0)<30,422,'COMMERCIAL_PERSON_LIMIT','Ask for review of larger applicant groups.');
 const personId=uid('cap'),link=await privateCommercialLink(env,personId,d.email);
 await env.DB.batch([await revision(env,a.app.id,version),guard(env),
  statement(env.DB,'INSERT INTO commercial_application_people(id,application_id,email_hash,profile_envelope) VALUES(?,?,?,?)',personId,a.app.id,hash,await seal(env.DATA_ENCRYPTION_KEY,'commercial-person:'+personId,{name:d.name,email:d.email,invitationName:d.name})),
  ...link.statements,await commercialEvent(env,a.app.id,a.flow.id,'person_invited',{personId},a.person.id),clearGuard(env)]);
 return {personId,invited:true};
}
export async function removeCommercialPerson(env:Env,session:string,personId:string,version:number){
 const a=await commercialAccess(env,session);editable(a.app.status);assert(a.person.lead===1&&personId!==a.person.id,403,'COMMERCIAL_REMOVE_NOT_ALLOWED','Only an invited participant can be removed by the lead.');
 assert(!a.shared.entity?.roles.some(r=>r.personId===personId),409,'COMMERCIAL_PERSON_HAS_ROLE','Remove this person from entity roles before removing them.');
 const person=await statement(env.DB,"SELECT id FROM commercial_application_people WHERE id=? AND application_id=? AND lead=0 AND state!='removed'",personId,a.app.id).first();assert(person,404,'COMMERCIAL_PERSON_UNAVAILABLE','Participant unavailable.');
 const docs=(await statement(env.DB,'SELECT id,object_key FROM commercial_application_evidence WHERE application_id=? AND person_id=?',a.app.id,personId).all<{id:string;object_key:string}>()).results;
 await env.DB.batch([await revision(env,a.app.id,version),guard(env),
  statement(env.DB,"UPDATE commercial_application_people SET state='removed',declared_at=NULL WHERE id=?",personId),
  statement(env.DB,'UPDATE commercial_application_sessions SET revoked_at=? WHERE person_id=?',now(),personId),
  statement(env.DB,'UPDATE commercial_application_links SET consumed_at=? WHERE person_id=?',now(),personId),
  ...docs.map(d=>statement(env.DB,'DELETE FROM commercial_application_scan_receipts WHERE document_id=?',d.id)),
  statement(env.DB,'DELETE FROM commercial_application_evidence WHERE application_id=? AND person_id=?',a.app.id,personId),
  await commercialEvent(env,a.app.id,a.flow.id,'person_removed',{personId},a.person.id),clearGuard(env)]);
 for(const doc of docs)await env.RESTRICTED_DOCUMENTS.delete(doc.object_key);
 return {removed:true};
}
export async function declareCommercialPerson(env:Env,session:string,input:unknown,version:number,personVersion:number){
 const a=await commercialAccess(env,session);editable(a.app.status);
 const d=z.object({profile:personDetails,noticeHash:z.string().regex(/^[a-f0-9]{64}$/),authority:z.literal(true),nonBinding:z.literal(true),referencePermission:z.boolean(),guaranteeConsent:z.boolean()}).parse(input);
 assert(d.profile.email.toLowerCase()===a.profile.email.toLowerCase(),422,'COMMERCIAL_EMAIL_BOUND','Use verified access recovery to change a contact address.');
 const noticeHash=await digest(JSON.stringify([a.config.privacyVersion,a.config.collectionNotice,a.config.providerDisclosure,a.config.recipient,a.config.retention]));
 assert(d.noticeHash===noticeHash,409,'COMMERCIAL_NOTICE_CHANGED','Review the current collection notice.');
 const guarantor=a.shared.entity?.roles.some(r=>r.personId===a.person.id&&r.role==='guarantor');
 assert(!guarantor||d.guaranteeConsent,422,'COMMERCIAL_GUARANTOR_CONSENT','A guarantor must independently consent to this assessment; this is not execution of a guarantee.');
 const profile={...d.profile,invitationName:a.profile.invitationName,consents:{noticeHash,referencePermission:d.referencePermission,nonBinding:true,authority:true,guaranteeConsent:d.guaranteeConsent,at:now()}};
 await env.DB.batch([await revision(env,a.app.id,version),guard(env),
  statement(env.DB,"UPDATE commercial_application_people SET profile_envelope=?,state='ready',version=version+1,declared_scope_sha256=?,declared_notice_sha256=?,declared_at=? WHERE id=? AND version=? AND state!='removed'",await seal(env.DATA_ENCRYPTION_KEY,'commercial-person:'+a.person.id,profile),a.app.scope_sha256,noticeHash,now(),a.person.id,personVersion),guard(env),
  await commercialEvent(env,a.app.id,a.flow.id,'person_declared',{noticeHash,scopeHash:a.app.scope_sha256,referencePermission:d.referencePermission,guaranteeConsent:d.guaranteeConsent},a.person.id),clearGuard(env)]);
 return {ready:true};
}
export async function submitCommercial(env:Env,session:string,requestKey:string,version:number){
 const a=await commercialAccess(env,session);assert(a.person.lead===1,403,'COMMERCIAL_LEAD_REQUIRED','Only the lead submits.');
 z.uuid().parse(requestKey);
 if(a.app.status==='submitted'){const receipt=await statement(env.DB,'SELECT id FROM commercial_application_submissions WHERE application_id=? ORDER BY created_at DESC LIMIT 1',a.app.id).first<{id:string}>();assert(receipt,409,'COMMERCIAL_RECEIPT_REQUIRED','Review submission receipt.');return {submitted:true,reference:a.app.reference,receipt:receipt.id,replayed:true};}
 editable(a.app.status);assert(a.app.version===version,409,'COMMERCIAL_DRAFT_CHANGED','Reload before submitting.');
 const people=(await statement(env.DB,"SELECT * FROM commercial_application_people WHERE application_id=? AND state!='removed'",a.app.id).all<PersonRow>()).results;
 const noticeHash=await digest(JSON.stringify([a.config.privacyVersion,a.config.collectionNotice,a.config.providerDisclosure,a.config.recipient,a.config.retention]));
 assert(people.every(p=>p.state==='ready'&&p.declared_scope_sha256===a.app.scope_sha256&&p.declared_notice_sha256===noticeHash),422,'COMMERCIAL_DECLARATIONS_REQUIRED','Every included person must review the current scope and complete their declaration.');
 const docs=(await statement(env.DB,'SELECT id,person_id,entity_id,category,period_label,scan_status,review_status,sha256 FROM commercial_application_evidence WHERE application_id=?',a.app.id).all<Evidence>()).results;
 const readiness=commercialReadiness(a.shared,people.map(p=>p.id),docs,a.config.guarantee);assert(readiness.ready,422,'COMMERCIAL_NOT_READY',readiness.issues.join('; '));
 for(const person of people)for(const category of a.config.requiredPersonalEvidence){
  if(category==='guarantee'&&!a.shared.entity?.roles.some(r=>r.personId===person.id&&r.role==='guarantor'))continue;
  assert(docs.some(d=>d.person_id===person.id&&d.category===category&&!d.entity_id),422,'COMMERCIAL_PERSONAL_EVIDENCE_REQUIRED','Each relevant participant must privately provide the evidence specifically required in this listing’s approved scope.');
 }
 const offerRow=await statement(env.DB,'SELECT id,envelope FROM commercial_application_offers WHERE application_id=? ORDER BY authorised_at DESC,id DESC LIMIT 1',a.app.id).first<{id:string;envelope:string}>();
 const offer=offerRow?await unseal<z.infer<typeof commercialOffer>>(env.DATA_ENCRYPTION_KEY,'commercial-offer:'+offerRow.id,offerRow.envelope):null;
 assert(!offer||offer.expiresAt>now(),409,'COMMERCIAL_OFFER_EXPIRED','Request a current authorised offer before submitting.');
 const profiles=await Promise.all(people.map(async p=>({personId:p.id,profile:await unseal<Profile>(env.DATA_ENCRYPTION_KEY,'commercial-person:'+p.id,p.profile_envelope),declaredAt:p.declared_at})));
 const snapshot={schemaVersion:COMMERCIAL_APPLICATION_VERSION,reference:a.app.reference,property:{listingId:a.flow.listing_id,address:a.flow.display_address,representative:a.flow.agent_name},shared:a.shared,people:profiles,documents:docs,offer,notice:a.config,noticeHash,manualReview:readiness.manualReview,submittedAt:now()};
 const id=uid('cas'),hash=await digest(JSON.stringify(snapshot)),stamp=now();
 await env.DB.batch([
  statement(env.DB,"UPDATE commercial_applications SET status='submitted',version=version+1,submitted_at=?,updated_at=?,retained_until=? WHERE id=? AND version=? AND status IN('draft','invited','in_progress','ready','needs_information') AND NOT EXISTS(SELECT 1 FROM commercial_application_people p WHERE p.application_id=commercial_applications.id AND p.state NOT IN('ready','removed')) AND NOT EXISTS(SELECT 1 FROM commercial_application_evidence d WHERE d.application_id=commercial_applications.id AND (d.scan_status!='clean' OR d.review_status!='released'))",stamp,stamp,new Date(Date.now()+a.config.retention.submitted*86400000).toISOString(),a.app.id,version),guard(env),
  statement(env.DB,'INSERT INTO commercial_application_submissions(id,application_id,request_key,snapshot_envelope,sha256,submitted_by,created_at) VALUES(?,?,?,?,?,?,?)',id,a.app.id,requestKey,await seal(env.DATA_ENCRYPTION_KEY,'commercial-submission:'+id,snapshot),hash,a.person.id,stamp),
  await commercialEvent(env,a.app.id,a.flow.id,'submitted',{receipt:id,snapshotHash:hash,manualReview:readiness.manualReview},a.person.id),
  await mailEvent(env,'commercial.application.received',{to:a.profile.email,subject:'Commercial application received — '+a.app.reference,heading:'Application received',body:'Receipt '+id+'. Your application is awaiting authorised review. This is not approval, a lease or a guarantee.',sensitive:true}),
  clearGuard(env)]);
 return {submitted:true,reference:a.app.reference,receipt:id};
}
export async function uploadCommercialEvidence(env:Env,session:string,form:FormData,version:number){
 const a=await commercialAccess(env,session);editable(a.app.status);
 const file=form.get('file'),category=z.enum(evidenceCategories).parse(form.get('category')),entityId=String(form.get('entityId')??'')||null,period=String(form.get('period')??'').trim();
 assert(file instanceof File&&file.size>=1&&file.size<=8388608,413,'COMMERCIAL_FILE_SIZE','Choose one file up to 8 MB.');
 assert(['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type),422,'COMMERCIAL_FILE_TYPE','Use PDF, JPEG, PNG or WebP.');
 if(entityId)assert(a.person.lead===1&&a.shared.entity?.entities.some(e=>e.id===entityId),403,'COMMERCIAL_EVIDENCE_OWNER','Only the lead can add evidence for a known business entity.');
 if(['financial_year','bas_quarter','registry','trust_authority','partnership_authority','association_authority'].includes(category))assert(entityId,422,'COMMERCIAL_ENTITY_REQUIRED','Select the business entity for this evidence.');
 assert(!['financial_year','bas_quarter'].includes(category)||(/^[0-9]{4}(?:-[0-9]{4}|-Q[1-4])?$/.test(period)),422,'COMMERCIAL_PERIOD_REQUIRED','Give an explicit financial year or BAS quarter, such as 2025-2026 or 2026-Q1.');
 const count=await statement(env.DB,'SELECT COUNT(*) AS n FROM commercial_application_evidence WHERE application_id=?',a.app.id).first<{n:number}>();assert((count?.n??0)<100,422,'COMMERCIAL_FILE_LIMIT','Ask for a reviewed evidence scope.');
 const bytes=new Uint8Array(await file.arrayBuffer());assert(validMagic(file.type,bytes),422,'COMMERCIAL_FILE_INVALID','File content does not match its format.');
 const id=uid('cad'),sha=await digest(bytes.buffer),objectKey='commercial-applications/'+a.app.id+'/'+a.person.id+'/'+id;
 const metadata={filename:file.name.replace(/[^a-zA-Z0-9 .()_-]/g,'_').slice(0,100)||'evidence',type:file.type,size:file.size};
 await env.RESTRICTED_DOCUMENTS.put(objectKey,bytes,{httpMetadata:{contentType:'application/octet-stream'}});
 try{await env.DB.batch([await revision(env,a.app.id,version),guard(env),
  statement(env.DB,'INSERT INTO commercial_application_evidence(id,application_id,person_id,entity_id,category,period_label,object_key,metadata_envelope,sha256,uploaded_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,a.app.id,a.person.id,entityId,category,period,objectKey,await seal(env.DATA_ENCRYPTION_KEY,'commercial-evidence:'+id,metadata),sha,now()),
  statement(env.DB,"UPDATE commercial_application_people SET state='in_progress',declared_at=NULL,version=version+1 WHERE id=?",a.person.id),
  await commercialEvent(env,a.app.id,a.flow.id,'document_uploaded',{documentId:id,category},a.person.id),clearGuard(env)]);}
 catch(error){await env.RESTRICTED_DOCUMENTS.delete(objectKey);throw error;}
 return {uploaded:true,id};
}
export async function deleteCommercialEvidence(env:Env,session:string,documentId:string,version:number){
 const a=await commercialAccess(env,session);editable(a.app.status);
 const doc=await statement(env.DB,'SELECT object_key FROM commercial_application_evidence WHERE id=? AND application_id=? AND person_id=?',documentId,a.app.id,a.person.id).first<{object_key:string}>();assert(doc,404,'COMMERCIAL_DOCUMENT_UNAVAILABLE','Document unavailable.');
 await env.DB.batch([await revision(env,a.app.id,version),guard(env),
  statement(env.DB,'DELETE FROM commercial_application_scan_receipts WHERE document_id=?',documentId),
  statement(env.DB,'DELETE FROM commercial_application_evidence WHERE id=? AND person_id=?',documentId,a.person.id),
  await commercialEvent(env,a.app.id,a.flow.id,'document_removed',{documentId},a.person.id),clearGuard(env)]);
 await env.RESTRICTED_DOCUMENTS.delete(doc.object_key);return {deleted:true};
}
export async function withdrawCommercial(env:Env,session:string,version:number){
 const a=await commercialAccess(env,session);assert(a.person.lead===1&&!['closed','decision_recorded','withdrawn'].includes(a.app.status),403,'COMMERCIAL_WITHDRAW_NOT_ALLOWED','Only the lead may withdraw an active application.');
 await env.DB.batch([
  statement(env.DB,"UPDATE commercial_applications SET status='withdrawn',version=version+1,updated_at=?,retained_until=? WHERE id=? AND version=?",now(),new Date(Date.now()+a.config.retention.withdrawn*86400000).toISOString(),a.app.id,version),guard(env),
  statement(env.DB,"UPDATE commercial_application_referrals SET status='revoked' WHERE application_id=? AND status='prepared'",a.app.id),
  await commercialEvent(env,a.app.id,a.flow.id,'withdrawn',{downstreamReviewRequired:true},a.person.id),clearGuard(env)]);
 return {withdrawn:true};
}
export async function correctCommercialEmail(env:Env,session:string,input:unknown,version:number,personVersion:number){
 const a=await commercialAccess(env,session);editable(a.app.status);
 const email=z.email().max(254).parse(input).trim().toLowerCase(),hash=await commercialEmailHash(env,email);
 assert(email!==a.profile.email.toLowerCase(),422,'COMMERCIAL_EMAIL_UNCHANGED','Enter a corrected address.');
 assert(!await statement(env.DB,"SELECT id FROM commercial_application_people WHERE application_id=? AND email_hash=?",a.app.id,hash).first(),409,'COMMERCIAL_DUPLICATE_PERSON','That address already belongs to this application.');
 await commercialLimit(env,'email-correction:'+a.person.id,3);
 const link=await privateCommercialLink(env,a.person.id,email);
 await env.DB.batch([await revision(env,a.app.id,version),guard(env),
  statement(env.DB,"UPDATE commercial_application_people SET email_hash=?,profile_envelope=?,state='in_progress',declared_at=NULL,declared_scope_sha256=NULL,declared_notice_sha256=NULL,version=version+1 WHERE id=? AND version=?",hash,await seal(env.DATA_ENCRYPTION_KEY,'commercial-person:'+a.person.id,{...a.profile,email,consents:undefined}),a.person.id,personVersion),guard(env),
  ...link.statements,await commercialEvent(env,a.app.id,a.flow.id,'email_corrected',{previousAccessRevoked:true},a.person.id),clearGuard(env)]);
 return {sent:true};
}
/** A participant can stop further assessment of their own data without another person's consent. */
export async function withdrawCommercialParticipation(env:Env,session:string,version:number){
 const a=await commercialAccess(env,session);
 assert(a.person.lead===0&&!['closed','withdrawn','decision_recorded'].includes(a.app.status),409,'COMMERCIAL_PARTICIPATION_CLOSED','Participation is already closed; use the privacy request process.');
 await env.DB.batch([
  statement(env.DB,"UPDATE commercial_applications SET status='blocked',version=version+1,updated_at=? WHERE id=? AND version=?",now(),a.app.id,version),guard(env),
  statement(env.DB,"UPDATE commercial_application_people SET state='withdrawn',declared_at=NULL,declared_scope_sha256=NULL,declared_notice_sha256=NULL,version=version+1 WHERE id=?",a.person.id),
  statement(env.DB,"UPDATE commercial_application_referrals SET status='revoked' WHERE application_id=? AND status='prepared'",a.app.id),
  await commercialEvent(env,a.app.id,a.flow.id,'participation_withdrawn',{furtherAssessmentBlocked:true,downstreamReviewRequired:true},a.person.id),clearGuard(env)]);
 return {withdrawn:true};
}
