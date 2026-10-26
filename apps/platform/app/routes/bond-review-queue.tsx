import { Link,useLoaderData,type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { PageHeading,Badge } from '../../../../packages/ui/components';
import { Panel } from '../components/OperationForm';
export const meta=()=>[{title:'Bond operations review | ProInspect'}];
export async function loader({request,context,params}:LoaderFunctionArgs){
 return await loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/bond-review-queue`);
}
export default function BondReviewQueue(){
 const d=useLoaderData<typeof loader>() as any,w=useWorkspace().workspace;
 return <div className="stack">
  <PageHeading title="Residential bond review queue" description="Staff operations view for current bond cases, lodgement deadlines, independently verified government outcomes and exceptions. This queue excludes confidential Form 2 cases." />
  <Panel title="Outstanding bond register checks">
   {!d.rows.length&&<p>No residential bonds currently recorded.</p>}
   {d.rows.map((b:any)=><div className="record-row" key={b.id}><div>
    <strong>{b.address}, {b.suburb} {b.postcode}</strong>
    <p><Badge status={b.status}/> {b.bond_reference?` · Government bond ${b.bond_reference}`:' · No verified government number'}</p>
    <p>{b.submitted_count} submitted transactions · {b.open_exceptions} unresolved exceptions</p>
    <p className="small">{b.next_deadline?`Next recorded deadline: ${new Date(b.next_deadline).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}`:'No open recorded deadline'}</p>
   </div><Link className="button secondary" to={`${w.href}/tenancies/${b.tenancy_id}/bonds`}>Review bond</Link></div>)}
  </Panel>
  <Panel title="External financial boundary"><p>ProInspect tracks official forms, submissions, claims and reconciliation evidence. Recording a release decision does not transfer bond funds. Form 2 details are handled only in the confidential workspace by expressly authorised reviewers.</p></Panel>
 </div>;
}
