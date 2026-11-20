import { Link } from 'react-router';
import attendImage from './images/process-attend.jpg';
import planImage from './images/process-plan.jpg';
import reviewImage from './images/process-review.jpg';

const steps = [
  [
    'Tell us what needs doing',
    'Choose a service or describe the property task. We confirm the scope, safe access and availability.',
    planImage,
    'Clipboard and pencil ready to plan a property service',
  ],
  [
    'We attend the property',
    'A ProInspect representative undertakes the agreed inspection or on-site task at the confirmed appointment.',
    attendImage,
    'Property professional attending an on-site task',
  ],
  [
    'Review the outcome',
    'Receive the appropriate report or attendance record and identify matters that may need your next decision.',
    reviewImage,
    'Property report being reviewed on a laptop',
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
          {steps.map(([title, description, image, imageAlt], index) => (
            <li key={title}>
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
                  marginBottom: 18,
                }}
              />
              <span className="pi-number">{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
