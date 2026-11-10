import { Link } from 'react-router';
import buildingOperationsImage from './images/building-operations.jpg';
import contractorAccessImage from './images/contractor-access.jpg';
import inspectionImage from './images/inspection.jpg';
import maintenanceImage from './images/maintenance.jpg';

const services = [
  [
    'Inspections & reports',
    'Understand the condition of your property through routine, incoming, outgoing and commercial inspections.',
    'Routine inspections · Condition reports · Exit inspections',
    '/services/category/inspections',
    inspectionImage,
    'Inspection checklist ready for a property assessment',
  ],
  [
    'Maintenance & follow-up',
    'Have reported problems, repairs or completed work checked and documented.',
    'Maintenance visits · Completed works · Reinspections',
    '/services/category/maintenance',
    maintenanceImage,
    'Maintenance tools prepared for property repairs',
  ],
  [
    'Access & contractor support',
    'Arrange authorised contractor access, key handovers and agreed supervision attendance.',
    'Contractor access · Key handovers · Supervision',
    '/services/category/access',
    contractorAccessImage,
    'Property keys being handed over for authorised access',
  ],
  [
    'Building & property operations',
    'Get help with practical on-site tasks across buildings, managed properties and portfolios.',
    'Building attendance · Meetings · Handovers',
    '/services/category/attendance',
    buildingOperationsImage,
    'Commercial buildings supported by property operations',
  ],
] as const;

export function HomeServicesSection() {
  return (
    <section className="mkt-section pi-section" id="find-service" aria-labelledby="pi-services">
      <div className="site-container">
        <header className="pi-section-head">
          <div>
            <p className="eyebrow">What we do</p>
            <h2 id="pi-services">Where you can provide support?</h2>
          </div>
        </header>
        <div className="pi-service-grid">
          {services.map(([title, description, examples, to, image, imageAlt], index) => (
            <article className="pi-service-card" key={to}>
              <img
                src={image}
                alt={imageAlt}
                loading="lazy"
                decoding="async"
                style={{
                  display: 'block',
                  width: '100%',
                  aspectRatio: '16 / 10',
                  objectFit: 'cover',
                  borderRadius: 8,
                  marginBottom: 22,
                }}
              />
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
