import { Link } from 'react-router';
import { PLAN_TERM, PUBLIC_PLANS, RESIDENTIAL_BILLING_UNIT, PLAN_SCOPE } from '../../../../packages/marketing/public-facts';
export function PlanComparison({ market = 'all' }: { market?: 'all' | 'residential' | 'commercial' }) {
  if (market === 'commercial') return null;
  const plan = PUBLIC_PLANS[0];
  return <section className="mkt-section pi-editorial-section pi-neutral" aria-labelledby="pi-plan-comparison-heading">
    <div className="site-container">
      <div className="pi-section-heading"><p className="eyebrow">One Residential subscription</p><h2 id="pi-plan-comparison-heading">Support throughout the life of your rental.</h2><p>Keep inspections, tenancy administration and maintenance coordination together under an agreed service schedule.</p></div>
      <article className="pi-plan-card"><h3>{plan.name}</h3><p className="pi-plan-price">${plan.weeklyExGst} <span>+ GST / property / week</span></p><p>${plan.weeklyIncGst} including GST per property per week.</p><ul className="mkt-check-list"><li>Property inspections and tenancy administration support</li><li>Maintenance requests and approved contractor coordination</li><li>Property records, owner communication and vacate support</li></ul></article>
      <p className="pi-plan-disclosure">{PLAN_TERM} {PLAN_SCOPE}</p><p className="pi-plan-disclosure">{RESIDENTIAL_BILLING_UNIT}</p>
      <p>Free registration and individual pay-as-you-go services remain available. Registering or adding a property does not start a paid subscription.</p><Link className="button secondary" to="/contact">Discuss your property <span aria-hidden="true">→</span></Link>
    </div>
  </section>;
}
