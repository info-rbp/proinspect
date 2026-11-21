import { Link, useOutletContext, useSearchParams } from 'react-router';
import { FAMILIES } from '../../../../packages/service-catalogue/index';
import { MarketingCta } from '../components/marketing-ui';
import { MarketingPageHero, MarketingSectionTitle } from '../components/page-patterns';
import { seo } from '../lib/seo';
import { BrandImage, type BrandImageKey } from '../components/brand-image';
import { RESIDENTIAL_CATEGORIES } from '../../../../packages/marketing/residential-categories';

const familyImages: Record<string, BrandImageKey> = {
  inspections: 'residential',
  attendance: 'residential',
  maintenance: 'maintenance',
  access: 'maintenance',
  documents: 'residential',
  operations: 'co-living',
};

export const meta = () =>
  seo(
    'Individual Property Services and Ongoing Support — WA',
    'Browse Residential inspections, attendance, maintenance and shared-living support.',
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
        title={family ? FAMILIES[family].name : 'Property support that makes sense for you.'}
        intro="Choose what you need help with, from routine inspections and incoming reports to property access, maintenance and leasing support. Each individual service explains its intended outcome, inclusions and next steps."
        crumbs={[{ label: 'Services' }]}
        visual="services"
        primary={{ label: 'Find the right service', to: '/service-finder' }}
      />
      <section className="mkt-section pi-editorial-section pi-neutral" id="residential-solutions">
        <div className="site-container">
          <div className="pi-section-heading"><p className="eyebrow">Residential Services</p>
            <h2>Eight ways we can support your property.</h2>
            <p>Find the right starting point by the work that needs doing. These are customer-friendly groupings; the booking price, availability and scope belong to each individual service.</p></div>
          <div className="pi-residential-related" aria-label="Residential service areas">
            {RESIDENTIAL_CATEGORIES.map(c=><Link key={c.slug} to={'/residential/services/'+c.slug}>{c.title}<span aria-hidden="true">↗</span></Link>)}
          </div>
          <Link className="button secondary" to="/residential/services">See All Residential Services <span aria-hidden="true">→</span></Link>
        </div>
      </section>
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
                  <BrandImage name={image} />
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
      <section className="section mkt-section mkt-stone"><div className="site-container">
        <MarketingSectionTitle eyebrow="Ongoing property services" title="Need a recurring property programme?"
          description="Residential service pages explain individual inspections and attendances. Broader tenancy support, cleaning, shared-space care and maintenance can be scoped separately or through an agreed Residential subscription." />
        <div className="mkt-engagement-grid">{[
          ['Residential subscriptions', '/residential/subscriptions', 'All Inclusive at AUD $50 + GST per week per property.'],
          ['Co-Living', '/co-living', 'Shared accommodation turnover, maintenance and resident support.'],
        ].map(([title, to, description]) => <article className="mkt-engagement-card" key={to}>
          <h3>{title}</h3><p>{description}</p>
          <Link className="mkt-text-link" to={to}>Explore support <span aria-hidden="true">→</span></Link>
        </article>)}</div>
      </div></section>
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
              Sign in to view individual service pricing. Account creation does not activate
              a subscription. Extra attendance, travel, specialist and urgent work require
              an agreed scope and price.
            </p>
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
