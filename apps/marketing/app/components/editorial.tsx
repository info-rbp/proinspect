import { Link } from 'react-router';
import { BrandImage, type BrandImageKey } from './brand-image';

export function EditorialHero({
  eyebrow,
  title,
  intro,
  image,
  primary,
  secondary,
  home = false,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  image: BrandImageKey;
  primary?: { label: string; to: string };
  secondary?: { label: string; to: string };
  home?: boolean;
}) {
  return (
    <header className={'pi-editorial-hero' + (home ? ' pi-editorial-hero-home' : '')}>
      <div className="site-container">
        {!home && (
          <nav className="pi-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{eyebrow}</span>
          </nav>
        )}
        <div className="pi-editorial-hero-grid">
          <div className="pi-editorial-copy">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="pi-editorial-intro">{intro}</p>
            {(primary || secondary) && (
              <div className="actions">
                {primary && (
                  <Link className="button" to={primary.to}>
                    {primary.label}
                    <span aria-hidden="true">→</span>
                  </Link>
                )}
                {secondary && (
                  <Link className="pi-inline-link" to={secondary.to}>
                    {secondary.label}
                    <span aria-hidden="true">↗</span>
                  </Link>
                )}
              </div>
            )}
          </div>
          <div className="pi-editorial-hero-image">
            <BrandImage name={image} priority />
          </div>
        </div>
      </div>
    </header>
  );
}

export function EditorialSteps() {
  const steps = [
    [
      'Tell us what you need',
      'Choose a service or share the property type, suburb and outcome you have in mind.',
    ],
    [
      'Agree the details',
      'Confirm suitability, scope, price and access arrangements before the work proceeds.',
    ],
    [
      'Keep a useful record',
      'Review the resulting observations and issued documents through the authorised property account.',
    ],
  ];
  return (
    <section className="mkt-section pi-editorial-section pi-neutral">
      <div className="site-container">
        <div className="pi-section-heading">
          <p className="eyebrow">A straightforward process</p>
          <h2>Clear from the first conversation.</h2>
        </div>
        <ol className="pi-process-list">
          {steps.map(([title, copy], index) => (
            <li key={title}>
              <span className="pi-step-number">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
