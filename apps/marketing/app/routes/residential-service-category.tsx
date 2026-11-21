import {Link,useLoaderData,type LoaderFunctionArgs,type MetaFunction} from 'react-router';
import {RESIDENTIAL_CATEGORIES,residentialCategory} from '../../../../packages/marketing/residential-categories';
import {EditorialHero} from '../components/editorial';
import {BrandImage} from '../components/brand-image';
import {seo} from '../lib/seo';
export function loader({params}:LoaderFunctionArgs){const category=residentialCategory(params.category||'');if(!category)throw new Response('Not found',{status:404});return category;}
export const meta:MetaFunction<typeof loader>=({loaderData:d})=>d?seo(d.title+' — Residential Services | ProInspect',d.intro,'/residential/services/'+d.slug):[];
export default function ResidentialServiceCategory(){
 const c=useLoaderData<typeof loader>();
 return <><EditorialHero eyebrow="Residential Services" title={c.title} intro={c.intro} image={c.image}
  primary={{label:'Explore services',to:'#residential-options'}}
  secondary={{label:'All Residential Services',to:'/residential/services'}}/>
 <section className="mkt-section pi-editorial-section" id="residential-options"><div className="site-container">
   <div className="pi-section-heading"><p className="eyebrow">{c.title}</p><h2>The right support for the work at hand.</h2>
     <p>Each service is subject to approved instructions, suitability, price and availability. A service enquiry does not create an automatic booking.</p></div>
   {c.features.filter(f=>f.featured).map((f,i)=><article className={'pi-residential-feature'+(i%2?' pi-residential-feature-reverse':'')} key={f.title}>
     <div className="pi-residential-feature-image"><BrandImage name={c.image}/></div>
     <div className="pi-residential-feature-content"><p className="eyebrow">Featured support</p><h3>{f.title}</h3><p>{f.description}</p>
       <Link className="button" to={f.href}>{f.href.startsWith('/services/')?'View service details':'Explore this support'} <span aria-hidden="true">→</span></Link></div>
   </article>)}
   {c.features.some(f=>!f.featured)&&<><div className="pi-section-heading pi-residential-more"><p className="eyebrow">Additional options</p><h2>More ways we can help.</h2></div>
   <div className="mkt-editorial-grid">{c.features.filter(f=>!f.featured).map(f=><article key={f.title} className="mkt-editorial-panel"><h3>{f.title}</h3><p>{f.description}</p>
     <Link className="pi-inline-link" to={f.href}>Find out more <span aria-hidden="true">↗</span></Link>
   </article>)}</div></>}
 </div></section>
 <section className="mkt-section pi-editorial-section pi-neutral"><div className="site-container pi-introduction">
   <div><p className="eyebrow">Know what happens next</p><h2>Your property. Your instructions.</h2></div>
   <div><p>We agree scope, lawful access, expected outputs and any separately chargeable trade work before proceeding. Tenancy, bond and leasing decisions stay with the responsible landlord, agency or statutory process.</p>
     <Link className="pi-inline-link" to="/help-centre">View our Help Centre <span aria-hidden="true">↗</span></Link></div>
 </div></section>
 <section className="mkt-section pi-editorial-section"><div className="site-container"><div className="pi-section-heading"><p className="eyebrow">Keep exploring</p><h2>Other Residential Services</h2></div>
   <nav className="pi-residential-related" aria-label="Other Residential Services">{RESIDENTIAL_CATEGORIES.filter(x=>x.slug!==c.slug).map(x=><Link key={x.slug} to={'/residential/services/'+x.slug}>{x.title}<span aria-hidden="true">↗</span></Link>)}</nav>
 </div></section></>;
}
