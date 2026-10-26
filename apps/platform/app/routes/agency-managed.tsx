import {Link,useLoaderData,type LoaderFunctionArgs} from 'react-router';
import {loadApi} from '../lib/api.server';
export async function loader({request,context}:LoaderFunctionArgs){return loadApi(request,context,'/api/my-agency-managed-properties');}
export const meta=()=>[{title:'Agency-managed properties | ProInspect'}];
export default function AgencyManaged(){
 const d=useLoaderData<typeof loader>();
 return <main className="auth-page"><section className="content stack"><Link to="/workspaces">Back to workspaces</Link>
 <h1>Agency-managed properties</h1><p>Read-only visibility approved by ProInspect and your managing agency. Your agency retains all management decisions.</p>
 {!d.properties.length&&<section className="panel"><h2>No shared properties</h2><p>Your managing agency can request verified owner access. Email sign-in does not automatically grant property access.</p></section>}
 {d.properties.map((p:any)=><section className="panel stack" key={p.propertyId}>
 <h2>{p.address}, {p.suburb} {p.postcode}</h2><p>Managing agency: {p.agencyName}</p>
 <h3>Inspections</h3>{!p.inspections.length&&<p>No inspection details are available.</p>}
 {p.inspections.map((b:any)=><div className="record-row" key={b.reference}><span>{b.service} · {b.reference}</span><span>{new Date(b.starts_at).toLocaleDateString('en-AU')} · {b.status}</span></div>)}
 <h3>Reports explicitly shared with you</h3>{!p.reports.length&&<p>No final reports have been shared.</p>}
 {p.reports.map((r:any)=><div className="record-row" key={r.id}><span>{r.title}</span><a className="button secondary" href={`/api/my-agency-managed-properties/reports/${r.id}/download`}>Download issued PDF</a></div>)}
 </section>)}</section></main>;
}