import { Link } from 'react-router';
import {
  Form,
  useActionData,
  useNavigation,
  useSearchParams,
  type ActionFunctionArgs,
} from 'react-router';
import { useWorkspace } from '../lib/workspace';
import { submitAction } from '../lib/actions.server';
import {
  PageHeading,
  Badge,
  EmptyState,
  Feedback,
  Field,
} from '../../../../packages/ui/components';
import { displayDate } from '../../../../packages/domain/index';
export async function action(args: ActionFunctionArgs) {
  const f = await args.request.formData();
  if (f.get('intent') === 'convert')
    return submitAction(
      args,
      `requests/${encodeURIComponent(String(f.get('requestId')))}/convert`,
      {},
      'Work order created.',
    );
  return submitAction(
    args,
    'requests',
    {
      propertyId: f.get('propertyId') || undefined,
      category: f.get('category'),
      title: f.get('title'),
      details: f.get('details'),
      priority: f.get('priority'),
    },
    'Your request has been received.',
  );
}
export default function Requests() {
  const d = useWorkspace();
  const w = d.workspace;
  const result = useActionData<any>();
  const [search] = useSearchParams();
  const busy = useNavigation().state !== 'idle';
  const allowed =
    (['landlord', 'property-manager', 'commercial'].includes(w.kind) && w.role !== 'viewer') ||
    (w.kind === 'tenant' &&
      d.tenancies.some(
        (t) => t.status === 'active' && (!t.ends_at || t.ends_at > new Date().toISOString()),
      ));
  return (
    <>
      <PageHeading
        eyebrow={w.kind === 'staff' ? 'Operational inbox' : 'Property support'}
        title={w.kind === 'tenant' ? 'My requests' : 'Maintenance & requests'}
        description="Follow each request from receipt through review and completion."
      />
      <div className="stack">
        <Feedback value={result} />
        <section className="panel">
          <div className="panel-header">
            <h2>{w.kind === 'staff' ? 'Incoming requests' : 'Request history'}</h2>
          </div>
          {d.requests.length ? (
            d.requests.map((r) => (
              <article className="record-row" id={r.id} key={r.id}>
                <div style={{ flex: 1 }}>
                  <div className="actions">
                    <span className="small muted">{r.reference}</span>
                    <Badge status={r.status} />
                    {r.priority === 'emergency' && <Badge status="emergency" />}
                  </div>
                  <h3 style={{ marginTop: 10 }}>{r.title}</h3>
                  <p style={{ whiteSpace: 'pre-wrap', maxWidth: 750 }}>{r.details}</p>
                  <p>{displayDate(r.created_at)}</p>
                </div>
                {w.kind === 'staff' &&
                  ['administrator', 'operations_manager'].includes(d.user.staffRole ?? '') && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="convert" />
                      <input type="hidden" name="requestId" value={r.id} />
                      <button className="button secondary small" disabled={busy}>
                        Create work order
                      </button>
                    </Form>
                  )}
              </article>
            ))
          ) : (
            <EmptyState
              title="No requests yet"
              description="Submit a request when you need ProInspect to review a property matter."
            />
          )}
        </section>
        {allowed && (
          <section className="panel form-width">
            <div className="panel-header">
              <h2>New request</h2>
            </div>
            <Form method="post" className="form">
              {['landlord', 'property-manager', 'commercial'].includes(w.kind) && (
                <Field label="Property" name="propertyId">
                  <select
                    id="propertyId"
                    name="propertyId"
                    required
                    defaultValue={search.get('property') || ''}
                  >
                    <option value="">Select property</option>
                    {d.properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.address}, {p.suburb}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="grid-2">
                <Field label="Request type" name="category">
                  <select id="category" name="category">
                    <option value="maintenance">Maintenance</option>
                    <option value="inspection_access">Inspection / access</option>
                    <option value="occupant">Occupant information</option>
                    <option value="vacate">Moving / key return</option>
                    <option value="complaint">Problem or concern</option>
                    <option value="other">Other service request</option>
                  </select>
                </Field>
                <Field label="Priority" name="priority">
                  <select id="priority" name="priority">
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </Field>
              </div>
              <Field label="Request title" name="title">
                <input
                  id="title"
                  name="title"
                  required
                  minLength={4}
                  maxLength={180}
                  defaultValue={d.services.find((s) => s.id === search.get('service'))?.name ?? ''}
                />
              </Field>
              <Field label="Tell us what is needed" name="details">
                <textarea id="details" name="details" required minLength={10} maxLength={5000} />
              </Field>
              <div className="notice warning">
                This form is not an emergency response service. Do not rely on a portal submission
                where immediate assistance is required. Moving-out requests here do not serve a
                formal termination notice.
              </div>
              <button className="primary" disabled={busy}>
                {busy ? 'Submitting…' : 'Submit request'}
              </button>
            </Form>
          </section>
        )}
      </div>
    </>
  );
}
