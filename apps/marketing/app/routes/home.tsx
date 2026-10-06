import { Link, useOutletContext } from 'react-router';
import { FAMILIES, SERVICE_SEEDS } from '../../../../packages/service-catalogue/index';
import { seo } from '../lib/seo';
export const meta = () =>
  seo(
    'Property inspections & operational support',
    'Inspection, property attendance, contractor access and ongoing property support across residential, commercial and strata properties.',
    '/',
  );
export default function Home() {
  const { appOrigin } = useOutletContext<{ appOrigin: string }>();
  return (
    <>
      <section className="site-hero">
        <div className="site-container hero-grid">
          <div>
            <p className="eyebrow">Residential · Commercial · Strata</p>
            <h1>
              The work gets done.
              <br />
              <em>The property record stays.</em>
            </h1>
            <p className="lead">
              Inspections, property attendance and on-the-ground operational support. From one visit
              to ongoing portfolio support, keep the work connected to the property.
            </p>
            <div className="actions">
              <a className="button" href={`${appOrigin}/book`}>
                Book a service →
              </a>
              <Link className="button secondary" to="/services">
                Explore services
              </Link>
            </div>
          </div>
          <div className="hero-board">
            <p className="eyebrow">The ProInspect approach</p>
            <h2>
              One property.
              <br />A connected service history.
            </h2>
            <p>From the first instruction to the final report.</p>
            {[
              ['01', 'Choose your service', 'Inspections, attendance and property support'],
              ['02', 'We carry out the work', 'Agreed scope, authorised access and clear records'],
              ['03', 'Keep the result', 'Reports and documents in your property account'],
            ].map(([n, title, text]) => (
              <div className="record-row" key={n}>
                <div>
                  <div className="record-title">{title}</div>
                  <p className="small">{text}</p>
                </div>
                <span>{n}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="site-container">
        <div className="proof-bar">
          <span>Private self-managing landlords</span>
          <span>Property management firms</span>
          <span>Commercial owners</span>
          <span>Strata & building operators</span>
        </div>
      </div>
      <section className="section">
        <div className="site-container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">What do you need?</p>
              <h2>Practical help at the property.</h2>
            </div>
            <p>
              Find the service that solves the immediate problem, or talk to us about recurring
              support.
            </p>
          </div>
          <div className="grid-3">
            {Object.entries(FAMILIES).map(([id, f], i) => (
              <article className="service-card" key={id}>
                <span className="index">0{i + 1}</span>
                <h3>{f.name}</h3>
                <p>{f.description}</p>
                <Link to={`/services?family=${id}`}>Explore {f.name.toLowerCase()} →</Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section soft">
        <div className="site-container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">A different setting. The right support.</p>
              <h2>Built around the property you manage.</h2>
            </div>
          </div>
          <div className="grid-3">
            {[
              [
                'residential',
                'Residential',
                'Independent inspection and attendance support for self-managing landlords and agencies.',
              ],
              [
                'commercial',
                'Commercial',
                'Condition, make-good, contractor attendance and property operations support.',
              ],
              [
                'strata-building',
                'Strata & buildings',
                'Common-property inspections, building attendance and contractor support.',
              ],
            ].map(([id, title, text]) => (
              <article className="service-card" key={id}>
                <h3>{title}</h3>
                <p>{text}</p>
                <Link to={`/sectors/${id}`}>View services →</Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="site-container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Inspection & attendance</p>
              <h2>Start with the service you need now.</h2>
            </div>
            <Link to="/services">View the full catalogue →</Link>
          </div>
          <div className="grid-3">
            {SERVICE_SEEDS.filter((s) =>
              [
                'routine-inspection',
                'property-condition-report',
                'final-exit-inspection',
                'common-property-inspection',
                'maintenance-attendance',
                'completed-works-inspection',
              ].includes(s.id),
            ).map((s) => (
              <article className="service-card" key={s.id}>
                <h3>{s.name}</h3>
                <p>{s.summary}</p>
                <Link to={`/services/${s.id}`}>What is included →</Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section dark">
        <div className="site-container hero-grid">
          <div>
            <p className="eyebrow" style={{ color: '#a4d6d0' }}>
              More than an email attachment
            </p>
            <h2 style={{ fontSize: '2.4rem' }}>
              Your property work,
              <br />
              kept together.
            </h2>
            <p style={{ margin: '1.3rem 0' }}>
              Your ProInspect account provides a place for bookings, requests and issued reports.
              Each service contributes to the history of the property.
            </p>
            <Link className="button secondary" to="/client-experience">
              Explore the client experience
            </Link>
          </div>
          <div className="stack">
            <div className="record-row">
              <h3>Account → Property</h3>
              <span>01</span>
            </div>
            <div className="record-row">
              <h3>Service → Work order</h3>
              <span>02</span>
            </div>
            <div className="record-row">
              <h3>Report → Property record</h3>
              <span>03</span>
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="site-container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Ways to work with us</p>
              <h2>One visit or ongoing support.</h2>
            </div>
            <p>
              Start with a defined service. Broader operational arrangements are scoped around your
              property or portfolio.
            </p>
          </div>
          <div className="grid-4">
            {['Pay as you go', 'Inspection plans', 'Standard support', 'Outsourced operations'].map(
              (name, i) => (
                <article className="service-card" key={name}>
                  <span className="index">0{i + 1}</span>
                  <h3>{name}</h3>
                  <p>
                    {i === 0
                      ? 'Request a specific inspection or attendance.'
                      : 'Discuss a recurring arrangement with a clear service scope.'}
                  </p>
                  <Link to="/how-it-works">Explore the approach →</Link>
                </article>
              ),
            )}
          </div>
        </div>
      </section>
      <section className="section soft">
        <div className="site-container section-heading">
          <div>
            <p className="eyebrow">Take the next step</p>
            <h2>What does your property need?</h2>
          </div>
          <div className="actions">
            <a className="button" href={`${appOrigin}/book`}>
              Book a service
            </a>
            <Link className="button secondary" to="/contact">
              Talk to ProInspect
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
