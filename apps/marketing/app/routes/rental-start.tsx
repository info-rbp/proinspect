import { Form, Link, useLoaderData, useActionData, type LoaderFunctionArgs, type ActionFunctionArgs, data } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import { AppError, type Env } from '../../../../packages/database/types';
import { publicListing } from '../../../platform/worker/features/leasing.server';
import { rentalStartPage, startRental } from '../../../platform/worker/features/rental-applications.server';
import { Turnstile } from '../../../../packages/ui/Turnstile';
import { seo } from '../lib/seo';
import '../../../../packages/ui/rental-application.css';

export const meta=()=>seo('Residential rental application | ProInspect','Complete a private residential rental application for a residential property where ProInspect is authorised to administer the application.','/properties-for-lease');
export async function loader({context,params}:LoaderFunctionArgs){
 const env=context.get(runtimeContext).env as Env;
 if(params.kind!=='residential')throw new Response('Residential applications only',{status:404});
 const slug=params.slug??'';
 const published=await publicListing(env,'residential',slug);
 if(!published)throw new Response('Property not found',{status:404});
 // Public listing data only. Never reveal an unpublished listing through an application URL.
 const l=published.listing;
 const unavailable={listing:{id:l.id,slug:l.slug,title:l.title,address:l.display_address,suburb:l.suburb,agentName:l.agent_name},
  enabled:false,siteKey:'',unavailable:true};
 const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
 if(l.application_mode!=='proinspect'||l.rental_approval_state!=='approved'||!l.rental_recipient_verified_at)
  return data(unavailable,{headers});
 try{
  const page=await rentalStartPage(env,slug);
  return data({...page,unavailable:!page.enabled},{headers});
 }catch(error){
  if(error instanceof AppError&&error.code==='RENTAL_APPLICATION_UNAVAILABLE')return data(unavailable,{headers});
  throw error;
 }
}
export async function action({request,context,params}:ActionFunctionArgs){
 const env=context.get(runtimeContext).env as Env;
 const fail=(message:string,status=422)=>data({error:message},{status,headers:{'Cache-Control':'no-store'}});
 if(request.headers.get('Origin')!==new URL(request.url).origin)return fail('Reload the page and try again.',403);
 if(Number(request.headers.get('content-length')??0)>12000)return fail('Please check the form and try again.',413);
 const body=await request.text();if(body.length>12000)return fail('Please check the form and try again.',413);
 const f=new URLSearchParams(body);
 if(f.get('website'))return fail('Submission not accepted.');
 try{
  const published=await publicListing(env,'residential',params.slug??'');
  if(!published||published.listing.application_mode!=='proinspect'||
   published.listing.rental_approval_state!=='approved'||!published.listing.rental_recipient_verified_at)
   return fail('Online applications are not currently available for this property.',409);
  const page=await rentalStartPage(env,params.slug??'');
  if(!page.enabled)return fail('Online applications are not currently available for this property.',409);
  const result=await startRental(env,request,page.listing.id,{
   email:f.get('email'),name:f.get('name'),consent:f.get('consent')==='yes'
  },f.get('turnstile')||undefined);
  return data({success:result.sent},{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  return fail(error instanceof Error&&error.message.startsWith('Too many')?'Too many attempts. Please try again later.':
   'The application link could not be sent. Check the information and try again.');
 }
}
export default function RentalStart(){
 const {listing,enabled,siteKey,unavailable}=useLoaderData<typeof loader>();
 const result=useActionData<typeof action>() as {success?:boolean;error?:string}|undefined;
 return <div className="rental-shell"><div className="site-container">
  <nav className="rental-breadcrumb" aria-label="Breadcrumb"><Link to="/properties-for-lease/residential">Residential properties</Link><span aria-hidden="true"> / </span><Link to={'/properties-for-lease/residential/'+listing.slug}>Property details</Link></nav>
  <div className="rental-intro"><p className="eyebrow">Private residential application</p><h1>{unavailable?'Applications are not yet open':'Apply for '+listing.title}</h1><p>{unavailable?'Online rental applications for '+listing.title+' are not currently available. You can still view the property and register your interest.':'Complete your application in your own time. Each adult applicant can complete their section privately, and supporting documents can be added securely.'}</p></div>
  <div className="rental-start-grid"><section className="rental-paper">
    {unavailable?<div role="status" className="notice warning rental-unavailable">
      <h2>Online applications not yet available</h2>
      <p>This property is not currently accepting ProInspect-hosted rental applications. You can register your interest on the public property listing while the landlord's application arrangements are finalised.</p>
      <Link className="button" to={'/properties-for-lease/residential/'+listing.slug+'#leasing-enquiry'}>Register your interest</Link>
     </div>:result?.success?<div role="status" className="rental-success"><h2>Check your email</h2><p>We have sent a private application link to the address you entered, if delivery is available. Open it to start or resume your application.</p><p>Do not forward the link: it allows access to your own answers and documents.</p></div>:<>
      <h2>Start or resume an application</h2><p className="rental-muted">An email link allows you to save progress. No ProInspect portal account is required.</p>
      <Form method="post" reloadDocument className="rental-form">
       <div className="rental-field"><label htmlFor="rental-name">Your full name <span aria-hidden="true">*</span></label><input id="rental-name" name="name" autoComplete="name" maxLength={120} minLength={2} required/></div>
       <div className="rental-field"><label htmlFor="rental-email">Your email address <span aria-hidden="true">*</span></label><input id="rental-email" name="email" type="email" autoComplete="email" maxLength={254} required/><small>We'll send a secure application link. Each co-applicant receives their own.</small></div>
       <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
       <label className="rental-check"><input type="checkbox" name="consent" value="yes" required/><span>I agree to ProInspect collecting my contact details to send and administer this application on behalf of the identified leasing representative. <Link to="/privacy">Privacy information</Link>.</span></label>
       <Turnstile siteKey={siteKey} action="rental_application"/>
       {result?.error&&<p className="notice warning" role="alert">{result.error}</p>}
       <button type="submit" className="button rental-full-button" disabled={!enabled}>{enabled?'Email my secure application link':'Online applications temporarily unavailable'}</button>
      </Form>
    </>}
  </section>
  <aside className="rental-side"><div className="rental-property-panel"><p className="eyebrow">Property you're applying for</p><h3>{listing.title}</h3><p>{listing.address}, {listing.suburb} WA</p><p>Application administered by ProInspect on behalf of <strong>{listing.agentName}</strong>.</p></div>
  <div className="rental-property-panel"><h3>How it works</h3><ol><li>Receive your private application link.</li><li>Complete your rental application details in short sections.</li><li>Invite other adult applicants if needed.</li><li>Upload supporting evidence securely.</li><li>Review and submit as a household.</li></ol><p className="rental-muted">This application is not a tenancy agreement or an offer. The landlord or authorised leasing representative makes leasing decisions.</p></div></aside>
  </div>
 </div></div>;
}
