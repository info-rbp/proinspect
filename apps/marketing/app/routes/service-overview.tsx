import { residentialPublicResponse } from '../../../../packages/domain/residential-policy';
import { Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import {
  SECTOR_OVERVIEWS,
  type SectorKey,
  type SectorOverview,
} from '../../../../packages/marketing/sector-overviews';
import { EditorialHero } from '../components/editorial';
import { MarketingCta } from '../components/marketing-ui';
import { MarketingFaq } from '../components/page-patterns';
import { BrandImage } from '../components/brand-image';
import { PlanComparison } from '../components/plan-comparison';
import { SECTOR_PROGRAMMES } from '../../../../packages/marketing/sector-programmes';
import { seo } from '../lib/seo';
import { ResidentialLanding } from '../components/residential-landing';
import { CoLivingLanding } from '../components/co-living-landing';

export function loader({ request }: LoaderFunctionArgs) {
  const retired = residentialPublicResponse(request); if (retired) throw retired;
  const key = new URL(request.url).pathname.replace(/\.data$/, '').slice(1) as SectorKey;
  if (!Object.prototype.hasOwnProperty.call(SECTOR_OVERVIEWS, key))
    throw new Response('Not found', { status: 404 });
  const page: SectorOverview = SECTOR_OVERVIEWS[key];
  return { key, ...page };
}

export const meta: MetaFunction<typeof loader> = ({ loaderData: page }) =>
  page
    ? seo(page.key === 'residential' ? 'Residential Services & Property Support — Western Australia' : page.name + ' Property Services — Western Australia', page.key === 'residential' ? 'Residential inspections, open homes, maintenance and tenancy support for private landlords and residential agencies.' : page.summary, '/' + page.key, {
        type: 'Service',
        breadcrumbs: [{ name: page.name, path: '/' + page.key }],
      })
    : [];

export default function ServiceOverview() {
  const page = useLoaderData<typeof loader>();
  if (page.key === 'residential') return <ResidentialLanding />;
  if (page.key === 'co-living') return <CoLivingLanding />;
  return (
    <>
      <EditorialHero
        eyebrow={page.name}
        title={page.headline}
        intro={page.summary}
        image={page.key === 'student-living' ? 'co-living' : page.key}
        primary={{label:page.key === 'co-living' ? 'Explore Co-Living Support' : 'Explore Maintenance Support', to:'#service-options'}}
        secondary={{label:'Get Started Today',to:'/client'}}
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
      <section className="mkt-section pi-editorial-section pi-neutral" id="service-options">
        <div className="site-container">
          <div className="pi-section-heading">
            <p className="eyebrow">{page.name} support</p>
            <h2>Support designed around your property.</h2>
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
            <BrandImage name={page.key === 'student-living' ? 'co-living' : page.key} />
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
      {SECTOR_PROGRAMMES[page.key] && <section className="mkt-section pi-editorial-section pi-neutral">
        <div className="site-container">
          <div className="pi-section-heading"><p className="eyebrow">What we deliver</p>
            <h2>Practical outcomes, connected to the property.</h2>
            <p>{SECTOR_PROGRAMMES[page.key].benefit}</p></div>
          <div className="mkt-editorial-grid">{SECTOR_PROGRAMMES[page.key].outputs.map(([title, copy]) =>
            <article key={title} className="mkt-editorial-panel"><h3>{title}</h3><p>{copy}</p></article>)}</div>
        </div>
      </section>}
      {SECTOR_PROGRAMMES[page.key] && <section className="mkt-section pi-editorial-section">
        <div className="site-container">
          <div className="pi-section-heading"><p className="eyebrow">Getting started</p><h2>From enquiry to a working programme.</h2>
            <p>{SECTOR_PROGRAMMES[page.key].nextStep}</p></div>
          <ol className="pi-process-list">{SECTOR_PROGRAMMES[page.key].onboarding.map(([title, copy], i) =>
            <li key={title}><span className="pi-step-number">0{i+1}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol>
        </div>
      </section>}
      {page.key === 'commercial' && <PlanComparison market={page.key} />}
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
      <MarketingCta title={page.key === 'co-living' ? 'Let’s get your shared property working.' : 'Get the right support for your property.'}
        description="Create a free account to explore services, or contact ProInspect for a tailored operating scope." />
    </>
  );
}
