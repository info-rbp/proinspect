import { Link } from 'react-router';
import type { WorkspaceData, RecordRow } from '../lib/workspace';
import type { Property } from '../../../../packages/domain/index';
import { displayDate } from '../../../../packages/domain/index';
import { Badge, EmptyState, Metric, Feedback } from '../../../../packages/ui/components';
import { ResidentialPropertyWizard, type ResidentialSetup } from './ResidentialPropertyWizard';
import { propertyBookingCategories } from '../../../../packages/service-catalogue/booking-navigation';

const pending = (status: string) =>
  !['completed','cancelled','closed','ended','issued','rejected'].includes(status);
const label = (value: string) =>
  ({tenanted:'Currently tenanted',upcoming:'New tenancy arranged',vacant:'Vacant',
    unknown:'Not yet confirmed',fixed:'Fixed term',periodic:'Periodic'} as Record<string,string>)[value]??value;
const localDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat('en-AU',{dateStyle:'medium',timeZone:'Australia/Perth'})
    .format(new Date(value+'T12:00:00Z')) : 'Not yet confirmed';

function BookingEntries({records}: {records: RecordRow[]}) {
  return records.length?<div className="record-list">
    {records.map(b=><div className="record-row" key={b.id}>
      <div>
        <div className="record-title">{b.service_name??'Property service'}</div>
        <p>{b.starts_at?displayDate(b.starts_at):'Appointment pending'} · {b.reference}</p>
      </div>
      <Badge status={b.status}/>
    </div>)}
  </div>:<EmptyState title="No bookings here yet" description="Confirmed bookings and completed visits will appear here."/>;
}
export function ResidentialPropertyDashboard({data,property,setup,busy,result}:{
  data: WorkspaceData; property: Property; setup: ResidentialSetup|null;
  busy: boolean; result?:{error?:string;message?:string;fields?:Record<string,string[]>};
}) {
  const p=property,w=data.workspace,base=w.href;
  const bookings=data.bookings.filter(b=>b.property_id===p.id)
    .sort((a,b)=>String(b.starts_at).localeCompare(String(a.starts_at)));
  const now=new Date().toISOString();
  const upcoming=bookings.filter(b=>b.status==='confirmed'&&b.starts_at>=now)
    .sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at)));
  const history=bookings.filter(b=>b.status!=='confirmed'||b.starts_at<now);
  const requests=data.requests.filter(r=>r.property_id===p.id)
    .sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));
  const jobs=data.workOrders.filter(o=>o.property_id===p.id)
    .sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));
  const documents=data.documents.filter(d=>d.property_id===p.id)
    .sort((a,b)=>String(b.issued_at??b.created_at).localeCompare(String(a.issued_at??a.created_at)));
  const reported=documents.filter(d=>d.status==='issued');
  const canonicalTenancies=data.tenancies.filter(t=>t.property_id===p.id)
    .sort((a,b)=>String(b.starts_at).localeCompare(String(a.starts_at)));
  const profile=setup?.profile,tenancy=setup?.tenancy;
  const bookingsUrl=base+'/records/bookings?property='+encodeURIComponent(p.id);
  const docsUrl=base+'/records/documents?property='+encodeURIComponent(p.id);
  const worksUrl=base+'/records/work-orders?property='+encodeURIComponent(p.id);
  const requestsUrl=base+'/requests?property='+encodeURIComponent(p.id);
  const canBook=['owner','admin'].includes(w.role);
  const bookingCategories=propertyBookingCategories(data.services,p.sector);
  return <div className="stack residential-property-dashboard">
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link to={base+'/properties'}>My properties</Link><span>/</span><span>{p.address}</span>
    </nav>
    <header className="page-heading">
      <div><p className="eyebrow">YOUR PROPERTY · {p.suburb.toUpperCase()} WA {p.postcode}</p>
        <h1>{p.address}</h1>
        <p>{p.property_type} · Residential property</p>
      </div>
      <div className="actions">
        {canBook&&<Link className="button" to={base+'/book?property='+encodeURIComponent(p.id)}>
          Book a service</Link>}
        <Link className="button secondary" to={bookingsUrl}>Booking history</Link>
      </div>
    </header>
    {canBook&&bookingCategories.length>0&&<section className="panel stack" aria-labelledby="property-services-heading">
      <h2 id="property-services-heading">Arrange a property service</h2>
      <div className="booking-category-grid">{bookingCategories.map(category=><Link key={category.id}
        className="booking-category-card" to={base+'/book?property='+encodeURIComponent(p.id)+'&category='+category.id}>
        <span className="booking-category-heading">{category.title}</span>
        <span className="booking-category-description">{category.description}</span>
        <span className="booking-category-count">{category.services.length} services · Choose services →</span>
      </Link>)}</div>
    </section>}
    {canBook&&<section className="panel stack" aria-labelledby="property-maintenance-heading">
      <div className="panel-header"><h2 id="property-maintenance-heading">Maintenance &amp; Insurance</h2>
        <Link className="small" to={base+'/requests?property='+encodeURIComponent(p.id)}>All property requests →</Link>
      </div>
      <p>Report an issue or insured event directly from this property. Maintenance, repairs, claims and completion evidence remain linked to the same property record.</p>
      <div className="grid-2">
        <Link className="booking-category-card" to={base+'/requests?property='+encodeURIComponent(p.id)+'&kind=maintenance'}>
          <strong className="booking-category-heading">Submit maintenance request</strong>
          <span className="booking-category-description">Describe the issue, priority, access and supporting information.</span>
        </Link>
        <Link className="booking-category-card" to={base+'/requests?property='+encodeURIComponent(p.id)+'&kind=insurance'}>
          <strong className="booking-category-heading">Submit insurance request</strong>
          <span className="booking-category-description">Report an event and initiate authorised claim coordination.</span>
        </Link>
      </div>
      <Link className="button secondary" to={base+'/requests?property='+encodeURIComponent(p.id)+'&service=urgent-maintenance-make-good'}>
        Request urgent maintenance / make-good
      </Link>
    </section>}
    <section className="panel stack">
      <h2>Co-living rooms &amp; shared areas</h2>
      <p>Configure an authorised residential property with private occupancies and shared spaces.</p>
      <Link className="button secondary" to={base+'/properties/'+encodeURIComponent(p.id)+'/co-living'}>Manage co-living</Link>
    </section>
    <section className="grid-4 portal-summary" aria-label="Property activity summary">
      <Metric label="Upcoming visits" value={upcoming.length} detail="Confirmed appointments"/>
      <Metric label="Past bookings" value={history.length} detail="Recent activity shown below"/>
      <Metric label="Open requests" value={requests.filter(r=>pending(r.status)).length} detail="Property matters"/>
      <Metric label="Issued documents" value={reported.length} detail="Reports and records"/>
    </section>
    <div className="grid-2 property-overview-grid">
      <section className="panel stack" aria-labelledby="profile-heading">
        <div className="panel-header"><h2 id="profile-heading">Property details</h2>
          {setup?.canEdit&&<a href="#update-property-details" className="small">Update details</a>}</div>
        <p><strong>{p.address}</strong><br/>{p.suburb} WA {p.postcode} · {p.property_type}</p>
        {profile?<div className="property-fact-grid">
          {[['Bedrooms',profile.bedrooms],['Bathrooms',profile.bathrooms],
            ['En-suites',profile.ensuites],['Separate toilets',profile.separateToilets],
            ['Car spaces',profile.carSpaces],['Furnishing',profile.furnishing.replaceAll('_',' ')]]
            .map(([name,value])=><div key={name} className="property-fact">
              <span>{name}</span><strong>{value}</strong>
            </div>)}
        </div>:<p className="small">Room, bathroom and parking details have not been provided yet. Add them once to reuse them for future inspections.</p>}
        {profile?.notes&&<div className="property-private-note"><h3>Additional property notes</h3>
          <p className="property-note-text">{profile.notes}</p></div>}
      </section>
      <section className="panel stack" aria-labelledby="tenancy-heading">
        <div className="panel-header"><h2 id="tenancy-heading">Tenancy information</h2>
          {setup?.canEdit&&<a href="#update-property-details" className="small">Update</a>}</div>
        {tenancy ? <>
          <p><strong>{label(tenancy.occupancyStatus)}</strong>
            {tenancy.leaseType&&<span> · {label(tenancy.leaseType)}</span>}</p>
          {(tenancy.startsOn||tenancy.endsOn)&&<p className="small">
            {localDate(tenancy.startsOn)}{tenancy.endsOn?' – '+localDate(tenancy.endsOn):''}</p>}
          {tenancy.tenants.length>0&&<div className="record-list">
            {tenancy.tenants.map((t,i)=><div className="record-row" key={i}>
              <div><strong>{t.name}</strong>
                {t.email&&<p className="small">{t.email}</p>}
                {t.phone&&<p className="small">{t.phone}</p>}</div>
            </div>)}
          </div>}
          <p className="small">These details were supplied by the owner. They do not create a verified tenancy, send a notice or give anyone portal access.</p>
        </> : <p className="small">No private tenancy details are available in this account view.</p>}
        {canonicalTenancies.length>0&&<div className="stack">
          <h3>Verified tenancy records</h3>
          {canonicalTenancies.slice(0,5).map(t=><div className="record-row" key={t.id}>
            <div><strong>Tenancy record</strong><p className="small">
              {t.starts_at?displayDate(t.starts_at):''}</p></div>
            <Badge status={t.status}/>
          </div>)}
        </div>}
        <Link className="small" to={base+'/tenancies?propertyId='+encodeURIComponent(p.id)}>
          View tenancy history and invitations →</Link>
      </section>
    </div>
    <div className="grid-2">
      <section className="panel">
        <div className="panel-header"><h2>Upcoming bookings</h2>
          <Link className="small" to={bookingsUrl}>All bookings →</Link></div>
        <BookingEntries records={upcoming.slice(0,5)}/>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Past bookings & inspections</h2>
          <Link className="small" to={bookingsUrl}>Full history →</Link></div>
        <BookingEntries records={history.slice(0,8)}/>
      </section>
    </div>
    <div className="grid-2">
      <section className="panel">
        <div className="panel-header"><h2>Maintenance & requests</h2>
          <Link className="small" to={requestsUrl}>View requests →</Link></div>
        {requests.length?requests.slice(0,5).map(r=><div className="record-row" key={r.id}>
          <div><strong>{r.title}</strong><p className="small">{r.reference}</p></div>
          <Badge status={r.status}/>
        </div>):<EmptyState title="No requests recorded" description="Requests linked to this property will appear here."/>}
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Services & work orders</h2>
          <Link className="small" to={worksUrl}>Work history →</Link></div>
        {jobs.length?jobs.slice(0,5).map(o=><div className="record-row" key={o.id}>
          <div><strong>{o.title??'Work order'}</strong><p className="small">{o.reference}</p></div>
          <Badge status={o.status}/>
        </div>):<EmptyState title="No work orders" description="Inspections and approved works will be linked to this property."/>}
      </section>
    </div>
    <section className="panel">
      <div className="panel-header"><h2>Reports & property documents</h2>
        <Link className="small" to={docsUrl}>Full document history →</Link></div>
      {documents.length ? documents.slice(0,8).map(doc=><div className="record-row" key={doc.id}>
        <div><strong>{doc.title}</strong>
          <p className="small">{doc.status==='issued'?'Issued':'Record'} · {doc.issued_at?displayDate(doc.issued_at):doc.created_at?displayDate(doc.created_at):'Date pending'}</p>
        </div>
        {doc.status==='issued'&&<a className="button secondary small"
          href={'/api'+base+'/documents/'+encodeURIComponent(doc.id)+'/download'}>Download</a>}
      </div>):<EmptyState title="No issued documents yet" description="Reports and documents issued to your account will be associated with this property."/>}
    </section>
    {setup?.canEdit&&<section className="panel stack" id="update-property-details">
      <h2>Update property and tenancy details</h2>
      <p className="small">Changes to tenancy information are stored as a new history entry, keeping prior records intact. No invitations are sent.</p>
      <Feedback value={result}/>
      <details>
        <summary className="property-setup-edit-summary">Edit property profile and tenancy details</summary>
        <ResidentialPropertyWizard key={p.id+':'+String(profile?.version??0)}
          mode="edit" busy={busy} setup={setup} address={p.address}
          suburb={p.suburb} postcode={p.postcode} propertyType={p.property_type}/>
      </details>
    </section>}
    <p className="small">The latest records appear here. Use the full histories for older bookings, requests, Work Orders and documents.</p>
  </div>;
}
