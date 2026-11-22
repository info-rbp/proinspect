import {Link} from 'react-router';
import {EditorialHero} from '../components/editorial';
import {PlanComparison} from '../components/plan-comparison';
import {seo} from '../lib/seo';
export const meta=()=>seo('Residential Subscriptions — ProInspect','Review the proposed Residential All Inclusive Subscription, weekly pricing, contract term and defined service schedule.','/residential/subscriptions',{noindex:true});
export default function ResidentialSubscriptions(){return <>
 <EditorialHero eyebrow="Residential Subscriptions" title="One subscription. Ongoing property support."
   intro="An optional Residential All Inclusive Subscription for your property, alongside individual pay-as-you-go services. Confirm the schedule and terms before deciding."
   image="residential" primary={{label:'See Subscription Options',to:'#pi-plan-comparison-heading'}}
   secondary={{label:'See Our Services',to:'/residential/services'}}/>
 <PlanComparison market="residential"/>
 <section className="mkt-section pi-editorial-section"><div className="site-container pi-introduction">
  <div><p className="eyebrow">Before joining</p><h2>Clear inclusions. Clear responsibilities.</h2></div>
  <div><p>The published Residential price is AUD $50 plus GST per property per week (AUD $55 including GST). The proposed initial agreement is 24 months with 60 days’ written cancellation notice, subject to approved contract terms.</p>
  <p>The agreed service schedule identifies visit allowances, scope, extras, property access, approvals and any early-exit conditions. Creating a free account does not itself begin a paid subscription.</p>
  <p>Live subscription payment and contractual acceptance remain subject to the necessary approvals and activation.</p>
  <Link to="/subscription-terms" className="pi-inline-link">Read proposed subscription terms <span aria-hidden="true">↗</span></Link></div>
 </div></section></>}