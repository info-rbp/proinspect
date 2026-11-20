import { Link } from 'react-router';
import commercialImage from './images/sector-commercial.jpg';
import residentialImage from './images/sector-residential.jpg';
import strataImage from './images/sector-strata.jpg';

const sectors = [
  [
    'Residential',
    'For rental property owners and agencies',
    'Condition reports, tenancy inspections and practical follow-up for self-managing landlords and professional managers.',
    '/sectors/residential',
    residentialImage,
    'Australian residential property supported by ProInspect',
  ],
  [
    'Commercial',
    'For commercial owners and asset managers',
    'Condition inspections, make-good observations, handovers and defined property attendance.',
    '/sectors/commercial',
    commercialImage,
    'Modern commercial property exterior',
  ],
  [
    'Strata & buildings',
    'For strata and building teams',
    'Common-property inspections, contractor coordination and documented building attendance.',
    '/sectors/strata-building',
    strataImage,
    'Modern strata apartment building exterior',
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
        </header>
        <div className="pi-sector-grid">
          {sectors.map(([label, title, description, to, image, imageAlt]) => (
            <article className="pi-sector-card" key={to}>
              <img
                src={image}
                alt={imageAlt}
                loading="lazy"
                decoding="async"
                style={{
                  display: 'block',
                  width: '100%',
                  aspectRatio: '16 / 10',
                  objectFit: 'cover',
                  borderRadius: 4,
                }}
              />
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
