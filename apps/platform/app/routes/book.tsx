import { useEffect, useState } from 'react';
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useParams,
  useSearchParams,
  type ActionFunctionArgs,
} from 'react-router';
import { useWorkspace } from '../lib/workspace';
import { submitAction } from '../lib/actions.server';
import { PageHeading, Field, Feedback, EmptyState } from '../../../../packages/ui/components';
import { money } from '../../../../packages/domain/index';
export function loader() {
  return { requestKey: crypto.randomUUID() };
}
export async function action(args: ActionFunctionArgs) {
  const f = await args.request.formData();
  return submitAction(
    args,
    'bookings',
    {
      propertyId: f.get('propertyId'),
      serviceId: f.get('serviceId'),
      startsAt: f.get('startsAt'),
      requestKey: f.get('requestKey'),
      access: {
        method: f.get('accessMethod'),
        instructions: f.get('instructions') || '',
        noticeConfirmed: f.get('noticeConfirmed') === 'yes',
      },
    },
    'Your booking is confirmed.',
  );
}
export default function Book() {
  const d = useWorkspace();
  const { serviceId: requestedService } = useParams();
  const [search] = useSearchParams();
  const { requestKey } = useLoaderData<typeof loader>();
  const result = useActionData<any>();
  const busy = useNavigation().state !== 'idle';
  const [serviceId, setServiceId] = useState(requestedService || '');
  const [propertyId, setPropertyId] = useState(search.get('property') || d.properties[0]?.id || '');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Array<{ start: string; end: string; label: string }>>([]);
  const [slot, setSlot] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Select a date to see available appointments.');
  const [method, setMethod] = useState('owner');
  const service = d.services.find((s) => s.id === serviceId);
  const property = d.properties.find((p) => p.id === propertyId);
  useEffect(() => {
    setSlot('');
    setSlots([]);
    if (!date || !serviceId) return;
    const abort = new AbortController();
    setLoading(true);
    fetch(
      `/api/w/${d.workspace.kind}/${d.workspace.scopeId}/availability?service=${encodeURIComponent(serviceId)}&date=${date}`,
      { signal: abort.signal },
    )
      .then(async (r) => {
        const value = (await r.json()) as any;
        if (!r.ok) throw new Error(value.message || 'Availability could not be loaded.');
        setSlots(value.slots);
        setMessage(value.message);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setMessage(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [date, serviceId, d.workspace.kind, d.workspace.scopeId]);
  if (d.workspace.kind !== 'landlord')
    return (
      <EmptyState
        title="Booking unavailable"
        description="Use an authorised management workspace to book a service."
      />
    );
  if (!d.properties.length)
    return (
      <>
        <PageHeading
          title="Start with your property."
          description="Add your residential rental property before booking a service."
        />
        <section className="panel">
          <EmptyState
            title="Your report needs a home"
            description="Bookings and reports are linked to your property, so you can find them again later."
          >
            <Link className="button" to={`${d.workspace.href}/properties`}>
              Add a property
            </Link>
          </EmptyState>
        </section>
      </>
    );
  if (result?.ok)
    return (
      <>
        <PageHeading
          eyebrow="Booking confirmed"
          title="Your service is booked."
          description="Your booking and work order are now part of your property record."
        />
        <section className="panel form-width stack">
          <h2>{result.result.reference}</h2>
          <Feedback value={result} />
          <p>
            ProInspect will carry out the booked work. Once your report is issued, it will appear
            under Documents & reports in your account.
          </p>
          <div className="actions">
            <Link className="button" to={`${d.workspace.href}/bookings`}>
              View bookings
            </Link>
            <Link className="button secondary" to={`${d.workspace.href}/properties/${propertyId}`}>
              Return to property
            </Link>
          </div>
        </section>
      </>
    );
  return (
    <>
      <PageHeading
        eyebrow="Book a ProInspect service"
        title="Arrange your next property visit."
        description="Select your property and service, confirm access, then choose an available appointment."
      />
      <div className="step-track">
        <strong>01 Property</strong>
        <span>→</span>
        <strong>02 Service</strong>
        <span>→</span>
        <strong>03 Access</strong>
        <span>→</span>
        <strong>04 Appointment</strong>
      </div>
      <Form method="post" className="detail-grid">
        <input type="hidden" name="requestKey" value={requestKey} />
        <input type="hidden" name="startsAt" value={slot} />
        <div className="stack">
          <section className="panel form">
            <h2>Property & service</h2>
            <Field label="Property" name="propertyId">
              <select
                id="propertyId"
                name="propertyId"
                required
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
              >
                {d.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.address}, {p.suburb}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Service" name="serviceId">
              <select
                id="serviceId"
                name="serviceId"
                required
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
              >
                <option value="">Choose a service</option>
                {d.services
                  .filter((s) => s.sectors.includes(property?.sector ?? 'residential'))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
            {service && <p className="small">{service.summary}</p>}
            {service?.booking_mode === 'request' && (
              <div className="notice warning">
                This service requires a scope or price confirmation.{' '}
                <Link to={`${d.workspace.href}/requests?property=${propertyId}`}>
                  Send a service request
                </Link>{' '}
                instead of reserving an appointment.
              </div>
            )}
          </section>
          <section className="panel form">
            <h2>Access arrangements</h2>
            <Field label="How will access be provided?" name="accessMethod">
              <select
                id="accessMethod"
                name="accessMethod"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="owner">I will provide access</option>
                <option value="tenant">Tenant access</option>
                <option value="agent">Authorised agent</option>
                <option value="lockbox">Lockbox / key safe</option>
                <option value="other">Other arrangement</option>
              </select>
            </Field>
            <Field
              label="Access instructions"
              name="instructions"
              help="Confidential instructions are encrypted and are not included in confirmation emails."
            >
              <textarea
                id="instructions"
                name="instructions"
                maxLength={3000}
                placeholder="Where to meet, access details or anything the inspector needs to know."
              />
            </Field>
            {method === 'tenant' && (
              <label className="checkbox">
                <input type="checkbox" name="noticeConfirmed" value="yes" required />
                <span>
                  I have arranged the required access and notice for this appointment. A booking
                  confirmation is not a tenancy entry notice.
                </span>
              </label>
            )}
          </section>
          <section className="panel form">
            <h2>Appointment</h2>
            <Field
              label="Preferred date"
              name="date"
              help="All appointments are shown in Western Australian time (AWST)."
            >
              <input
                id="date"
                name="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </Field>
            {loading ? (
              <p role="status" className="progress-text">
                Checking availability…
              </p>
            ) : slots.length ? (
              <div className="slots" role="group" aria-label="Available appointment times">
                {slots.map((s) => (
                  <label key={s.start} className="slot">
                    <input
                      type="radio"
                      name="slotChoice"
                      value={s.start}
                      checked={slot === s.start}
                      onChange={() => setSlot(s.start)}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            ) : (
              <p className="small" role="status">
                {message}
              </p>
            )}
          </section>
        </div>
        <aside className="panel stack" style={{ alignSelf: 'start' }}>
          <p className="eyebrow">Booking summary</p>
          <h2>{service?.name || 'Your service'}</h2>
          <p>{property ? `${property.address}, ${property.suburb}` : 'Choose a property'}</p>
          {service && (
            <>
              <div className="definition">
                <span className="muted">Duration</span>
                <span>Approx. {service.duration_minutes} minutes</span>
                <span className="muted">Service price</span>
                <strong>
                  {money(service.price_ex_gst_cents)}
                  {service.price_ex_gst_cents !== null ? ' + GST' : ''}
                </strong>
              </div>
              <p className="small">
                Your selected appointment is checked again when you confirm. A slot is not reserved
                until the booking succeeds.
              </p>
            </>
          )}
          <Feedback value={result} />
          <button
            className="primary"
            disabled={busy || !slot || service?.booking_mode !== 'instant'}
          >
            {busy ? 'Confirming booking…' : 'Confirm booking'}
          </button>
          <Link className="small" to={`${d.workspace.href}/properties`}>
            Back to properties
          </Link>
        </aside>
      </Form>
    </>
  );
}
