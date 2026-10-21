import type {Env} from '../../../../packages/database/types';
import {statement,now} from '../../../../packages/database/types';
import {unseal} from '../../../../packages/auth/crypto';
import {mailEvent} from '../../../../packages/notifications/server';
import type {GuestBookingInput} from '../../../../packages/guest-booking/index';
export async function dispatchGuestReminders(env:Env){
 const after=new Date(Date.now()+12*3600000).toISOString(),before=new Date(Date.now()+24*3600000).toISOString();
 const rows=await statement(env.DB,"SELECT o.id,o.reference,o.envelope,b.id booking_id,b.starts_at FROM guest_service_orders o JOIN bookings b ON b.id=o.booking_id WHERE o.status='confirmed' AND b.status='confirmed' AND b.starts_at>=? AND b.starts_at<? AND NOT EXISTS(SELECT 1 FROM guest_reminder_deliveries d WHERE d.booking_id=b.id) ORDER BY b.starts_at LIMIT 25",after,before).all<{id:string;reference:string;envelope:string;booking_id:string;starts_at:string}>();
 for(const row of rows.results){
  const person=await unseal<GuestBookingInput>(env.DATA_ENCRYPTION_KEY,'guest:'+row.id,row.envelope);
  const outboxId='evt_guest_reminder_'+row.booking_id;
  await env.DB.batch([
   await mailEvent(env,'guest.appointment.reminder',{to:person.email,subject:'ProInspect appointment reminder: '+row.reference,heading:'Your appointment is coming up',body:'Your appointment is scheduled for tomorrow. To request changes, use the secure booking link previously sent to your email.',facts:{Reference:row.reference,Appointment:new Intl.DateTimeFormat('en-AU',{dateStyle:'full',timeStyle:'short',timeZone:'Australia/Perth'}).format(new Date(row.starts_at))}},outboxId),
   statement(env.DB,"INSERT OR IGNORE INTO guest_reminder_deliveries(booking_id,outbox_id,created_at) VALUES(?,?,?)",row.booking_id,outboxId,now())
  ]);
 }
}
