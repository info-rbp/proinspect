import { Link } from 'react-router';
import { EditorialHero } from './editorial';
import {
  ServiceSection,
  ServiceTiles,
  SubscriptionFeature,
  ServiceFaq,
  ServiceCta,
} from './service-page';
import { SECTOR_OVERVIEWS } from '../../../../packages/marketing/sector-overviews';
import { MAINTENANCE_APPROVAL } from '../../../../packages/marketing/public-facts';
export function MaintenanceLanding() {
  return (
    <>
      <EditorialHero
        eyebrow="Property maintenance"
        title="Taking Care of Your Property. Taking Care of the Details."
        intro="From everyday maintenance concerns to planned property care, keep your property functioning well through practical support, approved contractor coordination and clear follow-up."
        image="maintenance"
        primary={{ label: 'Explore our maintenance solutions', to: '#maintenance-solutions' }}
        secondary={{ label: 'Discuss your requirements', to: '/contact' }}
      />
      <ServiceSection
        id="maintenance-solutions"
        eyebrow="Maintenance solutions"
        title="Practical care, when your property needs it."
        intro="Choose a single task or discuss a recurring scope. Availability, authority, access and costs are confirmed before work starts."
      >
        <ServiceTiles
          items={[
            {
              title: 'Reactive maintenance',
              copy: 'Record an unexpected issue and arrange an instructed attendance to help identify the right next step.',
              icon: 'tools',
              href: '/services/maintenance-attendance',
              action: 'Explore maintenance attendance',
            },
            {
              title: 'Preventative property care',
              copy: 'Discuss condition checks and planned care that bring emerging maintenance needs to your attention.',
              icon: 'calendar',
              href: '/contact?topic=preventative-care',
              action: 'Discuss planned care',
            },
            {
              title: 'Contractor coordination',
              copy: 'Keep approved quotations, qualified trades, lawful site access and practical follow-up together.',
              icon: 'people',
              href: '/residential/services/maintenance-management',
              action: 'Explore maintenance management',
            },
            {
              title: 'General property care',
              copy: 'Agree safe minor tasks, property presentation, gardens and waste support. Regulated work stays with qualified trades.',
              icon: 'home',
              href: '/contact?topic=property-care',
              action: 'Discuss property care',
            },
          ]}
        />
      </ServiceSection>
      <ServiceSection
        eyebrow="Property care across our services"
        title="Support that understands the setting."
        neutral
      >
        <ServiceTiles
          items={[
            {
              title: 'Residential',
              copy: 'Rental maintenance and property presentation for authorised owners and agencies.',
              icon: 'home',
              href: '/residential',
              action: 'Residential support',
            },
            {
              title: 'Co-Living',
              copy: 'Shared facilities and resident-reported concerns within the agreed operating arrangement.',
              icon: 'people',
              href: '/co-living',
              action: 'Co-Living information',
            },
            {
              title: 'Commercial',
              copy: 'Discuss premises care and operating requirements. Commercial services remain enquiry-based.',
              icon: 'building',
              href: '/contact?topic=commercial-maintenance',
              action: 'Discuss commercial requirements',
            },
            {
              title: 'Co-Working',
              copy: 'Discuss workplace presentation and shared facilities. Scope and availability are yet to be confirmed.',
              icon: 'building',
              href: '/contact?topic=co-working-maintenance',
              action: 'Discuss Co-Working requirements',
            },
          ]}
        />
      </ServiceSection>
      <ServiceSection
        id="property-care-process"
        eyebrow="Connected property care"
        title="From the first concern to the final outcome."
        intro="One clear process keeps the request, approval and outcome connected to your property."
      >
        <ol className="pi-process-list pi-care-process">
          <li>
            <span className="pi-step-number">01</span>
            <h3>Understand the issue</h3>
            <p>
              Record the location, visible conditions and safe access requirements. Identify when a
              qualified specialist is needed.
            </p>
          </li>
          <li>
            <span className="pi-step-number">02</span>
            <h3>Agree the work</h3>
            <p>
              {MAINTENANCE_APPROVAL} There is no automatic spending allowance; variations need
              approval too.
            </p>
          </li>
          <li>
            <span className="pi-step-number">03</span>
            <h3>Coordinate attendance</h3>
            <p>
              Arrange authorised access and appropriate contractors. Regulated repairs and
              specialist certification remain with qualified providers.
            </p>
          </li>
          <li>
            <span className="pi-step-number">04</span>
            <h3>Record the outcome</h3>
            <p>
              Review visible completion, retain the relevant records and identify outstanding items
              requiring a further decision.
            </p>
          </li>
        </ol>
      </ServiceSection>
      <section className="mkt-section pi-editorial-section pi-neutral">
        <div className="site-container pi-assistance-notice">
          <div>
            <p className="eyebrow">Tenants and residents</p>
            <h2>Reporting an issue at home?</h2>
            <p>
              Use your property’s nominated reporting channel or authorised tenant workspace. Follow
              the urgent-repair instructions from your responsible landlord or manager. This website
              is not an emergency reporting service.
            </p>
          </div>
          <Link className="button secondary" to="/tenants#maintenance-help">
            Find tenant maintenance help <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
      <SubscriptionFeature kind="maintenance" />
      <ServiceFaq questions={SECTOR_OVERVIEWS.maintenance.questions} />
      <ServiceCta
        title="Keep your property care moving."
        copy="Discuss an individual task or an agreed maintenance programme. We confirm scope and approvals before proceeding."
      />
    </>
  );
}
