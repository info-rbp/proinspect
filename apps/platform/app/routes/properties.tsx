import {
  Form,
  Link,
  useActionData,
  useNavigation,
  useLoaderData,
  redirect,
  data,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router';
import { useWorkspace } from '../lib/workspace';
import { callApi, loadApi } from '../lib/api.server';
import { bookingIntent } from '../../../../packages/domain/booking-intent';
import { PageHeading, EmptyState, Field, Feedback } from '../../../../packages/ui/components';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const page = (await loadApi(
    request,
    context,
    `/api/w/${params.kind}/${params.scopeId}/property-directory${url.search}`,
  )) as {
    items: import('../../../../packages/domain/index').Property[];
    total: number;
    next: string | null;
    query: string;
  };
  return { serviceId: bookingIntent(url.searchParams.get('service')), page };
}
export async function action(args: ActionFunctionArgs) {
  const f = await args.request.formData();
  const response = await callApi(
    args.request,
    args.context,
    `/api/w/${args.params.kind}/${args.params.scopeId}/properties`,
    {
      method: 'POST',
      body: {
        address: f.get('address'),
        suburb: f.get('suburb'),
        postcode: f.get('postcode'),
        propertyType: f.get('propertyType'),
        selfManaged: f.get('selfManaged') === 'yes',
      },
    },
  );
  const result = (await response.json()) as Record<string, any>;
  if (!response.ok)
    return data({ error: result.message, fields: result.fields }, { status: response.status });
  const serviceId = bookingIntent(f.get('serviceId'));
  if (serviceId)
    return redirect(
      `/w/${args.params.kind}/${args.params.scopeId}/book/${serviceId}?property=${encodeURIComponent(result.propertyId)}`,
    );
  return { ok: true, message: 'Property added to your account.' };
}
export default function Properties() {
  const d = useWorkspace();
  const { serviceId, page } = useLoaderData<typeof loader>();
  const result = useActionData<any>();
  const busy = useNavigation().state !== 'idle';
  return (
    <>
      <PageHeading
        eyebrow="Your portfolio"
        title={d.workspace.kind === 'staff' ? 'Properties' : 'My properties'}
        description="Open a property to see its bookings, requests and reports."
      />
      <div className="stack">
        <Feedback value={result} />
        <Form method="get" className="actions">
          <input type="hidden" name="service" value={serviceId ?? ''} />
          <Field label="Search your properties" name="q">
            <input
              id="q"
              name="q"
              defaultValue={page.query}
              placeholder="Address, suburb or postcode"
              maxLength={100}
            />
          </Field>
          <button className="button secondary">Search</button>
        </Form>
        <p className="small">
          {page.total} matching properties in this workspace. Showing {page.items.length} on this
          page.
        </p>
        {page.items.length ? (
          <div className="grid-3">
            {page.items.map((p) => (
              <article className="panel property-card" key={p.id}>
                <div className="property-avatar" aria-hidden="true">
                  ⌂
                </div>
                <div>
                  <h3>{p.address}</h3>
                  <p>
                    {p.suburb} {p.state} {p.postcode}
                  </p>
                </div>
                <footer>
                  <span>{p.property_type}</span>
                  <Link to={`${d.workspace.href}/properties/${p.id}`}>Open property →</Link>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <section className="panel">
            <EmptyState
              title={page.query ? 'No matching properties' : 'No properties yet'}
              description="Search again or add a property through your authorised account."
            />
          </section>
        )}
        <nav className="actions" aria-label="Property pages">
          <Link
            className="button secondary"
            to={`${d.workspace.href}/properties?q=${encodeURIComponent(page.query)}&service=${serviceId ?? ''}`}
          >
            First page
          </Link>
          {page.next && (
            <Link
              className="button secondary"
              to={`${d.workspace.href}/properties?q=${encodeURIComponent(page.query)}&service=${serviceId ?? ''}&after=${encodeURIComponent(page.next)}`}
            >
              Next page
            </Link>
          )}
        </nav>
        {d.workspace.kind === 'landlord' && ['owner', 'admin'].includes(d.workspace.role) && (
          <section className="panel form-width" id="add-property">
            <div className="panel-header">
              <h2>Add a property</h2>
            </div>
            <Form method="post" className="form">
              <input type="hidden" name="serviceId" value={serviceId ?? ''} />
              <Field label="Street address, including unit if applicable" name="address">
                <input
                  id="address"
                  name="address"
                  required
                  minLength={5}
                  maxLength={180}
                  autoComplete="street-address"
                  placeholder="Unit 2, 24 Example Street"
                />
              </Field>
              <div className="grid-2">
                <Field label="Suburb" name="suburb">
                  <input id="suburb" name="suburb" required autoComplete="address-level2" />
                </Field>
                <Field label="WA postcode" name="postcode">
                  <input
                    id="postcode"
                    name="postcode"
                    required
                    pattern="[0-9]{4}"
                    inputMode="numeric"
                    autoComplete="postal-code"
                  />
                </Field>
              </div>
              <Field label="Property type" name="propertyType">
                <select id="propertyType" name="propertyType">
                  {['House', 'Apartment', 'Townhouse', 'Villa', 'Other'].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <label className="checkbox">
                <input type="checkbox" name="selfManaged" value="yes" required />
                <span>I own and self-manage this residential rental property.</span>
              </label>
              <p className="small">
                A matching existing property may require ProInspect to verify the relationship
                before it can be linked.
              </p>
              <button className="primary" disabled={busy}>
                {busy ? 'Adding property…' : 'Add property'}
              </button>
            </Form>
          </section>
        )}
      </div>
    </>
  );
}
