import {statement,now,type Env} from '../database/types';
import {digest,unseal} from '../auth/crypto';
import {PUBLIC_COMPANY} from '../marketing/public-facts';
import {TEMPORARY_RENTAL_POLICY,TEMPORARY_RENTAL_POLICY_VERSION} from '../marketing/temporary-rental-policy';

export const packageRecipientHash=(env:Env,email:string)=>digest(env.DATA_ENCRYPTION_KEY+':temporary-rental-recipient:'+email.trim().toLowerCase());
export type RentalPackageRow={id:string;application_id:string;submission_id:string;outbox_id:string;token_hash:string;recipient_envelope:string;recipient_hash:string;cc_hash:string;management_version:number;recipient_verified_at:string;document_ids_json:string;created_at:string;sent_at:string|null;provider_id:string|null;expires_at:string;revoked_at:string|null};
/** Re-check at queue consumption AND every download. A queued email is not authority. */
export async function authorisedRentalPackage(env:Env,id:string,forSend=false):Promise<RentalPackageRow|null>{
 const r=await statement(env.DB,"SELECT p.*,a.status,a.privacy_hold_until,a.consent_version,l.application_recipient_email,l.rental_recipient_verified_at,l.status AS listing_status,l.application_mode,l.application_url,m.provider,m.version AS current_management_version FROM rental_temporary_packages p JOIN rental_applications a ON a.id=p.application_id JOIN leasing_listings l ON l.id=a.listing_id JOIN property_application_management m ON m.property_id=l.property_id WHERE p.id=?",id).first<RentalPackageRow&{status:string;privacy_hold_until:string|null;consent_version:string;application_recipient_email:string|null;rental_recipient_verified_at:string|null;listing_status:string;application_mode:string;application_url:string|null;provider:string;current_management_version:number}>();
 if(!r||r.revoked_at||r.expires_at<=now()||!['submitted','ready_for_handoff','forwarded','decision_recorded'].includes(r.status)||r.privacy_hold_until&&r.privacy_hold_until>now()||r.provider!=='proinspect'||r.management_version!==r.current_management_version||r.listing_status!=='published'||r.application_mode!=='proinspect'||r.application_url||!r.application_recipient_email||r.rental_recipient_verified_at!==r.recipient_verified_at||!r.consent_version.includes('|managed-temporary:'+TEMPORARY_RENTAL_POLICY_VERSION))return null;
 const release=await statement(env.DB,"SELECT policy_sha256 FROM managed_rental_temporary_releases WHERE environment=? AND source_sha=? AND enabled=1 AND policy_version=?",env.APP_ENV,env.BUILD_SHA??'',TEMPORARY_RENTAL_POLICY_VERSION).first<{policy_sha256:string}>();
 if(release?.policy_sha256!==await digest(JSON.stringify(TEMPORARY_RENTAL_POLICY)))return null;
 if(!forSend&&!r.sent_at)return null;
 const cc=env.OPERATIONS_EMAIL??PUBLIC_COMPANY.email;
 if(r.recipient_hash!==await packageRecipientHash(env,r.application_recipient_email)||r.cc_hash!==await packageRecipientHash(env,cc))return null;
 const latest=await statement(env.DB,'SELECT id FROM rental_application_submissions WHERE application_id=? ORDER BY version DESC LIMIT 1',r.application_id).first<{id:string}>();
 if(latest?.id!==r.submission_id)return null;
 const ids=JSON.parse(r.document_ids_json) as string[];
 if(ids.length>100||new Set(ids).size!==ids.length)return null;
 const docs=(await statement(env.DB,"SELECT id,state,delete_after FROM rental_temporary_documents WHERE application_id=? AND state!='purged'",r.application_id).all<{id:string;state:string;delete_after:string}>()).results;
 if(ids.some(id=>!docs.some(d=>d.id===id&&d.state==='approved'&&d.delete_after>now())))return null;
 if(docs.some(d=>d.state==='quarantined'||d.state==='purging'||d.state==='approved'&&!ids.includes(d.id)))return null;
 return r;
}
export async function rentalPackageMailAllowed(env:Env,id:string,outboxId:string,to:string,cc:string[]){
 const row=await authorisedRentalPackage(env,id,true);
 if(!row||row.outbox_id!==outboxId||cc.length!==1)return false;
 const recipients=await unseal<{to:string;cc:string}>(env.DATA_ENCRYPTION_KEY,'temporary-package-recipient:'+id,row.recipient_envelope);
 return recipients.to===to&&recipients.cc===cc[0]&&row.recipient_hash===await packageRecipientHash(env,to)&&row.cc_hash===await packageRecipientHash(env,cc[0]);
}
/** Called inside the same atomic batch as outbox success, never on queue insertion. */
export function rentalPackageSentStatements(env:Env,id:string,providerId:string,stamp:string){
 const deadline=new Date(Date.parse(stamp)+7*86400000).toISOString();
 return [
  statement(env.DB,'UPDATE rental_temporary_packages SET sent_at=?,provider_id=?,expires_at=? WHERE id=? AND sent_at IS NULL AND revoked_at IS NULL',stamp,providerId,deadline,id),
  statement(env.DB,"UPDATE rental_temporary_documents SET delete_after=? WHERE id IN(SELECT value FROM rental_temporary_packages p,json_each(p.document_ids_json) WHERE p.id=? AND p.sent_at=?) AND state='approved'",deadline,id,stamp),
 ];
}
