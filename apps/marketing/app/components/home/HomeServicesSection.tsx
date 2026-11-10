import { Link } from 'react-router';

const services = [
  [
    'Inspections & reports',
    'Understand the condition of your property through routine, incoming, outgoing and commercial inspections.',
    'Routine inspections · Condition reports · Exit inspections',
    '/services/category/inspections',
  ],
  [
    'Maintenance & follow-up',
    'Have reported problems, repairs or completed work checked and documented.',
    'Maintenance visits · Completed works · Reinspections',
    '/services/category/maintenance',
  ],
  [
    'Access & contractor support',
    'Arrange authorised contractor access, key handovers and agreed supervision attendance.',
    'Contractor access · Key handovers · Supervision',
    '/services/category/access',
  ],
  [
    'Building & property operations',
    'Get help with practical on-site tasks across buildings, managed properties and portfolios.',
    'Building attendance · Meetings · Handovers',
    '/services/category/attendance',
  ],
] as const;

export function HomeServicesSection() {
  return (
    <section className="mkt-section pi-section" id="find-service" aria-labelledby="pi-services">
      <div className="site-container">
        <header className="pi-section-head">
          <div>
            <p className="eyebrow">What we do</p>
            <h2 id="pi-services">What do you need taken care of?</h2>
          </div>
          <p>Start with the outcome you need, not an unfamiliar service name.</p>
        </header>
        <div className="pi-service-grid">
          {services.map(([title, description, examples, to], index) => (
            <article className="pi-service-card" key={to}>
              <span className="pi-number">{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{description}</p>
              <p className="pi-examples">{examples}</p>
              <Link to={to} data-pi-conversion={'service-' + (index + 1)}>
                Explore these services <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>
        <p className="pi-discovery">
          Not sure what to book?{' '}
          <Link to="/service-finder" data-pi-conversion="home-finder">
            Find the right service <span aria-hidden="true">→</span>
          </Link>
        </p>
      </div>
    </section>
  );
}
