import { z } from 'zod';
import type { Env } from '../../../../packages/database/types';
import { assert, statement, now, uid } from '../../../../packages/database/types';
import { randomToken, digest, seal, unseal } from '../../../../packages/auth/crypto';
import { mailEvent } from '../../../../packages/notifications/server';
import { requireOrigin, isLocal } from '../../../../packages/auth/server';
import { guestBookingSchema, guestChangeSchema, guestQuoteSchema, isGuestDirectBookable, type GuestBookingInput } from '../../../../packages/guest-booking/index';
import { addressKey } from '../../../../packages/validation/index';
import { catalogue } from '../services.server';
import { availability } from '../scheduler';
import { readJson } from '../../../../packages/operations/core';

type Order = {id:string;reference:string;status:string;envelope:string;service_id:string;sector:string;price_basis:'published'|'quote';price_ex_gst_cents:number|null;property_id:string|null;booking_id:string|null;fingerprint:string;quote_expires_at:string|null;verified_at:string|null};
const SYSTEM='usr_guest_booking_system';
const CLIENT='cli_guest_transactions';
function safe(order:Order){return {reference:order.reference,status:order.status,priceExGstCents:order.price_ex_gst_cents,priceBasis:order.price_basis,hasAppointment:Boolean(order.booking_id)};}
async function limit(env:Env,part:string,max:number){
 const key=await digest(env.DATA_ENCRYPTION_KEY+':guest:'+part),time=now(),expires=new Date(Date.now()+900000).toISOString();
 const row=await statement(env.DB,"INSERT INTO guest_request_limits(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING attempts",key,expires,time,time).first<{attempts:number}>();
 assert(row && row.attempts<=max,429,'RATE_LIMITED','Too many requests. Try again later.');
}
async function bot(request:Request,env:Env,token?:string){
 if(isLocal(request,env))return;
 assert(env.TURNSTILE_SECRET_KEY && token,503,'SECURITY_UNAVAILABLE','Security verification unavailable.');
 const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:token}),signal:AbortSignal.timeout(10000)});
 const result=await response.json() as {success?:boolean;hostname?:string;action?:string};
 assert(result.success && result.hostname===new URL(env.APP_ORIGIN).hostname && result.action==='guest_booking',403,'SECURITY_CHECK_FAILED','Complete the security check again.');
}
async function link(env:Env,orderId:string,purpose:'verify'|'manage'|'quote'|'report',docId?:string){
 const token=randomToken(),hash=await digest(token);
 await statement(env.DB,'INSERT INTO guest_access_links(token_hash,order_id,purpose,document_id,expires_at,created_at) VALUES(?,?,?,?,?,?)',hash,orderId,purpose,docId??null,new Date(Date.now()+(purpose==='verify'?15*60000:purpose==='report'?7*86400000:30*86400000)).toISOString(),now()).run();
 return token;
}
async function lookup(env:Env,token:string,purpose:string){
 assert(/^[a-f0-9]{64}$/.test(token),404,'LINK_INVALID','This link is invalid or expired.');
 const row=await statement(env.DB,'SELECT l.token_hash,l.document_id,l.consumed_at,o.* FROM guest_access_links l JOIN guest_service_orders o ON o.id=l.order_id WHERE l.token_hash=? AND l.purpose=? AND l.expires_at>? AND l.consumed_at IS NULL',await digest(token),purpose,now()).first<Order&{token_hash:string;document_id:string|null}>();
 assert(row,404,'LINK_INVALID','This link is invalid or expired.');
 return row;
}
async function orderById(env:Env,id:string){const row=await statement(env.DB,'SELECT * FROM guest_service_orders WHERE id=?',id).first<Order>();assert(row,404,'ORDER_NOT_FOUND','Guest request not found.');return row;}
async function notify(env:Env,order:Order,input:GuestBookingInput,subject:string,heading:string,body:string,href?:string){
 return mailEvent(env,'guest.booking',{to:input.email,subject,heading,body,href,sensitive:Boolean(href),facts:{Reference:order.reference,Service:order.service_id}});
}
export async function beginGuest(request:Request,env:Env){
 requireOrigin(request,env);
 const input=guestBookingSchema.parse(await readJson(request));
 assert(!input.website,422,'BOT_REJECTED','Invalid request.');
 await limit(env,'ip:'+request.headers.get('CF-Connecting-IP'),12);
 await limit(env,'email:'+input.email,5);
 await bot(request,env,input.turnstile);
 const service=(await catalogue(env)).find(s=>s.id===input.serviceId);
 assert(service && service.active===1 && service.sectors.includes(input.sector),422,'SERVICE_UNAVAILABLE','Choose an available service for this property.');
 const published=isGuestDirectBookable(service);
 if(input.startsAt)assert(published,422,'QUOTE_REQUIRED','A quote must be accepted before an appointment is booked.');
 const fingerprint=await digest(JSON.stringify({...input,turnstile:undefined}));
 const existing=await statement(env.DB,'SELECT id,fingerprint,reference FROM guest_service_orders WHERE request_key=?',input.requestKey).first<{id:string;fingerprint:string;reference:string}>();
 if(existing){assert(existing.fingerprint===fingerprint,409,'RETRY_CHANGED','This request key has already been used.');return {reference:existing.reference,message:'Check your email for your verification link.'};}
 const id=uid('gst'),reference='PI-G-'+crypto.randomUUID().slice(0,8).toUpperCase(),time=now();
 const token=randomToken();
 const rows=[
 statement(env.DB,"INSERT INTO guest_service_orders(id,reference,request_key,fingerprint,envelope,service_id,sector,status,price_basis,price_ex_gst_cents,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending_verification',?,?,?,?)",id,reference,input.requestKey,fingerprint,await seal(env.DATA_ENCRYPTION_KEY,'guest:'+id,input),input.serviceId,input.sector,published?'published':'quote',published?service.price_ex_gst_cents:null,time,time),
 statement(env.DB,'INSERT INTO guest_access_links(token_hash,order_id,purpose,expires_at,created_at) VALUES(?,? ,\'verify\',?,?)',await digest(token),id,new Date(Date.now()+900000).toISOString(),time),
 await mailEvent(env,'guest.verify',{to:input.email,subject:'Verify your ProInspect service request',heading:'Verify your email address',body:'Confirm your email to continue your one-off service request. This link expires in 15 minutes. Your appointment is not reserved until you receive a booking confirmation.',href:env.APP_ORIGIN+'/guest/verify?token='+token,sensitive:true,facts:{Reference:reference}})
 ];
 await env.DB.batch(rows);
 return {...safe({id,reference,status:'pending_verification',price_basis:published?'published':'quote',price_ex_gst_cents:published?service.price_ex_gst_cents:null,booking_id:null} as Order),message:'Check your email for your verification link.',...(isLocal(request,env)?{localVerifyToken:token}: {})};
}
export async function verifyGuest(request:Request,env:Env){
 requireOrigin(request,env);
 const {token}=z.object({token:z.string()}).parse(await readJson(request));
 await limit(env,'verify:'+request.headers.get('CF-Connecting-IP'),25);
 const order=await lookup(env,token,'verify');
 const input=await unseal<GuestBookingInput>(env.DATA_ENCRYPTION_KEY,'guest:'+order.id,order.envelope);
 const manage=await link(env,order.id,'manage');
 const next=order.price_basis==='quote'?'quote_requested':'verified';
 await env.DB.batch([
  statement(env.DB,'UPDATE guest_access_links SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL',now(),order.token_hash),
  statement(env.DB,"UPDATE guest_service_orders SET verified_at=?,status=?,updated_at=? WHERE id=? AND status='pending_verification'",now(),next,now(),order.id),
  await notify(env,order,input,'Your ProInspect request is verified','Request received',order.price_basis==='quote'?'We will review the service scope and provide a quote. This is not a confirmed appointment.':'Your email is confirmed. Continue using your private link to request an appointment.',env.APP_ORIGIN+'/guest/manage?token='+manage)
 ]);
 return {reference:order.reference,status:next,...(isLocal(request,env)?{localManageToken:manage}:{}),message:'Email verified. Open the management link sent to your inbox.'};
}
export async function guestStatus(env:Env,token:string){
 const order=await lookup(env,token,'manage');
 return safe(order);
}
export async function guestAvailability(env:Env,serviceId:string,date:string){
 return availability(env,serviceId,date);
}
export async function guestAction(request:Request,env:Env){
 requireOrigin(request,env);
 const data=guestChangeSchema.parse(await readJson(request));
 await limit(env,'manage:'+request.headers.get('CF-Connecting-IP'),30);
 const order=await lookup(env,data.token,'manage');
 const input=await unseal<GuestBookingInput>(env.DATA_ENCRYPTION_KEY,'guest:'+order.id,order.envelope);
 if(data.action==='cancel' && !order.booking_id){
  await statement(env.DB,"UPDATE guest_service_orders SET status='cancelled',updated_at=? WHERE id=? AND status NOT IN('confirmed','cancelled')",now(),order.id).run();
  return {reference:order.reference,status:'cancelled'};
 }
 assert(order.verified_at,409,'EMAIL_UNVERIFIED','Verify your email first.');
 if(data.action==='confirm' && !order.booking_id){
  assert(order.status==='verified'||order.status==='awaiting_appointment',409,'BOOKING_NOT_READY','Your request requires review before confirmation.');
  assert(data.startsAt,422,'DATE_REQUIRED','Select an available appointment.');
 }
 assert(order.booking_id||data.action==='confirm',409,'NO_APPOINTMENT','No confirmed appointment is associated with this request.');
 if(data.action==='reschedule')assert(data.startsAt,422,'DATE_REQUIRED','Choose a new appointment.');
 return env.SCHEDULER.get(env.SCHEDULER.idFromName('default')).fetch(new Request('https://scheduler.internal/guest',{method:'POST',body:JSON.stringify({orderId:order.id,action:data.action,startsAt:data.startsAt})}));
}
export async function staffGuestOrders(env:Env){
 const rows=await statement(env.DB,"SELECT id,reference,status,service_id,price_basis,price_ex_gst_cents,created_at FROM guest_service_orders ORDER BY created_at DESC LIMIT 100").all();
 return {orders:rows.results};
}
export async function staffGuestAction(env:Env,id:string,action:string,body:unknown,userId:string){
 const order=await orderById(env,id);
 const input=await unseal<GuestBookingInput>(env.DATA_ENCRYPTION_KEY,'guest:'+order.id,order.envelope);
 assert(order.verified_at,409,'UNVERIFIED','Email verification is required.');
 if(action==='quote'){
  const quote=guestQuoteSchema.parse(body);
  assert(order.price_basis==='quote' && ['quote_requested','quote_sent'].includes(order.status),409,'NOT_QUOTABLE','Request is not awaiting a quotation.');
  const expiry=new Date(Date.now()+quote.validDays*86400000).toISOString();
  const token=await link(env,id,'quote');
  await env.DB.batch([
   statement(env.DB,"UPDATE guest_service_orders SET price_ex_gst_cents=?,quote_expires_at=?,status='quote_sent',updated_at=? WHERE id=?",quote.priceExGstCents,expiry,now(),id),
   await notify(env,order,input,'Your ProInspect service quotation','Review your quotation','Your price is '+new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(quote.priceExGstCents/100)+' excluding GST. You may accept it before its expiry. A date will be selected separately.',env.APP_ORIGIN+'/guest/quote?token='+token)
  ]);
  return {ok:true};
 }
 if(action==='review'){
  const d=z.object({approve:z.boolean()}).parse(body);
  assert(order.status==='review_required',409,'NOT_REVIEWABLE','Not awaiting property review.');
  await statement(env.DB,'UPDATE guest_service_orders SET status=?,updated_at=?,property_reviewed_by=?,property_reviewed_at=? WHERE id=?',d.approve?'awaiting_appointment':'cancelled',now(),userId,now(),id).run();
  if(d.approve){
    const manage=await link(env,id,'manage');
    await (await notify(env,order,input,'Your ProInspect request can proceed','Select an appointment','Your property details have been reviewed. Select an appointment using this private link.',env.APP_ORIGIN+'/guest/manage?token='+manage)).run();
  }
  return {ok:true};
 }
 assert(false,404,'NOT_FOUND','Action not available.');
}
export async function acceptGuestQuote(request:Request,env:Env){
 requireOrigin(request,env);
 const data=z.object({token:z.string()}).parse(await readJson(request));
 const order=await lookup(env,data.token,'quote');
 assert(order.status==='quote_sent'&&order.quote_expires_at&&order.quote_expires_at>now(),409,'QUOTE_EXPIRED','The quotation is no longer available.');
 const input=await unseal<GuestBookingInput>(env.DATA_ENCRYPTION_KEY,'guest:'+order.id,order.envelope);
 const manage=await link(env,order.id,'manage');
 await env.DB.batch([
 statement(env.DB,'UPDATE guest_access_links SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL',now(),order.token_hash),
 statement(env.DB,"UPDATE guest_service_orders SET status='awaiting_appointment',updated_at=? WHERE id=? AND status='quote_sent'",now(),order.id),
 await notify(env,order,input,'ProInspect quotation accepted','Quotation accepted','Your quote is accepted. Your appointment is not yet reserved. Select an available date using this link.',env.APP_ORIGIN+'/guest/manage?token='+manage)
 ]);
 return {ok:true,reference:order.reference,...(isLocal(request,env)?{localManageToken:manage}:{})};
}
export async function guestReport(env:Env,token:string){
 const access=await lookup(env,token,'report');
 assert(access.document_id && access.booking_id,404,'REPORT_NOT_FOUND','Report unavailable.');
 const doc=await statement(env.DB,"SELECT id,object_key FROM documents WHERE id=? AND booking_id=? AND status='issued' AND category='service_report'",access.document_id,access.booking_id).first<{id:string;object_key:string}>();
 assert(doc,404,'REPORT_NOT_FOUND','Report unavailable.');
 const file=await env.DOCUMENTS.get(doc.object_key);
 assert(file,404,'REPORT_NOT_FOUND','Report unavailable.');
 await statement(env.DB,'UPDATE guest_access_links SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL',now(),access.token_hash).run();
 return new Response(file.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="ProInspect-report.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
