import { Link, useLoaderData, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { getOnboardingFlow } from '../../../../packages/onboarding/registry';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Input, Panel } from '../components/OperationForm';

type ProfessionalTag = 'ONB-RES-AGENCY' | 'ONB-COM-MANAGER' | 'ONB-STR-MANAGER';
const categories: Record<ProfessionalTag, { kind: string; label: string }> = {
  'ONB-RES-AGENCY': { kind: 'property-manager', label: 'Residential management' },
  'ONB-COM-MANAGER': { kind: 'commercial', label: 'Commercial management' },
  'ONB-STR-MANAGER': { kind: 'strata-manager', label: 'Strata management' },
};
function professionalTag(value: unknown): ProfessionalTag {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(categories, value)
    ? value as ProfessionalTag : 'ONB-RES-AGENCY';
}
export async function loader({ request, context }: LoaderFunctionArgs) {
  const d = await loadApi(request, context, '/api/organisation-applications') as any;
  const flowId = professionalTag(new URL(request.url).searchParams.get('flow'));
  return { ...d, flowId, flow: getOnboardingFlow(flowId) };
}
export default function Organisation() {
  const d = useLoaderData<typeof loader>();
  const [search] = useSearchParams();
  const selected = professionalTag(search.get('flow') ?? d.flowId);
  const flow = getOnboardingFlow(selected)!;
  return (
    <main className="content">
      <PageHeading title="Set up your organisation"
        description="Start with your organisation name and business or engagement reference. ProInspect reviews your authority before providing professional portfolio access."/>
      <div className="stack">
        <nav className="actions" aria-label="Professional organisation type">
          {(Object.entries(categories) as [ProfessionalTag,{kind:string;label:string}][]).map(([id,cat])=>
            <Link key={id} className={id === selected ? 'button' : 'button secondary'} to={'/organisation?flow='+id}>{cat.label}</Link>
          )}
        </nav>
        <Panel title={flow.title} description={flow.summary}>
          <p className="small">Onboarding: {flow.id} v{flow.version}. This creates a reviewed application, not immediate authority to manage third-party properties.</p>
          <OperationForm endpoint="/api/organisation-applications" label="Submit for approval"
            defaults={{kind:categories[selected].kind}}>
            <Input name="name" label="Organisation or legal business name"/>
            <Input name="businessReference" label="Business / engagement reference"
              help="Use a business registration or engagement reference. ProInspect can request supporting authority documents during review."/>
          </OperationForm>
          <p className="small">ABN, appointments, management evidence and scheme or property assignments can be requested in a later verification step. Approval remains a separate staff decision.</p>
        </Panel>
        <Panel title="Your setup requests">
          {d.applications.length ? d.applications.map((a:any)=>
            <div className="record-row" key={a.id}>
              <div><strong>{a.name}</strong><p className="small">{a.workspace_kind}</p></div>
              <Badge status={a.status}/>
            </div>
          ) : <p>No professional applications submitted yet.</p>}
        </Panel>
        <Link className="button secondary" to="/workspaces">Return to My ProInspect</Link>
      </div>
    </main>
  );
}
