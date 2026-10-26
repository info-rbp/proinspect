import { Link, useOutletContext } from 'react-router';
import { FAMILIES, SERVICE_SEEDS } from '../../../../packages/service-catalogue/index';
import { IllustrativeReport, MarketingCta, PropertyArtwork } from '../components/marketing-ui';
import { seo } from '../lib/seo';

export const meta = () =>
  seo(
    'Property inspections & operational support',
    'On-the-ground inspections, property attendance and contractor support for residential, commercial and strata properties across our Western Australian service areas.',
    '/',
  );

const sectorCards = [
  {
    id: 'residential',
    label: 'Residential',
    heading: 'Support for rental properties.',
    description: 'Inspections and practical attendance for self-managing landlords and professional property management firms.',
    artwork: 'residential' as const,
  },
  {
    id: 'commercial',
    label: 'Commercial',
    heading: 'On-site clarity for commercial assets.',
    description: 'Condition records, make-good, contractor access and operational attendance for commercial property.',
    artwork: 'commercial' as const,
  },
  {
    id: 'strata-building',
    label: 'Strata & buildings',
    heading: 'A clearer view of shared spaces.',
    description: 'Common-property inspections, building attendance and support for authorised strata and building managers.',
    artwork: 'strata' as const,
  },
];

const featuredIds = [
  'routine-inspection',
  'property-condition-report',
  'completed-works-inspection',
  'contractor-access-attendance',
  'common-property-inspection',
  'maintenance-attendance',
];
const featured = featuredIds
  .map((id) => SERVICE_SEEDS.find((service) => service.id === id))
  .filter((service): service is (typeof SERVICE_SEEDS)[number] => Boolean(service));

const engagementCards = [
  ['pay-as-you-go', 'One-off services', 'A defined inspection or on-site attendance when you need it.'],
  ['inspection-plans', 'Inspection planning', 'Coordinate recurring property inspections with each visit confirmed.'],
  ['standard-support', 'Ongoing support', 'Discuss a clearly scoped operational workload and reporting arrangement.'],
  ['outsourced-operations', 'Outsourced operations', 'Practical on-the-ground support while your team retains its management decisions.'],
];

const processSteps = [
  ['01', 'Choose your service', 'Browse an inspection or property attendance service, or describe a custom requirement.'],
  ['02', 'Arrange the work', 'Existing eligible subscribers can book an included service; one-off customers follow the available request or quotation process.'],
  ['03', 'We attend the property', 'Once an appointment is confirmed, ProInspect carries out the agreed work subject to authorised, safe access.'],
  ['04', 'Receive the outcome', 'Issued observations and documents connect to the authorised property record.'],
];

const questions = [
  ['Do I need an ongoing arrangement?', 'No. You can request an individual service. Repeated or portfolio-wide support can be discussed separately.'],
  ['Can ProInspect attend any property?', 'Coverage, safe access, service suitability and appointment availability are confirmed before an attendance is accepted.'],
  ['What happens if further work is identified?', 'The findings can be documented for your review. Specialist assessments, repairs and additional attendance require the appropriate separate instruction.'],
  ['Can I choose a service without signing in?', 'Yes. You can explore all services and submit a one-off enquiry without an account. Online guest bookings are introduced only when enabled; existing clients use their secure portal to book included services.'],
];

export default function Home() {
  const { appOrigin } = useOutletContext<{ appOrigin: string }>();
  return (
    <>
      <section className="mkt-home-hero">
        <div className="site-container mkt-home-hero-grid">
          <div className="mkt-hero-copy">
            <p className="eyebrow">Property inspections &amp; operational support</p>
            <h1>Real property work.<br /><span>Clearly documented.</span><br />Connected over time.</h1>
            <p className="mkt-hero-lead">
              Inspections, property attendance and contractor support for residential, commercial
              and strata properties. Practical on-site work, clear records and useful next steps.
            </p>
            <div className="actions mkt-hero-actions">
              <Link className="button" to="/services">Explore services <span aria-hidden="true">→</span></Link>
              <Link className="button secondary" to="/contact">Discuss your needs</Link>
            </div>
            <div className="mkt-hero-context">One property or a portfolio. One-off services or eligible subscription bookings, subject to confirmed scope and availability.</div>
            <p className="mkt-section-footnote">New to ProInspect? <Link to="/contact">Request a one-off service</Link>. Already a customer? <a href={appOrigin + '/signin'}>Sign in to your property portal</a>.</p>
          </div>
          <div className="mkt-hero-visual">
            <PropertyArtwork kind="residential" className="mkt-hero-property" slot="home-hero" />
            <div className="mkt-hero-overlay">
              <p className="mkt-kicker">The ProInspect approach</p>
              <div><span>01</span><strong>On-site work</strong></div>
              <div><span>02</span><strong>Documented outcome</strong></div>
              <div><span>03</span><strong>Connected property context</strong></div>
            </div>
          </div>
        </div>
      </section>

      <div className="mkt-assurance-strip">
        <div className="site-container mkt-assurance-items">
          <span>Western Australian property focus</span>
          <span>Residential · Commercial · Strata</span>
          <span>Agreed scope and authorised access</span>
          <span>Clear observations and service records</span>
        </div>
      </div>

      <section className="section mkt-section" id="find-service">
        <div className="site-container">
          <div className="mkt-section-heading">
            <div><p className="eyebrow">Find the right support</p><h2>What can we help you with?</h2></div>
            <Link className="mkt-text-link" to="/services">View all services <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="mkt-service-families">
            {Object.entries(FAMILIES).map(([id, family], index) => (
              <Link className="mkt-family-card" to={'/services/category/' + id} key={id}>
                <span className="mkt-card-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="mkt-family-glyph" aria-hidden="true">{['◇', '⌂', '⊕', '↗', '▤', '◎'][index]}</span>
                <strong>{family.name}</strong>
                <span className="mkt-card-description">{family.description}</span>
                <span className="mkt-card-arrow" aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
          <p className="mkt-section-footnote">Not sure which service fits? <Link to="/contact">Describe the property task</Link> and we can help clarify an appropriate scope.</p>
        </div>
      </section>

      <section className="section mkt-section mkt-stone">
        <div className="site-container">
          <div className="mkt-section-heading">
            <div><p className="eyebrow">Who we help</p><h2>Different properties. The right support.</h2></div>
            <p>Services shaped around the needs of the people responsible for each property.</p>
          </div>
          <div className="mkt-sector-grid">
            {sectorCards.map((sector) => (
              <Link className="mkt-sector-card" key={sector.id} to={'/sectors/' + sector.id}>
                <PropertyArtwork kind={sector.artwork} slot={sector.artwork === 'strata' ? 'sector-strata' : sector.artwork === 'commercial' ? 'sector-commercial' : 'sector-residential'} />
                <div className="mkt-sector-content">
                  <span className="mkt-sector-label">{sector.label}</span>
                  <h3>{sector.heading}</h3>
                  <p>{sector.description}</p>
                  <span className="mkt-card-action">Explore {sector.label.toLowerCase()} <span aria-hidden="true">↗</span></span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section mkt-section">
        <div className="site-container">
          <div className="mkt-section-heading">
            <div><p className="eyebrow">Start here</p><h2>Services for the work that needs doing.</h2></div>
            <p>Choose a specific service to understand the purpose, attendance and documented output.</p>
          </div>
          <div className="mkt-featured-grid">
            {featured.map((service, index) => (
              <article className="mkt-featured-card" key={service.id}>
                <div className={'mkt-featured-graphic mkt-graphic-' + (index % 3)}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <span className="mkt-featured-graphic-line" aria-hidden="true" />
                </div>
                <div className="mkt-featured-content">
                  <p className="mkt-kicker">{FAMILIES[service.family].name}</p>
                  <h3>{service.name}</h3>
                  <p>{service.summary}</p>
                  <Link className="mkt-text-link" to={'/services/' + service.id}>View service details <span aria-hidden="true">↗</span></Link>
                </div>
              </article>
            ))}
          </div>
          <div className="mkt-section-outro"><Link className="button secondary" to="/services">Browse the full service catalogue <span aria-hidden="true">→</span></Link></div>
        </div>
      </section>

      <section className="section mkt-section mkt-process-section">
        <div className="site-container">
          <div className="mkt-section-heading">
            <div><p className="eyebrow">How ProInspect works</p><h2>From instruction to a documented outcome.</h2></div>
            <Link className="mkt-text-link" to="/how-it-works">Our process <span aria-hidden="true">↗</span></Link>
          </div>
          <ol className="mkt-steps">
            {processSteps.map(([number, title, detail]) => (
              <li key={number}>
                <span className="mkt-step-number">{number}</span>
                <h3>{title}</h3>
                <p>{detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section mkt-section mkt-proof-section">
        <div className="site-container mkt-proof-grid">
          <div className="mkt-proof-copy">
            <p className="eyebrow">Inside the outcome</p>
            <h2>Not just another appointment. A useful record.</h2>
            <p>
              The work at a property is only part of the story. An issued inspection report or
              service record helps the authorised customer see what was observed and what may need
              attention next.
            </p>
            <ul className="mkt-check-list">
              <li>Documented observations within the agreed service scope</li>
              <li>Relevant photographs or supporting information where applicable</li>
              <li>Clearly identified matters requiring review or follow-up</li>
              <li>An issued result linked to the relevant property account</li>
            </ul>
            <Link className="button secondary" to="/client-experience">Explore the client experience <span aria-hidden="true">→</span></Link>
          </div>
          <div className="mkt-report-display">
            <IllustrativeReport />
            <p className="mkt-image-disclosure">Illustrative report design. Final report formats and inclusions depend on the service scope.</p>
          </div>
        </div>
      </section>

      <section className="section mkt-section">
        <div className="site-container">
          <div className="mkt-section-heading">
            <div><p className="eyebrow">Ways to work with us</p><h2>One visit. Or a broader working arrangement.</h2></div>
            <p>Choose a defined service or discuss recurring support suited to your responsibilities and workload.</p>
          </div>
          <div className="mkt-engagement-grid">
            {engagementCards.map(([slug, title, description], index) => (
              <article className="mkt-engagement-card" key={slug}>
                <span className="mkt-card-number">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{description}</p>
                <Link className="mkt-text-link" to={'/how-we-work/' + slug}>How it works <span aria-hidden="true">↗</span></Link>
              </article>
            ))}
          </div>
          <p className="mkt-section-footnote">Every engagement is subject to confirmed service scope, availability and commercial terms.</p>
        </div>
      </section>

      <section className="section mkt-section mkt-stone">
        <div className="site-container mkt-difference-grid">
          <div><p className="eyebrow">Why ProInspect</p><h2>Work on the ground. Clarity in the details.</h2></div>
          <div className="mkt-difference-items">
            <div><span>01</span><div><h3>Practical presence</h3><p>Defined inspections and authorised attendance for the task that needs physical attention.</p></div></div>
            <div><span>02</span><div><h3>Useful documentation</h3><p>Observations, records and relevant next steps—not vague assurances that everything is fine.</p></div></div>
            <div><span>03</span><div><h3>Connected context</h3><p>Issued work and property information stay organised for authorised customers.</p></div></div>
            <Link className="mkt-text-link" to="/why-proinspect">Explore the ProInspect approach <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </section>

      <section className="section mkt-section mkt-faq-section">
        <div className="site-container mkt-faq-grid">
          <div><p className="eyebrow">Good to know</p><h2>Questions before you begin.</h2><p>Some details depend on the property, instruction and service.</p></div>
          <div className="mkt-faq-list">
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}<span aria-hidden="true">+</span></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <MarketingCta
        title="What does your property need next?"
        description="Explore the right service or tell us about the property task, issue or ongoing support you have in mind."
        appOrigin={appOrigin}
      />
    </>
  );
}
