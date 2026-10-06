import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Input, Panel, Select, choices, options } from '../components/OperationForm';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  return (await loadApi(request, context, `/api/w/${params.kind}/${params.scopeId}/team`)) as any;
}
export default function Team() {
  const data = useLoaderData<typeof loader>(),
    d = useWorkspace(),
    api = workspaceApi(d.workspace.kind, d.workspace.scopeId);
  return (
    <>
      <PageHeading
        title="Team and portfolio access"
        description="Administrators manage the account. Portfolio members only manage properties assigned to them; viewers cannot change records."
      />
      <div className="stack">
        <Panel title="Invite a team member">
          <OperationForm endpoint={`${api}/team/invite`} label="Send invitation">
            <Input type="email" name="email" label="Team member email" />
            <Select name="role" label="Role" options={choices(['admin', 'member', 'viewer'])} />
          </OperationForm>
        </Panel>
        <Panel title="Your team">
          {data.members.map((m: any) => (
            <div className="stack" key={m.id}>
              <div className="record-row">
                <strong>{m.display_name || m.email}</strong>
                <Badge status={m.role} />
              </div>
              {m.id !== d.user.id && m.role !== 'owner' && (
                <OperationForm endpoint={`${api}/team/${m.id}`} label="Update access">
                  <Select
                    name="role"
                    label="Role"
                    value={m.role}
                    options={choices(['admin', 'member', 'viewer'])}
                  />
                  <Select
                    name="active"
                    label="Access"
                    value={m.active ? 'true' : 'false'}
                    options={[
                      { value: 'true', label: 'Active' },
                      { value: 'false', label: 'Revoked' },
                    ]}
                  />
                </OperationForm>
              )}
            </div>
          ))}
        </Panel>
        {['property-manager', 'commercial'].includes(d.workspace.kind) && (
          <Panel title="Portfolio assignments">
            <OperationForm endpoint={`${api}/team/assignments`} label="Save assignment">
              <Select name="userId" label="Team member" options={options(data.members, 'email')} />
              <Select
                name="propertyId"
                label="Property"
                options={options(d.properties, 'address')}
              />
              <Select
                name="assigned"
                label="Assignment"
                options={[
                  { value: 'true', label: 'Assign property' },
                  { value: 'false', label: 'Remove assignment' },
                ]}
              />
            </OperationForm>
            <h3>Owner contacts</h3>
            {data.owners.map((o: any) => (
              <p key={o.property_id}>
                {d.properties.find((p) => p.id === o.property_id)?.address} | {o.name} | {o.email}
              </p>
            ))}
          </Panel>
        )}
      </div>
    </>
  );
}
