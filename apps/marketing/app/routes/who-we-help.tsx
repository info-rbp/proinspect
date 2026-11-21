import {Link} from 'react-router';
import {EditorialHero} from '../components/editorial';
import {seo} from '../lib/seo';
/** Kept as a backwards-compatible discovery route; the substantive audience overview now lives on About Us. */
export const meta=()=>seo('Who We Help — Residential Property Services | ProInspect',
 'Meet the private landlords, residential agencies and Co-Living operators supported by ProInspect.','/about',{noindex:true});
export default function WhoWeHelp(){return <>
 <EditorialHero eyebrow="Who We Help" title="Practical support for your property and your role."
  intro="Find the right ProInspect service, whether you are a private landlord, manage Residential rentals, operate shared accommodation or are looking for a home."
  image="residential" primary={{label:'Meet the people we support',to:'/about#who-we-help'}}
  secondary={{label:'Explore Residential Services',to:'/residential/services'}}/>
 <section className="mkt-section pi-editorial-section"><div className="site-container pi-introduction"><div>
  <p className="eyebrow">Our audiences</p><h2>Who We Help is now part of About Us.</h2></div>
  <div><p>Learn how ProInspect works with private landlords, residential property management agencies, Co-Living owners and tenants. Each service is designed around the correct property relationship and authorised decisions.</p>
  <Link to="/about#who-we-help" className="button secondary">View Who We Help <span aria-hidden="true">→</span></Link></div>
 </div></section>
</>}