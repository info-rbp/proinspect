import { applicationSettingsSchema } from '../../../../packages/marketing/form18';
import { z } from 'zod';
import { statement, assert, now, uid, type Env } from '../../../../packages/database/types';
import { digest, seal, unseal, randomToken } from '../../../../packages/auth/crypto';
import { listingInput,sessionInput,leadInput, type LeadInput,safeApplicationUrl } from '../../../../packages/marketing/leasing';
import { mailEvent } from '../../../../packages/notifications/server';
import type { Principal } from '../../../../packages/domain/index';
import { operationsWrite } from '../../../../packages/authorization/server';
import { isLocal } from '../../../../packages/auth/server';

const cols='id,kind,slug,title,description,display_address,suburb,postcode,price_cents,price_period,bedrooms,bathrooms,parking,area_sqm,available_from,agent_name,agent_role,application_url,application_mode,published_at';
export async function publicListings(env:Env,kind?:string){
 const rows=await statement(env.DB,`SELECT ${cols} FROM leasing_listings WHERE status='published' AND (? IS NULL OR kind=?) ORDER BY published_at DESC LIMIT 100`,kind??null,kind??null).all();
 return rows.results;
}
export async function publicPhoto(env:Env,photoId:string) {
 let p:{object_key:string;content_type:string}|null=null;
 if(photoId.endsWith('/cover')){
  const listingId=photoId.slice(0,-6);
  p=await statement(env.DB,"SELECT ph.object_key,ph.content_type FROM leasing_photos ph JOIN leasing_listings l ON l.id=ph.listing_id WHERE l.id=? AND l.status='published' ORDER BY ph.sort_order,ph.id LIMIT 1",listingId).first();
 }else p=await statement(env.DB,"SELECT ph.object_key,ph.content_type FROM leasing_photos ph JOIN leasing_listings l ON l.id=ph.listing_id WHERE ph.id=? AND l.status='published'",photoId).first();
 assert(p,404,'PHOTO_NOT_FOUND','Photo unavailable.');
 const object=await env.DOCUMENTS.get(p.object_key);
 assert(object,404,'PHOTO_NOT_FOUND','Photo unavailable.');
 return new Response(object.body,{headers:{'Content-Type':p.content_type,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
}
export async function publicListing(env:Env,kind:string,slug:string){
 const row=await statement(env.DB,`SELECT ${cols} FROM leasing_listings WHERE status='published' AND kind=? AND slug=?`,kind,slug).first<Record<string,any>>();
 if(!row)return null;
 const sessions=(await statement(env.DB,"SELECT id,starts_at,ends_at,capacity,booked_count,status FROM leasing_sessions WHERE listing_id=? AND status='scheduled' AND starts_at>? ORDER BY starts_at LIMIT 40",row.id,now()).all()).results;
 const photos=(await statement(env.DB,'SELECT id,alt_text FROM leasing_photos WHERE listing_id=? ORDER BY sort_order,id LIMIT 25',row.id).all()).results;
 return {listing:row,sessions,photos};
}
async function limit(env:Env,bucket:string,max:number){
 const key=await digest(env.DATA_ENCRYPTION_KEY+':leasing:'+bucket);
 const t=now();const r=await statement(env.DB,`INSERT INTO auth_rate_limits(bucket,attempts,expires_at) VALUES(?,1,?)
 ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`,
 key,new Date(Date.now()+900000).toISOString(),t,t).first<{attempts:number}>();
 assert(r&&r.attempts<=max,429,'LEASING_RATE_LIMIT','Too many attempts. Try again later.');
}
async function event(env:Env,leadId:string,kind:string,details:unknown) {
 const id=uid('lev');
 return statement(env.DB,'INSERT INTO leasing_email_events(id,lead_id,kind,envelope,created_at) VALUES(?,?,?,?,?)',
 id,leadId,kind,await seal(env.DATA_ENCRYPTION_KEY,'leasing-event:'+id,details),now());
}
async function checkTurnstile(env:Env,request:Request,token:string|undefined,key:string) {
 if(isLocal(request,env))return;
 assert(env.MARKETING_TURNSTILE_SECRET_KEY&&token,503,'SECURITY_UNAVAILABLE','Inspection registration is currently unavailable.');
 const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env.MARKETING_TURNSTILE_SECRET_KEY,response:token,idempotency_key:key}),signal:AbortSignal.timeout(10000)});
 const d=await r.json() as {success:boolean;hostname?:string;action?:string};
 assert(r.ok&&d.success&&d.hostname===new URL(env.APP_ORIGIN).hostname&&d.action==='leasing',403,'SECURITY_CHECK_FAILED','Security check expired. Please retry.');
}
export async function createLead(env:Env,request:Request,source:{input:unknown;turnstile?:string;clientKey:string}) {
 assert(env.DATA_ENCRYPTION_KEY&&source.clientKey,503,'LEASING_UNAVAILABLE','Registration is temporarily unavailable.');
 const d=leadInput.parse(source.input);
 const listing=await statement(env.DB,"SELECT id,kind,slug,title,agent_name FROM leasing_listings WHERE id=? AND status='published'",d.listingId).first<{id:string;kind:string;slug:string;title:string;agent_name:string}>();
 assert(listing,404,'LISTING_UNAVAILABLE','This property is no longer available.');
 const finger=await digest(JSON.stringify(d));
 const previous=await statement(env.DB,'SELECT id,fingerprint FROM leasing_leads WHERE request_key=?',d.requestKey).first<{id:string;fingerprint:string}>();
 if(previous){assert(previous.fingerprint===finger,409,'LEASING_CHANGED_RETRY','Start a new registration for changed details.');return {reference:previous.id,replayed:true};}
 await limit(env,'src:'+source.clientKey,12);await limit(env,'email:'+d.email,6);
 await checkTurnstile(env,request,source.turnstile,d.requestKey);
 let session:{id:string;starts_at:string;ends_at:string}|null=null;
 if(d.kind==='inspection'){
  session=await statement(env.DB,"SELECT id,starts_at,ends_at FROM leasing_sessions WHERE id=? AND listing_id=? AND status='scheduled' AND starts_at>?",d.sessionId!,d.listingId,now()).first<{id:string;starts_at:string;ends_at:string}>();
  assert(session,409,'SESSION_UNAVAILABLE','The inspection session is no longer available.');
 }
 const id=uid('lreg'),cancelToken=randomToken(),emailHash=await digest(env.DATA_ENCRYPTION_KEY+':leasing-email:'+d.email),stamp=now();
 const eventKind=d.kind==='inspection'?'registration.received':'interest.received';
 const confirmationHref=env.APP_ORIGIN+'/properties-for-lease/'+listing.kind+'/'+listing.slug;
 const payload={listingId:listing.id,listingTitle:listing.title,kind:d.kind,session:session?.starts_at??null,contact:d.email,registeredAt:stamp,agentName:listing.agent_name};
 const batch=[];
 if(session){
 batch.push(statement(env.DB,"UPDATE leasing_sessions SET booked_count=booked_count+1,updated_at=?,version=version+1 WHERE id=? AND status='scheduled' AND starts_at>? AND (capacity IS NULL OR booked_count<capacity)",stamp,session.id,stamp));
 // Existing mutation_guard rejects zero-row reservations inside the same D1 batch.
 batch.push(statement(env.DB,"INSERT INTO mutation_guards(changed_rows) VALUES(changes())"));
 batch.push(statement(env.DB,"DELETE FROM mutation_guards"));
 }
 batch.push(statement(env.DB,'INSERT INTO leasing_leads(id,listing_id,session_id,kind,request_key,fingerprint,email_hash,envelope,cancel_token_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
 id,d.listingId,session?.id??null,d.kind,d.requestKey,finger,emailHash,await seal(env.DATA_ENCRYPTION_KEY,'leasing-lead:'+id,d),await digest(cancelToken),stamp));
 batch.push(await event(env,id,eventKind,payload));
 batch.push(await mailEvent(env,'leasing.'+eventKind,{to:d.email,subject:'ProInspect '+(session?'inspection registration':'property enquiry')+' received',heading:session?'Inspection registration received':'Property interest received',
 body:session?'We have recorded your registration. This does not constitute a rental application. Changes to the inspection will be advised where possible.':'We have recorded your interest. This does not constitute a rental application.',
 href:session?env.APP_ORIGIN+'/properties-for-lease/cancel/'+cancelToken:confirmationHref,facts:{Property:listing.title,...(session?{'Inspection (UTC)':session.starts_at}:{}),'Property details':confirmationHref},sensitive:true}));
 if(env.OPERATIONS_EMAIL)batch.push(await mailEvent(env,'leasing.operations',{to:env.OPERATIONS_EMAIL,subject:'New property '+(session?'inspection registration':'interest'),heading:'Leasing enquiry recorded',body:'A new registration has been stored securely. Review it in the authorised leasing register.',facts:{Property:listing.title,Reference:id}}));
 try {
  const result=await env.DB.batch(batch);
  if(session&&result[0].meta.changes!==1)throw Error('SESSION_CAPACITY');
 }catch(err){
  const prior=await statement(env.DB,'SELECT id,fingerprint FROM leasing_leads WHERE request_key=?',d.requestKey).first<{id:string;fingerprint:string}>();
  if(prior&&prior.fingerprint===finger)return {reference:prior.id,replayed:true};
  if(err instanceof Error&&/SESSION_CAPACITY|CHECK constraint|UNIQUE constraint/.test(err.message))throw new Error('SESSION_CAPACITY');
  throw err;
 }
 return {reference:id,replayed:false,cancelToken};
}
export async function cancelLead(env:Env,request:Request,token:string,clientKey:string) {
 assert(/^[a-f0-9]{64}$/.test(token),404,'NOT_FOUND','Registration not found.');
 await limit(env,'cancel:'+clientKey,20);
 const hash=await digest(token);
 const lead=await statement(env.DB,"SELECT id,session_id,status FROM leasing_leads WHERE cancel_token_hash=?",hash).first<{id:string;session_id:string|null;status:string}>();
 assert(lead,404,'NOT_FOUND','Registration not found.');
 if(lead.status==='cancelled')return {cancelled:true};
 const batch=[statement(env.DB,"UPDATE leasing_leads SET status='cancelled',cancelled_at=? WHERE id=? AND status='active'",now(),lead.id),statement(env.DB,"INSERT INTO mutation_guards(changed_rows) VALUES(changes())"),statement(env.DB,"DELETE FROM mutation_guards")];
 if(lead.session_id)batch.push(statement(env.DB,"UPDATE leasing_sessions SET booked_count=MAX(0,booked_count-1),version=version+1 WHERE id=?",lead.session_id));
 batch.push(await event(env,lead.id,'registration.cancelled',{cancelledAt:now()}));
 await env.DB.batch(batch);
 return {cancelled:true};
}
function staff(user:Principal){operationsWrite(user);assert(user.staffRole==='administrator'||user.staffRole==='operations_manager',403,'STAFF_REQUIRED','Operations staff only.');}
export async function staffLeasing(env:Env,user:Principal,request:Request,path:string){
 staff(user);const method=request.method,parts=path.split('/').filter(Boolean);
 if(method==='GET'&&parts.length===0){
  const listings=(await statement(env.DB,"SELECT l.*,c.name AS instructing_client,p.address AS property_address FROM leasing_listings l JOIN clients c ON c.id=l.instructed_by_client_id JOIN properties p ON p.id=l.property_id ORDER BY l.updated_at DESC LIMIT 150").all()).results;
  return {listings};
 }
 if(method==='POST'&&parts.length===2&&parts[1]==='photos'){
  const form=await request.formData();
  const media=form.get('file'),alt=String(form.get('altText')??'').trim();
  assert(media instanceof File && media.size>0 && media.size<=6000000,422,'PHOTO_SIZE','Use an image of 6 MB or smaller.');
  assert(['image/png','image/jpeg','image/webp'].includes(media.type),422,'PHOTO_TYPE','Use JPEG, PNG or WebP images.');
  assert(alt.length>=8&&alt.length<=240,422,'PHOTO_ALT','Describe the image for accessibility.');
  const id=uid('lph'),key='leasing/'+parts[0]+'/'+id;
  const bytes=new Uint8Array(await media.arrayBuffer());
  const valid=media.type==='image/png'?(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71):
   media.type==='image/jpeg'?(bytes[0]===255&&bytes[1]===216&&bytes[2]===255):
   (bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80);
  assert(valid,422,'PHOTO_INVALID','The uploaded file is not a valid image of the selected type.');
  const found=await statement(env.DB,'SELECT id FROM leasing_listings WHERE id=?',parts[0]).first();
  assert(found,404,'LISTING_NOT_FOUND','Listing not found.');
  await env.DOCUMENTS.put(key,bytes,{httpMetadata:{contentType:media.type}});
  try{await statement(env.DB,'INSERT INTO leasing_photos(id,listing_id,object_key,content_type,size,alt_text,created_at) VALUES(?,?,?,?,?,?,?)',
    id,parts[0],key,media.type,media.size,alt,now()).run();
  }catch(error){await env.DOCUMENTS.delete(key);throw error;}
  return {id};
 }
 const body=method==='POST'?await request.json():{};
 
 if(method==='POST'&&parts.length===0){
  const d=listingInput.parse(body);
  const config=applicationSettingsSchema.parse({
   applicationMode:d.applicationMode,applicationUrl:d.applicationUrl??'',
   applicationAuthorityReference:d.applicationAuthorityReference,
   applicationRecipientEmail:d.applicationRecipientEmail,
   tenancyDatabaseNoticeMode:d.tenancyDatabaseNoticeMode,
   tenancyDatabaseNotices:d.tenancyDatabaseNotices,
  });
  assert(d.kind==='residential'||config.applicationMode!=='proinspect',422,'RESIDENTIAL_APPLICATION_ONLY','Form 18 applications are residential only.');
  const id=uid('lst'),t=now();
  const names=['id','property_id','instructed_by_client_id','owner_client_id','kind','slug','title','description',
   'display_address','suburb','postcode','price_cents','price_period','bedrooms','bathrooms','parking',
   'area_sqm','available_from','agent_name','agent_role','application_url','application_mode',
   'application_authority_reference','application_recipient_email','tenancy_database_notice_mode',
   'tenancy_database_notice_json','created_by','created_at','updated_at'];
  const values=[id,d.propertyId,d.instructedByClientId,d.ownerClientId??null,d.kind,d.slug,d.title,d.description,
   d.displayAddress,d.suburb,d.postcode,d.priceCents??null,d.pricePeriod,d.bedrooms??null,d.bathrooms??null,
   d.parking??null,d.areaSqm??null,d.availableFrom??null,d.agentName,d.agentRole,
   safeApplicationUrl(config.applicationUrl),config.applicationMode,config.applicationAuthorityReference||null,
   config.applicationRecipientEmail||null,config.tenancyDatabaseNoticeMode,JSON.stringify(config.tenancyDatabaseNotices),
   user.id,t,t];
  await statement(env.DB,'INSERT INTO leasing_listings('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+')',...values).run();
  return {id};
 }
 const [listingId,section,other]=parts;
 const listing=await statement(env.DB,'SELECT id,status,version,kind FROM leasing_listings WHERE id=?',listingId).first<{id:string;status:string;version:number;kind:string}>();
 assert(listing,404,'LISTING_NOT_FOUND','Listing not found.');
 if(method==='GET'&&parts.length===1){
  const sessions=(await statement(env.DB,'SELECT * FROM leasing_sessions WHERE listing_id=? ORDER BY starts_at DESC LIMIT 100',listingId).all()).results;
  const photos=(await statement(env.DB,'SELECT id,alt_text,sort_order,content_type,size FROM leasing_photos WHERE listing_id=? ORDER BY sort_order',listingId).all()).results;
  const leads=(await statement(env.DB,"SELECT id,session_id,kind,status,created_at FROM leasing_leads WHERE listing_id=? ORDER BY created_at DESC LIMIT 100",listingId).all()).results;
  const details=await statement(env.DB,'SELECT * FROM leasing_listings WHERE id=?',listingId).first();
  return {listing:details,sessions,photos,leads};
 }
 if(method==='POST'&&section==='application-settings'){
  const d=applicationSettingsSchema.extend({version:z.number().int().positive()}).parse(body);
  assert(listing.kind==='residential'||d.applicationMode!=='proinspect',422,'RESIDENTIAL_APPLICATION_ONLY','The WA Form 18 workflow is available for residential leasing only.');
  const update=await statement(env.DB,"UPDATE leasing_listings SET application_mode=?,application_url=?,application_authority_reference=?,application_recipient_email=?,tenancy_database_notice_mode=?,tenancy_database_notice_json=?,version=version+1,updated_at=? WHERE id=? AND version=?",
   d.applicationMode,safeApplicationUrl(d.applicationUrl),d.applicationAuthorityReference||null,
   d.applicationRecipientEmail||null,d.tenancyDatabaseNoticeMode,JSON.stringify(d.tenancyDatabaseNotices),
   now(),listingId,d.version).run();
  assert(update.meta.changes===1,409,'STALE_LISTING','The listing changed. Reload before updating application settings.');
  return {ok:true,applicationMode:d.applicationMode};
 }
 if(method==='POST'&&section==='edit'){
  const d=listingInput.extend({version:z.number().int().positive()}).parse(body);
  const result=await statement(env.DB,`UPDATE leasing_listings SET property_id=?,instructed_by_client_id=?,owner_client_id=?,kind=?,slug=?,title=?,description=?,display_address=?,suburb=?,postcode=?,price_cents=?,price_period=?,bedrooms=?,bathrooms=?,parking=?,area_sqm=?,available_from=?,agent_name=?,agent_role=?,application_url=?,updated_at=?,version=version+1 WHERE id=? AND version=?`,
   d.propertyId,d.instructedByClientId,d.ownerClientId??null,d.kind,d.slug,d.title,d.description,d.displayAddress,d.suburb,d.postcode,d.priceCents??null,d.pricePeriod,d.bedrooms??null,d.bathrooms??null,d.parking??null,d.areaSqm??null,d.availableFrom??null,d.agentName,d.agentRole,safeApplicationUrl(d.applicationUrl),now(),listingId,d.version).run();
  assert(result.meta.changes===1,409,'STALE_LISTING','Reload listing before editing.');
  return {ok:true};
 }
 if(method==='POST'&&section==='photo-remove'&&other){
  const p=await statement(env.DB,'SELECT object_key FROM leasing_photos WHERE id=? AND listing_id=?',other,listingId).first<{object_key:string}>();
  assert(p,404,'PHOTO_NOT_FOUND','Photo not found.');
  const total=await statement(env.DB,'SELECT COUNT(*) AS count FROM leasing_photos WHERE listing_id=?',listingId).first<{count:number}>();
  assert(listing.status!=='published'||(total?.count??0)>1,409,'LAST_PHOTO','A published listing must keep one photo. Withdraw it first.');
  await statement(env.DB,'DELETE FROM leasing_photos WHERE id=? AND listing_id=?',other,listingId).run();
  await env.DOCUMENTS.delete(p.object_key);
  return {ok:true};
 }
 if(method==='POST'&&section==='status'){
  const d=z.object({version:z.number().int().positive(),status:z.enum(['draft','published','withdrawn','leased'])}).parse(body);
  const result=await statement(env.DB,"UPDATE leasing_listings SET status=?,version=version+1,updated_at=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END WHERE id=? AND version=?",
   d.status,now(),d.status,now(),listingId,d.version).run();
  assert(result.meta.changes===1,409,'STALE_LISTING','Reload before updating.');
  return {ok:true};
 }
 if(method==='POST'&&section==='sessions'){
  const d=sessionInput.parse({...body as Record<string,unknown>,listingId});
  assert(new Date(d.endsAt)>new Date(d.startsAt),422,'SESSION_TIME','End time must be later.');
  const id=uid('lsn'),t=now();
  await statement(env.DB,"INSERT INTO leasing_sessions(id,listing_id,starts_at,ends_at,capacity,instructions,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
  id,listingId,d.startsAt,d.endsAt,d.capacity??null,d.instructions,t,t).run();
  return {id};
 }

 if(method==='POST'&&section==='session-edit'&&other){
   const d=z.object({version:z.number().int().positive(),startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),capacity:z.number().int().min(1).max(200).nullable().optional(),instructions:z.string().max(600).default('')}).parse(body);
   assert(new Date(d.endsAt)>new Date(d.startsAt),422,'SESSION_TIME','End time must be after start.');
   const original=await statement(env.DB,'SELECT starts_at,ends_at FROM leasing_sessions WHERE id=? AND listing_id=?',other,listingId).first<{starts_at:string;ends_at:string}>();
   assert(original,404,'SESSION_NOT_FOUND','Inspection session not found.');
   const up=await statement(env.DB,"UPDATE leasing_sessions SET starts_at=?,ends_at=?,capacity=?,instructions=?,updated_at=?,version=version+1 WHERE id=? AND listing_id=? AND version=? AND status='scheduled'",
    d.startsAt,d.endsAt,d.capacity??null,d.instructions,now(),other,listingId,d.version).run();
   assert(up.meta.changes===1,409,'STALE_SESSION','Session changed or has too many registrations for this capacity.');
   if(original.starts_at!==d.startsAt||original.ends_at!==d.endsAt){
    const rec=(await statement(env.DB,"SELECT id,envelope FROM leasing_leads WHERE session_id=? AND status='active'",other).all<{id:string;envelope:string}>()).results;
    for(const r of rec){
     const contact=await unseal<LeadInput>(env.DATA_ENCRYPTION_KEY,'leasing-lead:'+r.id,r.envelope);
     await env.DB.batch([await event(env,r.id,'session.updated',{previous:original.starts_at,current:d.startsAt}),
       await mailEvent(env,'leasing.session.updated',{to:contact.email,subject:'Your property open inspection time has changed',heading:'Inspection time updated',
        body:'The inspection session time has changed. Please check the updated time before attending.',
        facts:{'New time (UTC)':d.startsAt,'Previous time (UTC)':original.starts_at},sensitive:true})]);
    }
   }
   return {ok:true};
 }
 if(method==='POST'&&section==='session-status'&&other){
  const d=z.object({status:z.enum(['scheduled','cancelled','completed']),version:z.number().int().positive()}).parse(body);
  const found=await statement(env.DB,'SELECT id,status,starts_at FROM leasing_sessions WHERE id=? AND listing_id=?',other,listingId).first<{id:string;status:string;starts_at:string}>();
  assert(found,404,'SESSION_NOT_FOUND','Session not found.');
  const result=await statement(env.DB,'UPDATE leasing_sessions SET status=?,version=version+1,updated_at=? WHERE id=? AND version=?',d.status,now(),other,d.version).run();
  assert(result.meta.changes===1,409,'STALE_SESSION','Reload session before editing.');
  if(d.status==='cancelled'){
   const recipients=(await statement(env.DB,"SELECT id FROM leasing_leads WHERE session_id=? AND status='active'",other).all<{id:string}>()).results;
   for(const r of recipients){
      const lead=await statement(env.DB,'SELECT envelope FROM leasing_leads WHERE id=?',r.id).first<{envelope:string}>();
      if(!lead)continue;
      const contact=await unseal<LeadInput>(env.DATA_ENCRYPTION_KEY,'leasing-lead:'+r.id,lead.envelope);
      await env.DB.batch([
       await event(env,r.id,'session.cancelled',{sessionId:other,cancelledAt:now()}),
       await mailEvent(env,'leasing.session.cancelled',{to:contact.email,subject:'Property open inspection cancelled',heading:'Inspection session cancelled',body:'The advertised inspection session has been cancelled. Please check the property page for other inspection options.',facts:{'Original session (UTC)':found.starts_at},sensitive:true})
      ]);
    }
  }
  return {ok:true};
 }
 if(method==='GET'&&section==='registrations'){
  const rows=(await statement(env.DB,"SELECT id,envelope,kind,session_id,status,created_at FROM leasing_leads WHERE listing_id=? ORDER BY created_at DESC LIMIT 150",listingId).all<{id:string;envelope:string;kind:string;session_id:string|null;status:string;created_at:string}>()).results;
  return {registrations:await Promise.all(rows.map(async r=>({id:r.id,kind:r.kind,sessionId:r.session_id,status:r.status,createdAt:r.created_at,contact:await unseal<LeadInput>(env.DATA_ENCRYPTION_KEY,'leasing-lead:'+r.id,r.envelope)})))};
 }
 assert(false,404,'NOT_FOUND','Unknown leasing action.');
}

/** Scheduled, idempotent reminder staging. Google Apps Script remains disconnected. */
export async function dispatchLeasingReminders(env:Env) {
 if(!env.DATA_ENCRYPTION_KEY)return;
 const time=now(),until=new Date(Date.now()+24*60*60*1000).toISOString();
 const rows=(await statement(env.DB,`SELECT r.id,r.envelope,s.starts_at,l.title,l.kind,l.slug
 FROM leasing_leads r JOIN leasing_sessions s ON s.id=r.session_id JOIN leasing_listings l ON l.id=r.listing_id
 WHERE r.kind='inspection' AND r.status='active' AND r.reminder_queued_at IS NULL
 AND s.status='scheduled' AND l.status='published' AND s.starts_at>? AND s.starts_at<=?
 ORDER BY s.starts_at LIMIT 50`,time,until).all<{id:string;envelope:string;starts_at:string;title:string;kind:string;slug:string}>()).results;
 for(const r of rows) {
  const contact=await unseal<LeadInput>(env.DATA_ENCRYPTION_KEY,'leasing-lead:'+r.id,r.envelope);
  const awst=new Date(r.starts_at).toLocaleString('en-AU',{timeZone:'Australia/Perth',weekday:'long',day:'numeric',month:'long',hour:'numeric',minute:'2-digit'});
  try {
   await env.DB.batch([
    statement(env.DB,"UPDATE leasing_leads SET reminder_queued_at=? WHERE id=? AND reminder_queued_at IS NULL AND status='active'",now(),r.id),
    statement(env.DB,"INSERT INTO mutation_guards(changed_rows) VALUES(changes())"),
    statement(env.DB,"DELETE FROM mutation_guards"),
    await event(env,r.id,'session.reminder',{startsAt:r.starts_at}),
    await mailEvent(env,'leasing.session.reminder',{to:contact.email,subject:'Reminder: your property inspection',heading:'Upcoming open inspection',
     body:'This is a reminder of your registered property open inspection. Please review the property page before attending.',
     facts:{Property:r.title,'Inspection (AWST)':awst},
     href:env.APP_ORIGIN+'/properties-for-lease/'+r.kind+'/'+r.slug,sensitive:true}),
   ]);
  } catch(error) {console.error('leasing.reminder_failed',{type:error instanceof Error?error.name:'unknown'});}
 }
}
