import type { Env } from '../database/types';
import { statement, now, uid } from '../database/types';
import { seal, unseal } from '../auth/crypto';
import { noticeRecipient } from './notice-access';
export interface MailJob {
  to: string; subject: string; heading: string; body: string; href?: string;
  facts?: Record<string, string>; sensitive?: boolean;
  noticeAccess?: { noticeId: string; userId: string };
}
export async function mailEvent(env: Env, kind: string, payload: MailJob, id = uid('evt')) {
  return statement(env.DB,'INSERT INTO outbox_events(id,kind,envelope,available_at,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING',id,kind,await seal(env.DATA_ENCRYPTION_KEY,`outbox:${id}`,payload),now(),now());
}
function escape(value: string) {
  return value.replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
}
export function renderMail(job: MailJob) {
  const facts=Object.entries(job.facts??{}).map(([k,v])=>`<tr><th align="left" style="padding:10px;color:#475569">${escape(k)}</th><td style="padding:10px">${escape(v)}</td></tr>`).join('');
  return `<div style="font-family:Arial,sans-serif;background:#f3f6f8;padding:32px"><div style="max-width:600px;margin:auto;background:white;border-radius:12px;overflow:hidden"><div style="background:#142c41;padding:24px;color:white;font-size:22px;font-weight:bold">ProInspect</div><div style="padding:28px"><h1 style="font-size:22px">${escape(job.heading)}</h1><p style="line-height:1.6">${escape(job.body)}</p><table style="width:100%;border-collapse:collapse">${facts}</table>${job.href?`<p style="margin-top:28px"><a href="${escape(job.href)}" style="display:inline-block;padding:12px 18px;background:#076b70;color:white;text-decoration:none;border-radius:6px">Open ProInspect</a></p>`:''}<p style="font-size:12px;color:#64748b">Property inspections and operational support.</p></div></div></div>`;
}
export async function dispatchOutbox(env: Env) {
  if(!env.EVENTS)return;
  const rows=await statement(env.DB,`SELECT id FROM outbox_events WHERE status='pending' AND available_at<=? ORDER BY created_at LIMIT 50`,now()).all<{id:string}>();
  for(const row of rows.results){await env.EVENTS.send({eventId:row.id});await statement(env.DB,`UPDATE outbox_events SET available_at=? WHERE id=? AND status='pending'`,new Date(Date.now()+300000).toISOString(),row.id).run();}
  await statement(env.DB,`UPDATE outbox_events SET status='pending',lease_token=NULL,lease_until=NULL WHERE status='processing' AND lease_until<?`,now()).run();
}
export async function deliverEvent(env: Env,eventId: string) {
  const lease=uid('lease');
  const row=await statement(env.DB,`UPDATE outbox_events SET status='processing',lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND (status='pending' OR (status='processing' AND lease_until<?)) AND attempts<6 RETURNING id,envelope,attempts,kind`,lease,new Date(Date.now()+120000).toISOString(),eventId,now()).first<{id:string;envelope:string;attempts:number;kind:string}>();
  if(!row)return;
  try {
    const payload=await unseal<MailJob>(env.DATA_ENCRYPTION_KEY,`outbox:${row.id}`,row.envelope);
    if(payload.noticeAccess){
      const recipient=await noticeRecipient(env,payload.noticeAccess.noticeId,payload.noticeAccess.userId);
      if(!recipient||recipient.email.toLowerCase()!==payload.to.toLowerCase()){
        await env.DB.batch([
          statement(env.DB,"UPDATE outbox_events SET status='failed',error_code='NOTICE_SUPPRESSED',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",row.id,lease),
          statement(env.DB,"UPDATE notice_deliveries SET status='suppressed' WHERE outbox_id=?",row.id),
          statement(env.DB,'DELETE FROM notifications WHERE id IN(SELECT notification_id FROM notice_deliveries WHERE outbox_id=?)',row.id),
        ]);return;
      }
    }
    if(env.EMAIL_PROVIDER==='local'&&env.APP_ENV==='local'){
      await statement(env.DB,`UPDATE outbox_events SET status='sent',sent_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?`,now(),row.id,lease).run();
      await statement(env.DB,"UPDATE notice_deliveries SET status='sent',delivered_at=? WHERE outbox_id=?",now(),row.id).run();return;
    }
    if(env.EMAIL_PROVIDER!=='resend'||!env.RESEND_API_KEY||!env.EMAIL_FROM)throw new Error('EMAIL_NOT_CONFIGURED');
    // Never redirect another person's sign-in token into a staging mailbox.
    if(env.APP_ENV==='staging'&&(!env.EMAIL_SINK||payload.to.toLowerCase()!==env.EMAIL_SINK.toLowerCase())&&payload.sensitive)throw new Error('STAGING_AUTH_RECIPIENT_BLOCKED');
    const to=env.APP_ENV==='staging'?env.EMAIL_SINK:payload.to;
    if(!to)throw new Error('EMAIL_SINK_REQUIRED');
    const response=await fetch('https://api.resend.com/emails',{
      method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':row.id},
      body:JSON.stringify({from:env.EMAIL_FROM,to:[to],subject:env.APP_ENV==='staging'?`[STAGING] ${payload.subject}`:payload.subject,html:renderMail(payload),text:`${payload.heading}\n\n${payload.body}\n${Object.entries(payload.facts??{}).map(([k,v])=>`${k}: ${v}`).join('\n')}\n${payload.href??''}`}),signal:AbortSignal.timeout(15000),
    });
    if(!response.ok)throw new Error(`EMAIL_HTTP_${response.status}`);
    await statement(env.DB,`UPDATE outbox_events SET status='sent',sent_at=?,lease_token=NULL,lease_until=NULL,error_code=NULL WHERE id=? AND lease_token=?`,now(),row.id,lease).run();
    await statement(env.DB,"UPDATE notice_deliveries SET status='sent',delivered_at=? WHERE outbox_id=?",now(),row.id).run();
  }catch(error){
    const code=error instanceof Error&&/^(EMAIL_|STAGING_)/.test(error.message)?error.message:'EMAIL_DELIVERY_FAILED';
    await statement(env.DB,`UPDATE outbox_events SET status=?,available_at=?,lease_token=NULL,lease_until=NULL,error_code=? WHERE id=? AND lease_token=?`,row.attempts>=6?'failed':'pending',new Date(Date.now()+Math.min(3600000,60000*2**row.attempts)).toISOString(),code,row.id,lease).run();
    if(row.attempts>=6)await statement(env.DB,"UPDATE notice_deliveries SET status='failed' WHERE outbox_id=?",row.id).run();
    throw new Error(code);
  }
}
export async function consumeQueue(batch:MessageBatch<{eventId:string}>,env:Env){
  for(const message of batch.messages){try{await deliverEvent(env,message.body.eventId);message.ack();}catch{message.retry({delaySeconds:60});}}
}
