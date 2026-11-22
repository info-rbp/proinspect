import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, EmptyState } from '../../../../packages/ui/components';
import { OperationForm, Select, TextArea } from '../components/OperationForm';
import { CO_LIVING_ONBOARDING_STAGES, CO_LIVING_ONBOARDING_GUIDE } from '../../../../packages/domain/co-living-onboarding';

export async function loader({request,context,params}:LoaderFunctionArgs){
  return await loadApi(request,context,
    '/api/w/'+params.kind+'/'+params.scopeId+'/co-living-onboardings');
}
const label=(stage:string)=>
  CO_LIVING_ONBOARDING_GUIDE[stage as keyof typeof CO_LIVING_ONBOARDING_GUIDE]?.label??stage;
export default function CoLivingOnboardings(){
  const d=useWorkspace(),result=useLoaderData<typeof loader>() as any;
  const staff=d.workspace.kind==='staff';
  const base=d.workspace.href;
  const residential=d.properties.filter(p=>p.sector==='residential');
  return <>
    <PageHeading eyebrow={staff?'ProInspect Operations':'Residential / Co-Living'}
      title={staff?'Co-Living establishments':'Co-Living property onboarding'}
      description={staff
        ?'Monitor owner enquiries, assessments, proposals, establishment work and property readiness.'
        :'Track the journey from your initial property enquiry to a fully prepared and operating Co-Living property.'}/>
    <div className="stack">
      <section className="panel stack">
        <h2>Your six-stage Co-Living journey</h2>
        <div className="grid-3">
          {CO_LIVING_ONBOARDING_STAGES.map((stage,i)=><article className="panel" key={stage}>
            <p className="eyebrow">{String(i+1).padStart(2,'0')} / 06</p>
            <h3>{label(stage)}</h3>
            <p className="small">{CO_LIVING_ONBOARDING_GUIDE[stage].summary}</p>
          </article>)}
        </div>
      </section>
      {!staff&&<section className="panel stack">
        <h2>Request a Co-Living assessment</h2>
        <p>Use an existing authorised residential property. Registering an enquiry does not start a subscription, approve conversion works or authorise room leasing.</p>
        {residential.length?
          <OperationForm endpoint={workspaceApi(d.workspace.kind,d.workspace.scopeId)+'/co-living-onboardings'}
            label="Submit Co-Living enquiry"
            defaults={{consent:true}}
            redirect={(v:any)=>base+'/co-living-onboardings/'+encodeURIComponent(v.id)}>
            <Select name="propertyId" label="Residential property"
              options={residential.map(p=>({value:p.id,label:p.address+', '+p.suburb}))}/>
            <TextArea name="objectives" label="What would you like to achieve with the property?"/>
            <p className="small">Submitting confirms that ProInspect may contact you about a site assessment. No property management authority is granted by this enquiry.</p>
          </OperationForm>:
          <p>First add and verify a residential property in your account. <Link to={base+'/properties'}>Manage properties</Link></p>}
      </section>}
      <section className="panel stack">
        <h2>{staff?'Establishment pipeline':'Your Co-Living properties'}</h2>
        {result.projects?.length?<div className="record-list">
          {result.projects.map((p:any)=><div className="record-row" key={p.id}>
            <div>
              <strong>{p.address}</strong>
              <p className="small">{p.suburb} · {staff?p.client_name+' · ':''}{label(p.stage)} · {p.status.replaceAll('_',' ')}</p>
              <p className="small">Last updated {new Date(p.updated_at).toLocaleDateString('en-AU')}</p>
            </div>
            <Link className="button secondary" to={base+'/co-living-onboardings/'+encodeURIComponent(p.id)}>
              {staff?'Open establishment':'View onboarding progress'}
            </Link>
          </div>)}
        </div>:<EmptyState title="No Co-Living onboarding projects"
            description={staff?'Owner enquiries will appear when recorded.':'Start an enquiry for one of your residential properties.'}/>}
      </section>
    </div>
  </>;
}
