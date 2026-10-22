import {Form,useActionData,useLoaderData,data,type LoaderFunctionArgs,type ActionFunctionArgs} from 'react-router';
import {loadApi,callApi} from '../lib/api.server';
import {PageHeading} from '../../../../packages/ui/components';
export async function loader({request,context,params}:LoaderFunctionArgs){
 const session=await loadApi(request,context,'/api/session');
 if(!(session.user?.staffRole==='administrator'||session.user?.staffRole==='operations_manager')) throw new Response('Not authorised',{status:403});
 return loadApi(request,context,'/api/staff/guest-orders');
}
export async function action({request,context}:ActionFunctionArgs){
 const f=await request.formData(),id=String(f.get('id')||''),task=String(f.get('task')||'');
 if(!/^[a-zA-Z0-9_-]+$/.test(id)||!['quote','review'].includes(task))return data({error:'Invalid action'},{status:422});
 const input=task==='quote'?{priceExGstCents:Math.round(Number(f.get('price'))*100),validDays:Number(f.get('validDays')||14)}:{approve:f.get('approve')==='yes'};
 const response=await callApi(request,context,'/api/staff/guest-orders/'+id+'/'+task,{method:'POST',body:input});
 const result=await response.json() as any;
 return data(response.ok?{ok:true}: {error:result.message||'Action unavailable'}, {status:response.status});
}
export default function GuestOrders(){
 const {orders}=useLoaderData<typeof loader>(),result=useActionData<any>();
 return <div className="stack"><PageHeading title="Guest booking requests" description="One-off purchasers have no portal membership or subscription. Approve property matching and issue quotations here."/>
 {result?.error&&<p role="alert">{result.error}</p>}{result?.ok&&<p role="status">Request updated. Reload to see current status.</p>}
 {orders.map((o:any)=><section className="panel stack" key={o.id}>
 <h2>{o.reference} · {o.status.replaceAll('_',' ')}</h2><p>{o.name} — {o.email}</p><p>{o.property} · {o.service_id}</p>
 {['quote_requested','quote_sent'].includes(o.status)&&<Form method="post" className="form"><input type="hidden" name="id" value={o.id}/><input type="hidden" name="task" value="quote"/>
 <label>Quote amount excluding GST (AUD)<input name="price" type="number" min="0" max="1000000" step="0.01" required/></label>
 <label>Validity days<input name="validDays" type="number" min="1" max="30" defaultValue="14" required/></label>
 <button className="button">Issue quote</button></Form>}
 {o.status==='review_required'&&<Form method="post" className="form"><input type="hidden" name="id" value={o.id}/><input type="hidden" name="task" value="review"/>
 <p>Review ownership and property record conflicts before authorising this booking. Do not give the guest portal access.</p>
 <label>Review outcome<select name="approve"><option value="no">Decline request</option><option value="yes">Verified — allow booking</option></select></label>
 <button className="button">Record review decision</button></Form>}
 </section>)}
 {!orders.length&&<p>No guest requests recorded.</p>}</div>;
}
