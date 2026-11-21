import {Link} from 'react-router';
import {RESIDENTIAL_CATEGORIES} from '../../../../packages/marketing/residential-categories';
import {EditorialHero} from './editorial';
import {BrandImage} from './brand-image';
import {IllustrativeReport} from './marketing-ui';
import {PlanComparison} from './plan-comparison';
import {MarketingFaq} from './page-patterns';

const questions:[string,string][]=[
 ['Do I need a subscription to book a Property Condition Report?','No. You can request one report as an individual service or consider a Residential subscription separately. Exact booking availability and price are confirmed before the service proceeds.'],
 ['Where do you work?','Scheduled services cover approved suburbs across Perth and Peel. Other locations across Western Australia may be considered on request, subject to travel and staff availability.'],
 ['Can you deal with tenants on my behalf?','We can manage ordinary communication and attendance within an agreed scope and authority. Your landlord or property manager retains tenancy, statutory and expenditure decisions.'],
 ['How do I book a service?','Create a free account, add an authorised property and choose an eligible service. Available appointments can be selected where booking is enabled; other requests require a confirmed scope or quotation.']
];
export function ResidentialLanding(){return <>
  <EditorialHero eyebrow="Residential"
   title="Innovative Support for Every Stage of Your Rental"
   intro="Whether you need one inspection or practical support throughout a tenancy, ProInspect helps you manage the work and keep the right records together."
   image="residential" primary={{label:'See Our Services',to:'/residential/services'}}
   secondary={{label:'See Our Subscription Options',to:'/residential/subscriptions'}}/>
  <section className="mkt-section pi-editorial-section"><div className="site-container pi-residential-feature pi-residential-feature-reverse">
    <div className="pi-residential-feature-image"><BrandImage name="residential"/></div>
    <div className="pi-residential-feature-content"><p className="eyebrow">Built around your property</p>
      <h2>Less Coordination.<br/>Better Records.<br/>More Time For You.</h2>
      <p>Keep control of your rental and get support when you need it. From inspections to approved maintenance and leasing attendance, ProInspect helps keep practical tasks moving without adding another layer of administration.</p>
      <Link className="pi-inline-link" to="/residential/services">Explore our Residential solutions <span aria-hidden="true">↗</span></Link>
    </div>
  </div></section>
  <section className="mkt-section pi-editorial-section pi-neutral" id="residential-services"><div className="site-container">
    <div className="pi-section-heading"><p className="eyebrow">Residential support</p><h2>Services Designed to Support You.</h2>
    <p>Choose what you need, from property inspections and open homes to maintenance, access, bond-related records and vacate support.</p></div>
    <div className="pi-property-grid pi-residential-grid">{RESIDENTIAL_CATEGORIES.map(item=><article key={item.slug} className="pi-property-card">
      <Link className="pi-card-image-link" to={'/residential/services/'+item.slug} aria-label={'Explore '+item.title}><BrandImage name={item.image}/></Link>
      <div><h3><Link to={'/residential/services/'+item.slug}>{item.title}</Link></h3><p>{item.intro}</p>
        <Link className="pi-inline-link" to={'/residential/services/'+item.slug}>Explore {item.title} <span aria-hidden="true">↗</span></Link></div>
    </article>)}</div>
  </div></section>
  <section className="mkt-section pi-editorial-section"><div className="site-container pi-residential-feature">
    <div className="pi-residential-feature-image"><IllustrativeReport compact/></div>
    <div className="pi-residential-feature-content"><p className="eyebrow">The ProInspect approach</p><h2>Practical work. Connected reporting.</h2>
      <p>Our own property-services platform brings authorised bookings, work orders, inspection observations and issued reports together, with information connected to the right property.</p>
      <p>Inspection reports are reviewed before issue. The exact content, template and any statutory requirements depend on the service commissioned.</p>
      <Link className="button secondary" to="/example-reports">View Example Inspection Reports <span aria-hidden="true">→</span></Link>
      <p className="pi-residential-note">Illustrative example only; not an issued statutory form.</p>
    </div>
  </div></section>
  <section className="mkt-section pi-editorial-section pi-neutral"><div className="site-container">
    <div className="pi-section-heading"><p className="eyebrow">What we deliver</p><h2>Support at every stage of the tenancy.</h2>
    <p>One connected pathway for the work you ask us to do, with the appropriate records available to authorised people.</p></div>
    <div className="mkt-editorial-grid">
      <article className="mkt-editorial-panel"><h3>Before the property is leased</h3><p>Approved listings, viewings, incoming condition reports and key handovers.</p></article>
      <article className="mkt-editorial-panel"><h3>During the tenancy</h3><p>Routine inspections, instructed tenant communications, maintenance assessments and authorised follow-up.</p></article>
      <article className="mkt-editorial-panel"><h3>When the tenancy ends</h3><p>Pre-vacate observations, outgoing condition reports and agreed exit administration.</p></article>
      <article className="mkt-editorial-panel"><h3>When something needs attention</h3><p>Clear observations, work history and next actions for the relevant decision-maker.</p></article>
    </div>
  </div></section>
  <section className="mkt-section pi-editorial-section"><div className="site-container pi-introduction">
    <div><p className="eyebrow">Getting started</p><h2>Choose the service. Keep control.</h2></div>
    <div><p>Start with a free account, one inspection or a tailored enquiry. We confirm the property, authority, price, lawful access and scheduling for the specific service. You choose whether ongoing support is appropriate for you.</p>
      <Link className="pi-inline-link" to="/client">Get Started Today <span aria-hidden="true">↗</span></Link>
    </div>
  </div></section>
  <PlanComparison market="residential"/>
  <section className="mkt-section pi-editorial-section"><div className="site-container pi-faq-layout">
    <div><p className="eyebrow">Good to know</p><h2>Your questions, answered.</h2>
      <p>Find more answers in our <Link to="/help-centre">Help Centre</Link>.</p>
      <Link className="button secondary" to="/help-centre">Visit Our Help Centre <span aria-hidden="true">→</span></Link></div>
    <MarketingFaq questions={questions}/>
  </div></section>
  <section className="mkt-final-cta"><div className="site-container mkt-cta-inner">
    <div><p className="eyebrow">Ready for the next step?</p><h2>Let’s Get Started Now.</h2>
      <p>Sign up for a free account today, add your authorised property and explore the services available to you.</p></div>
    <div className="actions"><Link to="/client" className="button mkt-button-light">Sign Up Today <span aria-hidden="true">→</span></Link></div>
  </div></section>
</>}