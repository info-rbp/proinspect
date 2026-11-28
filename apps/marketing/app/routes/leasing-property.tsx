import { commercialListingReady } from '../../../platform/worker/features/commercial-intake.server';
import { useState } from 'react';
import { Link, Form, useLoaderData, useActionData, useSearchParams, type LoaderFunctionArgs, type ActionFunctionArgs, data } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import { statement, type Env } from '../../../../packages/database/types';
import { publicListing, createLead } from '../../../platform/worker/features/leasing.server';
import { rentalListingReady } from '../../../platform/worker/features/rental-applications.server';
import { displayPrice, listingApplicationAction } from '../../../../packages/marketing/leasing';
import { isOpenHomeCheckInAvailable } from '../../../../packages/marketing/open-home';
import { isLeasingDemoListing, leasingResultsUrl, leasingDate, inspectionDate, listingFacts, listingTypeName } from '../../../../packages/marketing/leasing-presentation';
import { digest } from '../../../../packages/auth/crypto';
import { Turnstile } from '../../../../packages/ui/Turnstile';
import { LeasingGallery, type ListingPhoto } from '../components/leasing-gallery';
import { seo } from '../lib/seo';
import '../../../../packages/ui/leasing.css';

export const meta=({loaderData:page,params}:any)=>seo(page?.result?.listing?.title??'Property for Lease','Property details, advertised inspections and application information.',`/properties-for-lease/${params.kind}/${params.slug}`,{noindex:true});
type Session={id:string;starts_at:string;ends_at:string;capacity:number|null;booked_count:number;status:string};
export async function loader({params,context}:LoaderFunctionArgs){
 if(!['residential','commercial'].includes(params.kind??''))throw new Response('Not found',{status:404});
 const env=context.get(runtimeContext).env as Env;
 const result=await publicListing(env,params.kind!,params.slug!);
 if(!result)throw new Response('Property not found',{status:404});
 const demo=isLeasingDemoListing(result.listing.id);
 if(demo&&env.APP_ENV==='production')throw new Response('Property not found',{status:404});
 const commercialReady=!demo&&result.listing.kind==='commercial'&&Boolean(await commercialListingReady(env,result.listing.id));
 const rentalReady=!demo&&result.listing.kind==='residential'&&await rentalListingReady(env,result.listing.slug);
 const at=new Date();
 const sessions=demo?[]:(await statement(env.DB,"SELECT id,starts_at,ends_at FROM leasing_sessions WHERE listing_id=? AND status='scheduled' AND ends_at>=? AND starts_at<=? ORDER BY starts_at LIMIT 40",result.listing.id,new Date(+at-45*60000).toISOString(),new Date(+at+30*60000).toISOString()).all<{id:string;starts_at:string;ends_at:string}>()).results;
 const checkIn=sessions.find(s=>isOpenHomeCheckInAvailable(s,at))?.id??null;
 return data({commercialReady,result,demo,checkIn,requestKey:crypto.randomUUID(),siteKey:demo?'':env.MARKETING_TURNSTILE_SITE_KEY??'',rentalReady,ready:!demo&&Boolean(env.DATA_ENCRYPTION_KEY&&(env.APP_ENV==='local'||env.MARKETING_TURNSTILE_SECRET_KEY&&env.MARKETING_TURNSTILE_SITE_KEY))},{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
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
 if(env.APP_ENV!=='local'&&isLeasingDemoListing(result.listing.id))return fail('This demonstration listing does not accept registrations.',409);
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

const bookable=(session:Session)=>session.capacity==null||session.booked_count<session.capacity;
export default function LeasingProperty(){
 const {result,demo,checkIn,requestKey,siteKey,rentalReady,commercialReady,ready}=useLoaderData<typeof loader>();
 const [params]=useSearchParams();
 const p=result.listing,photos=(demo?[]:result.photos) as ListingPhoto[],sessions=(demo?[]:result.sessions) as unknown as Session[];
 const back=leasingResultsUrl(params.has('type')||params.has('q')?params.get('type'):p.kind,params.get('q'));
 const res=useActionData<typeof action>() as {success?:boolean;reference?:string;error?:string}|undefined;
 const applicationCta=listingApplicationAction({kind:p.kind,slug:p.slug,applicationMode:commercialReady?'proinspect_commercial':p.application_mode,applicationUrl:demo?null:p.application_url,rentalReady,commercialReady});
 const canApply=!demo&&applicationCta.type!=='interest';
 const openSessions=sessions.filter(bookable);
 const [kind,setKind]=useState<'inspection'|'interest'>(openSessions.length?'inspection':'interest');
 const [sessionId,setSessionId]=useState(openSessions[0]?.id??'');
 const selectedKind=kind==='inspection'&&openSessions.length?'inspection':'interest';
 const facts=listingFacts(p),available=leasingDate(p.available_from);
 const choose=(type:'inspection'|'interest',id?:string)=>{setKind(type);if(id)setSessionId(id);};
 const representativeRole=({landlord:'Landlord',property_manager:'Property manager',leasing_agent:'Leasing agent'} as Record<string,string>)[p.agent_role]??'Leasing representative';
 return <div className="pi-leasing-property">
  <header className="service-hero leasing-hero">
   <div className="site-container leasing-hero-inner">
    <nav className="leasing-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><Link to={back}>Leasing</Link><span aria-hidden="true">/</span><span aria-current="page">{listingTypeName(p.kind)} property</span></nav>
    <p className="eyebrow leasing-hero-eyebrow">{listingTypeName(p.kind)} · {p.suburb}</p>
    <h1>{p.title}</h1>
    {demo?<p className="pi-leasing-demo-label">Demonstration listing · Not available to rent</p>:<>
     <div className="leasing-hero-meta"><strong className="leasing-hero-price">{displayPrice(p.price_cents,p.price_period)}</strong><span className="leasing-hero-location">{p.display_address} · {p.suburb} WA {p.postcode}</span></div>
     {facts.length>0&&<ul className="pi-leasing-hero-facts" aria-label="Property features">{facts.map(f=><li key={f.label}><strong>{f.value}</strong> {f.label==='Floor area'?'':f.label}</li>)}</ul>}
     {available&&<p className="pi-leasing-availability">Available from {available}</p>}
    </>}
    <div className="leasing-hero-actions">
     {!demo&&(checkIn?<Link className="button leasing-hero-primary" to={'/open-home/check-in?property='+encodeURIComponent(p.id)+'&session='+encodeURIComponent(checkIn)}>Check in for your inspection</Link>:ready&&!res?.success&&openSessions.length?<a className="button leasing-hero-primary" href="#leasing-enquiry" onClick={()=>choose('inspection',openSessions[0]?.id)}>Register for an inspection</a>:canApply?<a className="button leasing-hero-primary" href="#leasing-application">Application information</a>:ready&&!res?.success?<a className="button leasing-hero-primary" href="#leasing-enquiry" onClick={()=>choose('interest')}>Register your interest</a>:<a className="button leasing-hero-primary" href="#leasing-next-steps">View next steps</a>)}
     {!!photos.length&&<a className="button secondary leasing-hero-secondary" href="#leasing-gallery">View property photos</a>}
     <Link className="button secondary leasing-hero-secondary" to={back}>Back to search results</Link>
    </div>
   </div>
  </header>
  <LeasingGallery key={p.id} photos={photos}/>
  <section className="section leasing-content-section"><div className="site-container leasing-detail-grid">
   <div className="stack">
    <div className="panel leasing-overview"><p className="eyebrow">At a glance</p><h2>About this property</h2><p className="leasing-description">{p.description}</p>
     {!demo&&<><h3>Property information</h3><dl className="pi-leasing-information"><div><dt>Property type</dt><dd>{listingTypeName(p.kind)}</dd></div><div><dt>Location</dt><dd>{p.display_address}</dd></div>{available&&<div><dt>Available from</dt><dd>{available}</dd></div>}</dl></>}
    </div>
    {!demo&&<div className="panel pi-leasing-representative"><h2>Leasing representative</h2>{p.agent_name&&<p><strong>{p.agent_name}</strong> · {representativeRole}</p>}<p>ProInspect facilitates the advertised inspections on behalf of the responsible party. The responsible landlord or leasing agent sets leasing terms and application requirements and makes leasing decisions.</p></div>}
   </div>
   <aside className="stack pi-leasing-next-steps" id="leasing-next-steps" aria-labelledby="leasing-next-steps-heading">
    <div className="panel pi-leasing-action-panel"><p className="eyebrow">Your next steps</p><h2 id="leasing-next-steps-heading">Interested in this property?</h2>
    {demo?<div className="pi-leasing-demo-note"><h3>Website demonstration only</h3><p>This example illustrates the property page layout. It is not a genuine rental opportunity and does not accept applications, enquiries or inspection registrations.</p><Link className="pi-inline-link" to={back}>Return to available properties <span aria-hidden="true">→</span></Link></div>:<>
     <section id="leasing-inspections" aria-labelledby="leasing-inspections-heading"><h3 id="leasing-inspections-heading">Open for inspection</h3>
      {!sessions.length?<p>No upcoming inspections are currently advertised.</p>:<ul className="leasing-session-list">{sessions.map(s=><li key={s.id}><div><strong>{inspectionDate(s.starts_at)}</strong><p className="small">{bookable(s)?'Registration available':'Session fully booked'}</p></div>{ready&&!res?.success&&bookable(s)&&<a className="pi-inline-link" href="#leasing-enquiry" onClick={()=>choose('inspection',s.id)} aria-label={'Register for inspection '+inspectionDate(s.starts_at)}>Register <span aria-hidden="true">→</span></a>}</li>)}</ul>}
      {checkIn&&<Link className="button secondary" to={'/open-home/check-in?property='+encodeURIComponent(p.id)+'&session='+encodeURIComponent(checkIn)}>Open home visitor check-in</Link>}
     </section>
     <section id="leasing-application" className="pi-leasing-action-section" aria-labelledby="leasing-application-heading"><h3 id="leasing-application-heading">Applications</h3>
      {applicationCta.type==='proinspect'||applicationCta.type==='proinspect_commercial'?<><p>Applications are open through the secure ProInspect application process.</p><Link className="button" to={applicationCta.href}>Start or resume application</Link></>:applicationCta.type==='external'?<><p>Applications are managed through the leasing representative’s approved provider.</p><a className="button" href={applicationCta.href} target="_blank" rel="noopener noreferrer">Continue to application provider (opens in a new tab)</a></>:<><p><strong>Online applications not currently available.</strong></p><p>Follow the advertised application information when it becomes available.</p></>}
      <p className="small">An application does not constitute a lease or tenancy approval.</p>
     </section>
     <section id="leasing-enquiry" className="pi-leasing-action-section leasing-enquiry-panel" aria-labelledby="leasing-enquiry-heading"><h3 id="leasing-enquiry-heading">Registration and interest</h3>
      {res?.success?<div role="status" className="notice"><h4>Registration received</h4><p>Reference: <strong>{res.reference}</strong></p><p>This is not a rental application or approval.</p></div>:!ready?<><p>Registration is temporarily unavailable.</p><p className="small">Please check back for updated inspection and enquiry information.</p></>:<>
       <p>Register for an available inspection or express your interest. No ProInspect account is required.</p>
       <Form method="post" reloadDocument className="form" aria-label="Lease inspection registration">
        <input type="hidden" name="requestKey" value={requestKey}/><div hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
        {openSessions.length>0?<label>Request type<select name="kind" required value={selectedKind} onChange={e=>setKind(e.target.value as 'inspection'|'interest')}><option value="inspection">Register for an open inspection</option><option value="interest">Register general interest</option></select></label>:<input type="hidden" name="kind" value="interest"/>}
        {selectedKind==='inspection'&&<label>Open inspection session<select name="sessionId" required value={openSessions.some(s=>s.id===sessionId)?sessionId:openSessions[0]?.id??''} onChange={e=>setSessionId(e.target.value)}>{openSessions.map(s=><option value={s.id} key={s.id}>{inspectionDate(s.starts_at)}</option>)}</select></label>}
        <label>Full name<input name="name" required minLength={2} maxLength={120} autoComplete="name"/></label>
        <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email"/></label>
        <label>Phone<input name="phone" type="tel" required minLength={6} maxLength={40} autoComplete="tel"/></label>
        <label>Message (optional)<textarea name="message" maxLength={1200} rows={3}/></label>
        <label className="check"><input name="consent" type="checkbox" value="yes" required/>I agree to ProInspect using these details to administer this enquiry or inspection registration. This is not marketing consent.</label>
        <p className="small">Only provide ordinary contact information; do not include ID documents, financial records, access codes or sensitive tenant information. <Link className="pi-leasing-privacy" to="/privacy">Privacy policy</Link>.</p>
        <Turnstile siteKey={siteKey} action="leasing"/>
        {res?.error&&<p className="notice warning" role="alert">{res.error}</p>}
        <button className="button" type="submit">{selectedKind==='inspection'?'Submit inspection registration':'Submit expression of interest'}</button>
       </Form>
      </>}
     </section>
    </>}
    </div>
   </aside>
  </div></section>
 </div>;
}
