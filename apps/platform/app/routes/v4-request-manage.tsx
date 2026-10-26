import {Form,Link,useLoaderData,useActionData,data,type LoaderFunctionArgs,type ActionFunctionArgs} from 'react-router';
import {callApi} from '../lib/api.server';
export const meta=()=>[{title:'Service request status | ProInspect'},{name:'robots',content:'noindex,nofollow'}];
export async function loader({request,context}:LoaderFunctionArgs){
 const token=new URL(request.url).searchParams.get('token')??'';
 const res=await callApi(request,context,'/api/v4/requests/status?token='+encodeURIComponent(token));
 return data({token,status:res.ok?(await res.json() as any):null},{headers:{'Cache-Control':'private, no-store'}});
}
export async function action({request,context}:ActionFunctionArgs){
 const f=await request.formData();const res=await callApi(request,context,'/api/v4/requests/cancel',{method:'POST',body:{token:f.get('token'),version:Number(f.get('version'))}});
 return data(await res.json(),{status:res.status});
}
export default function V4Manage(){const {token,status:s}=useLoaderData<typeof loader>(),r=useActionData<any>();
 return <div className="site section"><div className="site-container"><section className="panel form-width stack">
 <h1>Manage service request</h1>{!s?<p role="alert">Private link unavailable or expired.</p>:<>
 <p><strong>{s.reference}</strong> · {s.serviceCode}</p><p>Current status: <strong>{s.status.replaceAll('_',' ')}</strong></p>
 {s.note&&<p>Staff update: {s.note}</p>}
 {s.status==='quoted'&&<p>A quotation has been issued. Open the separate quotation email to review and accept the exact amount.</p>}
 {s.documentReady&&<p>Your document has been recorded as issued. Delivery and recipient access remain subject to Staff verification.</p>}
 {['submitted','under_review','awaiting_information','quoted'].includes(s.status)&&<Form method="post">
 <input type="hidden" name="token" value={token}/><input type="hidden" name="version" value={s.version}/>
 <button className="button secondary">Withdraw request</button></Form>}
 {r?.message&&<p role="alert">{r.message}</p>}{r?.status&&<p role="status">Updated: {r.status}</p>}</>}
 <Link to="/guest/services">Other services</Link>
 </section></div></div>;
}
