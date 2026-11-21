import { Link } from 'react-router';
import residentialImage from './images/sector-residential.jpg';

const sectors = [
  ['Residential', 'For rental owners and agencies', 'Property condition, tenancy support and maintenance coordination.', '/residential', residentialImage, 'Residential property'],
  ['Co-Living', 'For shared accommodation', 'Site-specific operations, private room records and resident support.', '/co-living', residentialImage, 'Shared residential accommodation'],
  ['Tenants', 'For invited residents', 'Report maintenance, follow requests and access documents shared with your tenancy.', '/tenants', residentialImage, 'Residential tenant support'],
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
