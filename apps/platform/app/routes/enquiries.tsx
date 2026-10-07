import {Form,Link,useLoaderData,type LoaderFunctionArgs} from 'react-router';
import {loadApi} from '../lib/api.server';
import {useWorkspace} from '../lib/workspace';
import {PageHeading,Badge,Field} from '../../../../packages/ui/components';
import {ENQUIRY_STATES} from '../../../../packages/marketing/enquiry';
export async function loader({request,context,params}:LoaderFunctionArgs) {
 return await loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/enquiries${new URL(request.url).search}`) as any;
}
export default function Enquiries() {
 const d=useLoaderData<typeof loader>(),w=useWorkspace().workspace;
 const next=new URLSearchParams({status:d.status,q:d.q,after:d.next||''});
 return <><PageHeading title="Marketing enquiries" description="Review requests from the public website, agree the next step and connect an existing client only after verification."/>
 <section className="panel stack">
 <div className="actions">{d.counts.map((c:any)=><span key={c.status}><Badge status={c.status}/> {c.count}</span>)}</div>
 <Form method="get" className="grid-2"><Field label="Status" name="status"><select name="status" defaultValue={d.status}><option value="">All statuses</option>{ENQUIRY_STATES.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></Field><Field label="Enquiry reference" name="q"><input name="q" defaultValue={d.q} placeholder="ENQ-..." maxLength={60}/></Field><button className="button secondary">Apply filters</button></Form>
 {d.items.length?d.items.map((e:any)=><article className="record-row" key={e.id}><div><Link to={`${w.href}/enquiries/${e.id}`}><strong>{e.reference}</strong></Link><p>{e.name}{e.organisation?` / ${e.organisation}`:''}</p><p>{e.kind} | {e.assigned_name||'Unassigned'}</p></div><Badge status={e.status}/></article>):<p>No enquiries match these filters.</p>}
 <div className="actions">{d.next&&<Link className="button secondary" to={`?${next}`}>Next 25 enquiries</Link>}<Link to={`${w.href}/enquiries`}>Back to newest</Link></div>
 </section></>;
}
