import { Link } from 'react-router';

export function HomeArrangementsSection({ appOrigin }: { appOrigin: string }) {
  return (
    <section className="mkt-section pi-section" aria-labelledby="pi-ways">
      <div className="site-container">
        <header className="pi-section-head">
          <div>
            <p className="eyebrow">Ways to work with us</p>
            <h2 id="pi-ways">One visit, or ongoing property support.</h2>
          </div>
          <p>
            Choose the arrangement that suits the work. A one-off enquiry does not require a
            subscription.
          </p>
        </header>
        <div className="pi-arrangements">
          <article>
            <p className="pi-overline">For a specific task</p>
            <h3>One-off inspections &amp; attendance</h3>
            <p>
              Request a defined inspection, condition report or authorised visit. We confirm the
              scope, any applicable price and the appointment.
            </p>
            <a href={appOrigin + '/book'} data-pi-conversion="home-one-off">
              Arrange a one-off service <span aria-hidden="true">→</span>
            </a>
          </article>
          <article>
            <p className="pi-overline">For a broader workload</p>
            <h3>Planned &amp; outsourced support</h3>
            <p>
              Discuss recurring inspections, several properties or an ongoing operational need.
              Agree the workload and commercial terms separately.
            </p>
            <Link to="/contact" data-pi-conversion="home-ongoing">
              Discuss ongoing support <span aria-hidden="true">→</span>
            </Link>
          </article>
        </div>
        <p className="pi-small">
          Want a property workspace?{' '}
          <a href={appOrigin + '/signin'}>Create a free account or sign in</a>. Registration does
          not activate paid subscription billing.
        </p>
      </div>
    </section>
  );
}
