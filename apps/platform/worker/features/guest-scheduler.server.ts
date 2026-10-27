import {eligiblePcrDiscount,reservePcrDiscount,releaseUnstartedPcrDiscount} from './pcr-discounts.server';
import {requireReleaseApproval} from './release-governance.server';
import {pcrAppointmentPrice} from '../../../../packages/marketing/pcr-campaign';
import {resolveGuestPrice} from './service-pricing.server';
import {assertCalendarSlot,calendarEventId,calendarSchedulingEnabled,calendarSyncStatement} from './calendar-scheduling.server';
import {legalStatements} from './legal-acceptance.server';
import type { Env } from '../../../../packages/database/types';
import {assert,statement,uid,now} from '../../../../packages/database/types';
import {appointmentWindow} from '../scheduler';
import {catalogue} from '../services.server';
import {addressKey} from '../../../../packages/validation/index';
import {seal,unseal,digest} from '../../../../packages/auth/crypto';
import {mailEvent} from '../../../../packages/notifications/server';
import {projection,guard,clearGuard} from '../../../../packages/operations/core';
import type {GuestBookingInput} from '../../../../packages/guest-booking/index';
type Order={id:string;reference:string;envelope:string;status:string;service_id:string;sector:string;price_basis:string;offer_code?:string|null;purchaser_email_hash?:string|null;price_ex_gst_cents:number|null;gst_cents?:number|null;sale_variant_id?:string|null;sale_quantity?:number;pricing_snapshot_json?:string|null;property_id:string|null;booking_id:string|null;verified_at:string|null;property_reviewed_at:string|null};
const SYSTEM='usr_guest_booking_system',CLIENT='cli_guest_transactions';
export async function guestSchedulerOperation(env:Env,raw:unknown){
 const data=raw as {orderId?:string;action?:string;startsAt?:string;legalConsent?:unknown;applyPcrDiscount?:boolean;discountTotalCents?:number;appointmentTotalCents?:number};
 assert(data && typeof data.orderId==='string' && /^(confirm|cancel|reschedule)$/.test(data.action||''),422,'INVALID_GUEST_ACTION','Invalid booking action.');
 const o=await statement(env.DB,'SELECT * FROM guest_service_orders WHERE id=?',data.orderId).first<Order>();
 assert(o && o.verified_at,404,'BOOKING_NOT_FOUND','Booking not found.');
 const input=await unseal<GuestBookingInput>(env.DATA_ENCRYPTION_KEY,'guest:'+o.id,o.envelope);
 const campaign=o.offer_code==='pcr100';
 if(campaign)await requireReleaseApproval(env,'pcr_launch');
 const service=(await catalogue(env)).find(s=>s.id===o.service_id);
 assert(service && service.active===1 && service.sectors.includes(o.sector),409,'SERVICE_UNAVAILABLE','This service is not currently available.');
 if(data.action==='confirm'){
  assert(!o.booking_id,409,'ALREADY_BOOKED','Your appointment is already confirmed.');
  assert(['verified','awaiting_appointment'].includes(o.status),409,'REVIEW_REQUIRED','This request requires review before booking.');
  assert(o.price_ex_gst_cents!==null,409,'QUOTE_REQUIRED','A confirmed price is required before scheduling.');
  if(o.sale_variant_id){
   const price=await resolveGuestPrice(env,{...input,saleVariantId:o.sale_variant_id,saleQuantity:o.sale_quantity??1},service);
   assert(price&&price.priceExGstCents===o.price_ex_gst_cents&&price.gstCents===o.gst_cents&&JSON.stringify(price.snapshot)===o.pricing_snapshot_json,409,'PRICE_CHANGED','The approved price scope has changed or expired. Obtain a new reviewed request.');
  }else if(!campaign)assert(o.price_basis==='quote'||(service.booking_mode==='instant'&&service.price_ex_gst_cents===o.price_ex_gst_cents),409,'PRICE_CHANGED','The published price has changed. Obtain an updated quote.');
 }
 if(data.action!=='confirm') assert(o.booking_id&&o.status==='confirmed',409,'NOT_CONFIRMED','No confirmed appointment is available.');
 if(campaign&&data.action==='reschedule')assert(false,409,'PCR_RESCHEDULE_REVIEW','Please contact ProInspect to review a PCR reschedule and any weekend price adjustment.');
 const time=now();
 const old=o.booking_id?await statement(env.DB,'SELECT * FROM bookings WHERE id=? AND status=\'confirmed\'',o.booking_id).first<{id:string;reference:string;starts_at:string;version:number;property_id:string}>():null;
 const oldWork=old?await statement(env.DB,'SELECT id,status,version FROM work_orders WHERE booking_id=?',old.id).first<{id:string;status:string;version:number}>():null;
 if(data.action!=='confirm'){
  assert(oldWork&&['scheduled','assigned','triage'].includes(oldWork.status),409,'WORK_STARTED','This work has started or requires Staff review.');
  assert(old && old.starts_at>time,409,'PAST_APPOINTMENT','Only future appointments may be changed.');
  if(data.action==='cancel'){
   await env.DB.batch([
    statement(env.DB,"UPDATE bookings SET status='cancelled',version=version+1 WHERE id=? AND status='confirmed' AND starts_at>? AND version=?",old.id,time,old.version),guard(env),
    statement(env.DB,"UPDATE work_orders SET status='cancelled',assigned_staff_id=NULL,version=version+1,updated_at=? WHERE id=? AND version=?",time,oldWork.id,oldWork.version),guard(env),
    statement(env.DB,'DELETE FROM tenant_inspections WHERE booking_id=?',old.id),
    statement(env.DB,"UPDATE wa_residential_form_cases SET notice_invalidated_at=?,notice_invalidated_reason='Booking cancelled',updated_at=?,version=version+1 WHERE booking_id=? AND form_code='WA_FORM_19' AND notice_invalidated_at IS NULL",time,time,old.id),
    ...(calendarSchedulingEnabled(env)?[calendarSyncStatement(env,old.id,old.version+1)]:[]),clearGuard(env),
    statement(env.DB,"UPDATE guest_service_orders SET status='cancelled',updated_at=? WHERE id=?",time,o.id),
    releaseUnstartedPcrDiscount(env,o.id),
    await mailEvent(env,'guest.cancelled',{to:input.email,subject:'ProInspect booking cancelled: '+o.reference,heading:'Booking cancelled',body:'Your appointment has been cancelled. Any invoice or payment adjustment will be reviewed separately.',facts:{Reference:o.reference}})
   ]);
   return Response.json({reference:o.reference,status:'cancelled'});
  }
 }
 assert(data.startsAt,422,'APPOINTMENT_REQUIRED','Choose an appointment.');
 const window=appointmentWindow(service,data.startsAt,Date.now(),campaign);
 const promo=campaign?pcrAppointmentPrice(data.startsAt,service.duration_minutes,Boolean(input.offsiteKeyCollection)):null;
 if(campaign&&data.action==='confirm')assert(promo?.totalCents===data.appointmentTotalCents,409,'PRICE_CHANGED','Review the exact appointment total before confirmation.');
 await (calendarSchedulingEnabled(env)?requireReleaseApproval(env,'calendar'):Promise.resolve());
 await assertCalendarSlot(env,window,old?calendarEventId(old.id):undefined);
 const resource=await statement(env.DB,"SELECT id FROM schedule_resources WHERE id='default' AND active=1").first();
 assert(resource,409,'SCHEDULING_CLOSED','Online scheduling is not open.');
 if(input.access.method==='tenant') assert(input.access.noticeConfirmed,422,'ACCESS_CONFIRMATION_REQUIRED','Confirm tenant notice and access arrangements.');
 const availability=await statement(env.DB,"SELECT id FROM bookings WHERE resource_id='default' AND status!='cancelled' AND reserved_start<? AND reserved_end>? AND id!=? UNION ALL SELECT id FROM schedule_blocks WHERE resource_id='default' AND starts_at<? AND ends_at>? LIMIT 1",window.reservedEnd,window.reservedStart,old?.id??'',window.reservedEnd,window.reservedStart).first();
 assert(!availability,409,'SCHEDULE_CONFLICT','That appointment is unavailable.');
 if(old){
  await env.DB.batch([
   statement(env.DB,"UPDATE bookings SET starts_at=?,ends_at=?,reserved_start=?,reserved_end=?,version=version+1 WHERE id=? AND status='confirmed' AND version=? AND starts_at>?",window.startsAt,window.endsAt,window.reservedStart,window.reservedEnd,old.id,old.version,time),guard(env),
   statement(env.DB,"UPDATE work_orders SET status='scheduled',assigned_staff_id=NULL,version=version+1,updated_at=? WHERE id=? AND version=?",time,oldWork!.id,oldWork!.version),guard(env),
   statement(env.DB,'DELETE FROM tenant_inspections WHERE booking_id=?',old.id),
   statement(env.DB,"UPDATE wa_residential_form_cases SET notice_invalidated_at=?,notice_invalidated_reason='Booking rescheduled: reassess lawful access',updated_at=?,version=version+1 WHERE booking_id=? AND form_code='WA_FORM_19' AND notice_invalidated_at IS NULL",time,time,old.id),
   ...(calendarSchedulingEnabled(env)?[calendarSyncStatement(env,old.id,old.version+1)]:[]),clearGuard(env),
   await mailEvent(env,'guest.rescheduled',{to:input.email,subject:'ProInspect appointment changed: '+o.reference,heading:'Appointment rescheduled',body:'Your new appointment has been confirmed.',facts:{Reference:o.reference,Appointment:new Intl.DateTimeFormat('en-AU',{dateStyle:'long',timeStyle:'short',timeZone:'Australia/Perth'}).format(new Date(window.startsAt))}}),
   projection(env,'booking.rescheduled',old.id,{status:'confirmed',reference:o.reference,startsAt:window.startsAt})
  ]);
  return Response.json({reference:o.reference,status:'confirmed',startsAt:window.startsAt});
 }
 const key=addressKey(input.address,input.suburb,input.postcode);
 const found=await statement(env.DB,'SELECT id FROM properties WHERE address_key=?',key).first<{id:string}>();
 // Existing properties can belong to unrelated customers; never infer title or portal rights from an address.
 if(found&&!o.property_reviewed_at){
   await statement(env.DB,"UPDATE guest_service_orders SET status='review_required',updated_at=? WHERE id=?",time,o.id).run();
   return Response.json({reference:o.reference,status:'review_required',message:'Property details require review before an appointment can be confirmed.'},{status:409});
 }
 const propertyId=found?.id??uid('prop'),id=uid('bkg'),woId='wo_'+id.slice(4),paymentId=uid('pay');
 const discount=data.applyPcrDiscount?await eligiblePcrDiscount(env,o,found?.id??null):null;
 if(data.applyPcrDiscount)assert(discount&&discount.totalCents===data.discountTotalCents,409,'DISCOUNT_CHANGED','The discount is unavailable or the total changed. Reload and review before confirming.');
 const ex=discount?.priceExGstCents??promo?.priceExGstCents??o.price_ex_gst_cents??0;
 const gst=discount?.gstCents??promo?.gstCents??o.gst_cents??Math.round(ex*0.1),total=ex+gst;
 const pricing=discount?{kind:'pcr-routine-discount',policy:'same-verified-purchaser-and-property-v1',...discount}:promo?{offerCode:'pcr100',...promo}:null;
 const reference='PI-'+crypto.randomUUID().slice(0,8).toUpperCase();
 const statements=await legalStatements(env,{kind:'guest',id:o.id},'booking',id,{orderId:o.id,serviceId:o.service_id,startsAt:window.startsAt,priceExGstCents:ex,gstCents:gst,pricingSnapshot:pricing??o.pricing_snapshot_json??null,propertyId},data.legalConsent);
 if(!found)statements.push(statement(env.DB,"INSERT INTO properties(id,address,suburb,state,postcode,address_key,sector,property_type,created_at) VALUES(?,?,?,'WA',?,?,?,?,?)",propertyId,input.address,input.suburb,input.postcode,key,o.sector,input.propertyType,time));
 statements.push(
 statement(env.DB,"INSERT INTO bookings(id,reference,client_id,user_id,property_id,service_id,resource_id,starts_at,ends_at,reserved_start,reserved_end,price_ex_gst_cents,snapshot_json,request_key,fingerprint,created_at) VALUES(?,?,?,?,?,?,'default',?,?,?,?,?,?,?,?,?)",id,reference,CLIENT,SYSTEM,propertyId,o.service_id,window.startsAt,window.endsAt,window.reservedStart,window.reservedEnd,ex,JSON.stringify({guestOrderId:o.id,guestReference:o.reference,serviceName:service.name,bookingBasis:o.price_basis==='quote'?'guest_accepted_quote':'guest_published_price',priceExGstCents:ex,gstCents:gst,pricingSnapshot:pricing??(o.pricing_snapshot_json?JSON.parse(o.pricing_snapshot_json):null),customerName:input.name,customerEmail:input.email}),o.id,await digest(o.id+window.startsAt),time),
 statement(env.DB,"INSERT INTO work_orders(id,reference,booking_id,client_id,property_id,title,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'scheduled',?,?)",woId,'WO-'+reference.slice(3),id,CLIENT,propertyId,service.name,time,time),
 statement(env.DB,'INSERT INTO booking_access_secrets(booking_id,envelope,updated_at) VALUES(?,?,?)',id,await seal(env.DATA_ENCRYPTION_KEY,'booking:'+id,input.access),time),
 statement(env.DB,"INSERT INTO payments(id,client_id,property_id,work_order_id,description,amount_ex_gst_cents,gst_cents,total_cents,status,provider,created_at,due_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'payment_required','manual',?,?,?)",paymentId,CLIENT,propertyId,woId,service.name,ex,gst,total,time,new Date(Date.now()+14*86400000).toISOString(),time),
 statement(env.DB,"INSERT INTO payment_events(id,payment_id,actor_id,to_status,reference,created_at) VALUES(?,?,?,'payment_required',?,?)",uid('pe'),paymentId,SYSTEM,o.reference,time),
 statement(env.DB,"UPDATE guest_service_orders SET property_id=?,booking_id=?,price_ex_gst_cents=?,gst_cents=?,pricing_snapshot_json=COALESCE(?,pricing_snapshot_json),status='confirmed',updated_at=? WHERE id=? AND booking_id IS NULL",propertyId,id,ex,gst,pricing?JSON.stringify(pricing):null,time,o.id),
 statement(env.DB,"INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,property_id,metadata_json,created_at) VALUES(?,?, 'guest.booking.confirmed','booking',?,?,'{}',?)",uid('aud'),SYSTEM,id,propertyId,time),
 await mailEvent(env,'guest.booking.confirmed',{to:input.email,subject:'ProInspect booking confirmed: '+o.reference,heading:'Your appointment is confirmed',body:campaign?'Your PCR appointment is reserved and payment is required. Use your private booking link to pay securely once Checkout is enabled. The final report is delivered within 48 hours after inspection.':'Your one-off booking is confirmed. A separate invoice/payment request will be arranged. Your final report will be delivered using a secure link.',facts:{Reference:o.reference,Service:service.name,Property:input.address+', '+input.suburb,Appointment:new Intl.DateTimeFormat('en-AU',{dateStyle:'long',timeStyle:'short',timeZone:'Australia/Perth'}).format(new Date(window.startsAt)),Amount:new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(total/100)+' incl GST'}}),
 projection(env,'booking.created',id,{reference,status:'confirmed',propertyId,serviceId:service.id,workOrderId:woId,startsAt:window.startsAt})
 );
 if(discount)statements.push(reservePcrDiscount(env,o.id,propertyId,paymentId,discount));
 if(env.OPERATIONS_EMAIL) statements.push(await mailEvent(env,'operations.guest_booking',{to:env.OPERATIONS_EMAIL,subject:'New guest Work Order: '+o.reference,heading:'One-off service booking',body:'Review this Work Order and issue the payment request. Access arrangements are private to Staff.',href:env.APP_ORIGIN+'/w/staff/operations/work-orders',facts:{Reference:o.reference,WorkOrder:'WO-'+reference.slice(3)}}));
 if(calendarSchedulingEnabled(env))statements.push(calendarSyncStatement(env,id,1));
 await env.DB.batch(statements);
 return Response.json({reference:o.reference,status:'confirmed',bookingReference:reference,workOrderId:woId},{status:201});
}
