import { Link, useParams } from 'react-router';
import { useWorkspace } from '../lib/workspace';
import { resolveClientAreas } from '../../../../packages/domain/client-navigation';
import { PageHeading } from '../../../../packages/ui/components';
export default function ClientSector(){
 const d=useWorkspace(),params=useParams(),area=params.area??'';
 const option=resolveClientAreas(d.workspace,d.properties,d.schemes,d.serviceInterests?.areas??[],d.services).find(x=>x.area===area);
 if(!option||option.status!=='available')return <section className="panel"><h1>Service area unavailable</h1><p>This sector requires approved account and property access.</p></section>;
 if(area==='leasing')return <div className="stack"><PageHeading title="Leasing" description="Leasing services, property listings and application pathways within your authorised account."/><section className="panel"><p>Leasing instructions remain subject to the authority of the owner or appointed agency.</p><Link to="/properties-for-lease">View available listings</Link></section></div>;
 const sector=area==='strata'?'strata-building':area;
 const services=d.services.filter(s=>s.active===1&&s.sectors.includes(sector));
 return <div className="stack"><PageHeading title={option.label+' services'} description="Choose a published service for an authorised property. Availability, scope and price are checked again when you continue."/>
 <div className="client-dashboard-grid">{services.map(s=><article key={s.id} className="panel"><h2>{s.name}</h2><p>{s.summary}</p>{s.booking_mode==='instant'&&s.price_ex_gst_cents!==null?<Link to={d.workspace.href+'/book/'+s.id}>Continue to booking</Link>:<Link to="/contact">Request service information</Link>}</article>)}</div>
 {!services.length&&<p>No eligible services are currently published for this area.</p>}
 </div>;
}
