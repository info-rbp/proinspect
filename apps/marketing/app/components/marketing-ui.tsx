import { Link } from 'react-router';

type BuildingKind = 'residential' | 'commercial' | 'strata';

export function PropertyArtwork({
  kind = 'residential',
  className = '',
}: {
  kind?: BuildingKind;
  className?: string;
}) {
  const tall = kind !== 'residential';
  return (
    <div
      className={'mkt-property-art mkt-art-' + kind + ' ' + className}
      role="img"
      aria-label={
        kind === 'commercial'
          ? 'Illustration of a contemporary commercial property'
          : kind === 'strata'
            ? 'Illustration of a multi-storey residential building'
            : 'Illustration of a residential property'
      }
    >
      <svg viewBox="0 0 680 450" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={'mkt-sky-' + kind} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#dae9e5" />
            <stop offset="1" stopColor="#f7f3e8" />
          </linearGradient>
          <linearGradient id={'mkt-wall-' + kind} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#cfdedb" />
          </linearGradient>
        </defs>
        <rect width="680" height="450" fill={'url(#mkt-sky-' + kind + ')'} />
        <circle cx="535" cy="90" r="59" fill="#fff7e0" opacity=".72" />
        <path d="M0 372 C120 351 166 391 281 371 S499 353 680 376 V450 H0Z" fill="#8fb8a6" opacity=".56" />
        {tall ? (
          <>
            <path d="M110 110 L441 90 L467 388 L110 388 Z" fill={'url(#mkt-wall-' + kind + ')'} />
            <path d="M441 90 L533 142 L542 388 L467 388 Z" fill="#7d9c9a" />
            <path d="M110 110 L441 90 L533 142 L206 167 Z" fill="#294e54" />
            {[0, 1, 2, 3].map((floor) =>
              [0, 1, 2].map((col) => (
                <g key={floor + '-' + col}>
                  <rect x={140 + col * 101} y={157 + floor * 55} width="70" height="35" rx="3" fill="#35666d" />
                  <path d={'M' + (175 + col * 101) + ' ' + (157 + floor * 55) + ' v35'} stroke="#afcac2" strokeWidth="3" />
                  <rect x={140 + col * 101} y={187 + floor * 55} width="70" height="5" fill="#a4bab5" />
                </g>
              )),
            )}
            <rect x="256" y="334" width="85" height="54" fill="#214b51" />
            <rect x="490" y="191" width="32" height="43" fill="#c5dbd4" />
            <rect x="493" y="268" width="32" height="43" fill="#c5dbd4" />
          </>
        ) : (
          <>
            <path d="M100 211 L375 135 L564 210 V385 H100Z" fill={'url(#mkt-wall-' + kind + ')'} />
            <path d="M69 217 L375 113 L594 207 L562 225 L376 151 L100 240Z" fill="#294e54" />
            <path d="M100 240 L375 157 V385 H100Z" fill="#e7ece6" />
            <path d="M376 158 L564 229 V385 H376Z" fill="#a9c4ba" />
            <rect x="150" y="257" width="142" height="94" rx="2" fill="#436e73" />
            <path d="M221 257 V351 M150 306 H292" stroke="#c6ddd5" strokeWidth="5" />
            <rect x="405" y="257" width="98" height="128" fill="#294d53" />
            <rect x="421" y="274" width="65" height="93" fill="#416b6f" />
            <rect x="302" y="222" width="46" height="163" fill="#baccc2" />
            <path d="M405 378 L503 378" stroke="#f4f3ea" strokeWidth="8" />
          </>
        )}
        <path d="M0 386 H680" stroke="#6d9e8b" strokeWidth="8" />
        <path d="M75 397 L640 397" stroke="#dae3d9" strokeWidth="2" />
        <path d="M60 391 C50 338 62 310 81 300 C98 314 102 353 101 391" fill="#407764" />
        <path d="M57 372 C32 336 29 293 57 279 C79 295 77 339 74 372" fill="#639c7b" />
        <path d="M584 387 C591 338 607 314 635 320 C643 347 633 370 621 389" fill="#3d7765" />
        <path d="M618 390 C636 358 665 345 677 356 V394" fill="#84ae8c" />
        <path d="M0 404 H680" stroke="#b1c9b9" strokeWidth="5" />
      </svg>
    </div>
  );
}

/** An intentionally synthetic preview: never presented as a real customer report. */
export function IllustrativeReport({ compact = false }: { compact?: boolean }) {
  return (
    <div className={'mkt-report-preview' + (compact ? ' compact' : '')}>
      <div className="mkt-report-top">
        <span className="mkt-report-brand">ProInspect</span>
        <span>ILLUSTRATIVE EXAMPLE</span>
      </div>
      <div className="mkt-report-title">Routine inspection record</div>
      <p className="mkt-report-subtitle">Example layout only — not an issued inspection report</p>
      <div className="mkt-report-rule" />
      <div className="mkt-report-row"><span>Inspection scope</span><strong>Visible condition</strong></div>
      <div className="mkt-report-row"><span>Documentation</span><strong>Observations &amp; images</strong></div>
      <div className="mkt-report-row"><span>Follow-up</span><strong>Items for review</strong></div>
      <div className="mkt-report-photo" aria-hidden="true">
        <span className="mkt-photo-window" />
        <span className="mkt-photo-floor" />
      </div>
      <div className="mkt-report-note">
        <span className="mkt-report-dot" />
        Example observation — location, description and supporting image.
      </div>
    </div>
  );
}

export function MarketingCta({
  title,
  description,
  appOrigin = '',
  serviceId,
}: {
  title: string;
  description: string;
  appOrigin?: string;
  serviceId?: string;
}) {
  return (
    <section className="mkt-final-cta">
      <div className="site-container mkt-cta-inner">
        <div>
          <p className="eyebrow">Ready for the next step?</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="actions">
          <a className="button mkt-button-light" href={appOrigin + '/book' + (serviceId ? '/' + serviceId : '')}>
            {serviceId ? 'Arrange this service' : 'Book a service'} <span aria-hidden="true">→</span>
          </a>
          <Link className="button mkt-button-outline-light" to={serviceId ? '/contact?service=' + serviceId : '/contact'}>
            Discuss your needs
          </Link>
        </div>
      </div>
    </section>
  );
}
