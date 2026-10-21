import { statement, assert, now, uid, type Env } from '../../../../packages/database/types';
import { digest, seal, unseal } from '../../../../packages/auth/crypto';
import { isLocal } from '../../../../packages/auth/server';
import { operationsWrite } from '../../../../packages/authorization/server';
import type { Principal } from '../../../../packages/domain/index';
import { openHomeCheckInInput, isOpenHomeCheckInAvailable, CHECK_IN_CONSENT_VERSION } from '../../../../packages/marketing/open-home';

type SessionRow={ id:string; listing_id:string; property_id:string; kind:string; slug:string;
 title:string; display_address:string; suburb:string; postcode:string; agent_name:string;
 starts_at:string; ends_at:string; };

/** Returns only sessions belonging to approved, currently published advertisements. */
export async function publicOpenHomeSessions(env:Env,at=new Date()){
 const after=new Date(at.getTime()-3*3600000).toISOString();
 const before=new Date(at.getTime()+7*86400000).toISOString();
 const rows=(await statement(env.DB,
  "SELECT s.id,s.listing_id,l.property_id,l.kind,l.slug,l.title,l.display_address,l.suburb,l.postcode,l.agent_name,s.starts_at,s.ends_at FROM leasing_sessions s JOIN leasing_listings l ON l.id=s.listing_id WHERE l.status='published' AND s.status='scheduled' AND s.ends_at>=? AND s.starts_at<=? ORDER BY s.starts_at,l.display_address LIMIT 150",
  after,before).all<SessionRow>()).results;
 return rows.map(s=>({id:s.id,listingId:s.listing_id,kind:s.kind,slug:s.slug,
  title:s.title,address:s.display_address,suburb:s.suburb,postcode:s.postcode,
  agentName:s.agent_name,startsAt:s.starts_at,endsAt:s.ends_at,
  acceptingCheckIn:isOpenHomeCheckInAvailable(s,at)}));
}
async function throttle(env:Env,name:string,max:number){
 const key=await digest(env.DATA_ENCRYPTION_KEY+':open-home:'+name);
 const t=now(),until=new Date(Date.now()+15*60000).toISOString();
 const r=await statement(env.DB,
  "INSERT INTO auth_rate_limits(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING attempts",
  key,until,t,t).first<{attempts:number}>();
 assert(r&&r.attempts<=max,429,'CHECK_IN_RATE_LIMIT','Too many check-in attempts. Ask the ProInspect representative for assistance.');
}
async function verifyTurnstile(env:Env,request:Request,token:string|undefined,requestKey:string){
 if(isLocal(request,env))return;
 assert(env.MARKETING_TURNSTILE_SECRET_KEY&&token,503,'CHECK_IN_SECURITY_UNAVAILABLE','Public check-in is temporarily unavailable.');
 const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
  method:'POST',body:new URLSearchParams({secret:env.MARKETING_TURNSTILE_SECRET_KEY,response:token!,idempotency_key:requestKey}),
  signal:AbortSignal.timeout(10000)});
 const result=await response.json() as {success?:boolean;hostname?:string;action?:string};
 const hosts=[env.APP_ORIGIN,env.MARKETING_ORIGIN].filter(Boolean).map(v=>new URL(v!).hostname);
 assert(response.ok&&result.success===true&&result.action==='open_home_check_in'&&
  Boolean(result.hostname&&hosts.includes(result.hostname)),
  403,'CHECK_IN_SECURITY_FAILED','Security verification expired. Try again.');
}
export async function recordOpenHomeCheckIn(env:Env,request:Request,args:{input:unknown;turnstile?:string;clientKey:string}){
 assert(env.DATA_ENCRYPTION_KEY&&args.clientKey,503,'CHECK_IN_UNAVAILABLE','Check-in is temporarily unavailable.');
 const d=openHomeCheckInInput.parse(args.input);
 const fingerprint=await digest(JSON.stringify(d));
 await throttle(env,'ip:'+args.clientKey,20);
 await throttle(env,'email:'+d.email,8);
 await verifyTurnstile(env,request,args.turnstile,d.requestKey);
 const previous=await statement(env.DB,'SELECT id,fingerprint FROM leasing_checkins WHERE request_key=?',d.requestKey)
  .first<{id:string;fingerprint:string}>();
 if(previous){
  assert(previous.fingerprint===fingerprint,409,'CHECK_IN_CHANGED','Refresh the form and try again.');
  return {reference:previous.id,alreadyCheckedIn:true};
 }
 const session=await statement(env.DB,
  "SELECT s.id,s.listing_id,l.property_id,l.kind,l.slug,l.title,l.display_address,l.suburb,l.postcode,l.agent_name,s.starts_at,s.ends_at FROM leasing_sessions s JOIN leasing_listings l ON l.id=s.listing_id WHERE s.id=? AND s.listing_id=? AND s.status='scheduled' AND l.status='published'",
  d.sessionId,d.listingId).first<SessionRow>();
 assert(session,404,'CHECK_IN_SESSION_UNAVAILABLE','This inspection is unavailable. Select another property.');
 assert(isOpenHomeCheckInAvailable(session),409,'CHECK_IN_WINDOW_CLOSED',
  'Check-in opens 30 minutes before the inspection and closes 45 minutes after it ends.');
 const emailHash=await digest(env.DATA_ENCRYPTION_KEY+':leasing-email:'+d.email);
 const normalisedName=d.name.toLowerCase().replace(/\s+/g,' ').trim();
 const attendeeHash=await digest(env.DATA_ENCRYPTION_KEY+':open-home-attendee:'+
  d.sessionId+':'+d.email+':'+normalisedName);
 const already=await statement(env.DB,'SELECT id FROM leasing_checkins WHERE session_id=? AND attendee_hash=?',
  d.sessionId,attendeeHash).first<{id:string}>();
 if(already)return {reference:'Previously recorded',alreadyCheckedIn:true};
 const registration=await statement(env.DB,
  "SELECT id,envelope FROM leasing_leads WHERE session_id=? AND listing_id=? AND kind='inspection' AND status='active' AND email_hash=? LIMIT 1",
  session.id,session.listing_id,emailHash).first<{id:string;envelope:string}>();
 const registeredContact=registration?await unseal<{name:string}>(
  env.DATA_ENCRYPTION_KEY,'leasing-lead:'+registration.id,registration.envelope):null;
 const matchingRegistration=registeredContact?.name.toLowerCase().replace(/\s+/g,' ').trim()===normalisedName;

 const id=uid('och'),eventId=uid('ohs'),stamp=now();
 try{
  await env.DB.batch([
   statement(env.DB,
    'INSERT INTO leasing_checkins(id,listing_id,session_id,registered_lead_id,request_key,fingerprint,email_hash,attendee_hash,contact_envelope,source,consent_version,arrived_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id,session.listing_id,session.id,matchingRegistration?registration?.id??null:null,d.requestKey,fingerprint,emailHash,attendeeHash,
    await seal(env.DATA_ENCRYPTION_KEY,'open-home-checkin:'+id,{
      name:d.name,email:d.email,phone:d.phone,consentAt:stamp,
    }),d.source,CHECK_IN_CONSENT_VERSION,stamp,stamp),
   statement(env.DB,'INSERT INTO open_home_sheet_events(id,checkin_id,created_at) VALUES(?,?,?)',eventId,id,stamp),
  ]);
 }catch(error){
  const existing=await statement(env.DB,'SELECT id,fingerprint FROM leasing_checkins WHERE request_key=?',
    d.requestKey).first<{id:string;fingerprint:string}>();
  if(existing){
   assert(existing.fingerprint===fingerprint,409,'CHECK_IN_CHANGED','Refresh and try again.');
   return {reference:existing.id,alreadyCheckedIn:true};
  }
  const duplicate=await statement(env.DB,'SELECT id FROM leasing_checkins WHERE session_id=? AND attendee_hash=?',
   d.sessionId,attendeeHash).first<{id:string}>();
  if(duplicate)return {reference:'Previously recorded',alreadyCheckedIn:true};
  throw error;
 }
 return {reference:id,alreadyCheckedIn:false};
}
function staff(user:Principal){
 operationsWrite(user);
 assert(['administrator','operations_manager'].includes(user.staffRole??''),403,
  'CHECK_IN_STAFF_REQUIRED','Open-home attendance records are restricted to operations staff.');
}
export async function staffOpenHomeCheckIns(env:Env,user:Principal,listingId:string,sessionId?:string){
 staff(user);
 const listing=await statement(env.DB,
  'SELECT id,property_id,title,display_address,agent_name,kind FROM leasing_listings WHERE id=?',listingId)
  .first<{id:string;property_id:string;title:string;display_address:string;agent_name:string;kind:string}>();
 assert(listing,404,'CHECK_IN_LISTING_MISSING','Property listing unavailable.');
 const sessions=(await statement(env.DB,
  'SELECT id,starts_at,ends_at,status FROM leasing_sessions WHERE listing_id=? ORDER BY starts_at DESC LIMIT 100',
  listingId).all()).results;
 const rows=(await statement(env.DB,
  'SELECT c.id,c.session_id,c.registered_lead_id,c.contact_envelope,c.consent_version,c.arrived_at,c.source,e.id AS sync_event_id,e.status AS sheet_status,s.starts_at FROM leasing_checkins c JOIN leasing_sessions s ON s.id=c.session_id JOIN open_home_sheet_events e ON e.checkin_id=c.id WHERE c.listing_id=? AND (? IS NULL OR c.session_id=?) ORDER BY c.arrived_at DESC LIMIT 500',
  listingId,sessionId??null,sessionId??null).all<{
   id:string;session_id:string;registered_lead_id:string|null;contact_envelope:string;
   consent_version:string;arrived_at:string;source:string;sync_event_id:string;
   sheet_status:string;starts_at:string;
  }>()).results;
 return {listing,sessions,sheetConnected:env.OPEN_HOME_SHEET_SYNC_ENABLED==='true',
  checkIns:await Promise.all(rows.map(async c=>({
   id:c.id,sessionId:c.session_id,preRegistered:Boolean(c.registered_lead_id),source:c.source,
   arrivedAt:c.arrived_at,sessionStart:c.starts_at,
   sheetStatus:c.sheet_status,consentVersion:c.consent_version,
   contact:await unseal<{name:string;phone:string;email:string}>(
     env.DATA_ENCRYPTION_KEY,'open-home-checkin:'+c.id,c.contact_envelope),
  })))};
}
