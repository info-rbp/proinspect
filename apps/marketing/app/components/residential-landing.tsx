import { Link } from 'react-router';
import { RESIDENTIAL_CATEGORIES } from '../../../../packages/marketing/residential-categories';
import { EditorialHero } from './editorial';
import { IllustrativeReport } from './marketing-ui';
import {
  ServiceSection,
  ServiceTiles,
  SubscriptionFeature,
  type ServiceIconName,
} from './service-page';
import { MarketingFaq } from './page-patterns';

const questions: [string, string][] = [
  [
    'Do I need a subscription to book a Property Condition Report?',
    'No. You can request one report as an individual service or consider a Residential subscription separately. Exact booking availability and price are confirmed before the service proceeds.',
  ],
  [
    'Where do you work?',
    'Scheduled services cover approved suburbs across Perth and Peel. Other locations across Western Australia may be considered on request, subject to travel and staff availability.',
  ],
  [
    'Can you deal with tenants on my behalf?',
    'We can manage ordinary communication and attendance within an agreed scope and authority. Your landlord or property manager retains tenancy, statutory and expenditure decisions.',
  ],
  [
    'How do I book a service?',
    'Create a free account, add an authorised property and choose an eligible service. Available appointments can be selected where booking is enabled; other requests require a confirmed scope or quotation.',
  ],
];
export function ResidentialLanding() {
  return (
    <>
      <EditorialHero
        eyebrow="Residential property services"
        title="Your Property. Our Support. Your Peace of Mind."
        intro="Whether you own a single investment property or manage an extensive residential portfolio, find practical property solutions that simplify the everyday responsibilities of looking after your property."
        image="residential"
        primary={{ label: 'Explore our residential solutions', to: '#residential-services' }}
        secondary={{ label: 'Get started today', to: '/client' }}
      />
      <ServiceSection
        id="residential-services"
        eyebrow="Our residential solutions"
        title="Supporting your property at every stage."
        intro="From the first inspection to the final handover, choose the services that suit your property and the way you work."
        neutral
      >
        <ServiceTiles
          items={RESIDENTIAL_CATEGORIES.map((item, i) => ({
            title: item.title,
            copy: item.intro,
            href: '/residential/services/' + item.slug,
            action: 'Explore ' + item.title,
            icon: (
              [
                'report',
                'home',
                'people',
                'tools',
                'keys',
                'report',
                'report',
                'message',
              ] as ServiceIconName[]
            )[i],
          }))}
        />
      </ServiceSection>
      <ServiceSection eyebrow="Who we support" title="Your property. Your way of working.">
        <ServiceTiles
          items={[
            {
              title: 'Private landlords',
              copy: 'Keep control of your rental and choose practical inspections, attendance and support for the work you need.',
              icon: 'home',
              href: '/who-we-help/private-landlords',
              action: 'Support for private landlords',
            },
            {
              title: 'Property management agencies',
              copy: 'Add on-site capacity and connected reporting to your team, with instructions and authority clearly agreed.',
              icon: 'people',
              href: '/who-we-help/property-management-agencies',
              action: 'Support for agencies',
            },
          ]}
        />
      </ServiceSection>
      <section className="mkt-section pi-editorial-section">
        <div className="site-container pi-residential-feature">
          <div className="pi-residential-feature-image">
            <IllustrativeReport compact />
          </div>
          <div className="pi-residential-feature-content">
            <p className="eyebrow">The ProInspect approach</p>
            <h2>Practical work. Connected reporting.</h2>
            <p>
              Our own property-services platform brings authorised bookings, work orders, inspection
              observations and issued reports together, with information connected to the right
              property.
            </p>
            <p>
              Inspection reports are reviewed before issue. The exact content, template and any
              statutory requirements depend on the service commissioned.
            </p>
            <Link className="button secondary" to="/example-reports">
              View Example Inspection Reports <span aria-hidden="true">→</span>
            </Link>
            <p className="pi-residential-note">
              Illustrative example only; not an issued statutory form.
            </p>
          </div>
        </div>
      </section>
      <SubscriptionFeature />
      <ServiceSection eyebrow="Our commitment to you" title="Support that works around your needs.">
        <ServiceTiles
          items={[
            {
              title: 'Choose your level of support',
              copy: 'Start with one service or discuss ongoing support. We confirm the price, scope and availability before work proceeds.',
              icon: 'report',
            },
            {
              title: 'Keep decisions in your hands',
              copy: 'Your landlord or property manager retains tenancy, statutory and expenditure decisions. Work follows the agreed authority and lawful access arrangements.',
              icon: 'keys',
            },
            {
              title: 'Stay connected',
              copy: 'Keep relevant observations, approved tasks and issued reports available to the people authorised for your property.',
              icon: 'message',
            },
          ]}
        />
      </ServiceSection>
      <section className="mkt-section pi-editorial-section">
        <div className="site-container pi-faq-layout">
          <div>
            <p className="eyebrow">Good to know</p>
            <h2>Your questions, answered.</h2>
            <p>
              Find more answers in our <Link to="/help-centre">Help Centre</Link>.
            </p>
            <Link className="button secondary" to="/help-centre">
              Visit Our Help Centre <span aria-hidden="true">→</span>
            </Link>
          </div>
          <MarketingFaq questions={questions} />
        </div>
      </section>
      <section className="mkt-final-cta">
        <div className="site-container mkt-cta-inner">
          <div>
            <p className="eyebrow">Ready for the next step?</p>
            <h2>Let’s Get Started Now.</h2>
            <p>
              Sign up for a free account today, add your authorised property and explore the
              services available to you.
            </p>
          </div>
          <div className="actions">
            <Link to="/client" className="button mkt-button-light">
              Sign Up Today <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
