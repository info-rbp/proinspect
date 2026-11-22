import { loadApi, callApi } from '../lib/api.server';
import { platformEnv } from '../../../../packages/database/context';
import { Form, Link, useLoaderData, useActionData, useNavigation, data, type LoaderFunctionArgs, type ActionFunctionArgs } from 'react-router';
import { useWorkspace } from '../lib/workspace';
import { PageHeading, Badge, EmptyState, Feedback } from '../../../../packages/ui/components';
import { displayDate } from '../../../../packages/domain/index';
import { propertyBookingCategories } from '../../../../packages/service-catalogue/booking-navigation';
import { ResidentialPropertyDashboard } from '../components/ResidentialPropertyDashboard';
import type { ResidentialSetup } from '../components/ResidentialPropertyWizard';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const d = (await loadApi(
    request,
    context,
    `/api/w/${params.kind}/${params.scopeId}/properties/${params.propertyId}`,
  )) as { property: any };
  const env = platformEnv(context);
  let management: Record<string,any>|null=null;
  if(params.kind==='staff'){
    const response=await callApi(request,context,
      '/api/w/staff/operations/properties/'+encodeURIComponent(params.propertyId??'')+'/manage');
    if(response.ok)management=await response.json() as Record<string,any>;
    else if(response.status!==403)throw response;
  }
  const setup = params.kind === 'landlord' && params.propertyId
    ? await loadApi(request,context,
      `/api/w/${params.kind}/${params.scopeId}/properties/${params.propertyId}/setup`) as ResidentialSetup
    : null;
  return { ...d, setup, management, stripeSubscriptionsEnabled: params.kind === 'landlord' || (env.APP_ENV === 'staging' && env.STRIPE_BILLING_ENABLED === 'true' && env.STRIPE_TAX_READY === 'true') };
}
export async function action({request,context,params}:ActionFunctionArgs){
  const f=await request.formData();
  if(params.kind==='landlord'&&f.get('intent')==='save-setup'){
    try {
      const response=await callApi(request,context,
        `/api/w/${params.kind}/${params.scopeId}/properties/${params.propertyId}/setup`,{
          method:'POST',body:{expectedVersion:Number(f.get('expectedVersion')??0),
            profile:JSON.parse(String(f.get('profile'))),
            tenancy:JSON.parse(String(f.get('tenancy'))),
            notes:String(f.get('notes')??'')},
        });
      const result=await response.json() as Record<string,any>;
      if(!response.ok)return data({error:result.message??'Unable to update the property.',fields:result.fields},{status:response.status});
      return data({ok:true,message:'Property details saved. Previous tenancy information remains in the property history.'});
    } catch {return data({error:'Check the property details and try again.'},{status:422});}
  }
  if(params.kind!=='staff')return data({error:'Staff administration only.'},{status:403});
  if(f.get('intent')!=='edit-property')return data({error:'Unknown property action.'},{status:422});
  const payload={address:String(f.get('address')??''),suburb:String(f.get('suburb')??''),
    postcode:String(f.get('postcode')??''),propertyType:String(f.get('propertyType')??''),
    sourceReference:String(f.get('sourceReference')??''),
    original:{address:String(f.get('originalAddress')??''),suburb:String(f.get('originalSuburb')??''),
      postcode:String(f.get('originalPostcode')??''),propertyType:String(f.get('originalPropertyType')??'')}};
  const response=await callApi(request,context,
    '/api/w/staff/operations/properties/'+encodeURIComponent(params.propertyId??'')+'/manage',
    {method:'POST',body:payload});
  const result=await response.json() as Record<string,any>;
  if(!response.ok)return data({error:result.message,fields:result.fields},{status:response.status});
  return data({ok:true,message:'Canonical property details updated. Ownership, tenancy and leasing authority records were not altered.'});
}
export default function Property() {
  const d = useWorkspace();
  const { property: p, stripeSubscriptionsEnabled, management, setup } = useLoaderData<typeof loader>();
  const result=useActionData<typeof action>();
  const busy=useNavigation().state!=='idle';
  const staff=d.workspace.kind==='staff'&&Boolean(management);
  const canEdit=staff&&management?.canEdit===true;
  if (!p)
    return (
      <EmptyState
        title="Property unavailable"
        description="This property is not available in your current workspace."
      />
    );
  if(d.workspace.kind==='landlord' && p.sector==='residential')
    return <ResidentialPropertyDashboard data={d} property={p}
      setup={setup} busy={busy} result={result??undefined}/>;
  const bookings = d.bookings.filter((b) => b.property_id === p.id);
  const documents = d.documents.filter((doc) => doc.property_id === p.id);
  const requests = d.requests.filter((r) => r.property_id === p.id);
  const bookingCategories = propertyBookingCategories(d.services, p.sector);
  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to={`${d.workspace.href}/properties`}>Properties</Link>
        <span>/</span>
        <span>{p.address}</span>
      </nav>
      <PageHeading
        eyebrow={`${p.suburb} · ${p.state} ${p.postcode}`}
        title={p.address}
        description={`${p.property_type} · ${p.sector === 'residential' ? 'Residential property' : p.sector}`}
      >
        {['landlord', 'property-manager', 'commercial', 'strata-manager'].includes(
          d.workspace.kind,
        ) &&
          d.workspace.role !== 'viewer' && (
            <Link className="button" to={`${d.workspace.href}/book?property=${p.id}`}>
              Book a service
            </Link>
          )}
      </PageHeading>
      <div className="stack">
        {['landlord','property-manager','commercial','strata-manager'].includes(d.workspace.kind) &&
          d.workspace.role !== 'viewer' && bookingCategories.length > 0 &&
          <section className="panel stack" aria-labelledby="property-services-heading">
            <div>
              <h2 id="property-services-heading">Arrange a property service</h2>
              <p className="small">Choose what you need for this property. We will show the relevant service options and booking requirements.</p>
            </div>
            <div className="booking-category-grid">
              {bookingCategories.map(category => (
                <Link key={category.id} className="booking-category-card"
                  to={`${d.workspace.href}/book?property=${encodeURIComponent(p.id)}&category=${category.id}`}>
                  <span className="booking-category-heading">{category.title}</span>
                  <span className="booking-category-description">{category.description}</span>
                  <span className="booking-category-count">{category.services.length} {category.services.length === 1 ? 'service' : 'services'} · Choose services →</span>
                </Link>
              ))}
            </div>
          </section>}
        {p.sector==='residential' &&
          ['landlord','property-manager'].includes(d.workspace.kind) &&
          d.workspace.role!=='viewer' &&
          <section className="panel stack" aria-labelledby="property-maintenance-heading">
            <div className="panel-header">
              <h2 id="property-maintenance-heading">Maintenance & Insurance</h2>
              <Link className="small" to={d.workspace.href+'/requests?property='+encodeURIComponent(p.id)}>All property requests →</Link>
            </div>
            <p className="small">Report an issue or insured event directly from this property.
              Maintenance, repairs, claims and completion evidence remain linked to the same property record.</p>
            <div className="grid-2">
              <Link className="booking-category-card" to={
                d.workspace.href+'/requests?property='+encodeURIComponent(p.id)+'&kind=maintenance'}>
                <strong className="booking-category-heading">Submit maintenance request</strong>
                <span className="booking-category-description">Describe the issue, priority, access and supporting information.</span>
              </Link>
              <Link className="booking-category-card" to={
                d.workspace.href+'/requests?property='+encodeURIComponent(p.id)+'&kind=insurance'}>
                <strong className="booking-category-heading">Submit insurance request</strong>
                <span className="booking-category-description">Report an event and initiate authorised claim coordination.</span>
              </Link>
            </div>
            <Link className="button secondary" to={
              d.workspace.href+'/requests?property='+encodeURIComponent(p.id)+'&service=urgent-maintenance-make-good'}>
              Request urgent maintenance / make-good
            </Link>
          </section>}
        {p.sector==='residential' && ['landlord','property-manager','staff'].includes(d.workspace.kind) &&
          (d.workspace.kind!=='staff' || ['administrator','operations_manager'].includes(d.user.staffRole??'')) &&
          <section className="panel stack">
            <h2>Co-living rooms & shared areas</h2>
            <p>For separately let rooms or beds, configure one residential property with private occupancies and common spaces. Every resident is invited to their own tenancy.</p>
            <Link className="button secondary" to={d.workspace.href+'/properties/'+encodeURIComponent(p.id)+'/co-living'}>Manage co-living</Link>
          </section>}
        {staff&&<section className="panel stack" id="staff-property-operations" aria-label="Staff property operations">
          <div className="panel-header"><h2>Manage property</h2></div>
          <p className="small">Canonical property records, leasing, tenancy, bookings and approvals remain separate authorised workflows.</p>
          <div className="actions">
            <Link className="button secondary" to={d.workspace.href+'/leasing?propertyId='+encodeURIComponent(p.id)}>Manage leasing & inspections</Link>
            <Link className="button secondary" to={d.workspace.href+'/tenancies?propertyId='+encodeURIComponent(p.id)}>Tenancies & forms</Link>
            <Link className="button secondary" to={d.workspace.href+'/bookings?propertyId='+encodeURIComponent(p.id)}>Bookings</Link>
            <Link className="button secondary" to={d.workspace.href+'/work-orders?propertyId='+encodeURIComponent(p.id)}>Work orders</Link>
            <Link className="button secondary" to={d.workspace.href+'/administration?propertyId='+encodeURIComponent(p.id)}>Verified client & management authority</Link>
            <Link className="button secondary" to={d.workspace.href+'/reports'}>Inspection reports</Link>
          </div>
          {management?.listings?.length>0&&<div className="stack">
            <h3>Leasing records for this property</h3>
            {management?.listings?.map((listing:any)=><div className="record-row" key={listing.id}>
              <div><strong>{listing.title}</strong><p className="small">{listing.kind} · {listing.status} · Applications: {listing.application_mode}</p></div>
              <div className="actions">
                <Link className="button secondary small" to={d.workspace.href+'/leasing?propertyId='+encodeURIComponent(p.id)}>Manage</Link>
                {listing.status==='published'&&<Link className="button secondary small" to={'/properties-for-lease/'+listing.kind+'/'+listing.slug}>Public listing</Link>}
                {listing.kind==='residential'&&<Link className="button secondary small" to={d.workspace.href+'/rental-applications?listingId='+encodeURIComponent(listing.id)}>Applications</Link>}
              </div>
            </div>)}
          </div>}
          <div className="grid-2">
            <div><h3>Recorded client relationships</h3>
              {management?.clientLinks?.length?management.clientLinks.map((l:any)=><p key={l.id}>
                <strong>{l.name}</strong> · {l.role} · {l.status}
                <span className="small"> · {l.ends_at?'Ended '+l.ends_at:'Recorded from '+l.starts_at}</span>
              </p>):<p>No recorded client-property authority. An administrator must verify documentary evidence before linking a client.</p>}
            </div>
            <div><h3>Management appointments</h3>
              {management?.managers?.length?management.managers.map((m:any)=><p key={m.id}>
                <strong>{m.manager_name}</strong> · {m.mode}
                <span className="small"> · {m.ends_at?'Ended '+m.ends_at:'Recorded from '+m.starts_at}</span>
              </p>):<p>No recorded management appointment.</p>}
            </div>
          </div>
          {management?.tenancies?.length>0&&<div><h3>Linked tenancies</h3>
            {management?.tenancies?.map((t:any)=><p key={t.id}>
              <Link to={d.workspace.href+'/tenancies/'+encodeURIComponent(t.id)}>{t.id}</Link>
              {' · '+t.status+' · '+t.starts_at}
            </p>)}</div>}
          {canEdit&&<details className="panel" id="edit-property">
            <summary style={{cursor:'pointer',fontWeight:700}}>Edit canonical property details</summary>
            <p className="small">Only the address, suburb, postcode and property type may be corrected here.
              Sector and client relationships require separate authority review.
              Public leasing advertisements retain approved snapshots and must be reviewed independently.</p>
            <Feedback value={result}/>
            <Form method="post" className="form">
              <input type="hidden" name="intent" value="edit-property"/>
              <input type="hidden" name="originalAddress" value={p.address}/>
              <input type="hidden" name="originalSuburb" value={p.suburb}/>
              <input type="hidden" name="originalPostcode" value={p.postcode}/>
              <input type="hidden" name="originalPropertyType" value={p.property_type}/>
              <label className="field">Street address including unit<input name="address" required minLength={5} maxLength={180} defaultValue={p.address}/></label>
              <div className="grid-2">
                <label className="field">Suburb<input name="suburb" required minLength={2} maxLength={80} defaultValue={p.suburb}/></label>
                <label className="field">WA postcode<input name="postcode" required pattern="[0-9]{4}" defaultValue={p.postcode}/></label>
              </div>
              <label className="field">Property type<select name="propertyType" defaultValue={p.property_type}>
                {[...new Set([p.property_type,...(p.sector==='residential'
                  ? ['House','Unit','Apartment','Townhouse','Villa','Duplex','Studio','Other']
                  : ['Office','Retail','Warehouse','Industrial','Mixed-use','Other'])])].map((t:string)=><option key={t} value={t}>{t}</option>)}
              </select></label>
              <label className="field">Change reason / evidence reference<input name="sourceReference" minLength={8} maxLength={300} required placeholder="Reason and independently reviewed source record"/></label>
              <button className="primary" type="submit" disabled={busy}>{busy?'Saving…':'Save property corrections'}</button>
            </Form>
          </details>}
          <details className="panel" id="property-audit">
            <summary style={{cursor:'pointer',fontWeight:700}}>Property change history</summary>
            {management?.history?.length?management.history.map((event:any)=><p key={event.id}>
              <strong>{event.action}</strong> · {event.created_at} · {event.actor_name??'System'}
            </p>):<p>No recorded canonical property edits yet.</p>}
          </details>
        </section>}
        {stripeSubscriptionsEnabled && ['landlord', 'commercial'].includes(d.workspace.kind) && ['owner', 'admin'].includes(d.workspace.role) && (p.sector === 'residential' || p.sector === 'commercial') && <Link className="button secondary" to={`${d.workspace.href}/stripe-subscribe/${p.id}`}>Subscription options (optional)</Link>}
        <Link to={`${d.workspace.href}/records/documents?property=${p.id}`}>
          Browse the full document history
        </Link>
        <div className="grid-2">
          <section className="panel">
            <div className="panel-header">
              <h2>Bookings & inspections</h2>
            </div>
            {bookings.length ? (
              bookings.map((b) => (
                <div className="record-row" key={b.id}>
                  <div>
                    <div className="record-title">{b.service_name}</div>
                    <p>{displayDate(b.starts_at)}</p>
                    <p>{b.reference}</p>
                  </div>
                  <Badge status={b.status} />
                </div>
              ))
            ) : (
              <EmptyState
                title="No bookings yet"
                description="Book a service and follow its progress from this property."
              />
            )}
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>Maintenance & requests</h2>
              <Link className="small" to={`${d.workspace.href}/requests?property=${p.id}`}>
                Open requests →
              </Link>
            </div>
            {requests.length ? (
              requests.map((r) => (
                <div className="record-row" key={r.id}>
                  <div>
                    <div className="record-title">{r.title}</div>
                    <p>{r.reference}</p>
                  </div>
                  <Badge status={r.status} />
                </div>
              ))
            ) : (
              <EmptyState
                title="No open matters"
                description="Requests linked to this property will be shown here."
              />
            )}
          </section>
        </div>
        <section className="panel">
          <div className="panel-header">
            <h2>Documents & reports</h2>
          </div>
          {documents.length ? (
            documents.map((doc) => (
              <div className="record-row" key={doc.id}>
                <div>
                  <div className="record-title">{doc.title}</div>
                  <p>
                    PDF · Version {doc.version} · {displayDate(doc.issued_at || doc.created_at)}
                  </p>
                </div>
                <a
                  className="button secondary"
                  href={`/api${d.workspace.href}/documents/${doc.id}/download`}
                >
                  Download
                </a>
              </div>
            ))
          ) : (
            <EmptyState
              title="Your property history is taking shape"
              description="Issued reports will remain linked to this property and your authorised account."
            />
          )}
        </section>
      </div>
    </>
  );
}