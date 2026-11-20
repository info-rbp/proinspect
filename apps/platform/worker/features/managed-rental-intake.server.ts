import { digest } from '../../../../packages/auth/crypto';
import { statement, type Env } from '../../../../packages/database/types';
import { MANAGED_RENTAL_POLICY,MANAGED_RENTAL_POLICY_VERSION,MANAGED_RENTAL_RETENTION } from '../../../../packages/marketing/managed-rental-policy';
import { MANAGED_RENTAL_POLICY as LEGACY_POLICY,MANAGED_RENTAL_POLICY_VERSION as LEGACY_VERSION } from '../../../../packages/marketing/managed-rental-policy-v1';
import {TEMPORARY_RENTAL_POLICY,TEMPORARY_RENTAL_POLICY_VERSION} from '../../../../packages/marketing/temporary-rental-policy';
import {publicScanKey,scanKeyId,SCANNER_BASE_IMAGE_DIGEST} from '../../../../packages/marketing/private-scan';

export type ManagedIntakeRelease={id:string;policy_version:string;policy_sha256:string;created_at:string;intake_mode:'details_only'|'scanned_documents'|'temporary_documents';scanner_public_jwk?:string;scanner_key_id?:string;scanner_worker_name?:string;scanner_source_sha?:string;scanner_image_digest?:string};
type ManagedEnv=Env&{managedIntakeRelease?:ManagedIntakeRelease};
export const isManagedApplication=(version:string)=>version.includes('|managed-details:')||version.includes('|managed-documents:')||version.includes('|managed-temporary:');
export const isTemporaryManagedApplication=(version:string)=>version.includes('|managed-temporary:'+TEMPORARY_RENTAL_POLICY_VERSION);
export const isScannedManagedApplication=(version:string)=>version.includes('|managed-documents:'+MANAGED_RENTAL_POLICY_VERSION);
export async function managedIntakeRelease(env:Env):Promise<ManagedIntakeRelease|null>{
 const cached=(env as ManagedEnv).managedIntakeRelease;if(cached)return cached;
 if(!env.BUILD_SHA||!['staging','production'].includes(env.APP_ENV))return null;
 const tables=(await statement(env.DB,"SELECT name FROM sqlite_schema WHERE type='table' AND name IN('managed_rental_intake_releases','managed_rental_document_releases','managed_rental_temporary_releases')").all<{name:string}>()).results.map(r=>r.name);
 if(tables.includes('managed_rental_temporary_releases')){
  const row=await statement(env.DB,"SELECT id,policy_version,policy_sha256,created_at,intake_mode FROM managed_rental_temporary_releases WHERE environment=? AND source_sha=? AND enabled=1 AND intake_mode='temporary_documents' AND length(authorized_by)>3 AND length(authorization_reference)>=12",env.APP_ENV,env.BUILD_SHA).first<ManagedIntakeRelease&{policy_sha256:string}>();
  if(row?.policy_version===TEMPORARY_RENTAL_POLICY_VERSION&&row.policy_sha256===await digest(JSON.stringify(TEMPORARY_RENTAL_POLICY)))return row;
 }
 if(tables.includes('managed_rental_document_releases')&&env.PRIVATE_DOCUMENT_SCANNER){
  const row=await statement(env.DB,"SELECT * FROM managed_rental_document_releases WHERE environment=? AND source_sha=? AND enabled=1 AND intake_mode='scanned_documents' AND length(authorized_by)>3 AND length(authorization_reference)>=12",env.APP_ENV,env.BUILD_SHA).first<ManagedIntakeRelease>();
  if(row&&row.scanner_image_digest===SCANNER_BASE_IMAGE_DIGEST&&row.policy_version===MANAGED_RENTAL_POLICY_VERSION&&row.policy_sha256===await digest(JSON.stringify(MANAGED_RENTAL_POLICY))&&row.scanner_worker_name==='proinspect-private-document-scanner'+(env.APP_ENV==='staging'?'-staging':'')){
   try{const key=publicScanKey(JSON.parse(row.scanner_public_jwk??''));if(row.scanner_key_id===await scanKeyId(key))return row;}catch{/* Invalid verification keys cannot enable uploads. */}
  }
 }
 if(!tables.includes('managed_rental_intake_releases'))return null;
 const row=await statement(env.DB,"SELECT id,policy_version,policy_sha256,created_at,intake_mode FROM managed_rental_intake_releases WHERE environment=? AND source_sha=? AND enabled=1 AND intake_mode='details_only' AND length(authorized_by)>3 AND length(authorization_reference)>=12",env.APP_ENV,env.BUILD_SHA).first<ManagedIntakeRelease>();
 if(!row||row.policy_version!==LEGACY_VERSION||row.policy_sha256!==await digest(JSON.stringify(LEGACY_POLICY)))return null;
 return row;
}
/** Request-scoped values; no global env mutation and no new Worker bindings. */
export async function withManagedIntakePolicy(env:Env):Promise<Env>{
 const release=await managedIntakeRelease(env);if(!release)return env;
 return {...env,managedIntakeRelease:release,
  RENTAL_RETENTION_DRAFT_DAYS:String(MANAGED_RENTAL_RETENTION.draft),
  RENTAL_RETENTION_SUBMITTED_DAYS:String(MANAGED_RENTAL_RETENTION.submitted),
  RENTAL_RETENTION_WITHDRAWN_DAYS:String(MANAGED_RENTAL_RETENTION.withdrawn)} as ManagedEnv;
}
export async function propertyManagementTag(env:Env,propertyId:string){
 const exists=await statement(env.DB,"SELECT name FROM sqlite_schema WHERE type='table' AND name='property_application_management'").first();
 if(!exists)return null;
 return statement(env.DB,'SELECT provider,version,authority_reference FROM property_application_management WHERE property_id=?',propertyId).first<{provider:string;version:number;authority_reference:string}>();
}
export async function managedApplicationListing(env:Env,listingId:string){
 if(!await managedIntakeRelease(env))return false;
 const row=await statement(env.DB,"SELECT l.id FROM leasing_listings l JOIN property_application_management m ON m.property_id=l.property_id WHERE l.id=? AND l.kind='residential' AND l.status='published' AND l.application_mode='proinspect' AND l.application_url IS NULL AND m.provider='proinspect' AND length(m.authority_reference)>=8",listingId).first();
 return Boolean(row);
}
export async function managedDetailsOnlyListing(env:Env,listingId:string){return (await managedIntakeRelease(env))?.intake_mode==='details_only'&&await managedApplicationListing(env,listingId);}
export async function managedPrivacyDocument(env:Env){
 const release=await managedIntakeRelease(env);if(!release)return null;
 const policy=release.intake_mode==='details_only'?LEGACY_POLICY:release.intake_mode==='temporary_documents'?TEMPORARY_RENTAL_POLICY:MANAGED_RENTAL_POLICY;
 return {id:release.id,document_key:'privacy' as const,version_label:release.policy_version,title:policy.title,
  body:{intro:policy.intro,sections:policy.sections},content_sha256:release.policy_sha256,status:'approved',effective_at:release.created_at};
}
