import { useState } from 'react';
import { Link,Form,useLoaderData,useActionData,type LoaderFunctionArgs,type ActionFunctionArgs,data } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import type { Env } from '../../../../packages/database/types';
import { publicListing,createLead } from '../../../platform/worker/features/leasing.server';
import { rentalEnabled } from '../../../platform/worker/features/rental-applications.server';
import { releaseFeatureReady } from '../../../platform/worker/features/release-governance.server';
import { displayPrice,handoffDisclaimer,listingApplicationAction } from '../../../../packages/marketing/leasing';
import { digest } from '../../../../packages/auth/crypto';
import { Turnstile } from '../../../../packages/ui/Turnstile';
import { seo } from '../lib/seo';
import '../../../../packages/ui/leasing.css';
export const meta=({data:page,params}:any)=>seo(page?.result?.listing?.title??'Property for Lease','Open inspection information, registration and leasing representative details.',`/properties-for-lease/${params.kind}/${params.slug}`);
export async function loader({params,context}:LoaderFunctionArgs) {
 if(!['residential','commercial'].includes(params.kind??''))throw new Response('Not found',{status:404});
 const env=context.get(runtimeContext).env as Env;
 const result=await publicListing(env,params.kind!,params.slug!);
 if(!result)throw new Response('Property not found',{status:404});
 return data({result,requestKey:crypto.randomUUID(),siteKey:env.MARKETING_TURNSTILE_SITE_KEY??'',rentalReady:rentalEnabled(env)&&await releaseFeatureReady(env,'rental')&&result.listing.rental_approval_state==='approved'&&Boolean(result.listing.rental_recipient_verified_at),ready:Boolean(env.DATA_ENCRYPTION_KEY&&(env.APP_ENV==='local'||env.MARKETING_TURNSTILE_SECRET_KEY&&env.MARKETING_TURNSTILE_SITE_KEY))},{headers:{'Cache-Control':'no-store'}});
}
export async function action({request,context,params}:ActionFunctionArgs){
 const env=context.get(runtimeContext).env as Env;
 const fail=(error:string,status=422)=>data({error},{status,headers:{'Cache-Control':'no-store'}});
 const origin=new URL(request.url).origin;
 if(request.headers.get('Origin')!==origin)return fail('Reload this page and submit again.',403);
 if(Number(request.headers.get('Content-Length')??0)>12000)return fail('Submission is too large.',413);
 const raw=await request.text();if(raw.length>12000)return fail('Submission is too large.',413);
 const form=new URLSearchParams(raw);
 if(form.get('website'))return fail('Submission could not be accepted.');
 const result=await publicListing(env,params.kind!,params.slug!);
 if(!result)return fail('This listing is no longer available.',404);
 const input={requestKey:form.get('requestKey'),listingId:result.listing.id,kind:form.get('kind'),sessionId:form.get('sessionId')||null,name:form.get('name'),email:form.get('email'),phone:form.get('phone'),message:form.get('message')||'',consent:form.get('consent')==='yes'};
 try {
  const clientKey=await digest(env.DATA_ENCRYPTION_KEY+':lease-source:'+(request.headers.get('CF-Connecting-IP')??'unknown'));
  const receipt=await createLead(env,request,{input,turnstile:form.get('turnstile')||undefined,clientKey});
  return data({success:true,reference:receipt.reference},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  if(e instanceof Error&&e.message==='SESSION_CAPACITY')return fail('This session is full or has changed. Please select another.',409);
  return fail('We could not confirm this registration. Please review the details and try again.',422);
 }
}
export default function LeasingProperty(){
 const {result,requestKey,siteKey,rentalReady,ready}=useLoaderData<typeof loader>();
 const res=useActionData<typeof action>() as {success?:boolean;reference?:string;error?:string}|undefined,p=result.listing as any,photos=result.photos as any[],sessions=result.sessions as any[];
 const applicationCta=listingApplicationAction({kind:p.kind,slug:p.slug,applicationMode:p.application_mode,applicationUrl:p.application_url,rentalReady});
 const canApply=applicationCta.type==='proinspect';
 const [kind,setKind]=useState<'inspection'|'interest'>(sessions.length?'inspection':'interest');
 return <>
 <header className="service-hero leasing-hero">
  <div className="site-container leasing-hero-inner">
   <nav className="leasing-breadcrumb" aria-label="Breadcrumb">
    <Link to="/properties-for-lease">Properties for lease</Link><span aria-hidden="true"> / </span>
    <Link to={`/properties-for-lease/${p.kind}`}>{p.kind==='commercial'?'Commercial':'Residential'}</Link>
   </nav>
   <p className="eyebrow leasing-hero-eyebrow">{p.kind==='commercial'?'Commercial property':'Residential property'} · {p.suburb}</p>
   <h1>{p.title}</h1>
   <div className="leasing-hero-meta">
    <strong className="leasing-hero-price">{displayPrice(p.price_cents,p.price_period)}</strong>
    <span className="leasing-hero-location">{p.display_address} · {p.suburb} WA {p.postcode}</span>
   </div>
   <div className="leasing-hero-facts" aria-label="Property features">
    {p.bedrooms!=null&&<div><strong>{p.bedrooms}</strong><span>{p.bedrooms===1?'Bedroom':'Bedrooms'}</span></div>}
    {p.bathrooms!=null&&<div><strong>{p.bathrooms}</strong><span>{p.bathrooms===1?'Bathroom':'Bathrooms'}</span></div>}
    {p.parking!=null&&<div><strong>{p.parking}</strong><span>{p.parking===1?'Car bay':'Car bays'}</span></div>}
    {p.area_sqm!=null&&<div><strong>{p.area_sqm}</strong><span>m²</span></div>}
   </div>
   <div className="leasing-hero-actions">
    {canApply?<Link className="button leasing-hero-primary" to={applicationCta.href}>Start rental application</Link>:
     applicationCta.type==='external'?<a className="button leasing-hero-primary" href={applicationCta.href} target="_blank" rel="noopener noreferrer">Apply through leasing representative</a>:
     <a className="button leasing-hero-primary" href="#leasing-enquiry">Register your interest</a>}
    <a className="button secondary leasing-hero-secondary" href="#leasing-gallery">View property photos</a>
   </div>
   <p className="leasing-role-note">{handoffDisclaimer}</p>
  </div>
 </header>
 <section id="leasing-gallery" className="leasing-showcase" aria-label="Property photographs">
  <div className="site-container">
   <div className="leasing-showcase-heading"><h2>Property photographs</h2><span>{photos.length} {photos.length===1?'photo':'photos'}</span></div>
   <div className={`leasing-gallery${photos.length===1?' leasing-gallery--single':''}`}>
    {photos.map((photo:any,i:number)=><img key={photo.id} src={`/api/public/leasing/photos/${photo.id}`} alt={photo.alt_text} loading={i===0?'eager':'lazy'}/>)}
   </div>
   <p className="leasing-photo-caption">Building and property photography provided for this listing.</p>
  </div>
 </section>
 <section className="section leasing-content-section"><div className="site-container leasing-detail-grid"><div className="stack">
 <div className="panel leasing-overview">
   <p className="eyebrow">At a glance</p><h2>About this property</h2>
   <p className="leasing-description">{p.description}</p>
   <dl className="leasing-detail-facts">
    {p.bedrooms!=null&&<div><dt>Bedrooms</dt><dd>{p.bedrooms}</dd></div>}
    {p.bathrooms!=null&&<div><dt>Bathrooms</dt><dd>{p.bathrooms}</dd></div>}
    {p.parking!=null&&<div><dt>Car bays</dt><dd>{p.parking}</dd></div>}
    {p.area_sqm!=null&&<div><dt>Area</dt><dd>{p.area_sqm} m²</dd></div>}
    {p.available_from&&<div><dt>Available</dt><dd>{p.available_from}</dd></div>}
   </dl>
  </div>
 <div className="panel"><h2>Leasing representative</h2><p><strong>{p.agent_name}</strong> · {p.agent_role==='landlord'?'Landlord':p.agent_role==='property_manager'?'Property manager':'Leasing agent'}</p><p>ProInspect conducts the advertised open inspection on this representative's behalf. All rental terms and applications are managed by the responsible party.</p></div>
 {p.kind==='residential'&&<section id="leasing-application" className={`panel leasing-application-panel${canApply?' leasing-application-panel--ready':''}`}>
   <p className="eyebrow">Rental applications</p>
   <h2>{canApply?'Ready to apply?':applicationCta.type==='external'?'Apply through the leasing representative':'Online applications not yet open'}</h2>
   {canApply?<><p>Complete your secure ProInspect rental application. Save your progress, invite additional adult applicants and provide supporting documents privately.</p>
    <Link className="button leasing-application-button" to={applicationCta.href}>Start or resume application</Link></>:
    applicationCta.type==='external'?<><p>Applications are managed through the leasing representative's approved provider.</p>
     <a className="button leasing-application-button" href={applicationCta.href} target="_blank" rel="noopener noreferrer">Continue to approved application provider</a></>:
    <><p>Online applications are not currently available for this property. Register your interest below while the leasing representative finalises the application arrangements.</p>
     <a className="button secondary leasing-application-button" href="#leasing-enquiry">Register your interest</a></>}
   <p className="small leasing-application-note">An application is not a tenancy agreement. {p.agent_name} or their authorised representative makes leasing decisions.</p>
  </section>}
  {p.kind==='commercial'&&applicationCta.type==='external'&&<div className="panel leasing-application-panel">
   <h2>Apply for this commercial property</h2><p>Applications are managed by the leasing representative.</p>
   <a className="button" href={applicationCta.href} target="_blank" rel="noopener noreferrer">Continue to application provider</a>
  </div>}
 </div><aside className="stack"><div className="panel" id="leasing-inspections"><h2>Open for inspection</h2>{sessions.length===0?<p>No open inspection sessions are currently advertised. Register your interest to receive an appropriate response.</p>:<ul className="leasing-session-list">{sessions.map((s:any)=><li key={s.id}><strong>{new Date(s.starts_at).toLocaleString('en-AU',{timeZone:'Australia/Perth',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})} AWST</strong><span>{s.capacity!=null&&s.booked_count>=s.capacity?'Session full':'Registration available'}</span></li>)}</ul>}</div>
 <div className="panel"><h2>Attending an open home today?</h2><p>Check in on arrival using your name, email and phone number. This is separate from registering for an upcoming session.</p><Link className="button secondary" to={'/open-home/check-in?property='+encodeURIComponent(p.id)}>Open home visitor check-in →</Link></div>
 <div className="panel leasing-enquiry-panel" id="leasing-enquiry"><h2>Registration and interest</h2>{res?.success?<div role="status" className="notice"><h3>Registration received</h3><p>Reference: <strong>{res.reference}</strong></p><p>This is not a rental application or an approval of your tenancy.</p></div>:<><p className="small">Choose an inspection session or express interest. You do not need a ProInspect account.</p><Form method="post" reloadDocument className="form" aria-label="Lease inspection registration">
 <input type="hidden" name="requestKey" value={requestKey}/><div hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
 <label>Request type<select name="kind" required value={kind} onChange={e=>setKind(e.target.value as "inspection"|"interest")}><option value="inspection" disabled={sessions.length===0}>Register for an open inspection</option><option value="interest">Register general interest</option></select></label>
 {kind==='inspection'&&<label>Open inspection session<select name="sessionId" required defaultValue={sessions.find((s:any)=>s.capacity==null||s.booked_count<s.capacity)?.id??''}><option value="">No session — interest only</option>{sessions.map((s:any)=><option disabled={s.capacity!=null&&s.booked_count>=s.capacity} value={s.id} key={s.id}>{new Date(s.starts_at).toLocaleString('en-AU',{timeZone:'Australia/Perth',weekday:'long',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})} AWST</option>)}</select></label>}
 <label>Full name<input name="name" required minLength={2} maxLength={120} autoComplete="name"/></label>
 <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email"/></label>
 <label>Phone<input name="phone" type="tel" required minLength={6} maxLength={40} autoComplete="tel"/></label>
 <label>Message (optional)<textarea name="message" maxLength={1200} rows={3}/></label>
 <label className="check"><input name="consent" type="checkbox" value="yes" required/>I agree to ProInspect using these details to administer this enquiry or inspection registration. This is not marketing consent.</label>
 <p className="small">Only provide ordinary contact information; do not include ID documents, financial records, access codes or sensitive tenant information. <Link to="/privacy">Privacy policy</Link>.</p>
 <Turnstile siteKey={siteKey} action="leasing"/>
 {res?.error&&<p className="notice warning" role="alert">{res.error}</p>}
 <button className="button" disabled={!ready}>{ready?'Submit registration':'Registration temporarily unavailable'}</button>
 </Form></>}</div></aside></div></section></>;
}
