import { Link } from 'react-router';
import type { WorkspaceData } from '../lib/workspace';
import { PageHeading, Metric } from '../../../../packages/ui/components';
import { resolveClientAreas } from '../../../../packages/domain/client-navigation';
export function ClientDashboard({data}:{data:WorkspaceData}){
 const w=data.workspace,base=w.href;
 const areas=resolveClientAreas(w,data.properties,data.schemes,data.serviceInterests?.areas??[],data.services);
 const openRequests=data.requests.filter(r=>!['closed','completed','cancelled'].includes(String(r.status))).length;
 return <div className="stack">
  <PageHeading eyebrow="Client Portal" title={w.kind==='property-manager'?'Managed portfolio':w.kind==='strata-manager'?'Schemes overview':w.kind==='commercial'?'Commercial portfolio':'Property overview'} description={w.name+' — view your authorised properties, services and account activity.'}>
   <Link className="button" to={base+'/account-services'}>Manage account &amp; services</Link>
  </PageHeading>
  <div className="grid-4 portal-summary">
   <Metric label="Properties" value={data.properties.length} detail="Your authorised properties"/>
   <Metric label="Schemes" value={data.schemes.length} detail="Your authorised schemes"/>
   <Metric label="Bookings" value={data.bookings.length} detail="Within your account"/>
   <Metric label="Open requests" value={openRequests} detail="Requires follow-up"/>
  </div>
  <section className="panel stack"><h2>Your service areas</h2><p>Areas are selected during onboarding or in account settings. Access still requires verified property authority and approved services.</p>
    <div className="client-dashboard-grid">{areas.map(area=><article className="panel" key={area.area}>
      <h3>{area.label}</h3><p>{area.description}</p>
      {area.href?<Link to={area.href}>Open {area.label}</Link>:<span className="small">{area.status==='planned'?'In development':'Complete account setup to use this area'}</span>}
    </article>)}</div>
    {!areas.length&&<p>No service areas configured. <Link to={base+'/account-services'}>Manage your services</Link>.</p>}
  </section>
  <div className="client-dashboard-grid">
   <section className="panel"><h2>Properties &amp; portfolios</h2><p>Manage the properties and relationships assigned to your account.</p><Link to={base+(w.kind==='strata-manager'?'/schemes':'/properties')}>View properties</Link></section>
   <section className="panel"><h2>Work &amp; reports</h2><p>Follow existing bookings, requests and issued records.</p><Link to={base+'/bookings'}>View bookings</Link> · <Link to={base+'/reports'}>View reports</Link></section>
   {['owner','admin'].includes(w.role)&&<section className="panel"><h2>Billing &amp; subscriptions</h2><p>Review authorised account finance and approved subscription options.</p><Link to={base+'/billing'}>Manage billing</Link></section>}
  </div>
 </div>;
}
