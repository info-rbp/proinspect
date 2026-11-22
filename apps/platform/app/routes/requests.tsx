import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { useState } from 'react';
import { RESIDENTIAL_REQUEST_ONLY, RESIDENTIAL_SERVICE_IDS } from '../../../../packages/service-catalogue/residential-workflows';
import { loadApi } from '../lib/api.server';
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
export async function loader({request,context,params}:LoaderFunctionArgs) {
  if(params.kind!=='tenant')return {coLiving:null};
  return {coLiving:await loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/my-room`)};
}
export async function action(args: ActionFunctionArgs) {
  const f = await args.request.formData();
  if (f.get('intent') === 'convert')
    return submitAction(
      args,
      `requests/${encodeURIComponent(String(f.get('requestId')))}/convert`,
      {},
      'Work order created.',
    );
  const text=(name:string)=>String(f.get(name)??'').trim();
  const optional=(name:string)=>text(name)||undefined;
  let serviceIntake:Record<string,unknown>|undefined;
  if(text('serviceCode')){
    try {
      const recipients=JSON.parse(text('recipients')||'[]');
      serviceIntake={
        serviceCode:text('serviceCode'),
        preferredDate:optional('preferredDate'),
        timeFrame:optional('timeFrame'),
        preferredTime:optional('preferredTime'),
        marketingRequested:f.get('marketingRequested')==='yes',
        tenantApplicationRequested:f.get('tenantApplicationRequested')==='yes',
        recipients,
        attendeeName:optional('attendeeName'),
        attendeeEmail:optional('attendeeEmail'),
        attendeePhone:optional('attendeePhone'),
        claimReference:optional('claimReference'),
        incidentDate:optional('incidentDate'),
        listingPlatforms:optional('listingPlatforms'),
        rentReviewInstructions:optional('rentReviewInstructions'),
      };
    } catch {
      return {error:'Check the recipient details before submitting this request.'};
    }
  }
  return submitAction(
    args,
    'requests',
    {
      serviceIntake,
      propertyId: f.get('propertyId') || undefined,
      spaceId: f.get('spaceId') || undefined,
      category: serviceIntake
        ? ['maintenance','urgent-maintenance-make-good'].includes(text('serviceCode'))
          ? 'maintenance' : 'other'
        : f.get('category'),
      title: f.get('title'),
      details: f.get('details'),
      priority: text('serviceCode')==='urgent-maintenance-make-good'
        ? 'urgent' : f.get('priority'),
    },
    'Your request has been received.',
  );
}
export default function Requests() {
  const d = useWorkspace();
  const {coLiving}=useLoaderData<typeof loader>();
  const mySpace=coLiving?.space as {id:string;label:string}|undefined;
  const sharedSpaces=(coLiving?.sharedAreas??[]) as {id:string;label:string}[];
  const w = d.workspace;
  const result = useActionData<any>();
  const [search] = useSearchParams();
  const initialService = search.get('service') || search.get('kind') || '';
  const initialCode = initialService &&
    (RESIDENTIAL_SERVICE_IDS.has(initialService) ||
    RESIDENTIAL_REQUEST_ONLY.some(item=>item.id===initialService)) ? initialService : '';
  const [serviceCode,setServiceCode] = useState(initialCode);
  const [preferredDate,setPreferredDate] = useState('');
  const [preferredTime,setPreferredTime] = useState('');
  const [timeFrame,setTimeFrame] = useState('afternoon');
  const [marketingRequested,setMarketingRequested] = useState(false);
  const [tenantApplicationRequested,setTenantApplicationRequested] = useState(false);
  const [recipients,setRecipients] = useState([{id:1,name:'',email:''}]);
  const [attendeeName,setAttendeeName] = useState('');
  const [attendeeEmail,setAttendeeEmail] = useState('');
  const [attendeePhone,setAttendeePhone] = useState('');
  const [incidentDate,setIncidentDate] = useState('');
  const [claimReference,setClaimReference] = useState('');
  const [listingPlatforms,setListingPlatforms] = useState('');
  const [rentReviewInstructions,setRentReviewInstructions] = useState('');
  const isStructured = Boolean(serviceCode) && w.kind!=='tenant';
  const serviceTitle = d.services.find(item=>item.id===serviceCode)?.name ??
    RESIDENTIAL_REQUEST_ONLY.find(item=>item.id===serviceCode)?.name;
  const selectedPropertyId=search.get('propertyId')||search.get('property');
  const scopedRequests=selectedPropertyId?d.requests.filter(r=>r.property_id===selectedPropertyId):d.requests;
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
        {selectedPropertyId&&<p><Link to={d.workspace.href+'/properties/'+encodeURIComponent(selectedPropertyId)}>Return to selected property</Link> · {scopedRequests.length} requests</p>}
        <section className="panel">
          <div className="panel-header">
            <h2>{w.kind === 'staff' ? 'Incoming requests' : 'Request history'}</h2>
          </div>
          {scopedRequests.length ? (
            scopedRequests.map((r) => (
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
              {isStructured&&<>
                <input type="hidden" name="serviceCode" value={serviceCode}/>
                <input type="hidden" name="recipients" value={JSON.stringify(recipients.map(
                  ({name,email})=>({name:name.trim(),email:email.trim()})).filter(r=>r.name||r.email))}/>
                <input type="hidden" name="preferredDate" value={preferredDate}/>
                <input type="hidden" name="preferredTime" value={preferredTime}/>
                <input type="hidden" name="timeFrame" value={
                  serviceCode==='open-home'?timeFrame:''}/>
                <input type="hidden" name="marketingRequested" value={marketingRequested?'yes':'no'}/>
                <input type="hidden" name="tenantApplicationRequested" value={tenantApplicationRequested?'yes':'no'}/>
                <input type="hidden" name="attendeeName" value={attendeeName}/>
                <input type="hidden" name="attendeeEmail" value={attendeeEmail}/>
                <input type="hidden" name="attendeePhone" value={attendeePhone}/>
                <input type="hidden" name="incidentDate" value={incidentDate}/>
                <input type="hidden" name="claimReference" value={claimReference}/>
                <input type="hidden" name="listingPlatforms" value={listingPlatforms}/>
                <input type="hidden" name="rentReviewInstructions" value={rentReviewInstructions}/>
              </>}
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
              {['landlord','property-manager'].includes(w.kind) && selectedPropertyId &&
                d.properties.some(p=>p.id===selectedPropertyId && p.sector==='residential') &&
                <section className="booking-request-kind" aria-label="Property service type">
                  <h3>Request type</h3>
                  <p className="small">Choose Maintenance, Insurance or another property service.
                    Requests are reviewed before any appointment or charge is confirmed.</p>
                  <select aria-label="Specific service" value={serviceCode}
                    onChange={e=>{setServiceCode(e.target.value);setPreferredDate('');
                      setPreferredTime('');setMarketingRequested(false);
                      setTenantApplicationRequested(false);}}>
                    <option value="">General property request</option>
                    {RESIDENTIAL_REQUEST_ONLY.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}
                    {d.services.filter(service=>service.sectors.includes('residential')&&
                      RESIDENTIAL_SERVICE_IDS.has(service.id)).map(service=>
                        <option key={service.id} value={service.id}>{service.name}</option>)}
                  </select>
                </section>}
              {isStructured&&
                <section className="booking-request-specific" aria-label="Service-specific information">
                  <h3>{serviceTitle??'Service request'} — details</h3>
                  {(serviceCode==='open-home'||serviceCode==='private-open-home'||
                    serviceCode==='video-walkthrough-property'||serviceCode==='tenant-move-in-handover')&&
                    <div className="stack">
                      <Field label={serviceCode==='open-home'?'Preferred Open Home date':'Preferred date'} name="request-preferred-date">
                        <input type="date" id="request-preferred-date" value={preferredDate}
                          onChange={e=>setPreferredDate(e.target.value)} required={
                            serviceCode==='open-home'||serviceCode==='private-open-home'}/>
                      </Field>
                      {serviceCode==='open-home'?
                        <Field label="Preferred time frame" name="request-time-frame">
                          <select id="request-time-frame" value={timeFrame} onChange={e=>setTimeFrame(e.target.value)}>
                            <option value="morning">Morning</option>
                            <option value="afternoon">Afternoon</option>
                            <option value="evening">Evening</option>
                          </select>
                        </Field>:
                        <Field label="Preferred appointment time (if known)" name="request-preferred-time">
                          <input id="request-preferred-time" type="time" value={preferredTime}
                            onChange={e=>setPreferredTime(e.target.value)}
                            required={serviceCode==='private-open-home'}/>
                        </Field>}
                    </div>}
                  {(serviceCode==='open-home'||serviceCode==='private-open-home')&&
                    <div className="stack">
                      <p className="notice">Regular Open Homes are grouped with other viewings and require at least 72 hours' notice. Your preferred window is a request, not a confirmed appointment.</p>
                      <label className="checkbox">
                        <input type="checkbox" checked={marketingRequested}
                          onChange={e=>setMarketingRequested(e.target.checked)}/>
                        <span>Request complimentary social media marketing with this Open Home. Publication requires separate content approval.</span>
                      </label>
                      <label className="checkbox">
                        <input type="checkbox" checked={tenantApplicationRequested}
                          onChange={e=>setTenantApplicationRequested(e.target.checked)}/>
                        <span>Request Tenant Application Handling (scope and fee to be separately confirmed). This will not initiate applicant assessments.</span>
                      </label>
                    </div>}
                  {serviceCode==='private-open-home' && <div className="stack">
                    <Field label="Attendee name" name="request-attendee-name">
                      <input id="request-attendee-name" value={attendeeName} maxLength={120}
                        onChange={e=>setAttendeeName(e.target.value)}/>
                    </Field>
                    <div className="grid-2">
                      <Field label="Attendee email (if known)" name="request-attendee-email">
                        <input id="request-attendee-email" type="email" maxLength={254}
                          value={attendeeEmail} onChange={e=>setAttendeeEmail(e.target.value)}/>
                      </Field>
                      <Field label="Attendee phone (if known)" name="request-attendee-phone">
                        <input id="request-attendee-phone" type="tel" maxLength={40}
                          value={attendeePhone} onChange={e=>setAttendeePhone(e.target.value)}/>
                      </Field>
                    </div>
                  </div>}
                  {serviceCode==='video-walkthrough-property'&&<div className="stack">
                    <p className="small">Who should receive the completed video? Recipients are stored privately and will be confirmed before any distribution.</p>
                    {recipients.map((entry,i)=><div key={entry.id} className="grid-2">
                      <Field label={'Recipient '+(i+1)+' name'} name={'recipient-name-'+entry.id}>
                        <input id={'recipient-name-'+entry.id} maxLength={120} required
                          value={entry.name} onChange={e=>setRecipients(list=>list.map(item=>
                            item.id===entry.id?{...item,name:e.target.value}:item))}/>
                      </Field>
                      <Field label={'Recipient '+(i+1)+' email'} name={'recipient-email-'+entry.id}>
                        <input id={'recipient-email-'+entry.id} type="email" maxLength={254} required
                          value={entry.email} onChange={e=>setRecipients(list=>list.map(item=>
                            item.id===entry.id?{...item,email:e.target.value}:item))}/>
                      </Field>
                    </div>)}
                    <button type="button" className="button secondary"
                      disabled={recipients.length>=10} onClick={()=>setRecipients(list=>[...list,{
                        id:Math.max(...list.map(x=>x.id))+1,name:'',email:''}])}>Add recipient</button>
                  </div>}
                  {serviceCode==='insurance'&&<div className="grid-2">
                    <Field label="Incident date (if known)" name="request-incident-date">
                      <input id="request-incident-date" type="date" value={incidentDate}
                        onChange={e=>setIncidentDate(e.target.value)}/>
                    </Field>
                    <Field label="Claim reference (if known)" name="request-claim-reference">
                      <input id="request-claim-reference" value={claimReference} maxLength={150}
                        onChange={e=>setClaimReference(e.target.value)}/>
                    </Field>
                  </div>}
                  {serviceCode==='real-estate-platform-marketing'&&
                    <Field label="Requested advertising platforms" name="request-platforms">
                      <input id="request-platforms" value={listingPlatforms}
                        onChange={e=>setListingPlatforms(e.target.value)} maxLength={300}
                        placeholder="e.g. approved real estate listing platforms"/>
                    </Field>}
                  {serviceCode==='rent-review-renewal'&&
                    <Field label="Authorised rent review or renewal instructions" name="request-rent-review">
                      <textarea id="request-rent-review" rows={3} maxLength={1000}
                        value={rentReviewInstructions}
                        onChange={e=>setRentReviewInstructions(e.target.value)}
                        placeholder="Describe the landlord's proposed action and timing."/>
                    </Field>}
                  {(serviceCode==='maintenance'||serviceCode==='insurance'||serviceCode==='urgent-maintenance-make-good')&&
                    <p className="small">Explain the issue or insured event below. The request is linked to the selected property and will be assessed for urgency, authorisation and appropriate follow-up.</p>}
                  {serviceCode==='urgent-maintenance-make-good'&&<p className="notice warning">
                    Urgent requests are triaged before attendance and do not guarantee a 24-hour visit. For immediate danger, use the appropriate emergency response service.
                  </p>}
                </section>}
              {w.kind==='tenant'&&mySpace&&<Field label="Location in your co-living property" name="spaceId"
                help="Your private room or an authorised shared area; other residents' rooms are not listed.">
                <select name="spaceId" id="spaceId" defaultValue="">
                  <option value="">General property issue</option>
                  <option value={mySpace.id}>My {mySpace.label}</option>
                  {sharedSpaces.map(s=><option value={s.id} key={s.id}>{s.label} (shared area)</option>)}
                </select>
              </Field>}
              <div className="grid-2">
                <Field label="Request type" name="category">
                  <select id="category" name="category" disabled={isStructured}>
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
                  key={serviceCode} defaultValue={serviceTitle??''}
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
                {busy ? 'Submitting…' : serviceCode==='open-home' ? 'Request Open Home scheduling'
                  : isStructured ? 'Submit service request' : 'Submit request'}
              </button>
            </Form>
          </section>
        )}
      </div>
    </>
  );
}
