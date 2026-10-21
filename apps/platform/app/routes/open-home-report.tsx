import { Link,useLoaderData,type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { PageHeading,Badge } from '../../../../packages/ui/components';

export const meta=()=>[
 {title:'Inspection attendance report | ProInspect'},
 {name:'robots',content:'noindex,nofollow'},
];

export async function loader({request,context,params}:LoaderFunctionArgs){
 const sessionId=params.sessionId;
 if(!sessionId||!/^[a-zA-Z0-9_-]+$/.test(sessionId))
  throw new Response('Report unavailable',{status:404});
 const report=await loadApi(request,context,'/api/open-home/report/'+encodeURIComponent(sessionId));
 return report;
}

/** Authenticated recipient-only document; never use a bearer token or public file URL. */
export default function OpenHomeReport(){
 const report=useLoaderData<typeof loader>() as {
  sessionId:string;listingId:string;title:string;address:string;agentName:string;
  startsAt:string;endsAt:string;reportDatePerth:string;
  deliveryStatus:string;
  totals:{attended:number;preRegistered:number;walkIns:number;advancedRegistrations:number};
  visitors:{name:string;phone:string;email:string;arrivedAt:string;preRegistered:boolean}[];
 };
 const awst=(value:string)=>new Date(value).toLocaleString('en-AU',{
  timeZone:'Australia/Perth',weekday:'short',day:'numeric',month:'short',
  year:'numeric',hour:'numeric',minute:'2-digit',
 });
 return <main className="container stack" style={{maxWidth:1100,paddingBlock:28}}>
  <PageHeading title="Open home attendance report" eyebrow="ProInspect · Authorised leasing representative"
   description="Private inspection attendance record for the named property. Data is provided for inspection administration only, not marketing."/>
  <section className="panel stack">
   <h2>{report.address}</h2>
   <p className="small">{report.title} · Representative: {report.agentName}</p>
   <p><strong>Inspection:</strong> {awst(report.startsAt)} AWST – {awst(report.endsAt)} AWST</p>
   <div className="actions"><Badge status={report.deliveryStatus}/>
    <a className="button secondary" href={'/api/open-home/report/'+encodeURIComponent(report.sessionId)+'.csv'}>Download protected attendance CSV</a>
    <Link className="button secondary" to="/workspaces">Return to ProInspect</Link>
   </div>
  </section>
  <section className="panel stack">
   <h3>Attendance summary</h3>
   <div className="grid-2">
    <p><strong>{report.totals.attended}</strong> visitors checked in</p>
    <p><strong>{report.totals.preRegistered}</strong> pre-registered arrivals</p>
    <p><strong>{report.totals.walkIns}</strong> walk-in arrivals</p>
    <p><strong>{report.totals.advancedRegistrations}</strong> active advance registrations</p>
   </div>
  </section>
  <section className="panel stack">
   <h3>Attendance register</h3>
   {report.visitors.length===0?<p>No visitor check-ins were recorded for this inspection.</p>:
    <div className="table-wrap"><table>
     <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Arrival (AWST)</th><th>Type</th></tr></thead>
     <tbody>{report.visitors.map((v,i)=><tr key={i}>
      <td>{v.name}</td><td>{v.phone}</td><td>{v.email}</td>
      <td>{awst(v.arrivedAt)}</td>
      <td>{v.preRegistered?'Pre-registered':'Walk-in'}</td>
     </tr>)}</tbody>
    </table></div>}
   <p className="small">Access requires an active, verified ProInspect account authorised for this property. Do not use this information as a marketing list.</p>
  </section>
 </main>;
}
