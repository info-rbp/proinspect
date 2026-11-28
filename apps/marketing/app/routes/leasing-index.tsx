import { Link, useLoaderData, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import type { Env } from '../../../../packages/database/types';
import { publicListings } from '../../../platform/worker/features/leasing.server';
import { rentalListingReady } from '../../../platform/worker/features/rental-applications.server';
import { displayPrice, propertyUrl, safeApplicationUrl } from '../../../../packages/marketing/leasing';
import { LEASING_PROPERTY_TYPES, leasingPropertyType, leasingPropertyTypeLabel, filterLeasingListings } from '../../../../packages/marketing/leasing-property-types';
import { isLeasingDemoListing, leasingResultsUrl, leasingSearchSuffix, leasingDate, listingFacts, listingTypeName, listingInspectionLabel, listingApplicationLabel } from '../../../../packages/marketing/leasing-presentation';
import { seo } from '../lib/seo';
import { EditorialHero } from '../components/editorial';
import { ListingPhotoMedia, PhotoPlaceholder } from '../components/leasing-gallery';
import '../../../../packages/ui/leasing.css';

export const meta=()=>seo('Properties for Lease & Open Homes — Western Australia','Explore available residential and commercial property opportunities, shared spaces and advertised inspection and application information.','/leasing',{noindex:true});
type Listing={id:string;kind:string;slug:string;title:string;display_address:string;suburb:string;postcode:string;price_cents:number|null;price_period:string;bedrooms:number|null;bathrooms:number|null;parking:number|null;area_sqm:number|null;available_from:string|null;application_mode:string;application_url:string|null;photo_count:number;inspection_count:number;available_inspection_count:number;next_inspection_at:string|null;demo:boolean;applicationReady:boolean|null};
export async function loader({context,request}:LoaderFunctionArgs){
 const env=context.get(runtimeContext).env as Env;
 const url=new URL(request.url),type=leasingPropertyType(url.searchParams.get('type')),q=url.searchParams.get('q')??'';
 const rows=await publicListings(env) as unknown as Omit<Listing,'demo'|'applicationReady'>[];
 const visible=rows.filter(p=>!isLeasingDemoListing(p.id)||env.APP_ENV!=='production');
 const selected=filterLeasingListings(visible,type,q);
 // A directory must not promise online applications without the same readiness
 // gates as the detail page. Bound the additional D1 work for large inventories.
 let checks=0;
 const listings:Listing[]=[];
 for(const p of selected){
   const demo=isLeasingDemoListing(p.id);
   let applicationReady:boolean|null=false;
   if(!demo&&p.application_mode==='proinspect'&&!safeApplicationUrl(p.application_url)){
     applicationReady=checks++<6?await rentalListingReady(env,p.slug):null;
   }
   listings.push({...p,demo,applicationReady});
 }
 return {listings};
}
function PropertyCard({property,suffix}:{property:Listing;suffix:string}){
 const url=propertyUrl(property.kind,property.slug)+suffix;
 const date=leasingDate(property.available_from);
 const facts=listingFacts(property);
 return <article className={'leasing-card pi-listing-card'+(property.demo?' pi-leasing-demo-card':'')}>
  <div className="leasing-image">{!property.demo&&property.photo_count>0?<ListingPhotoMedia key={property.id} src={'/api/public/leasing/photos/'+encodeURIComponent(property.id)+'/cover'} alt={'Photograph of '+property.title}/>:<PhotoPlaceholder text={property.demo?'Demonstration property — no listing photos':'Property photos not yet available'}/>}</div>
  <div className="pi-listing-body">
   <p className="eyebrow">{listingTypeName(property.kind)} · {property.suburb}</p>
   {property.demo&&<p className="pi-leasing-demo-label">Demonstration listing · Not available to rent</p>}
   <h3>{property.title}</h3>
   {!property.demo&&<>
    <p className="pi-leasing-address">{property.display_address}</p>
    <p className="leasing-price">{displayPrice(property.price_cents,property.price_period)}</p>
    {facts.length>0&&<ul className="pi-leasing-card-facts" aria-label="Property features">{facts.map(f=><li key={f.label}>{f.value} {f.label.toLowerCase()}</li>)}</ul>}
    {date&&<p className="pi-leasing-availability"><strong>Available from:</strong> {date}</p>}
    <div className="pi-leasing-card-status"><p>{listingInspectionLabel(property.inspection_count,property.available_inspection_count,property.next_inspection_at)}</p><p>{listingApplicationLabel(property.application_mode,Boolean(safeApplicationUrl(property.application_url)),property.applicationReady)}</p></div>
   </>}
   <Link className="pi-inline-link pi-leasing-card-link" to={url} aria-label={(property.demo?'Preview demonstration property: ':'View property: ')+property.title}>{property.demo?'Preview demonstration property':'View property, inspections & applications'} <span aria-hidden="true">→</span></Link>
  </div>
 </article>;
}
const steps=[
 {title:'Explore',copy:'Discover available properties that suit your needs, lifestyle or business.',path:'M22 22l-6-6M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0z'},
 {title:'Take a look',copy:'Explore advertised inspection times or register your interest where available.',path:'M4 7h20v16H4zM4 12h20M9 4v6M19 4v6M10 17l3 3 5-5'},
 {title:'Take the next step',copy:'Follow the property’s advertised application process when applications are open.',path:'M6 3h12l5 5v19H6zM18 3v6h5M10 17l3 3 6-7'},
];
export default function LeasingIndex(){
 const {listings}=useLoaderData<typeof loader>();
 const [params]=useSearchParams();
 const kind=leasingPropertyType(params.get('type')),q=(params.get('q')??'').trim();
 const items=filterLeasingListings(listings,kind,q),live=items.filter(p=>!p.demo),demos=items.filter(p=>p.demo);
 const selectedTypeLabel=leasingPropertyTypeLabel(kind);
 const suffix=leasingSearchSuffix(kind,q);
 return <div className="pi-leasing-page">
  <EditorialHero eyebrow="Properties Available" title="Find Your Next Place."
    intro="Whether you’re looking for your next home, a space for your business or a more flexible way to live and work, explore available properties, discover upcoming inspections and find the right space for your needs."
    image="leasing" primary={{label:"See What's Available",to:'#available-properties'}} secondary={{label:'Tenant Information',to:'/tenants'}}/>
  <section className="mkt-section pi-editorial-section pi-leasing-results" id="available-properties" aria-labelledby="leasing-results-heading"><div className="site-container">
   <div className="pi-section-heading pi-leasing-heading"><p className="eyebrow">Current opportunities</p><h2 id="leasing-results-heading">Current Properties Available.</h2><p>Find a property that fits your needs. View published listings, available photographs, advertised inspections and application information in one place.</p></div>
   <form className="leasing-filters" method="get" key={params.toString()} action="/leasing#available-properties" aria-label="Search properties for lease">
    <label>Find a suburb or address<input aria-label="Search property location" name="q" placeholder="Suburb, property or postcode" maxLength={240} defaultValue={params.get('q')??''}/></label>
    <label>Property type<select name="type" defaultValue={kind}><option value="">All types</option>{LEASING_PROPERTY_TYPES.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
    <button className="button" type="submit">Search properties</button>
    {(kind||q)&&<Link className="pi-inline-link pi-leasing-clear" to={leasingResultsUrl('','')}>Clear filters</Link>}
   </form>
   <p className="pi-results-count" role="status">{live.length} {live.length===1?'property':'properties'} available{q||kind?' matching your search':''}</p>
   {live.length===0?<div className="panel pi-leasing-empty"><h3>No properties currently match.</h3><p>{selectedTypeLabel&&!q?'There are no published '+selectedTypeLabel+' properties available at present. Try another property type or view all properties.':'Try another suburb or property type, or check back for new listings. Only approved, published opportunities appear here.'}</p><Link className="pi-inline-link" to={leasingResultsUrl('','')}>View all properties <span aria-hidden="true">→</span></Link></div>:<div className="pi-listing-grid">{live.map(property=><PropertyCard key={property.id} property={property} suffix={suffix}/>)}</div>}
   {demos.length>0&&<section className="pi-leasing-demo-section" aria-labelledby="leasing-demo-heading"><h3 id="leasing-demo-heading">Demonstration listings</h3><p>For testing the website only. These examples are not available for lease and are excluded from the available-property count.</p><div className="pi-listing-grid">{demos.map(property=><PropertyCard key={property.id} property={property} suffix={suffix}/>)}</div></section>}
  </div></section>
  <section className="mkt-section pi-editorial-section pi-neutral pi-leasing-journey" aria-labelledby="leasing-journey-heading"><div className="site-container">
   <div className="pi-section-heading pi-leasing-heading"><p className="eyebrow">Your next steps</p><h2 id="leasing-journey-heading">Helping you find the right space.</h2><p>We make it easier to explore the properties advertised through ProInspect and understand the next steps for each opportunity.</p></div>
   <ol className="pi-process-list">{steps.map(step=><li key={step.title}><svg viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={step.path}/></svg><h3>{step.title}</h3><p>{step.copy}</p></li>)}</ol>
   <div className="pi-leasing-note"><p>ProInspect facilitates advertised inspections on behalf of the responsible landlord or leasing agent. The responsible party sets leasing terms, application requirements and decisions. An inspection registration or expression of interest is not a rental application.</p><Link className="pi-inline-link" to="/open-home/check-in">Attending an inspection? Open home check-in <span aria-hidden="true">→</span></Link></div>
  </div></section>
 </div>;
}
