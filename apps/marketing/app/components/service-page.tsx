import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { BrandImage, type BrandImageKey } from './brand-image';
import { MarketingFaq } from './page-patterns';
import {
  PLAN_TERM,
  PLAN_SCOPE,
  RESIDENTIAL_BILLING_UNIT,
} from '../../../../packages/marketing/public-facts';

const paths = {
  home: 'M3 11 12 3l9 8M5 10v11h14V10M9 21v-7h6v7',
  report: 'M7 3h10v3h3v16H4V6h3M7 3v5h10V3M8 12h8M8 16h6',
  keys: 'M14 11a5 5 0 1 0-3-3L3 16v5h5v-3h3v-3z',
  tools: 'm14 6 4 4 4-4a7 7 0 0 1-9 9l-7 7-4-4 7-7a7 7 0 0 1 9-9z',
  people:
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8M19 15a6 6 0 0 1 3 6',
  building: 'M4 22V3h12v19M16 10h5v12M8 7h4M8 11h4M8 15h4M8 22v-3h4v3',
  calendar: 'M4 5h16v16H4zM8 2v6M16 2v6M4 10h16M8 14h2M14 14h2M8 18h2',
  message: 'M3 4h18v13H9l-6 5zM7 8h10M7 12h7',
} as const;
export type ServiceIconName = keyof typeof paths;
export function ServiceIcon({ name = 'report' }: { name?: ServiceIconName }) {
  return (
    <svg
      className="pi-service-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function ServiceSection({
  id,
  eyebrow,
  title,
  intro,
  children,
  neutral = false,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
  neutral?: boolean;
}) {
  return (
    <section
      id={id}
      className={'mkt-section pi-editorial-section' + (neutral ? ' pi-neutral' : '')}
    >
      <div className="site-container">
        <div className="pi-section-heading">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          {intro && <p>{intro}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
export type ServiceTile = {
  title: string;
  copy: string;
  href?: string;
  action?: string;
  icon?: ServiceIconName;
};
export function ServiceTiles({ items }: { items: ServiceTile[] }) {
  return (
    <div
      className={'pi-solution-grid' + (items.length % 3 === 0 ? ' pi-solution-grid-thirds' : '')}
    >
      {items.map((item) => (
        <article className="pi-solution-tile" key={item.title}>
          <ServiceIcon name={item.icon} />
          <h3>{item.title}</h3>
          <p>{item.copy}</p>
          {item.href && (
            <Link className="pi-inline-link" to={item.href}>
              {item.action || item.title}
              <span aria-hidden="true">↗</span>
            </Link>
          )}
        </article>
      ))}
    </div>
  );
}
export function ServiceFeature({
  id,
  image,
  eyebrow,
  title,
  children,
  reverse = false,
}: {
  id?: string;
  image: BrandImageKey;
  eyebrow: string;
  title: string;
  children: ReactNode;
  reverse?: boolean;
}) {
  return (
    <section id={id} className="mkt-section pi-editorial-section pi-neutral">
      <div
        className={
          'site-container pi-residential-feature' +
          (reverse ? ' pi-residential-feature-reverse' : '')
        }
      >
        <div className="pi-residential-feature-image">
          <BrandImage name={image} />
        </div>
        <div className="pi-residential-feature-content">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          {children}
        </div>
      </div>
    </section>
  );
}
export function SubscriptionFeature({
  kind = 'residential',
}: {
  kind?: 'residential' | 'commercial' | 'co-spaces' | 'maintenance';
}) {
  return (
    <ServiceFeature
      id="subscription-support"
      image="subscription-care"
      eyebrow="Subscription support"
      title={
        kind === 'co-spaces'
          ? 'Ongoing support for shared spaces.'
          : 'Support that fits the way you manage property.'
      }
    >
      <p>
        {kind === 'commercial'
          ? 'The Commercial Property Support Subscription is a concept under development. Pricing, inclusions and availability are not finalised; contact us to discuss your requirements.'
          : kind === 'co-spaces'
            ? 'Future Co-Living and Co-Working subscriptions are being developed. They do not replace an existing Co-Living management arrangement or establish new pricing or inclusions.'
            : 'Explore the Inspections and Outsourced subscription concepts alongside the existing Residential subscription information. New offerings remain subject to finalised details and approved terms.'}
      </p>
      {(kind === 'residential' || kind === 'maintenance') && (
        <div className="pi-subscription-terms">
          <h3>Existing Residential All Inclusive Subscription</h3>
          <p>{RESIDENTIAL_BILLING_UNIT}</p>
          <p>
            {PLAN_TERM} {PLAN_SCOPE}
          </p>
        </div>
      )}
      <p>
        Creating an account does not activate a paid subscription. Scope, availability and terms
        must be agreed before any paid arrangement begins.
      </p>
      <Link className="button secondary" to="/subscriptions">
        Explore subscriptions <span aria-hidden="true">→</span>
      </Link>
      {(kind === 'residential' || kind === 'maintenance') && (
        <p>
          <Link className="pi-inline-link" to="/residential/subscriptions">
            Existing Residential pricing and terms <span aria-hidden="true">↗</span>
          </Link>
        </p>
      )}
    </ServiceFeature>
  );
}
export function ServiceFaq({ questions }: { questions: [string, string][] }) {
  return (
    <section className="mkt-section pi-editorial-section" id="questions">
      <div className="site-container pi-faq-layout">
        <div>
          <p className="eyebrow">Good to know</p>
          <h2>Your questions, answered.</h2>
          <p>
            Find more guidance in our <Link to="/help-centre">Help Centre</Link>.
          </p>
        </div>
        <MarketingFaq questions={questions} />
      </div>
    </section>
  );
}
export function ServiceCta({
  title,
  copy,
  label = 'Discuss your requirements',
  href = '/contact',
}: {
  title: string;
  copy: string;
  label?: string;
  href?: string;
}) {
  return (
    <section className="mkt-final-cta">
      <div className="site-container mkt-cta-inner">
        <div>
          <p className="eyebrow">Your next step</p>
          <h2>{title}</h2>
          <p>{copy}</p>
        </div>
        <Link className="button mkt-button-light" to={href}>
          {label}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
