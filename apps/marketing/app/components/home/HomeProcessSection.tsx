import { Link } from 'react-router';

const steps = [
  [
    'Tell us what needs doing',
    'Choose a service or describe the property task. We confirm the scope, safe access and availability.',
  ],
  [
    'We attend the property',
    'A ProInspect representative undertakes the agreed inspection or on-site task at the confirmed appointment.',
  ],
  [
    'Review the outcome',
    'Receive the appropriate report or attendance record and identify matters that may need your next decision.',
  ],
] as const;

export function HomeProcessSection() {
  return (
    <section className="mkt-section pi-section" aria-labelledby="pi-process">
      <div className="site-container">
        <header className="pi-section-head">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 id="pi-process">From a property task to a useful outcome.</h2>
          </div>
          <Link to="/how-it-works">
            See the full process <span aria-hidden="true">→</span>
          </Link>
        </header>
        <ol className="pi-steps">
          {steps.map(([title, description], index) => (
            <li key={title}>
              <span className="pi-number">{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
        <p className="pi-small">
          A one-off service can be requested without an account. Eligible existing clients book
          through their authorised portal. Requests are subject to scope, availability and
          appointment confirmation.
        </p>
      </div>
    </section>
  );
}
