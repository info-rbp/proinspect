import { Link } from 'react-router';
import { EditorialHero } from './editorial';
import { BrandImage } from './brand-image';
import { ServiceSection, ServiceFeature, SubscriptionFeature, ServiceCta } from './service-page';
export function CoSpacesLanding() {
  return (
    <>
      <EditorialHero
        eyebrow="ProInspect Co-Spaces"
        title="Better Spaces. Better Ways to Live and Work."
        intro="The way we live and work is evolving. Explore new possibilities for shared residential and commercial environments, built around the people who use them."
        image="co-living"
        primary={{ label: 'Discover our Co-Spaces solutions', to: '#co-spaces-solutions' }}
      />
      <ServiceSection
        id="co-spaces-solutions"
        eyebrow="Our Co-Spaces solutions"
        title="Rethinking the way we use property."
      >
        <div className="pi-space-grid">
          {[
            {
              title: 'Co-Living',
              image: 'co-living' as const,
              copy: 'Explore shared residential accommodation, thoughtfully furnished spaces, resident support and coordinated property care within an agreed operating arrangement.',
              to: '/co-living',
            },
            {
              title: 'Co-Working',
              image: 'co-working' as const,
              copy: 'Explore the potential of flexible workspaces and shared facilities. This offering is introductory; detailed scope and availability remain under development.',
              to: '/co-spaces/co-working',
            },
          ].map((item) => (
            <article className="pi-space-card" key={item.title}>
              <BrandImage name={item.image} />
              <div>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
                <Link className="pi-inline-link" to={item.to}>
                  Explore {item.title} solutions <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </ServiceSection>
      <ServiceFeature
        image="innovation"
        eyebrow="Unlocking property potential"
        title="Start with the space. Consider the possibilities."
      >
        <p>
          Property layout, shared facilities, access and the needs of future occupants all matter.
          Discuss suitability, thoughtful design, coordinated establishment and ongoing care before
          committing to a shared-space arrangement.
        </p>
        <p>
          Permissions, costs and operating responsibilities need a property-specific assessment. No
          occupancy level or financial return is guaranteed.
        </p>
        <Link className="pi-inline-link" to="/co-living/property-setup">
          Existing Co-Living property setup guidance <span aria-hidden="true">↗</span>
        </Link>
      </ServiceFeature>
      <ServiceSection
        eyebrow="From property to shared space"
        title="Turning possibilities into practical solutions."
      >
        <ol className="pi-process-list">
          <li>
            <span className="pi-step-number">01</span>
            <h3>Explore suitability</h3>
            <p>Discuss the property, proposed use, likely occupants and required permissions.</p>
          </li>
          <li>
            <span className="pi-step-number">02</span>
            <h3>Plan the establishment</h3>
            <p>
              Agree the layout, furnishings, shared facilities, budget and responsibilities before
              any work.
            </p>
          </li>
          <li>
            <span className="pi-step-number">03</span>
            <h3>Confirm ongoing support</h3>
            <p>
              Define the operating arrangement and authorised communication, care and access
              pathways. Co-Working remains enquiry-only.
            </p>
          </li>
        </ol>
      </ServiceSection>
      <SubscriptionFeature kind="co-spaces" />
      <ServiceSection
        id="available-spaces"
        eyebrow="Looking for a space?"
        title="Explore what is currently advertised."
        intro="Published listings show current availability and the responsible leasing representative. An empty result does not indicate future availability."
      >
        <div className="actions">
          <Link className="button secondary" to="/leasing?type=co-living">
            Browse Co-Living listings <span aria-hidden="true">→</span>
          </Link>
          <Link className="pi-inline-link" to="/leasing?type=co-working">
            Browse Co-Working listings <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </ServiceSection>
      <ServiceCta
        title="Explore the potential of your property."
        copy="Discuss your space, your objectives and what would need to be confirmed before proceeding."
      />
    </>
  );
}
