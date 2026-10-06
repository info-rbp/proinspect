import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import {
  OperationForm,
  Input,
  TextArea,
  Panel,
  Select,
  options,
} from '../components/OperationForm';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  return (await loadApi(
    request,
    context,
    `/api/w/${params.kind}/${params.scopeId}/confidential`,
  )) as any;
}
export default function Confidential() {
  const c = useLoaderData<typeof loader>(),
    d = useWorkspace(),
    w = d.workspace,
    api = workspaceApi(w.kind, w.scopeId);
  return (
    <>
      <PageHeading
        title="Confidential assistance"
        description="Only you and an explicitly authorised reviewer can access a case. No ordinary landlord, manager, council or resident workspace receives its contents."
      >
        <a className="button secondary" href="/workspaces">
          Leave this page
        </a>
      </PageHeading>
      <div className="stack">
        <Panel title="Your authorised cases">
          {c.cases.map((r: any) => (
            <div className="record-row" key={r.id}>
              <Link to={`${w.href}/confidential/${r.id}`}>Open confidential case</Link>
              <Badge status={r.status} />
            </div>
          ))}
        </Panel>
        {w.kind === 'tenant' && (
          <Panel
            title="Request confidential assistance"
            description="This is secure intake and case review, not automatic issue or service of Form 2. Do not include sensitive details in ordinary maintenance requests."
          >
            <OperationForm
              endpoint={`${api}/confidential`}
              label="Create confidential draft"
              redirect={(r) => `${w.href}/confidential/${r.id}`}
            >
              <TextArea name="details" label="Details for your chosen reviewer" />
              <Input name="safeContact" label="Safe contact instructions" required={false} />
              <Select
                name="reviewerId"
                label="Authorise this reviewer to access this case"
                options={options(c.reviewers, 'display_name')}
              />
            </OperationForm>
          </Panel>
        )}
      </div>
    </>
  );
}
