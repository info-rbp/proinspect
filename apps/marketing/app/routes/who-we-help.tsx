import { Link } from 'react-router';
import { AUDIENCES } from '../../../../packages/marketing/audiences';
import { EditorialHero } from '../components/editorial';
import { MarketingCta } from '../components/marketing-ui';
import { seo } from '../lib/seo';

const priorities: Record<string, string[]> = {
  'private-landlords': [
    'Rental inspections and condition reports',
    'Authorised access when you cannot attend',
    'Maintenance observations and follow-up',
  ],
  'property-management-agencies': [
    'Extra on-site capacity for your team',
    'Defined inspection and attendance instructions',
    'Property records for authorised colleagues',
  ],
  'commercial-property-owners': [
    'Visible-condition and handover observations',
    'Contractor access and site attendance',
    'A clearer view of your commercial asset',
  ],
  'commercial-asset-managers': [
    'Practical support across a portfolio',
    'Site visits with an agreed reporting outcome',
    'Facilities and completed-work observations',
  ],
  'strata-managers': [
    'Common-property inspections',
    'Building attendance and contractor access',
    'Documented follow-up for the scheme',
  ],
  'building-operators': [
    'A presence on site for agreed tasks',
    'Access coordination and operational observations',
    'Clear records for the responsible building team',
  ],
};

export const meta = () =>
  seo(
    'Who We Help — Owners, Agencies, Strata & Tenants',
    'Property inspections and practical support for WA landlords, residential agencies, commercial owners, asset managers, strata teams and tenants.',
    '/who-we-help',
    { type: 'CollectionPage', breadcrumbs: [{ name: 'Who We Help', path: '/who-we-help' }] },
  );

export default function WhoWeHelp() {
  return (
    <>
      <EditorialHero
        eyebrow="Who We Help"
        title="The right support for the role you play."
        intro="From private landlords and agencies to commercial owners, strata teams, Co-Living and Student Living operators and construction teams, we combine inspections, outsourced operations and building services around your responsibilities."
        image="strata"
        primary={{ label: 'Find your service', to: '/service-finder' }}
        secondary={{ label: 'Talk through your requirements', to: '/contact' }}
      />
      <section className="mkt-section pi-editorial-section">
        <div className="site-container">
          <div className="pi-section-heading">
            <p className="eyebrow">People and property</p>
            <h2>Less time coordinating. More clarity to act.</h2>
            <p>
              Choose the role that best describes you. We agree who can instruct the work, the
              service scope and who should receive the resulting record.
            </p>
          </div>
          <div className="pi-audience-grid">
            {Object.entries(AUDIENCES).map(([slug, audience]) => (
              <article key={slug}>
                <p className="eyebrow">
                  {audience.visual === 'strata'
                    ? 'Shared buildings'
                    : audience.visual === 'commercial'
                      ? 'Commercial property'
                      : 'Residential property'}
                </p>
                <h3>{audience.name}</h3>
                <p>{audience.description}</p>
                <ul>
                  {(
                    priorities[slug] ?? [
                      'Defined property attendance',
                      'Useful observations and connected records',
                    ]
                  ).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <Link className="pi-inline-link" to={'/who-we-help/' + slug}>
                  Explore support for your role <span aria-hidden="true">↗</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="mkt-section pi-editorial-section pi-neutral">
        <div className="site-container pi-introduction">
          <div>
            <p className="eyebrow">More ways we can help</p>
            <h2>Property support includes the people who live there.</h2>
            <p>
              Find the right path whether you are looking for a rental, living in a property or
              planning a new operating model.
            </p>
          </div>
          <div className="pi-support-list">
            <article>
              <h3>Tenants and prospective renters</h3>
              <p>
                Browse current properties, register for inspections and find the right channel for
                maintenance and property access questions.
              </p>
              <Link className="pi-inline-link" to="/tenants">
                Tenant support <span aria-hidden="true">→</span>
              </Link>
            </article>
            <article>
              <h3>Co-living operators</h3>
              <p>
                Tailored room and shared-area inspections, resident onboarding, turnover
                coordination and everyday property support for Co-Living and Student Living.
                Scope services separately from dedicated room and occupancy software releases.
              </p>
              <Link className="pi-inline-link" to="/co-living">
                Explore co-living <span aria-hidden="true">→</span>
              </Link>
            </article>
            <article>
              <h3>Owners and construction teams</h3>
              <p>
                Tailored project coordination, progress records, site attendance and handover
                follow-up alongside your appointed builder and professional advisers.
              </p>
              <Link className="pi-inline-link" to="/construction">
                Explore construction <span aria-hidden="true">→</span>
              </Link>
            </article>
          </div>
        </div>
      </section>
      <MarketingCta
        title="Start with the work you need help with."
        description="You do not need to have every detail worked out. Tell us the property type, suburb and intended outcome, and we’ll help identify the right next step."
      />
    </>
  );
}
