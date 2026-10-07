import '../../../../packages/ui/contact.css';
import { useState } from 'react';
import { Form,Link,useLoaderData,useActionData,useNavigation,data,type LoaderFunctionArgs,type ActionFunctionArgs } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import { enquirySchema,signEnquiry } from '../../../../packages/marketing/enquiry';
import { digest } from '../../../../packages/auth/crypto';
import { SERVICE_SEEDS as SERVICES } from '../../../../packages/service-catalogue/index';
import { Field } from '../../../../packages/ui/components';
import { Turnstile } from '../../../../packages/ui/Turnstile';
import { seo } from '../lib/seo';
export const meta=()=>seo('Discuss your property requirements','Enquire about a ProInspect service, portfolio or strata arrangement.','/contact');
export function loader({request,context}:LoaderFunctionArgs) {
 const env=context.get(runtimeContext).env as Record<string,string>;
 const url=new URL(request.url),requested=url.searchParams.get('service')??'';
 return data({requestKey:crypto.randomUUID(),serviceId:SERVICES.some(s=>s.id===requested)?requested:'',
 siteKey:env.MARKETING_TURNSTILE_SITE_KEY,ready:Boolean(env.ENQUIRY_GATEWAY_SECRET&&(env.APP_ENV==='local'||env.MARKETING_TURNSTILE_SITE_KEY)),local:env.APP_ENV==='local'},
 {headers:{'Cache-Control':'no-store'}});
}
export async function action({request,context}:ActionFunctionArgs) {
 const env=context.get(runtimeContext).env as Record<string,string>;
 const fail=(message:string,status=422,fields:Record<string,string[]|undefined>={})=>data({error:message,fields,attempt:crypto.randomUUID()},{status,headers:{'Cache-Control':'no-store'}});
 const url=new URL(request.url),local=env.APP_ENV==='local'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(request.headers.get('Origin')!==(local?url.origin:env.APP_ORIGIN))return fail('Reload the contact page before submitting.',403);
 if(!env.ENQUIRY_GATEWAY_SECRET||env.ENQUIRY_GATEWAY_SECRET.length<32)return fail('The enquiry service is not configured yet.',503);
 if(Number(request.headers.get('Content-Length')??0)>20000)return fail('Your enquiry is too large.',413);
 const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>20000)return fail('Your enquiry is too large.',413);
 const form=new URLSearchParams(raw);
 if(form.get('website'))return fail('Please submit the form directly.',422);
 const parsed=enquirySchema.safeParse({...Object.fromEntries(form),serviceId:form.get('serviceId')||undefined,consent:form.get('consent')==='yes'});
 if(!parsed.success)return fail('Check the highlighted fields.',422,parsed.error.flatten().fieldErrors);
 const target=env.PLATFORM_ORIGIN||'http://localhost:5173',host=new URL(target);
 if(!local&&host.protocol!=='https:')return fail('The enquiry service is not configured yet.',503);
 try {
  const body=JSON.stringify({input:parsed.data,origin:env.MARKETING_ORIGIN||env.APP_ORIGIN,
    clientKey:await digest(`${env.ENQUIRY_GATEWAY_SECRET}:ip:${request.headers.get('CF-Connecting-IP')||'local'}`),turnstile:form.get('turnstile')||undefined});
  const timestamp=String(Date.now());
  const response=await fetch(`${target}/api/public/enquiries`,{method:'POST',headers:{'Content-Type':'application/json','X-Enquiry-Time':timestamp,'X-Enquiry-Signature':await signEnquiry(env.ENQUIRY_GATEWAY_SECRET,timestamp,body)},body,redirect:'error',signal:AbortSignal.timeout(15000)});
  const result=await response.json() as {reference?:string;message?:string;fields?:Record<string,string[]>};
  if(!response.ok)return fail(result.message||'The enquiry could not be saved. Please retry.',response.status,result.fields);
  return data({reference:result.reference},{headers:{'Cache-Control':'no-store'}});
 }catch{return fail('We could not confirm receipt. Your text remains here; retrying will not create a second enquiry.',503);}
}
export default function Contact() {
 const settings=useLoaderData<typeof loader>(),result=useActionData<any>(),pending=useNavigation().state!=='idle';
 const [requestKey]=useState(settings.requestKey);
 const field=(name:string)=>({'aria-invalid':!!result?.fields?.[name],'aria-describedby':result?.fields?.[name]?`${name}-error`:undefined});
 const error=(name:string)=>result?.fields?.[name]?.length?<p className="error-text" id={`${name}-error`}>{result.fields[name].join(' ')}</p>:null;
 return <>
  <header className="service-hero"><div className="site-container"><p className="eyebrow">Talk to ProInspect</p><h1>Tell us what the property needs.</h1><p>Start with one service, a portfolio or ongoing building support.</p></div></header>
  <section className="section"><div className="site-container contact-grid">
   <article className="panel">
    {result?.reference?<div role="status" className="stack"><h2>Your enquiry has been received.</h2><p>Reference <strong>{result.reference}</strong></p><p>ProInspect will review your requirements and contact you using the details supplied. This is not a confirmed booking or an account registration.</p><Link className="button" to="/services">Explore services</Link></div>:<>
    <h2>Your requirements</h2><p className="small">Use general property information only. Do not include keys, access codes, confidential evidence or sensitive tenant information.</p>
    {!settings.ready&&<p role="status">The enquiry service is not configured in this environment. Use synthetic information for repository testing.</p>}
    <Form method="post" className="form" aria-label="Property enquiry">
      <input type="hidden" name="requestKey" value={requestKey}/>
      <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
      <Field label="Your name" name="name"><input name="name" required minLength={2} maxLength={100} autoComplete="name" {...field('name')}/></Field>{error('name')}
      <Field label="Email address" name="email"><input name="email" required type="email" maxLength={254} autoComplete="email" {...field('email')}/></Field>{error('email')}
      <div className="grid-2"><Field label="Phone (optional)" name="phone"><input name="phone" maxLength={40} type="tel" autoComplete="tel"/></Field><Field label="Organisation (optional)" name="organisation"><input name="organisation" maxLength={180} autoComplete="organization"/></Field></div>
      <Field label="What would you like to discuss?" name="kind"><select name="kind" defaultValue={settings.serviceId?'service':'portfolio'}><option value="service">A property service</option><option value="portfolio">Portfolio or ongoing support</option><option value="strata">Strata or building operations</option><option value="other">Another requirement</option></select></Field>
      <Field label="Service (optional)" name="serviceId"><select name="serviceId" defaultValue={settings.serviceId}><option value="">Help me choose</option>{SERVICES.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>{error('serviceId')}
      <Field label="Suburb or service area (optional)" name="suburb"><input name="suburb" maxLength={100} autoComplete="address-level2"/></Field>
      <Field label="How can ProInspect help?" name="message"><textarea name="message" required minLength={15} maxLength={4000} rows={6} {...field('message')}/></Field>{error('message')}
      <label className="check"><input type="checkbox" name="consent" value="yes" required/>I agree to ProInspect using these details to respond to this enquiry. This does not subscribe me to marketing.</label>{error('consent')}
      <p className="small"><Link to="/privacy">Privacy information</Link>. This form is not monitored as an emergency service.</p>
      <Turnstile key={result?.attempt||'initial'} siteKey={settings.siteKey} action="enquiry"/>
      {result?.error&&<div className="notice warning" role="alert">{result.error}</div>}
      <button className="button" disabled={pending||!settings.ready}>{pending?'Sending enquiry...':'Send enquiry'}</button>
    </Form></>}
   </article>
   <aside className="stack"><section className="panel"><h2>Know the service you need?</h2><p>Explore the scope, then sign in to select your property and confirm a booking.</p><Link className="button secondary" to="/services">Explore services</Link></section><section className="panel"><h2>What happens next</h2><p>Your enquiry goes to the ProInspect operations team, who will review the scope, service area and next step with you.</p><p>No property access or management authority is created by submitting this form.</p></section></aside>
  </div></section>
 </>;
}
