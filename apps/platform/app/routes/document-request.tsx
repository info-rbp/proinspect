import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import {
  OperationForm,
  TextArea,
  Panel,
  Select,
  choices,
  options,
} from '../components/OperationForm';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  return (await loadApi(
    request,
    context,
    `/api/w/${params.kind}/${params.scopeId}/document-requests/${params.documentRequestId}`,
  )) as any;
}
export default function DocumentRequest() {
  const r = useLoaderData<typeof loader>(),
    d = useWorkspace(),
    api = workspaceApi(d.workspace.kind, d.workspace.scopeId),
    staff = d.workspace.kind === 'staff',
    next: Record<string, string[]> = {
      submitted: ['under_review', 'cancelled'],
      under_review: ['awaiting_information', 'in_preparation', 'cancelled'],
      awaiting_information: ['under_review', 'cancelled'],
      in_preparation: ['review', 'awaiting_information', 'cancelled'],
      review: ['ready', 'in_preparation', 'cancelled'],
      ready: ['completed', 'review'],
    };
  return (
    <>
      <PageHeading
        title={r.title}
        description="Preparation, review and delivery remain linked to the requesting property and client."
      />
      <div className="stack">
        <Panel title="Instructions">
          <Badge status={r.status} />
          <p className="preserve-lines">{r.answers.purpose}</p>
          <p className="preserve-lines">{r.answers.instructions}</p>
        </Panel>
        {staff && next[r.status] && (
          <Panel title="Preparation progress">
            <OperationForm
              endpoint={`${api}/document-requests/${r.id}`}
              defaults={{ version: r.version }}
              label="Record next step"
            >
              <Select name="status" label="Next step" options={choices(next[r.status])} />
              <Select
                name="documentId"
                label="Issued document for completion"
                optional
                options={options(
                  d.documents.filter(
                    (doc) => doc.status === 'issued' && doc.property_id === r.property_id,
                  ),
                  'title',
                )}
              />
            </OperationForm>
          </Panel>
        )}
        {!staff && r.status === 'awaiting_information' && (
          <Panel title="Provide further information">
            <OperationForm
              endpoint={`${api}/document-requests/${r.id}/information`}
              defaults={{ version: r.version }}
              label="Submit information"
            >
              <TextArea name="instructions" label="Additional information" />
            </OperationForm>
          </Panel>
        )}
      </div>
    </>
  );
}
