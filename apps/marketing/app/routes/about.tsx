import {Link} from 'react-router';
import {EditorialHero} from '../components/editorial';
import {BrandImage} from '../components/brand-image';
import {IllustrativeReport} from '../components/marketing-ui';
import {seo} from '../lib/seo';

export const meta=()=>seo('About ProInspect — Residential Property Services in WA',
 'Learn how ProInspect supports private landlords, property management agencies and Co-Living owners with inspections, maintenance and connected property records.','/about',
 {breadcrumbs:[{name:'About Us',path:'/about'}]});
const audiences=[
 {name:'Private landlords',description:'Support for landlords who manage their own rentals: condition reports, routine inspections, maintenance attendance and practical help across the tenancy.',href:'/who-we-help/private-landlords',action:'Support for private landlords'},
 {name:'Residential property management agencies',description:'Extra property-inspection and on-site capacity for authorised agency teams, with reports and follow-up linked to the relevant instruction.',href:'/who-we-help/property-management-agencies',action:'Support for agencies'},
 {name:'Co-Living owners and operators',description:'Room and shared-space inspections, resident turnovers and agreed property care for accommodation managed room by room.',href:'/co-living',action:'Co-Living solutions'},
 {name:'Tenants and prospective renters',description:'Find advertised rentals, register for an open home and use authorised tenant channels to follow inspections and requests.',href:'/tenants',action:'Tenant information'},
];
export default function About(){return <>
 <div className="pi-about-hero"><EditorialHero eyebrow="About Us" title="Property Support. Designed Around You."
  intro="ProInspect brings together the services needed to keep rental properties moving, with innovative inspection, leasing and maintenance solutions designed to save owners time and help maximise rental income."
  image="residential" primary={{label:'See Our Residential Services',to:'/residential/services'}}
  secondary={{label:'Get Started Today',to:'/client'}}/></div>
 <section className="mkt-section pi-editorial-section"><div className="site-container pi-introduction pi-about-purpose">
  <div className="pi-about-purpose-image"><BrandImage name="maintenance"/></div>
  <div><p className="eyebrow">Our Purpose</p><h2>Less time chasing tasks. More clarity over your property.</h2>
   <p>Owning a rental property involves much more than inspections. Finding the right tenant, organising routine visits, responding to maintenance and keeping records up to date all demand time and attention.</p>
   <p>ProInspect provides practical inspections, leasing assistance and property support so private landlords and property managers can spend less time coordinating individual tasks and more time on what matters to them.</p>
   <p>We work on the instructions of the responsible owner or authorised property manager. Property-management, leasing and statutory decisions remain with the appropriately authorised person.</p>
  </div>
 </div></section>
 <section id="who-we-help" className="mkt-section pi-editorial-section pi-neutral"><div className="site-container">
  <div className="pi-section-heading"><p className="eyebrow">Who We Help</p><h2>Support for the people behind the property.</h2>
  <p>We work with private landlords, professional residential agencies and shared-accommodation operators. We also provide the right information pathways for tenants and prospective renters.</p></div>
  <div className="mkt-editorial-grid">{audiences.map(person=><article className="mkt-editorial-panel" key={person.name}>
   <h3>{person.name}</h3><p>{person.description}</p>
   <Link to={person.href} className="pi-inline-link">{person.action} <span aria-hidden="true">↗</span></Link></article>)}</div>
 </div></section>
 <section className="mkt-section pi-editorial-section"><div className="site-container pi-residential-feature">
  <div className="pi-residential-feature-image"><IllustrativeReport compact/></div>
  <div className="pi-residential-feature-content"><p className="eyebrow">What makes us different</p><h2>Real work. A connected record.</h2>
   <p>Services and records are connected to the property, not scattered across separate conversations. Authorised customers can review bookings, requests and issued reports using their appropriate ProInspect workspace.</p>
   <p>For inspections, our reporting tools help record relevant observations and evidence. Completed reports follow review and issue controls before they become available to authorised recipients.</p>
   <Link to="/example-reports" className="button secondary">View Example Inspection Reports <span aria-hidden="true">→</span></Link>
   <p className="pi-residential-note">The report illustration is synthetic, not an issued report.</p>
  </div>
 </div></section>
 <section className="mkt-section pi-editorial-section pi-neutral"><div className="site-container">
  <div className="pi-section-heading"><p className="eyebrow">Our approach</p><h2>Practical support when it matters.</h2></div>
  <div className="mkt-editorial-grid">
   <article className="mkt-editorial-panel"><h3>Inspections with purpose</h3><p>Incoming condition reports, Routine Inspections, pre-vacate visits and final reports give the responsible person useful property information.</p><Link className="pi-inline-link" to="/residential/services/property-inspections">Explore inspections <span aria-hidden="true">↗</span></Link></article>
   <article className="mkt-editorial-panel"><h3>Maintenance and access</h3><p>Attend to agreed property tasks, coordinate approved contractors and keep visibility over instructed follow-up.</p><Link className="pi-inline-link" to="/maintenance">Explore maintenance <span aria-hidden="true">↗</span></Link></article>
   <article className="mkt-editorial-panel"><h3>Flexible engagement</h3><p>Start with an individual service or review a Residential subscription separately. Registration alone never activates a new paid subscription.</p><Link className="pi-inline-link" to="/residential/subscriptions">Review subscriptions <span aria-hidden="true">↗</span></Link></article>
   <article className="mkt-editorial-panel"><h3>Clear authority</h3><p>Instructions, property access, approvals and document recipients follow the agreed responsibilities. We support your work rather than assuming every regulated management function.</p><Link className="pi-inline-link" to="/help-centre">Visit Help Centre <span aria-hidden="true">↗</span></Link></article>
  </div>
 </div></section>
 <section className="mkt-section pi-editorial-section"><div className="site-container pi-residential-feature pi-residential-feature-reverse">
  <div className="pi-residential-feature-image"><BrandImage name="co-living"/></div>
  <div className="pi-residential-feature-content"><p className="eyebrow">Supporting shared homes</p><h2>From a single rental to Co-Living.</h2>
   <p>Different property arrangements need different inspection and care routines. We can support whole-property rentals or discuss tailored room turnover and shared-area services for Co-Living operators.</p>
   <Link to="/co-living" className="pi-inline-link">Explore Our Co-Living Solutions <span aria-hidden="true">↗</span></Link>
  </div>
 </div></section>
 <section className="mkt-final-cta"><div className="site-container mkt-cta-inner"><div>
  <p className="eyebrow">Get started</p><h2>Let’s make property work easier.</h2>
  <p>Create a free account, explore Residential services or contact us about an agreed property workload.</p>
 </div><div className="actions"><Link className="button mkt-button-light" to="/client">Sign Up Today <span aria-hidden="true">→</span></Link>
 <Link className="button mkt-button-outline-light" to="/contact">Contact</Link></div></div></section>
</>}