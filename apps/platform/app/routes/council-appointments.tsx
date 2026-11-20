import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Input, Select, Panel } from '../components/OperationForm';
export async function loader({request,context,params}:LoaderFunctionArgs) {
  return loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/council-appointments`);
}
export default function CouncilAppointments() {
  const d=useWorkspace(),w=d.workspace,api=workspaceApi(w.kind,w.scopeId);
  const data=useLoaderData<typeof loader>() as any;
  const reviewer=w.kind==='staff'&&['administrator','operations_manager'].includes(d.user.staffRole??'');
  return <>
    <PageHeading eyebrow="ONB-INV-COUNCIL v1.1.0" title={reviewer?'Council appointment verification':'Council invitation status'}
      description="Council access requires recorded appointment evidence, a valid term and an independent authorised review before the invited member receives an access link."/>
    <div className="stack">
      <Panel title={reviewer?'Independent verification queue':'Council appointment requests'}>
        {data.reviews.length?data.reviews.map((r:any)=>
          <div className="stack" key={r.id}>
            <div className="record-row">
              <div><strong>{r.scheme_name}</strong><p>{r.email}</p>
                <p className="small">Appointment authority: {r.appointment_reference}</p>
                <p className="small">Term: {r.starts_at} — {r.ends_at}</p>
                {r.review_reference&&<p className="small">Review evidence: {r.review_reference}</p>}
              </div><Badge status={r.status}/>
            </div>
            {reviewer&&r.status==='pending'&&<OperationForm
              endpoint={api+'/council-appointments/'+r.id+'/review'}
              label="Record independent decision">
              <Select name="decision" label="Review decision" options={[
                {value:'approved',label:'Verified and approved'},
                {value:'declined',label:'Decline — appointment not verified'},
              ]}/>
              <Input name="reviewReference" label="Independent verification evidence reference"
                help="Record the reviewed minutes, appointment evidence or other authoritative decision reference."/>
            </OperationForm>}
          </div>
        ):<p>No council appointment requests to display.</p>}
      </Panel>
      <p className="small">An appointment invitation is issued only following approval. Recording a reviewed council membership does not itself execute a statutory vote or make a council decision.</p>
      <Link to={w.href}>Return to workspace overview</Link>
    </div>
  </>;
}
