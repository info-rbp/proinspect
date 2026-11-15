import { Link } from 'react-router';
import { EditorialHero, EditorialSteps } from '../components/editorial';
import { BrandImage } from '../components/brand-image';
import { MarketingCta } from '../components/marketing-ui';
import { seo } from '../lib/seo';

export const meta = () =>
  seo(
    'About Us — Property Services in Western Australia',
    'Get to know ProInspect: practical property inspections, on-site attendance and connected records for owners, managers, strata teams and tenants in WA.',
    '/about',
    { breadcrumbs: [{ name: 'About Us', path: '/about' }] },
  );

export default function About() {
  return (
    <>
      <EditorialHero
        eyebrow="About Us"
        title="Property work, with the detail taken care of."
        intro="ProInspect brings practical on-site support and structured property records together, helping people responsible for property see what matters and follow through."
        image="commercial"
        primary={{ label: 'Talk to ProInspect', to: '/contact' }}
        secondary={{ label: 'Explore our services', to: '/services' }}
      />
      <section className="mkt-section pi-editorial-section">
        <div className="site-container pi-introduction">
          <div>
            <p className="eyebrow">Our purpose</p>
            <h2>Make looking after property easier to manage.</h2>
          </div>
          <div>
            <p>
              Owning or managing property involves more than making decisions from a desk. Someone
              needs to attend the site, notice the detail, arrange access and leave a record that is
              useful to the next person.
            </p>
            <p>
              That is where ProInspect fits. We provide property inspection and operational
              attendance services in Western Australia, supporting self-managing landlords,
              professional agencies, commercial owners and strata or building teams.
            </p>
            <p>
              Our approach connects the physical visit with its property context, so agreed work and
              resulting records are easier to follow.
            </p>
          </div>
        </div>
      </section>
      <section className="mkt-section pi-editorial-section pi-neutral">
        <div className="site-container pi-difference">
          <div className="pi-difference-image">
            <BrandImage name="strata" />
          </div>
          <div>
            <p className="eyebrow">What makes the difference</p>
            <h2>A practical presence. A connected approach.</h2>
            <div className="pi-difference-item">
              <h3>Useful work on the ground</h3>
              <p>
                From condition inspections and property attendance to contractor access and
                maintenance follow-up, each service starts with the task you need addressed.
              </p>
            </div>
            <div className="pi-difference-item">
              <h3>Information with context</h3>
              <p>
                Bookings, requests and issued records sit within the relevant property relationship.
                The people entitled to see the result can find it through their authorised account.
              </p>
            </div>
            <div className="pi-difference-item">
              <h3>Clear expectations</h3>
              <p>
                We agree scope, responsibilities, access and commercial terms before proceeding.
                Your appointed managers, specialists and decision-makers retain their own
                responsibilities.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="mkt-section pi-editorial-section">
        <div className="site-container">
          <div className="pi-section-heading">
            <p className="eyebrow">Built around real property needs</p>
            <h2>One task today. Room to support what comes next.</h2>
            <p>
              Start with an individual inspection or discuss a recurring operational requirement.
              Support should fit the work, the property and the people involved.
            </p>
          </div>
          <div className="pi-about-links">
            <article>
              <h3>Homes and portfolios</h3>
              <p>
                Condition reporting, rental inspections and practical follow-up for owners and
                residential agencies.
              </p>
              <Link className="pi-inline-link" to="/residential">
                Residential services <span aria-hidden="true">↗</span>
              </Link>
            </article>
            <article>
              <h3>Workplaces and shared buildings</h3>
              <p>
                Commercial attendance, common-property observations and contractor access for
                authorised teams.
              </p>
              <Link className="pi-inline-link" to="/who-we-help">
                Who we help <span aria-hidden="true">↗</span>
              </Link>
            </article>
            <article>
              <h3>People finding or living in a home</h3>
              <p>
                Published leasing opportunities, open-home registration and guidance to the right
                tenant support channel.
              </p>
              <Link className="pi-inline-link" to="/tenants">
                Tenant support <span aria-hidden="true">↗</span>
              </Link>
            </article>
          </div>
        </div>
      </section>
      <EditorialSteps />
      <MarketingCta
        title="Tell us what looking after your property involves."
        description="Share the property type, general location and the support you need. We’ll clarify suitability, availability and the next step."
      />
    </>
  );
}
