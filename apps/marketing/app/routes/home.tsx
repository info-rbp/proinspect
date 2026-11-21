import {Link} from 'react-router';
import {BrandImage} from '../components/brand-image';
import {EditorialHero,EditorialSteps} from '../components/editorial';
import {IllustrativeReport} from '../components/marketing-ui';
import {PlanComparison} from '../components/plan-comparison';
import {seo} from '../lib/seo';
export const meta=()=>seo(
 'Residential Property Inspections, Co-Living & Property Support — WA | ProInspect',
 'Inspections, leasing, maintenance and practical Residential property support for private landlords, property managers and shared accommodation across Western Australia.','/');
export default function Home(){return <div className="pi-public-home">
 <EditorialHero home eyebrow="ProInspect Property Services · Western Australia"
  title={'Your Property.\nOur Practical Support.'}
  intro="Whether you need one Routine Inspection or everyday support for several rental properties, ProInspect helps with the practical work and keeps your property records connected."
  image="residential" primary={{label:'See What We Offer',to:'#property-services'}}
  secondary={{label:'Get Started Today',to:'/client'}}/>
 <section id="property-services" className="mkt-section pi-editorial-section"><div className="site-container">
  <div className="pi-section-heading pi-section-heading-wide"><div><p className="eyebrow">How we can help</p><h2>The right support for your Residential property.</h2></div>
  <p>From a one-bedroom apartment to a portfolio of rental homes or shared accommodation, choose practical services that fit your property.</p></div>
  <div className="pi-property-grid pi-home-property-grid">
   <article className="pi-property-card"><Link to="/residential" className="pi-card-image-link" aria-label="Explore Residential Solutions"><BrandImage name="residential"/></Link>
    <div><h3><Link to="/residential">Residential</Link></h3><p>From advertising and incoming condition reports to routine inspections, maintenance and vacate support, find help across the life of your rental.</p>
    <Link to="/residential" className="pi-inline-link">Explore Our Residential Solutions <span aria-hidden="true">↗</span></Link></div></article>
   <article className="pi-property-card"><Link to="/co-living" className="pi-card-image-link" aria-label="Explore Co-Living Solutions"><BrandImage name="co-living"/></Link>
    <div><h3><Link to="/co-living">Co-Living</Link></h3><p>Keep rooms, shared spaces and resident turnovers organised through tailored inspections, maintenance coordination and agreed property support.</p>
    <Link to="/co-living" className="pi-inline-link">Explore Our Co-Living Solutions <span aria-hidden="true">↗</span></Link></div></article>
  </div>
  <p className="pi-discovery">Have something specific in mind? <Link to="/residential/services">Explore all Residential service areas</Link> or <Link to="/service-finder">find a service.</Link></p>
 </div></section>
 <section className="mkt-section pi-editorial-section pi-neutral"><div className="site-container pi-residential-feature">
  <div className="pi-residential-feature-image"><BrandImage name="leasing"/></div>
  <div className="pi-residential-feature-content"><p className="eyebrow">Looking for your next home?</p><h2>Properties Available</h2>
   <p>Find your next place with ProInspect Property Services. Browse available homes, see advertised open-home times and follow the application option chosen by the responsible landlord or agent.</p>
   <Link to="/leasing" className="button">See What's Available <span aria-hidden="true">→</span></Link></div>
 </div></section>
 <section className="mkt-section pi-editorial-section"><div className="site-container pi-residential-feature pi-residential-feature-reverse">
  <div className="pi-residential-feature-image"><BrandImage name="maintenance"/></div>
  <div className="pi-residential-feature-content"><p className="eyebrow">Care when you need it</p><h2>Maintenance Support</h2>
   <p>From a minor maintenance concern to a larger project requiring approved specialist contractors, ProInspect can help document the issue, coordinate the next steps and keep the outcome in view.</p>
   <Link to="/maintenance" className="button">See Our Maintenance Solutions <span aria-hidden="true">→</span></Link></div>
 </div></section>
 <section className="mkt-section pi-editorial-section pi-deep"><div className="site-container pi-residential-feature pi-residential-approach">
  <div className="pi-residential-feature-image"><IllustrativeReport compact/></div>
  <div className="pi-residential-feature-content"><p className="eyebrow">More than another site visit</p>
   <h2>Practical Work.<br/>Innovative Solutions.<br/>Focused on You.</h2>
   <p>We do more than attend and leave. Our team combines property inspections, agreed administration and practical follow-up with a connected platform for bookings, work records and authorised reports.</p>
   <p>Less time chasing updates. More visibility over what has happened and what needs attention.</p>
   <Link to="/about" className="pi-inline-link">Discover the ProInspect Approach <span aria-hidden="true">↗</span></Link>
   <p className="pi-residential-note">Illustrative report preview — not an issued report.</p>
  </div>
 </div></section>
 <PlanComparison/>
 <EditorialSteps/>
 <section className="mkt-final-cta"><div className="site-container mkt-cta-inner">
  <div><p className="eyebrow">Ready for the next step?</p><h2>Let’s make property work easier.</h2>
   <p>No long calls or waiting for an email reply to create an account. Sign up for free, add your authorised property and explore the services available to you.</p></div>
  <div className="actions"><Link className="button mkt-button-light" to="/client">Sign Up Today <span aria-hidden="true">→</span></Link></div>
 </div></section>
</div>}