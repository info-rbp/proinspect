import { Form,Link,data,useLoaderData,useActionData,type LoaderFunctionArgs,type ActionFunctionArgs } from 'react-router';
import { platformEnv } from '../../../../packages/database/context';
import { publicListing } from '../../../platform/worker/features/leasing.server';
import { commercialListingReady,flowConfig,beginCommercial,commercialPrivateHeaders } from '../../../platform/worker/features/commercial-intake.server';
import { Turnstile } from '../../../../packages/ui/Turnstile';
import { boundedText } from '../../../../packages/http-bodies';
import '../../../../packages/ui/rental-application.css';
export const meta=()=>[{title:'Private commercial leasing application | ProInspect'},{name:'robots',content:'noindex, nofollow, noarchive'},{name:'referrer',content:'strict-origin'}];
export async function loader({params,context}:LoaderFunctionArgs){
 const env=platformEnv(context),listing=await publicListing(env,'commercial',params.slug??'');
 if(!listing)throw new Response('Property unavailable',{status:404,headers:commercialPrivateHeaders});
 const flow=await commercialListingReady(env,listing.listing.id),config=flow?await flowConfig(env,flow):null;
 return data({listing:{title:listing.listing.title,address:listing.listing.display_address,representative:listing.listing.agent_name,slug:listing.listing.slug},enabled:Boolean(flow),notice:config?{text:config.collectionNotice,providers:config.providerDisclosure,version:config.privacyVersion,retention:config.retention}:null,siteKey:env.MARKETING_TURNSTILE_SITE_KEY},{headers:commercialPrivateHeaders});
}
export async function action({request,params,context}:ActionFunctionArgs){
 const env=platformEnv(context);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return data({error:'Reload the page and try again.'},{status:403,headers:commercialPrivateHeaders});
 try{
  const form=new URLSearchParams(await boundedText(request,12000));if(form.get('website'))throw Error('Submission unavailable.');
  const listing=await publicListing(env,'commercial',params.slug??''),flow=listing?await commercialListingReady(env,listing.listing.id):null;
  if(!flow)return data({error:'Commercial applications are not open for this property.'},{status:503,headers:commercialPrivateHeaders});
  await beginCommercial(env,request,flow.id,{name:form.get('name'),email:form.get('email'),consent:form.get('consent')==='yes'},String(form.get('turnstile')??''));
  return data({sent:true},{headers:commercialPrivateHeaders});
 }catch{return data({error:'Check your details and security verification. No application has been confirmed.'},{status:422,headers:commercialPrivateHeaders});}
}
export default function CommercialStart(){
 const d=useLoaderData<typeof loader>(),r=useActionData<typeof action>();
 return <div className="rental-shell"><div className="site-container"><nav className="rental-breadcrumb"><Link to={'/properties-for-lease/commercial/'+d.listing.slug}>Property details</Link></nav>
  <div className="rental-intro"><p className="eyebrow">Commercial leasing application</p><h1>{d.enabled?'Apply for '+d.listing.title:'Commercial applications are not open'}</h1><p>{d.listing.address} · Responsible representative: {d.listing.representative}</p></div>
  <section className="rental-paper">{!d.enabled?<div role="status"><p>This property is not accepting ProInspect-hosted commercial applications. Follow its approved external application process or register your interest on the listing.</p><Link className="button" to={'/properties-for-lease/commercial/'+d.listing.slug+'#leasing-enquiry'}>Register your interest</Link></div>:r&&'sent' in r?<div role="status"><h2>Check your email</h2><p>If delivery is available, a single-use private link has been sent. It expires in 30 minutes. Each signatory or guarantor receives their own access.</p></div>:<>
   <h2>Start or resume securely</h2><p>No customer portal account is required. This application is not a lease, guarantee or approval. The lessor or authorised representative makes the decision.</p>
   <div className="rental-notice"><h3>Collection notice — {d.notice?.version}</h3><p>{d.notice?.text}</p><p>{d.notice?.providers}</p><p>Retention: draft {d.notice?.retention.draft} days, submitted {d.notice?.retention.submitted} days, withdrawn {d.notice?.retention.withdrawn} days, subject to approved holds. Privacy, access and correction: info@proinspect.systems. <Link to="/privacy">Privacy policy</Link>.</p></div>
   <Form method="post" className="rental-form"><label>Your name<input name="name" required minLength={2} maxLength={120} autoComplete="name"/></label><label>Private email<input name="email" type="email" required maxLength={254} autoComplete="email"/></label><div hidden><input name="website" tabIndex={-1} autoComplete="off"/></div>
    <label className="rental-check"><input name="consent" type="checkbox" value="yes" required/><span>I consent to contact and application administration under the identified notice.</span></label>
    <Turnstile siteKey={d.siteKey} action="commercial_application"/>{r&&'error' in r&&<p role="alert">{r.error}</p>}
    <button className="button">Email my private application link</button>
   </Form></>}
  </section></div></div>;
}
