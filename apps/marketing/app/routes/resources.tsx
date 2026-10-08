import { Link } from 'react-router';
import { GUIDES } from '../../../../packages/marketing/content';
import { seo } from '../lib/seo';
export const meta = () =>
  seo(
    'Property service guides and comparisons',
    'Choose the appropriate inspection, attendance or operational support for your property.',
    '/resources',
  );
export default function Resources() {
  return (
    <>
      <header className="service-hero">
        <div className="site-container">
          <p className="eyebrow">Choose with context</p>
          <h1>Property service guides.</h1>
          <p>Understand service boundaries and how the work fits together before choosing.</p>
        </div>
      </header>
      <section className="section">
        <div className="site-container grid-3">
          {Object.entries(GUIDES).map(([slug, g]) => (
            <article className="service-card" key={slug}>
              <h2>{g.title}</h2>
              <p>{g.intro}</p>
              <Link to={`/resources/${slug}`}>Read guide</Link>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
