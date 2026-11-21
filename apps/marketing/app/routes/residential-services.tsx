import {Link} from 'react-router';
import {RESIDENTIAL_CATEGORIES} from '../../../../packages/marketing/residential-categories';
import {EditorialHero} from '../components/editorial';
import {BrandImage} from '../components/brand-image';
import {seo} from '../lib/seo';
export const meta=()=>seo('Residential Services — ProInspect','Find inspections, open homes, leasing, maintenance, access and vacate support for Western Australian rentals.','/residential/services');
export default function ResidentialServices(){
 return <><EditorialHero eyebrow="Residential Services" title="Services Designed to Support You"
  intro="From a Property Condition Report to everyday property support, find help for one rental or a wider portfolio. Choose a service or discuss a tailored scope."
  image="residential" primary={{label:'See Our Services',to:'#service-areas'}}
  secondary={{label:'See Our Subscription Options',to:'/residential/subscriptions'}} />
 <section className="mkt-section pi-editorial-section" id="service-areas"><div className="site-container">
   <div className="pi-section-heading"><p className="eyebrow">Residential solutions</p><h2>From the first visit to the final handover.</h2>
   <p>Choose the task that fits your property. Individual prices, availability, lawful access and service scope are confirmed before a booking proceeds.</p></div>
   <div className="pi-property-grid pi-residential-grid">{RESIDENTIAL_CATEGORIES.map(c=><article className="pi-property-card" key={c.slug}>
     <Link to={'/residential/services/'+c.slug} className="pi-card-image-link" aria-label={'Explore '+c.title}><BrandImage name={c.image}/></Link>
     <div><h3><Link to={'/residential/services/'+c.slug}>{c.title}</Link></h3><p>{c.intro}</p>
       <Link className="pi-inline-link" to={'/residential/services/'+c.slug}>Explore Our {c.title} Solutions <span aria-hidden="true">↗</span></Link></div>
   </article>)}</div>
 </div></section>
 <section className="mkt-section pi-editorial-section pi-neutral"><div className="site-container pi-introduction">
   <div><p className="eyebrow">How we support you</p><h2>Practical work. Connected property records.</h2></div>
   <div><p>Where authorised, ProInspect connects bookings, work orders, inspection observations and issued reports to your property, making it easier to follow up without searching across unrelated messages.</p>
     <p>You can use individual services without signing up for a new paid subscription. An ongoing service arrangement is a separate decision.</p>
     <Link className="button secondary" to="/residential/subscriptions">See Our Subscription Options <span aria-hidden="true">→</span></Link>
   </div>
 </div></section></>;
}
