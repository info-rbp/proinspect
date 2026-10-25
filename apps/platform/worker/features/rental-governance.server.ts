import { z } from 'zod';
import { assert, now, statement, uid, type Env } from '../../../../packages/database/types';
import { digest, seal, randomToken } from '../../../../packages/auth/crypto';
import { mailEvent } from '../../../../packages/notifications/server';
import { operationsWrite } from '../../../../packages/authorization/server';
import { rentalApprovalInput } from '../../../../packages/marketing/rental-governance';
import type { Principal } from '../../../../packages/domain/index';

function administrator(user:Principal){
 operationsWrite(user);
 assert(user.staffRole==='administrator',403,'RENTAL_APPROVAL_ADMIN','An administrator must approve rental application processing.');
}
type Listing={id:string;version:number;kind:string;application_mode:string;application_url:string|null;
 application_authority_reference:string|null;application_recipient_email:string|null;
 tenancy_database_notice_mode:string;tenancy_database_notice_json:string;
 rental_approval_state:string;rental_approval_version:number;rental_recipient_verified_at:string|null};
async function getListing(env:Env,id:string){
 const row=await statement(env.DB,'SELECT * FROM leasing_listings WHERE id=?',id).first<Listing>();
 assert(row,404,'LISTING_NOT_FOUND','Property listing not found.');
 return row;
}
export async function issueRecipientChallenge(env:Env,user:Principal,id:string,input:unknown){
 administrator(user);
 const d=z.object({version:z.number().int().positive()}).parse(input);
 const row=await getListing(env,id);
 assert(row.version===d.version,409,'STALE_LISTING','Reload the current listing.');
 assert(row.kind==='residential'&&row.application_mode==='proinspect'&&!row.application_url,409,
  'RENTAL_ROUTE_INVALID','An approved agency application link takes precedence.');
 const recipient=row.application_recipient_email?.trim().toLowerCase();
 assert(recipient&&z.string().email().safeParse(recipient).success,422,'RECIPIENT_REQUIRED','Configure an agency or landlord email.');
 const token=randomToken(),idChallenge=uid('rrc'),t=now();
 await env.DB.batch([
  statement(env.DB,"UPDATE rental_listing_recipient_challenges SET expires_at=? WHERE listing_id=? AND verified_at IS NULL",t,id),
  statement(env.DB,'INSERT INTO rental_listing_recipient_challenges(id,listing_id,recipient_hash,token_hash,expires_at,requested_at,requested_by) VALUES(?,?,?,?,?,?,?)',
   idChallenge,id,await digest(env.DATA_ENCRYPTION_KEY+':rental-recipient:'+recipient),await digest(token),
   new Date(Date.now()+24*3600000).toISOString(),t,user.id),
  await mailEvent(env,'rental.recipient.verification',{to:recipient,subject:'Verify ProInspect rental application recipient',
   heading:'Confirm this recipient address',body:'This verification confirms inbox possession only. It does not authorise applications without a separate review.',
   href:env.APP_ORIGIN+'/rental-recipient/verify/'+token,sensitive:true}),
 ]);
 return {sent:true,expiresInHours:24};
}
/** POST-only confirmation; GET opens a confirmation page and never uses the token. */
export async function verifyRecipient(env:Env,token:string){
 assert(/^[a-f0-9]{64}$/.test(token),404,'RECIPIENT_LINK_INVALID','Verification link unavailable.');
 const hash=await digest(token),t=now();
 const challenge=await statement(env.DB,'SELECT * FROM rental_listing_recipient_challenges WHERE token_hash=? AND expires_at>? AND verified_at IS NULL',hash,t)
  .first<{id:string;listing_id:string;recipient_hash:string}>();
 assert(challenge,404,'RECIPIENT_LINK_EXPIRED','This verification link is no longer valid.');
 const listing=await getListing(env,challenge.listing_id),recipient=listing.application_recipient_email?.trim().toLowerCase();
 assert(recipient&&listing.application_mode==='proinspect'&&!listing.application_url,409,'RECIPIENT_CHANGED','The listing application method changed.');
 assert(await digest(env.DATA_ENCRYPTION_KEY+':rental-recipient:'+recipient)===challenge.recipient_hash,
  409,'RECIPIENT_CHANGED','The destination changed.');
 await env.DB.batch([
  statement(env.DB,'UPDATE rental_listing_recipient_challenges SET verified_at=? WHERE id=? AND verified_at IS NULL AND expires_at>?',t,challenge.id,t),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  statement(env.DB,"UPDATE leasing_listings SET rental_recipient_verified_at=?,rental_approval_state='pending' WHERE id=?",
   t,listing.id),
  statement(env.DB,'DELETE FROM mutation_guards'),
 ]);
 return {verified:true};
}
export async function approveRentalListing(env:Env,user:Principal,id:string,input:unknown){
 administrator(user);
 const d=rentalApprovalInput.parse(input);
 const row=await getListing(env,id);
 assert(row.version===d.version,409,'STALE_LISTING','Reload the listing before approval.');
 assert(row.kind==='residential'&&row.application_mode==='proinspect'&&!row.application_url,409,'RENTAL_ROUTE_INVALID',
  'An agency-provided application URL cannot be replaced by a hosted form.');
 assert(row.application_authority_reference&&row.application_recipient_email&&row.rental_recipient_verified_at,
  409,'RENTAL_RECIPIENT_UNVERIFIED','Verify the configured recipient inbox before approval.');
 assert(row.tenancy_database_notice_mode!=='unconfigured'&&
  (row.tenancy_database_notice_mode!=='configured'||JSON.parse(row.tenancy_database_notice_json).length>0),
  409,'RENTAL_NOTICE_MISSING','Confirm the tenancy database notice.');
 const challenge=await statement(env.DB,"SELECT id FROM rental_listing_recipient_challenges WHERE listing_id=? AND verified_at=? AND recipient_hash=? ORDER BY requested_at DESC LIMIT 1",
  id,row.rental_recipient_verified_at,await digest(env.DATA_ENCRYPTION_KEY+':rental-recipient:'+row.application_recipient_email.trim().toLowerCase())).first<{id:string}>();
 assert(challenge,409,'VERIFICATION_REQUIRED','No matching verified challenge is available.');
 const approvalId=uid('rap'),t=now(),revision=row.rental_approval_version+1;
 await env.DB.batch([
  statement(env.DB,'UPDATE leasing_listings SET rental_approval_state=?,rental_approval_version=?,rental_approved_at=?,rental_approved_by=?,rental_approved_notice_version=?,version=version+1 WHERE id=? AND version=?',
   'approved',revision,t,user.id,d.privacyNoticeVersion,id,d.version),
  statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
  statement(env.DB,'INSERT INTO rental_listing_approvals(id,listing_id,approval_version,authority_reference,authority_attestation_envelope,privacy_notice_version,recipient_challenge_id,approved_by,approved_at) VALUES(?,?,?,?,?,?,?,?,?)',
   approvalId,id,revision,d.authorityDocumentReference,
   await seal(env.DATA_ENCRYPTION_KEY,'rental-approval:'+approvalId,{authorityAttestation:d.authorityAttestation,
    signedInstructionReference:row.application_authority_reference,recipient:row.application_recipient_email,
    notice:row.tenancy_database_notice_json,confirmed:{authority:d.confirmAuthority,notice:d.confirmNotice,recipient:d.confirmRecipient}}),
   d.privacyNoticeVersion,challenge.id,user.id,t),
  statement(env.DB,'DELETE FROM mutation_guards'),
 ]);
 return {approved:true,revision};
}
export function listingApproved(row:{rental_approval_state?:string;rental_recipient_verified_at?:string|null}){
 return row.rental_approval_state==='approved'&&Boolean(row.rental_recipient_verified_at);
}
