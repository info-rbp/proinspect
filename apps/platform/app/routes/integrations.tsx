import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Panel } from '../components/OperationForm';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  return (await loadApi(
    request,
    context,
    `/api/w/${params.kind}/${params.scopeId}/integrations`,
  )) as any;
}
export default function Integrations() {
  const i = useLoaderData<typeof loader>(),
    d = useWorkspace(),
    api = workspaceApi(d.workspace.kind, d.workspace.scopeId);
  return (
    <>
      <PageHeading
        title="Integrations and delivery"
        description="The platform remains the system of record. External delivery failures do not undo accepted bookings or issued reports."
      />
      <div className="stack">
        <Panel title="Configuration">
          {Object.entries(i.configured).map(([name, configured]) => (
            <p key={name}>
              {name}:{' '}
              {configured ? 'Configured - external acceptance still required' : 'Not configured'}
            </p>
          ))}
        </Panel>
        <Panel
          title="Report Tool authoring"
          description="Launch creates a signed, expiring handoff for this work order. Manual report upload remains available."
        >
          {d.workOrders
            .filter((o) => !['completed', 'cancelled'].includes(o.status))
            .map((o) => (
              <details key={o.id}>
                <summary>{o.title}</summary>
                <OperationForm
                  endpoint={`${api}/work-orders/${o.id}/report-handoff`}
                  label="Create report-authoring handoff"
                  result={(r) => (
                    <a className="button secondary" href={r.url} target="_blank" rel="noreferrer">
                      Open Report Tool
                    </a>
                  )}
                />
              </details>
            ))}
        </Panel>
        <Panel title="Operational projections">
          {i.deliveries.map((e: any) => (
            <div className="record-row" key={e.id}>
              <div>
                <strong>{e.kind}</strong>
                <p>
                  {e.entity_id} | Attempts {e.attempts}
                </p>
              </div>
              <Badge status={e.status} />
              {e.status === 'failed' && (
                <OperationForm endpoint={`${api}/integrations/${e.id}/retry`} label="Queue retry" />
              )}
            </div>
          ))}
        </Panel>
        <Panel title="Email outbox">
          {i.mail.map((e: any) => (
            <div className="record-row" key={e.id}>
              <div>
                {e.kind}
                <p>{e.error_code}</p>
              </div>
              <Badge status={e.status} />
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}
