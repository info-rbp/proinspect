import type {Env} from '../../../../packages/database/types';
import {statement,uid,now} from '../../../../packages/database/types';
import {randomToken,digest,unseal} from '../../../../packages/auth/crypto';
import {mailEvent} from '../../../../packages/notifications/server';
import type {GuestBookingInput} from '../../../../packages/guest-booking/index';
export async function guestReportDelivery(env:Env,bookingId:string,documentId:string,title:string){
 const order=await statement(env.DB,"SELECT id,reference,envelope FROM guest_service_orders WHERE booking_id=? AND status='confirmed'",bookingId).first<{id:string;reference:string;envelope:string}>();
 if(!order)return null;
 const person=await unseal<GuestBookingInput>(env.DATA_ENCRYPTION_KEY,'guest:'+order.id,order.envelope);
 const token=randomToken(),time=now();
 return [
 statement(env.DB,"INSERT INTO guest_access_links(token_hash,order_id,purpose,document_id,expires_at,created_at) VALUES(?,?,'report',?,?,?)",await digest(token),order.id,documentId,new Date(Date.now()+7*86400000).toISOString(),time),
 await mailEvent(env,'guest.report.issued',{to:person.email,subject:'Your ProInspect report is ready: '+order.reference,heading:'Your report is ready',body:'Download your report from this secure one-time link. It expires in seven days. The link only opens the report from this service.',href:env.APP_ORIGIN+'/api/guest/report?token='+token,sensitive:true,facts:{Reference:order.reference,Report:title}})
 ];
}
