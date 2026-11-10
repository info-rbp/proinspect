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
            <div
              style={{
                display: 'grid',
                width: '100%',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
                gap: 'clamp(1.5rem, 4vw, 3rem)',
                alignItems: 'stretch',
              }}
            >
              <div style={{ minHeight: 300, overflow: 'hidden', borderRadius: 4 }}>
                <img
                  src={relationshipImage}
                  alt="Well-maintained residential property supported by ProInspect"
                  loading="lazy"
                  decoding="async"
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  gap: 12,
                }}
              >
                <p className="pi-overline">A relationship that grows with you</p>
                <h3>A consistent partner for your property work</h3>
                <p>
                  You might begin with a single inspection, report or site visit. From there, we
                  build context around your property and the outcomes that matter to you—creating
                  clearer communication, dependable follow-through and support that feels familiar
                  as your needs evolve.
                </p>
                <a href={appOrigin + '/contact'} data-pi-conversion="home-relationship">
                  Start a conversation with ProInspect <span aria-hidden="true">→</span>
                </a>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
