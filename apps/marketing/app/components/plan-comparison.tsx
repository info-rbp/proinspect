import { Link } from 'react-router';
import { PLAN_TERM, PUBLIC_PLANS } from '../../../../packages/marketing/public-facts';

/**
 * Explains the marketing focus of each approved-price plan.
 * Never represents examples as a binding inclusion or visit allowance.
 */
const planFocus: Record<string, { audience: string; focus: string[]; path: string }> = {
  'residential-inspection-only': {
    audience: 'For residential owners and agencies seeking an ongoing inspection arrangement.',
    focus: ['Routine property condition observations and required reports', 'An organised inspection and follow-up schedule', 'Property-linked findings for authorised review'],
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
        <h2 id="pi-plan-comparison-heading">Choose a defined service arrangement.</h2>
        <p>These are the three advertised plans. The service areas below illustrate each plan’s purpose; they are not confirmed included entitlements or unlimited attendance allowances.</p>
      </div>
      <div className="pi-plan-grid">
        {plans.map(plan => {
          const details = planFocus[plan.id];
          return <article className="pi-plan-card" key={plan.id}>
            <h3>{plan.name}</h3>
            <p className="pi-plan-price">${plan.monthlyExGst} <span>+ GST / property / month</span></p>
            <p>{details.audience}</p>
            <p className="eyebrow">Typical service focus</p>
            <ul className="mkt-check-list">{details.focus.map(item => <li key={item}>{item}</li>)}</ul>
            <Link className="pi-inline-link" to={details.path}>Explore this arrangement <span aria-hidden="true">→</span></Link>
          </article>;
        })}
      </div>
      <p className="pi-plan-disclosure">{PLAN_TERM} Specific included services, frequencies, visit allowances, exclusions, additional charges and early-exit obligations must be provided and agreed in the property-specific subscription schedule before a paid commitment. Individual PAYG prices are shown to authorised signed-in clients.</p>
      <Link className="button secondary" to="/contact">Discuss a subscription <span aria-hidden="true">→</span></Link>
    </div>
  </section>;
}
