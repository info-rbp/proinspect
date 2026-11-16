import { Link } from 'react-router';
import { EditorialHero, EditorialSteps } from '../components/editorial';
import { BrandImage } from '../components/brand-image';
import { MarketingCta } from '../components/marketing-ui';
import { seo } from '../lib/seo';

export const meta = () =>
  seo(
    'About Us — Property Services in Western Australia',
    'ProInspect Property Services Pty Ltd connects inspections, outsourced property operations and building services across Perth and Peel, Western Australia.',
    '/about',
    { breadcrumbs: [{ name: 'About Us', path: '/about' }] },
  );

export default function About() {
  return (
    <>
      <EditorialHero
        eyebrow="About Us"
        title="Property work, with the detail taken care of."
        intro="Inspections, outsourced property operations and building services, connected by clear records. ProInspect helps owners, managers and operators take care of the practical detail across Perth and Peel."
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
              That is where ProInspect fits. ProInspect Property Services Pty Ltd
              (ABN 52 703 550 609; ACN 703 550 609) supports self-managing landlords,
              professional agencies, commercial owners, strata and building teams, Co-Living
              and Student Living operators, and construction project teams.
            </p>
            <p>
              Choose one task, an inspection subscription or a tailored operational scope.
              We connect physical attendance, administration and property care with the records
              your authorised team needs. We work across approved Perth and Peel suburbs, with other WA locations considered by request.
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
                Inspections create factual condition records. Outsourced operations cover agreed
                administration, leasing support, access and follow-up. Building services bring
                presentation, cleaning, grounds, safe minor works and specialist coordination together.
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
                From incoming inspections to tenant enquiries, maintenance and vacates,
                give your property a clear routine while you stay in control.
              </p>
              <Link className="pi-inline-link" to="/residential">
                Residential services <span aria-hidden="true">↗</span>
              </Link>
            </article>
            <article>
              <h3>Workplaces and shared buildings</h3>
              <p>
                Keep workplaces and shared buildings running through practical attendance,
                building care and contractor coordination. Tailor support for Co-Living,
                Student Living or your next construction project.
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
      <section className="mkt-section pi-editorial-section pi-neutral">
        <div className="site-container">
          <div className="pi-section-heading">
            <p className="eyebrow">How our service model connects</p>
            <h2>Three ways to take practical property work off your desk.</h2>
            <p>ProInspect Property Services Pty Ltd is a Western Australian property services company offering individual site work, agreed outsourced operations and ongoing building care.</p>
          </div>
          <div className="mkt-editorial-grid">
            <article className="mkt-editorial-panel"><h3>Individual inspections and attendance</h3>
              <p>Arrange a defined property condition record, access appointment, maintenance observation or completion check. The client approves the task and receives the agreed evidence.</p>
              <Link className="pi-inline-link" to="/services">Browse individual services <span aria-hidden="true">→</span></Link>
            </article>
            <article className="mkt-editorial-panel"><h3>Outsourced property operations</h3>
              <p>Commission an agreed mix of tenancy administration, inspections, contractor coordination, owner reporting and ongoing follow-up. Each role and approval threshold is identified during onboarding.</p>
              <Link className="pi-inline-link" to="/how-we-work/outsourced-operations">Explore outsourcing <span aria-hidden="true">→</span></Link>
            </article>
            <article className="mkt-editorial-panel"><h3>Building and accommodation care</h3>
              <p>Scope building presentation, cleaning, waste, grounds, safe minor work, room turnovers and shared-living support. Specialist certification and regulated appointments remain with the responsible providers.</p>
              <Link className="pi-inline-link" to="/strata">Explore building services <span aria-hidden="true">→</span></Link>
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
