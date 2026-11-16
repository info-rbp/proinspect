import { useLoaderData, Link, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Input, Select, Panel } from '../components/OperationForm';
import { getOnboardingFlow } from '../../../../packages/onboarding/registry';
export async function loader({request,context,params}:LoaderFunctionArgs) {
  return loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/commercial-occupancies`);
}
export default function CommercialOccupancies() {
  const d=useWorkspace(), w=d.workspace, data=useLoaderData<typeof loader>() as any;
  const api=workspaceApi(w.kind,w.scopeId);
  const flow=getOnboardingFlow('ONB-INV-COM')!;
  return <>
    <PageHeading eyebrow={flow.id+' v'+flow.version} title="Commercial occupants & invitations"
      description="Invite people only to commercial property you are authorised to manage. Occupants receive a limited Resident & Member workspace, never owner, tenancy or lease management permissions."/>
    <div className="stack">
      <Panel title="Invite an occupant" description="The recipient verifies the invited email. The relationship is tied to a specific premises and expires with its authority.">
        <OperationForm endpoint={api+'/commercial-occupancies/invite'} label="Send premises invitation"
          result={r=><p>Invitation queued for the selected premises.</p>}>
          <Select name="propertyId" label="Commercial property" options={d.properties.filter(p=>p.sector==='commercial').map(p=>({value:p.id,label:p.address}))}/>
          <Input name="premisesLabel" label="Unit, suite or premises" help="Example: Suite 3, ground-floor shop or warehouse office"/>
          <Select name="relationshipKind" label="Relationship" options={[
            {value:'tenant_contact',label:'Commercial tenant contact'},
            {value:'employee',label:'Employee or on-site team member'},
            {value:'contractor',label:'Authorised contractor'},
            {value:'other_occupant',label:'Other authorised occupant'},
          ]}/>
          <Input name="email" type="email" label="Invited person's email"/>
          <Input name="authorityReference" label="Occupancy or access authority reference"
            help="Reference the lease, engagement or written authorisation supporting this person's access."/>
          <Input name="endsAt" type="datetime-local" label="Access expires (optional)" required={false}/>
        </OperationForm>
      </Panel>
      <Panel title="Invitations and commercial premises access">
        {(data.occupants??[]).length ? data.occupants.map((o:any)=>
          <div className="record-row" key={o.id}>
            <div><strong>{o.address} — {o.premises_label}</strong>
              <p>{o.relationship_kind.replaceAll('_',' ')} · {o.invited_email}</p>
              <p className="small">{o.status==='ended'?'Ended':o.consumed_at?'Invitation accepted':o.revoked_at?'Invitation revoked':o.expires_at && o.expires_at<new Date().toISOString()?'Invitation expired':'Invitation pending'}</p>
            </div>
            {o.status==='active' && <OperationForm endpoint={api+'/commercial-occupancies/'+o.id+'/end'}
              label="End access" result={()=><p>Access ended.</p>}/>}
          </div>) : <p>No commercial occupants have been invited yet.</p>}
      </Panel>
      <Panel title="Occupant requests">
        {(data.requests??[]).length ? data.requests.map((r:any)=>
          <div className="record-row" key={r.id}>
            <div><strong>{r.title}</strong><p>{r.address} / {r.premises_label}</p>
              {r.manager_response&&<p>Last response: {r.manager_response}</p>}
              {r.status!=='closed'&&<OperationForm endpoint={api+'/commercial-occupant-requests/'+r.id+'/review'}
                label="Record review">
                <Select name="status" label="Request status" options={[
                  {value:'under_review',label:'Under review'},{value:'closed',label:'Closed'},
                ]}/>
                <Input name="managerResponse" label="Response to occupant"/>
              </OperationForm>}
            </div><Badge status={r.status}/>
          </div>) : <p>No requests from commercial occupants.</p>}
      </Panel>
      <Link to={w.href}>Return to Commercial overview</Link>
    </div>
  </>;
}
