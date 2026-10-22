import {Form,useActionData,useLoaderData,Link,data,type LoaderFunctionArgs,type ActionFunctionArgs} from 'react-router';
import {platformEnv} from '../../../../packages/database/context';
import {handleApi} from '../../worker/api';
export async function loader({request,context}:LoaderFunctionArgs){
 const token=new URL(request.url).searchParams.get('token')||'';
 const response=await handleApi(new Request(new URL('/api/guest/quote?token='+encodeURIComponent(token),request.url)),platformEnv(context));
 const result=await response.json() as any;
 return data({token,quote:response.ok?result:null,error:response.ok?null:result.message},{status:response.status,headers:{'Cache-Control':'private, no-store'}});
}
export async function action({request,context}:ActionFunctionArgs){
 const f=await request.formData();
 const r=await handleApi(new Request(new URL('/api/guest/quote',request.url),{method:'POST',headers:{Origin:request.headers.get('Origin')||''},body:JSON.stringify({token:f.get('token'),priceExGstCents:Number(f.get('priceExGstCents')),accept:f.get('accept')==='yes'})}),platformEnv(context));
 return data(await r.json(),{status:r.status,headers:{'Cache-Control':'private, no-store'}});
}
export default function Quote(){
 const {token,quote,error}=useLoaderData<typeof loader>(),r=useActionData<any>();
 const money=(value:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(value/100);
 return <div className="section"><div className="site-container"><section className="panel form-width stack">
 <h1>Review your ProInspect quotation</h1>
 {r?.ok?<><p role="status">Quotation accepted. Check your email for the appointment link.</p>{r.localManageToken&&<Link to={'/guest/manage?token='+r.localManageToken}>Select appointment</Link>}</>:
 quote?<><p>{quote.reference} / {quote.serviceName}</p><h2>{money(quote.priceExGstCents+Math.round(quote.priceExGstCents/10))} including GST</h2>
 <p>{money(quote.priceExGstCents)} excluding GST plus {money(Math.round(quote.priceExGstCents/10))} GST.</p>
 <p>Valid until {new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Perth',dateStyle:'long',timeStyle:'short'}).format(new Date(quote.expiresAt))} (Perth).</p>
 <p>Acceptance does not charge your card or confirm an appointment. Choose an available time after acceptance. Payment arrangements are confirmed separately.</p>
 <Form method="post" className="stack"><input type="hidden" name="token" value={token}/><input type="hidden" name="priceExGstCents" value={quote.priceExGstCents}/>
 <label><input type="checkbox" name="accept" value="yes" required/>I accept the service and price shown above.</label>
 <button className="button">Accept this quotation</button></Form></>:<p role="alert">{error||'This quotation is not available.'}</p>}
 {r?.message&&<p role="alert">{r.message}</p>}<Link to="/contact">Contact ProInspect</Link>
 </section></div></div>;
}
