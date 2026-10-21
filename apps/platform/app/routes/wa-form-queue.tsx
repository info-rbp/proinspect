import { Link,useLoaderData,type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { PageHeading,Badge } from '../../../../packages/ui/components';
import { Panel } from '../components/OperationForm';
type QueueRow={
 id:string;tenancy_id:string;form_code:string;form_stage:string;
 status:string;created_at:string;due_at:string|null;address:string;suburb:string;
};
export const meta=()=>[{title:'Residential form review queue | ProInspect'}];
export async function loader({request,context,params}:LoaderFunctionArgs){
 return await loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/wa-form-queue`) as {forms:QueueRow[]};
}
export default function WaFormReviewQueue(){
 const d=useLoaderData<typeof loader>(),w=useWorkspace().workspace;
 return <div className="stack">
  <PageHeading title="WA residential statutory form review"
   description="Staff-only review queue across residential tenancies. Confidential Form 2 cases are never included."/>
  <div className="actions">
   <Link to={`${w.href}/wa-form-templates`}>Official form library and versions →</Link>
  </div>
  <Panel title="Outstanding form cases">
   {!d.forms.length&&<p>No active residential forms require review.</p>}
   {d.forms.map(c=><div className="record-row" key={c.id}>
    <div><strong>{c.form_code}</strong><p>{c.address}, {c.suburb}</p>
     <Badge status={c.status}/>
     <p className="small">Opened {c.created_at}{c.due_at?` · Advisory deadline ${new Date(c.due_at).toLocaleDateString('en-AU')}`:''}</p>
    </div>
    <Link to={`${w.href}/tenancies/${c.tenancy_id}/wa-forms/${c.id}`}>Review form →</Link>
   </div>)}
  </Panel>
 </div>;
}
