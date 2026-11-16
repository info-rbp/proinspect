import { Link } from 'react-router';
import { PLAN_TERM, PUBLIC_PLANS, INSPECTION_ONLY_SERVICES, INSPECTION_ONLY_SCOPE, RESIDENTIAL_BILLING_UNIT, PLAN_SCOPE } from '../../../../packages/marketing/public-facts';

/**
 * Explains the marketing focus of each approved-price plan.
 * Never represents examples as a binding inclusion or visit allowance.
 */
const planFocus: Record<string, { audience: string; focus: string[]; path: string }> = {
  'residential-inspection-only': {
    audience: 'For residential owners and agencies seeking an ongoing inspection arrangement.',
    focus: [...INSPECTION_ONLY_SERVICES],
    path: '/how-we-work/inspection-plans',
  },
  'residential-all-inclusive': {
    audience: 'For residential clients who need broader support across the tenancy lifecycle.',
    focus: ['Inspections and tenancy administration support', 'Maintenance requests, contractor coordination and access', 'Owner communication, property records and vacate support'],
    path: '/residential',
  },
  'commercial-all-inclusive': {
    audience: 'For commercial owners seeking an outsourced operational contact.',
    focus: ['Commercial premises and handover condition records', 'Occupant enquiries, lease-diary administration and maintenance coordination', 'Agreed owner reporting, contractor access and works follow-up'],
    path: '/commercial',
  },
};

export function PlanComparison({ market = 'all' }: { market?: 'all' | 'residential' | 'commercial' }) {
  const plans = PUBLIC_PLANS.filter(p =>
    market === 'all' || (market === 'residential' ? p.id.startsWith('residential') : p.id.startsWith('commercial')));
  return <section className="mkt-section pi-editorial-section pi-neutral" aria-labelledby="pi-plan-comparison-heading">
    <div className="site-container">
      <div className="pi-section-heading">
        <p className="eyebrow">Subscription options</p>
        <h2 id="pi-plan-comparison-heading">Find the right rhythm for your property.</h2>
        <p>Choose focused inspection support or a broader service schedule built around the work you need.</p>
      </div>
      <div className="pi-plan-grid">
        {plans.map(plan => {
          const details = planFocus[plan.id];
          return <article className="pi-plan-card" key={plan.id}>
            <h3>{plan.name}</h3>
            <p className="pi-plan-price">${plan.monthlyExGst} <span>+ GST / {plan.billingUnit} / month</span></p>
            <p>{details.audience}</p>
            <p className="eyebrow">{plan.id === 'residential-inspection-only' ? 'Five included service types' : 'Service focus — final scope by agreement'}</p>
            <ul className="mkt-check-list">{details.focus.map(item => <li key={item}>{item}</li>)}</ul>
            <Link className="pi-inline-link" to={details.path}>Explore this arrangement <span aria-hidden="true">→</span></Link>
          </article>;
        })}
      </div>
      <p className="pi-plan-disclosure">{PLAN_TERM} {PLAN_SCOPE}</p>
      {market !== 'commercial' && <p className="pi-plan-disclosure">{RESIDENTIAL_BILLING_UNIT} {INSPECTION_ONLY_SCOPE}</p>}
      <Link className="button secondary" to="/contact">Discuss your plan <span aria-hidden="true">→</span></Link>
    </div>
  </section>;
}
