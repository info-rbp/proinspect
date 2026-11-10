import { Link } from 'react-router';
import { PropertyArtwork } from '../marketing-ui';

export function HomeHero({ appOrigin }: { appOrigin: string }) {
  return (
    <section className="mkt-home-hero pi-hero" aria-labelledby="pi-title">
      <div className="site-container pi-hero-grid">
        <div className="pi-hero-copy">
          <p className="eyebrow">Property support that isn&apos;t complicated</p>
          <h1 id="pi-title">
            From Inspections to Reporting, <span>we have you covered</span>
          </h1>
          <p className="pi-lead">
            ProInspect Property Services can be there when you need the support. From Property
            Condition Reports to organising routine maintenance, we aim to provide you with the
            property support for your residential property, commercial property or building
            operations.
          </p>
          <div className="actions pi-actions">
            <a className="button" href={appOrigin + '/book'} data-pi-conversion="home-arrange">
              Book Online <span aria-hidden="true">→</span>
            </a>
            <Link className="button secondary" to="/how-it-works" data-pi-conversion="home-explore">
              How It Works
            </Link>
          </div>
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
