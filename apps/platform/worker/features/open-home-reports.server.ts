import { z } from 'zod';
import { statement, assert, now, type Env } from '../../../../packages/database/types';
import type { Principal } from '../../../../packages/domain/index';
import { operationsWrite } from '../../../../packages/authorization/server';
import { unseal } from '../../../../packages/auth/crypto';
import { mailEvent, type MailJob } from '../../../../packages/notifications/server';
import { isPerthNineAm, previousPerthDayWindow, perthDay, formatPerthReportTime } from '../../../../packages/marketing/open-home-report';

const optionsSql='SELECT DISTINCT u.id,u.email,u.display_name,c.name AS client_name '+
 'FROM leasing_listings l '+
 'JOIN client_memberships m ON m.client_id IN(l.instructed_by_client_id,l.owner_client_id) '+
 'JOIN clients c ON c.id=m.client_id JOIN users u ON u.id=m.user_id '+
 "WHERE l.id=? AND u.active=1 AND u.verified_at IS NOT NULL AND m.active=1 AND m.role IN('owner','admin') AND c.status='active'";
type Recipient={id:string;email:string;display_name:string;client_name:string};
export async function eligibleReportRecipients(env:Env,listingId:string):Promise<Recipient[]>{
 return (await statement(env.DB,optionsSql+' ORDER BY client_name,email',listingId).all<Recipient>()).results;
}
export async function authorisedReportRecipient(env:Env,listingId:string,userId:string){
 return statement(env.DB,optionsSql+' AND u.id=? LIMIT 1',listingId,userId).first<Recipient>();
}
export const reportSettingsInput=z.object({
 version:z.number().int().min(0),
 enabled:z.boolean(),
 recipientUserId:z.string().min(3).max(120).nullable(),
 authorityReference:z.string().trim().max(200),
});
export async function saveOpenHomeReportSettings(env:Env,user:Principal,listingId:string,input:unknown){
 operationsWrite(user);
 const d=reportSettingsInput.parse(input);
 assert(!d.enabled || (d.recipientUserId!==null&&d.authorityReference.length>=5),
  422,'OPEN_HOME_REPORT_AUTHORITY_REQUIRED',
  'Choose a verified client recipient and record the written attendance-report authority.');
 const recipient=d.recipientUserId?await authorisedReportRecipient(env,listingId,d.recipientUserId):null;
 assert(!d.recipientUserId||recipient,422,'OPEN_HOME_REPORT_RECIPIENT_UNAUTHORISED',
  'Choose an active, verified owner or administrator from the authorised agency or landlord.');
 const listing=await statement(env.DB,'SELECT id FROM leasing_listings WHERE id=?',listingId).first();
 assert(listing,404,'OPEN_HOME_LISTING_MISSING','Property listing unavailable.');
 const timestamp=now();
 if(d.version===0){
  const insert=await statement(env.DB,
   'INSERT INTO open_home_report_settings(listing_id,enabled,recipient_user_id,authority_reference,configured_by,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(listing_id) DO NOTHING',
   listingId,d.enabled?1:0,d.recipientUserId,d.authorityReference,user.id,timestamp).run();
  assert(insert.meta.changes===1,409,'OPEN_HOME_REPORT_SETTINGS_STALE','Settings changed. Refresh and try again.');
 }else{
  const update=await statement(env.DB,
   'UPDATE open_home_report_settings SET enabled=?,recipient_user_id=?,authority_reference=?,configured_by=?,updated_at=?,version=version+1 WHERE listing_id=? AND version=?',
   d.enabled?1:0,d.recipientUserId,d.authorityReference,user.id,timestamp,listingId,d.version).run();
  assert(update.meta.changes===1,409,'OPEN_HOME_REPORT_SETTINGS_STALE','Settings changed. Refresh and try again.');
 }
 return {ok:true};
}
export async function staffOpenHomeReportDetails(env:Env,user:Principal,listingId:string,sessionId?:string){
 operationsWrite(user);
 const settings=await statement(env.DB,
  'SELECT enabled,recipient_user_id,authority_reference,version,updated_at FROM open_home_report_settings WHERE listing_id=?',
  listingId).first<{
   enabled:number;recipient_user_id:string|null;authority_reference:string;version:number;updated_at:string;
  }>();
 const reports=(await statement(env.DB,
  'SELECT r.session_id,r.session_end_at,r.report_date_perth,r.attendance_count,r.preregistered_arrivals,r.walk_in_arrivals,r.registered_count,r.queued_at,e.status AS delivery_status,e.sent_at,e.error_code,u.email AS recipient_email FROM open_home_inspection_reports r JOIN outbox_events e ON e.id=r.outbox_id JOIN users u ON u.id=r.recipient_user_id WHERE r.listing_id=? AND (? IS NULL OR r.session_id=?) ORDER BY r.session_end_at DESC LIMIT 100',
  listingId,sessionId??null,sessionId??null).all()).results;
 return {
  enabledGlobally:env.OPEN_HOME_REPORTS_ENABLED==='true',
  provider:env.OPEN_HOME_REPORT_EMAIL_PROVIDER==='cloudflare'?'Cloudflare Email Sending':
   env.OPEN_HOME_REPORT_EMAIL_PROVIDER==='resend'?'Resend (existing outbox)':'Unconfigured',
  settings:settings?{
   enabled:settings.enabled===1,recipientUserId:settings.recipient_user_id,
   authorityReference:settings.authority_reference,version:settings.version,updatedAt:settings.updated_at,
  }:{enabled:false,recipientUserId:null,authorityReference:'',version:0,updatedAt:null},
  eligibleRecipients:await eligibleReportRecipients(env,listingId),
  reports,
 };
}
type ReportableSession={
 id:string;listing_id:string;starts_at:string;ends_at:string;status:string;
 display_address:string;title:string;kind:string;slug:string;
 recipient_user_id:string|null;enabled:number|null;
};
/**
 * Runs only on Cloudflare's 01:00 UTC trigger: 09:00 Perth year-round.
 * Select the entire preceding Perth calendar day by the session END.
 * The UTC bounds are computed from the event's scheduledTime, not actual
 * execution time, so delayed Cron delivery cannot change the target date.
 */
export async function dispatchNextDayOpenHomeReports(env:Env,scheduledTime:number){
 if(env.OPEN_HOME_REPORTS_ENABLED!=='true'||!isPerthNineAm(scheduledTime))
  return {enabled:false,processed:0,queued:0};
 const window=previousPerthDayWindow(scheduledTime);
 const sql='SELECT s.id,s.listing_id,s.starts_at,s.ends_at,s.status,'+
  'l.display_address,l.title,l.kind,l.slug,cfg.enabled,cfg.recipient_user_id '+
  'FROM leasing_sessions s JOIN leasing_listings l ON l.id=s.listing_id '+
  'LEFT JOIN open_home_report_settings cfg ON cfg.listing_id=l.id '+
  "WHERE julianday(s.ends_at)>=julianday(?) AND julianday(s.ends_at)<julianday(?) "+
  "AND s.status IN('scheduled','completed') AND l.status IN('published','leased') "+
  'ORDER BY s.id LIMIT 1000';
 const rows=(await statement(env.DB,sql,window.startUtc,window.endUtc).all<ReportableSession>()).results;
 assert(rows.length<1000,503,'OPEN_HOME_REPORT_BATCH_LIMIT',
  'Daily inspection volume exceeds the reporting batch capacity.');
 let queued=0;
 for(const session of rows){
  // All finished sessions become completed, even where no recipient
  // is configured. Cancelled sessions never produce a report.
  if(session.status==='scheduled'){
   await statement(env.DB,
    "UPDATE leasing_sessions SET status='completed',updated_at=?,version=version+1 WHERE id=? AND status='scheduled'",
    now(),session.id).run();
  }
  if(session.enabled!==1||!session.recipient_user_id)continue;
  const recipient=await authorisedReportRecipient(env,session.listing_id,session.recipient_user_id);
  if(!recipient)continue; // revoked, inactive or unverified: fail closed
  const already=await statement(env.DB,'SELECT session_id FROM open_home_inspection_reports WHERE session_id=?',
   session.id).first();
  if(already)continue;
  const totals=await statement(env.DB,
   'SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN registered_lead_id IS NOT NULL THEN 1 ELSE 0 END),0) AS pre FROM leasing_checkins WHERE session_id=?',
   session.id).first<{total:number;pre:number}>();
  const registered=await statement(env.DB,
   "SELECT COUNT(*) AS count FROM leasing_leads WHERE session_id=? AND status='active' AND kind='inspection'",
   session.id).first<{count:number}>();
  const total=totals?.total??0,pre=totals?.pre??0;
  const reportId='evt_openhome_'+session.id;
  const facts={
   Property:session.display_address,
   Inspection:formatPerthReportTime(session.starts_at),
   'Inspection completed':formatPerthReportTime(session.ends_at),
   'Visitors checked in':String(total),
   'Pre-registered arrivals':String(pre),
   'Walk-in visitors':String(total-pre),
   'Active advance registrations':String(registered?.count??0),
  };
  const job:MailJob={
   to:recipient.email,
   subject:'Open home attendance report — '+session.display_address,
   heading:'Your open home attendance report',
   body:'Your inspection is complete. Review attendance totals below, then sign in to ProInspect with your authorised account to view or download the full visitor register. This report is for inspection administration, not marketing.',
   href:env.APP_ORIGIN.replace(/\/$/,'')+'/open-home/report/'+encodeURIComponent(session.id),
   facts,
   sensitive:true,
   reportAccess:{sessionId:session.id,recipientUserId:recipient.id},
  };
  // Atomic outbox + immutable report. A deterministic per-session event
  // identifier prevents duplicate logical report emails on Cron retries.
  await env.DB.batch([
   await mailEvent(env,'open-home.inspection.report',job,reportId),
   statement(env.DB,
    'INSERT INTO open_home_inspection_reports(session_id,listing_id,outbox_id,recipient_user_id,session_end_at,report_date_perth,attendance_count,preregistered_arrivals,walk_in_arrivals,registered_count,queued_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(session_id) DO NOTHING',
    session.id,session.listing_id,reportId,recipient.id,session.ends_at,perthDay(session.ends_at),
    total,pre,total-pre,registered?.count??0,now()),
  ]);
  queued++;
 }
 return {enabled:true,processed:rows.length,queued,reportDatePerth:window.reportDatePerth};
}
/** Re-check authorisation at delivery time to prevent stale/revoked sharing. */
export async function reportDeliveryStillAllowed(env:Env,outboxId:string,sessionId:string,recipientUserId:string,to:string){
 if(env.OPEN_HOME_REPORTS_ENABLED!=='true')return false;
 const r=await statement(env.DB,
  'SELECT r.listing_id FROM open_home_inspection_reports r '+
  'JOIN open_home_report_settings cfg ON cfg.listing_id=r.listing_id '+
  'JOIN users u ON u.id=r.recipient_user_id '+
  'JOIN leasing_sessions s ON s.id=r.session_id '+
  'WHERE r.outbox_id=? AND r.session_id=? AND r.recipient_user_id=? '+
  "AND cfg.enabled=1 AND cfg.recipient_user_id=r.recipient_user_id "+
  "AND u.email=? COLLATE NOCASE AND s.status='completed'",
  outboxId,sessionId,recipientUserId,to).first<{listing_id:string}>();
 return Boolean(r&&await authorisedReportRecipient(env,r.listing_id,recipientUserId));
}
export async function readOpenHomeReport(env:Env,user:Principal,sessionId:string){
 const report=await statement(env.DB,
  'SELECT r.session_id,r.listing_id,r.recipient_user_id,r.session_end_at,r.report_date_perth,r.attendance_count,r.preregistered_arrivals,r.walk_in_arrivals,r.registered_count,r.queued_at,s.starts_at,l.display_address,l.title,l.agent_name,e.status AS delivery_status FROM open_home_inspection_reports r JOIN leasing_sessions s ON s.id=r.session_id JOIN leasing_listings l ON l.id=r.listing_id JOIN outbox_events e ON e.id=r.outbox_id WHERE r.session_id=?',
  sessionId).first<{
   session_id:string;listing_id:string;recipient_user_id:string;session_end_at:string;report_date_perth:string;
   attendance_count:number;preregistered_arrivals:number;walk_in_arrivals:number;registered_count:number;
   queued_at:string;starts_at:string;display_address:string;title:string;agent_name:string;delivery_status:string;
  }>();
 assert(report,404,'OPEN_HOME_REPORT_NOT_FOUND','The attendance report is unavailable.');
 const staffAllowed=user.staffRole==='administrator'||user.staffRole==='operations_manager';
 if(!staffAllowed){
  const configured=await statement(env.DB,
   'SELECT recipient_user_id FROM open_home_report_settings WHERE listing_id=? AND enabled=1',
   report.listing_id).first<{recipient_user_id:string|null}>();
  assert(report.recipient_user_id===user.id && configured?.recipient_user_id===user.id &&
   await authorisedReportRecipient(env,report.listing_id,user.id),
   403,'OPEN_HOME_REPORT_ACCESS_DENIED','This report is restricted to the authorised leasing representative.');
 }
 const checkins=(await statement(env.DB,
  'SELECT id,contact_envelope,registered_lead_id,arrived_at FROM leasing_checkins WHERE session_id=? ORDER BY arrived_at,id LIMIT 501',
  sessionId).all<{
   id:string;contact_envelope:string;registered_lead_id:string|null;arrived_at:string;
  }>()).results;
 assert(checkins.length<=500,503,'OPEN_HOME_REPORT_TOO_LARGE','The register requires an administrator export.');
 const visitors=await Promise.all(checkins.map(async row=>{
  const contact=await unseal<{name:string;phone:string;email:string}>(
   env.DATA_ENCRYPTION_KEY,'open-home-checkin:'+row.id,row.contact_envelope);
  return {name:contact.name,phone:contact.phone,email:contact.email,
   arrivedAt:row.arrived_at,preRegistered:Boolean(row.registered_lead_id)};
 }));
 return {sessionId:report.session_id,listingId:report.listing_id,
  title:report.title,address:report.display_address,agentName:report.agent_name,
  startsAt:report.starts_at,endsAt:report.session_end_at,reportDatePerth:report.report_date_perth,
  totals:{attended:report.attendance_count,preRegistered:report.preregistered_arrivals,
   walkIns:report.walk_in_arrivals,advancedRegistrations:report.registered_count},
  deliveryStatus:report.delivery_status,visitors};
}
export function exportOpenHomeReportCsv(report:Awaited<ReturnType<typeof readOpenHomeReport>>){
 const headers=['Name','Phone','Email','Arrived (UTC)','Pre-registered'];
 const safe=(value:string)=>{
  // Mitigate spreadsheet formula evaluation when CSV is opened.
  const input=/^\s*[=+\-@\t\r]/.test(value)?"'"+value:value;
  return '"'+input.replace(/"/g,'""')+'"';
 };
 const rows=report.visitors.map(v=>[v.name,v.phone,v.email,v.arrivedAt,v.preRegistered?'Yes':'No']);
 return '\uFEFF'+[headers,...rows].map(row=>row.map(safe).join(',')).join('\r\n')+'\r\n';
}
