import { Link } from 'react-router';
import { SECTOR_OVERVIEWS } from '../../../../packages/marketing/sector-overviews';
import { BrandImage, type BrandImageKey } from '../components/brand-image';
import { EditorialHero, EditorialSteps } from '../components/editorial';
import { MarketingCta } from '../components/marketing-ui';
import { seo } from '../lib/seo';

const services: Array<{ key: BrandImageKey; name: string; copy: string; to: string }> = [
  ...Object.entries(SECTOR_OVERVIEWS)
    .filter(([key]) => key !== 'maintenance')
    .map(([key, page]) => ({
      key: key as BrandImageKey,
      name: page.name,
      copy: page.summary,
      to: '/' + key,
    })),
  {
    key: 'leasing',
    name: 'Leasing',
    copy: 'Find your next place, explore published properties and register for an open home. Follow each property’s application instructions when you are ready.',
    to: '/leasing',
  },
  {
    key: 'maintenance',
    name: 'Maintenance',
    copy: SECTOR_OVERVIEWS.maintenance.summary,
    to: '/maintenance',
  },
];

export const meta = () =>
  seo(
    'Property Inspections, Outsourced Operations & Building Services — Perth & Peel',
    'Inspections, outsourced property operations and building services across Perth and Peel. Residential, commercial, strata, Co-Living, Student Living and construction support.',
    '/',
  );

export default function Home() {
  return (
    <div className="pi-public-home">
      <EditorialHero
        home
        eyebrow="ProInspect Property Services · Western Australia"
        title="Your property. Our practical support."
        intro="Inspections. Outsourced property operations. Building services. From a single condition report to ongoing operational support, we connect practical work with clear records for owners, managers and building teams across Perth and Peel."
        image="residential"
        primary={{ label: 'Explore our services', to: '#property-services' }}
        secondary={{ label: 'Sign Up / Sign In', to: '/client' }}
      />
      <section className="mkt-section pi-editorial-section" id="property-services">
        <div className="site-container">
          <div className="pi-section-heading pi-section-heading-wide">
            <div>
              <p className="eyebrow">How we can help</p>
              <h2>The right support for every kind of property.</h2>
            </div>
            <p>
              Homes, workplaces, shared buildings and projects. Choose a one-off service, an
              approved subscription or a tailored scope that fits the property and your responsibilities.
            </p>
          </div>
          <div className="pi-property-grid">
            {services.map((service) => (
              <article className="pi-property-card" key={service.key}>
                <Link
                  className="pi-card-image-link"
                  to={service.to}
                  aria-label={'Explore ' + service.name.toLowerCase() + ' services'}
                >
                  <BrandImage name={service.key} />
                </Link>
                <div>
                  <h3>
                    <Link to={service.to}>{service.name}</Link>
                  </h3>
                  <p>{service.copy}</p>
                  <Link className="pi-inline-link" to={service.to}>
                    Explore {service.name.toLowerCase()} <span aria-hidden="true">↗</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <p className="pi-discovery">
            Have a specific task in mind?{' '}
            <Link to="/services">Browse the detailed service catalogue</Link> or{' '}
            <Link to="/service-finder">find a service.</Link>
          </p>
        </div>
      </section>
      <section className="mkt-section pi-editorial-section pi-deep">
        <div className="site-container pi-introduction">
          <div>
            <p className="eyebrow">More than another site visit</p>
            <h2>
              Practical work.
              <br />A clearer picture.
            </h2>
          </div>
          <div>
            <p>
              Residential Inspection Only is $20 + GST per property/month. Residential All-Inclusive
              and Commercial All-Inclusive are each $150 + GST per property/month. Each has an initial
              24-month term, then continues month-to-month with 60 days’ written cancellation notice.
              Inclusions, allowances, extras and any early-exit obligations are agreed before you commit.
            </p>
            <ul className="pi-principles">
              <li>Inspections: factual condition records for the next decision</li>
              <li>Outsourced operations: administration, attendance and follow-through</li>
              <li>Building services: presentation, grounds, minor works and specialist coordination</li>
            </ul>
            <Link className="pi-inline-link" to="/about">
              Discover the ProInspect approach <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </section>
      <EditorialSteps />
      <section className="mkt-section pi-editorial-section">
        <div className="site-container pi-tenant-feature">
          <BrandImage name="leasing" />
          <div>
            <p className="eyebrow">Looking for your next home?</p>
            <h2>A clearer path from viewing to moving.</h2>
            <p>
              Browse current properties, register for an advertised open home and find the
              application instructions for the home you are interested in. Already a tenant? Find
              the right support for your property.
            </p>
            <div className="actions">
              <Link className="button" to="/leasing">
                View properties for lease <span aria-hidden="true">→</span>
              </Link>
              <Link className="pi-inline-link" to="/tenants">
                Support for tenants <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <MarketingCta
        title="Let’s make property work easier."
        description="Tell us what you need inspected, attended or followed up. We’ll help you find the right starting point."
      />
    </div>
  );
}
