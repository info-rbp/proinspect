import {useLoaderData,type LoaderFunctionArgs,Link} from 'react-router';
import {loadApi} from '../lib/api.server';
import {useWorkspace,workspaceApi} from '../lib/workspace';
export async function loader({request,context,params}:LoaderFunctionArgs){
 return loadApi(request,context,`${workspaceApi(params.kind!,params.scopeId!)}/outsourcing`);
}
export default function AgencyOutsourcing(){
 const d=useLoaderData<typeof loader>(),w=useWorkspace().workspace;
 const aud=(v:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(v/100);
 return <section className="stack"><h1>Outsourced ProInspect services</h1>
 <p>Inspection scheduling and service delivery for properties your agency is authorised to manage. Your agency retains management responsibility.</p>
 <div className="grid-2"><section className="panel"><h2>{d.properties.length} properties</h2><Link to={w.href+'/portfolio'}>Manage portfolio and recurring plans</Link></section>
 <section className="panel"><h2>{d.works.filter((x:any)=>!['completed','cancelled'].includes(x.status)).length} open Work Orders</h2><Link to={w.href+'/work-orders'}>View all Work Orders</Link></section></div>
 <section className="panel"><h2>Recurring inspections</h2>{d.plans.map((x:any)=><div className="record-row" key={x.id}>{x.address} · {x.service} · Due {x.next_due}</div>)}{!d.plans.length&&<p>No recurring inspections have been scheduled.</p>}</section>
 <section className="panel"><h2>Service delivery</h2>{d.works.map((x:any)=><div className="record-row" key={x.id}><Link to={w.href+'/work-orders/'+x.id}>{x.reference} · {x.title}</Link><span>{x.address} · {x.status}</span></div>)}{!d.works.length&&<p>No work is recorded for your assigned properties.</p>}</section>
 <section className="panel"><h2>Approved agency agreements</h2>{d.agreements.map((a:any)=><div className="record-row" key={a.reference}>{a.reference} · {a.pricing_model} · {aud(a.base_monthly_cents)} monthly base (ex GST)</div>)}{!d.agreements.length&&<p>No approved service agreements are recorded.</p>}</section>
 <section className="panel"><h2>Approved internal monthly statements</h2><p>These are not payment confirmations or issued Stripe invoices.</p>{d.statements.map((x:any)=><div className="record-row" key={x.period}>{x.period} · {aud(x.total_cents)} incl. GST</div>)}{!d.statements.length&&<p>No internally approved statements available.</p>}</section>
 </section>;
}