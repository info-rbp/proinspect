import { Link, useOutletContext, useSearchParams } from 'react-router';
import { FAMILIES } from '../../../../packages/service-catalogue/index';
import { MarketingCta } from '../components/marketing-ui';
import { MarketingPageHero, MarketingSectionTitle } from '../components/page-patterns';
import { seo } from '../lib/seo';
import accessImage from './images/service-access.jpg';
import attendanceImage from './images/service-attendance.jpg';
import documentsImage from './images/service-documents.jpg';
import inspectionsImage from './images/service-inspections.jpg';
import maintenanceImage from './images/service-maintenance.jpg';
import operationsImage from './images/service-operations.jpg';

const familyImages: Record<string, { src: string; alt: string }> = {
  inspections: {
    src: inspectionsImage,
    alt: 'Residential interior ready for a property inspection',
  },
  attendance: {
    src: attendanceImage,
    alt: 'Property professional attending a residential property',
  },
  maintenance: {
    src: maintenanceImage,
    alt: 'Maintenance tools ready for property repair work',
  },
  access: {
    src: accessImage,
    alt: 'Property key provided for authorised access',
  },
  documents: {
    src: documentsImage,
    alt: 'Property documents being reviewed and completed',
  },
  operations: {
    src: operationsImage,
    alt: 'Properties supported through ongoing operations',
  },
};

export const meta = () =>
  seo(
    'Property Inspections & Attendance Services — WA',
    'Compare 23 residential, commercial and strata property inspection, contractor access, maintenance attendance and building support services in Western Australia.',
    '/services',
  );

export default function Services() {
  const { appOrigin } = useOutletContext<{ appOrigin: string }>();
  const [search] = useSearchParams();
  const requestedFamily = search.get('family');
  // Support existing inbound ?family= links, while linking visitors to the canonical category pages.
  const family = requestedFamily && FAMILIES[requestedFamily] ? requestedFamily : null;
  return (
    <>
      <MarketingPageHero
        eyebrow="The service catalogue"
        title={family ? FAMILIES[family].name : 'The right service for the property.'}
        intro="From inspections and property attendance to contractor access and ongoing operational support. Explore the purpose, scope and recorded outcome before you choose."
        crumbs={[{ label: 'Services' }]}
        visual="services"
        primary={{ label: 'Find the right service', to: '/service-finder' }}
      />
      <section className="section mkt-section" id="service-categories">
        <div className="site-container">
          <MarketingSectionTitle
            eyebrow="Explore by service type"
            title="Find the work you need done."
          />
          <div className="mkt-service-families">
            {Object.entries(FAMILIES).map(([id, entry], i) => {
              const image = familyImages[id];
              return (
                <Link key={id} className="mkt-family-card" to={'/services/category/' + id}>
                  <span className="mkt-card-number">{String(i + 1).padStart(2, '0')}</span>
                  <img
                    src={image.src}
                    alt={image.alt}
                    loading="lazy"
                    decoding="async"
                    style={{
                      display: 'block',
                      width: '100%',
                      aspectRatio: '16 / 9',
                      objectFit: 'cover',
                      borderRadius: 6,
                      margin: '14px 0 18px',
                    }}
                  />
                  <strong>{entry.name}</strong>
                  <span className="mkt-card-description">{entry.description}</span>
                  <span className="mkt-card-arrow" aria-hidden="true">
                    ↗
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
      <section
        className="section mkt-section mkt-stone"
        id="browse-services"
        aria-labelledby="account-cta-title"
      >
        <div className="site-container mkt-callout-grid">
          <div>
            <p className="eyebrow">Your property workspace</p>
            <h2 id="account-cta-title">Keep every property task connected in one account.</h2>
            <p>
              Create your secure ProInspect account to arrange services, follow property work and
              access issued reports without searching across emails and separate records.
            </p>
          </div>
          <div className="mkt-callout-panel">
            <span className="mkt-card-number">FREE ACCOUNT</span>
            <h3>Get started with your email address.</h3>
            <p>
              We will send you a secure one-time link. If you are new to ProInspect, your account is
              created as part of the sign-in process.
            </p>
            <a
              className="button"
              href={appOrigin + '/signin'}
              data-pi-conversion="services-create-account"
            >
              Create your account <span aria-hidden="true">→</span>
            </a>
            <p className="small">
              Creating an account does not activate paid subscription billing.
            </p>
          </div>
        </div>
      </section>
      <section className="section mkt-section">
        <div className="site-container mkt-callout-grid">
          <div>
            <p className="eyebrow">Not sure where to begin?</p>
            <h2>Start with the property problem, not a service name.</h2>
            <p>
              Tell us what needs inspecting, attending or documenting, or use the{' '}
              <Link to="/service-finder">guided service finder</Link> to compare relevant options.
              Technical assessments and other specialist work are separately scoped.
            </p>
          </div>
          <div className="mkt-callout-panel">
            <span className="mkt-card-number">A USEFUL FIRST INSTRUCTION</span>
            <p>
              Include the general property location, the outcome you want and any known access or
              safety restrictions. Avoid sending private access codes or sensitive tenancy records
              in a public enquiry.
            </p>
            <Link className="button secondary" to="/contact">
              Describe your property requirement <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
      <MarketingCta
        title="Ready to arrange property work?"
        description="Choose the relevant service or discuss a tailored, recurring requirement. Every attendance is subject to confirmed scope and availability."
        appOrigin={appOrigin}
      />
    </>
  );
}
