import { z } from 'zod';
import { assert, now, statement, type Env } from '../../../../packages/database/types';
import { digest, unseal } from '../../../../packages/auth/crypto';
import { OPEN_HOME_SHEET_COLUMNS } from '../../../../packages/marketing/open-home';

function isReady(env:Env):boolean {
 return env.OPEN_HOME_SHEET_SYNC_ENABLED==='true'&&
  Boolean(env.OPEN_HOME_SHEET_API_SECRET&&env.OPEN_HOME_SHEET_API_SECRET.length>=32&&env.DATA_ENCRYPTION_KEY);
}
function hex(s:string):Uint8Array<ArrayBuffer>{
 const b=new Uint8Array(s.length/2);
 for(let i=0;i<b.length;i++)b[i]=Number.parseInt(s.slice(i*2,i*2+2),16);
 return b;
}
/** Apps Script polls the Worker and verifies each request using a
 * secret HMAC, timestamp and one-time nonce. Never expose PII publicly. */
export async function authenticateOpenHomeSheetRequest(env:Env,request:Request,rawBody:string){
 assert(isReady(env),503,'SHEET_NOT_CONFIGURED','Open-home sheet integration is not enabled.');
 const timestamp=request.headers.get('X-ProInspect-Timestamp')??'';
 const nonce=request.headers.get('X-ProInspect-Nonce')??'';
 const signature=request.headers.get('X-ProInspect-Signature')??'';
 assert(/^\d{10}$/.test(timestamp)&&Math.abs(Date.now()-Number(timestamp)*1000)<=300000,
  403,'SHEET_SIGNATURE_STALE','Integration request expired.');
 assert(/^[a-f0-9-]{36}$/.test(nonce)&&/^[a-f0-9]{64}$/.test(signature),
  403,'SHEET_SIGNATURE_INVALID','Invalid integration signature.');
 const path=new URL(request.url).pathname;
 const signed=[timestamp,nonce,request.method,path,rawBody].join('\n');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.OPEN_HOME_SHEET_API_SECRET!),
  {name:'HMAC',hash:'SHA-256'},false,['verify']);
 const ok=await crypto.subtle.verify('HMAC',key,hex(signature),new TextEncoder().encode(signed));
 assert(ok,403,'SHEET_SIGNATURE_INVALID','Invalid integration signature.');
 await statement(env.DB,'DELETE FROM open_home_sheet_nonces WHERE expires_at<?',now()).run();
 const nonceHash=await digest(env.DATA_ENCRYPTION_KEY+':open-home-sheet-nonce:'+nonce);
 const recorded=await statement(env.DB,
  'INSERT INTO open_home_sheet_nonces(nonce_hash,expires_at) VALUES(?,?) ON CONFLICT DO NOTHING RETURNING nonce_hash',
  nonceHash,new Date(Date.now()+300000).toISOString()).first();
 assert(recorded,409,'SHEET_SIGNATURE_REPLAY','Integration request already processed.');
}
export async function pendingOpenHomeSheetRows(env:Env){
 const sql='SELECT e.id AS event_id,c.id AS checkin_id,c.contact_envelope,c.consent_version,'+
  'c.registered_lead_id,c.arrived_at,l.id AS listing_id,l.property_id,'+
  'l.display_address,l.agent_name,s.id AS session_id,s.starts_at '+
  'FROM open_home_sheet_events e '+
  'JOIN leasing_checkins c ON c.id=e.checkin_id '+
  'JOIN leasing_listings l ON l.id=c.listing_id '+
  'JOIN leasing_sessions s ON s.id=c.session_id '+
  "WHERE e.status='pending' ORDER BY e.created_at,e.id LIMIT 50";
 const rows=(await statement(env.DB,sql).all<{
  event_id:string;checkin_id:string;contact_envelope:string;consent_version:string;
  registered_lead_id:string|null;arrived_at:string;listing_id:string;property_id:string;
  display_address:string;agent_name:string;session_id:string;starts_at:string;
 }>()).results;
 const perth=(timestamp:string)=>new Intl.DateTimeFormat('en-AU',{
  timeZone:'Australia/Perth',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,
 }).format(new Date(timestamp));
 return {schemaVersion:'open-home-sheet-v1',headers:OPEN_HOME_SHEET_COLUMNS,
  rows:await Promise.all(rows.map(async r=>{
   const contact=await unseal<{name:string;phone:string;email:string}>(
    env.DATA_ENCRYPTION_KEY,'open-home-checkin:'+r.checkin_id,r.contact_envelope);
   return {eventId:r.event_id,checkinId:r.checkin_id,values:[
    r.checkin_id,perth(r.arrived_at),r.display_address,r.property_id,r.listing_id,
    r.session_id,perth(r.starts_at),contact.name,contact.phone,contact.email,
    r.registered_lead_id?'Yes':'No',r.agent_name,r.consent_version,r.event_id,
   ]};
  }))};
}
export async function acknowledgeOpenHomeSheetRow(env:Env,input:unknown){
 const d=z.object({
  eventId:z.string().min(5).max(100),
  rowNumber:z.number().int().min(2).max(10000000),
 }).parse(input);
 const row=await statement(env.DB,'SELECT status,sheet_row_number FROM open_home_sheet_events WHERE id=?',
  d.eventId).first<{status:string;sheet_row_number:number|null}>();
 assert(row,404,'SHEET_EVENT_UNKNOWN','Sync event unavailable.');
 if(row.status==='synced'){
  assert(row.sheet_row_number===d.rowNumber,409,'SHEET_ROW_MISMATCH',
   'A different spreadsheet row was previously acknowledged.');
  return {acknowledged:true,alreadySynced:true};
 }
 const changed=await statement(env.DB,
  "UPDATE open_home_sheet_events SET status='synced',sheet_row_number=?,synced_at=? WHERE id=? AND status='pending'",
  d.rowNumber,now(),d.eventId).run();
 assert(changed.meta.changes===1,409,'SHEET_EVENT_CHANGED','Sync event changed during acknowledgement.');
 return {acknowledged:true,alreadySynced:false};
}
