import {
  Link, useLoaderData, useOutletContext, type LoaderFunctionArgs, type MetaFunction,
} from 'react-router';
import { FAMILIES, SERVICE_SEEDS } from '../../../../packages/service-catalogue/index';
import { ENGAGEMENTS, GUIDES } from '../../../../packages/marketing/content';
import { MarketingCta } from '../components/marketing-ui';
import {
  MarketingPageHero, MarketingSectionTitle, MarketingServiceGrid, MarketingEditorialBlocks,
} from '../components/page-patterns';
import { seo } from '../lib/seo';

export function loader({ params, request }: LoaderFunctionArgs) {
  const path = new URL(request.url).pathname;
  if (params.family) {
    const family = FAMILIES[params.family];
    if (!family) throw new Response('Not found', { status: 404 });
    return {
      kind: 'family' as const,
      slug: params.family,
      title: family.name,
      intro: family.description,
      path,
      sections: [
        ['Start with the outcome', 'Choose the service around the property task and the decision you need to make. Scope, pricing and availability must be confirmed.'],
        ['How the work connects', 'An authorised account links the request or booking to its property or scheme. Issued documents stay with that record.'],
      ] as [string, string][],
      services: SERVICE_SEEDS.filter((s) => s.family === params.family),
    };
  }
  const kind = params.model ? 'engagement' as const : 'guide' as const;
  const slug = params.model ?? params.guide ?? '';
  const page = params.model ? ENGAGEMENTS[params.model] : GUIDES[slug];
  if (!page) throw new Response('Not found', { status: 404 });
  return {
    kind, slug, ...page, path,
    services: SERVICE_SEEDS.filter(
      (s) => 'services' in page && (page.services as string[]).includes(s.id),
    ),
  };
}
export const meta: MetaFunction<typeof loader> = ({ loaderData: d }) =>
  d ? seo(d.title, d.intro, d.path) : [];

export default function Content() {
  const d = useLoaderData<typeof loader>();
  const { appOrigin } = useOutletContext<{ appOrigin: string }>();
  const family = d.kind === 'family';
  const guide = d.kind === 'guide';
  const introLabel = family ? 'Service families' : guide ? 'Property guides & comparisons' : 'Ways to work with ProInspect';
  const breadcrumbs = family
    ? [{ label: 'Services', to: '/services' }, { label: d.title }]
    : guide
      ? [{ label: 'Resources', to: '/resources' }, { label: d.title }]
      : [{ label: 'How it works', to: '/how-it-works' }, { label: d.title }];
  return (
    <>
      <MarketingPageHero
        eyebrow={introLabel}
        title={d.title}
        intro={d.intro}
        crumbs={breadcrumbs}
        visual={family ? 'services' : guide ? 'resources' : 'process'}
        primary={{ label: family ? 'Discuss a service' : guide ? 'View relevant services' : 'Discuss an arrangement', to: family || !guide ? '/contact' : '/services' }}
      />

      <section className="section mkt-section">
        <div className="site-container">
          <MarketingSectionTitle
            eyebrow={family ? 'What to expect' : guide ? 'Practical guidance' : 'How this arrangement works'}
            title={family ? 'Work with a clear purpose.' : guide ? 'Know the difference before choosing.' : 'An approach defined around your requirements.'}
            description={family
              ? 'The purpose and output of each attendance depend on the accepted instruction.'
              : guide
                ? 'These guides explain how different service purposes and responsibilities fit together.'
                : 'Scope, access, timing, responsibilities and commercial terms are agreed before work begins.'}
          />
          <MarketingEditorialBlocks sections={d.sections} numbered={!family} />
          {guide && (
            <p className="mkt-section-footnote">General service guidance only. This page does not replace statutory, legal or specialist technical advice.</p>
          )}
        </div>
      </section>

      {family && (
        <section className="section mkt-section mkt-stone">
          <div className="site-container">
            <MarketingSectionTitle
              eyebrow="Services in this category"
              title={'Explore ' + d.title.toLowerCase() + '.'}
              description="Review the purpose and intended output of each service before arranging attendance."
              to="/services"
              linkText="All service categories"
            />
            <MarketingServiceGrid
              services={d.services}
              emptyTitle={d.slug === 'documents' ? 'Documentation requests need a reviewed scope.' : 'Plan ongoing support around a defined workload.'}
              emptyText={d.slug === 'documents'
                ? 'Residential, commercial and strata documentation needs vary. Describe the document, property and intended use so ProInspect can confirm suitability and the required review.'
                : 'Inspection planning and ongoing property operations are scoped to the properties, workload and agreed responsibilities. They are not unlimited service subscriptions.'}
            />
          </div>
        </section>
      )}

      {guide && d.services.length > 0 && (
        <section className="section mkt-section mkt-stone">
          <div className="site-container">
            <MarketingSectionTitle eyebrow="Related services" title="Explore the options discussed." description="Read the scope and booking requirements for the corresponding property service." />
            <MarketingServiceGrid services={d.services} />
          </div>
        </section>
      )}

      {!family && !guide && (
        <section className="section mkt-section mkt-stone">
          <div className="site-container">
            <MarketingSectionTitle eyebrow="Other ways to work" title="Choose the arrangement that fits." description="These descriptions are starting points, not confirmed pricing packages or unlimited attendance commitments." />
            <div className="mkt-engagement-grid">
              {Object.entries(ENGAGEMENTS).map(([slug, arrangement], i) => (
                <article className={'mkt-engagement-card' + (slug === d.slug ? ' mkt-active-engagement' : '')} key={slug}>
                  <span className="mkt-card-number">0{i + 1}</span>
                  <h3>{arrangement.title}</h3><p>{arrangement.intro}</p>
                  {slug === d.slug ? <span className="mkt-current-label">Currently viewing</span> : <Link className="mkt-text-link" to={'/how-we-work/' + slug}>Explore arrangement <span aria-hidden="true">↗</span></Link>}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section mkt-section">
        <div className="site-container mkt-callout-grid">
          <div>
            <p className="eyebrow">Clarity before attendance</p>
            <h2>{guide ? 'Choose around the decision you need to make.' : 'Know what is included before the work begins.'}</h2>
            <p>ProInspect confirms the instruction, authority, access, timing, service limits and any applicable fees. A service request does not automatically guarantee an appointment.</p>
          </div>
          <div className="mkt-callout-panel">
            <span className="mkt-card-number">THE PROINSPECT APPROACH</span>
            <h3>A clear scope. A documented outcome.</h3>
            <p>Visible observations, operational attendance and specialist technical assessments serve different purposes. We identify boundaries before accepting work.</p>
            <Link className="mkt-text-link" to="/how-it-works">How ProInspect works <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </section>
      <MarketingCta
        title={family ? 'Need help with this kind of property work?' : guide ? 'Ready to choose a service?' : 'Discuss the right way to work together.'}
        description="Tell us about the property, your intended outcome and any relevant access or timing requirements. Scope and availability are confirmed separately."
        appOrigin={appOrigin}
      />
    </>
  );
}
