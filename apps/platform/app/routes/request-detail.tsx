import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import {
  OperationForm,
  Input,
  TextArea,
  Panel,
  Select,
  choices,
} from '../components/OperationForm';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  return (await loadApi(
    request,
    context,
    `/api/w/${params.kind}/${params.scopeId}/requests/${params.requestId}`,
  )) as any;
}
export default function RequestDetail() {
  const data = useLoaderData<typeof loader>(),
    d = useWorkspace(),
    api = workspaceApi(d.workspace.kind, d.workspace.scopeId),
    r = data.request,
    staff = d.workspace.kind === 'staff',
    reviewer = staff && ['administrator', 'operations_manager'].includes(d.user.staffRole ?? '');
  return (
    <>
      <PageHeading
        title={r.title}
        eyebrow={r.reference}
        description="Follow the request, share evidence and track the operational response."
      />
      <div className="stack">
        <Panel title="Request">
          <Badge status={r.status} />
          <p className="preserve-lines">{r.details}</p>
          {r.scheme_id && ['staff', 'strata-manager'].includes(d.workspace.kind) && (
            <OperationForm
              endpoint={`${api}/requests/${r.id}/dispatch`}
              label="Request operational attendance"
            />
          )}
        </Panel>
        <Panel title="Updates">
          {data.comments.map((c: any) => (
            <div className="record-row" key={c.id}>
              <p className="preserve-lines">{c.body}</p>
              <Badge status={c.audience} />
            </div>
          ))}
          <OperationForm endpoint={`${api}/requests/${r.id}/comments`} label="Add update">
            <TextArea name="body" label="Update" />
            {staff && (
              <Select
                name="audience"
                label="Visible to"
                options={choices(['requester', 'staff'])}
              />
            )}
          </OperationForm>
        </Panel>
        <Panel
          title="Evidence and attachments"
          description="Uploads remain quarantined until an operational reviewer releases them. Manual review is not an automated virus scan."
        >
          {data.attachments.map((a: any) => (
            <div key={a.id} className="stack">
              <div className="record-row">
                <span>{a.file_name}</span>
                <Badge status={a.status} />
                {a.downloadAvailable && (
                  <a
                    className="button secondary small"
                    href={`${api}/attachments/${a.id}/download`}
                  >
                    Download file
                  </a>
                )}
              </div>
              {reviewer && a.status === 'quarantined' && (
                <OperationForm endpoint={`${api}/attachments/${a.id}/review`} label="Record review">
                  <Select
                    name="status"
                    label="Review outcome"
                    options={choices(['released', 'rejected'])}
                  />
                  <Input name="reference" label="Review reference" />
                </OperationForm>
              )}
            </div>
          ))}
          <OperationForm
            endpoint={`${api}/requests/${r.id}/attachments`}
            multipart
            label="Upload evidence"
          >
            <Input type="file" name="file" label="PDF, JPEG or PNG (up to 10 MB)" />
          </OperationForm>
        </Panel>
      </div>
    </>
  );
}
