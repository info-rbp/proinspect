import relationshipImage from './images/relationship.jpg';

export function HomeArrangementsSection({ appOrigin }: { appOrigin: string }) {
  return (
    <section className="mkt-section pi-section" aria-labelledby="pi-ways">
      <div className="site-container">
        <header className="pi-section-head">
          <div>
            <p className="eyebrow">Working with us</p>
            <h2 id="pi-ways">Property support built on trust and continuity.</h2>
          </div>
        </header>
        <div className="pi-arrangements" style={{ gridTemplateColumns: '1fr' }}>
          <article>
            <img
              src={relationshipImage}
              alt="Property professionals building a partnership over a home and keys"
              loading="lazy"
              decoding="async"
              style={{
                display: 'block',
                width: '100%',
                aspectRatio: '16 / 7',
                objectFit: 'cover',
                borderRadius: 4,
                marginBottom: 8,
              }}
            />
            <p className="pi-overline">A relationship that grows with you</p>
            <h3>A consistent partner for your property work</h3>
            <p>
              You might begin with a single inspection, report or site visit. From there, we build
              context around your property and the outcomes that matter to you—creating clearer
              communication, dependable follow-through and support that feels familiar as your needs
              evolve.
            </p>
            <a href={appOrigin + '/contact'} data-pi-conversion="home-relationship">
              Start a conversation with ProInspect <span aria-hidden="true">→</span>
            </a>
          </article>
        </div>
      </div>
    </section>
  );
}
