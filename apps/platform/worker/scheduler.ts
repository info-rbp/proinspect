import {DurableObject} from 'cloudflare:workers';
import type {Env} from '../../../packages/database/types';
import {assert,AppError,statement,now,uid} from '../../../packages/database/types';
import type {Principal,Service} from '../../../packages/domain/index';
import {bookingSchema} from '../../../packages/validation/index';
import {workspace,propertyAccess} from '../../../packages/authorization/server';
import {digest,seal} from '../../../packages/auth/crypto';
import {mailEvent} from '../../../packages/notifications/server';
import {audit,catalogue} from './services.server';

export function appointmentWindow(service:Service,startsAt:string,clock=Date.now()){
 const starts=new Date(startsAt);assert(Number.isFinite(starts.getTime()),422,'DATE_INVALID','Choose a valid appointment.');
 const ends=new Date(starts.getTime()+service.duration_minutes*60000);const localStart=new Date(starts.getTime()+8*3600000);const localEnd=new Date(ends.getTime()+8*3600000);
 assert(starts.getTime()>=clock+service.notice_hours*3600000&&starts.getTime()<=clock+service.horizon_days*86400000,422,'OUTSIDE_BOOKING_WINDOW','Choose a date within this service booking window.');
 assert(localStart.getUTCDay()>=1&&localStart.getUTCDay()<=5,422,'OUTSIDE_HOURS','Appointments are available on weekdays.');
 assert(localStart.getUTCHours()>=8&&localEnd.getUTCHours()<=17&&(localEnd.getUTCHours()<17||localEnd.getUTCMinutes()===0)&&localStart.getUTCDate()===localEnd.getUTCDate(),422,'OUTSIDE_HOURS','Choose an appointment within 8 am to 5 pm AWST.');
 assert(starts.getUTCMinutes()%15===0&&starts.getUTCSeconds()===0&&starts.getUTCMilliseconds()===0,422,'INVALID_SLOT','Choose a 15-minute appointment slot.');
 return {startsAt:starts.toISOString(),endsAt:ends.toISOString(),reservedStart:new Date(starts.getTime()-service.buffer_before*60000).toISOString(),reservedEnd:new Date(ends.getTime()+service.buffer_after*60000).toISOString()};
}
export async function availability(env:Env,serviceId:string,date:string){
 assert(/^\d{4}-\d{2}-\d{2}$/.test(date),422,'DATE_INVALID','Choose a valid date.');const service=(await catalogue(env)).find(s=>s.id===serviceId);assert(service,404,'SERVICE_NOT_FOUND','Service not found.');
 if(service.booking_mode!=='instant')return {slots:[],message:'This service is arranged by request. Contact ProInspect to confirm the scope and appointment.'};
 const resource=await statement(env.DB,"SELECT id FROM schedule_resources WHERE id='default' AND active=1").first();if(!resource)return {slots:[],message:'Online scheduling has not been opened yet.'};
 const candidates=[];for(let minutes=480;minutes<1020;minutes+=15){try{const start=`${date}T${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}:00+08:00`;const window=appointmentWindow(service,start);const conflict=await statement(env.DB,`SELECT id FROM bookings WHERE resource_id='default' AND status!='cancelled' AND reserved_start<? AND reserved_end>? UNION ALL SELECT id FROM schedule_blocks WHERE resource_id='default' AND starts_at<? AND ends_at>? LIMIT 1`,window.reservedEnd,window.reservedStart,window.reservedEnd,window.reservedStart).first();if(!conflict)candidates.push({start:window.startsAt,end:window.endsAt,label:new Intl.DateTimeFormat('en-AU',{hour:'numeric',minute:'2-digit',timeZone:'Australia/Perth'}).format(new Date(window.startsAt))});}catch(error){if(!(error instanceof AppError))throw error;}}
 return {slots:candidates,message:candidates.length?'':'No appointments are available for this date.'};
}
export class BookingScheduler extends DurableObject<Env>{
 private tail:Promise<unknown>=Promise.resolve();
 async fetch(request:Request){const task=this.tail.then(()=>this.reserve(request));this.tail=task.catch(()=>undefined);return task;}
 private async reserve(request:Request){try{
  const {userId,clientId,input}=await request.json() as {userId:string;clientId:string;input:unknown};const user=await statement(this.env.DB,'SELECT id,email,display_name FROM users WHERE id=? AND active=1',userId).first<Principal>();assert(user,403,'USER_INACTIVE','This account is not active.');
  const w=await workspace(this.env,user,'landlord',clientId);const data=bookingSchema.parse(input);const property=await propertyAccess(this.env,user,w,data.propertyId,true);
  const fingerprint=await digest(JSON.stringify({propertyId:data.propertyId,serviceId:data.serviceId,startsAt:new Date(data.startsAt).toISOString(),access:data.access}));
  const existing=await statement(this.env.DB,'SELECT id,reference,fingerprint,user_id FROM bookings WHERE client_id=? AND request_key=?',clientId,data.requestKey).first<{id:string;reference:string;fingerprint:string;user_id:string}>();
  if(existing){assert(existing.fingerprint===fingerprint&&existing.user_id===userId,409,'IDEMPOTENCY_MISMATCH','This submission key was already used. Reload and review the booking.');return Response.json({id:existing.id,reference:existing.reference,replayed:true});}
  const service=(await catalogue(this.env)).find(s=>s.id===data.serviceId);assert(service&&service.booking_mode==='instant'&&service.price_ex_gst_cents!==null,409,'SERVICE_NOT_OPEN','Online booking is not yet enabled for this service.');assert(service.sectors.includes(property.sector),422,'SERVICE_SECTOR_MISMATCH','This service is not available for the selected property category.');
  assert(await statement(this.env.DB,"SELECT id FROM schedule_resources WHERE id='default' AND active=1").first(),409,'SCHEDULING_CLOSED','Online scheduling is not yet open.');
  if(data.access.method==='tenant')assert(data.access.noticeConfirmed,422,'ACCESS_CONFIRMATION_REQUIRED','Confirm the access and notice arrangements before booking.');
  const window=appointmentWindow(service,data.startsAt);const id=uid('bkg'),reference=`PI-${crypto.randomUUID().slice(0,8).toUpperCase()}`,woId=`wo_${id.slice(4)}`,time=now();
  const statements=[statement(this.env.DB,`INSERT INTO bookings(id,reference,client_id,user_id,property_id,service_id,resource_id,starts_at,ends_at,reserved_start,reserved_end,price_ex_gst_cents,snapshot_json,request_key,fingerprint,created_at) VALUES(?,?,?,?,?,?,'default',?,?,?,?,?,?,?,?,?)`,id,reference,clientId,user.id,property.id,service.id,window.startsAt,window.endsAt,window.reservedStart,window.reservedEnd,service.price_ex_gst_cents,JSON.stringify({property,serviceName:service.name,customerName:user.display_name,customerEmail:user.email}),data.requestKey,fingerprint,time),statement(this.env.DB,`INSERT INTO work_orders(id,reference,booking_id,client_id,property_id,title,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'scheduled',?,?)`,woId,`WO-${reference.slice(3)}`,id,clientId,property.id,service.name,time,time),statement(this.env.DB,'INSERT INTO booking_access_secrets(booking_id,envelope,updated_at) VALUES(?,?,?)',id,await seal(this.env.DATA_ENCRYPTION_KEY,`booking:${id}`,data.access),time),audit(this.env,user,'booking.created','booking',id,property.id,{workOrderId:woId}),await mailEvent(this.env,'booking.confirmed',{to:user.email,subject:`Booking confirmed: ${reference}`,heading:'Your booking is confirmed',body:'Your booking and work order are now linked to your property. Your report will appear in your account after it is issued.',href:`${this.env.APP_ORIGIN}${w.href}/bookings`,facts:{Reference:reference,Service:service.name,Property:`${property.address}, ${property.suburb}`,Appointment:new Intl.DateTimeFormat('en-AU',{dateStyle:'full',timeStyle:'short',timeZone:'Australia/Perth'}).format(new Date(window.startsAt))}})];
  if(this.env.OPERATIONS_EMAIL)statements.push(await mailEvent(this.env,'operations.booking',{to:this.env.OPERATIONS_EMAIL,subject:`New work order: ${reference}`,heading:'New service booking',body:'Assign staff and review the access arrangements in ProInspect. Confidential access instructions are not included in email.',href:`${this.env.APP_ORIGIN}/w/staff/operations/work-orders`,facts:{Booking:reference,Service:service.name,Property:`${property.address}, ${property.suburb}`}}));
  await this.env.DB.batch(statements);return Response.json({id,reference,workOrderId:woId},{status:201});
 }catch(error){if(error instanceof AppError)return Response.json({code:error.code,message:error.message},{status:error.status});if(error instanceof Error&&/SCHEDULE_CONFLICT|SCHEDULE_BLOCKED/.test(error.message))return Response.json({code:'SCHEDULE_CONFLICT',message:'That appointment has just become unavailable. Choose another time.'},{status:409});throw error;}}
}
