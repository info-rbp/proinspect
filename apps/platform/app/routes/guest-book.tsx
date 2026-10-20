import { Form,Link,useLoaderData,useActionData,data,type LoaderFunctionArgs,type ActionFunctionArgs } from 'react-router';
import {platformEnv} from '../../../../packages/database/context';
import {SERVICE_SEEDS} from '../../../../packages/service-catalogue/index';
import {Turnstile} from '../../../../packages/ui/Turnstile';
import {handleApi,apiError} from '../../worker/api';
export function loader({request,context,params}:LoaderFunctionArgs){const env=platformEnv(context);return data({key:crypto.randomUUID(),chosen:params.serviceId||'',services:SERVICE_SEEDS.map(s=>({id:s.id,name:s.name})),siteKey:env.TURNSTILE_SITE_KEY,local:env.APP_ENV==='local'},{headers:{'Cache-Control':'no-store'}});}
export async function action({request,context}:ActionFunctionArgs){const env=platformEnv(context),f=await request.formData(),v=(s:string)=>String(f.get(s)||'');
const input={requestKey:v('requestKey'),name:v('name'),email:v('email'),phone:v('phone'),serviceId:v('serviceId'),sector:v('sector'),address:v('address'),suburb:v('suburb'),postcode:v('postcode'),propertyType:v('propertyType'),consent:f.get('consent')==='yes',website:v('website'),turnstile:v('turnstile'),access:{method:v('accessMethod'),instructions:v('instructions'),noticeConfirmed:f.get('noticeConfirmed')==='yes'}};
try{const r=await handleApi(new Request(new URL('/api/guest/requests',request.url),{method:'POST',headers:{Origin:request.headers.get('Origin')||'','CF-Connecting-IP':request.headers.get('CF-Connecting-IP')||''},body:JSON.stringify(input)}),env);return data(await r.json(),{status:r.status});}catch(e){const r=apiError(e);return data(await r.json(),{status:r.status});}}
export default function GuestBook(){const d=useLoaderData<typeof loader>(),r=useActionData<any>();return <div className="site section"><div className="site-container"><section className="panel form-width stack"><p className="eyebrow">Pay as you go</p><h1>Book a one-off ProInspect service</h1><p>No registration or subscription required. Verify your email before arranging a booking.</p>
{r?.reference?<><h2>Check your email</h2><p>Request reference: {r.reference}</p>{r.localVerifyToken&&<Link to={'/guest/verify?token='+r.localVerifyToken}>Verify locally</Link>}</>:<Form method="post" className="form">
<input name="requestKey" value={d.key} type="hidden"/><div hidden aria-hidden="true"><input name="website" tabIndex={-1}/></div>
<label>Service<select name="serviceId" defaultValue={d.chosen} required><option value="">Choose a service</option>{d.services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
<label>Sector<select name="sector"><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="strata-building">Strata/building</option></select></label>
<label>Street address<input name="address" minLength={5} maxLength={180} required/></label><label>Suburb<input name="suburb" required/></label><label>Postcode<input name="postcode" required pattern="[0-9]{4}"/></label>
<label>Property type<select name="propertyType"><option>House</option><option>Apartment</option><option>Townhouse</option><option>Villa</option><option>Office</option><option>Retail</option><option>Warehouse</option><option>Industrial</option><option>Mixed-use</option><option>Other</option></select></label>
<label>Full name<input name="name" required minLength={2} autoComplete="name"/></label><label>Email address<input type="email" name="email" required autoComplete="email"/></label><label>Phone<input name="phone" type="tel" minLength={6} required/></label>
<label>Access method<select name="accessMethod"><option value="owner">I will provide access</option><option value="agent">Authorised agent</option><option value="tenant">Tenant access</option><option value="lockbox">Key safe</option><option value="other">Other</option></select></label>
<label>Access instructions<textarea name="instructions" maxLength={3000}/></label>
<label><input type="checkbox" name="noticeConfirmed" value="yes"/>I have arranged any required tenant notice and lawful access</label>
<label><input type="checkbox" name="consent" value="yes" required/>I agree to processing of my details for this request. No marketing signup.</label>
<Turnstile siteKey={d.siteKey} action="guest_booking"/>{r?.message&&<p role="alert">{r.message}</p>}
<p>No appointment is reserved until you receive a booking confirmation. Quoted services must be priced first.</p>
<button className="button" disabled={!d.local&&!d.siteKey}>Verify email and continue</button></Form>}
<Link to="/book">Booking options</Link></section></div></div>}