import { useLoaderData, Form, Link, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Input, Panel, Select, choices, options } from '../components/OperationForm';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const base = `/api/w/${params.kind}/${params.scopeId}`,
    q = new URL(request.url).searchParams.get('q');
  return {
    admin: await loadApi(request, context, base + '/admin'),
    search:
      q && q.length >= 2
        ? await loadApi(request, context, base + '/search?q=' + encodeURIComponent(q))
        : null,
  } as any;
}
export default function Administration() {
  const { admin: a, search } = useLoaderData<typeof loader>(),
    d = useWorkspace(),
    w = d.workspace,
    api = workspaceApi(w.kind, w.scopeId),
    writable = ['administrator', 'operations_manager'].includes(d.user.staffRole ?? '');
  return (
    <>
      <PageHeading
        title="Operations administration"
        description="Review organisations and management authority, assign staff access, and inspect the operational audit. Confidential-case content is excluded."
      />
      <div className="stack">
        <Panel title="Find an operational record">
          <Form method="get" className="actions">
            <label htmlFor="global-q">Property, client, scheme or work reference</label>
            <input id="global-q" name="q" minLength={2} required />
            <button className="button">Search</button>
          </Form>
          {search &&
            Object.entries(search).map(([kind, rows]) => (
              <div key={kind}>
                <h3>{kind}</h3>
                {(rows as any[]).map((r) => (
                  <p key={r.id}>
                    {r.address || r.name || r.title} <small>{r.reference || r.id}</small>
                  </p>
                ))}
              </div>
            ))}
        </Panel>
        <Panel title="Organisation onboarding">
          {a.applications.map((x: any) => (
            <div className="stack" key={x.id}>
              <div className="record-row">
                <div>
                  <strong>{x.name}</strong>
                  <p>
                    {x.workspace_kind} | {x.email} | {x.business_reference}
                  </p>
                </div>
                <Badge status={x.status} />
              </div>
              {x.status === 'pending' && writable && (
                <OperationForm
                  endpoint={`${api}/organisation-applications/${x.id}/review`}
                  label="Record organisation review"
                >
                  <Select
                    name="decision"
                    label="Review outcome"
                    options={choices(['approved', 'declined'])}
                  />
                  <Input name="reference" label="Business verification / engagement reference" />
                </OperationForm>
              )}
            </div>
          ))}
        </Panel>
        <Panel title="Client accounts">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Experience</th>
                  <th>Status</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {a.clients.map((c: any) => (
                  <tr key={c.id + c.workspace_kind}>
                    <td>{c.name}</td>
                    <td>{c.workspace_kind || 'No portal entitlement'}</td>
                    <td>{c.status}</td>
                    <td>{c.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        {writable && (
          <>
            <Panel
              title="Record delegated spending authority"
              description="Verify the contract before setting a limit. Choose either a property or scheme, not both."
            >
              <OperationForm endpoint={`${api}/admin/authority`} label="Record authority">
                <Select name="clientId" label="Managing client" options={options(a.clients)} />
                <Select
                  name="propertyId"
                  label="Property"
                  optional
                  options={options(d.properties, 'address')}
                />
                <Select name="schemeId" label="Scheme" optional options={options(d.schemes)} />
                <Input name="amountCents" label="Spending limit (AUD cents)" type="number" />
                <Input name="reference" label="Authority reference" />
                <Input name="validUntil" label="Authority expiry" type="datetime-local" />
              </OperationForm>
            </Panel>
            <Panel title="Verified ownership and management handovers">
              <details>
                <summary>Record verified ownership</summary>
                <OperationForm endpoint={`${api}/admin/ownership`} label="Link verified owner">
                  <Select name="clientId" label="Owner account" options={options(a.clients)} />
                  <Select
                    name="propertyId"
                    label="Property"
                    options={options(d.properties, 'address')}
                  />
                  <Input name="reference" label="Ownership evidence reference" />
                </OperationForm>
              </details>
              <details>
                <summary>Transfer management authority</summary>
                <p>
                  Resolve open work before transfer. Historical documents are not automatically
                  shared with a new manager.
                </p>
                <OperationForm endpoint={`${api}/admin/management`} label="Transfer management">
                  <Select
                    name="propertyId"
                    label="Property"
                    options={options(d.properties, 'address')}
                  />
                  <Select
                    name="clientId"
                    label="New manager account"
                    options={options(a.clients)}
                  />
                  <Select
                    name="mode"
                    label="Management mode"
                    options={choices(['self_managed', 'agency_managed', 'commercial_managed'])}
                  />
                  <Input name="reference" label="Handover authority reference" />
                </OperationForm>
              </details>
            </Panel>
            <Panel title="Contractor directory">
              {a.contractors.map((c: any) => (
                <p key={c.id}>
                  {c.name} | {c.email} | {c.id}
                </p>
              ))}
              <OperationForm endpoint={`${api}/admin/contractors`} label="Add contractor">
                <Input name="name" label="Contractor name" />
                <Input name="email" label="Email" type="email" required={false} />
              </OperationForm>
            </Panel>
          </>
        )}
        {d.user.staffRole === 'administrator' && (
          <Panel title="Staff access">
            <OperationForm endpoint={`${api}/admin/staff`} label="Update staff access">
              <Select
                name="userId"
                label="Verified user"
                options={options(
                  a.staff.filter((u: any) => u.id !== d.user.id),
                  'email',
                )}
              />
              <Select
                name="role"
                label="Staff role"
                options={choices(['administrator', 'operations_manager', 'inspector', 'read_only'])}
              />
              <Select
                name="active"
                label="Access state"
                options={[
                  { value: 'true', label: 'Active' },
                  { value: 'false', label: 'Revoked' },
                ]}
              />
            </OperationForm>
            {d.restrictedEnabled && (
              <OperationForm
                endpoint={`${api}/admin/restricted-reviewers`}
                label="Update reviewer eligibility"
              >
                <Select
                  name="userId"
                  label="Eligible operational reviewer"
                  options={options(
                    a.staff.filter(
                      (u: any) =>
                        ['administrator', 'operations_manager'].includes(u.role) && u.active,
                    ),
                    'email',
                  )}
                />
                <Select
                  name="active"
                  label="Reviewer eligibility"
                  options={[
                    { value: 'true', label: 'Eligible' },
                    { value: 'false', label: 'Removed' },
                  ]}
                />
                <p className="small">
                  Reviewer eligibility alone does not grant access to any confidential case.
                </p>
              </OperationForm>
            )}
          </Panel>
        )}
        <div className="grid-2">
          <Panel title="Work-order reporting">
            {a.counts.map((c: any) => (
              <p key={c.status}>
                {c.status}: {c.count}
              </p>
            ))}
          </Panel>
          <Panel title="Payment reporting">
            {a.payments.map((p: any) => (
              <p key={p.status}>
                {p.status}: {p.count} records | AUD {(p.total_cents / 100).toFixed(2)}
              </p>
            ))}
          </Panel>
        </div>
        <Panel title="Operational audit">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {a.events.map((e: any) => (
                  <tr key={e.id}>
                    <td>{e.created_at}</td>
                    <td>{e.action}</td>
                    <td>{e.entity_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Link to={`${w.href}/integrations`}>Integration delivery and report authoring</Link>
      </div>
    </>
  );
}
