import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';

export async function loader({request,context}:LoaderFunctionArgs){
 return await loadApi(request,context,'/api/staff/rental-applications') as any;
}
export default function RentalApplicationsQueue(){
 const d=useLoaderData<typeof loader>(),w=useWorkspace().workspace;
 return <><PageHeading title="Residential rental applications" eyebrow="Restricted leasing records"
 description="ProInspect Residential Rental Applications collected on behalf of the named landlord or agency. ProInspect administers the information; the responsible representative makes tenancy decisions."/>
 <div className="actions"><Link className="button secondary" to={w.href+'/leasing'}>Manage property application settings</Link></div>
 <section className="panel stack">
 <h2>Submitted applications</h2>
 {d.applications.length===0?<p>No residential applications have been submitted. Draft applications remain private to their applicants.</p>:
 <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Property</th><th>Applicants</th><th>State</th><th>Submitted</th></tr></thead>
 <tbody>{d.applications.map((x:any)=><tr key={x.id}>
  <td><Link to={w.href+'/rental-applications/'+x.id}>{x.reference}</Link></td>
  <td><strong>{x.display_address}</strong><br/><small>{x.instructing_client} · {x.agent_name}</small></td>
  <td>{x.applicant_count}</td><td><Badge status={x.status}/></td>
  <td>{x.submitted_at?new Date(x.submitted_at).toLocaleDateString('en-AU'):'—'}</td>
 </tr>)}</tbody></table></div>}
 </section></>;
}
