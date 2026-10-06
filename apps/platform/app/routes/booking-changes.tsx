import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Input, Panel, Select, choices } from '../components/OperationForm';
export default function BookingChanges() {
  const d = useWorkspace(),
    api = workspaceApi(d.workspace.kind, d.workspace.scopeId);
  return (
    <>
      <PageHeading
        title="Change a booking"
        description="Move or cancel a future visit before work starts. A changed appointment needs renewed access and notice coordination; payments are reviewed separately."
      />
      <div className="stack">
        {d.bookings
          .filter((b) => b.status === 'confirmed' && b.starts_at > new Date().toISOString())
          .map((b) => (
            <Panel
              key={b.id}
              title={`${b.service_name} - ${b.address}`}
              description={`${b.reference} | ${b.starts_at}`}
            >
              <Badge status={b.status} />
              <OperationForm
                endpoint={`${api}/bookings/${b.id}/change`}
                defaults={{ version: b.version }}
                label="Submit booking change"
              >
                <Select
                  name="action"
                  label="Change required"
                  options={choices(['cancel', 'reschedule'])}
                />
                <Input
                  name="startsAt"
                  label="New appointment (for rescheduling)"
                  type="datetime-local"
                  required={false}
                  help="Existing duration, notice, capacity and buffer rules still apply. Times use your device timezone."
                />
                <Input name="reason" label="Reason for the change" />
                <Select
                  name="accessConfirmed"
                  label="Access arrangements reconfirmed"
                  options={[
                    { value: 'true', label: 'Yes' },
                    { value: 'false', label: 'Not applicable - cancellation' },
                  ]}
                />
              </OperationForm>
            </Panel>
          ))}
      </div>
    </>
  );
}
