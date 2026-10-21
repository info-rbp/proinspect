import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import type { Env } from '../../../../packages/database/types';
import { publicListings } from '../../../platform/worker/features/leasing.server';
import { displayPrice,propertyUrl,handoffDisclaimer } from '../../../../packages/marketing/leasing';
import { seo } from '../lib/seo';
import '../../../../packages/ui/leasing.css';
export const meta=({params}:any)=>seo(params.kind==='commercial'?'Commercial Properties for Lease':'Residential Properties for Lease','View approved rental and commercial lease listings and open inspections conducted by ProInspect on behalf of the responsible leasing representative.',`/properties-for-lease/${params.kind}`);
export async function loader({params,context}:LoaderFunctionArgs){
 if(!['residential','commercial'].includes(params.kind??''))throw new Response('Not found',{status:404});
 const env=context.get(runtimeContext).env as Env;
 return {kind:params.kind!,listings:await publicListings(env,params.kind)};
}
export default function LeasingSector(){
 const {kind,listings}=useLoaderData<typeof loader>(),commercial=kind==='commercial';
 return <><header className="service-hero"><div className="site-container"><p className="eyebrow">Properties for lease · {kind}</p><h1>{commercial?'Commercial spaces available for lease.':'Find your next rental property.'}</h1><p>{commercial?'Explore available commercial spaces with inspection opportunities coordinated by ProInspect.':'Browse residential properties and register for advertised open inspections conducted by ProInspect.'}</p><p className="leasing-role-note">{handoffDisclaimer}</p><nav className="pill-links" aria-label="Leasing categories"><Link to="/properties-for-lease">All properties</Link><Link to="/properties-for-lease/residential">Residential</Link><Link to="/properties-for-lease/commercial">Commercial</Link></nav></div></header>
 <section className="section"><div className="site-container"><div className="section-heading"><h2>{listings.length} {listings.length===1?'listing':'listings'}</h2></div>{listings.length===0?<div className="panel"><h2>Nothing advertised at present.</h2><p>New properties are published once the responsible leasing representative approves the listing and inspection arrangements.</p><Link to="/properties-for-lease">See all properties →</Link></div>:<div className="grid-3">{listings.map((l:any)=><article key={l.id} className="service-card leasing-card"><div className="leasing-image"><img src={`/api/public/leasing/photos/${l.id}/cover`} alt={`Property photograph for ${l.title}`} loading="lazy"/></div><p className="eyebrow">{l.suburb} · {l.postcode}</p><h3>{l.title}</h3><p>{l.display_address}</p><p className="leasing-price">{displayPrice(l.price_cents,l.price_period)}</p><p>{commercial?(l.area_sqm==null?'Commercial space':`${l.area_sqm} m²`):[l.bedrooms!=null?`${l.bedrooms} bedrooms`:'',l.bathrooms!=null?`${l.bathrooms} bathrooms`:''].filter(Boolean).join(' · ')}</p><p className="small">On behalf of {l.agent_name}</p><Link to={propertyUrl(l.kind,l.slug)}>View property →</Link></article>)}</div>}</div></section></>;
}
