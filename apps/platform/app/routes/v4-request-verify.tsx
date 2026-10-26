import {Form,useSearchParams,useActionData,Link,data,type ActionFunctionArgs} from 'react-router';
import {callApi} from '../lib/api.server';
export const meta=()=>[{title:'Verify service request | ProInspect'},{name:'robots',content:'noindex,nofollow'}];
export async function action({request,context}:ActionFunctionArgs){
 const f=await request.formData();const r=await callApi(request,context,'/api/v4/requests/verify',{method:'POST',body:{token:f.get('token')}});
 return data(await r.json(),{status:r.status});
}
export default function V4Verify(){const [params]=useSearchParams(),r=useActionData<any>();
 return <div className="site section"><div className="site-container"><section className="panel form-width stack">
 <h1>Verify your ProInspect service request</h1>
 <p>Verification confirms your email, not an appointment, payment or document issue.</p>
 {r?.message&&<p role={r.status==='submitted'?'status':'alert'}>{r.message}</p>}
 {r?.localManageToken&&<Link className="button" to={'/guest/request/manage?token='+r.localManageToken}>View request status</Link>}
 {!r?.status&&<Form method="post"><input type="hidden" name="token" value={params.get('token')??''}/>
 <button className="button">Verify email</button></Form>}
 </section></div></div>;
}
