import {useState} from 'react';
import {Link,useLoaderData,type LoaderFunctionArgs} from 'react-router';
import {loadApi} from '../lib/api.server';
export const meta=()=>[{title:'All my properties | ProInspect'}];
export async function loader({request,context}:LoaderFunctionArgs){return loadApi(request,context,'/api/owner-portfolio');}
export default function CombinedProperties(){
 const d=useLoaderData<typeof loader>(),[sector,setSector]=useState('all');
 const properties=d.properties.filter((p:any)=>sector==='all'||p.sector===sector);
 return <main id="main" className="auth-page"><section className="stack">
 <Link to="/workspaces">Back to workspaces</Link><h1>All my properties</h1>
 <p>Your authorised Residential and Commercial owner portfolios in one view. Bookings, documents and decisions stay in their original secure workspaces.</p>
 <div className="grid-2"><section className="panel"><h2>Residential</h2><p>{d.properties.filter((p:any)=>p.sector==='residential').length} properties</p></section><section className="panel"><h2>Commercial</h2><p>{d.properties.filter((p:any)=>p.sector==='commercial').length} properties</p></section></div>
 <label>Property sector <select value={sector} onChange={e=>setSector(e.target.value)}><option value="all">All properties</option><option value="residential">Residential</option><option value="commercial">Commercial</option></select></label>
 <div className="stack">{properties.map((p:any)=><article className="panel" key={p.clientId+':'+p.id}>
 <p className="eyebrow">{p.sector} / {p.accountName}</p><h2>{p.address}</h2><p>{p.suburb} {p.postcode}</p>
 <p>{p.upcomingBookings} upcoming bookings / {p.openWorkOrders} open work orders / {p.openRequests} open requests</p>
 <Link className="button" to={p.workspaceHref+'/properties/'+p.id}>Open property workspace</Link>
 </article>)}</div>
 {!properties.length&&<section className="panel"><h2>No properties in this view</h2><p>Only currently authorised ownership relationships are included. Agency, resident and tenant access does not grant owner access.</p><Link to="/workspaces">Manage your accounts</Link></section>}
 </section></main>;
}
