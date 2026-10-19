import { useState } from 'react';
import { Link,Form,useLoaderData,useActionData,type LoaderFunctionArgs,type ActionFunctionArgs,data } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import type { Env } from '../../../../packages/database/types';
import { publicListing,createLead } from '../../../platform/worker/features/leasing.server';
import { rentalEnabled } from '../../../platform/worker/features/rental-applications.server';
import { displayPrice,handoffDisclaimer,safeApplicationUrl } from '../../../../packages/marketing/leasing';
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
 return data({result,requestKey:crypto.randomUUID(),siteKey:env.MARKETING_TURNSTILE_SITE_KEY??'',rentalReady:rentalEnabled(env),ready:Boolean(env.DATA_ENCRYPTION_KEY&&(env.APP_ENV==='local'||env.MARKETING_TURNSTILE_SECRET_KEY&&env.MARKETING_TURNSTILE_SITE_KEY))},{headers:{'Cache-Control':'no-store'}});
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
 const appUrl=safeApplicationUrl(p.application_url);
 const [kind,setKind]=useState<'inspection'|'interest'>(sessions.length?'inspection':'interest');
 return <><header className="service-hero"><div className="site-container"><p className="eyebrow"><Link to="/properties-for-lease">Properties for lease</Link> / <Link to={`/properties-for-lease/${p.kind}`}>{p.kind}</Link></p><h1>{p.title}</h1><p>{p.display_address} · {p.suburb} WA {p.postcode}</p><p className="leasing-price">{displayPrice(p.price_cents,p.price_period)}</p><p className="leasing-role-note">{handoffDisclaimer}</p></div></header>
 <div className="site-container"><div className="leasing-gallery">{photos.map((photo:any,i:number)=><img key={photo.id} src={`/api/public/leasing/photos/${photo.id}`} alt={photo.alt_text} loading={i===0?'eager':'lazy'}/>)}</div></div>
 <section className="section"><div className="site-container leasing-detail-grid"><div className="stack">
 <div className="panel"><p className="eyebrow">{p.kind==='commercial'?'Commercial':'Residential'} lease</p><h2>About this property</h2><p className="leasing-description">{p.description}</p><div className="leasing-facts">{p.bedrooms!=null&&<span>{p.bedrooms} bedrooms</span>}{p.bathrooms!=null&&<span>{p.bathrooms} bathrooms</span>}{p.parking!=null&&<span>{p.parking} parking</span>}{p.area_sqm!=null&&<span>{p.area_sqm} m²</span>}{p.available_from&&<span>Available {p.available_from}</span>}</div></div>
 <div className="panel"><h2>Leasing representative</h2><p><strong>{p.agent_name}</strong> · {p.agent_role==='landlord'?'Landlord':p.agent_role==='property_manager'?'Property manager':'Leasing agent'}</p><p>ProInspect conducts the advertised open inspection on this representative's behalf. All rental terms and applications are managed by the responsible party.</p></div>
 {p.application_mode==='external'&&appUrl&&<div className="panel"><h2>Apply for this property</h2><p>Applications are submitted through the leasing representative's nominated provider, not through ProInspect.</p><a className="button secondary" href={appUrl} target="_blank" rel="noopener noreferrer">Continue to application provider ↗</a></div>}
 {p.application_mode==='proinspect'&&p.kind==='residential'&&<div className="panel"><h2>Apply for this residential property</h2><p>Complete a private Form 18-based application. You can save your progress, invite additional applicants and securely upload requested documents. ProInspect administers applications on behalf of {p.agent_name}; the leasing representative makes the decision.</p>{rentalReady?<Link className="button" to={'/properties-for-lease/residential/'+p.slug+'/apply'}>Start or resume application →</Link>:<p className="notice warning">ProInspect-hosted applications are temporarily unavailable. Register your interest instead.</p>}</div>}
 </div><aside className="stack"><div className="panel"><h2>Open for inspection</h2>{sessions.length===0?<p>No open inspection sessions are currently advertised. Register your interest to receive an appropriate response.</p>:<ul className="leasing-session-list">{sessions.map((s:any)=><li key={s.id}><strong>{new Date(s.starts_at).toLocaleString('en-AU',{timeZone:'Australia/Perth',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})} AWST</strong><span>{s.capacity!=null&&s.booked_count>=s.capacity?'Session full':'Registration available'}</span></li>)}</ul>}</div>
 <div className="panel"><h2>Registration and interest</h2>{res?.success?<div role="status" className="notice"><h3>Registration received</h3><p>Reference: <strong>{res.reference}</strong></p><p>This is not a rental application or an approval of your tenancy.</p></div>:<><p className="small">Choose an inspection session or express interest. You do not need a ProInspect account.</p><Form method="post" reloadDocument className="form" aria-label="Lease inspection registration">
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
