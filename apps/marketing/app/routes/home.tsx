import { Link, useOutletContext } from 'react-router';
import { IllustrativeReport, MarketingCta, PropertyArtwork } from '../components/marketing-ui';
import { seo } from '../lib/seo';

export const meta = () => seo(
  'Property Inspections & On-Site Support — Western Australia',
  'Practical property inspections, condition reports, contractor access and property attendance in WA. On-site work, documented outcomes and connected records.',
  '/',
);

const services = [
  ['Inspections & reports','Understand the condition of your property through routine, incoming, outgoing and commercial inspections.','Routine inspections · Condition reports · Exit inspections','/services/category/inspections'],
  ['Maintenance & follow-up','Have reported problems, repairs or completed work checked and documented.','Maintenance visits · Completed works · Reinspections','/services/category/maintenance'],
  ['Access & contractor support','Arrange authorised contractor access, key handovers and agreed supervision attendance.','Contractor access · Key handovers · Supervision','/services/category/access'],
  ['Building & property operations','Get help with practical on-site tasks across buildings, managed properties and portfolios.','Building attendance · Meetings · Handovers','/services/category/attendance'],
] as const;
const sectors = [
  ['Residential','For rental property owners and agencies','Condition reports, tenancy inspections and practical follow-up for self-managing landlords and professional managers.','/sectors/residential'],
  ['Commercial','For commercial owners and asset managers','Condition inspections, make-good observations, handovers and defined property attendance.','/sectors/commercial'],
  ['Strata & buildings','For strata and building teams','Common-property inspections, contractor coordination and documented building attendance.','/sectors/strata-building'],
] as const;
const steps = [
  ['Tell us what needs doing','Choose a service or describe the property task. We confirm the scope, safe access and availability.'],
  ['We attend the property','A ProInspect representative undertakes the agreed inspection or on-site task at the confirmed appointment.'],
  ['Review the outcome','Receive the appropriate report or attendance record and identify matters that may need your next decision.'],
] as const;

export default function Home() {
  const { appOrigin } = useOutletContext<{ appOrigin: string }>();
  return <div className="pi-home">
    <section className="mkt-home-hero pi-hero" aria-labelledby="pi-title">
      <div className="site-container pi-hero-grid">
        <div className="pi-hero-copy">
          <p className="eyebrow">On-site property services · Western Australia</p>
          <h1 id="pi-title">Property work, taken care of — <span>on site and on record.</span></h1>
          <p className="pi-lead">ProInspect handles agreed inspections, condition reports, contractor access and practical property attendance. You receive documented outcomes and connected property records to help you stay informed and decide what happens next.</p>
          <div className="actions pi-actions">
            <a className="button" href={appOrigin+'/book'} data-pi-conversion="home-arrange">Arrange a service <span aria-hidden="true">→</span></a>
            <Link className="button secondary" to="/services" data-pi-conversion="home-explore">Explore services</Link>
          </div>
          <p className="pi-small">One-off services are available by request. Existing eligible clients can <a href={appOrigin+'/signin'}>sign in to book</a> through their portal.</p>
        </div>
        <div className="pi-hero-picture">
          <PropertyArtwork kind="residential" slot="home-hero" />
          <p>On-site work <span>·</span> Documented outcomes <span>·</span> Connected records</p>
        </div>
      </div>
    </section>
    <section className="mkt-section pi-section" id="find-service" aria-labelledby="pi-services">
      <div className="site-container">
        <header className="pi-section-head"><div><p className="eyebrow">What we do</p><h2 id="pi-services">What do you need taken care of?</h2></div><p>Start with the outcome you need, not an unfamiliar service name.</p></header>
        <div className="pi-service-grid">
          {services.map(([title,description,examples,to],i) => <article className="pi-service-card" key={to}>
            <span className="pi-number">{String(i+1).padStart(2,'0')}</span><h3>{title}</h3><p>{description}</p><p className="pi-examples">{examples}</p>
            <Link to={to} data-pi-conversion={'service-'+(i+1)}>Explore these services <span aria-hidden="true">→</span></Link>
          </article>)}
        </div>
        <p className="pi-discovery">Not sure what to book? <Link to="/service-finder" data-pi-conversion="home-finder">Find the right service <span aria-hidden="true">→</span></Link></p>
      </div>
    </section>
    <section className="mkt-section pi-section pi-tint" aria-labelledby="pi-sectors">
      <div className="site-container">
        <header className="pi-section-head"><div><p className="eyebrow">Who we support</p><h2 id="pi-sectors">The right support for your property.</h2></div><p>Residential, commercial and strata property needs call for different on-site work.</p></header>
        <div className="pi-sector-grid">{sectors.map(([label,title,description,to])=><article className="pi-sector-card" key={to}>
          <p className="pi-overline">{label}</p><h3>{title}</h3><p>{description}</p><Link to={to} data-pi-conversion={'sector-'+label}>Explore {label.toLowerCase()} <span aria-hidden="true">→</span></Link>
        </article>)}</div>
      </div>
    </section>
    <section className="mkt-section pi-section" aria-labelledby="pi-process">
      <div className="site-container">
        <header className="pi-section-head"><div><p className="eyebrow">How it works</p><h2 id="pi-process">From a property task to a useful outcome.</h2></div><Link to="/how-it-works">See the full process <span aria-hidden="true">→</span></Link></header>
        <ol className="pi-steps">{steps.map(([title,description],i)=><li key={title}><span className="pi-number">{String(i+1).padStart(2,'0')}</span><h3>{title}</h3><p>{description}</p></li>)}</ol>
        <p className="pi-small">A one-off service can be requested without an account. Eligible existing clients book through their authorised portal. Requests are subject to scope, availability and appointment confirmation.</p>
      </div>
    </section>
    <section className="mkt-section pi-section pi-record" aria-labelledby="pi-outcome">
      <div className="site-container pi-record-grid">
        <div><p className="eyebrow">More than the visit</p><h2 id="pi-outcome">See what was done. Know what needs attention.</h2>
          <p>Inspection findings, relevant photographs and attendance information stay connected with the property. When a report is issued, authorised customers can review it in their workspace.</p>
          <ul><li>Clear dated observations within the agreed scope</li><li>Relevant images or supporting notes where applicable</li><li>Follow-up matters identified for your review</li></ul>
          <Link to="/client-experience" data-pi-conversion="home-client-experience">Explore the client experience <span aria-hidden="true">→</span></Link>
        </div>
        <div className="pi-report-panel"><IllustrativeReport compact/><p>Illustrative report layout, not an actual issued report. Deliverables depend on the agreed service.</p></div>
      </div>
    </section>
    <section className="mkt-section pi-section" aria-labelledby="pi-ways">
      <div className="site-container">
        <header className="pi-section-head"><div><p className="eyebrow">Ways to work with us</p><h2 id="pi-ways">One visit, or ongoing property support.</h2></div><p>Choose the arrangement that suits the work. A one-off enquiry does not require a subscription.</p></header>
        <div className="pi-arrangements">
          <article><p className="pi-overline">For a specific task</p><h3>One-off inspections & attendance</h3><p>Request a defined inspection, condition report or authorised visit. We confirm the scope, any applicable price and the appointment.</p><a href={appOrigin+'/book'} data-pi-conversion="home-one-off">Arrange a one-off service <span aria-hidden="true">→</span></a></article>
          <article><p className="pi-overline">For a broader workload</p><h3>Planned & outsourced support</h3><p>Discuss recurring inspections, several properties or an ongoing operational need. Agree the workload and commercial terms separately.</p><Link to="/contact" data-pi-conversion="home-ongoing">Discuss ongoing support <span aria-hidden="true">→</span></Link></article>
        </div>
        <p className="pi-small">Want a property workspace? <a href={appOrigin+'/signin'}>Create a free account or sign in</a>. Registration does not activate paid subscription billing.</p>
      </div>
    </section>
    <MarketingCta title="Have a property task to arrange?" description="Choose a service or tell us what needs doing. We will confirm the practical next step." appOrigin={appOrigin}/>
  </div>;
}
