import {Link} from 'react-router';
import {EditorialHero} from './editorial';
import {BrandImage} from './brand-image';
import {MarketingFaq} from './page-patterns';
import {
  CO_LIVING_BANNERS,CO_LIVING_STAGE_STEPS,
} from '../../../../packages/marketing/co-living-hub';

const questions:[string,string][]=[
  ['Is the ordinary Residential subscription the same as Co-Living?','No. Residential All Inclusive is a separate per-property subscription. Comprehensive Co-Living establishment and ongoing services have a property-specific scope and proposed 25% + GST management fee, subject to an agreed contract.'],
  ['What does the Co-Living management fee cover?','The proposed service includes agreed leasing and resident administration, room condition records, quarterly routine inspections, internet, fortnightly common-area cleaning and a capped annual electricity, gas and water allowance. Owner-funded expenses and any additional fees are set out in the property agreement.'],
  ['How is the annual utility allowance calculated?','The proposed annual allowance is 25% of ProInspect management fees actually collected, excluding GST—not 25% of rent. Eligible electricity, gas and water costs above that amount are reimbursable by the owner. Internet and standard common-area cleaning are funded separately within the management service.'],
  ['Can every house be converted into Co-Living?','No. We assess suitability, existing tenancies, local planning requirements, building and fire safety, room use and expected returns. An existing theatre or study is not automatically an approved bedroom.'],
  ['When can I review and approve the furnishing budget?','A property-specific proposal is prepared after an assessment. The owner reviews the room configuration, scope and establishment costs before authorising purchases or works. Additional expenditure outside the agreed scope requires approval.'],
];
export function CoLivingLanding(){
 return <>
  <EditorialHero eyebrow="Co-Living Property Services"
    title="Your Property. A Complete Co-Living Solution."
    intro="Explore the potential of a fully furnished, room-by-room residential property. From assessment and setup to agreed resident and property services, ProInspect brings the essential work together in a clear programme."
    image="co-living"
    primary={{label:'Explore Co-Living Support',to:'#service-options'}}
    secondary={{label:'Request a Property Assessment',to:'/contact?topic=co-living'}}/>
  <section className="mkt-section pi-editorial-section" id="overview">
   <div className="site-container pi-introduction">
    <div><p className="eyebrow">Co-Living overview</p><h2>A practical way to prepare and operate shared accommodation.</h2></div>
    <div><p>A suitable residential investment property may generate income from separately occupied furnished rooms, while residents share agreed facilities and services. That model also creates more work: room readiness, resident communication, inventories, regular inspections and ongoing shared-area care.</p>
    <p>ProInspect coordinates the property assessment, approved setup and an agreed recurring programme so owners can assess the opportunity with clearer responsibilities, costs and records.</p>
    <p className="pi-audience">For residential property owners considering Co-Living, and authorised operators seeking a property-specific service scope. Room use, operating authority and financial outcomes require assessment and approval.</p></div>
   </div>
  </section>
  <section className="mkt-section pi-editorial-section pi-neutral" id="service-options">
   <div className="site-container">
    <div className="pi-section-heading">
     <p className="eyebrow">Explore the offering</p>
     <h2>Six ways to understand Co-Living with ProInspect.</h2>
     <p>Choose an area to see the complete service, from preparing a property to understanding management fees and potential owner income.</p>
    </div>
    <div className="pi-property-grid pi-co-living-grid">
     {CO_LIVING_BANNERS.map((item,index)=><article key={item.slug} className="pi-property-card pi-co-living-card">
      <Link to={item.href} className="pi-card-image-link" aria-label={item.action}>
       <BrandImage name={item.image}/>
      </Link>
      <div>
       <p className="eyebrow">0{index+1} / 06</p>
       <h3><Link to={item.href}>{item.title}</Link></h3>
       <p>{item.description}</p>
       <Link className="button secondary pi-co-living-button" to={item.href}>{item.action} <span aria-hidden="true">→</span></Link>
      </div>
     </article>)}
    </div>
   </div>
  </section>
  <section className="mkt-section pi-editorial-section">
   <div className="site-container">
    <div className="pi-section-heading"><p className="eyebrow">Your property onboarding journey</p>
     <h2>Six stages. Clear owner decisions.</h2>
     <p>From the first conversation to welcoming residents, we explain the tasks, approvals and handovers at each stage.</p>
    </div>
    <ol className="pi-process-list pi-co-living-process">
      {CO_LIVING_STAGE_STEPS.map((stage,i)=><li key={stage.title}>
        <span className="pi-step-number">0{i+1}</span><h3>{stage.title}</h3><p>{stage.description}</p>
      </li>)}
    </ol>
    <p className="pi-co-living-note"><Link className="pi-inline-link" to="/co-living/how-it-works">See the complete six-stage process <span aria-hidden="true">↗</span></Link></p>
   </div>
  </section>
  <section className="mkt-section pi-editorial-section pi-neutral">
   <div className="site-container pi-residential-feature">
    <div className="pi-residential-feature-image"><BrandImage name="co-living"/></div>
    <div className="pi-residential-feature-content">
      <p className="eyebrow">The proposed management model</p>
      <h2>One management fee. Defined responsibilities.</h2>
      <p><strong>25% + GST of gross rental income actually collected</strong>, under an agreed property-specific Co-Living arrangement.</p>
      <p>The proposed package covers agreed property and resident support, internet, fortnightly common-area cleaning and eligible electricity, gas and water costs up to an annual allowance of 25% of ProInspect management fees collected excluding GST. The owner reimburses eligible utility costs above that allowance.</p>
      <p>Furnishings, approved repairs, rates, insurance and other property ownership costs remain the owner's responsibility. Additional onboarding and third-party expenses are approved separately.</p>
      <Link className="button secondary" to="/co-living/inclusions">View Included Services <span aria-hidden="true">→</span></Link>
    </div>
   </div>
  </section>
  <section className="mkt-section pi-editorial-section">
   <div className="site-container pi-introduction">
    <div>
      <p className="eyebrow">A property-specific financial assessment</p>
      <h2>Your property deserves its own numbers.</h2>
      <p>Co-Living returns depend on your property's approved room configuration, expected rental demand, establishment investment, occupancy and ongoing costs.</p>
    </div>
    <div>
      <p>Instead of relying on a generic earnings example, we assess your property and prepare a tailored proposal showing indicative room rents, the management fee, agreed utility allowance and expected owner expenses.</p>
      <p>Review the fee structure and explore adjustable assumptions, then request an assessment to understand what could be suitable for your property.</p>
      <div className="actions">
        <Link className="button secondary" to="/co-living/pricing">Explore Pricing &amp; Owner Returns <span aria-hidden="true">→</span></Link>
        <Link className="button secondary" to="/contact?topic=co-living">Request a Property Assessment <span aria-hidden="true">→</span></Link>
      </div>
    </div>
   </div>
  </section>
  <section className="mkt-section pi-editorial-section pi-neutral">
    <div className="site-container pi-faq-layout">
      <div><p className="eyebrow">Good to know</p><h2>Your questions, answered.</h2>
        <p>A Co-Living agreement is distinct from the standard Residential subscription. We confirm property suitability, service boundaries and authority before proceeding.</p>
        <Link className="pi-inline-link" to="/contact?topic=co-living">Ask about your property <span aria-hidden="true">↗</span></Link>
      </div>
      <MarketingFaq questions={questions}/>
    </div>
  </section>
  <section className="mkt-final-cta"><div className="site-container mkt-cta-inner">
    <div><p className="eyebrow">Start with the property</p><h2>Could your property work as Co-Living?</h2>
      <p>Share your property details to discuss an initial assessment. An enquiry does not authorise expenditure, activate a paid plan or approve room conversion.</p>
    </div>
    <div className="actions">
      <Link className="button mkt-button-light" to="/contact?topic=co-living">Request a Property Assessment <span aria-hidden="true">→</span></Link>
      <Link className="button mkt-button-outline-light" to="/co-living/how-it-works">How the Process Works</Link>
    </div>
  </div></section>
 </>;
}
