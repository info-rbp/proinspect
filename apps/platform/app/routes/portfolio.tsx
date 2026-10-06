import { Link, useRevalidator } from 'react-router';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import {
  OperationForm,
  Input,
  TextArea,
  Panel,
  Select,
  choices,
  options,
} from '../components/OperationForm';
export default function Portfolio() {
  const d = useWorkspace(),
    w = d.workspace,
    api = workspaceApi(w.kind, w.scopeId),
    professional = ['property-manager', 'commercial'].includes(w.kind),
    admin = ['owner', 'admin'].includes(w.role);
  return (
    <>
      <PageHeading
        title={professional ? 'Portfolio operations' : 'Inspection planning'}
        description="Keep property relationships, individual bookings and recurring inspection plans connected. Bulk operations report each result separately."
      />
      <div className="stack">
        <Panel title="Portfolio">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Sector</th>
                  <th>Open work</th>
                </tr>
              </thead>
              <tbody>
                {d.properties.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`${w.href}/properties/${p.id}`}>{p.address}</Link>
                      <p>{p.suburb}</p>
                    </td>
                    <td>{p.sector}</td>
                    <td>
                      {
                        d.workOrders.filter(
                          (o) =>
                            o.property_id === p.id &&
                            !['cancelled', 'completed'].includes(o.status),
                        ).length
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        {professional && admin && (
          <Panel
            title="Add a managed property"
            description="Record your management authority. An existing address is sent for relationship review, never silently linked."
          >
            <OperationForm endpoint={`${api}/properties`} label="Add managed property">
              <div className="grid-2">
                <Input name="address" label="Street address" />
                <Input name="suburb" label="Suburb" />
                <Input name="postcode" label="Postcode" />
                <Input name="propertyType" label="Property type" />
                <Input name="ownerName" label="Owner name" />
                <Input
                  name="ownerEmail"
                  label="Owner contact email"
                  type="email"
                  required={false}
                />
              </div>
              <Input name="authorityReference" label="Management authority reference" />
            </OperationForm>
          </Panel>
        )}
        {professional && admin && (
          <Panel
            title="Import a portfolio"
            description="Preview up to 20 properties at a time. Headers: address,suburb,postcode,ownerName; optional ownerEmail,propertyType. Existing or duplicate addresses require review."
          >
            <OperationForm
              endpoint={`${api}/imports/preview`}
              label="Preview import"
              result={(r) =>
                r.valid ? (
                  <div className="notice">
                    <p>{r.count} properties passed validation.</p>
                    <ApplyImport endpoint={`${api}/imports/${r.id}/apply`} />
                  </div>
                ) : (
                  <div role="alert">
                    {r.errors?.map((e: any) => (
                      <p key={e.row}>
                        Row {e.row}: {e.message}
                      </p>
                    ))}
                  </div>
                )
              }
            >
              <TextArea name="csv" label="CSV content" />
              <Input name="authorityReference" label="Portfolio authority reference" />
            </OperationForm>
          </Panel>
        )}
        {professional && (
          <Panel
            title="Book inspections in a batch"
            description="Select up to 20 properties from this portfolio. Each accepted appointment is retained if another cannot be scheduled. Inspect access arrangements for every property before confirming."
          >
            <OperationForm
              endpoint={`${api}/bulk-bookings`}
              label="Create individual bookings"
              result={(r) => (
                <div>
                  <p>{r.succeeded} bookings accepted.</p>
                  {r.results?.map((x: any) => (
                    <p key={x.propertyId}>
                      {d.properties.find((p) => p.id === x.propertyId)?.address ?? x.propertyId}:{' '}
                      {x.ok ? x.reference : x.message}
                    </p>
                  ))}
                </div>
              )}
            >
              <Select name="serviceId" label="Service" options={options(d.services)} />
              <Input name="date" label="Preferred date" type="date" />
              <fieldset className="stack-sm">
                <legend>Properties to book</legend>
                {d.properties.map((p) => (
                  <label className="check-row" key={p.id}>
                    <input type="checkbox" name="propertyIds" value={p.id} />
                    {p.address}, {p.suburb}
                  </label>
                ))}
              </fieldset>
              <Select
                name="access.method"
                label="Access method"
                options={choices(['agent', 'tenant', 'owner', 'lockbox', 'other'])}
              />
              <TextArea name="access.instructions" label="Common access instructions" />
              <Select
                name="access.noticeConfirmed"
                label="Required notice and authorisation checked for each property"
                options={[{ value: 'true', label: 'Confirmed for every selected property' }]}
              />
            </OperationForm>
          </Panel>
        )}
        <Panel
          title="Recurring inspection plans"
          description="Plans identify work due. They do not automatically issue tenancy notices or book unapproved visits."
        >
          {d.plans.map((p) => (
            <div className="record-row" key={p.id}>
              <div>
                <strong>{p.address}</strong>
                <p>
                  {p.service_name} | Due {p.next_due}
                </p>
                <Badge status={p.status} />
              </div>
              <div className="stack-sm">
                {p.status === 'active' && (
                  <Link
                    className="button secondary small"
                    to={`${w.href}/book/${p.service_id}?property=${p.property_id}&plan=${p.id}&due=${p.next_due}`}
                  >
                    Schedule this occurrence
                  </Link>
                )}
                {p.status !== 'ended' && (
                  <OperationForm
                    endpoint={`${api}/plans/${p.id}`}
                    defaults={{
                      version: p.version,
                      status: p.status === 'active' ? 'paused' : 'active',
                    }}
                    label={p.status === 'active' ? 'Pause plan' : 'Resume plan'}
                  />
                )}
              </div>
            </div>
          ))}
          <OperationForm endpoint={`${api}/plans`} label="Create inspection plan">
            <Select name="propertyId" label="Property" options={options(d.properties, 'address')} />
            <Select name="serviceId" label="Service" options={options(d.services)} />
            <Input name="intervalMonths" label="Interval in months" type="number" value={3} />
            <Input name="nextDue" label="Next due date" type="date" />
          </OperationForm>
        </Panel>
      </div>
    </>
  );
}
function ApplyImport({ endpoint }: { endpoint: string }) {
  const revalidator = useRevalidator();
  return (
    <button
      className="button"
      type="button"
      onClick={async (event) => {
        const b = event.currentTarget;
        b.disabled = true;
        try {
          const response = await fetch(endpoint, { method: 'POST' });
          const data: any = await response.json();
          b.textContent = response.ok ? 'Import applied. Reload portfolio to view.' : data.message;
          b.disabled = response.ok;
          if (response.ok) {
            b.textContent = 'Import applied.';
            revalidator.revalidate();
          }
        } catch {
          b.disabled = false;
          b.textContent = 'Retry import';
        }
      }}
    >
      Apply reviewed import
    </button>
  );
}
