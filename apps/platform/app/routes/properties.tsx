import { Form, Link, useActionData, useNavigation, useLoaderData, redirect, data, type LoaderFunctionArgs, type ActionFunctionArgs } from 'react-router';
import { useWorkspace } from '../lib/workspace';
import { callApi } from '../lib/api.server';
import { bookingIntent } from '../../../../packages/domain/booking-intent';
import { PageHeading, EmptyState, Field, Feedback } from '../../../../packages/ui/components';
export function loader({ request }: LoaderFunctionArgs) {
  return { serviceId: bookingIntent(new URL(request.url).searchParams.get('service')) };
}
export async function action(args: ActionFunctionArgs) {
  const f = await args.request.formData();
  const response = await callApi(args.request, args.context, `/api/w/${args.params.kind}/${args.params.scopeId}/properties`, {
    method: 'POST', body: { address: f.get('address'), suburb: f.get('suburb'), postcode: f.get('postcode'), propertyType: f.get('propertyType'), selfManaged: f.get('selfManaged') === 'yes' },
  });
  const result = await response.json() as Record<string, any>;
  if (!response.ok) return data({ error: result.message, fields: result.fields }, { status: response.status });
  const serviceId = bookingIntent(f.get('serviceId'));
  if (serviceId) return redirect(`/w/${args.params.kind}/${args.params.scopeId}/book/${serviceId}?property=${encodeURIComponent(result.propertyId)}`);
  return { ok: true, message: 'Property added to your account.' };
}
export default function Properties() {
  const d = useWorkspace();
  const { serviceId } = useLoaderData<typeof loader>();
  const result = useActionData<any>();
  const busy = useNavigation().state !== 'idle';
  return <>
    <PageHeading eyebrow="Your portfolio" title={d.workspace.kind === 'staff' ? 'Properties' : 'My properties'} description="Open a property to see its bookings, requests and reports."/>
    <div className="stack"><Feedback value={result}/>
      {d.properties.length ? <div className="grid-3">{d.properties.map(p => <article className="panel property-card" key={p.id}><div className="property-avatar" aria-hidden="true">⌂</div><div><h3>{p.address}</h3><p>{p.suburb} {p.state} {p.postcode}</p></div><footer><span>{p.property_type}</span><Link to={`${d.workspace.href}/properties/${p.id}`}>Open property →</Link></footer></article>)}</div> : <section className="panel"><EmptyState title="No properties yet" description="Add the residential rental property you own and self-manage to start booking services."/></section>}
      {d.workspace.kind === 'landlord' && ['owner', 'admin'].includes(d.workspace.role) && <section className="panel form-width" id="add-property"><div className="panel-header"><h2>Add a property</h2></div>
        <Form method="post" className="form"><input type="hidden" name="serviceId" value={serviceId ?? ''}/>
          <Field label="Street address, including unit if applicable" name="address"><input id="address" name="address" required minLength={5} maxLength={180} autoComplete="street-address" placeholder="Unit 2, 24 Example Street"/></Field>
          <div className="grid-2"><Field label="Suburb" name="suburb"><input id="suburb" name="suburb" required autoComplete="address-level2"/></Field><Field label="WA postcode" name="postcode"><input id="postcode" name="postcode" required pattern="[0-9]{4}" inputMode="numeric" autoComplete="postal-code"/></Field></div>
          <Field label="Property type" name="propertyType"><select id="propertyType" name="propertyType">{['House', 'Apartment', 'Townhouse', 'Villa', 'Other'].map(t => <option key={t}>{t}</option>)}</select></Field>
          <label className="checkbox"><input type="checkbox" name="selfManaged" value="yes" required/><span>I own and self-manage this residential rental property.</span></label>
          <p className="small">A matching existing property may require ProInspect to verify the relationship before it can be linked.</p><button className="primary" disabled={busy}>{busy ? 'Adding property…' : 'Add property'}</button>
        </Form>
      </section>}
    </div>
  </>;
}
