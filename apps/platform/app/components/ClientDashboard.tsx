import { RETIRED_WORKSPACES } from '../../../../packages/domain/residential-policy';
import { Link } from 'react-router';
import type { WorkspaceData } from '../lib/workspace';
import { PageHeading, Metric, Badge } from '../../../../packages/ui/components';
import { displayDate } from '../../../../packages/domain/index';
export function ClientDashboard({data}:{data:WorkspaceData}){
 const w=data.workspace,base=w.href;
 if(RETIRED_WORKSPACES.has(w.kind))return <section className="panel stack"><h1>Historical account records</h1><p>New services for this account type are retired. Your existing permissions continue to control access to retained records.</p><Link to={base+'/documents'}>Documents</Link><Link to={base+'/billing'}>Billing history</Link></section>;
 const openRequests=data.requests.filter(r=>!['closed','completed','cancelled'].includes(String(r.status)));
 const activeWork=data.workOrders.filter(r=>!['completed','cancelled'].includes(String(r.status)));
 const upcoming=data.bookings.filter(b=>b.status==='confirmed'&&b.starts_at>new Date().toISOString()).sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at)));
 const pending=data.approvals.filter(a=>a.status==='pending');
 return <div className="stack">
  <PageHeading eyebrow="Residential" title={w.kind==='property-manager'?'Your managed portfolio':'Your property overview'} description={w.name+' — property activity, decisions and next steps.'}>
   <Link className="button" to={base+'/book'}>Book a service</Link>
  </PageHeading>
  <div className="grid-4 portal-summary">
   <Metric label="Properties" value={data.properties.length} detail="Your authorised properties"/>
   <Metric label="Active work" value={activeWork.length} detail="In progress with ProInspect"/>
   <Metric label="Upcoming visits" value={upcoming.length} detail="Confirmed future appointments"/>
   <Metric label="Open requests" value={openRequests.length} detail="Follow requests and next steps"/>
  </div>
  <section className="panel stack"><h2>Needs your attention</h2>
    {pending.length ? <p>{pending.length} pending decisions. <Link to={base+'/finance'}>Review quotes and approvals</Link></p> : <p>No pending approvals in your current account view.</p>}
    {activeWork.filter(o=>o.status==='awaiting_approval').slice(0,5).map(o=><p key={o.id}><Link to={base+'/work-orders/'+encodeURIComponent(o.id)}>{o.title}</Link> — awaiting an authorised decision</p>)}
  </section>
  <section className="panel stack"><h2>Your properties</h2><p>Open a property to arrange work and review its tenancy, requests and issued reports. Adding a property is free and does not start a subscription.</p>
    <div className="client-dashboard-grid">{data.properties.map(property=><article className="panel" key={property.id}>
      <h3><Link to={base+'/properties/'+encodeURIComponent(property.id)}>{property.address}</Link></h3><p>{property.suburb} {property.postcode}</p>
      <p>{activeWork.filter(o=>o.property_id===property.id).length} active jobs · {openRequests.filter(r=>r.property_id===property.id).length} open requests</p>
      {property.sector==='residential'?<><Link to={base+'/book?propertyId='+encodeURIComponent(property.id)}>Book for this property</Link> · <Link to={base+'/tenancies?propertyId='+encodeURIComponent(property.id)}>Tenancy</Link></>:<p>Historical property record. New services are retired.</p>}
    </article>)}</div>
    {!data.properties.length&&<p>Add your first property, or complete your agency authority review to see your assigned portfolio.</p>}
    <Link to={base+'/properties'}>Manage properties</Link>
  </section>
  <section className="panel stack"><h2>Next appointments</h2>{upcoming.slice(0,5).map(b=><div key={b.id}><strong>{b.service_name} — {b.address}</strong><p>{displayDate(b.starts_at)} · <Badge status={b.status}/></p><Link to={base+'/booking-changes?booking='+encodeURIComponent(b.id)}>Change or cancel visit</Link></div>)}{!upcoming.length&&<p>No upcoming confirmed visits. <Link to={base+'/bookings'}>View booking history</Link>.</p>}</section>
  <div className="client-dashboard-grid">
   <section className="panel"><h2>Service progress</h2><p>Follow scheduled work through inspection, review and issue. Draft reports remain private until approved and shared.</p><Link to={base+'/work-orders'}>View active work</Link> · <Link to={base+'/reports'}>Issued reports</Link></section>
   <section className="panel"><h2>Maintenance and tenant requests</h2><p>Review requests and coordinate approved work. Quotes and additional expenditure need authorisation.</p><Link to={base+'/requests'}>View requests</Link></section>
   {['owner','admin'].includes(w.role)&&<section className="panel"><h2>Property plans and invoices</h2><p>Residential All Inclusive: AUD $50 + GST per week per property. Your agreed scope and paid coverage determine available inclusions.</p><Link to={base+'/billing'}>Manage billing</Link></section>}
  </div>
 </div>;
}
