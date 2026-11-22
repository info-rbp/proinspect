import { LegalAcceptance } from '../components/LegalAcceptance';
import { loadApi } from '../lib/api.server';
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
  type LoaderFunctionArgs,
} from 'react-router';
import { useWorkspace } from '../lib/workspace';
import { submitAction } from '../lib/actions.server';
import { PageHeading, Field, Feedback, EmptyState } from '../../../../packages/ui/components';
import { money } from '../../../../packages/domain/index';
import { orderBookingServices, inspectionIntakeKind, CASH_PAYMENT_TERM_LABELS, type CashPaymentTerm } from '../../../../packages/booking/inspection-checkout';
import { bookingCategoryForService, isBookingCategoryId, propertyBookingCategories, type BookingCategoryId } from '../../../../packages/service-catalogue/booking-navigation';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const propertyId = new URL(request.url).searchParams.get('property') ?? new URL(request.url).searchParams.get('propertyId');
  const selected = propertyId
    ? await loadApi(
        request,
        context,
        `/api/w/${params.kind}/${params.scopeId}/properties/${encodeURIComponent(propertyId)}`,
      )
    : null;
  const terms = ['landlord','property-manager','commercial','strata-manager'].includes(String(params.kind))
    ? await loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/cash-terms`)
    : null;
  return { requestKey: crypto.randomUUID(), selectedProperty: selected?.property ?? null,
    paymentTerms: (terms?.termCode ?? 'upon_booking') as CashPaymentTerm };
}
export async function action(args: ActionFunctionArgs) {
  const f = await args.request.formData();
  const text=(name:string)=>String(f.get(name)??'').trim();
  const optional=(name:string)=>text(name)||undefined;
  const quantity=(name:string)=>text(name)===''?undefined:Number(text(name));
  return submitAction(
    args,
    'bookings',
    {
      propertyId: f.get('propertyId'),
      legalConsent: f.get('legalConsent'),
      serviceId: f.get('serviceId'),
      startsAt: f.get('startsAt'),
      requestKey: f.get('requestKey'),
      intake: inspectionIntakeKind(String(f.get('serviceId') ?? '')) === 'general' ? undefined : {
        contactPhone: text('contactPhone'),
        reason: text('reason'),
        occupancyStatus: text('occupancyStatus'),
        accessContactName: optional('accessContactName'),
        accessContactPhone: optional('accessContactPhone'),
        petsAndSafety: optional('petsAndSafety'),
        siteNotes: optional('siteNotes'),
        bedrooms: quantity('bedrooms'),
        bathrooms: quantity('bathrooms'),
        furnished: optional('furnished'),
        tenancyCommencesOn: optional('tenancyCommencesOn'),
        vacateDate: optional('vacateDate'),
        keysReturned: optional('keysReturned'),
        originalPcrAvailable: optional('originalPcrAvailable'),
        areasOfConcern: optional('areasOfConcern'),
      },
      recurringPlanId: f.get('recurringPlanId') || undefined,
      planDue: f.get('planDue') || undefined,
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
  const { requestKey, selectedProperty, paymentTerms } = useLoaderData<typeof loader>();
  const properties =
    selectedProperty && !d.properties.some((p) => p.id === selectedProperty.id)
      ? [selectedProperty, ...d.properties]
      : d.properties;
  const result = useActionData<any>();
  const busy = useNavigation().state !== 'idle';
  // Server-rendered controls must not accept input before React can retain it.
  const [interactive, setInteractive] = useState(false);
  useEffect(() => { setInteractive(true); }, []);
  const [serviceId, setServiceId] = useState(requestedService || '');
  const [propertyId, setPropertyId] = useState(search.get('property') || properties[0]?.id || '');
  // The service ID is authoritative for deep links; category is only navigation.
  const requestedCategory = bookingCategoryForService(d.services.find(s => s.id === requestedService));
  const [categoryId, setCategoryId] = useState<BookingCategoryId | null>(
    requestedCategory ?? (isBookingCategoryId(search.get('category')) ? search.get('category') as BookingCategoryId : null),
  );
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Array<{ start: string; end: string; label: string }>>([]);
  const [slot, setSlot] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Select a date to see available appointments.');
  const [method, setMethod] = useState('owner');
  const property = properties.find((p) => p.id === propertyId);
  const availableCategories = propertyBookingCategories(d.services, property?.sector ?? 'residential');
  const visibleServices = availableCategories.find(category => category.id === categoryId)?.services ?? [];
  const service = d.services.find((s) => s.id === serviceId && s.active === 1 &&
    s.sectors.includes(property?.sector ?? 'residential'));
  const inspectionKind = inspectionIntakeKind(service?.id ?? '');
  const chooseCategory = (next: BookingCategoryId) => {
    setCategoryId(next);
    if (bookingCategoryForService(service) !== next) setServiceId('');
    setDate('');
    setSlot('');
  };
  const chooseProperty = (nextPropertyId: string) => {
    const nextProperty = properties.find(p => p.id === nextPropertyId);
    setPropertyId(nextPropertyId);
    if (service && nextProperty && !service.sectors.includes(nextProperty.sector)) {
      setServiceId('');
      setCategoryId(null);
    }
    setDate('');
    setSlot('');
  };
  const included = Boolean(service && d.subscriptionBookingServices?.[propertyId]?.includes(service.id));
  const directBooking = Boolean(service) && (included ||
    (service?.booking_mode === 'instant' && service.price_ex_gst_cents !== null));
  useEffect(() => {
    setSlot('');
    setSlots([]);
    if (!date || !service?.id || !propertyId) return;
    const abort = new AbortController();
    setLoading(true);
    fetch(
      `/api/w/${d.workspace.kind}/${d.workspace.scopeId}/availability?service=${encodeURIComponent(service.id)}&date=${date}&property=${encodeURIComponent(propertyId)}`,
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
  }, [date, service?.id, propertyId, d.workspace.kind, d.workspace.scopeId]);
  if (
    !['landlord', 'property-manager', 'commercial', 'strata-manager'].includes(d.workspace.kind) ||
    d.workspace.role === 'viewer'
  )
    return (
      <EmptyState
        title="Booking unavailable"
        description="Use an authorised management workspace to book a service."
      />
    );
  if (!properties.length)
    return (
      <>
        <PageHeading
          title="Start with your property."
          description="Add or link the property through your authorised workspace before booking."
        />
        <section className="panel">
          <EmptyState
            title="Your report needs a home"
            description="Bookings and reports are linked to your property, so you can find them again later."
          >
            <Link
              className="button"
              to={`${d.workspace.href}/${d.workspace.kind === 'strata-manager' ? 'schemes' : d.workspace.kind === 'landlord' ? 'properties' : 'portfolio'}${requestedService ? `?service=${requestedService}` : ''}`}
            >
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
          eyebrow={result.result.paymentRequired ? 'Payment required' : 'Booking confirmed'}
          title={result.result.paymentRequired ? 'Appointment recorded — payment required.' : 'Your service is booked.'}
          description={result.result.paymentRequired
            ? 'The appointment is reserved, but work cannot proceed until the payment has settled and is verified.'
            : 'Your booking and work order are now part of your property record.'}
        />
        <section className="panel form-width stack">
          <h2>{result.result.reference}</h2>
          <Feedback value={result} />
          {result.result.paymentRequired
            ? <>
                <p>Amount awaiting collection, including provisional GST: <strong>{money(result.result.totalCents)}</strong>.</p>
                <p>Checkout only opens when the approved Stripe, tax and legal release controls are enabled. No payment is taken by this page.</p>
                <Link className="button" to={d.workspace.href+'/finance?payment='+encodeURIComponent(result.result.paymentId)}>
                  Review payment and secure checkout
                </Link>
              </>
            : <>
                {result.result.invoiceAfterService && <p><strong>Approved invoice terms: {CASH_PAYMENT_TERM_LABELS[result.result.paymentTerms as CashPaymentTerm] ?? 'Invoice after service'}.</strong> Your service is booked. Invoicing follows completion.</p>}
                <p>Once your report is issued, it will appear under Documents &amp; reports in your account.</p>
              </>}
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
        eyebrow="Your property · ProInspect services"
        title="What would you like us to do?"
        description="Choose a service category for your property, then arrange your visit. Pricing, entitlement and appointment availability are confirmed before booking."
      />
      <div className="step-track">
        <strong>01 Property</strong>
        <span>→</span>
        <strong>02 Service category &amp; service</strong>
        <span>→</span>
        <strong>{inspectionKind === 'general' ? '03 Access' : '03 Inspection details'}</strong>
        <span>→</span>
        <strong>04 Appointment &amp; payment</strong>
      </div>
      <Form method="post" className="detail-grid" aria-busy={!interactive}>
        <input type="hidden" name="recurringPlanId" value={search.get('plan') || ''} />
        <input type="hidden" name="planDue" value={search.get('due') || ''} />
        <input type="hidden" name="requestKey" value={requestKey} />
        <input type="hidden" name="startsAt" value={slot} />
        <div className="stack">
          {!interactive && <p role="status">Preparing the booking form. JavaScript is required to check appointment availability and book a service.</p>}
          <section className="panel form">
            <h2>1. Choose your property</h2>
            <Field label="Property" name="propertyId">
              <select
                id="propertyId"
                name="propertyId"
                required
                disabled={!interactive}
                value={propertyId}
                onChange={(e) => chooseProperty(e.target.value)}
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.address}, {p.suburb}
                  </option>
                ))}
              </select>
            </Field>
          </section>
          <section className="panel form">
            <h2>2. What do you need?</h2>
            <p className="small">Select a category to see the services available for this property.</p>
            <div className="booking-category-grid" role="group" aria-label="Service categories">
              {availableCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={'booking-category-card' + (categoryId === category.id ? ' selected' : '')}
                  aria-pressed={categoryId === category.id}
                  disabled={!interactive}
                  onClick={() => chooseCategory(category.id)}
                >
                  <span className="booking-category-heading">{category.title}</span>
                  <span className="booking-category-description">{category.description}</span>
                  <span className="booking-category-count">{category.services.length} {category.services.length === 1 ? 'service' : 'services'}</span>
                </button>
              ))}
            </div>
            {categoryId && <Field label="Service" name="serviceId">
              <select
                id="serviceId"
                name="serviceId"
                required
                disabled={!interactive}
                value={service?.id ?? ''}
                onChange={(e) => { setServiceId(e.target.value); setDate(''); setSlot(''); }}
              >
                <option value="">Choose a service</option>
                {orderBookingServices(visibleServices).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>}
            {!categoryId && <p className="small" role="status">Choose one of the four service categories above to continue.</p>}
            {service && <p className="small">{service.summary}</p>}
            {included && (
              <div className="notice">
                Included in your active ProInspect subscription. No additional service charge
                applies to this booking.
              </div>
            )}
            {service?.booking_mode === 'request' && !included && (
              <div className="notice warning">
                This service requires a scope or price confirmation.{' '}
                <Link
                  to={
                    d.workspace.kind === 'strata-manager'
                      ? `${d.workspace.href}/schemes`
                      : `${d.workspace.href}/requests?property=${propertyId}&service=${serviceId}`
                  }
                >
                  Send a service request
                </Link>{' '}
                instead of reserving an appointment.
              </div>
            )}
          </section>
          {inspectionKind !== 'general' && <section className="panel form">
            <h2>Inspection details</h2>
            <p className="small">Tell our inspector what is needed. Existing property details are already linked to this booking.</p>
            <Field label="Contact phone" name="contactPhone">
              <input name="contactPhone" id="contactPhone" type="tel" autoComplete="tel" required maxLength={40} disabled={!interactive} placeholder="Mobile number for inspection coordination" />
            </Field>
            <Field label="Reason for inspection" name="reason">
              <select id="reason" name="reason" required disabled={!interactive} defaultValue="">
                <option value="">Choose a reason</option>
                {inspectionKind==='pcr' && <><option value="New tenancy">New tenancy commencing</option><option value="Incoming condition record">Incoming condition record</option></>}
                {inspectionKind==='exit' && <><option value="Tenancy ending">Tenancy ending</option><option value="Vacant possession inspection">Vacant possession inspection</option></>}
                {inspectionKind==='routine' && <><option value="Scheduled routine inspection">Scheduled routine inspection</option><option value="Property condition follow-up">Property condition follow-up</option></>}
                <option value="Other property inspection">Other inspection requirement</option>
              </select>
            </Field>
            <Field label="Current occupancy" name="occupancyStatus">
              <select id="occupancyStatus" name="occupancyStatus" required disabled={!interactive} defaultValue="unknown">
                <option value="unknown">To be confirmed</option>
                <option value="vacant">Vacant</option><option value="tenanted">Tenanted</option><option value="occupied_other">Otherwise occupied</option>
              </select>
            </Field>
            {inspectionKind==='pcr' && <div className="stack">
              <Field label="Tenancy commencement date (if known)" name="tenancyCommencesOn"><input id="tenancyCommencesOn" name="tenancyCommencesOn" type="date" disabled={!interactive}/></Field>
              <div className="grid-2">
                <Field label="Bedrooms" name="bedrooms"><input id="bedrooms" name="bedrooms" type="number" min="0" max="100" disabled={!interactive}/></Field>
                <Field label="Bathrooms" name="bathrooms"><input id="bathrooms" name="bathrooms" type="number" min="0" max="100" disabled={!interactive}/></Field>
              </div>
              <Field label="Furnishing" name="furnished"><select id="furnished" name="furnished" defaultValue="unknown" disabled={!interactive}><option value="unknown">Not confirmed</option><option value="yes">Furnished</option><option value="no">Unfurnished</option></select></Field>
            </div>}
            {inspectionKind==='exit' && <div className="stack">
              <Field label="Expected vacate date (if known)" name="vacateDate"><input id="vacateDate" name="vacateDate" type="date" disabled={!interactive}/></Field>
              <Field label="Have the keys been returned?" name="keysReturned"><select id="keysReturned" name="keysReturned" disabled={!interactive} defaultValue="unknown"><option value="unknown">Not confirmed</option><option value="yes">Yes</option><option value="no">No</option><option value="not_applicable">Not applicable</option></select></Field>
              <Field label="Original incoming PCR available?" name="originalPcrAvailable"><select id="originalPcrAvailable" name="originalPcrAvailable" disabled={!interactive} defaultValue="unknown"><option value="unknown">Not confirmed</option><option value="yes">Yes</option><option value="no">No</option></select></Field>
            </div>}
            <Field label="Specific areas or items to inspect (optional)" name="areasOfConcern">
              <textarea id="areasOfConcern" name="areasOfConcern" maxLength={1500} rows={3} disabled={!interactive} placeholder="Areas of concern, existing issues or comparison requirements"/>
            </Field>
            <Field label="Pets, hazards or safety requirements (optional)" name="petsAndSafety">
              <textarea id="petsAndSafety" name="petsAndSafety" maxLength={1000} rows={2} disabled={!interactive} placeholder="Pets, construction work, site hazards or other preparation notes"/>
            </Field>
          </section>}
          <section className="panel form">
            <h2>Access arrangements</h2>
            <Field label="How will access be provided?" name="accessMethod">
              <select
                id="accessMethod"
                name="accessMethod"
                disabled={!interactive}
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
            <div className="grid-2">
              <Field label="Access contact (optional)" name="accessContactName"><input id="accessContactName" name="accessContactName" maxLength={120} disabled={!interactive}/></Field>
              <Field label="Access contact phone (optional)" name="accessContactPhone"><input id="accessContactPhone" name="accessContactPhone" type="tel" maxLength={40} disabled={!interactive}/></Field>
            </div>
            <Field
              label="Access instructions"
              name="instructions"
              help="Confidential instructions are encrypted and are not included in confirmation emails."
            >
              <textarea
                id="instructions"
                name="instructions"
                disabled={!interactive}
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
            <Field label="Additional preparation details (optional)" name="siteNotes">
              <textarea id="siteNotes" name="siteNotes" maxLength={2000} rows={3} disabled={!interactive} placeholder="Any final information our staff should know before attending"/>
            </Field>
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
                disabled={!interactive}
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
                <span className="muted">{included ? 'Subscription coverage' : 'Service price'}</span>
                <strong>
                  {included
                    ? 'Included — no additional charge'
                    : money(service.price_ex_gst_cents)}
                  {!included && service.price_ex_gst_cents !== null ? ' + GST' : ''}
                </strong>
              </div>
              {!included && service.price_ex_gst_cents !== null && service.price_ex_gst_cents > 0 &&
                <p className="notice">
                  <strong>{CASH_PAYMENT_TERM_LABELS[paymentTerms]}</strong>.
                  {paymentTerms==='upon_booking'
                    ? ' This service requires a verified online payment. Checkout must be enabled before an upfront-paid booking can be confirmed.'
                    : ' Your approved account terms allow direct appointment booking. The invoice is prepared after the service.'}
                </p>}
              <p className="small">
                Your selected appointment is checked again when you confirm. A slot is not reserved
                until the booking succeeds.
              </p>
            </>
          )}
          <Feedback value={result} />
          <button
            className="primary"
            disabled={!interactive || busy || !slot || !directBooking || !categoryId}
          >
            {busy ? 'Confirming booking…' : 'Confirm booking'}
          </button>
          <Link
            className="small"
            to={`${d.workspace.href}/${d.workspace.kind === 'strata-manager' ? 'schemes' : d.workspace.kind === 'landlord' ? 'properties' : 'portfolio'}${requestedService ? `?service=${requestedService}` : ''}`}
          >
            Back to properties
          </Link>
        </aside>
      <LegalAcceptance purpose="booking"/></Form>
    </>
  );
}
