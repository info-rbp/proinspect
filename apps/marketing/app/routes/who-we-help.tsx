import { Link, useOutletContext } from 'react-router';
import { AUDIENCES } from '../../../../packages/marketing/audiences';
import { MarketingPageHero, MarketingSectionTitle } from '../components/page-patterns';
import { MarketingCta } from '../components/marketing-ui';
import { seo } from '../lib/seo';

export const meta = () => seo(
  'Who We Help — Property Owners, Agencies, Strata & Buildings',
  'Find property inspection and attendance services for private landlords, residential agencies, commercial owners, asset managers, strata managers and building operators in WA.',
  '/who-we-help',
  {type:'CollectionPage',breadcrumbs:[{name:'Who we help',path:'/who-we-help'}]},
);
export default function WhoWeHelp(){
  const {appOrigin}=useOutletContext<{appOrigin:string}>();
  return <>
    <MarketingPageHero eyebrow="Who we help" title="Property services for the people responsible." intro="The right on-site support depends on your property, responsibilities and the outcome you need. Choose your role to find relevant inspections, attendances and documentation." crumbs={[{label:'Who we help'}]} visual="residential" primary={{label:'Explore services',to:'/services'}}/>
    <section className="section mkt-section"><div className="site-container">
      <MarketingSectionTitle eyebrow="Choose your role" title="Find your starting point." description="Every engagement has a defined scope, authorised instructions and the right people making property decisions."/>
      <div className="mkt-catalogue-grid">
      {Object.entries(AUDIENCES).map(([slug,audience])=><article key={slug} className="mkt-related-card mkt-catalogue-card">
        <p className="mkt-kicker">{audience.visual==='strata'?'Strata & buildings':audience.visual==='commercial'?'Commercial':'Residential'}</p>
        <h3>{audience.name}</h3><p>{audience.description}</p>
        <Link className="mkt-text-link" to={'/who-we-help/'+slug}>Explore services for your role <span aria-hidden="true">→</span></Link>
      </article>)}
      </div>
    </div></section>
    <section className="section mkt-section mkt-stone"><div className="site-container mkt-callout-grid">
      <div><p className="eyebrow">Not sure which fits?</p><h2>Start with the work, not the job title.</h2><p>You can review all 23 services, use the guided finder or send a property enquiry without taking out a subscription.</p></div>
      <div className="mkt-callout-panel"><h3>Three ways to begin</h3>
        <p><Link to="/service-finder">Find a relevant service</Link> for a specific property task.</p>
        <p><Link to="/services">Browse the full catalogue</Link> to compare service scopes.</p>
        <p><Link to="/contact">Describe your requirement</Link> when the work needs a custom instruction.</p></div>
    </div></section>
    <MarketingCta title="Discuss a defined property requirement." description="Tell us the property type, general location and outcome required so we can clarify the right next step." appOrigin={appOrigin}/>
  </>;
}