import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Input, Panel, Select, choices } from '../components/OperationForm';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  return (await loadApi(
    request,
    context,
    `/api/w/${params.kind}/${params.scopeId}/confidential/${params.caseId}`,
  )) as any;
}
export default function ConfidentialCase() {
  const c = useLoaderData<typeof loader>(),
    d = useWorkspace(),
    api = workspaceApi(d.workspace.kind, d.workspace.scopeId);
  return (
    <>
      <PageHeading
        title="Confidential case"
        description="Access to this page is recorded in the restricted case audit only."
      >
        <a className="button secondary" href="/workspaces">
          Leave this page
        </a>
      </PageHeading>
      <div className="stack">
        <Panel title="Case information">
          <Badge status={c.status} />
          <p className="preserve-lines">{c.details.details}</p>
          <p>Safe contact: {c.details.safeContact || 'Not specified'}</p>
        </Panel>
        <Panel title="Supporting evidence">
          {c.evidence.map((e: any) => (
            <p key={e.id}>
              <a href={`${api}/confidential-evidence/${e.id}/download`}>
                Download authorised evidence
              </a>{' '}
              | {e.created_at}
            </p>
          ))}
          {c.applicant && (
            <OperationForm
              endpoint={`${api}/confidential/${c.id}/evidence`}
              multipart
              label="Add encrypted evidence"
            >
              <Input name="file" label="PDF, JPEG or PNG (up to 2 MB)" type="file" />
            </OperationForm>
          )}
        </Panel>
        {c.status !== 'closed' && (!c.applicant || c.status === 'draft') && (
          <Panel title="Case progress">
            <OperationForm
              endpoint={`${api}/confidential/${c.id}`}
              defaults={{ version: c.version }}
              label="Update confidential case"
            >
              <Select
                name="status"
                label="Next step"
                options={choices(c.applicant ? ['submitted'] : ['under_review', 'closed'])}
              />
            </OperationForm>
          </Panel>
        )}
      </div>
    </>
  );
}
