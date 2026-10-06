import { Link, Form, useActionData, useNavigation, type ActionFunctionArgs } from 'react-router';
import { useWorkspace } from '../lib/workspace';
import { submitAction } from '../lib/actions.server';
import {
  PageHeading,
  Badge,
  EmptyState,
  Field,
  Feedback,
} from '../../../../packages/ui/components';
export async function action(args: ActionFunctionArgs) {
  const f = await args.request.formData();
  const start = String(f.get('startDate'));
  const end = String(f.get('endDate') || '');
  return submitAction(
    args,
    'tenancies',
    {
      propertyId: f.get('propertyId'),
      email: f.get('email'),
      startsAt: new Date(`${start}T00:00:00+08:00`).toISOString(),
      endsAt: end ? new Date(`${end}T23:59:59+08:00`).toISOString() : undefined,
    },
    'Tenancy created and invitation queued.',
  );
}
export default function Tenancies() {
  const d = useWorkspace();
  const result = useActionData<any>();
  const busy = useNavigation().state !== 'idle';
  return (
    <>
      <PageHeading
        eyebrow="Property relationships"
        title={d.workspace.kind === 'tenant' ? 'My tenancy' : 'Tenancies'}
        description="Tenancy access is separate from ownership and management. A verified invitation connects the tenant to the property."
      />
      <div className="stack">
        <Feedback value={result} />
        <section className="panel">
          {d.tenancies.length ? (
            d.tenancies.map((t) => (
              <div key={t.id} className="record-row">
                <div>
                  <h3>{t.address || d.properties.find((p) => p.id === t.property_id)?.address}</h3>
                  <p>
                    From{' '}
                    {new Intl.DateTimeFormat('en-AU', {
                      dateStyle: 'medium',
                      timeZone: 'Australia/Perth',
                    }).format(new Date(t.starts_at))}
                    {t.ends_at
                      ? ` to ${new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeZone: 'Australia/Perth' }).format(new Date(t.ends_at))}`
                      : ''}
                  </p>
                </div>
                <Badge status={t.status} />
                <Link
                  className="button secondary small"
                  to={`${d.workspace.href}/tenancies/${t.id}`}
                >
                  Open tenancy workspace
                </Link>
              </div>
            ))
          ) : (
            <EmptyState
              title="No tenancy recorded"
              description="Create a tenancy and invite the tenant using their own email address."
            />
          )}
        </section>
        {['landlord', 'property-manager', 'commercial', 'staff'].includes(d.workspace.kind) &&
          d.workspace.role !== 'viewer' && (
            <section className="panel form-width">
              <div className="panel-header">
                <h2>Create tenancy & invite tenant</h2>
              </div>
              <Form method="post" className="form">
                <Field label="Property" name="propertyId">
                  <select id="propertyId" name="propertyId" required>
                    <option value="">Choose property</option>
                    {d.properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.address}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tenant email" name="email">
                  <input id="email" name="email" type="email" required />
                </Field>
                <div className="grid-2">
                  <Field label="Start date" name="startDate">
                    <input id="startDate" name="startDate" type="date" required />
                  </Field>
                  <Field label="End date, if known" name="endDate">
                    <input id="endDate" name="endDate" type="date" />
                  </Field>
                </div>
                <p className="small">
                  The tenant must verify this email and accept the invitation. Creating the record
                  does not give anyone access by address alone.
                </p>
                <button className="primary" disabled={busy}>
                  Create and invite
                </button>
              </Form>
            </section>
          )}
      </div>
    </>
  );
}
