import { Link, useLoaderData, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import type { Env } from '../../../../packages/database/types';
import { publicListings } from '../../../platform/worker/features/leasing.server';
import { displayPrice,propertyUrl,handoffDisclaimer } from '../../../../packages/marketing/leasing';
import { seo } from '../lib/seo';
import '../../../../packages/ui/leasing.css';
export const meta=()=>seo('Properties for Lease','Explore residential and commercial properties with open inspections conducted by ProInspect on behalf of the responsible leasing representative.','/properties-for-lease');
export async function loader({context}:LoaderFunctionArgs){
 const env=context.get(runtimeContext).env as Env;
 return {listings:await publicListings(env)};
}
export default function LeasingIndex(){
 const {listings}=useLoaderData<typeof loader>();
 const [params,setParams]=useSearchParams();
 const kind=params.get('type')??'',q=(params.get('q')??'').trim().toLowerCase();
 const items=listings.filter((x:any)=>(!kind||x.kind===kind)&&(!q||String(x.suburb+' '+x.display_address+' '+x.title).toLowerCase().includes(q)));
 return <>
 <header className="service-hero"><div className="site-container"><p className="eyebrow">Open for inspections</p><h1>Properties for lease.</h1><p>Explore residential and commercial properties where ProInspect conducts inspections on behalf of the responsible leasing representative.</p><p className="leasing-role-note">{handoffDisclaimer}</p>
 <nav className="pill-links" aria-label="Lease categories"><Link to="/properties-for-lease">All properties</Link><Link to="/properties-for-lease/residential">Residential leasing</Link><Link to="/properties-for-lease/commercial">Commercial leasing</Link></nav></div></header>
 <section className="section"><div className="site-container">
 <form className="leasing-filters" method="get"><label>Find a suburb or address<input aria-label="Search property location" name="q" placeholder="Suburb, property or postcode" defaultValue={params.get('q')??''}/></label><label>Property type<select name="type" defaultValue={kind}><option value="">All types</option><option value="residential">Residential</option><option value="commercial">Commercial</option></select></label><button className="button">Search properties</button></form>
 <div className="section-heading"><div><p className="eyebrow">Current opportunities</p><h2>{items.length} {items.length===1?'property':'properties'} available</h2></div></div>
 {items.length===0?<div className="panel"><h2>No properties currently match.</h2><p>We only display approved, published leasing opportunities. Check back as new inspection sessions become available.</p><Link to="/properties-for-lease">Clear filters →</Link></div>:
 <div className="grid-3">{items.map((x:any)=><article className="service-card leasing-card" key={x.id}>
 <div className="leasing-image"><img src={`/api/public/leasing/photos/${x.id}/cover`} alt={`Exterior or marketing photograph for ${x.title}`} loading="lazy"/></div>
 <p className="eyebrow">{x.kind==='commercial'?'Commercial':'Residential'} · {x.suburb}</p><h3>{x.title}</h3><p>{x.display_address}</p>
 <p className="leasing-price">{displayPrice(x.price_cents,x.price_period)}</p>
 <p className="small">{x.kind==='residential'?[x.bedrooms!=null?`${x.bedrooms} beds`:'',x.bathrooms!=null?`${x.bathrooms} baths`:'',x.parking!=null?`${x.parking} parking`:''].filter(Boolean).join(' · '):x.area_sqm!=null?`${x.area_sqm.toLocaleString()} m²`:'Commercial property'}</p>
 <p className="small">Inspection conducted by ProInspect on behalf of {x.agent_name}.</p>
 <Link to={propertyUrl(x.kind,x.slug)}>View property & inspections →</Link></article>)}</div>}
 </div></section></>;
}
