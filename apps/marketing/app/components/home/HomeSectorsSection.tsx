import { Link } from 'react-router';

const sectors = [
  [
    'Residential',
    'For rental property owners and agencies',
    'Condition reports, tenancy inspections and practical follow-up for self-managing landlords and professional managers.',
    '/sectors/residential',
  ],
  [
    'Commercial',
    'For commercial owners and asset managers',
    'Condition inspections, make-good observations, handovers and defined property attendance.',
    '/sectors/commercial',
  ],
  [
    'Strata & buildings',
    'For strata and building teams',
    'Common-property inspections, contractor coordination and documented building attendance.',
    '/sectors/strata-building',
  ],
] as const;

export function HomeSectorsSection() {
  return (
    <section className="mkt-section pi-section pi-tint" aria-labelledby="pi-sectors">
      <div className="site-container">
        <header className="pi-section-head">
          <div>
            <p className="eyebrow">Who we support</p>
            <h2 id="pi-sectors">The right support for your property.</h2>
          </div>
          <p>Residential, commercial and strata property needs call for different on-site work.</p>
        </header>
        <div className="pi-sector-grid">
          {sectors.map(([label, title, description, to]) => (
            <article className="pi-sector-card" key={to}>
              <p className="pi-overline">{label}</p>
              <h3>{title}</h3>
              <p>{description}</p>
              <Link to={to} data-pi-conversion={'sector-' + label}>
                Explore {label.toLowerCase()} <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
