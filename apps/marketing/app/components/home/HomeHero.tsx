import { Link } from 'react-router';
import { PropertyArtwork } from '../marketing-ui';

export function HomeHero({ appOrigin }: { appOrigin: string }) {
  return (
    <section className="mkt-home-hero pi-hero" aria-labelledby="pi-title">
      <div className="site-container pi-hero-grid">
        <div className="pi-hero-copy">
          <p className="eyebrow">On-site property services · Western Australia</p>
          <h1 id="pi-title">
            Property work, taken care of — <span>on site and on record.</span>
          </h1>
          <p className="pi-lead">
            ProInspect handles agreed inspections, condition reports, contractor access and
            practical property attendance. You receive documented outcomes and connected property
            records to help you stay informed and decide what happens next.
          </p>
          <div className="actions pi-actions">
            <a className="button" href={appOrigin + '/book'} data-pi-conversion="home-arrange">
              Arrange a service <span aria-hidden="true">→</span>
            </a>
            <Link className="button secondary" to="/services" data-pi-conversion="home-explore">
              Explore services
            </Link>
          </div>
          <p className="pi-small">
            One-off services are available by request. Existing eligible clients can{' '}
            <a href={appOrigin + '/signin'}>sign in to book</a> through their portal.
          </p>
        </div>
        <div className="pi-hero-picture">
          <PropertyArtwork kind="residential" slot="home-hero" />
          <p>
            On-site work <span>·</span> Documented outcomes <span>·</span> Connected records
          </p>
        </div>
      </div>
    </section>
  );
}
