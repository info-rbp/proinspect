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
  choices,
  options,
} from '../components/OperationForm';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  return (await loadApi(
    request,
    context,
    `/api/w/${params.kind}/${params.scopeId}/schemes/${params.schemeId}`,
  )) as any;
}
export default function Scheme() {
  const s = useLoaderData<typeof loader>(),
    d = useWorkspace(),
    w = d.workspace,
    api = workspaceApi(w.kind, w.scopeId),
    root = `${api}/schemes/${s.scheme.id}`,
    manager = ['strata-manager', 'staff'].includes(w.kind);
  return (
    <>
      <PageHeading
        title={s.scheme.name}
        eyebrow={`Scheme ${s.scheme.scheme_number}`}
        description={
          manager
            ? 'Coordinate work, people and communications from one scheme record.'
            : 'View building notices, upcoming work and requests within your authorised membership.'
        }
      />
      <div className="stack">
        <Panel title="Building notices">
          {s.notices.length ? (
            s.notices.map((n: any) => (
              <article key={n.id} className="notice">
                <h3>{n.title}</h3>
                <p className="preserve-lines">{n.body}</p>
                <p className="small">{n.starts_at}</p>
              </article>
            ))
          ) : (
            <p>No current notices apply to your membership.</p>
          )}
        </Panel>
        <div className="detail-grid">
          <Panel title="Work and building activity">
            {s.works.map((o: any) => (
              <div key={o.id} className="record-row">
                <div>
                  <strong>{o.title}</strong>
                  <p>{o.scheduled_at || 'Scheduling pending'}</p>
                </div>
                <Badge status={o.status} />
              </div>
            ))}
          </Panel>
          <Panel title={manager ? 'Building requests' : 'Requests'}>
            {s.issues.map((r: any) => (
              <div className="record-row" key={r.id}>
                <div>
                  {w.kind === 'council' ? (
                    <strong>{r.title}</strong>
                  ) : (
                    <Link to={`${w.href}/requests/${r.id}`}>{r.title}</Link>
                  )}
                  <p>{r.reference}</p>
                </div>
                <Badge status={r.status} />
              </div>
            ))}
          </Panel>
        </div>
        <Panel
          title="Report an issue"
          description="Inside-lot issues route to your tenancy when that relationship exists. Uncertain boundaries are assessed by a person, not treated as a legal ownership decision."
        >
          <OperationForm
            endpoint={`${root}/requests`}
            label="Submit issue"
            result={(r) => (
              <p>
                Request {r.reference} was routed to {r.routedTo}.{' '}
                {r.href && <Link to={r.href}>View request</Link>}
              </p>
            )}
          >
            <Select
              name="locationKind"
              label="Where is the issue?"
              options={[
                { value: 'common', label: 'Common property / building' },
                { value: 'lot', label: 'Inside my lot' },
                { value: 'unsure', label: 'I am not sure' },
              ]}
            />
            <Select
              name="areaId"
              label="Common-property area"
              optional
              options={options(s.areas)}
            />
            <Select name="lotId" label="Lot" optional options={options(s.lots, 'lot_number')} />
            <Input name="title" label="Issue summary" />
            <TextArea name="details" label="What happened?" />
            <Select
              name="category"
              label="Request type"
              options={choices(['maintenance', 'access', 'move', 'other'])}
            />
            <Select
              name="priority"
              label="Urgency"
              options={choices(['routine', 'urgent', 'emergency'])}
            />
            <p className="small">
              This portal is not an emergency response service. For immediate danger, contact
              emergency services.
            </p>
          </OperationForm>
        </Panel>
        {manager && (
          <>
            <Panel title="Building structure">
              <div className="grid-2">
                <div>
                  <h3>Buildings and common areas</h3>
                  {[...s.buildings, ...s.areas].map((x: any) => (
                    <p key={x.id}>{x.name}</p>
                  ))}
                </div>
                <div>
                  <h3>Lots</h3>
                  {s.lots.map((l: any) => (
                    <p key={l.id}>Lot {l.lot_number}</p>
                  ))}
                </div>
              </div>
              <OperationForm endpoint={`${root}/structure`} label="Add scheme location">
                <Select
                  name="kind"
                  label="Location type"
                  options={choices(['area', 'lot', 'building'])}
                />
                <Input name="name" label="Name or lot number" />
                <Select
                  name="buildingId"
                  label="Building"
                  optional
                  options={options(s.buildings)}
                />
                {w.kind === 'staff' && (
                  <Select
                    name="propertyId"
                    label="Verified canonical property link"
                    optional
                    options={options(d.properties, 'address')}
                  />
                )}
              </OperationForm>
            </Panel>
            <Panel title="Residents, owners and council">
              <OperationForm
                endpoint={`${api}/team/invite`}
                defaults={{ schemeId: s.scheme.id }}
                label="Send scheme invitation"
              >
                <Input name="email" label="Invited email" type="email" />
                <Select
                  name="role"
                  label="Verified relationship"
                  options={choices(['resident', 'owner', 'council_member'])}
                />
                <Select name="lotId" label="Lot" optional options={options(s.lots, 'lot_number')} />
                <Input
                  name="endsAt"
                  label="Membership end (required for council term)"
                  type="datetime-local"
                  required={false}
                />
              </OperationForm>
              {s.members.map((m: any) => (
                <div className="record-row" key={m.id}>
                  <div>
                    <strong>{m.display_name || m.email}</strong>
                    <p>
                      {m.role} | {m.ends_at || 'Active until ended'}
                    </p>
                  </div>
                  {(!m.ends_at || m.ends_at > new Date().toISOString()) && (
                    <OperationForm
                      endpoint={`${root}/members/${m.id}/end`}
                      label="End membership"
                    />
                  )}
                </div>
              ))}
            </Panel>
            <Panel title="Publish a targeted notice">
              <OperationForm endpoint={`${root}/notices`} label="Publish notice">
                <Input name="title" label="Notice title" />
                <TextArea name="body" label="Message" />
                <Select
                  name="audience"
                  label="Audience"
                  options={choices(['all_members', 'residents', 'owners', 'council'])}
                />
                <Select
                  name="buildingId"
                  label="Building filter"
                  optional
                  options={options(s.buildings)}
                />
                <Select
                  name="lotId"
                  label="Lot filter"
                  optional
                  options={options(s.lots, 'lot_number')}
                />
                <Select
                  name="workOrderId"
                  label="Related work order"
                  optional
                  options={options(s.works, 'title')}
                />
                <Input
                  name="startsAt"
                  label="Publish from"
                  type="datetime-local"
                  required={false}
                />
                <Input name="expiresAt" label="Expires" type="datetime-local" required={false} />
              </OperationForm>
            </Panel>
            <Panel title="Resident-facing works information">
              {s.works.map((o: any) => (
                <details key={o.id}>
                  <summary>{o.title}</summary>
                  <OperationForm
                    endpoint={`${api}/work-orders/${o.id}/public`}
                    defaults={{ version: o.version }}
                    label="Update resident information"
                  >
                    <Select
                      name="residentVisible"
                      label="Show to building members"
                      options={[
                        { value: 'true', label: 'Yes' },
                        { value: 'false', label: 'No' },
                      ]}
                    />
                    <TextArea name="summary" label="Resident-facing summary" />
                    <Input
                      name="scheduledAt"
                      label="Scheduled attendance"
                      type="datetime-local"
                      required={false}
                    />
                  </OperationForm>
                </details>
              ))}
            </Panel>
          </>
        )}
      </div>
    </>
  );
}
