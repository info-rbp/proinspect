import { Link, useOutletContext } from 'react-router';
import { MarketingPageHero } from '../components/page-patterns';
import { MarketingCta } from '../components/marketing-ui';
import { seo } from '../lib/seo';
import { PlanComparison } from '../components/plan-comparison';

import { RESIDENTIAL_SUPPORT_COMMERCIAL_APPROVED } from '../../../../packages/marketing/pricing-publication';
export const meta=()=>seo(
  'Residential Property Support — All Inclusive Subscription',
  'Residential All Inclusive Subscription: AUD $50 + GST per week per property, with a 24-month initial term and 60 days’ written cancellation notice.',
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
      visual="residential" primary={{label:'Explore residential services',to:'/residential'}} />
    <section className="section mkt-section"><div className="site-container mkt-service-intro-grid">
      <div><p className="eyebrow">Flexible ways to work with us</p><h2>One property. Clear choices.</h2>
        <p>Create an account using your verified email, set up a property you are authorised to manage and view the services available to you. You can also request an individual inspection without committing to ongoing support.</p>
        <p>Choose an individual service or the Residential All Inclusive Subscription at AUD $50 + GST ($55 including GST) per week per property. The initial term is 24 months, with 60 days’ written cancellation notice. There is no per-room subscription. A tailored scope can address agency workloads or a specific property requirement.</p>
        <a href={appOrigin+'/signin'} className="button secondary">Create account / Sign in <span aria-hidden="true">→</span></a>
      </div>
      <aside className="mkt-at-glance"><p className="eyebrow">Residential All Inclusive Subscription</p>
        <h3>AUD $50 + GST per week</h3>
        <p>Per property ($55 including GST), with a 24-month initial term and 60 days’ written cancellation notice. Review the All Inclusive service schedule before joining.</p>
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
          <p>Review the selected plan’s exact inclusions and terms before separately opting in. The service agreement identifies commencement, responsibilities, limits and any extra charges. Existing arrangements remain subject to their own terms; account creation does not change them.</p></article>
      </div>
    </div></section>
    <PlanComparison market="residential" />
    <section className="section mkt-section"><div className="site-container mkt-faq-grid">
      <div><p className="eyebrow">Common questions</p><h2>Know what happens before you register.</h2></div>
      <div className="mkt-faq-list">
        <details><summary>Does creating a ProInspect account start a paid subscription?<span aria-hidden="true">+</span></summary><p>Creating a free account does not enrol you in a paid plan or authorise a recurring charge. A subscription requires a separate affirmative agreement.</p></details>
        <details><summary>What are the subscription price and term?<span aria-hidden="true">+</span></summary><p>Residential All Inclusive is AUD $50 + GST ($55 including GST) per week per property. The initial term is 24 months, with 60 days’ written cancellation notice. Rooms do not create additional subscriptions. Inclusions, extras and any early-exit obligations must be disclosed and agreed before you subscribe. There is no paid checkout on this page.</p></details>
        <details><summary>Can I request one inspection without joining a plan?<span aria-hidden="true">+</span></summary><p>Yes. Browse the individual services and follow the available one-off booking or enquiry path. Some work needs a reviewed quotation or confirmed appointment.</p></details>
        <details><summary>Will the plan include every service?<span aria-hidden="true">+</span></summary><p>All Inclusive follows your accepted service schedule and allowances. Third-party work and extras need separate approval.</p></details>
      </div>
    </div></section>
    <MarketingCta title="Have a residential property to look after?" description="Compare inspections, request a tailored proposal or sign in to view individual service pricing. A subscription requires a separate agreement with clear terms." appOrigin={appOrigin}/>
  </>;
}
