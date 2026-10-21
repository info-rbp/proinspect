import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Panel } from '../components/OperationForm';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const info = await loadApi(request, context,
    `/api/w/${params.kind}/${params.scopeId}/integrations`,
  );
  const calendar = params.kind === 'staff'
    ? await loadApi(request, context, '/api/staff/calendar-sync')
    : null;
  return { ...info, calendar } as any;
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
        {i.calendar && (
          <Panel
            title="ProInspect Google Calendar"
            description="Bookings remain authoritative in ProInspect. Google availability is checked when enabled and external event failures are surfaced here."
          >
            <p className="small">
              Scheduling integration: <strong>{i.calendar.enabled ? 'Enabled' : 'Not enabled (release gate closed)'}</strong>
            </p>
            {i.calendar.counts?.map((c: any) => (
              <p key={c.status}>{c.status}: {c.count}</p>
            ))}
            {i.calendar.alerts?.length ? i.calendar.alerts.map((a: any) => (
              <div className="record-row" key={a.booking_id}>
                <div>
                  <strong>Calendar sync needs review</strong>
                  <p>Booking {a.booking_id} | {a.error_code}</p>
                </div>
                <OperationForm
                  endpoint={`/api/staff/calendar-sync/${a.booking_id}/retry`}
                  label="Retry after review"
                />
              </div>
            )) : <p className="small">No calendar synchronisation alerts.</p>}
          </Panel>
        )}
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
