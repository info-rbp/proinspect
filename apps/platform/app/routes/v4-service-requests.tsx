import {Form,Link,useLoaderData,useActionData,data,type LoaderFunctionArgs,type ActionFunctionArgs} from 'react-router';
import {loadApi,callApi} from '../lib/api.server';
import {PageHeading} from '../../../../packages/ui/components';
export async function loader({request,context}:LoaderFunctionArgs){
 const sess=await loadApi(request,context,'/api/session');
 if(!['administrator','operations_manager'].includes(sess.user?.staffRole??''))throw new Response('Staff access required',{status:403});
 const id=new URL(request.url).searchParams.get('id');
 return id?{detail:await loadApi(request,context,'/api/v4/staff/requests/'+encodeURIComponent(id)),requests:null}:
  {requests:await loadApi(request,context,'/api/v4/staff/requests'),detail:null};
}
export async function action({request,context}:ActionFunctionArgs){
 const f=await request.formData(),id=String(f.get('id')??'');
 if(!/^v4r_[0-9a-f]{32}$/.test(id))return data({message:'Select a valid request.'},{status:422});
 const result=await callApi(request,context,'/api/v4/staff/requests/'+id,{method:'POST',body:{
  action:String(f.get('task')??''),version:Number(f.get('version')),note:String(f.get('note')??''),
  priceExGstCents:f.get('price')?Math.round(Number(f.get('price'))*100):undefined,validDays:Number(f.get('validDays')??14),
  documentId:String(f.get('documentId')??'')||undefined,
 }});
 return data(await result.json(),{status:result.status});
}
export default function V4StaffRequests(){const d=useLoaderData<typeof loader>(),r=useActionData<any>();
 return <div className="stack"><PageHeading title="Version 4 service requests" description="Review verified guest requests, scope, authority and accepted commercial terms. No automatic statutory issue or payment."/>
 {r?.message&&<p role="alert">{r.message}</p>}{r?.ok&&<p role="status">Request updated. Reload for current status.</p>}
 {d.requests?<>{(d.requests.requests??[]).map((x:any)=><section className="panel stack" key={x.id}><h2>{x.reference} — {x.service_code}</h2>
 <p>{x.sector} · {x.status} · Quantity {x.quantity}</p><Link to={'?id='+encodeURIComponent(x.id)}>Review request</Link></section>)}</>:
 d.detail?<><Link to="?">Back to request queue</Link><section className="panel stack"><h2>{d.detail.request.reference}</h2>
 <p>{d.detail.request.serviceCode} · {d.detail.request.status}</p>
 <p>Customer: {d.detail.intake.name} · {d.detail.intake.email} · {d.detail.intake.phone}</p>
 <p>Property: {d.detail.intake.street}, {d.detail.intake.suburb} {d.detail.intake.postcode}</p>
 <h3>Scope and service answers</h3><dl>{Object.entries(d.detail.intake.answers as Record<string,string>).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>
 <h3>Source rate and commercial gate</h3><p>{d.detail.request.priceSnapshot?.sourceFee} · Not invoiced/paid</p>
 <Form className="form" method="post"><input name="id" type="hidden" value={d.detail.request.id}/>
 <input name="version" type="hidden" value={d.detail.request.version}/>
 <label>Action<select name="task" required>{['review','request_information','quote','approve','start','review_output','complete','decline'].map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></label>
 <label>Approved quote price ex GST (if quoting)<input name="price" type="number" min="0" step="0.01"/></label>
 <label>Quote validity days<input name="validDays" type="number" min="1" max="30" defaultValue="14"/></label>
 <label>Staff review, accepted terms, information required or completion evidence<textarea name="note" maxLength={1000}/></label>
 <label>Issued document ID (optional; verified by backend)<input name="documentId"/></label>
 <button className="button">Record guarded decision</button></Form></section></>:null}</div>;
}
