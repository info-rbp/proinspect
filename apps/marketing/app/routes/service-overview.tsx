import { Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { MarketingPageHero } from '../components/page-patterns';
import { seo } from '../lib/seo';
export const SECTOR_OVERVIEWS = {
 residential:{title:'Residential',summary:'Inspections, rental condition records and practical property support for owners and managers.',examples:['Routine and condition inspections','Property attendance','Maintenance follow-up'],visual:'residential',ready:true},
 commercial:{title:'Commercial',summary:'Condition observations, make-good, asset support and agreed site attendance.',examples:['Commercial inspections','Site access and handovers','Facilities and completed-work checks'],visual:'commercial',ready:true},
 strata:{title:'Strata',summary:'Shared-space inspections and building support, with scheme decisions retained by authorised representatives.',examples:['Common-property inspections','Building operations','Contractor access'],visual:'strata',ready:true},
 'co-living':{title:'Co-Living',summary:'Developing connected room, occupancy and shared-space management services for operators.',examples:['Room and bed management','Occupancy and turnovers','Common-space support'],visual:'residential',ready:false},
 construction:{title:'Construction',summary:'Developing full construction project management and project-linked site services.',examples:['Stages and milestone tracking','Defect and contractor coordination','Project inspections and handover'],visual:'commercial',ready:false},
 leasing:{title:'Leasing',summary:'Property listings, inspection registrations and authorised rental application pathways.',examples:['Listings and enquiries','Open inspections','Applications and handover'],visual:'residential',ready:true},
 maintenance:{title:'Maintenance',summary:'Capture, coordinate and follow up maintenance matters with clear property records.',examples:['Request intake','On-site attendance','Completion follow-up'],visual:'residential',ready:true},
} as const;
type SectorKey=keyof typeof SECTOR_OVERVIEWS;
export function loader({request}:LoaderFunctionArgs) {
 const key=new URL(request.url).pathname.replace(/\.data$/,'').slice(1) as SectorKey;
 const page=SECTOR_OVERVIEWS[key];if(!page)throw new Response('Not found',{status:404});
 return {key,...page};
}
export const meta:MetaFunction<typeof loader>=({loaderData:d})=>d?seo(d.title+' — ProInspect',d.summary,'/'+d.key):[];
export default function ServiceOverview(){
 const d=useLoaderData<typeof loader>();
 return <><MarketingPageHero eyebrow="Property services" title={d.title} intro={d.summary} crumbs={[{label:d.title}]} visual={d.visual} primary={{label:'Access the Client Portal',to:'/client'}}/>
 <section className="section mkt-section"><div className="site-container mkt-callout-grid"><div><h2>How ProInspect can help</h2><p>Explore support for your property and discuss the appropriate scope for your circumstances.</p>{!d.ready&&<p role="status">This management area is planned and is not yet available to book.</p>}</div>
 <div className="mkt-callout-panel"><h3>Areas of support</h3><ul className="mkt-check-list">{d.examples.map(item=><li key={item}>{item}</li>)}</ul><p>Availability and terms are confirmed before any instruction proceeds.</p></div></div></section>
 <section className="section mkt-section mkt-stone"><div className="site-container"><h2>Get started</h2><p>Sign in to manage properties and see services relevant to your verified account.</p><div className="actions"><Link className="button" to="/client">Sign up / Sign in</Link><Link className="button secondary" to="/contact">Contact Us</Link>{d.key==='leasing'&&<Link className="button secondary" to="/properties-for-lease">Browse listings</Link>}</div></div></section></>;
}
