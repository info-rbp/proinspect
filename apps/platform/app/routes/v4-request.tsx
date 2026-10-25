import {Form,Link,useLoaderData,useActionData,data,type LoaderFunctionArgs,type ActionFunctionArgs} from 'react-router';
import {platformEnv} from '../../../../packages/database/context';
import {handleApi,apiError} from '../../worker/api';
import {publicService} from '../../worker/features/v4-service-requests.server';
import {fieldsForService,formatAUD,type Field} from '../../../../packages/v4/workflows';
import {Turnstile} from '../../../../packages/ui/Turnstile';
export const meta=()=>[{title:'Request service | ProInspect'},{name:'robots',content:'noindex,nofollow'}];
export async function loader({request,context,params}:LoaderFunctionArgs){
 const value=await publicService(platformEnv(context),params.serviceCode||'');
 return data({...value,requestKey:crypto.randomUUID(),local:platformEnv(context).APP_ENV==='local',fields:fieldsForService(value.service)},
  {headers:{'Cache-Control':'private, no-store'}});
}
export async function action({request,context}:ActionFunctionArgs){
 const f=await request.formData(),get=(k:string)=>String(f.get(k)??'');
 const code=get('serviceCode'),v=await publicService(platformEnv(context),code);
 const answers:Record<string,string>={};for(const x of fieldsForService(v.service))answers[x.key]=get('a_'+x.key);
 const payload={requestKey:get('requestKey'),serviceCode:code,name:get('name'),email:get('email'),phone:get('phone'),
 street:get('street'),suburb:get('suburb'),postcode:get('postcode'),quantity:Number(get('quantity')||1),answers,
 consent:f.get('consent')==='yes',termsAcknowledged:f.get('terms')==='yes',website:get('website'),turnstile:get('turnstile')};
 try{const res=await handleApi(new Request(new URL('/api/v4/requests',request.url),{method:'POST',headers:{Origin:request.headers.get('Origin')||'', 'CF-Connecting-IP':request.headers.get('CF-Connecting-IP')||''},body:JSON.stringify(payload)}),platformEnv(context));
  return data(await res.json(),{status:res.status});}catch(error){const res=apiError(error);return data(await res.json(),{status:res.status});}
}
function Entry({item}:{item:Field}){
 const id='a_'+item.key;return <label>{item.label}{item.kind==='textarea'?<textarea name={id} id={id} maxLength={2000} required={item.required}/>
 :item.options?<select name={id} id={id} required={item.required}><option value="">Choose</option>{item.options.map(o=><option key={o}>{o}</option>)}</select>
 :<input name={id} id={id} type={item.kind==='number'?'number':item.kind==='date'?'date':'text'} min={item.kind==='number'?0:undefined} maxLength={2000} required={item.required}/>}</label>;
}
export default function V4Request(){const d=useLoaderData<typeof loader>(),r=useActionData<any>();const s=d.service;
 const price=s.pricing.totalExGstCents===null?'Quotation / scope review':formatAUD(s.pricing.totalExGstCents)+' + applicable GST (source schedule)';
 return <div className="site section"><div className="site-container"><section className="panel form-width stack">
 <p className="eyebrow">{s.id} · {s.sector}</p><h1>{s.name}</h1><p>{s.description}</p>
 <p><strong>{price}</strong></p><p className="small">{s.pricing.note}</p><p className="small">{d.workflow?.intake}</p>
 {!d.enabled?<div className="notice">This service-request pathway is not activated. <Link to="/contact">Contact ProInspect</Link>.</div>
 :r?.reference?<div role="status"><h2>Verify your email</h2><p>Request reference: {r.reference}</p>
  <p>No payment has been taken, no appointment reserved, and no legal document issued.</p>
  {r.localVerifyToken&&<Link to={'/guest/request/verify?token='+r.localVerifyToken}>Verify locally</Link>}</div>
 :<Form method="post" className="form">
  <input name="requestKey" type="hidden" value={d.requestKey}/><input name="serviceCode" type="hidden" value={s.id}/>
  <div hidden aria-hidden="true"><input name="website" tabIndex={-1}/></div>
  <h2>Customer and property details</h2><label>Full name<input name="name" autoComplete="name" minLength={2} required/></label>
  <label>Email address<input name="email" type="email" autoComplete="email" required/></label>
  <label>Phone number<input name="phone" type="tel" autoComplete="tel" required/></label>
  <label>Property street address<input name="street" required minLength={5}/></label>
  <label>Suburb<input name="suburb" required/></label><label>Postcode<input name="postcode" inputMode="numeric" pattern="[0-9]{4}" required/></label>
  {(s.pricing.kind==='quantity'||s.pricing.kind==='minimum'||s.pricing.kind==='monthly')?<label>Quantity ({s.chargingUnit})
   <input name="quantity" type="number" min="1" max="500" defaultValue="1" required/></label>:<input name="quantity" type="hidden" value="1"/>}
  <h2>Service instructions</h2>{d.fields.map((field:Field)=><Entry key={field.key} item={field}/>)}
  <p className="small">Sensitive evidence or supporting documents must be provided through an approved secure channel after review. Do not enter passwords, access codes or family-violence evidence here.</p>
  <label><input type="checkbox" name="consent" value="yes" required/>I consent to processing this request. This is not marketing consent.</label>
  <label><input type="checkbox" name="terms" value="yes" required/>I acknowledge that the service, price, scope and applicable terms require confirmation before work starts.</label>
  <Turnstile siteKey={d.turnstileKey??undefined} action="guest_booking"/>
  {r?.message&&<p role="alert">{r.message}</p>}
  <p>No payment will be collected by this request form. A quote or Staff approval may be required.</p>
  <button className="button" disabled={!d.local&&!d.turnstileKey}>Verify email and submit request</button>
  </Form>}
 <Link to="/guest/services">Browse other services</Link>
 </section></div></div>;
}
