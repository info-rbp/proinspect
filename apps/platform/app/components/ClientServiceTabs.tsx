import { Link } from 'react-router';
import { resolveClientAreas } from '../../../../packages/domain/client-navigation';
import type { WorkspaceData } from '../lib/workspace';
export function ClientServiceTabs({data}:{data:WorkspaceData}){
 const w=data.workspace;
 if(!['landlord','property-manager','commercial','strata-manager'].includes(w.kind))return null;
 const areas=resolveClientAreas(w,data.properties,data.schemes,data.serviceInterests?.areas??[],data.services);
 return <nav className="client-service-tabs" aria-label="Client Portal service areas">
  <Link to={w.href} className="client-service-tab">Dashboard</Link>
  {areas.map(item=>item.href?
   <Link key={item.area} className="client-service-tab" to={item.href}>{item.label}</Link>:
   <span key={item.area} className="client-service-tab is-unavailable" title={item.description} aria-disabled="true">{item.label} <small>{item.status==='planned'?'Planned':'Set up'}</small></span>)}
  {['owner','admin'].includes(w.role)&&<Link className="client-service-tab" to={w.href+'/billing'}>Billing</Link>}
  <Link className="client-service-tab" to={w.href+'/account-services'}>Settings</Link>
 </nav>;
}
