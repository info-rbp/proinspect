import { type LoaderFunctionArgs, useLoaderData, Link } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Input, TextArea, Panel } from '../components/OperationForm';
export async function loader({request,context,params}:LoaderFunctionArgs) {
  return loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/occupant-requests`);
}
export default function OccupantRequests() {
  const d=useWorkspace(),data=useLoaderData<typeof loader>() as any;
  if(d.workspace.kind!=='commercial-occupant')return null;
  const api=workspaceApi(d.workspace.kind,d.workspace.scopeId);
  return <>
    <PageHeading eyebrow="Resident & Member · Commercial" title="My premises requests"
      description="Contact your authorised commercial property manager about a premises issue. This is not an emergency response service."/>
    <div className="stack">
      <Panel title="Submit an issue">
        <OperationForm endpoint={api+'/occupant-requests'} label="Submit premises request"
          result={()=><p>Your request has been recorded for the relevant property manager.</p>}>
          <Input name="title" label="Summary"/>
          <TextArea name="details" label="Describe the issue"/>
        </OperationForm>
      </Panel>
      <Panel title="My previous requests">
        {(data.requests??[]).length?data.requests.map((r:any)=>
          <div key={r.id} className="record-row">
            <div><strong>{r.title}</strong><p className="small">{r.created_at}</p>
              {r.manager_response&&<p>Manager response: {r.manager_response}</p>}
            </div><Badge status={r.status}/>
          </div>):<p>No requests submitted.</p>}
      </Panel>
      <Link to={d.workspace.href}>Back to Resident overview</Link>
    </div>
  </>;
}
