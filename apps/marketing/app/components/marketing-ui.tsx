import { Link } from 'react-router';
import { BrandImage } from './brand-image';
import { approvedPublicMarketingImage, type PublicMarketingMediaSlot } from '../lib/media-approval';

type BuildingKind = 'residential' | 'commercial' | 'strata';

export function PropertyArtwork({
  kind = 'residential', className = '', slot,
}: { kind?: BuildingKind; className?: string; slot?: PublicMarketingMediaSlot }) {
  const approved = approvedPublicMarketingImage(slot);
  return <div className={'mkt-property-art pi-brand-art ' + className}>
    {approved
      ? <img src={approved.src} alt={approved.alt} decoding="async" loading={slot === 'home-hero' ? 'eager' : 'lazy'} />
      : <BrandImage name={kind} priority={slot === 'home-hero'} />}
  </div>;
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
          <a className="button mkt-button-light" href={appOrigin + '/client'}>
            Get Started Today <span aria-hidden="true">→</span>
          </a>
          <Link className="button mkt-button-outline-light" to={serviceId ? '/contact?service=' + serviceId : '/contact'}>
            Contact ProInspect
          </Link>
        </div>
      </div>
    </section>
  );
}
