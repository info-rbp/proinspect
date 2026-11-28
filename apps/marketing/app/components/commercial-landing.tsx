import { Link } from 'react-router';
import { EditorialHero } from './editorial';
import {
  ServiceSection,
  ServiceTiles,
  ServiceFeature,
  SubscriptionFeature,
  ServiceFaq,
  ServiceCta,
} from './service-page';
export function CommercialLanding() {
  return (
    <>
      <EditorialHero
        eyebrow="Commercial property services"
        title="Commercial Spaces. Practical Solutions."
        intro="Your commercial property should work for you. Explore ideas for property inspections, operational support, tenant engagement and maintenance, tailored to the requirements of your premises and business."
        image="commercial"
        primary={{ label: 'Discuss your property requirements', to: '/contact' }}
        secondary={{ label: 'Explore proposed solutions', to: '#commercial-solutions' }}
      />
      <ServiceSection
        id="commercial-solutions"
        eyebrow="Our commercial solutions"
        title="Helping your commercial property work better."
        intro="These are proposed areas for discussion, not currently available booking products. Commercial service scopes and availability are being reviewed; commercial bookings and paid plans are not available through this page."
      >
        <ServiceTiles
          items={[
            {
              title: 'Property inspections',
              copy: 'Discuss condition records, routine observations and handover information appropriate to your premises.',
              icon: 'report',
            },
            {
              title: 'Operational support',
              copy: 'Explore agreed site attendance, property records and day-to-day coordination around your business requirements.',
              icon: 'building',
            },
            {
              title: 'Tenant engagement',
              copy: 'Consider practical communication and follow-up within an agreed authority. Lease and tenancy decisions remain with the responsible parties.',
              icon: 'people',
            },
            {
              title: 'Maintenance coordination',
              copy: 'Discuss planned care, quotations, qualified contractors and authorised access. Expenditure needs approval before work proceeds.',
              icon: 'tools',
            },
            {
              title: 'Access and handovers',
              copy: 'Explore arrangements for authorised attendance, keys and occupancy changes with clear instructions and records.',
              icon: 'keys',
            },
            {
              title: 'Tailored property solutions',
              copy: 'Tell us about a specific property challenge so suitability, scope and availability can be assessed.',
              icon: 'message',
            },
          ]}
        />
      </ServiceSection>
      <ServiceSection
        id="property-types"
        eyebrow="Your premises"
        title="Different spaces. Different requirements."
        intro="These property types are discussion areas. Suitability and service scope must be confirmed for each property."
        neutral
      >
        <ServiceTiles
          items={[
            {
              title: 'Office & professional spaces',
              copy: 'Offices, professional suites and business premises.',
              icon: 'building',
            },
            {
              title: 'Retail & commercial premises',
              copy: 'Retail stores, showrooms and customer-facing properties.',
              icon: 'home',
            },
            {
              title: 'Industrial & warehousing',
              copy: 'Warehouses, workshops and light industrial premises.',
              icon: 'tools',
            },
            {
              title: 'Shared & flexible workspaces',
              copy: 'Co-Working environments and flexible commercial spaces.',
              icon: 'people',
            },
          ]}
        />
      </ServiceSection>
      <ServiceFeature
        image="co-working"
        eyebrow="Co-Working possibilities"
        title="A different way to use your commercial space."
      >
        <p>
          Explore whether your premises could suit flexible working, shared facilities or a new
          workspace layout. Property suitability, permissions, establishment costs and operating
          requirements need assessment before any project proceeds.
        </p>
        <p>
          The dedicated Co-Working page is introductory. Detailed services remain under development.
        </p>
        <Link className="pi-inline-link" to="/co-spaces/co-working">
          Explore Co-Working <span aria-hidden="true">↗</span>
        </Link>
      </ServiceFeature>
      <ServiceSection
        eyebrow="Connected commercial support"
        title="A clearer picture of the property."
        intro="Discuss how inspection observations, maintenance history and operational records could support the people responsible for your premises."
      >
        <ServiceTiles
          items={[
            {
              title: 'Understand the requirement',
              copy: 'Start with the premises, operating hours, people and practical outcomes that matter to your business.',
              icon: 'building',
            },
            {
              title: 'Agree the boundaries',
              copy: 'Confirm authority, lawful access, communication, scope and separately approved expenditure before work.',
              icon: 'report',
            },
            {
              title: 'Keep the right people informed',
              copy: 'Plan clear updates and property records for authorised parties, with private information restricted to the appropriate workspace.',
              icon: 'message',
            },
          ]}
        />
      </ServiceSection>
      <SubscriptionFeature kind="commercial" />
      <ServiceSection
        eyebrow="Our commitment to your business"
        title="Built around how your business operates."
      >
        <ServiceTiles
          items={[
            {
              title: 'Practical understanding',
              copy: 'Discuss the needs of your premises and the people using them before agreeing a scope.',
              icon: 'building',
            },
            {
              title: 'Flexible planning',
              copy: 'Consider access, occupancy and operating hours when assessing possible support.',
              icon: 'calendar',
            },
            {
              title: 'Clear communication',
              copy: 'Know what is proposed, who decides and what requires further approval.',
              icon: 'message',
            },
          ]}
        />
      </ServiceSection>
      <ServiceFaq
        questions={[
          [
            'Can I book commercial services online?',
            'No. This page is informational. Commercial bookings, new commercial service acquisition and paid plans are not activated. Contact ProInspect to discuss your requirements.',
          ],
          [
            'Are all property types supported?',
            'No service availability is promised here. Property suitability, location, access, qualifications and the proposed scope must be reviewed first.',
          ],
          [
            'Who approves work and expenditure?',
            'The authorised owner or responsible manager retains approval. Scope, charges, variations and qualified-trade requirements must be agreed before work proceeds.',
          ],
          [
            'Are subscription prices or inclusions confirmed?',
            'The Commercial Property Support Subscription is still a concept. No new price, inclusion, contract term or payment arrangement is established by this page.',
          ],
        ]}
      />
      <ServiceCta
        title="Let’s talk about your commercial property."
        copy="Tell us about your premises and the support you would like to explore."
      />
    </>
  );
}
