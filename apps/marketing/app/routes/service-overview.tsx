import { Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import {
  SECTOR_OVERVIEWS,
  type SectorKey,
  type SectorOverview,
} from '../../../../packages/marketing/sector-overviews';
import { EditorialHero, EditorialSteps } from '../components/editorial';
import { MarketingCta } from '../components/marketing-ui';
import { MarketingFaq } from '../components/page-patterns';
import { BrandImage } from '../components/brand-image';
import { seo } from '../lib/seo';

export function loader({ request }: LoaderFunctionArgs) {
  const key = new URL(request.url).pathname.replace(/\.data$/, '').slice(1) as SectorKey;
  if (!Object.prototype.hasOwnProperty.call(SECTOR_OVERVIEWS, key))
    throw new Response('Not found', { status: 404 });
  const page: SectorOverview = SECTOR_OVERVIEWS[key];
  return { key, ...page };
}

export const meta: MetaFunction<typeof loader> = ({ loaderData: page }) =>
  page
    ? seo(page.name + ' Property Services — Western Australia', page.summary, '/' + page.key, {
        type: 'Service',
        breadcrumbs: [{ name: page.name, path: '/' + page.key }],
      })
    : [];

export default function ServiceOverview() {
  const page = useLoaderData<typeof loader>();
  return (
    <>
      <EditorialHero
        eyebrow={page.name}
        title={page.headline}
        intro={page.summary}
        image={page.key}
        primary={{ label: 'Sign Up/Sign In to access', to: '/client' }}
        secondary={{ label: 'Discuss your property', to: '/contact' }}
      />
      <section className="mkt-section pi-editorial-section">
        <div className="site-container pi-introduction">
          <div>
            <p className="eyebrow">Built around your property</p>
            <h2>{page.outcome}</h2>
          </div>
          <div>
            <p>{page.description}</p>
            <p className="pi-audience">{page.audience}</p>
          </div>
        </div>
        {page.availability && (
          <div className="site-container">
            <aside className="pi-availability" aria-label="Service availability">
              <strong>Tailored service delivery</strong>
              <p>{page.availability}</p>
              <Link to="/contact">
                Request a tailored proposal <span aria-hidden="true">→</span>
              </Link>
            </aside>
          </div>
        )}
      </section>
      <section className="mkt-section pi-editorial-section pi-neutral">
        <div className="site-container">
          <div className="pi-section-heading">
            <p className="eyebrow">{page.name} support</p>
            <h2>A practical service for the work at hand.</h2>
          </div>
          <div className="pi-service-details">
            {page.services.map(([title, copy], index) => (
              <article key={title}>
                <span className="pi-step-number">0{index + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="mkt-section pi-editorial-section">
        <div className="site-container pi-difference">
          <div className="pi-difference-image">
            <BrandImage name={page.key} />
          </div>
          <div>
            <p className="eyebrow">The ProInspect approach</p>
            <h2>On the ground. Across the detail.</h2>
            {page.difference.map(([title, copy]) => (
              <div className="pi-difference-item" key={title}>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
            <Link className="pi-inline-link" to="/about">
              Get to know ProInspect <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </section>
      <EditorialSteps />
      <section className="mkt-section pi-editorial-section">
        <div className="site-container pi-faq-layout">
          <div>
            <p className="eyebrow">Good to know</p>
            <h2>Your questions, answered.</h2>
            <p>
              Need to talk through a particular property? <Link to="/contact">Get in touch.</Link>
            </p>
          </div>
          <MarketingFaq questions={page.questions} />
        </div>
      </section>
      <MarketingCta
        title={'Let’s talk about your ' + page.name.toLowerCase() + ' property.'}
        description="Start with a service, a property or a practical task. We’ll help clarify the next step."
      />
    </>
  );
}
