import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import {
  OperationForm,
  Input,
  TextArea,
  Select,
  choices,
  Panel,
} from '../components/OperationForm';
export async function loader({ request, context }: LoaderFunctionArgs) {
  return (await loadApi(request, context, '/api/my-approvals')) as any;
}
export default function OwnerDecisions() {
  const d = useLoaderData<typeof loader>();
  return (
    <main className="content">
      <PageHeading
        title="Your owner decisions"
        description="These proposals were specifically assigned to your verified ownership relationship. This does not grant tenancy-management access."
      />
      <div className="stack">
        {d.approvals.map((a: any) => (
          <Panel
            key={a.id}
            title={a.title}
            description={`${a.summary} | AUD ${(a.amount_cents / 100).toFixed(2)}`}
          >
            <Badge status={a.status} />
            {a.status === 'pending' && (
              <OperationForm
                endpoint={`/api/my-approvals/${a.id}`}
                defaults={{ version: a.version }}
                label="Record my decision"
              >
                <Select
                  name="decision"
                  label="Decision"
                  options={choices(['approved', 'declined', 'changes_requested'])}
                />
                <TextArea name="comment" label="Comment" required={false} />
                <Input name="reference" label="Decision reference" required={false} />
              </OperationForm>
            )}
          </Panel>
        ))}
        <Link to="/workspaces">Return to workspaces</Link>
      </div>
    </main>
  );
}
