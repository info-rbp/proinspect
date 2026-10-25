import {Form,useLoaderData,useActionData,data,type LoaderFunctionArgs,type ActionFunctionArgs,Link} from 'react-router';
import {platformEnv} from '../../../../packages/database/context';
import {handleApi} from '../../worker/api';
import {formatAUD} from '../../../../packages/v4/workflows';
export const meta=()=>[{title:'Review quotation | ProInspect'},{name:'robots',content:'noindex,nofollow'}];
export async function loader({request,context}:LoaderFunctionArgs){
 const token=new URL(request.url).searchParams.get('token')??'';
 const r=await handleApi(new Request(new URL('/api/v4/requests/quote?token='+encodeURIComponent(token),request.url)),platformEnv(context));
 return data({token,quote:r.ok?(await r.json() as any):null},{headers:{'Cache-Control':'private, no-store'}});
}
export async function action({request,context}:ActionFunctionArgs){
 const f=await request.formData();const r=await handleApi(new Request(new URL('/api/v4/requests/quote/accept',request.url),{
  method:'POST',headers:{Origin:request.headers.get('Origin')||''},body:JSON.stringify({token:f.get('token'),priceExGstCents:Number(f.get('priceCents')),accept:f.get('accept')==='yes'})}),platformEnv(context));
 return data(await r.json(),{status:r.status});
}
export default function V4Quote(){const {token,quote:q}=useLoaderData<typeof loader>(),r=useActionData<any>();
 return <div className="site section"><div className="site-container"><section className="panel form-width stack">
 <h1>Review your service quotation</h1>
 {r?.status==='approved'?<p role="status">Quotation accepted. Please check your email for the updated private status link.</p>:
 q?<><p>{q.reference} · {q.serviceCode}</p><h2>{formatAUD(q.priceExGstCents+q.gstCents)} including GST</h2>
 <p>{formatAUD(q.priceExGstCents)} ex GST + {formatAUD(q.gstCents)} GST</p>
 <p>Valid until {new Intl.DateTimeFormat('en-AU',{dateStyle:'long',timeStyle:'short',timeZone:'Australia/Perth'}).format(new Date(q.expiresAt))} (Perth).</p>
 <p>{q.message}</p><Form method="post" className="form"><input type="hidden" name="token" value={token}/>
 <input type="hidden" name="priceCents" value={q.priceExGstCents}/>
 <label><input name="accept" type="checkbox" value="yes" required/>I accept the exact service scope and price in this quotation.</label>
 <button className="button">Accept quotation</button></Form></>:<p role="alert">This quotation is unavailable, has changed or has expired.</p>}
 {r?.message&&r.status!=='approved'&&<p role="alert">{r.message}</p>}
 <Link to="/contact">Contact ProInspect</Link>
 </section></div></div>;
}
