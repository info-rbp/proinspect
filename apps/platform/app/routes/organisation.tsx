import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Input, Select, Panel } from '../components/OperationForm';
export async function loader({ request, context }: LoaderFunctionArgs) {
  return (await loadApi(request, context, '/api/organisation-applications')) as any;
}
export default function Organisation() {
  const d = useLoaderData<typeof loader>();
  return (
    <main className="content">
      <PageHeading
        title="Set up your organisation"
        description="Choose the workspace for your business. ProInspect reviews your organisation and authority before enabling professional management access."
      />
      <div className="stack">
        <Panel title="Organisation details">
          <OperationForm
            endpoint="/api/organisation-applications"
            label="Request organisation setup"
          >
            <Input name="name" label="Organisation name" />
            <Select
              name="kind"
              label="Workspace"
              options={[
                { value: 'property-manager', label: 'Property management firm' },
                { value: 'strata-manager', label: 'Strata management firm' },
                { value: 'commercial', label: 'Commercial owner / asset manager' },
              ]}
            />
            <Input name="businessReference" label="Business / engagement reference" />
          </OperationForm>
        </Panel>
        <Panel title="Your setup requests">
          {d.applications.map((a: any) => (
            <div className="record-row" key={a.id}>
              <strong>{a.name}</strong>
              <Badge status={a.status} />
            </div>
          ))}
        </Panel>
        <Link className="button secondary" to="/workspaces">
          Return to workspaces
        </Link>
      </div>
    </main>
  );
}
