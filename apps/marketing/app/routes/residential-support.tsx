import { Link, useOutletContext } from 'react-router';
import { MarketingPageHero } from '../components/page-patterns';
import { MarketingCta } from '../components/marketing-ui';
import { seo } from '../lib/seo';

/** Unapproved commercial proposal, not a live rate card or payment offer. */
export const RESIDENTIAL_SUPPORT_COMMERCIAL_APPROVED = false;
export const meta=()=>seo(
  'Residential Property Support — Account & Plan Options',
  'Learn how a ProInspect residential property account works, how one-off services differ from ongoing support and how optional weekly subscriptions are proposed.',
  '/residential-property-support',
  {breadcrumbs:[{name:'Who we help',path:'/who-we-help'},{name:'Residential property support',path:'/residential-property-support'}],
   noindex:!RESIDENTIAL_SUPPORT_COMMERCIAL_APPROVED},
);
export default function ResidentialSupport(){
  const {appOrigin}=useOutletContext<{appOrigin:string}>();
  return <>
    <MarketingPageHero eyebrow="Residential landlords" title="Begin with a property account. Choose support as you need it."
      intro="Explore inspections, keep your property information together and consider ongoing support separately. Signing up does not mean agreeing to a new paid subscription."
      crumbs={[{label:'Who we help',to:'/who-we-help'},{label:'Residential property support'}]}
      visual="residential" primary={{label:'Explore residential inspections',to:'/sectors/residential'}} />
    <section className="section mkt-section"><div className="site-container mkt-service-intro-grid">
      <div><p className="eyebrow">Flexible ways to work with us</p><h2>One property. Clear choices.</h2>
        <p>Create an account using your verified email, set up a property you are authorised to manage and view the services available to you. You can also request an individual inspection without committing to ongoing support.</p>
        <p>If an approved paid plan is available for your property, you can consider it later. Pricing and service coverage are confirmed before any separate subscription agreement is made.</p>
        <a href={appOrigin+'/signin'} className="button secondary">Create account / Sign in <span aria-hidden="true">→</span></a>
      </div>
      <aside className="mkt-at-glance"><p className="eyebrow">Proposed residential support plan</p>
        <h3>$50 + GST per property, per week</h3>
        <p><strong>Commercial proposal — not an available checkout offer.</strong> Final eligibility, included services, annual allowances, billing commencement, cancellation terms and tax treatment require approval. No purchase is made on this page.</p>
        <Link to="/contact">Ask about availability <span aria-hidden="true">→</span></Link>
      </aside>
    </div></section>
    <section className="section mkt-section mkt-stone"><div className="site-container">
      <div className="mkt-section-heading"><div><p className="eyebrow">How the choices differ</p><h2>Choose the arrangement that suits the work.</h2></div></div>
      <div className="mkt-editorial-grid">
        <article className="mkt-editorial-panel"><span className="mkt-card-number">01</span><h3>Free account registration</h3>
          <p>Verified sign-in and a property workspace. Account creation by itself does not authorise a new paid recurring charge. Access to included services depends on your existing or separately agreed entitlements.</p></article>
        <article className="mkt-editorial-panel"><span className="mkt-card-number">02</span><h3>One-off property services</h3>
          <p>Choose a specific inspection or attendance. An online booking or enquiry is subject to the published service mode, accepted scope, approved price and appointment confirmation. A subscription is not required to enquire.</p></article>
        <article className="mkt-editorial-panel"><span className="mkt-card-number">03</span><h3>Optional ongoing support</h3>
          <p>When the residential plan is formally released, eligible owners can review the exact inclusions and terms, explicitly opt in and manage billing through their account. Existing approved arrangements remain subject to their own terms.</p></article>
      </div>
    </div></section>
    <section className="section mkt-section"><div className="site-container mkt-faq-grid">
      <div><p className="eyebrow">Common questions</p><h2>Know what happens before you register.</h2></div>
      <div className="mkt-faq-list">
        <details><summary>Does creating a ProInspect account start a paid subscription?<span aria-hidden="true">+</span></summary><p>No new paid subscription or Stripe charge should be started solely because you create an account. Legacy service entitlements and eligibility rules are separate from new paid billing.</p></details>
        <details><summary>Is the $50 weekly plan available to purchase now?<span aria-hidden="true">+</span></summary><p>This figure is a proposed fee, excluding GST. The final inclusions, terms, eligibility and payment activation are not approved for public sale, so there is no paid checkout on this page.</p></details>
        <details><summary>Can I request one inspection without joining a plan?<span aria-hidden="true">+</span></summary><p>Yes. Browse the individual services and follow the available one-off booking or enquiry path. Some work needs a reviewed quotation or confirmed appointment.</p></details>
        <details><summary>Will the plan include every service?<span aria-hidden="true">+</span></summary><p>No coverage promise is made until the applicable agreement and service list are approved. Property type, location, access, service limits and suitability can affect availability.</p></details>
      </div>
    </div></section>
    <MarketingCta title="Have a residential property to look after?" description="Compare the inspections, create an account or discuss a one-off requirement. New paid plans will only be offered with clear, approved terms." appOrigin={appOrigin}/>
  </>;
}
