import { Link, useSearchParams } from 'react-router';
import { FAMILIES, SERVICE_SEEDS } from '../../../../packages/service-catalogue/index';
import { MarketingCta } from '../components/marketing-ui';
import { MarketingPageHero, MarketingServiceGrid, MarketingSectionTitle } from '../components/page-patterns';
import { seo } from '../lib/seo';

export const meta = () =>
  seo(
    'Property services',
    'Explore inspections, maintenance attendance, contractor access and property operations support.',
    '/services',
  );

export default function Services() {
  const [search] = useSearchParams();
  const requestedFamily = search.get('family');
  // Support existing inbound ?family= links, while linking visitors to the canonical category pages.
  const family = requestedFamily && FAMILIES[requestedFamily] ? requestedFamily : null;
  const list = family ? SERVICE_SEEDS.filter((service) => service.family === family) : SERVICE_SEEDS;
  return (
    <>
      <MarketingPageHero
        eyebrow="The service catalogue"
        title={family ? FAMILIES[family].name : 'The right service for the property.'}
        intro="From inspections and property attendance to contractor access and ongoing operational support. Explore the purpose, scope and recorded outcome before you choose."
        crumbs={[{ label: 'Services' }]}
        visual="services"
        primary={{ label: 'Discuss your needs', to: '/contact' }}
      />
      <section className="section mkt-section" id="service-categories">
        <div className="site-container">
          <MarketingSectionTitle
            eyebrow="Explore by service type"
            title="Find the work you need done."
            description="Six service families bring inspections, attendance and operations together without mixing different service scopes."
          />
          <div className="mkt-service-families">
            {Object.entries(FAMILIES).map(([id, entry], i) => (
              <Link key={id} className="mkt-family-card" to={'/services/category/' + id}>
                <span className="mkt-card-number">{String(i + 1).padStart(2, '0')}</span>
                <span className="mkt-family-glyph" aria-hidden="true">{['◇', '⌂', '⊕', '↗', '▤', '◎'][i]}</span>
                <strong>{entry.name}</strong>
                <span className="mkt-card-description">{entry.description}</span>
                <span className="mkt-card-arrow" aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="section mkt-section mkt-stone" id="browse-services">
        <div className="site-container">
          <MarketingSectionTitle
            eyebrow="Service details"
            title={family ? FAMILIES[family].name : 'Browse the complete service catalogue.'}
            description="Every service has its own purpose and intended output. We confirm the accepted scope, access, timing and commercial terms before attendance."
          />
          <nav className="mkt-category-pills" aria-label="Service categories">
            <Link to="/services" aria-current={!family ? 'page' : undefined}>All services</Link>
            {Object.entries(FAMILIES).map(([id, entry]) => (
              <Link key={id} to={'/services/category/' + id}>{entry.name}</Link>
            ))}
          </nav>
          <MarketingServiceGrid services={list} />
        </div>
      </section>
      <section className="section mkt-section">
        <div className="site-container mkt-callout-grid">
          <div>
            <p className="eyebrow">Not sure where to begin?</p>
            <h2>Start with the property problem, not a service name.</h2>
            <p>Tell us what needs attending, inspecting or documenting. We can help identify a suitable service and clarify when specialist work may be required.</p>
          </div>
          <div className="mkt-callout-panel">
            <span className="mkt-card-number">A USEFUL FIRST INSTRUCTION</span>
            <p>Include the general property location, the outcome you want and any known access or safety restrictions. Avoid sending private access codes or sensitive tenancy records in a public enquiry.</p>
            <Link className="button secondary" to="/contact">Describe your property requirement <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>
      <MarketingCta title="Ready to arrange property work?" description="Choose the relevant service or discuss a tailored, recurring requirement. Every attendance is subject to confirmed scope and availability." />
    </>
  );
}
