import { Link } from 'react-router';
import { FAMILIES, type SERVICE_SEEDS } from '../../../../packages/service-catalogue/index';
import { IllustrativeReport, PropertyArtwork } from './marketing-ui';

type ServiceItem = (typeof SERVICE_SEEDS)[number];
export type MarketingCrumb = { label: string; to?: string };
export type MarketingVisual = 'residential' | 'commercial' | 'strata' | 'report' | 'process' | 'resources' | 'services' | 'none';

export function MarketingPageHero({
  eyebrow, title, intro, crumbs = [], visual = 'services', primary,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  crumbs?: MarketingCrumb[];
  visual?: MarketingVisual;
  primary?: { label: string; to: string };
}) {
  const art = visual === 'residential' || visual === 'commercial' || visual === 'strata';
  return (
    <header className={'mkt-page-hero mkt-page-hero-' + visual}>
      <div className="site-container">
        {crumbs.length > 0 && (
          <nav className="breadcrumbs mkt-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            {crumbs.map((crumb, i) => (
              <span className="mkt-breadcrumb-part" key={i}>
                <span aria-hidden="true">/</span>
                {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <div className={'mkt-page-hero-grid' + (visual === 'none' ? ' mkt-page-hero-text-only' : '')}>
          <div className="mkt-page-hero-copy">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="mkt-page-hero-intro">{intro}</p>
            {primary && <Link className="button" to={primary.to}>{primary.label}<span aria-hidden="true">→</span></Link>}
          </div>
          {visual !== 'none' && (
            <div className="mkt-page-hero-art">
              {art
                ? <PropertyArtwork kind={visual as 'residential' | 'commercial' | 'strata'} slot={visual === 'strata' ? 'sector-strata' : visual === 'commercial' ? 'sector-commercial' : 'sector-residential'} />
                : visual === 'report'
                  ? <div className="mkt-page-report-art"><IllustrativeReport compact /><p>Illustrative record design, not an issued report.</p></div>
                  : <div className={'mkt-abstract-art mkt-abstract-' + visual} aria-hidden="true">
                      <span className="mkt-abstract-ring" />
                      <span className="mkt-abstract-sheet sheet-one" />
                      <span className="mkt-abstract-sheet sheet-two" />
                      <span className="mkt-abstract-sheet sheet-three" />
                      <span className="mkt-abstract-dot" />
                    </div>}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function MarketingSectionTitle({
  eyebrow, title, description, to, linkText,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  to?: string;
  linkText?: string;
}) {
  return (
    <div className="mkt-section-heading">
      <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
      {description && <p>{description}</p>}
      {to && linkText && <Link className="mkt-text-link" to={to}>{linkText}<span aria-hidden="true">↗</span></Link>}
    </div>
  );
}

export function MarketingServiceCard({ service }: { service: ServiceItem }) {
  return (
    <article className="mkt-related-card mkt-catalogue-card">
      <p className="mkt-kicker">{FAMILIES[service.family]?.name ?? 'Property service'}</p>
      <h3>{service.name}</h3>
      <p>{service.summary}</p>
      <Link className="mkt-text-link" to={'/services/' + service.id}>Explore service <span aria-hidden="true">→</span></Link>
    </article>
  );
}

export function MarketingServiceGrid({
  services,
  emptyTitle = 'Discuss a defined scope.',
  emptyText = 'This service category is arranged through a reviewed enquiry. Tell us about the property and the intended outcome so we can assess the requirements.',
}: {
  services: ServiceItem[];
  emptyTitle?: string;
  emptyText?: string;
}) {
  if (!services.length) return (
    <div className="mkt-empty-services">
      <span className="mkt-card-number">ENQUIRY-LED SERVICE</span>
      <h3>{emptyTitle}</h3>
      <p>{emptyText}</p>
      <Link className="button secondary" to="/contact">Discuss requirements <span aria-hidden="true">→</span></Link>
    </div>
  );
  return <div className="mkt-catalogue-grid">{services.map((service) => <MarketingServiceCard key={service.id} service={service} />)}</div>;
}

export function MarketingEditorialBlocks({
  sections, numbered = false,
}: {
  sections: Array<[string, string]>;
  numbered?: boolean;
}) {
  return (
    <div className="mkt-editorial-grid">
      {sections.map(([heading, copy], i) => (
        <article className="mkt-editorial-panel" key={heading}>
          <span className="mkt-card-number">{numbered ? String(i + 1).padStart(2, '0') : 'PROINSPECT'}</span>
          <h2>{heading}</h2>
          <p>{copy}</p>
        </article>
      ))}
    </div>
  );
}

export function MarketingGuideCard({
  slug, title, intro, index,
}: {
  slug: string; title: string; intro: string; index: number;
}) {
  return (
    <article className="mkt-related-card mkt-guide-card">
      <span className="mkt-card-number">{String(index + 1).padStart(2, '0')}</span>
      <p className="mkt-kicker">Property knowledge</p>
      <h3>{title}</h3>
      <p>{intro}</p>
      <Link className="mkt-text-link" to={'/resources/' + slug}>Read guide <span aria-hidden="true">↗</span></Link>
    </article>
  );
}

export function MarketingFaq({ questions }: { questions: Array<[string, string]> }) {
  return <div className="mkt-faq-list">
    {questions.map(([question, answer]) => (
      <details key={question}>
        <summary>{question}<span aria-hidden="true">+</span></summary>
        <p>{answer}</p>
      </details>
    ))}
  </div>;
}
