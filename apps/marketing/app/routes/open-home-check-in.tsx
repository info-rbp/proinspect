import { useState } from 'react';
import {
  Form,Link,useLoaderData,useActionData,
  type LoaderFunctionArgs,type ActionFunctionArgs,data,
} from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import type { Env } from '../../../../packages/database/types';
import { digest } from '../../../../packages/auth/crypto';
import { publicOpenHomeSessions,recordOpenHomeCheckIn } from '../../../platform/worker/features/open-home.server';
import { Turnstile } from '../../../../packages/ui/Turnstile';
import '../../../../packages/ui/open-home.css';

export const meta=()=>[
 {title:'Open home check-in | ProInspect'},
 {name:'description',content:'Check in for a ProInspect-hosted property inspection on behalf of the nominated leasing representative.'},
 {name:'robots',content:'noindex,nofollow'},
];

export async function loader({context,request}:LoaderFunctionArgs){
 const env=context.get(runtimeContext).env as Env;
 const sessions=await publicOpenHomeSessions(env);
 const url=new URL(request.url);
 const listingId=url.searchParams.get('property')??'';
 const sessionId=url.searchParams.get('session')??'';
 const selected=sessions.find(x=>x.id===sessionId&&x.listingId===listingId);
 return data({
  sessions,
  selectedListingId:selected?.listingId??(sessions.some(x=>x.listingId===listingId)?listingId:''),
  selectedSessionId:selected?.id??'',
  qr:Boolean(selected),
  requestKey:crypto.randomUUID(),
  siteKey:env.MARKETING_TURNSTILE_SITE_KEY??'',
  ready:Boolean(env.DATA_ENCRYPTION_KEY&&
    (env.APP_ENV==='local'||(env.MARKETING_TURNSTILE_SITE_KEY&&env.MARKETING_TURNSTILE_SECRET_KEY))),
 },{headers:{'Cache-Control':'private, no-store'}});
}
export async function action({request,context}:ActionFunctionArgs){
 const env=context.get(runtimeContext).env as Env;
 const fail=(message:string,status=422)=>data({error:message},{status,headers:{'Cache-Control':'private, no-store'}});
 if(request.headers.get('Origin')!==new URL(request.url).origin)
  return fail('Please reload the page before checking in.',403);
 if(Number(request.headers.get('content-length')??0)>10000)
  return fail('Please enter shorter contact details.',413);
 const body=await request.text();
 if(body.length>10000)return fail('Please enter shorter contact details.',413);
 const form=new URLSearchParams(body);
 if(form.get('website'))return fail('Your check-in could not be recorded.');
 const input={
  requestKey:form.get('requestKey'),listingId:form.get('listingId'),sessionId:form.get('sessionId'),
  name:form.get('name'),phone:form.get('phone'),email:form.get('email'),
  consent:form.get('consent')==='yes',source:form.get('source')==='qr'?'qr':'web',
 };
 try{
  const clientKey=await digest(env.DATA_ENCRYPTION_KEY+':checkin-source:'+
    (request.headers.get('CF-Connecting-IP')??'unknown'));
  const result=await recordOpenHomeCheckIn(env,request,{
   input,turnstile:form.get('turnstile')??undefined,clientKey,
  });
  return data({success:true,reference:result.reference,alreadyCheckedIn:result.alreadyCheckedIn},
   {headers:{'Cache-Control':'private, no-store'}});
 }catch(error){
  const code=error instanceof Error&&'code' in error?String(error.code):'';
  if(code==='CHECK_IN_WINDOW_CLOSED')return fail('This inspection is not accepting check-ins yet or has finished.',409);
  if(code==='CHECK_IN_SESSION_UNAVAILABLE')return fail('The selected inspection is no longer available.',409);
  if(code==='CHECK_IN_RATE_LIMIT')return fail('Too many check-in attempts. Ask the ProInspect representative for assistance.',429);
  if(code==='CHECK_IN_SECURITY_FAILED')return fail('Security verification failed. Refresh the page and try again.',403);
  if(code==='CHECK_IN_SECURITY_UNAVAILABLE')return fail('Security verification is temporarily unavailable.',503);
  if(code==='CHECK_IN_CHANGED')return fail('The form changed after submission. Reload to try again.',409);
  return fail('Your check-in could not be confirmed. Please review the details and try again.');
 }
}

export default function OpenHomeCheckIn(){
 const {sessions,selectedListingId,selectedSessionId,qr,requestKey,siteKey,ready}=
  useLoaderData<typeof loader>();
 const result=useActionData<typeof action>() as
  {success?:boolean;reference?:string;alreadyCheckedIn?:boolean;error?:string}|undefined;
 const properties=[...new Map(sessions.map(s=>[s.listingId,{
  id:s.listingId,kind:s.kind,title:s.title,address:s.address,suburb:s.suburb,
 }])).values()];
 const [listingId,setListingId]=useState(selectedListingId);
 const [sessionId,setSessionId]=useState(selectedSessionId);
 const available=sessions.filter(s=>s.listingId===listingId);
 const chosen=available.find(s=>s.id===sessionId);
 const property=properties.find(p=>p.id===listingId);
 const date=(iso:string)=>new Date(iso).toLocaleString('en-AU',{
  timeZone:'Australia/Perth',weekday:'short',day:'numeric',month:'short',
  hour:'numeric',minute:'2-digit',
 });
 const canSubmit=ready&&Boolean(chosen?.acceptingCheckIn);
 return <>
  <header className="openhome-hero">
   <div className="site-container">
    <p className="eyebrow"><Link to="/properties-for-lease">Properties for lease</Link> / Visitor check-in</p>
    <p className="openhome-kicker">PROINSPECT · OPEN HOMES</p>
    <h1>Welcome to your inspection.</h1>
    <p>Checking in takes less than a minute. Select the property you are visiting and enter your contact details before viewing.</p>
    <p className="openhome-attribution">ProInspect conducts inspections on behalf of the advertised leasing agent, property manager or landlord. We do not act as the landlord or leasing agent.</p>
   </div>
  </header>
  <section className="section">
   <div className="site-container openhome-layout">
    <div className="openhome-form-card">
     {result?.success?
      <div role="status" className="openhome-success">
       <div className="openhome-success-symbol" aria-hidden="true">✓</div>
       <h2>{result.alreadyCheckedIn?'Check-in already recorded':'You’re checked in.'}</h2>
       <p>Thank you. Your arrival has been recorded for the selected open inspection.</p>
       <p className="openhome-confirmation"><span>Attendance reference</span><strong>{result.reference}</strong></p>
       <p className="small">This is an inspection attendance record, not a rental application or tenancy approval.</p>
       <Link className="button secondary" to="/properties-for-lease">View properties for lease</Link>
      </div>:
      <>
       <div className="openhome-form-top"><p className="eyebrow">Visitor registration</p><h2>Check in to an open home</h2>
        <p>Only properties with approved, advertised inspection sessions appear here.</p></div>
       {properties.length===0?
        <div role="status" className="openhome-empty"><h3>No open homes are available to check in.</h3>
         <p>Upcoming properties will appear when their inspection sessions have been published.</p>
         <Link className="button secondary" to="/properties-for-lease">Browse properties for lease</Link>
        </div>:
        <Form method="post" reloadDocument className="openhome-form" aria-label="Open home visitor check-in">
         <input type="hidden" name="requestKey" value={requestKey}/>
         <input type="hidden" name="source" value={qr?'qr':'web'}/>
         <div hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
         <div className="openhome-step-label"><span>01</span> Your inspection</div>
         <label htmlFor="openhome-property">Property you are viewing <span aria-hidden="true">*</span></label>
         <select required id="openhome-property" name="listingId" value={listingId} onChange={e=>{setListingId(e.target.value);setSessionId('');}}>
          <option value="">Select a property</option>
          <optgroup label="Residential">
           {properties.filter(p=>p.kind==='residential').map(p=><option value={p.id} key={p.id}>{p.address} · {p.suburb}</option>)}
          </optgroup>
          <optgroup label="Commercial">
           {properties.filter(p=>p.kind==='commercial').map(p=><option value={p.id} key={p.id}>{p.address} · {p.suburb}</option>)}
          </optgroup>
         </select>
         <label htmlFor="openhome-session">Open inspection session <span aria-hidden="true">*</span></label>
         <select id="openhome-session" name="sessionId" required value={sessionId} onChange={e=>setSessionId(e.target.value)} disabled={!listingId}>
          <option value="">Select an inspection time</option>
          {available.map(s=><option key={s.id} value={s.id} disabled={!s.acceptingCheckIn}>
           {date(s.startsAt)} AWST · {s.acceptingCheckIn?'Check-in open':'Not accepting arrivals'}
          </option>)}
         </select>
         {property&&<div className="openhome-property-notice"><strong>{property.address}</strong>
          <span>Inspection on behalf of {chosen?.agentName??sessions.find(s=>s.listingId===listingId)?.agentName}</span>
         </div>}
         {chosen&&!chosen.acceptingCheckIn&&<p className="openhome-hint" role="status">Arrival check-in opens 30 minutes before the session and closes 45 minutes after it ends.</p>}
         <div className="openhome-step-label"><span>02</span> Your contact details</div>
         <label htmlFor="openhome-name">Full name <span aria-hidden="true">*</span></label>
         <input id="openhome-name" name="name" placeholder="Your full name" minLength={2} maxLength={120} autoComplete="name" required/>
         <div className="openhome-form-grid">
          <div><label htmlFor="openhome-phone">Mobile / phone number <span aria-hidden="true">*</span></label>
           <input id="openhome-phone" name="phone" type="tel" minLength={6} maxLength={40} autoComplete="tel" placeholder="04XX XXX XXX" required/></div>
          <div><label htmlFor="openhome-email">Email address <span aria-hidden="true">*</span></label>
           <input id="openhome-email" name="email" type="email" maxLength={254} autoComplete="email" placeholder="you@example.com" required/></div>
         </div>
         <label className="openhome-consent"><input type="checkbox" name="consent" value="yes" required/>
          <span>I consent to ProInspect recording my attendance and sharing my contact details and the property/session attended with the authorised leasing representative for inspection administration. This is not consent to marketing messages.</span>
         </label>
         <p className="openhome-hint">Please do not enter identity document numbers, financial details or access codes. See our <Link to="/privacy">privacy policy</Link>.</p>
         <Turnstile siteKey={siteKey} action="open_home_check_in"/>
         {result?.error&&<p role="alert" className="notice warning">{result.error}</p>}
         <button type="submit" className="button openhome-submit" disabled={!canSubmit}>
          {canSubmit?'Complete check-in →':'Select an open inspection to check in'}
         </button>
        </Form>}
      </>
     }
    </div>
    <aside className="openhome-aside">
     <div className="openhome-side-card"><p className="eyebrow">What to expect</p>
      <h2>A straightforward arrival.</h2>
      <ol><li><strong>Choose the property</strong><span>Select the open home you are attending.</span></li>
       <li><strong>Enter your details</strong><span>We record your name, phone number and email.</span></li>
       <li><strong>Enjoy the inspection</strong><span>Our representative can confirm you have checked in.</span></li></ol>
     </div>
     <div className="openhome-side-note"><strong>Already registered online?</strong>
      <p>Use the same email address. Where an advance registration exists, the attendance register will automatically match your check-in.</p></div>
     <Link className="openhome-back-link" to="/properties-for-lease">← Explore properties for lease</Link>
    </aside>
   </div>
  </section>
 </>;
}
