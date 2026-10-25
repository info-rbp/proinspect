import {createHash,timingSafeEqual} from 'node:crypto';
import {templateForBooking} from '../../../../packages/report-engine/report-tool-catalogue';
import {assert,statement,now,uid,type Env} from '../../../../packages/database/types';
import type {Principal,Workspace} from '../../../../packages/domain/index';
import {workOrderAccess} from '../../../../packages/authorization/server';
import {digest} from '../../../../packages/auth/crypto';
import {activity} from '../../../../packages/operations/core';


function b64url(bytes:Uint8Array):string{
 return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
async function sign(secret:string,input:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return b64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(input))));
}
function staffScope():Workspace{return {kind:'staff',scopeId:'operations',role:'administrator',name:'ProInspect operations',href:'/w/staff/operations'};}
export async function launchPropertyReportTool(env:Env,user:Principal,orderId:string){
 assert(user.staffRole && user.staffRole!=='read_only',403,'STAFF_REQUIRED','Staff authorisation is required.');
 const order=await workOrderAccess(env,user,staffScope(),orderId,true);
 assert(order.assigned_staff_id===user.id,403,'ASSIGNMENT_REQUIRED','Only the assigned inspector can launch this report.');
 assert(order.property_id && order.client_id,422,'PROPERTY_CONTEXT_REQUIRED','The Report Tool requires a client-linked property.');
 assert(!['completed','cancelled'].includes(order.status),409,'WORK_ORDER_CLOSED','The Work Order is closed.');
 const b=order.booking_id?await statement(env.DB,'SELECT service_id FROM bookings WHERE id=?',order.booking_id).first<{service_id:string}>():null;
 const reportType=b && templateForBooking(b.service_id);
 assert(reportType,422,'REPORT_TYPE_REQUIRED','Select a booking-backed service supported by the Report Tool.');
 assert(env.REPORT_TOOL_V2_ORIGIN && env.REPORT_TOOL_V2_HANDOFF_KEY,503,'REPORT_TOOL_UNCONFIGURED','Report Tool handoff is not configured.');
 const origin=new URL(env.REPORT_TOOL_V2_ORIGIN);
 assert(origin.protocol==='https:'&&origin.username===''&&origin.password===''&&origin.pathname==='/'&&origin.hostname==='report.creation.proinspect.systems',503,'REPORT_TOOL_ORIGIN_INVALID','Use the approved Report Tool hostname.');
 const property=await statement(env.DB,'SELECT address,suburb,postcode FROM properties WHERE id=?',order.property_id).first<{address:string,suburb:string,postcode:string}>();
 assert(property,404,'PROPERTY_NOT_FOUND','Property not found.');
 const handoffId=uid('rh'),issued=now(),expiry=new Date(Date.now()+10*60000).toISOString();
 await env.DB.batch([
  statement(env.DB,'INSERT INTO property_report_bridge_handoffs(id,work_order_id,staff_user_id,staff_email,source_report_id,created_at,launch_expires_at,publish_expires_at,status) VALUES(?,?,?,?,NULL,?,?,?,\'pending\')',handoffId,order.id,user.id,user.email.toLowerCase(),issued,expiry,new Date(Date.now()+90*86400000).toISOString()),
  activity(env,user,'property_report_tool.launch','work_order',order.id,order.property_id,null,{handoffId})
 ]);
 const token={v:1,iss:'proinspect-platform',exp:Math.floor(Date.now()/1000)+600,
  handoffId,propertyId:order.property_id,propertyAddress:[property.address,property.suburb,property.postcode].filter(Boolean).join(', '),
  clientId:order.client_id,bookingId:order.booking_id||undefined,workOrderId:order.id,
  reportType,audiences:['client','staff'],issuedByUid:user.id,issuedByEmail:user.email.toLowerCase()};
 const payload=b64url(new TextEncoder().encode(JSON.stringify(token))),signature=await sign(env.REPORT_TOOL_V2_HANDOFF_KEY,payload);
 const link=new URL(origin.origin);
 link.searchParams.set('proinspect_handoff',payload+'.'+signature);
 return {url:link.toString(),expiresAt:expiry,handoffId,reportType};
}
export async function ingestPropertyReportTool(env:Env,request:Request){
 assert(env.REPORT_TOOL_V2_INGEST_TOKEN && env.REPORT_TOOL_V2_INGEST_TOKEN.length>=24,503,'INGEST_UNCONFIGURED','Report publication is not configured.');
 const token=request.headers.get('x-report-ingest-token')||'';
 const a=new TextEncoder().encode(token),b=new TextEncoder().encode(env.REPORT_TOOL_V2_INGEST_TOKEN);
 const key=createHash('sha256').update(a).digest(),expected=createHash('sha256').update(b).digest();
 assert(a.byteLength>0&&timingSafeEqual(key,expected),403,'INGEST_FORBIDDEN','Report publication credential rejected.');
 assert(request.headers.get('content-type')?.split(';')[0]==='application/pdf',422,'PDF_REQUIRED','Send a PDF.');
 const sizeHeader=Number(request.headers.get('content-length')||'0');
 const maxPdfBytes=90*1024*1024;
 assert(Number.isFinite(sizeHeader)&&sizeHeader<=maxPdfBytes,413,'FILE_SIZE','PDF must be at most 90 MB.');
 const handoffId=request.headers.get('x-report-handoff-id')||'',sourceId=request.headers.get('x-report-source-id')||'';
 assert(/^rh_[A-Za-z0-9_-]+$/.test(handoffId)&&/^[A-Za-z0-9_-]{8,150}$/.test(sourceId),422,'SOURCE_INVALID','Valid source identifiers are required.');
 const link=await statement(env.DB,'SELECT * FROM property_report_bridge_handoffs WHERE id=?',handoffId).first<Record<string,any>>();
 assert(link,403,'HANDOFF_INVALID','No authorised report handoff exists.');
 assert(link.publish_expires_at>now(),403,'HANDOFF_EXPIRED','Report handoff has expired.');
 assert(link.status!=='revoked',403,'HANDOFF_REVOKED','Report handoff has been revoked.');
 assert(!link.source_report_id || link.source_report_id===sourceId,409,'SOURCE_CHANGED','This handoff is already bound to a different report.');
 const order=await statement(env.DB,'SELECT * FROM work_orders WHERE id=?',link.work_order_id).first<Record<string,any>>();
 const staff=await statement(env.DB,'SELECT u.id FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=? AND u.active=1 AND s.active=1',link.staff_user_id).first();
 assert(staff&&order&&!['cancelled'].includes(order.status)&&order.assigned_staff_id===link.staff_user_id,403,'STAFF_REVOKED','The originating inspector is no longer assigned to this Work Order.');
 assert(request.headers.get('x-work-order-id')===order.id&&request.headers.get('x-property-id')===order.property_id,422,'CONTEXT_MISMATCH','The uploaded report context does not match the authorised Work Order.');
 const booking=order.booking_id?await statement(env.DB,'SELECT service_id FROM bookings WHERE id=?',order.booking_id).first<{service_id:string}>():null;
 const requiredType=booking&&templateForBooking(booking.service_id);
 assert(!!requiredType&&request.headers.get('x-report-template-type')===requiredType,422,'TEMPLATE_MISMATCH','The returned report must match the inspected service and signed template.');
 // Stream into private R2 without buffering the complete PDF in Worker memory.
 // The incremental digest is calculated over exactly the accepted bytes, not an unchecked sender header.
 assert(request.body,422,'PDF_REQUIRED','An upload body is required.');
 const id=uid('doc'),objectKey='report-tool/'+handoffId+'/'+id+'.pdf',time=now();
 const hasher=createHash('sha256');
 const prefix=new Uint8Array(5);let prefixCount=0,total=0;
 const boundedPdf=new TransformStream<Uint8Array,Uint8Array>({
   transform(chunk,controller){
     total+=chunk.byteLength;
     if(total>maxPdfBytes)throw new Error('PDF_STREAM_LIMIT');
     for(let i=0;i<chunk.byteLength&&prefixCount<5;i++)prefix[prefixCount++]=chunk[i];
     if(prefixCount===5&&new TextDecoder().decode(prefix)!=='%PDF-')throw new Error('PDF_SIGNATURE_INVALID');
     hasher.update(chunk);controller.enqueue(chunk);
   }
 });
 try{
   const stored=await env.DOCUMENTS.put(objectKey,request.body.pipeThrough(boundedPdf),{httpMetadata:{contentType:'application/pdf'}});
   assert(stored&&stored.size===total&&total>5&&prefixCount===5,422,'INVALID_PDF','The uploaded PDF was incomplete.');
 }catch(e){
   await env.DOCUMENTS.delete(objectKey).catch(()=>undefined);
   if(e instanceof Error && e.message.includes('PDF_STREAM_LIMIT'))assert(false,413,'FILE_SIZE','The PDF exceeds 90 MB.');
   if(e instanceof Error && e.message.includes('PDF_SIGNATURE_INVALID'))assert(false,422,'INVALID_PDF','The document does not contain a PDF header.');
   throw e;
 }
 const hash=hasher.digest('hex');
 try{
   const previous=await statement(env.DB,'SELECT d.id,d.sha256 FROM documents d JOIN property_report_bridge_handoffs h ON h.document_id=d.id WHERE h.id=?',handoffId).first<{id:string,sha256:string}>();
   if(previous){
     assert(previous.sha256===hash,409,'SOURCE_CHANGED','A different PDF has already been received.');
     await env.DOCUMENTS.delete(objectKey);
     return {id:previous.id,replayed:true,status:'review'};
   }

  await env.DB.batch([
   statement(env.DB,"INSERT INTO documents(id,property_id,scheme_id,booking_id,work_order_id,title,category,object_key,content_type,size,sha256,status,created_by,created_at,source_report_id) VALUES(?,?,?,?,?,?,'service_report',?,'application/pdf',?,?,'review',?,?,?)",
    id,order.property_id,order.scheme_id,order.booking_id,order.id,('ProInspect report '+order.reference).slice(0,180),objectKey,total,hash,link.staff_user_id,time,'tool:'+handoffId),
   statement(env.DB,"UPDATE property_report_bridge_handoffs SET document_id=?,source_report_id=?,status='received',received_at=? WHERE id=? AND document_id IS NULL AND source_report_id IS NULL",id,sourceId,time,handoffId),
   statement(env.DB,"INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,property_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?)",uid('aud'),link.staff_user_id,'property_report_tool.received','document',id,order.property_id,JSON.stringify({handoffId,sourceId,sha256:hash}),time)
  ]);
 }catch(e){await env.DOCUMENTS.delete(objectKey).catch(()=>undefined);throw e;}
 return {id,status:'review',message:'Report received for independent ProInspect review. It has not been issued to any customer.'};
}
